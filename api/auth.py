import os
from typing import Any, Optional

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from open_notebook.org_context import reset_current_org_id, set_current_org_id
from open_notebook.utils.encryption import get_secret_from_env


def get_clerk_jwks_url() -> Optional[str]:
    """
    Resolve the Clerk JWKS URL from CLERK_JWKS_URL or CLERK_ISSUER.
    When either is set, the API runs in Clerk mode: requests must carry a
    Clerk-signed session JWT instead of the shared password.
    """
    jwks_url = os.environ.get("CLERK_JWKS_URL")
    if jwks_url:
        return jwks_url
    issuer = os.environ.get("CLERK_ISSUER")
    if issuer:
        return f"{issuer.rstrip('/')}/.well-known/jwks.json"
    return None


def get_auth_mode() -> str:
    """Return the active auth mode: "clerk", "password", or "none"."""
    if get_clerk_jwks_url():
        return "clerk"
    if get_secret_from_env("OPEN_NOTEBOOK_PASSWORD"):
        return "password"
    return "none"


# PyJWKClient caches fetched signing keys; module-level so all requests share it.
_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client(jwks_url: str) -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None or _jwks_client.uri != jwks_url:
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)
    return _jwks_client


def verify_clerk_token(token: str) -> dict[str, Any]:
    """
    Verify a Clerk session JWT and return its claims.
    Raises jwt exceptions on invalid/expired tokens.
    """
    jwks_url = get_clerk_jwks_url()
    if not jwks_url:
        raise RuntimeError("Clerk auth is not configured")

    signing_key = _get_jwks_client(jwks_url).get_signing_key_from_jwt(token)

    issuer = os.environ.get("CLERK_ISSUER")
    claims: dict[str, Any] = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=issuer if issuer else None,
        options={"verify_aud": False, "verify_iss": bool(issuer)},
        leeway=10,
    )

    # Optional azp check: reject tokens minted for other origins.
    authorized_parties = os.environ.get("CLERK_AUTHORIZED_PARTIES")
    if authorized_parties:
        allowed = {p.strip() for p in authorized_parties.split(",") if p.strip()}
        azp = claims.get("azp")
        if azp and azp not in allowed:
            raise jwt.InvalidTokenError(f"azp '{azp}' is not an authorized party")

    return claims


class PasswordAuthMiddleware(BaseHTTPMiddleware):
    """
    Authentication middleware for all API requests.

    Two modes, selected by environment:
    - Clerk mode (CLERK_JWKS_URL or CLERK_ISSUER set): requests must carry a
      Clerk-signed session JWT; verified claims are stored on request.state.user.
    - Password mode (OPEN_NOTEBOOK_PASSWORD set): legacy shared-password check.
      Supports Docker secrets via OPEN_NOTEBOOK_PASSWORD_FILE.
    If neither is configured, authentication is skipped entirely.
    """

    def __init__(
        self, app: ASGIApp, excluded_paths: Optional[list[str]] = None
    ) -> None:
        super().__init__(app)
        self.password = get_secret_from_env("OPEN_NOTEBOOK_PASSWORD")
        self.clerk_enabled = bool(get_clerk_jwks_url())
        if self.clerk_enabled:
            logger.info("Authentication mode: Clerk (JWT verification)")
        elif self.password:
            logger.info("Authentication mode: shared password")
        else:
            logger.warning("Authentication disabled (no Clerk or password config)")
        self.excluded_paths: list[str] = excluded_paths or [
            "/",
            "/health",
            "/docs",
            "/openapi.json",
            "/redoc",
        ]

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Skip authentication if neither Clerk nor a password is configured
        if not self.clerk_enabled and not self.password:
            return await call_next(request)

        # Skip authentication for excluded paths
        if request.url.path in self.excluded_paths:
            return await call_next(request)

        # Skip authentication for CORS preflight requests (OPTIONS)
        if request.method == "OPTIONS":
            return await call_next(request)

        # Check authorization header
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing authorization header"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Expected format: "Bearer {token-or-password}"
        try:
            scheme, credentials = auth_header.split(" ", 1)
            if scheme.lower() != "bearer":
                raise ValueError("Invalid authentication scheme")
        except ValueError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid authorization header format"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        if self.clerk_enabled:
            try:
                claims = verify_clerk_token(credentials)
            except jwt.PyJWTError as e:
                logger.debug(f"Clerk token rejected: {e}")
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid or expired session token"},
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Extract the active-organization claims. Clerk's default v2 session
            # token nests them under "o" ({id, rol, ...}); custom session-template
            # claims may surface them as top-level org_id/org_role. Read both.
            org_claim = claims.get("o")
            if not isinstance(org_claim, dict):
                org_claim = {}
            org_id = claims.get("org_id") or org_claim.get("id")
            org_role = claims.get("org_role") or org_claim.get("rol")

            # Fail closed: a Clerk session without an active organization cannot
            # be scoped to any tenant, so we must not fall through to the shared
            # workspace. Reject with an actionable message.
            if not org_id:
                return JSONResponse(
                    status_code=401,
                    content={
                        "detail": (
                            "No active organization on your session — sign out and "
                            "back in, or ask your admin for an organization invite"
                        )
                    },
                    headers={"WWW-Authenticate": "Bearer"},
                )

            request.state.user = {
                "id": claims.get("sub"),
                "email": claims.get("email"),
                "role": claims.get("role"),
                "org_id": org_id,
                "org_role": org_role,
            }
            token = set_current_org_id(org_id)
            try:
                return await call_next(request)
            finally:
                reset_current_org_id(token)

        # Check password
        if credentials != self.password:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid password"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Password is correct, proceed with the request
        response = await call_next(request)
        return response


def require_admin(request: Request) -> bool:
    """
    FastAPI dependency restricting an endpoint to admin users.

    In Clerk mode, the session token must carry role == "admin"
    (set via the user's publicMetadata in the Clerk dashboard).
    In password/none mode there is a single operator, so everything is allowed
    and existing single-user behavior is preserved.
    """
    if get_auth_mode() != "clerk":
        return True

    user = getattr(request.state, "user", None)
    if not user or user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrator access required",
        )
    return True


# Optional: HTTPBearer security scheme for OpenAPI documentation
security = HTTPBearer(auto_error=False)


def check_api_password(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> bool:
    """
    Utility function to check API password.
    Can be used as a dependency in individual routes if needed.
    Supports Docker secrets via OPEN_NOTEBOOK_PASSWORD_FILE.
    Returns True without checking credentials if OPEN_NOTEBOOK_PASSWORD is not configured.
    Raises 401 if credentials are missing or don't match the configured password.
    """
    password = get_secret_from_env("OPEN_NOTEBOOK_PASSWORD")

    # No password configured - skip authentication
    if not password:
        return True

    # No credentials provided
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing authorization",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check password
    if credentials.credentials != password:
        raise HTTPException(
            status_code=401,
            detail="Invalid password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return True

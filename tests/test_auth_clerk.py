"""
Offline tests for Clerk JWT authentication and admin role enforcement.

No live Clerk instance is contacted: tokens are signed with a throwaway RSA
key and the JWKS client is stubbed, exercising the exact verification path
(PasswordAuthMiddleware in clerk mode + require_admin dependency).
"""

import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth_module
from api.auth import PasswordAuthMiddleware, require_admin

ISSUER = "https://test-instance.clerk.accounts.dev"

_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_public_key = _private_key.public_key()


def make_token(
    role=None,
    expired=False,
    issuer=ISSUER,
    org_id="org_test123",
    org_role="org:admin",
    nested_org=False,
):
    now = int(time.time())
    claims = {
        "sub": "user_123",
        "iss": issuer,
        "iat": now - 120 if expired else now,
        "exp": now - 60 if expired else now + 60,
    }
    if role is not None:
        claims["role"] = role
    if org_id is not None:
        if nested_org:
            # Clerk default v2 session token shape: org info nested under "o".
            claims["o"] = {"id": org_id, "rol": org_role}
        else:
            # Custom session-template claims: top-level org_id/org_role.
            claims["org_id"] = org_id
            if org_role is not None:
                claims["org_role"] = org_role
    return jwt.encode(claims, _private_key, algorithm="RS256")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CLERK_ISSUER", ISSUER)
    monkeypatch.setenv("CLERK_JWKS_URL", f"{ISSUER}/.well-known/jwks.json")
    monkeypatch.delenv("CLERK_AUTHORIZED_PARTIES", raising=False)
    # Stub the JWKS fetch: return our test public key for any token
    monkeypatch.setattr(
        auth_module,
        "_get_jwks_client",
        lambda url: SimpleNamespace(
            get_signing_key_from_jwt=lambda token: SimpleNamespace(key=_public_key)
        ),
    )

    app = FastAPI()
    app.add_middleware(PasswordAuthMiddleware, excluded_paths=["/health"])

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.get("/normal")
    async def normal():
        return {"ok": True}

    @app.get("/whoami")
    async def whoami(request: Request):
        return getattr(request.state, "user", None) or {}

    @app.get("/admin-only", dependencies=[Depends(require_admin)])
    async def admin_only():
        return {"ok": True}

    return TestClient(app)


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


class TestClerkAuthentication:
    def test_excluded_path_needs_no_token(self, client):
        assert client.get("/health").status_code == 200

    def test_missing_token_rejected(self, client):
        assert client.get("/normal").status_code == 401

    def test_garbage_token_rejected(self, client):
        assert client.get("/normal", headers=auth_header("garbage")).status_code == 401

    def test_expired_token_rejected(self, client):
        token = make_token(role="admin", expired=True)
        assert client.get("/normal", headers=auth_header(token)).status_code == 401

    def test_wrong_issuer_rejected(self, client):
        token = make_token(issuer="https://evil.example.com")
        assert client.get("/normal", headers=auth_header(token)).status_code == 401

    def test_valid_token_accepted(self, client):
        token = make_token()
        assert client.get("/normal", headers=auth_header(token)).status_code == 200


class TestAdminEnforcement:
    def test_admin_token_allowed_on_admin_route(self, client):
        token = make_token(role="admin")
        assert client.get("/admin-only", headers=auth_header(token)).status_code == 200

    def test_regular_user_forbidden_on_admin_route(self, client):
        token = make_token()  # no role claim
        assert client.get("/admin-only", headers=auth_header(token)).status_code == 403

    def test_non_admin_role_forbidden_on_admin_route(self, client):
        token = make_token(role="member")
        assert client.get("/admin-only", headers=auth_header(token)).status_code == 403

    def test_regular_user_allowed_on_normal_route(self, client):
        token = make_token()
        assert client.get("/normal", headers=auth_header(token)).status_code == 200


class TestOrganizationClaims:
    """Per-org isolation relies on the active-organization claim being present."""

    def test_org_claim_lands_in_request_state(self, client):
        token = make_token(org_id="org_abc", org_role="org:admin")
        r = client.get("/whoami", headers=auth_header(token))
        assert r.status_code == 200
        body = r.json()
        assert body["org_id"] == "org_abc"
        assert body["org_role"] == "org:admin"

    def test_nested_org_claim_supported(self, client):
        # Clerk default v2 token nests org info under "o".
        token = make_token(org_id="org_nested", org_role="org:member", nested_org=True)
        r = client.get("/whoami", headers=auth_header(token))
        assert r.status_code == 200
        body = r.json()
        assert body["org_id"] == "org_nested"
        assert body["org_role"] == "org:member"

    def test_token_without_org_rejected(self, client):
        # Fail closed: a Clerk session with no active org cannot be tenant-scoped.
        token = make_token(org_id=None)
        r = client.get("/normal", headers=auth_header(token))
        assert r.status_code == 401
        assert "organization" in r.json()["detail"].lower()

    def test_token_without_org_rejected_on_admin_route(self, client):
        token = make_token(role="admin", org_id=None)
        assert client.get("/admin-only", headers=auth_header(token)).status_code == 401


class TestPasswordModeCompatibility:
    """Without Clerk env vars the legacy behavior is fully preserved."""

    @pytest.fixture
    def password_client(self, monkeypatch):
        monkeypatch.setenv("CLERK_ISSUER", "")
        monkeypatch.setenv("CLERK_JWKS_URL", "")
        monkeypatch.setenv("OPEN_NOTEBOOK_PASSWORD", "s3cret")

        app = FastAPI()
        app.add_middleware(PasswordAuthMiddleware)

        @app.get("/normal")
        async def normal():
            return {"ok": True}

        @app.get("/admin-only", dependencies=[Depends(require_admin)])
        async def admin_only():
            return {"ok": True}

        return TestClient(app)

    def test_correct_password_accepted(self, password_client):
        r = password_client.get("/normal", headers=auth_header("s3cret"))
        assert r.status_code == 200

    def test_wrong_password_rejected(self, password_client):
        r = password_client.get("/normal", headers=auth_header("wrong"))
        assert r.status_code == 401

    def test_admin_routes_open_in_password_mode(self, password_client):
        r = password_client.get("/admin-only", headers=auth_header("s3cret"))
        assert r.status_code == 200

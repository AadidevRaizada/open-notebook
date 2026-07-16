"""
Gmail connected-service endpoints.

Gmail is a Connected Service (account menu), never a source type. All
endpoints act on the signed-in user's own connection; the OAuth callback is
the one unauthenticated route (top-level browser redirect from Google) and is
protected by the Fernet-signed `state` parameter instead.
"""

import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from loguru import logger

from api import gmail_service
from api.auth import require_admin
from open_notebook.domain.gmail import GmailConnection, GmailMessageMeta
from open_notebook.exceptions import ConfigurationError, InvalidInputError

router = APIRouter()


def _current_user(request: Request) -> tuple[str, str | None]:
    """(user_id, org_id) — Clerk mode uses the verified JWT claims; the legacy
    password/none modes are single-operator, so a fixed id keeps them working."""
    user = getattr(request.state, "user", None)
    if user and user.get("id"):
        return user["id"], user.get("org_id")
    return "default", None


def _frontend_base() -> str:
    return (os.environ.get("PUBLIC_APP_URL") or "http://localhost:3000").rstrip("/")


@router.get("/gmail/status")
async def gmail_status(request: Request):
    """Connection state for the Connected Services UI."""
    user_id, _ = _current_user(request)
    if not gmail_service.is_configured():
        return {"configured": False, "connected": False, "email": None, "last_sync_at": None}
    connection = await GmailConnection.get_for_user(user_id)
    return {
        "configured": True,
        "connected": connection is not None,
        "email": connection.email if connection else None,
        "last_sync_at": connection.last_sync_at.isoformat()
        if connection and connection.last_sync_at
        else None,
    }


@router.post("/gmail/connect")
async def gmail_connect(request: Request):
    """Authorization URL for the browser to navigate to."""
    user_id, org_id = _current_user(request)
    try:
        return {"authorize_url": gmail_service.build_authorize_url(user_id, org_id)}
    except ConfigurationError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/gmail/oauth/callback")
async def gmail_oauth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    """
    Google redirects here after consent. Unauthenticated by design (excluded
    in PasswordAuthMiddleware); the encrypted `state` binds the request to the
    user who started the flow.
    """
    base = _frontend_base()
    if error or not code or not state:
        logger.warning(f"Gmail OAuth callback error: {error or 'missing code/state'}")
        return RedirectResponse(url=f"{base}/search?gmail=error", status_code=302)
    try:
        await gmail_service.handle_callback(code, state)
        return RedirectResponse(url=f"{base}/search?gmail=connected", status_code=302)
    except (InvalidInputError, ConfigurationError) as e:
        logger.warning(f"Gmail OAuth callback rejected: {e}")
        return RedirectResponse(url=f"{base}/search?gmail=error", status_code=302)
    except Exception as e:
        logger.error(f"Gmail OAuth callback failed: {e}")
        return RedirectResponse(url=f"{base}/search?gmail=error", status_code=302)


@router.get("/gmail/recent")
async def gmail_recent(request: Request, limit: int = 25, refresh: bool = False):
    """Recent email metadata from the cache (instant; no bodies stored)."""
    user_id, org_id = _current_user(request)
    limit = max(1, min(limit, 50))
    if refresh:
        try:
            await gmail_service.sync_recent_meta(user_id, limit=limit, org_id=org_id)
        except Exception as e:
            logger.warning(f"Gmail recent refresh failed (serving cache): {e}")
    items = await GmailMessageMeta.recent_for_user(user_id, limit=limit)
    for item in items:
        ts = item.get("timestamp")
        if hasattr(ts, "isoformat"):
            item["timestamp"] = ts.isoformat()
    return {"items": items}


@router.delete("/gmail/connection")
async def gmail_disconnect(request: Request):
    """Revoke at Google and delete the connection + cached metadata."""
    user_id, _ = _current_user(request)
    await gmail_service.disconnect(user_id)
    return {"disconnected": True}


@router.get("/gmail/admin/connections", dependencies=[Depends(require_admin)])
async def gmail_admin_connections():
    """
    Admin overview of every connected Gmail account across all users.

    Metadata only (address, owning user/org, last-checked time) — never tokens
    or message content. Restricted to admins via require_admin.
    """
    connections = await GmailConnection.list_all()
    return {"connections": connections, "total": len(connections)}

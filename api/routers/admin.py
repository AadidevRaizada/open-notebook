"""
Admin panel endpoints: Clerk user management + per-user usage aggregation.

Every route requires the admin role (require_admin). User-management routes
additionally need CLERK_SECRET_KEY configured on the API server; in
password/none auth mode they return 400 while the usage endpoints still work
(events are attributed to "local").
"""

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger
from pydantic import BaseModel, EmailStr

from api import clerk_client
from api.auth import get_auth_mode, require_admin
from open_notebook.database.repository import repo_query

router = APIRouter(dependencies=[Depends(require_admin)])


class InviteRequest(BaseModel):
    email: EmailStr
    # Where the invite link lands (the app's /sign-up page); sent by the
    # frontend from window.location.origin so it works locally and deployed.
    redirect_url: Optional[str] = None


class RoleRequest(BaseModel):
    # "admin" promotes; null demotes back to a regular member.
    role: Optional[Literal["admin"]] = None


def _ensure_not_self(request: Request, user_id: str) -> None:
    current = getattr(request.state, "user", None) or {}
    if current.get("id") == user_id:
        raise HTTPException(
            status_code=400, detail="You cannot modify your own account from the admin panel"
        )


@router.get("/admin/status")
async def admin_status() -> Dict[str, Any]:
    """Lets the admin UI know which capabilities are available."""
    return {
        "auth_mode": get_auth_mode(),
        "user_management": clerk_client.is_clerk_admin_configured(),
    }


@router.get("/admin/users")
async def list_users() -> List[Dict[str, Any]]:
    return await clerk_client.list_users()


@router.get("/admin/invitations")
async def list_invitations() -> List[Dict[str, Any]]:
    return await clerk_client.list_invitations(status="pending")


@router.post("/admin/invitations")
async def invite_user(payload: InviteRequest) -> Dict[str, Any]:
    invitation = await clerk_client.create_invitation(
        email=payload.email, redirect_url=payload.redirect_url
    )
    logger.info(f"Admin invited {payload.email}")
    return invitation


@router.post("/admin/invitations/{invitation_id}/revoke")
async def revoke_invitation(invitation_id: str) -> Dict[str, Any]:
    return await clerk_client.revoke_invitation(invitation_id)


@router.patch("/admin/users/{user_id}/role")
async def set_user_role(user_id: str, payload: RoleRequest, request: Request) -> Dict[str, Any]:
    _ensure_not_self(request, user_id)
    return await clerk_client.set_user_role(user_id, payload.role)


@router.post("/admin/users/{user_id}/ban")
async def ban_user(user_id: str, request: Request) -> Dict[str, Any]:
    _ensure_not_self(request, user_id)
    return await clerk_client.ban_user(user_id)


@router.post("/admin/users/{user_id}/unban")
async def unban_user(user_id: str, request: Request) -> Dict[str, Any]:
    _ensure_not_self(request, user_id)
    return await clerk_client.unban_user(user_id)


@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, request: Request) -> Dict[str, Any]:
    _ensure_not_self(request, user_id)
    await clerk_client.delete_user(user_id)
    return {"deleted": True}


@router.get("/admin/usage")
async def usage_summary() -> Dict[str, Any]:
    """
    Aggregated activity per user plus the most recent events.
    Only actions performed after usage tracking shipped are counted.
    """
    grouped = await repo_query(
        "SELECT user_id, email, action, count() AS count, time::max(created) AS last_at "
        "FROM usage_event GROUP BY user_id, email, action"
    )
    recent = await repo_query(
        "SELECT user_id, email, action, created FROM usage_event "
        "ORDER BY created DESC LIMIT 50"
    )

    users: Dict[str, Dict[str, Any]] = {}
    for row in grouped or []:
        uid = row.get("user_id") or "unknown"
        entry = users.setdefault(
            uid,
            {"user_id": uid, "email": row.get("email"), "actions": {}, "total": 0, "last_active": None},
        )
        count = row.get("count") or 0
        entry["actions"][row.get("action")] = count
        entry["total"] += count
        last_at = row.get("last_at")
        if last_at is not None and (entry["last_active"] is None or last_at > entry["last_active"]):
            entry["last_active"] = last_at

    return {
        "users": sorted(users.values(), key=lambda u: u["total"], reverse=True),
        "recent": recent or [],
    }

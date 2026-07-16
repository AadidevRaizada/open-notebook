"""
Admin panel endpoints: Clerk user management + per-user usage aggregation.

Every route requires the admin role (require_admin). User-management routes
additionally need CLERK_SECRET_KEY configured on the API server; in
password/none auth mode they return 400 while the usage endpoints still work
(events are attributed to "local").
"""

import os
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger
from pydantic import BaseModel, EmailStr

from api import clerk_client
from api.auth import get_auth_mode, is_super_admin, require_admin, require_super_admin
from open_notebook.database.repository import repo_query

router = APIRouter(dependencies=[Depends(require_admin)])


class InviteRequest(BaseModel):
    email: EmailStr
    # Where the invite link lands (the app's /sign-up page); sent by the
    # frontend from window.location.origin so it works locally and deployed.
    # Overridden by PUBLIC_APP_URL when set, so invites sent from a localhost
    # admin session still point at the deployed app.
    redirect_url: Optional[str] = None
    # Exactly one of these selects the invite mode (Clerk forces every user
    # into an organization, so plain invites push invitees to create their own):
    # organization_name -> create a fresh org and invite the user as its org:admin
    # organization_id   -> invite the user into that existing org as org:member
    organization_name: Optional[str] = None
    organization_id: Optional[str] = None


def _invite_redirect_url(requested: Optional[str]) -> Optional[str]:
    public_url = os.environ.get("PUBLIC_APP_URL", "").strip().rstrip("/")
    if public_url:
        return f"{public_url}/sign-up"
    return requested


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
async def admin_status(request: Request) -> Dict[str, Any]:
    """Lets the admin UI know which capabilities are available."""
    return {
        "auth_mode": get_auth_mode(),
        "user_management": clerk_client.is_clerk_admin_configured(),
        # Whether the current user may perform cross-organization actions
        # (add an existing user to another org / move between orgs).
        "super_admin": await is_super_admin(request),
    }


@router.get("/admin/users")
async def list_users() -> List[Dict[str, Any]]:
    return await clerk_client.list_users()


@router.get("/admin/organizations")
async def list_organizations() -> List[Dict[str, Any]]:
    return await clerk_client.list_organizations()


@router.post("/admin/organizations/{organization_id}/join")
async def join_organization(organization_id: str, request: Request) -> Dict[str, Any]:
    """
    Add the current admin to the given organization as an org admin.

    This lets an admin switch into any org (via the sidebar OrganizationSwitcher)
    to view/manage its isolated content. Clerk surfaces a friendly error if the
    admin is already a member.
    """
    current = getattr(request.state, "user", None) or {}
    user_id = current.get("id")
    if not user_id:
        raise HTTPException(status_code=400, detail="No authenticated user on request")
    await clerk_client.add_organization_membership(
        organization_id, user_id, role="org:admin"
    )
    logger.info(f"Admin {user_id} joined organization {organization_id}")
    return {"joined": True, "organization_id": organization_id}


@router.get("/admin/organizations/{organization_id}/members")
async def list_organization_members(organization_id: str) -> List[Dict[str, Any]]:
    """List the members of an organization (id, email, org role, joined)."""
    return await clerk_client.list_organization_memberships(organization_id)


class OrgRoleRequest(BaseModel):
    # Organization-level role (distinct from the app-wide admin role).
    role: Literal["org:admin", "org:member"]


@router.patch("/admin/organizations/{organization_id}/members/{user_id}")
async def set_organization_member_role(
    organization_id: str, user_id: str, payload: OrgRoleRequest
) -> Dict[str, Any]:
    return await clerk_client.update_organization_membership(
        organization_id, user_id, payload.role
    )


@router.delete("/admin/organizations/{organization_id}/members/{user_id}")
async def remove_organization_member(
    organization_id: str, user_id: str
) -> Dict[str, Any]:
    await clerk_client.remove_organization_membership(organization_id, user_id)
    return {"removed": True}


# --------------------------------------------------------------------------
# Cross-organization membership (super-admin only)
# --------------------------------------------------------------------------
# A user can belong to several organizations at once; switching their active
# org only changes which org's sources they can reach. These endpoints reshape
# membership *across* orgs, so they are restricted to the super administrator.


class AddUserToOrgRequest(BaseModel):
    organization_id: str
    role: Literal["org:admin", "org:member"] = "org:member"


class MoveUserRequest(BaseModel):
    from_organization_id: str
    to_organization_id: str
    # Role to grant in the destination org.
    role: Literal["org:admin", "org:member"] = "org:member"


@router.get(
    "/admin/users/{user_id}/organizations",
    dependencies=[Depends(require_super_admin)],
)
async def list_user_organizations(user_id: str) -> List[Dict[str, Any]]:
    """Every organization a user currently belongs to."""
    return await clerk_client.list_user_organization_memberships(user_id)


@router.post(
    "/admin/users/{user_id}/organizations",
    dependencies=[Depends(require_super_admin)],
)
async def add_user_to_organization(
    user_id: str, payload: AddUserToOrgRequest
) -> Dict[str, Any]:
    """
    Add an existing user to another organization **without** removing them from
    any org they already belong to (multi-org membership). Clerk returns a
    descriptive 4xx if the user is already a member of that org.
    """
    await clerk_client.add_organization_membership(
        payload.organization_id, user_id, role=payload.role
    )
    logger.info(
        f"Super-admin added user {user_id} to org {payload.organization_id} "
        f"as {payload.role}"
    )
    return {"added": True, "organization_id": payload.organization_id}


@router.post(
    "/admin/users/{user_id}/organizations/move",
    dependencies=[Depends(require_super_admin)],
)
async def move_user_between_organizations(
    user_id: str, payload: MoveUserRequest, request: Request
) -> Dict[str, Any]:
    """
    Move a user from one organization to another: add to the destination first,
    then remove from the source. Adding first means a failure can't strand the
    user with no organization (which would lock them out of the app).
    """
    if payload.from_organization_id == payload.to_organization_id:
        raise HTTPException(
            status_code=400,
            detail="Source and destination organizations must be different",
        )
    # Guard against the super-admin removing themselves from their active org
    # mid-session (which would break their own access).
    _ensure_not_self(request, user_id)

    await clerk_client.add_organization_membership(
        payload.to_organization_id, user_id, role=payload.role
    )
    await clerk_client.remove_organization_membership(
        payload.from_organization_id, user_id
    )
    logger.info(
        f"Super-admin moved user {user_id} from org "
        f"{payload.from_organization_id} to {payload.to_organization_id}"
    )
    return {
        "moved": True,
        "from_organization_id": payload.from_organization_id,
        "to_organization_id": payload.to_organization_id,
    }


@router.get("/admin/invitations")
async def list_invitations() -> List[Dict[str, Any]]:
    # Instance-level invites plus pending invites of every organization,
    # so the admin sees one combined pending list.
    invitations = await clerk_client.list_invitations(status="pending")
    for org in await clerk_client.list_organizations():
        invitations.extend(
            await clerk_client.list_org_invitations(org["id"], org_name=org["name"])
        )
    invitations.sort(key=lambda i: i.get("created_at") or 0, reverse=True)
    return invitations


@router.post("/admin/invitations")
async def invite_user(payload: InviteRequest) -> Dict[str, Any]:
    if payload.organization_name and payload.organization_id:
        raise HTTPException(
            status_code=400,
            detail="Provide either organization_name or organization_id, not both",
        )
    redirect_url = _invite_redirect_url(payload.redirect_url)

    if payload.organization_name:
        name = payload.organization_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Organization name cannot be empty")
        org = await clerk_client.create_organization(name)
        try:
            invitation = await clerk_client.create_org_invitation(
                org["id"], email=payload.email, role="org:admin", redirect_url=redirect_url
            )
        except HTTPException:
            # Don't leave an empty orphan org behind if the invite failed.
            try:
                await clerk_client.delete_organization(org["id"])
            except HTTPException:
                logger.warning(f"Could not clean up organization {org['id']} after failed invite")
            raise
        invitation["organization_name"] = org["name"]
        logger.info(f"Admin invited {payload.email} as admin of new org '{org['name']}'")
        return invitation

    if payload.organization_id:
        invitation = await clerk_client.create_org_invitation(
            payload.organization_id,
            email=payload.email,
            role="org:member",
            redirect_url=redirect_url,
        )
        logger.info(f"Admin invited {payload.email} into org {payload.organization_id}")
        return invitation

    invitation = await clerk_client.create_invitation(
        email=payload.email, redirect_url=redirect_url
    )
    logger.info(f"Admin invited {payload.email}")
    return invitation


@router.post("/admin/invitations/{invitation_id}/revoke")
async def revoke_invitation(
    invitation_id: str, organization_id: Optional[str] = None
) -> Dict[str, Any]:
    if organization_id:
        return await clerk_client.revoke_org_invitation(organization_id, invitation_id)
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

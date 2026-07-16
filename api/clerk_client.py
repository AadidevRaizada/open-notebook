"""
Async client for the Clerk Backend API (https://api.clerk.com/v1).

Used by the admin router for in-app user management (list/invite/role/ban/
delete). Requires CLERK_SECRET_KEY in the API environment; endpoints that
reach Clerk return 400 when it is missing (e.g. password-mode deployments).
The secret key never leaves the server — the frontend only talks to our API.
"""

import os
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException

CLERK_API_BASE = "https://api.clerk.com/v1"


def is_clerk_admin_configured() -> bool:
    return bool(os.environ.get("CLERK_SECRET_KEY"))


def _secret_key() -> str:
    key = os.environ.get("CLERK_SECRET_KEY")
    if not key:
        raise HTTPException(
            status_code=400,
            detail="User management requires CLERK_SECRET_KEY on the API server",
        )
    return key


async def _request(
    method: str,
    path: str,
    json: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
) -> Any:
    headers = {"Authorization": f"Bearer {_secret_key()}"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.request(
                method, f"{CLERK_API_BASE}{path}", headers=headers, json=json, params=params
            )
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Could not reach Clerk: {e}")

    if response.status_code >= 400:
        try:
            detail = response.json()["errors"][0]["message"]
        except Exception:
            detail = response.text[:300]
        # Client-side mistakes keep their status; Clerk server errors become 502
        status = response.status_code if response.status_code < 500 else 502
        raise HTTPException(status_code=status, detail=f"Clerk: {detail}")

    if not response.content:
        return None
    return response.json()


def _primary_email(user: Dict[str, Any]) -> Optional[str]:
    primary_id = user.get("primary_email_address_id")
    for email in user.get("email_addresses", []):
        if email.get("id") == primary_id:
            return email.get("email_address")
    emails = user.get("email_addresses", [])
    return emails[0].get("email_address") if emails else None


def _slim_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": user.get("id"),
        "email": _primary_email(user),
        "first_name": user.get("first_name"),
        "last_name": user.get("last_name"),
        "image_url": user.get("image_url"),
        "role": (user.get("public_metadata") or {}).get("role"),
        "banned": user.get("banned", False),
        "last_sign_in_at": user.get("last_sign_in_at"),
        "created_at": user.get("created_at"),
    }


async def list_users(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    users = await _request(
        "GET", "/users", params={"limit": limit, "offset": offset, "order_by": "-created_at"}
    )
    return [_slim_user(u) for u in users or []]


async def get_user(user_id: str) -> Dict[str, Any]:
    """Fetch a single user (slim shape). Used to resolve email/role by id."""
    return _slim_user(await _request("GET", f"/users/{user_id}"))


async def create_invitation(email: str, redirect_url: Optional[str] = None) -> Dict[str, Any]:
    body: Dict[str, Any] = {"email_address": email, "notify": True}
    if redirect_url:
        body["redirect_url"] = redirect_url
    invitation = await _request("POST", "/invitations", json=body)
    return _slim_invitation(invitation)


def _slim_invitation(invitation: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": invitation.get("id"),
        "email": invitation.get("email_address"),
        "status": invitation.get("status"),
        "created_at": invitation.get("created_at"),
    }


async def list_invitations(status: str = "pending") -> List[Dict[str, Any]]:
    invitations = await _request("GET", "/invitations", params={"status": status})
    return [_slim_invitation(i) for i in invitations or []]


async def revoke_invitation(invitation_id: str) -> Dict[str, Any]:
    # json={} forces a Content-Type header; Clerk rejects body-less POSTs.
    invitation = await _request("POST", f"/invitations/{invitation_id}/revoke", json={})
    return _slim_invitation(invitation)


def _slim_organization(org: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": org.get("id"),
        "name": org.get("name"),
        "members_count": org.get("members_count"),
        "created_at": org.get("created_at"),
    }


async def list_organizations(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    result = await _request(
        "GET",
        "/organizations",
        params={"limit": limit, "offset": offset, "order_by": "-created_at", "include_members_count": "true"},
    )
    orgs = result.get("data", []) if isinstance(result, dict) else (result or [])
    return [_slim_organization(o) for o in orgs]


async def create_organization(name: str) -> Dict[str, Any]:
    org = await _request("POST", "/organizations", json={"name": name})
    return _slim_organization(org)


async def delete_organization(organization_id: str) -> None:
    await _request("DELETE", f"/organizations/{organization_id}")


async def add_organization_membership(
    organization_id: str, user_id: str, role: str = "org:admin"
) -> Dict[str, Any]:
    """
    Add a user to an organization with the given role.

    Used by the admin "Join" action so an admin can enter any org and manage
    its (isolated) content. Clerk returns a 4xx with a descriptive message when
    the user is already a member; that message is surfaced to the admin UI.
    """
    membership = await _request(
        "POST",
        f"/organizations/{organization_id}/memberships",
        json={"user_id": user_id, "role": role},
    )
    return membership or {}


def _slim_org_membership(m: Dict[str, Any]) -> Dict[str, Any]:
    pud = m.get("public_user_data") or {}
    return {
        "user_id": pud.get("user_id"),
        "email": pud.get("identifier"),
        "first_name": pud.get("first_name"),
        "last_name": pud.get("last_name"),
        "image_url": pud.get("image_url"),
        "role": m.get("role"),
        "created_at": m.get("created_at"),
    }


async def list_organization_memberships(
    organization_id: str, limit: int = 100, offset: int = 0
) -> List[Dict[str, Any]]:
    result = await _request(
        "GET",
        f"/organizations/{organization_id}/memberships",
        params={"limit": limit, "offset": offset},
    )
    data = result.get("data", []) if isinstance(result, dict) else (result or [])
    return [_slim_org_membership(m) for m in data]


async def update_organization_membership(
    organization_id: str, user_id: str, role: str
) -> Dict[str, Any]:
    membership = await _request(
        "PATCH",
        f"/organizations/{organization_id}/memberships/{user_id}",
        json={"role": role},
    )
    return _slim_org_membership(membership or {})


async def remove_organization_membership(
    organization_id: str, user_id: str
) -> None:
    await _request(
        "DELETE", f"/organizations/{organization_id}/memberships/{user_id}"
    )


def _slim_user_org_membership(m: Dict[str, Any]) -> Dict[str, Any]:
    """One organization a given user belongs to (from the user-centric list)."""
    org = m.get("organization") or {}
    return {
        "organization_id": org.get("id"),
        "organization_name": org.get("name"),
        "role": m.get("role"),
        "created_at": m.get("created_at"),
    }


async def list_user_organization_memberships(
    user_id: str, limit: int = 100, offset: int = 0
) -> List[Dict[str, Any]]:
    """Every organization a user belongs to (drives the cross-org admin view)."""
    result = await _request(
        "GET",
        f"/users/{user_id}/organization_memberships",
        params={"limit": limit, "offset": offset},
    )
    data = result.get("data", []) if isinstance(result, dict) else (result or [])
    return [_slim_user_org_membership(m) for m in data]


def _slim_org_invitation(invitation: Dict[str, Any], org_name: Optional[str] = None) -> Dict[str, Any]:
    return {
        "id": invitation.get("id"),
        "email": invitation.get("email_address"),
        "status": invitation.get("status"),
        "created_at": invitation.get("created_at"),
        "organization_id": invitation.get("organization_id"),
        "organization_name": org_name,
        "role": invitation.get("role"),
    }


async def create_org_invitation(
    organization_id: str,
    email: str,
    role: str = "org:member",
    redirect_url: Optional[str] = None,
) -> Dict[str, Any]:
    # An organization invitation doubles as a sign-up ticket, so it works with
    # restricted sign-up mode and satisfies force_organization_selection —
    # the invitee lands inside the org instead of being pushed to create one.
    body: Dict[str, Any] = {"email_address": email, "role": role}
    if redirect_url:
        body["redirect_url"] = redirect_url
    invitation = await _request(
        "POST", f"/organizations/{organization_id}/invitations", json=body
    )
    return _slim_org_invitation(invitation)


async def list_org_invitations(
    organization_id: str, org_name: Optional[str] = None, status: str = "pending"
) -> List[Dict[str, Any]]:
    result = await _request(
        "GET",
        f"/organizations/{organization_id}/invitations",
        params={"status": status},
    )
    invitations = result.get("data", []) if isinstance(result, dict) else (result or [])
    return [_slim_org_invitation(i, org_name) for i in invitations]


async def revoke_org_invitation(organization_id: str, invitation_id: str) -> Dict[str, Any]:
    invitation = await _request(
        "POST", f"/organizations/{organization_id}/invitations/{invitation_id}/revoke", json={}
    )
    return _slim_org_invitation(invitation)


async def set_user_role(user_id: str, role: Optional[str]) -> Dict[str, Any]:
    # PATCH metadata deep-merges; null removes the key (demotes the user).
    user = await _request(
        "PATCH", f"/users/{user_id}/metadata", json={"public_metadata": {"role": role}}
    )
    return _slim_user(user)


async def ban_user(user_id: str) -> Dict[str, Any]:
    return _slim_user(await _request("POST", f"/users/{user_id}/ban", json={}))


async def unban_user(user_id: str) -> Dict[str, Any]:
    return _slim_user(await _request("POST", f"/users/{user_id}/unban", json={}))


async def delete_user(user_id: str) -> None:
    await _request("DELETE", f"/users/{user_id}")

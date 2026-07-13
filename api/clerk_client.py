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
    invitation = await _request("POST", f"/invitations/{invitation_id}/revoke")
    return _slim_invitation(invitation)


async def set_user_role(user_id: str, role: Optional[str]) -> Dict[str, Any]:
    # PATCH metadata deep-merges; null removes the key (demotes the user).
    user = await _request(
        "PATCH", f"/users/{user_id}/metadata", json={"public_metadata": {"role": role}}
    )
    return _slim_user(user)


async def ban_user(user_id: str) -> Dict[str, Any]:
    return _slim_user(await _request("POST", f"/users/{user_id}/ban"))


async def unban_user(user_id: str) -> Dict[str, Any]:
    return _slim_user(await _request("POST", f"/users/{user_id}/unban"))


async def delete_user(user_id: str) -> None:
    await _request("DELETE", f"/users/{user_id}")

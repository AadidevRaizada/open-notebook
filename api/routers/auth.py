"""
Authentication router for Open Notebook API.
Provides endpoints to check authentication status.
"""

from fastapi import APIRouter

from api.auth import get_auth_mode

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status")
async def get_auth_status():
    """
    Check if authentication is enabled and which mode is active.

    mode: "clerk" (Clerk JWT), "password" (shared password), or "none".
    auth_enabled is kept for backward compatibility with older frontends.
    """
    mode = get_auth_mode()
    auth_enabled = mode != "none"

    return {
        "auth_enabled": auth_enabled,
        "mode": mode,
        "message": "Authentication is required"
        if auth_enabled
        else "Authentication is disabled",
    }
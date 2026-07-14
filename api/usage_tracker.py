"""
Lightweight per-user activity recording for the admin usage dashboard.

UsageTrackingMiddleware records a usage_event row when one of the tracked
endpoints completes successfully, attributing it to the authenticated user
(request.state.user, set by the auth middleware in Clerk mode). In
password/none mode events are attributed to "local". Recording failures are
logged and swallowed — usage tracking must never break the actual request.
"""

from typing import Any, Dict, Optional

from fastapi import Request
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from open_notebook.database.repository import repo_create

# (method, path) -> action name shown in the admin usage dashboard
TRACKED_ROUTES: Dict[tuple, str] = {
    ("POST", "/api/sources"): "source_created",
    ("POST", "/api/sources/json"): "source_created",
    ("POST", "/api/notes"): "note_created",
    ("POST", "/api/chat/execute"): "chat_message",
    ("POST", "/api/search"): "search",
    ("POST", "/api/search/ask"): "ask",
    ("POST", "/api/search/ask/simple"): "ask",
    ("POST", "/api/podcasts/generate"): "podcast_generated",
    ("POST", "/api/transformations/execute"): "transformation_run",
    ("GET", "/api/export/summary-report"): "export_report",
}


async def record_usage(
    request: Request, action: str, details: Optional[Dict[str, Any]] = None
) -> None:
    try:
        user = getattr(request.state, "user", None) or {}
        await repo_create(
            "usage_event",
            {
                "user_id": user.get("id") or "local",
                "email": user.get("email") or "local",
                "org_id": user.get("org_id"),
                "action": action,
                "details": details or {},
            },
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Failed to record usage event '{action}': {e}")


class UsageTrackingMiddleware(BaseHTTPMiddleware):
    """Records tracked actions after a successful (non-4xx/5xx) response."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        action = TRACKED_ROUTES.get((request.method, request.url.path))
        if action and response.status_code < 400:
            await record_usage(request, action)
        return response

"""
Gmail connected-service logic: OAuth 2.0 web-server flow (read-only scope),
access-token refresh, thread-based mailbox search, and metadata cache sync.

Design rules (see plan / connector-design-principles):
- Refresh tokens are Fernet-encrypted at rest; bodies are never persisted —
  only metadata/snippets land in gmail_message_meta.
- Retrieval returns whole conversation threads, not single messages, so the
  answer model gets context ("Sure, approved." alone is useless).
- Every Gmail failure degrades to an empty result + warning; Gmail being down
  must never break Ask.
"""

import asyncio
import base64
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode

import httpx
from loguru import logger

from open_notebook.domain.gmail import GmailConnection, GmailMessageMeta
from open_notebook.exceptions import ConfigurationError, InvalidInputError
from open_notebook.utils.encryption import decrypt_value, encrypt_value

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1"
GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"

STATE_TTL_SECONDS = 600
DEFAULT_REDIRECT_URI = "http://localhost:3000/api/gmail/oauth/callback"

# Per-user access-token cache: {user_id: (access_token, expires_at_epoch)}.
# Access tokens live ~1h; refresh tokens stay encrypted in the DB.
_access_token_cache: Dict[str, Tuple[str, float]] = {}


def is_configured() -> bool:
    return bool(
        os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
        and os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
    )


def _client_config() -> Tuple[str, str, str]:
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
    redirect_uri = os.environ.get("GMAIL_OAUTH_REDIRECT_URI") or DEFAULT_REDIRECT_URI
    if not client_id or not client_secret:
        raise ConfigurationError(
            "Gmail integration is not configured. Set GOOGLE_OAUTH_CLIENT_ID and "
            "GOOGLE_OAUTH_CLIENT_SECRET."
        )
    return client_id, client_secret, redirect_uri


def build_authorize_url(user_id: str, org_id: Optional[str]) -> str:
    """
    Authorization URL for the consent screen. `state` is Fernet-encrypted and
    short-lived: the callback arrives as an unauthenticated top-level browser
    navigation, so state is the only thing binding it to a signed-in user.
    """
    client_id, _, redirect_uri = _client_config()
    state = encrypt_value(
        json.dumps({"uid": user_id, "org": org_id, "exp": time.time() + STATE_TTL_SECONDS})
    )
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": GMAIL_SCOPE,
        "access_type": "offline",
        # Forces re-consent so Google always returns a refresh token, even on
        # reconnect after disconnect.
        "prompt": "consent",
        "state": state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def parse_state(state: str) -> Dict[str, Any]:
    """Decrypt and validate the OAuth state parameter."""
    try:
        payload = json.loads(decrypt_value(state))
    except Exception:
        raise InvalidInputError("Invalid OAuth state")
    if not isinstance(payload, dict) or not payload.get("uid"):
        raise InvalidInputError("Invalid OAuth state")
    if float(payload.get("exp", 0)) < time.time():
        raise InvalidInputError("OAuth state expired — please try connecting again")
    return payload


async def handle_callback(code: str, state: str) -> GmailConnection:
    """Exchange the authorization code, resolve the mailbox address, persist."""
    payload = parse_state(state)
    user_id: str = payload["uid"]
    org_id: Optional[str] = payload.get("org")
    client_id, client_secret, redirect_uri = _client_config()

    async with httpx.AsyncClient(timeout=20) as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            logger.error(f"Gmail token exchange failed: {token_resp.status_code}")
            raise InvalidInputError("Google rejected the authorization code")
        tokens = token_resp.json()
        refresh_token = tokens.get("refresh_token")
        access_token = tokens.get("access_token")
        if not refresh_token or not access_token:
            raise InvalidInputError(
                "Google did not return a refresh token — remove the app's access "
                "at myaccount.google.com/permissions and try again"
            )

        profile_resp = await client.get(
            f"{GMAIL_API_BASE}/users/me/profile",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        profile_resp.raise_for_status()
        email = profile_resp.json().get("emailAddress", "")

    from pydantic import SecretStr

    existing = await GmailConnection.get_for_user(user_id)
    if existing:
        existing.email = email
        existing.org_id = org_id
        existing.refresh_token = SecretStr(refresh_token)
        existing.scopes = [GMAIL_SCOPE]
        connection = existing
    else:
        connection = GmailConnection(
            user_id=user_id,
            org_id=org_id,
            email=email,
            refresh_token=SecretStr(refresh_token),
            scopes=[GMAIL_SCOPE],
        )
    await connection.save()

    _access_token_cache[user_id] = (access_token, time.time() + 3300)

    # Best-effort initial metadata sync so "recent emails" is instant.
    try:
        await sync_recent_meta(user_id, org_id=org_id)
    except Exception as e:
        logger.warning(f"Initial Gmail metadata sync failed: {e}")

    return connection


async def get_access_token(user_id: str) -> Optional[str]:
    """Fresh access token via the stored refresh token (cached per user)."""
    cached = _access_token_cache.get(user_id)
    if cached and cached[1] > time.time():
        return cached[0]

    connection = await GmailConnection.get_for_user(user_id)
    if not connection or not connection.refresh_token:
        return None

    client_id, client_secret, _ = _client_config()
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": connection.refresh_token.get_secret_value(),
                "grant_type": "refresh_token",
            },
        )
    if resp.status_code != 200:
        body = resp.text[:200]
        if "invalid_grant" in body:
            # Token revoked/expired at Google — drop the connection so the UI
            # falls back to "Connect Gmail" instead of failing silently forever.
            logger.warning(f"Gmail refresh token invalid for {user_id}; disconnecting")
            await GmailConnection.delete_for_user(user_id)
            _access_token_cache.pop(user_id, None)
            return None
        logger.error(f"Gmail token refresh failed ({resp.status_code}): {body}")
        return None

    tokens = resp.json()
    access_token = tokens.get("access_token")
    if not access_token:
        return None
    expires_in = int(tokens.get("expires_in", 3600))
    _access_token_cache[user_id] = (access_token, time.time() + expires_in - 60)
    return access_token


async def disconnect(user_id: str) -> None:
    """Revoke at Google (best effort) and remove connection + metadata cache."""
    connection = await GmailConnection.get_for_user(user_id)
    if connection and connection.refresh_token:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    GOOGLE_REVOKE_URL,
                    params={"token": connection.refresh_token.get_secret_value()},
                )
        except Exception as e:
            logger.warning(f"Gmail token revoke failed (continuing): {e}")
    await GmailConnection.delete_for_user(user_id)
    await GmailMessageMeta.delete_for_user(user_id)
    _access_token_cache.pop(user_id, None)


# --------------------------------------------------------------------------
# Message parsing helpers
# --------------------------------------------------------------------------


def _headers_dict(payload: Dict[str, Any]) -> Dict[str, str]:
    return {
        h.get("name", "").lower(): h.get("value", "")
        for h in payload.get("headers", [])
    }


def _decode_body_data(data: str) -> str:
    try:
        padded = data + "=" * (-len(data) % 4)
        return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
    except Exception:
        return ""


_TAG_RE = re.compile(r"<[^>]+>")


def _extract_text(payload: Dict[str, Any], limit: int = 1200) -> str:
    """Best text/plain part of a message payload (in-memory only, never stored)."""

    def walk(part: Dict[str, Any], mime: str) -> Optional[str]:
        if part.get("mimeType", "").startswith(mime) and part.get("body", {}).get("data"):
            return _decode_body_data(part["body"]["data"])
        for child in part.get("parts", []) or []:
            found = walk(child, mime)
            if found:
                return found
        return None

    text = walk(payload, "text/plain")
    if not text:
        html = walk(payload, "text/html")
        if html:
            text = _TAG_RE.sub(" ", html)
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def _meta_from_message(msg: Dict[str, Any]) -> Dict[str, Any]:
    headers = _headers_dict(msg.get("payload", {}))
    ts: Optional[datetime] = None
    internal = msg.get("internalDate")
    if internal:
        try:
            ts = datetime.fromtimestamp(int(internal) / 1000, tz=timezone.utc)
        except (ValueError, OSError):
            ts = None
    return {
        "message_id": msg.get("id", ""),
        "thread_id": msg.get("threadId", ""),
        "subject": headers.get("subject"),
        "sender": headers.get("from"),
        "timestamp": ts,
        "labels": msg.get("labelIds", []),
        "snippet": msg.get("snippet"),
    }


# --------------------------------------------------------------------------
# Retrieval
# --------------------------------------------------------------------------


async def search_gmail(
    user_id: str,
    query: str,
    max_threads: int = 6,
    org_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Search the user's mailbox and return whole conversation threads.

    A matching message pulls its entire thread (capped) so the answer model
    always sees the conversation context. Returns [] on any failure.
    """
    try:
        token = await get_access_token(user_id)
        if not token:
            return []
        headers = {"Authorization": f"Bearer {token}"}

        # List enough messages to dedupe down to `max_threads` distinct threads
        # (several messages can share one thread), bounded so a large request
        # can't fan out unreasonably. Gmail returns messages newest-first.
        list_size = max(20, min(100, max_threads * 4))

        async with httpx.AsyncClient(timeout=25, headers=headers) as client:
            list_resp = await client.get(
                f"{GMAIL_API_BASE}/users/me/messages",
                params={"q": query, "maxResults": list_size},
            )
            if list_resp.status_code != 200:
                logger.warning(f"Gmail search failed ({list_resp.status_code})")
                return []
            messages = list_resp.json().get("messages", []) or []
            if not messages:
                await GmailConnection.touch_sync(user_id)
                return []

            thread_ids: List[str] = []
            for m in messages:
                tid = m.get("threadId")
                if tid and tid not in thread_ids:
                    thread_ids.append(tid)
                if len(thread_ids) >= max_threads:
                    break

            thread_resps = await asyncio.gather(
                *[
                    client.get(f"{GMAIL_API_BASE}/users/me/threads/{tid}", params={"format": "full"})
                    for tid in thread_ids
                ],
                return_exceptions=True,
            )

        threads: List[Dict[str, Any]] = []
        meta_items: List[Dict[str, Any]] = []
        for tid, resp in zip(thread_ids, thread_resps):
            if isinstance(resp, Exception) or resp.status_code != 200:
                continue
            data = resp.json()
            msgs = data.get("messages", []) or []
            if not msgs:
                continue

            parsed_msgs = []
            participants: List[str] = []
            total_chars = 0
            for msg in msgs:
                meta = _meta_from_message(msg)
                meta_items.append(meta)
                sender = meta["sender"] or ""
                if sender and sender not in participants:
                    participants.append(sender)
                text = ""
                if total_chars < 4000:  # per-thread context cap
                    text = _extract_text(msg.get("payload", {}))
                    total_chars += len(text)
                parsed_msgs.append(
                    {
                        "from": sender,
                        "date": meta["timestamp"].isoformat() if meta["timestamp"] else None,
                        "text": text or (meta["snippet"] or ""),
                    }
                )

            first_meta = _meta_from_message(msgs[0])
            last_meta = _meta_from_message(msgs[-1])
            threads.append(
                {
                    "thread_id": tid,
                    "subject": first_meta["subject"] or "(no subject)",
                    "participants": participants,
                    "message_count": len(msgs),
                    "last_date": last_meta["timestamp"].isoformat()
                    if last_meta["timestamp"]
                    else None,
                    "snippet": first_meta["snippet"] or "",
                    "messages": parsed_msgs,
                    "web_link": f"https://mail.google.com/mail/u/0/#all/{tid}",
                }
            )

        if meta_items:
            await GmailMessageMeta.upsert_many(user_id, org_id, meta_items)
        await GmailConnection.touch_sync(user_id)
        return threads

    except Exception as e:
        logger.warning(f"Gmail search degraded to empty result: {e}")
        return []


async def sync_recent_meta(
    user_id: str, limit: int = 25, org_id: Optional[str] = None
) -> int:
    """Metadata-only refresh of the newest messages (no bodies fetched)."""
    token = await get_access_token(user_id)
    if not token:
        return 0
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=25, headers=headers) as client:
        list_resp = await client.get(
            f"{GMAIL_API_BASE}/users/me/messages", params={"maxResults": limit}
        )
        if list_resp.status_code != 200:
            return 0
        messages = list_resp.json().get("messages", []) or []
        detail_resps = await asyncio.gather(
            *[
                client.get(
                    f"{GMAIL_API_BASE}/users/me/messages/{m['id']}",
                    params={
                        "format": "metadata",
                        "metadataHeaders": ["From", "Subject", "Date"],
                    },
                )
                for m in messages
            ],
            return_exceptions=True,
        )
    meta_items = [
        _meta_from_message(r.json())
        for r in detail_resps
        if not isinstance(r, Exception) and r.status_code == 200
    ]
    if meta_items:
        await GmailMessageMeta.upsert_many(user_id, org_id, meta_items)
    await GmailConnection.touch_sync(user_id)
    return len(meta_items)


def format_email_findings(threads: List[Dict[str, Any]]) -> str:
    """One text block summarizing retrieved threads for the final-answer model."""
    if not threads:
        return ""
    lines = ["EMAIL FINDINGS (from the user's connected Gmail, read-only):"]
    for t in threads:
        lines.append("")
        lines.append(
            f"[email] Subject: {t['subject']} | Participants: {', '.join(t['participants'][:4])} "
            f"| Messages: {t['message_count']} | Last: {t.get('last_date') or 'unknown'}"
        )
        for m in t["messages"]:
            date = m.get("date") or ""
            lines.append(f"  - From {m.get('from', 'unknown')} {date}: {m.get('text', '')}")
    return "\n".join(lines)

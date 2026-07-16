"""
Gmail connected-service domain models.

GmailConnection stores one read-only Gmail OAuth connection per user, with the
refresh token Fernet-encrypted at rest (same scheme as Credential API keys).
GmailMessageMeta is a lightweight per-user metadata cache (subject, sender,
timestamp, snippet — never message bodies) that powers instant "recent emails"
display without a Gmail API round-trip.
"""

from datetime import datetime, timezone
from typing import Any, ClassVar, Dict, List, Optional

from loguru import logger
from pydantic import SecretStr

from open_notebook.database.repository import repo_query
from open_notebook.domain.base import ObjectModel
from open_notebook.utils.encryption import decrypt_value, encrypt_value


class GmailConnection(ObjectModel):
    """A user's read-only Gmail OAuth connection (one per user)."""

    table_name: ClassVar[str] = "gmail_connection"
    nullable_fields: ClassVar[set[str]] = {"org_id", "last_sync_at"}

    user_id: str
    org_id: Optional[str] = None
    email: str
    refresh_token: Optional[SecretStr] = None
    scopes: List[str] = []
    last_sync_at: Optional[datetime] = None

    @classmethod
    async def get_for_user(cls, user_id: str) -> Optional["GmailConnection"]:
        results = await repo_query(
            "SELECT * FROM gmail_connection WHERE user_id = $user_id LIMIT 1",
            {"user_id": user_id},
        )
        if not results:
            return None
        row = results[0]
        token_val = row.get("refresh_token")
        if token_val and isinstance(token_val, str):
            row["refresh_token"] = SecretStr(decrypt_value(token_val))
        return cls(**row)

    @classmethod
    async def list_all(cls) -> List[Dict[str, Any]]:
        """
        Every connected Gmail account, for the admin overview.

        Returns metadata only — user_id, org_id, email, scopes, timestamps —
        and deliberately never the refresh token, so the admin view can't be
        used to exfiltrate credentials or read anyone's mail.
        """
        rows = await repo_query(
            "SELECT user_id, org_id, email, scopes, last_sync_at, created, updated "
            "FROM gmail_connection ORDER BY last_sync_at DESC"
        )
        results: List[Dict[str, Any]] = []
        for row in rows or []:
            for key in ("last_sync_at", "created", "updated"):
                ts = row.get(key)
                if hasattr(ts, "isoformat"):
                    row[key] = ts.isoformat()
            results.append(row)
        return results

    @classmethod
    async def touch_sync(cls, user_id: str) -> None:
        """Record a successful Gmail API call (drives 'Last checked' in the UI)."""
        try:
            await repo_query(
                "UPDATE gmail_connection SET last_sync_at = time::now(), "
                "updated = time::now() WHERE user_id = $user_id",
                {"user_id": user_id},
            )
        except Exception as e:
            logger.warning(f"Failed to touch gmail last_sync_at: {e}")

    @classmethod
    async def delete_for_user(cls, user_id: str) -> None:
        await repo_query(
            "DELETE gmail_connection WHERE user_id = $user_id",
            {"user_id": user_id},
        )

    def _prepare_save_data(self) -> Dict[str, Any]:
        """Encrypt the refresh token before it touches the database."""
        data = {}
        for key, value in self.model_dump().items():
            if key == "refresh_token":
                if self.refresh_token:
                    data["refresh_token"] = encrypt_value(
                        self.refresh_token.get_secret_value()
                    )
            elif value is not None or key in self.__class__.nullable_fields:
                data[key] = value
        return data

    async def save(self) -> None:
        """Save, restoring the plaintext SecretStr after the DB round-trip."""
        original_token = self.refresh_token
        await super().save()
        if original_token:
            object.__setattr__(self, "refresh_token", original_token)


class GmailMessageMeta(ObjectModel):
    """Cached Gmail message metadata (no bodies) for a user."""

    table_name: ClassVar[str] = "gmail_message_meta"
    nullable_fields: ClassVar[set[str]] = {
        "org_id",
        "subject",
        "sender",
        "timestamp",
        "snippet",
    }

    user_id: str
    org_id: Optional[str] = None
    message_id: str
    thread_id: str
    subject: Optional[str] = None
    sender: Optional[str] = None
    timestamp: Optional[datetime] = None
    labels: List[str] = []
    snippet: Optional[str] = None

    @classmethod
    async def upsert_many(
        cls,
        user_id: str,
        org_id: Optional[str],
        items: List[Dict[str, Any]],
    ) -> None:
        """
        Upsert metadata rows keyed by (user_id, message_id). Uses a
        deterministic record id so re-syncing the same message is idempotent
        under the unique index.
        """
        now = datetime.now(timezone.utc)
        for item in items:
            message_id = item.get("message_id")
            if not message_id:
                continue
            try:
                await repo_query(
                    "UPSERT type::thing('gmail_message_meta', $rid) MERGE $data",
                    {
                        "rid": f"{user_id}-{message_id}",
                        "data": {
                            "user_id": user_id,
                            "org_id": org_id,
                            "message_id": message_id,
                            "thread_id": item.get("thread_id", ""),
                            "subject": item.get("subject"),
                            "sender": item.get("sender"),
                            "timestamp": item.get("timestamp"),
                            "labels": item.get("labels", []),
                            "snippet": item.get("snippet"),
                            "updated": now,
                        },
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to cache gmail metadata {message_id}: {e}")

    @classmethod
    async def recent_for_user(
        cls, user_id: str, limit: int = 25
    ) -> List[Dict[str, Any]]:
        return await repo_query(
            "SELECT message_id, thread_id, subject, sender, timestamp, labels, "
            "snippet FROM gmail_message_meta WHERE user_id = $user_id "
            "ORDER BY timestamp DESC LIMIT $limit",
            {"user_id": user_id, "limit": limit},
        )

    @classmethod
    async def delete_for_user(cls, user_id: str) -> None:
        await repo_query(
            "DELETE gmail_message_meta WHERE user_id = $user_id",
            {"user_id": user_id},
        )

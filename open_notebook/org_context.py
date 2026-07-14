"""
Per-request organization context.

A single :class:`contextvars.ContextVar` carries the active organization id for
the duration of a request. It is set by the auth middleware (Clerk mode) and read
by the domain layer to stamp new records and filter reads.

Design notes:
- This module lives at the ``open_notebook`` package root (not under ``api`` or
  ``open_notebook.database``) so both the API layer and the domain layer can
  import it without creating an import cycle.
- In password/none auth mode the contextvar is never set, so it stays ``None``
  and no stamping/filtering happens — preserving the single-workspace behavior
  and keeping the existing test suite green.
- ContextVars do not reliably propagate into background worker processes or some
  streaming generators, so worker-side code and the ask/search graphs thread the
  org id explicitly instead of relying on this contextvar.
"""

import contextvars
from typing import Optional

_current_org_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_org_id", default=None
)


def current_org_id() -> Optional[str]:
    """Return the active organization id for this request, or ``None``."""
    return _current_org_id.get()


def set_current_org_id(org_id: Optional[str]) -> contextvars.Token:
    """Set the active organization id. Returns a token for :func:`reset_current_org_id`."""
    return _current_org_id.set(org_id)


def reset_current_org_id(token: contextvars.Token) -> None:
    """Reset the contextvar to its previous value using a token from :func:`set_current_org_id`."""
    _current_org_id.reset(token)

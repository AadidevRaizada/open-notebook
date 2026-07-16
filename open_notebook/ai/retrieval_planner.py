"""
Retrieval planner: decides which knowledge stores an Ask question should hit.

This is the extensibility seam for connected services. The ask flow never
checks per-service conditions itself — it asks the planner for a RetrievalPlan
and fans out one retrieval branch per enabled flag. Adding a future connector
(Outlook, SharePoint, Teams, ...) means adding a flag here plus a graph node;
no re-plumbing.

Architecture: Planner -> select tools -> retrieve context -> answer.

The current implementation is keyword heuristics; it can later be replaced by
an LLM-based planner behind the same interface.
"""

import re
from dataclasses import dataclass
from typing import Literal

RetrievalMode = Literal["documents", "documents_gmail", "auto"]

# Email-intent cues for "auto" mode. Word-boundary matched, case-insensitive.
# Deliberately a module-level list so tuning is a one-line change.
EMAIL_INTENT_KEYWORDS = [
    r"e-?mails?",
    r"e-?mailed",
    r"mails?",
    r"mailed",
    r"mailbox",
    r"inbox",
    r"gmail",
    r"messages?",
    r"sent",
    r"received",
    r"attachments?",
    r"correspondence",
]

_EMAIL_INTENT_RE = re.compile(
    r"\b(?:" + "|".join(EMAIL_INTENT_KEYWORDS) + r")\b", re.IGNORECASE
)


@dataclass
class RetrievalPlan:
    """Which stores to retrieve from for one question."""

    search_documents: bool = True
    search_gmail: bool = False
    # future: search_outlook, search_sharepoint, search_teams, ...

    def as_dict(self) -> dict:
        return {
            "search_documents": self.search_documents,
            "search_gmail": self.search_gmail,
        }


def plan_retrieval(
    question: str,
    mode: str = "auto",
    gmail_connected: bool = False,
) -> RetrievalPlan:
    """
    Build the retrieval plan for a question.

    - "documents": knowledge base only, never Gmail.
    - "documents_gmail": always include Gmail (if connected).
    - "auto" (default): include Gmail only when the question shows email
      intent — avoids burning Gmail quota and latency on pure-document asks.
    """
    if not gmail_connected or mode == "documents":
        return RetrievalPlan()
    if mode == "documents_gmail":
        return RetrievalPlan(search_gmail=True)
    return RetrievalPlan(search_gmail=bool(_EMAIL_INTENT_RE.search(question or "")))


# --------------------------------------------------------------------------
# Email query planning
# --------------------------------------------------------------------------
# Once the planner decides to search Gmail, this decides *how*: how many
# conversation threads to pull, and whether to filter by the question's search
# terms or just grab the most recent mail. Kept here (not in gmail_service) so
# the pure decision logic stays unit-testable without any network mocking.

# Sensible defaults. A pure-document ask that happens to trigger Gmail intent
# only needs a few threads for context; an explicit "my emails" ask wants more.
DEFAULT_EMAIL_THREADS = 6
# Hard ceiling — bounds Gmail API fan-out (one thread fetch each) and the
# amount of email context handed to the answer model.
MAX_EMAIL_THREADS = 20

# "Give me the latest / most recent / last N emails" — recency intent means the
# user wants their newest mail, NOT mail keyword-matched to document terms.
_RECENCY_RE = re.compile(
    r"\b(?:latest|recent|newest|last|most\s+recent|today'?s?|this\s+week'?s?)\b",
    re.IGNORECASE,
)

# Number words up to twenty (covers realistic "latest N emails" phrasing).
_NUMBER_WORDS = {
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
    "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
}

# A count that directly qualifies emails/mails/messages/threads, e.g.
# "last 10 emails", "my 5 most recent messages", "twelve mails".
_DIGIT_COUNT_RE = re.compile(
    r"\b(\d{1,3})\s+(?:most\s+recent\s+|latest\s+|last\s+|recent\s+)?"
    r"(?:e-?mails?|mails?|messages?|threads?|conversations?)\b",
    re.IGNORECASE,
)
_WORD_COUNT_RE = re.compile(
    r"\b(" + "|".join(_NUMBER_WORDS) + r")\s+(?:most\s+recent\s+|latest\s+|last\s+|recent\s+)?"
    r"(?:e-?mails?|mails?|messages?|threads?|conversations?)\b",
    re.IGNORECASE,
)


@dataclass
class EmailQueryPlan:
    """How to query Gmail for one Ask question."""

    query: str
    max_threads: int
    # True when the user asked for recent mail rather than keyword-matched mail;
    # exposed mainly so callers/tests can reason about the decision.
    recency: bool = False


def extract_email_count(question: str) -> int | None:
    """Requested email count from phrasing like 'last 10 emails' / 'five mails'."""
    q = question or ""
    m = _DIGIT_COUNT_RE.search(q)
    if m:
        try:
            n = int(m.group(1))
            return n if n > 0 else None
        except ValueError:
            return None
    m = _WORD_COUNT_RE.search(q)
    if m:
        return _NUMBER_WORDS.get(m.group(1).lower())
    return None


def plan_email_query(
    question: str,
    terms: list[str] | None = None,
    default_threads: int = DEFAULT_EMAIL_THREADS,
) -> EmailQueryPlan:
    """
    Decide the Gmail query string and thread count for a question.

    - An explicit count ("last 10 emails") sets the thread count directly.
    - Recency intent ("latest/recent/last …"), or the absence of usable search
      terms, means fetch the newest mail with a broad inbox query — Gmail
      returns messages newest-first, so this reliably yields the latest N.
      This is the fix for keyword-filtered queries returning far fewer emails
      than the user asked for.
    - Otherwise, filter by the strategy's top search terms.
    """
    clean_terms = [t.strip() for t in (terms or []) if t and t.strip()]
    count = extract_email_count(question)
    recency = bool(_RECENCY_RE.search(question or ""))

    max_threads = count if count else default_threads
    max_threads = max(1, min(max_threads, MAX_EMAIL_THREADS))

    # Broad, newest-first query when the user wants recent mail (or we have no
    # meaningful terms to filter on). "in:anywhere" spans inbox + archived so a
    # broad "my recent emails" isn't limited to the primary inbox.
    if recency or not clean_terms:
        return EmailQueryPlan(query="in:anywhere", max_threads=max_threads, recency=True)

    query = " OR ".join(f"({t})" for t in clean_terms[:3])
    return EmailQueryPlan(query=query, max_threads=max_threads, recency=False)

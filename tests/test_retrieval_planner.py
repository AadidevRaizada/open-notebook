"""Unit tests for the retrieval planner (connector selection for Ask)."""

import pytest

from open_notebook.ai.retrieval_planner import (
    DEFAULT_EMAIL_THREADS,
    MAX_EMAIL_THREADS,
    EmailQueryPlan,
    RetrievalPlan,
    extract_email_count,
    plan_email_query,
    plan_retrieval,
)


class TestPlanRetrieval:
    def test_documents_mode_never_searches_gmail(self):
        plan = plan_retrieval("summarize my emails", "documents", gmail_connected=True)
        assert plan.search_documents is True
        assert plan.search_gmail is False

    def test_documents_gmail_mode_always_searches_gmail(self):
        plan = plan_retrieval("what is MARPOL", "documents_gmail", gmail_connected=True)
        assert plan.search_documents is True
        assert plan.search_gmail is True

    def test_not_connected_never_searches_gmail(self):
        for mode in ("documents", "documents_gmail", "auto"):
            plan = plan_retrieval("summarize my emails", mode, gmail_connected=False)
            assert plan.search_gmail is False, mode

    @pytest.mark.parametrize(
        "question",
        [
            "Summarize today's emails",
            "What did Ravi email me about the survey?",
            "Check my inbox for ballast water messages",
            "Any mail from the classification society?",
            "What attachments were received last week?",
            "Show correspondence about the circular",
            "summarize this week's e-mails on compliance",
        ],
    )
    def test_auto_mode_triggers_on_email_intent(self, question):
        plan = plan_retrieval(question, "auto", gmail_connected=True)
        assert plan.search_gmail is True, question

    @pytest.mark.parametrize(
        "question",
        [
            "What are the MARPOL Annex VI requirements?",
            "Compare the two survey reports",
            "Summarize the latest circulars",
            "List ballast water guidance documents",
            # "mailing" / "emailing" as substrings must not match on word boundary
            "Describe the formalities of the port",
        ],
    )
    def test_auto_mode_skips_pure_document_questions(self, question):
        plan = plan_retrieval(question, "auto", gmail_connected=True)
        assert plan.search_gmail is False, question

    def test_auto_mode_handles_empty_question(self):
        plan = plan_retrieval("", "auto", gmail_connected=True)
        assert plan.search_gmail is False

    def test_documents_always_enabled(self):
        for mode in ("documents", "documents_gmail", "auto"):
            assert plan_retrieval("anything", mode, True).search_documents is True

    def test_as_dict_shape(self):
        assert RetrievalPlan(search_gmail=True).as_dict() == {
            "search_documents": True,
            "search_gmail": True,
        }


class TestExtractEmailCount:
    @pytest.mark.parametrize(
        "question,expected",
        [
            ("Summarize my last 10 emails", 10),
            ("action items from the 5 most recent emails", 5),
            ("show me my latest 3 mails", 3),
            ("give me twelve emails", 12),
            ("read the last two messages", 2),
            ("summarize the most recent conversation", None),
            ("what did Ravi email me?", None),
            ("", None),
            # A bare number not qualifying emails must not be treated as a count.
            ("summarize document 5 about MARPOL", None),
        ],
    )
    def test_extract_count(self, question, expected):
        assert extract_email_count(question) == expected

    def test_zero_and_negative_ignored(self):
        assert extract_email_count("show me my last 0 emails") is None


class TestPlanEmailQuery:
    def test_explicit_count_sets_thread_count(self):
        plan = plan_email_query("action items from my last 10 emails", ["action items"])
        assert plan.max_threads == 10
        # Recency intent ("last") means newest-first broad query, not term filter.
        assert plan.recency is True
        assert plan.query == "in:anywhere"

    def test_recency_intent_uses_broad_query(self):
        plan = plan_email_query("what are my latest emails about?", ["survey", "report"])
        assert plan.recency is True
        assert plan.query == "in:anywhere"

    def test_keyword_query_when_no_recency(self):
        plan = plan_email_query(
            "what did the class society say about ballast water?",
            ["ballast water", "class society", "survey"],
        )
        assert plan.recency is False
        assert "ballast water" in plan.query
        assert plan.query.count(" OR ") == 2  # capped at 3 terms

    def test_no_terms_falls_back_to_recency(self):
        plan = plan_email_query("summarize my mailbox", [])
        assert plan.recency is True
        assert plan.query == "in:anywhere"

    def test_default_thread_count(self):
        plan = plan_email_query("any mail from the surveyor?", ["surveyor"])
        assert plan.max_threads == DEFAULT_EMAIL_THREADS

    def test_thread_count_capped(self):
        plan = plan_email_query("summarize my last 500 emails", None)
        assert plan.max_threads == MAX_EMAIL_THREADS

    def test_thread_count_minimum(self):
        # An explicit count of 1 stays 1 (never below the floor).
        plan = plan_email_query("read my last 1 email", None)
        assert plan.max_threads == 1

    def test_returns_dataclass(self):
        plan = plan_email_query("latest emails", None)
        assert isinstance(plan, EmailQueryPlan)

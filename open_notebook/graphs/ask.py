import operator
import os
from typing import Annotated, List

from ai_prompter import Prompter
from langchain_core.output_parsers.pydantic import PydanticOutputParser
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from open_notebook.ai.provision import provision_langchain_model
from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.notebook import vector_search
from open_notebook.exceptions import OpenNotebookError
from open_notebook.utils import clean_thinking_content
from open_notebook.utils.error_classifier import classify_error
from open_notebook.utils.text_utils import extract_text_content

_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"}
_AUDIO_EXTENSIONS = {"mp3", "wav", "m4a", "flac", "ogg"}
_VIDEO_EXTENSIONS = {"mp4", "mov", "webm", "mkv", "avi"}


def _describe_file_kind(extension: str) -> str:
    if extension in _IMAGE_EXTENSIONS:
        return f"image ({extension})"
    if extension in _AUDIO_EXTENSIONS:
        return f"audio ({extension})"
    if extension in _VIDEO_EXTENSIONS:
        return f"video ({extension})"
    return f"{extension} document"


async def _attach_file_metadata(results: list) -> None:
    """Annotate search results with the original file behind each source.

    Vector search only returns titles and matched text, so the answering model
    has no way to know whether a source is a PNG screenshot, a PDF, or a web
    page — image sources read as plain text because their content is extracted
    via OCR/vision. Attaching `original_file` / `document_type` lets the model
    answer file-type questions ("find any images…") correctly.
    """
    source_ids = {
        str(r.get("parent_id"))
        for r in results
        if str(r.get("parent_id", "")).startswith("source:")
    }
    if not source_ids:
        return
    try:
        rows = await repo_query(
            "SELECT id, asset.file_path as file_path, asset.url as url "
            "FROM source WHERE id INSIDE $ids",
            {"ids": [ensure_record_id(source_id) for source_id in source_ids]},
        )
    except Exception:
        # Metadata is an enrichment — never break retrieval over it.
        return
    meta_by_id = {str(row["id"]): row for row in rows}
    for result in results:
        meta = meta_by_id.get(str(result.get("parent_id")))
        if not meta:
            continue
        file_path = meta.get("file_path")
        if file_path:
            filename = os.path.basename(str(file_path))
            extension = (
                filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
            )
            result["original_file"] = filename
            if extension:
                result["document_type"] = _describe_file_kind(extension)
        elif meta.get("url"):
            result["document_type"] = "web page"
            result["original_url"] = meta["url"]


class SubGraphState(TypedDict):
    question: str
    term: str
    instructions: str
    results: dict
    answer: str
    ids: list  # Added for provide_answer function
    org_id: str  # Active organization for row-level isolation (threaded explicitly)


class Search(BaseModel):
    term: str
    instructions: str = Field(
        description="Tell the answeting LLM what information you need extracted from this search"
    )


class Strategy(BaseModel):
    reasoning: str
    searches: List[Search] = Field(
        default_factory=list,
        description="You can add up to five searches to this strategy",
    )


class ThreadState(TypedDict):
    question: str
    strategy: Strategy
    answers: Annotated[list, operator.add]
    final_answer: str
    org_id: str  # Active organization for row-level isolation (threaded explicitly)
    user_id: str  # Asking user; owns any connected services (Gmail)
    retrieval_plan: dict  # From plan_retrieval(); {"search_gmail": bool, ...}
    email_results: Annotated[list, operator.add]  # Normalized Gmail threads


class EmailSearchState(TypedDict):
    question: str
    terms: list
    user_id: str
    org_id: str


async def call_model_with_messages(state: ThreadState, config: RunnableConfig) -> dict:
    try:
        parser = PydanticOutputParser(pydantic_object=Strategy)
        system_prompt = Prompter(prompt_template="ask/entry", parser=parser).render(  # type: ignore[arg-type]
            data=state  # type: ignore[arg-type]
        )
        model = await provision_langchain_model(
            system_prompt,
            config.get("configurable", {}).get("strategy_model"),
            "tools",
            max_tokens=2000,
            structured=dict(type="json"),
        )
        # model = model.bind_tools(tools)
        # First get the raw response from the model
        ai_message = await model.ainvoke(system_prompt)

        # Clean the thinking content from the response
        message_content = extract_text_content(ai_message.content)
        cleaned_content = clean_thinking_content(message_content)

        # Parse the cleaned JSON content
        strategy = parser.parse(cleaned_content)

        return {"strategy": strategy}
    except OpenNotebookError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


async def trigger_queries(state: ThreadState, config: RunnableConfig):
    sends = [
        Send(
            "provide_answer",
            {
                "question": state["question"],
                "instructions": s.instructions,
                "term": s.term,
                # "type": s.type,
                "org_id": state.get("org_id"),
            },
        )
        for s in state["strategy"].searches
    ]
    # Connected-service retrieval branch (selected by the retrieval planner —
    # see open_notebook/ai/retrieval_planner.py). Runs in parallel with the
    # document searches; write_final_answer waits for both.
    if state.get("retrieval_plan", {}).get("search_gmail") and state.get("user_id"):
        sends.append(
            Send(
                "search_email",
                {
                    "question": state["question"],
                    "terms": [s.term for s in state["strategy"].searches],
                    "user_id": state["user_id"],
                    "org_id": state.get("org_id"),
                },
            )
        )
    return sends


async def search_email(state: EmailSearchState, config: RunnableConfig) -> dict:
    """Retrieve whole Gmail threads for the question (read-only, never stored)."""
    # Lazy import: keeps the api-layer dependency out of graph module load; the
    # node only runs when the planner enabled Gmail for this request.
    from api.gmail_service import format_email_findings, search_gmail
    from open_notebook.ai.retrieval_planner import plan_email_query

    try:
        # The planner decides the Gmail query and how many threads to pull:
        # "latest N emails" -> newest-first broad query with N threads; a
        # keyword ask -> filter by the strategy's search terms. This fixes
        # keyword-filtered queries returning far fewer emails than requested.
        email_plan = plan_email_query(state["question"], state.get("terms", []))
        threads = await search_gmail(
            state["user_id"],
            email_plan.query,
            max_threads=email_plan.max_threads,
            org_id=state.get("org_id"),
        )
        if not threads:
            return {"email_results": [], "answers": []}
        return {
            "email_results": threads,
            "answers": [format_email_findings(threads)],
        }
    except Exception as e:
        # Gmail must never break Ask — degrade to document-only.
        from loguru import logger

        logger.warning(f"search_email node degraded to empty result: {e}")
        return {"email_results": [], "answers": []}


async def provide_answer(state: SubGraphState, config: RunnableConfig) -> dict:
    try:
        payload = state
        # if state["type"] == "text":
        #     results = text_search(state["term"], 10, True, True)
        # else:
        results = await vector_search(
            state["term"], 10, True, True, org_id=state.get("org_id")
        )
        if len(results) == 0:
            return {"answers": []}
        await _attach_file_metadata(results)
        payload["results"] = results
        ids = [r["id"] for r in results]
        payload["ids"] = ids
        system_prompt = Prompter(prompt_template="ask/query_process").render(data=payload)  # type: ignore[arg-type]
        model = await provision_langchain_model(
            system_prompt,
            config.get("configurable", {}).get("answer_model"),
            "tools",
            max_tokens=2000,
        )
        ai_message = await model.ainvoke(system_prompt)
        ai_content = extract_text_content(ai_message.content)
        return {"answers": [clean_thinking_content(ai_content)]}
    except OpenNotebookError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


async def write_final_answer(state: ThreadState, config: RunnableConfig) -> dict:
    try:
        system_prompt = Prompter(prompt_template="ask/final_answer").render(data=state)  # type: ignore[arg-type]
        model = await provision_langchain_model(
            system_prompt,
            config.get("configurable", {}).get("final_answer_model"),
            "tools",
            max_tokens=2000,
        )
        ai_message = await model.ainvoke(system_prompt)
        final_content = extract_text_content(ai_message.content)
        return {"final_answer": clean_thinking_content(final_content)}
    except OpenNotebookError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


agent_state = StateGraph(ThreadState)
agent_state.add_node("agent", call_model_with_messages)
agent_state.add_node("provide_answer", provide_answer)
agent_state.add_node("search_email", search_email)
agent_state.add_node("write_final_answer", write_final_answer)
agent_state.add_edge(START, "agent")
agent_state.add_conditional_edges(
    "agent", trigger_queries, ["provide_answer", "search_email"]
)
agent_state.add_edge("provide_answer", "write_final_answer")
agent_state.add_edge("search_email", "write_final_answer")
agent_state.add_edge("write_final_answer", END)

graph = agent_state.compile()

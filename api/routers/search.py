import json
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from loguru import logger

from api import gmail_service
from api.models import AskRequest, AskResponse, SearchRequest, SearchResponse
from open_notebook.ai.models import Model, model_manager
from open_notebook.ai.retrieval_planner import RetrievalPlan, plan_retrieval
from open_notebook.domain.gmail import GmailConnection
from open_notebook.domain.notebook import text_search, vector_search
from open_notebook.exceptions import DatabaseOperationError, InvalidInputError
from open_notebook.graphs.ask import graph as ask_graph
from open_notebook.org_context import current_org_id

router = APIRouter()


@router.post("/search", response_model=SearchResponse)
async def search_knowledge_base(search_request: SearchRequest):
    """Search the knowledge base using text or vector search."""
    try:
        # Capture the active org here (request context) and pass it explicitly so
        # search stays scoped even if the contextvar doesn't propagate downstream.
        org_id = current_org_id()
        if search_request.type == "vector":
            # Check if embedding model is available for vector search
            if not await model_manager.get_embedding_model():
                raise HTTPException(
                    status_code=400,
                    detail="Vector search requires an embedding model. Please configure one in the Models section.",
                )

            results = await vector_search(
                keyword=search_request.query,
                results=search_request.limit,
                source=search_request.search_sources,
                note=search_request.search_notes,
                minimum_score=search_request.minimum_score,
                org_id=org_id,
            )
        else:
            # Text search
            results = await text_search(
                keyword=search_request.query,
                results=search_request.limit,
                source=search_request.search_sources,
                note=search_request.search_notes,
                org_id=org_id,
            )

        return SearchResponse(
            results=results or [],
            total_count=len(results) if results else 0,
            search_type=search_request.type,
        )

    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except DatabaseOperationError as e:
        logger.error(f"Database error during search: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during search: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


async def stream_ask_response(
    question: str,
    strategy_model: Model,
    answer_model: Model,
    final_answer_model: Model,
    org_id: str | None = None,
    user_id: str | None = None,
    retrieval_plan: Optional[RetrievalPlan] = None,
) -> AsyncGenerator[str, None]:
    """Stream the ask response as Server-Sent Events."""
    try:
        final_answer = None
        plan_dict = retrieval_plan.as_dict() if retrieval_plan else {}

        async for chunk in ask_graph.astream(
            input=dict(  # type: ignore[arg-type]
                question=question,
                org_id=org_id,
                user_id=user_id,
                retrieval_plan=plan_dict,
            ),
            config=dict(
                configurable=dict(
                    strategy_model=strategy_model.id,
                    answer_model=answer_model.id,
                    final_answer_model=final_answer_model.id,
                )
            ),
            stream_mode="updates",
        ):
            if "agent" in chunk:
                strategy_data = {
                    "type": "strategy",
                    "reasoning": chunk["agent"]["strategy"].reasoning,
                    "searches": [
                        {"term": search.term, "instructions": search.instructions}
                        for search in chunk["agent"]["strategy"].searches
                    ],
                }
                yield f"data: {json.dumps(strategy_data)}\n\n"

            elif "provide_answer" in chunk:
                for answer in chunk["provide_answer"]["answers"]:
                    answer_data = {"type": "answer", "content": answer}
                    yield f"data: {json.dumps(answer_data)}\n\n"

            elif "search_email" in chunk:
                email_threads = chunk["search_email"].get("email_results") or []
                if email_threads:
                    # Metadata only for the UI sources panel — no bodies.
                    email_data = {
                        "type": "email_results",
                        "items": [
                            {
                                "thread_id": t["thread_id"],
                                "subject": t["subject"],
                                "participants": t["participants"],
                                "message_count": t["message_count"],
                                "last_date": t.get("last_date"),
                                "snippet": t.get("snippet", ""),
                                "web_link": t["web_link"],
                            }
                            for t in email_threads
                        ],
                    }
                    yield f"data: {json.dumps(email_data)}\n\n"

            elif "write_final_answer" in chunk:
                final_answer = chunk["write_final_answer"]["final_answer"]
                final_data = {"type": "final_answer", "content": final_answer}
                yield f"data: {json.dumps(final_data)}\n\n"

        # Send completion signal
        completion_data = {"type": "complete", "final_answer": final_answer}
        yield f"data: {json.dumps(completion_data)}\n\n"

    except Exception as e:
        from open_notebook.utils.error_classifier import classify_error

        _, user_message = classify_error(e)
        logger.error(f"Error in ask streaming: {str(e)}")
        error_data = {"type": "error", "message": user_message}
        yield f"data: {json.dumps(error_data)}\n\n"


async def _resolve_retrieval_plan(
    request: Request, ask_request: AskRequest
) -> tuple[str | None, RetrievalPlan]:
    """Resolve the asking user and which stores this question should hit."""
    user = getattr(request.state, "user", None)
    user_id = user["id"] if user and user.get("id") else "default"
    gmail_connected = False
    if ask_request.retrieval_mode != "documents" and gmail_service.is_configured():
        try:
            gmail_connected = await GmailConnection.get_for_user(user_id) is not None
        except Exception as e:
            logger.warning(f"Gmail connection lookup failed (documents only): {e}")
    plan = plan_retrieval(
        ask_request.question, ask_request.retrieval_mode, gmail_connected
    )
    return user_id, plan


@router.post("/search/ask")
async def ask_knowledge_base(ask_request: AskRequest, request: Request):
    """Ask the knowledge base a question using AI models."""
    try:
        # Validate models exist
        strategy_model = await Model.get(ask_request.strategy_model)
        answer_model = await Model.get(ask_request.answer_model)
        final_answer_model = await Model.get(ask_request.final_answer_model)

        if not strategy_model:
            raise HTTPException(
                status_code=400,
                detail=f"Strategy model {ask_request.strategy_model} not found",
            )
        if not answer_model:
            raise HTTPException(
                status_code=400,
                detail=f"Answer model {ask_request.answer_model} not found",
            )
        if not final_answer_model:
            raise HTTPException(
                status_code=400,
                detail=f"Final answer model {ask_request.final_answer_model} not found",
            )

        # Check if embedding model is available
        if not await model_manager.get_embedding_model():
            raise HTTPException(
                status_code=400,
                detail="Ask feature requires an embedding model. Please configure one in the Models section.",
            )

        user_id, retrieval_plan = await _resolve_retrieval_plan(request, ask_request)

        # For streaming response
        return StreamingResponse(
            stream_ask_response(
                ask_request.question,
                strategy_model,
                answer_model,
                final_answer_model,
                org_id=current_org_id(),
                user_id=user_id,
                retrieval_plan=retrieval_plan,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in ask endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ask operation failed: {str(e)}")


@router.post("/search/ask/simple", response_model=AskResponse)
async def ask_knowledge_base_simple(ask_request: AskRequest):
    """Ask the knowledge base a question and return a simple response (non-streaming)."""
    try:
        # Validate models exist
        strategy_model = await Model.get(ask_request.strategy_model)
        answer_model = await Model.get(ask_request.answer_model)
        final_answer_model = await Model.get(ask_request.final_answer_model)

        if not strategy_model:
            raise HTTPException(
                status_code=400,
                detail=f"Strategy model {ask_request.strategy_model} not found",
            )
        if not answer_model:
            raise HTTPException(
                status_code=400,
                detail=f"Answer model {ask_request.answer_model} not found",
            )
        if not final_answer_model:
            raise HTTPException(
                status_code=400,
                detail=f"Final answer model {ask_request.final_answer_model} not found",
            )

        # Check if embedding model is available
        if not await model_manager.get_embedding_model():
            raise HTTPException(
                status_code=400,
                detail="Ask feature requires an embedding model. Please configure one in the Models section.",
            )

        # Run the ask graph and get final result
        final_answer = None
        async for chunk in ask_graph.astream(
            input=dict(question=ask_request.question, org_id=current_org_id()),  # type: ignore[arg-type]
            config=dict(
                configurable=dict(
                    strategy_model=strategy_model.id,
                    answer_model=answer_model.id,
                    final_answer_model=final_answer_model.id,
                )
            ),
            stream_mode="updates",
        ):
            if "write_final_answer" in chunk:
                final_answer = chunk["write_final_answer"]["final_answer"]

        if not final_answer:
            raise HTTPException(status_code=500, detail="No answer generated")

        return AskResponse(answer=final_answer, question=ask_request.question)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in ask simple endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ask operation failed: {str(e)}")

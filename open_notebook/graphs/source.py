import base64
import io
import mimetypes
import operator
from pathlib import Path
from typing import Any, Dict, List, Optional

from content_core import extract_content
from content_core.common import ProcessSourceState
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from loguru import logger
from PIL import Image
from typing_extensions import Annotated, TypedDict

from open_notebook.ai.models import Model, ModelManager
from open_notebook.ai.provision import provision_langchain_model
from open_notebook.domain.content_settings import ContentSettings
from open_notebook.domain.notebook import Asset, Source
from open_notebook.domain.transformation import Transformation
from open_notebook.exceptions import ConfigurationError
from open_notebook.graphs.transformation import graph as transform_graph
from open_notebook.utils.text_utils import extract_text_content

# Standalone image formats that content-core cannot process on its own
# (it only OCRs images embedded inside documents, e.g. scanned PDFs).
# These are routed through a vision-capable chat model instead. This list is
# intentionally broader than what any single vision provider accepts
# natively (e.g. Gemini rejects BMP/TIFF) — unsupported-but-common formats
# are normalized to PNG before being sent to the model.
IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/heic",
    "image/heif",
    "image/x-ms-bmp",
}

# MIME types most vision-capable chat models (OpenAI, Anthropic, Gemini)
# accept directly without re-encoding.
VISION_NATIVE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

IMAGE_VISION_PROMPT = (
    "Transcribe and describe this image for use as a searchable knowledge "
    "source. First, transcribe verbatim any text visible in the image "
    "(receipts, forms, labels, signage, handwriting, etc.), preserving "
    "structure like line breaks and tables where possible. Then, add a "
    "short factual description of any non-text visual content (people, "
    "objects, charts, scenes). Do not add commentary, opinions, or "
    "formatting beyond what's needed for readability. If the image "
    "contains no legible text, just describe its visual content factually."
)


def _detect_image_mime_type(file_path: str) -> Optional[str]:
    """Return the MIME type if file_path points to a standalone image, else None."""
    if not file_path:
        return None
    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type in IMAGE_MIME_TYPES:
        return mime_type
    return None


def _prepare_image_for_vision(image_bytes: bytes, mime_type: str) -> tuple[bytes, str]:
    """
    Return (bytes, mime_type) ready to send to a vision model.

    Formats not universally accepted by vision providers (BMP, TIFF, HEIC,
    etc.) are transcoded to PNG. Natively-supported formats pass through
    unchanged to avoid unnecessary re-encoding.
    """
    if mime_type in VISION_NATIVE_MIME_TYPES:
        return image_bytes, mime_type

    with Image.open(io.BytesIO(image_bytes)) as img:
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return buffer.getvalue(), "image/png"


async def extract_image_content(file_path: str, mime_type: str) -> str:
    """
    Extract text/description content from a standalone image using a
    vision-capable model, since content-core has no image processor.

    Uses the dedicated "vision" default model if configured (Settings →
    Models → Vision Model), so OCR/image extraction isn't locked to whatever
    model is used for chat. Falls back to the default chat model if no
    vision model is explicitly set. Either way, the chosen model must
    support multimodal (image) input.
    """
    path = Path(file_path)
    if not path.exists():
        raise ValueError(f"Image file not found: {file_path}")

    raw_bytes = path.read_bytes()
    try:
        image_bytes, send_mime_type = _prepare_image_for_vision(raw_bytes, mime_type)
    except Exception as e:
        raise ValueError(
            f"Could not read or convert image file ({mime_type}): {e}"
        ) from e

    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    try:
        model = await provision_langchain_model(
            IMAGE_VISION_PROMPT,
            None,
            "vision",
        )
    except ConfigurationError as e:
        raise ConfigurationError(
            "Image sources require a vision-capable model (e.g. GPT-4o, "
            "Gemini, Claude 3.5+). Configure one in Settings → Models → "
            f"Vision Model (or Chat Model as a fallback). ({e})"
        ) from e

    message = HumanMessage(
        content=[
            {"type": "text", "text": IMAGE_VISION_PROMPT},
            {
                "type": "image_url",
                "image_url": {"url": f"data:{send_mime_type};base64,{b64_image}"},
            },
        ]
    )

    try:
        response = await model.ainvoke([message])
    except Exception as e:
        raise ValueError(
            "Failed to extract content from image. The configured vision "
            f"model may not support image input. Error: {e}"
        ) from e

    content = extract_text_content(response.content)
    if not content or not content.strip():
        raise ValueError("Vision model returned no content for this image.")

    return content


class SourceState(TypedDict):
    content_state: ProcessSourceState
    apply_transformations: List[Transformation]
    source_id: str
    notebook_ids: List[str]
    source: Source
    transformation: Annotated[list, operator.add]
    embed: bool


class TransformationState(TypedDict):
    source: Source
    transformation: Transformation


async def content_process(state: SourceState) -> dict:
    content_settings = ContentSettings(
        default_content_processing_engine_doc="auto",
        default_content_processing_engine_url="auto",
        default_embedding_option="ask",
        auto_delete_files="yes",
        youtube_preferred_languages=[
            "en",
            "pt",
            "es",
            "de",
            "nl",
            "en-GB",
            "fr",
            "hi",
            "ja",
        ],
    )
    content_state: Dict[str, Any] = state["content_state"]  # type: ignore[assignment]

    content_state["url_engine"] = (
        content_settings.default_content_processing_engine_url or "auto"
    )
    content_state["document_engine"] = (
        content_settings.default_content_processing_engine_doc or "auto"
    )
    content_state["output_format"] = "markdown"

    # Add speech-to-text model configuration from Default Models
    try:
        model_manager = ModelManager()
        defaults = await model_manager.get_defaults()
        if defaults.default_speech_to_text_model:
            stt_model = await Model.get(defaults.default_speech_to_text_model)
            if stt_model:
                content_state["audio_provider"] = stt_model.provider
                content_state["audio_model"] = stt_model.name
                logger.debug(
                    f"Using speech-to-text model: {stt_model.provider}/{stt_model.name}"
                )
    except Exception as e:
        logger.warning(f"Failed to retrieve speech-to-text model configuration: {e}")
        # Continue without custom audio model (content-core will use its default)

    # content-core has no processor for standalone image files (it only OCRs
    # images embedded inside documents, e.g. scanned PDFs). Detect that case
    # and route through a vision-capable chat model instead, then feed the
    # resulting text back into the same downstream pipeline (chunking,
    # embedding, insights) as any other extracted content.
    image_mime_type = _detect_image_mime_type(content_state.get("file_path") or "")
    if image_mime_type:
        logger.info(
            f"Detected standalone image ({image_mime_type}); "
            "extracting content via vision model instead of content-core"
        )
        image_text = await extract_image_content(
            content_state["file_path"], image_mime_type
        )
        file_path = content_state.get("file_path") or ""
        processed_state = ProcessSourceState(
            file_path=file_path,
            url=content_state.get("url") or "",
            title=Path(file_path).name if file_path else "Image",
            content=image_text,
        )
        return {"content_state": processed_state}

    processed_state = await extract_content(content_state)

    # content-core signals a soft extraction failure (e.g. an unreachable or
    # invalid URL) by returning title="Error" and content prefixed with
    # "Failed to extract content:" instead of raising. Detect that sentinel and
    # raise so the job is marked failed and the source becomes retryable, rather
    # than being saved as a "completed" source whose body is the error string.
    if processed_state.title == "Error" and (processed_state.content or "").startswith(
        "Failed to extract content:"
    ):
        raise ValueError(
            "Could not extract content from this source. "
            "The URL or file may be unreachable, invalid, or in an unsupported format."
        )

    if not processed_state.content or not processed_state.content.strip():
        url = processed_state.url or ""
        if url and ("youtube.com" in url or "youtu.be" in url):
            raise ValueError(
                "Could not extract content from this YouTube video. "
                "No transcript or subtitles are available. "
                "Try configuring a Speech-to-Text model in Settings "
                "to transcribe the audio instead."
            )
        raise ValueError(
            "Could not extract any text content from this source. "
            "The content may be empty, inaccessible, or in an unsupported format."
        )

    return {"content_state": processed_state}


async def save_source(state: SourceState) -> dict:
    content_state = state["content_state"]

    # Get existing source using the provided source_id
    source = await Source.get(state["source_id"])
    if not source:
        raise ValueError(f"Source with ID {state['source_id']} not found")

    # Update the source with processed content
    source.asset = Asset(url=content_state.url, file_path=content_state.file_path)
    source.full_text = content_state.content

    # Preserve user-set title; only overwrite placeholder or empty titles
    if content_state.title and (not source.title or source.title == "Processing..."):
        source.title = content_state.title

    await source.save()

    # NOTE: Notebook associations are created by the API immediately for UI responsiveness
    # No need to create them here to avoid duplicate edges

    if state["embed"]:
        if source.full_text and source.full_text.strip():
            logger.debug("Embedding content for vector search")
            await source.vectorize()
        else:
            logger.warning(
                f"Source {source.id} has no text content to embed, skipping vectorization"
            )

    return {"source": source}


def trigger_transformations(state: SourceState, config: RunnableConfig) -> List[Send]:
    if len(state["apply_transformations"]) == 0:
        return []

    to_apply = state["apply_transformations"]
    logger.debug(f"Applying transformations {to_apply}")

    return [
        Send(
            "transform_content",
            {
                "source": state["source"],
                "transformation": t,
            },
        )
        for t in to_apply
    ]


async def transform_content(state: TransformationState) -> Optional[dict]:
    source = state["source"]
    content = source.full_text
    if not content:
        return None
    transformation: Transformation = state["transformation"]

    logger.debug(f"Applying transformation {transformation.name}")
    result = await transform_graph.ainvoke(
        dict(input_text=content, transformation=transformation)  # type: ignore[arg-type]
    )
    await source.add_insight(transformation.title, result["output"])
    return {
        "transformation": [
            {
                "output": result["output"],
                "transformation_name": transformation.name,
            }
        ]
    }


# Create and compile the workflow
workflow = StateGraph(SourceState)

# Add nodes
workflow.add_node("content_process", content_process)
workflow.add_node("save_source", save_source)
workflow.add_node("transform_content", transform_content)
# Define the graph edges
workflow.add_edge(START, "content_process")
workflow.add_edge("content_process", "save_source")
workflow.add_conditional_edges(
    "save_source", trigger_transformations, ["transform_content"]
)
workflow.add_edge("transform_content", END)

# Compile the graph
source_graph = workflow.compile()

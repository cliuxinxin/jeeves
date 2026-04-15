from fastapi import APIRouter, Query

from ..repositories.ai_logs import list_ai_logs
from ..schemas import AILogListResponse, AILogStatus

router = APIRouter(tags=["ai-logs"])


@router.get("/api/ai-logs", response_model=AILogListResponse)
async def get_ai_logs(
    conversation_id: int | None = None,
    request_id: str | None = Query(default=None, min_length=1),
    status: AILogStatus | None = None,
    node_name: str | None = Query(default=None, min_length=1),
    graph_config_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
) -> AILogListResponse:
    return AILogListResponse(
        items=list_ai_logs(
            conversation_id=conversation_id,
            request_id=request_id,
            status=status,
            node_name=node_name,
            graph_config_id=graph_config_id,
            limit=limit,
        )
    )

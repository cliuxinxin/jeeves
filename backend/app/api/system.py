from fastapi import APIRouter

from ..llm import resolve_llm_config
from ..schemas import HealthResponse

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    try:
        runtime_config = resolve_llm_config()
        return HealthResponse(
            status="ok",
            configured=True,
            source=runtime_config.source,
            config_name=runtime_config.name,
            model=runtime_config.model,
            max_retries=runtime_config.max_retries,
        )
    except RuntimeError:
        return HealthResponse(status="ok", configured=False)

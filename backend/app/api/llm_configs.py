import sqlite3

from fastapi import APIRouter, HTTPException, Request

from ..llm import invalidate_llm_caches, test_llm_config
from ..repositories.llm_configs import (
    LLMConfigNotFoundError,
    activate_llm_config,
    create_llm_config,
    delete_llm_config,
    list_llm_configs,
    update_llm_config,
)
from ..schemas import (
    LLMConfigCreateRequest,
    LLMConfigListResponse,
    LLMConfigRecord,
    LLMConfigTestRequest,
    LLMConfigTestResponse,
    LLMConfigUpdateRequest,
)
from ..telemetry import get_request_id, log_event

router = APIRouter(tags=["llm-configs"])


@router.get("/api/llm-configs", response_model=LLMConfigListResponse)
async def get_llm_configs() -> LLMConfigListResponse:
    items = list_llm_configs()
    active_config = next((item for item in items if item.is_active), None)
    return LLMConfigListResponse(
        items=items, active_config_id=active_config.id if active_config else None
    )


@router.post("/api/llm-configs", response_model=LLMConfigRecord, status_code=201)
async def create_llm_config_endpoint(
    request: Request, payload: LLMConfigCreateRequest
) -> LLMConfigRecord:
    try:
        record = create_llm_config(payload)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="A config with this name already exists."
        ) from exc

    invalidate_llm_caches()
    log_event(
        "audit_llm_config_created",
        request_id=get_request_id(request),
        config_id=record.id,
        name=record.name,
    )
    return record


@router.put("/api/llm-configs/{config_id}", response_model=LLMConfigRecord)
async def update_llm_config_endpoint(
    request: Request,
    config_id: int,
    payload: LLMConfigUpdateRequest,
) -> LLMConfigRecord:
    try:
        record = update_llm_config(config_id, payload)
    except LLMConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="A config with this name already exists."
        ) from exc

    invalidate_llm_caches()
    log_event(
        "audit_llm_config_updated",
        request_id=get_request_id(request),
        config_id=record.id,
        name=record.name,
    )
    return record


@router.post("/api/llm-configs/{config_id}/activate", response_model=LLMConfigRecord)
async def activate_llm_config_endpoint(request: Request, config_id: int) -> LLMConfigRecord:
    try:
        record = activate_llm_config(config_id)
    except LLMConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    invalidate_llm_caches()
    log_event(
        "audit_llm_config_activated",
        request_id=get_request_id(request),
        config_id=record.id,
        name=record.name,
    )
    return record


@router.delete("/api/llm-configs/{config_id}")
async def delete_llm_config_endpoint(request: Request, config_id: int) -> dict[str, bool]:
    try:
        delete_llm_config(config_id)
    except LLMConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    invalidate_llm_caches()
    log_event("audit_llm_config_deleted", request_id=get_request_id(request), config_id=config_id)
    return {"success": True}


@router.post("/api/llm-configs/test", response_model=LLMConfigTestResponse)
async def test_llm_config_endpoint(payload: LLMConfigTestRequest) -> LLMConfigTestResponse:
    try:
        preview = await test_llm_config(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Connection test failed: {exc}") from exc

    return LLMConfigTestResponse(
        success=True, message="Connection test succeeded.", response_preview=preview
    )

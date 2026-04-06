import sqlite3

from fastapi import APIRouter, HTTPException, Request

from ..graph import invalidate_graph_cache
from ..repositories.graph_configs import (
    GraphConfigNotFoundError,
    activate_graph_config,
    create_graph_config,
    delete_graph_config,
    list_graph_configs,
    update_graph_config,
)
from ..schemas import (
    GraphConfigCreateRequest,
    GraphConfigListResponse,
    GraphConfigRecord,
    GraphConfigUpdateRequest,
)
from ..telemetry import get_request_id, log_event

router = APIRouter(tags=["graph-configs"])


@router.get("/api/graph-configs", response_model=GraphConfigListResponse)
async def get_graph_configs() -> GraphConfigListResponse:
    items = list_graph_configs()
    active_config = next((item for item in items if item.is_active), None)
    return GraphConfigListResponse(
        items=items, active_config_id=active_config.id if active_config else None
    )


@router.post("/api/graph-configs", response_model=GraphConfigRecord, status_code=201)
async def create_graph_config_endpoint(
    request: Request, payload: GraphConfigCreateRequest
) -> GraphConfigRecord:
    try:
        record = create_graph_config(payload)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="A graph config with this name already exists."
        ) from exc

    invalidate_graph_cache()
    log_event(
        "audit_graph_config_created",
        request_id=get_request_id(request),
        config_id=record.id,
        name=record.name,
    )
    return record


@router.put("/api/graph-configs/{config_id}", response_model=GraphConfigRecord)
async def update_graph_config_endpoint(
    request: Request,
    config_id: int,
    payload: GraphConfigUpdateRequest,
) -> GraphConfigRecord:
    try:
        record = update_graph_config(config_id, payload)
    except GraphConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="A graph config with this name already exists."
        ) from exc

    invalidate_graph_cache()
    log_event(
        "audit_graph_config_updated",
        request_id=get_request_id(request),
        config_id=record.id,
        name=record.name,
    )
    return record


@router.post("/api/graph-configs/{config_id}/activate", response_model=GraphConfigRecord)
async def activate_graph_config_endpoint(request: Request, config_id: int) -> GraphConfigRecord:
    try:
        record = activate_graph_config(config_id)
    except GraphConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    invalidate_graph_cache()
    log_event(
        "audit_graph_config_activated",
        request_id=get_request_id(request),
        config_id=record.id,
        name=record.name,
    )
    return record


@router.delete("/api/graph-configs/{config_id}", status_code=204)
async def delete_graph_config_endpoint(request: Request, config_id: int) -> None:
    try:
        delete_graph_config(config_id)
    except GraphConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    invalidate_graph_cache()
    log_event("audit_graph_config_deleted", request_id=get_request_id(request), config_id=config_id)

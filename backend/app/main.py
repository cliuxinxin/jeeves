from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.chat import router as chat_router
from .api.conversations import router as conversations_router
from .api.graph_configs import router as graph_configs_router
from .api.llm_configs import router as llm_configs_router
from .api.system import router as system_router
from .config import get_settings
from .database import init_db
from .telemetry import log_request_lifecycle


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.2.0",
        description="Jeeves assistant backend with FastAPI, LangGraph, typed config APIs, and SSE chat.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(log_request_lifecycle)

    @app.get("/", tags=["system"])
    async def root() -> dict[str, str]:
        return {"message": "Jeeves backend is running."}

    app.include_router(system_router)
    app.include_router(llm_configs_router)
    app.include_router(graph_configs_router)
    app.include_router(conversations_router)
    app.include_router(chat_router)
    return app


app = create_app()

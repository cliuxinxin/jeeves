from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture()
def anonymous_client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    from app.config import get_settings
    from app.graph import invalidate_graph_cache
    from app.llm import invalidate_llm_caches
    from app.main import create_app

    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("OPENAI_BASE_URL", "")

    get_settings.cache_clear()
    invalidate_graph_cache()
    invalidate_llm_caches()

    with TestClient(create_app()) as test_client:
        yield test_client

    get_settings.cache_clear()
    invalidate_graph_cache()
    invalidate_llm_caches()


@pytest.fixture()
def client(anonymous_client: TestClient) -> Iterator[TestClient]:
    response = anonymous_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert response.status_code == 200
    yield anonymous_client

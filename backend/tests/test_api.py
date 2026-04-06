from __future__ import annotations

from collections.abc import AsyncIterator

from langchain_core.messages import AIMessageChunk


def test_health_reports_unconfigured_when_no_active_llm(client) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "configured": False,
        "source": None,
        "config_name": None,
        "model": None,
        "max_retries": None,
    }


def test_conversation_lifecycle(client) -> None:
    created = client.post("/api/conversations")
    conversation_id = created.json()["id"]

    detail = client.get(f"/api/conversations/{conversation_id}")
    listing = client.get("/api/conversations")
    deleted = client.delete(f"/api/conversations/{conversation_id}")

    assert created.status_code == 201
    assert detail.status_code == 200
    assert listing.status_code == 200
    assert deleted.status_code == 200
    assert any(item["id"] == conversation_id for item in listing.json()["items"])


def test_llm_config_crud(client) -> None:
    created = client.post(
        "/api/llm-configs",
        json={
            "name": "Primary",
            "api_key": "sk-test-12345678",
            "model": "gpt-4o-mini",
            "base_url": None,
            "temperature": 0.2,
            "max_retries": 2,
        },
    )
    config_id = created.json()["id"]

    updated = client.put(
        f"/api/llm-configs/{config_id}",
        json={
            "name": "Primary Updated",
            "model": "gpt-4o-mini",
            "base_url": "https://example.com/v1",
            "temperature": 0.4,
            "max_retries": 3,
        },
    )
    listed = client.get("/api/llm-configs")

    assert created.status_code == 201
    assert updated.status_code == 200
    assert listed.status_code == 200
    assert updated.json()["name"] == "Primary Updated"
    assert updated.json()["api_key_masked"].startswith("sk-t")
    assert listed.json()["active_config_id"] == config_id


def test_graph_config_crud(client) -> None:
    created = client.post(
        "/api/graph-configs",
        json={
            "name": "Summary",
            "graph_type": "summary_analysis",
            "system_prompt": "",
            "analyzer_prompt": "analyzer",
            "deconstructor_prompt": "deconstructor",
        },
    )
    config_id = created.json()["id"]

    updated = client.put(
        f"/api/graph-configs/{config_id}",
        json={
            "name": "Summary v2",
            "graph_type": "simple_chat",
            "system_prompt": "system",
            "analyzer_prompt": "",
            "deconstructor_prompt": "",
        },
    )
    listed = client.get("/api/graph-configs")

    assert created.status_code == 201
    assert updated.status_code == 200
    assert listed.status_code == 200
    assert updated.json()["graph_type"] == "simple_chat"
    assert listed.json()["active_config_id"] == config_id


def test_chat_stream_emits_user_message_and_final_assistant_messages(client, monkeypatch) -> None:
    conversation = client.post("/api/conversations").json()

    class FakeGraph:
        async def astream(
            self, *_args, **_kwargs
        ) -> AsyncIterator[tuple[AIMessageChunk, dict[str, str]]]:
            yield AIMessageChunk(content="Hello"), {"langgraph_node": "assistant"}
            yield AIMessageChunk(content=" world"), {"langgraph_node": "assistant"}

    async def noop_generate_title(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr("app.services.chat_service.get_graph", lambda: FakeGraph())
    monkeypatch.setattr(
        "app.services.chat_service._generate_conversation_title", noop_generate_title
    )

    with client.stream(
        "POST",
        "/api/chat/stream",
        json={"conversation_id": conversation["id"], "message": "Hi there"},
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: user_message" in body
    assert "event: chunk" in body
    assert '"text": "Hello"' in body
    assert "event: done" in body
    assert '"content": "Hello world"' in body

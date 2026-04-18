from __future__ import annotations

import asyncio
import json
import sqlite3
from collections.abc import AsyncIterator

from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, SystemMessage

from app.prompt_defaults import DEFAULT_ANALYZER_PROMPT, DEFAULT_ARTICLE_VALUE_ROUTER_PROMPT
from app.schemas import GraphConfigRecord, GraphType


def test_auth_session_reports_anonymous_before_login(anonymous_client) -> None:
    response = anonymous_client.get("/api/auth/session")

    assert response.status_code == 200
    assert response.json() == {"authenticated": False, "username": None}


def test_auth_login_logout_flow(anonymous_client) -> None:
    failed_login = anonymous_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "wrong-password"},
    )
    assert failed_login.status_code == 401

    login = anonymous_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    session = anonymous_client.get("/api/auth/session")
    logout = anonymous_client.post("/api/auth/logout")

    assert login.status_code == 200
    assert login.json() == {"authenticated": True, "username": "admin"}
    assert session.status_code == 200
    assert session.json() == {"authenticated": True, "username": "admin"}
    assert logout.status_code == 200
    assert logout.json() == {"authenticated": False, "username": None}


def test_protected_route_requires_login(anonymous_client) -> None:
    response = anonymous_client.get("/api/conversations")

    assert response.status_code == 401
    assert response.json()["detail"] == "请先登录。"


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
    workflow = client.post(
        "/api/graph-configs",
        json={
            "name": "Default Workflow",
            "graph_type": "simple_chat",
            "system_prompt": "system",
            "analyzer_prompt": "",
            "deconstructor_prompt": "",
        },
    ).json()

    created = client.post(
        "/api/conversations",
        json={"title": "First chat", "graph_config_id": workflow["id"]},
    )
    conversation_id = created.json()["id"]

    detail = client.get(f"/api/conversations/{conversation_id}")
    listing = client.get("/api/conversations")
    updated = client.patch(
        f"/api/conversations/{conversation_id}",
        json={"graph_config_id": workflow["id"]},
    )
    deleted = client.delete(f"/api/conversations/{conversation_id}")

    assert created.status_code == 201
    assert detail.status_code == 200
    assert listing.status_code == 200
    assert updated.status_code == 200
    assert deleted.status_code == 200
    assert detail.json()["conversation"]["graph_config_id"] == workflow["id"]
    assert detail.json()["conversation"]["graph_config_name"] == "Default Workflow"
    assert any(item["id"] == conversation_id for item in listing.json()["items"])


def test_create_conversation_returns_503_when_database_is_locked(client, monkeypatch) -> None:
    def locked_create_conversation(*args, **kwargs):
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(
        "app.api.conversations.create_conversation",
        locked_create_conversation,
    )

    response = client.post("/api/conversations", json={"title": "Busy chat"})

    assert response.status_code == 503
    assert response.json()["detail"] == "数据库正忙，请稍后重试。"


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
            "name": "Tweet Workflow",
            "graph_type": "viral_tweet",
            "system_prompt": "",
            "analyzer_prompt": "strategist",
            "deconstructor_prompt": "writer",
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
    assert created.json()["graph_type"] == "viral_tweet"
    assert updated.json()["graph_type"] == "simple_chat"
    assert listed.json()["active_config_id"] == config_id


def test_graph_config_preview_returns_effective_node_prompts(client) -> None:
    response = client.post(
        "/api/graph-configs/preview",
        json={
            "graph_type": "summary_analysis",
            "system_prompt": "",
            "analyzer_prompt": "请先判断类型。",
            "deconstructor_prompt": "请按 {article_type} 的方式拆解。",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert [item["node"] for item in payload["items"]] == ["analyzer", "deconstructor"]
    assert [slot["name"] for slot in payload["state_slots"]] == [
        "messages",
        "article_type",
        "classification_reason",
        "final_output",
    ]
    assert [field["key"] for field in payload["prompt_fields"]] == [
        "analyzer_prompt",
        "deconstructor_prompt",
    ]
    assert payload["items"][0]["prompt_preview"] == "请先判断类型。"
    assert payload["items"][0]["prompt_source"] == "analyzer_prompt"
    assert payload["items"][1]["prompt_source"] == "deconstructor_prompt"
    assert "请按 {{article_type}} 的方式拆解。" in payload["items"][1]["prompt_preview"]
    assert "二阶段路由信息" in payload["items"][1]["prompt_preview"]
    assert "输出排版要求" in payload["items"][1]["prompt_preview"]


def test_graph_config_create_and_preview_accept_prompt_values_map(client) -> None:
    created = client.post(
        "/api/graph-configs",
        json={
            "name": "Prompt Values Workflow",
            "graph_type": "summary_analysis",
            "prompt_values": {
                "analyzer_prompt": "先分类。",
                "deconstructor_prompt": "再按 {article_type} 拆解。",
            },
        },
    )

    assert created.status_code == 201
    payload = created.json()
    assert payload["prompt_values"] == {
        "analyzer_prompt": "先分类。",
        "deconstructor_prompt": "再按 {article_type} 拆解。",
    }
    assert payload["analyzer_prompt"] == "先分类。"
    assert payload["deconstructor_prompt"] == "再按 {article_type} 拆解。"

    preview = client.post(
        "/api/graph-configs/preview",
        json={
            "graph_type": "summary_analysis",
            "prompt_values": payload["prompt_values"],
        },
    )

    assert preview.status_code == 200
    preview_payload = preview.json()
    assert preview_payload["items"][0]["prompt_preview"] == "先分类。"
    assert "再按 {{article_type}} 拆解。" in preview_payload["items"][1]["prompt_preview"]


def test_article_value_preview_returns_dynamic_card_flow(client) -> None:
    response = client.post(
        "/api/graph-configs/preview",
        json={
            "graph_type": "article_value",
            "analyzer_prompt": "请先判断这篇文章最值得拿走的价值路由。",
            "deconstructor_prompt": "请输出动态洞察卡片，不要固定总结格式。",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert [item["node"] for item in payload["items"]] == ["value_router", "card_writer"]
    assert [slot["name"] for slot in payload["state_slots"]] == [
        "messages",
        "value_routes",
        "route_reason",
        "final_output",
    ]
    assert [field["key"] for field in payload["prompt_fields"]] == [
        "analyzer_prompt",
        "deconstructor_prompt",
    ]
    assert payload["items"][0]["prompt_source"] == "analyzer_prompt"
    assert payload["items"][1]["prompt_source"] == "deconstructor_prompt"
    assert payload["items"][0]["prompt_preview"] == "请先判断这篇文章最值得拿走的价值路由。"
    assert "价值路由信息" in payload["items"][1]["prompt_preview"]
    assert "动态洞察卡片" in payload["items"][1]["prompt_preview"]


def test_summary_analysis_preview_preserves_legacy_system_prompt_fallback(client) -> None:
    created = client.post(
        "/api/graph-configs",
        json={
            "name": "Legacy Summary Workflow",
            "graph_type": "summary_analysis",
            "system_prompt": "请按 {article_type} 做专业拆解。",
            "analyzer_prompt": "",
            "deconstructor_prompt": "",
        },
    )

    assert created.status_code == 201
    payload = created.json()
    assert payload["system_prompt"] == "请按 {article_type} 做专业拆解。"
    assert payload["prompt_values"] == {
        "analyzer_prompt": DEFAULT_ANALYZER_PROMPT,
        "deconstructor_prompt": "请按 {article_type} 做专业拆解。",
    }

    preview = client.post(
        "/api/graph-configs/preview",
        json={
            "graph_type": "summary_analysis",
            "system_prompt": "请按 {article_type} 做专业拆解。",
        },
    )

    assert preview.status_code == 200
    preview_payload = preview.json()
    assert preview_payload["items"][0]["prompt_preview"] == DEFAULT_ANALYZER_PROMPT
    assert "请按 {{article_type}} 做专业拆解。" in preview_payload["items"][1]["prompt_preview"]


def test_article_value_uses_registered_prompt_defaults() -> None:
    from app.graphs.registry import resolve_graph_settings

    graph_type, prompt_values = resolve_graph_settings(
        GraphConfigRecord(
            id=1,
            name="Article Value Workflow",
            graph_type=GraphType.ARTICLE_VALUE,
            system_prompt="",
            analyzer_prompt="",
            deconstructor_prompt="",
            is_active=True,
            created_at="2026-04-11T00:00:00",
            updated_at="2026-04-11T00:00:00",
        )
    )

    assert graph_type == GraphType.ARTICLE_VALUE
    assert prompt_values["analyzer_prompt"] == DEFAULT_ARTICLE_VALUE_ROUTER_PROMPT
    assert "洞察卡片" in prompt_values["deconstructor_prompt"]


def test_resolve_graph_settings_uses_registered_prompt_defaults() -> None:
    from app.graphs.registry import resolve_graph_settings

    graph_type, prompt_values = resolve_graph_settings(
        GraphConfigRecord(
            id=1,
            name="Summary Workflow",
            graph_type=GraphType.SUMMARY_ANALYSIS,
            system_prompt="请做专业拆解。",
            analyzer_prompt="",
            deconstructor_prompt="",
            is_active=True,
            created_at="2026-04-11T00:00:00",
            updated_at="2026-04-11T00:00:00",
        )
    )

    assert graph_type == GraphType.SUMMARY_ANALYSIS
    assert prompt_values == {
        "analyzer_prompt": DEFAULT_ANALYZER_PROMPT,
        "deconstructor_prompt": "请做专业拆解。",
    }


def test_init_db_migrates_existing_graph_config_prompt_values(tmp_path, monkeypatch) -> None:
    from app.config import get_settings
    from app.database import init_db

    database_path = tmp_path / "legacy.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE graph_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                graph_type TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                analyzer_prompt TEXT NOT NULL DEFAULT '',
                deconstructor_prompt TEXT NOT NULL DEFAULT '',
                is_active INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            INSERT INTO graph_configs (name, graph_type, system_prompt, analyzer_prompt, deconstructor_prompt, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "Legacy Summary Workflow",
                "summary_analysis",
                "请按 {article_type} 做专业拆解。",
                "",
                "",
                1,
            ),
        )

    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    get_settings.cache_clear()

    try:
        init_db()
    finally:
        get_settings.cache_clear()

    with sqlite3.connect(database_path) as connection:
        row = connection.execute(
            """
            SELECT system_prompt, analyzer_prompt, deconstructor_prompt, prompt_values_json
            FROM graph_configs
            WHERE name = ?
            """,
            ("Legacy Summary Workflow",),
        ).fetchone()

    assert row is not None
    assert row[0] == "请按 {article_type} 做专业拆解。"
    assert row[1] == DEFAULT_ANALYZER_PROMPT
    assert row[2] == "请按 {article_type} 做专业拆解。"
    assert json.loads(row[3]) == {
        "analyzer_prompt": DEFAULT_ANALYZER_PROMPT,
        "deconstructor_prompt": "请按 {article_type} 做专业拆解。",
    }


def test_chat_stream_emits_user_message_and_final_assistant_messages(client, monkeypatch) -> None:
    conversation = client.post("/api/conversations").json()

    class FakeGraph:
        async def astream(
            self, *_args, **_kwargs
        ) -> AsyncIterator[tuple[AIMessageChunk, dict[str, str]]]:
            yield AIMessageChunk(content="策略"), {"langgraph_node": "strategist"}
            yield AIMessageChunk(content="主推文"), {"langgraph_node": "writer"}

    async def noop_generate_title(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr("app.services.chat_service.get_graph", lambda *_args: FakeGraph())
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
    assert '"node": "strategist"' in body
    assert "event: done" in body
    assert '"content": "策略"' in body
    assert '"content": "主推文"' in body


def test_chat_stream_timeout_returns_partial_results(client, monkeypatch) -> None:
    conversation = client.post("/api/conversations").json()

    class SlowGraph:
        async def astream(
            self, *_args, **_kwargs
        ) -> AsyncIterator[tuple[AIMessageChunk, dict[str, str]]]:
            yield AIMessageChunk(content="已生成开头"), {"langgraph_node": "writer"}
            raise TimeoutError()

    async def noop_generate_title(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr("app.services.chat_service.get_graph", lambda *_args: SlowGraph())
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
    assert "event: done" in body
    assert "event: error" not in body
    assert "已生成开头" in body


def test_conversations_can_use_different_workflows(client) -> None:
    summary_workflow = client.post(
        "/api/graph-configs",
        json={
            "name": "Summary Workflow",
            "graph_type": "summary_analysis",
            "system_prompt": "",
            "analyzer_prompt": "analyzer",
            "deconstructor_prompt": "deconstructor",
        },
    ).json()
    tweet_workflow = client.post(
        "/api/graph-configs",
        json={
            "name": "Tweet Workflow",
            "graph_type": "viral_tweet",
            "system_prompt": "",
            "analyzer_prompt": "strategist",
            "deconstructor_prompt": "writer",
        },
    ).json()

    first = client.post(
        "/api/conversations", json={"graph_config_id": summary_workflow["id"]}
    ).json()
    second = client.post(
        "/api/conversations", json={"graph_config_id": tweet_workflow["id"]}
    ).json()

    first_detail = client.get(f"/api/conversations/{first['id']}").json()
    second_detail = client.get(f"/api/conversations/{second['id']}").json()

    assert first_detail["conversation"]["graph_config_id"] == summary_workflow["id"]
    assert first_detail["conversation"]["graph_config_name"] == "Summary Workflow"
    assert second_detail["conversation"]["graph_config_id"] == tweet_workflow["id"]
    assert second_detail["conversation"]["graph_config_name"] == "Tweet Workflow"


def test_init_db_migrates_existing_conversations_without_graph_config_id(
    monkeypatch, tmp_path
) -> None:
    database_path = tmp_path / "legacy.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT 'New chat',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE graph_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                graph_type TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

    monkeypatch.setenv("DATABASE_PATH", str(database_path))

    from app.config import get_settings
    from app.database import init_db

    get_settings.cache_clear()
    init_db()

    with sqlite3.connect(database_path) as connection:
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(conversations)").fetchall()
        }
        indexes = {
            row[1] for row in connection.execute("PRAGMA index_list(conversations)").fetchall()
        }

    assert "graph_config_id" in columns
    assert "idx_conversations_graph_config_id" in indexes


def test_ai_logs_endpoint_returns_llm_inputs_and_outputs(client) -> None:
    from app.ai_logging import ai_log_scope
    from app.llm import RetryingChatModel

    class FakeInnerModel:
        async def ainvoke(self, *_args, **_kwargs):
            return AIMessage(content="这是模型返回的内容")

    model = RetryingChatModel(
        FakeInnerModel(),
        max_retries=0,
        config_name="Primary LLM",
        model="gpt-test",
        source="database",
    )

    async def run_logged_call() -> None:
        with ai_log_scope(
            request_id="req-debug-1",
            conversation_id=42,
            conversation_title="调试会话",
            graph_config_id=7,
            graph_config_name="爆款推文",
            node_name="writer",
            operation="graph_node",
        ):
            await model.ainvoke(
                [
                    SystemMessage(content="你是一个写作助手"),
                    HumanMessage(content="请帮我生成推文"),
                ]
            )

    asyncio.run(run_logged_call())

    response = client.get("/api/ai-logs", params={"request_id": "req-debug-1"})

    assert response.status_code == 200
    payload = response.json()["items"]
    assert len(payload) == 1
    assert payload[0]["request_id"] == "req-debug-1"
    assert payload[0]["node_name"] == "writer"
    assert payload[0]["graph_config_name"] == "爆款推文"
    assert payload[0]["input_messages"][0]["content"] == "你是一个写作助手"
    assert payload[0]["input_messages"][1]["content"] == "请帮我生成推文"
    assert payload[0]["response_text"] == "这是模型返回的内容"

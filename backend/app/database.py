import sqlite3
from contextlib import contextmanager
from json import dumps, loads
from pathlib import Path
from typing import Iterator

from .config import get_settings
from .graph_prompt_values import resolve_prompt_values
from .schemas import GraphType

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SQLITE_BUSY_TIMEOUT_MS = 5_000
SQLITE_BUSY_TIMEOUT_SECONDS = SQLITE_BUSY_TIMEOUT_MS / 1_000


def get_database_path() -> Path:
    raw_path = Path(get_settings().database_path)
    return raw_path if raw_path.is_absolute() else BACKEND_ROOT / raw_path


def init_db() -> None:
    database_path = get_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(database_path) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                api_key TEXT NOT NULL,
                model TEXT NOT NULL,
                base_url TEXT,
                temperature REAL NOT NULL DEFAULT 0.2,
                max_retries INTEGER NOT NULL DEFAULT 2,
                is_active INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT 'New chat',
                graph_config_id INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (graph_config_id) REFERENCES graph_configs(id) ON DELETE SET NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                node_name TEXT,
                node_label TEXT,
                state_patch TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS graph_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                graph_type TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                analyzer_prompt TEXT NOT NULL DEFAULT '',
                deconstructor_prompt TEXT NOT NULL DEFAULT '',
                prompt_values_json TEXT NOT NULL DEFAULT '{}',
                is_active INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL DEFAULT '',
                conversation_id INTEGER,
                conversation_title TEXT,
                graph_config_id INTEGER,
                graph_config_name TEXT,
                node_name TEXT,
                operation TEXT,
                llm_source TEXT,
                llm_config_name TEXT,
                model TEXT,
                status TEXT NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 1,
                duration_ms REAL NOT NULL DEFAULT 0,
                input_messages TEXT NOT NULL DEFAULT '[]',
                response_text TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS liked_cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                graph_config_id INTEGER,
                graph_config_name TEXT,
                graph_type TEXT,
                source_message_id INTEGER NOT NULL,
                source_request_id TEXT,
                source_node_name TEXT,
                source_node_label TEXT,
                source_state_patch TEXT NOT NULL DEFAULT '{}',
                card_index INTEGER NOT NULL,
                route_label TEXT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                workflow_snapshot TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(source_message_id, card_index),
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (source_message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id
            ON conversation_messages (conversation_id)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
            ON conversations (updated_at DESC)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_llm_configs_is_active
            ON llm_configs (is_active, updated_at DESC)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_graph_configs_is_active
            ON graph_configs (is_active, updated_at DESC)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at
            ON ai_logs (created_at DESC, id DESC)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_ai_logs_conversation_id
            ON ai_logs (conversation_id, created_at DESC)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_ai_logs_request_id
            ON ai_logs (request_id, created_at DESC)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_liked_cards_created_at
            ON liked_cards (created_at DESC, id DESC)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_liked_cards_conversation_id
            ON liked_cards (conversation_id, created_at DESC)
            """
        )

        # Lightweight migrations for existing databases.
        cols = {row[1] for row in connection.execute("PRAGMA table_info(graph_configs)").fetchall()}
        if "analyzer_prompt" not in cols:
            connection.execute(
                "ALTER TABLE graph_configs ADD COLUMN analyzer_prompt TEXT NOT NULL DEFAULT ''"
            )
        if "deconstructor_prompt" not in cols:
            connection.execute(
                "ALTER TABLE graph_configs ADD COLUMN deconstructor_prompt TEXT NOT NULL DEFAULT ''"
            )
        if "prompt_values_json" not in cols:
            connection.execute(
                "ALTER TABLE graph_configs ADD COLUMN prompt_values_json TEXT NOT NULL DEFAULT '{}'"
            )

        conversation_cols = {
            row[1] for row in connection.execute("PRAGMA table_info(conversations)").fetchall()
        }
        if "graph_config_id" not in conversation_cols:
            connection.execute("ALTER TABLE conversations ADD COLUMN graph_config_id INTEGER")

        conversation_message_cols = {
            row[1]
            for row in connection.execute("PRAGMA table_info(conversation_messages)").fetchall()
        }
        if "node_name" not in conversation_message_cols:
            connection.execute("ALTER TABLE conversation_messages ADD COLUMN node_name TEXT")
        if "node_label" not in conversation_message_cols:
            connection.execute("ALTER TABLE conversation_messages ADD COLUMN node_label TEXT")
        if "state_patch" not in conversation_message_cols:
            connection.execute(
                "ALTER TABLE conversation_messages ADD COLUMN state_patch TEXT NOT NULL DEFAULT '{}'"
            )
            connection.execute(
                "UPDATE conversation_messages SET state_patch = ? WHERE state_patch IS NULL",
                (dumps({}, ensure_ascii=False),),
            )

        liked_card_cols = {
            row[1] for row in connection.execute("PRAGMA table_info(liked_cards)").fetchall()
        }
        if "graph_config_id" not in liked_card_cols:
            connection.execute("ALTER TABLE liked_cards ADD COLUMN graph_config_id INTEGER")
        if "graph_config_name" not in liked_card_cols:
            connection.execute("ALTER TABLE liked_cards ADD COLUMN graph_config_name TEXT")
        if "graph_type" not in liked_card_cols:
            connection.execute("ALTER TABLE liked_cards ADD COLUMN graph_type TEXT")
        if "source_node_name" not in liked_card_cols:
            connection.execute("ALTER TABLE liked_cards ADD COLUMN source_node_name TEXT")
        if "source_request_id" not in liked_card_cols:
            connection.execute("ALTER TABLE liked_cards ADD COLUMN source_request_id TEXT")
        if "source_node_label" not in liked_card_cols:
            connection.execute("ALTER TABLE liked_cards ADD COLUMN source_node_label TEXT")
        if "source_state_patch" not in liked_card_cols:
            connection.execute(
                "ALTER TABLE liked_cards ADD COLUMN source_state_patch TEXT NOT NULL DEFAULT '{}'"
            )
        if "workflow_snapshot" not in liked_card_cols:
            connection.execute(
                "ALTER TABLE liked_cards ADD COLUMN workflow_snapshot TEXT NOT NULL DEFAULT '{}'"
            )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversations_graph_config_id
            ON conversations (graph_config_id)
            """
        )

        # Backfill prompts for existing rows so the UI shows something immediately.
        # - summary_analysis previously used system_prompt as the main analysis prompt.
        # - analyzer prompt did not exist before; provide a sensible default if empty.
        connection.execute(
            """
            UPDATE graph_configs
            SET deconstructor_prompt = system_prompt
            WHERE graph_type = 'summary_analysis'
              AND (deconstructor_prompt IS NULL OR deconstructor_prompt = '')
              AND system_prompt IS NOT NULL
              AND system_prompt != ''
            """
        )
        connection.execute(
            """
            UPDATE graph_configs
            SET analyzer_prompt = '你是一个专业的文本分类器。请阅读用户输入，判定文章类型，并在结尾严格输出：【文章类型：XXX】。'
            WHERE graph_type = 'summary_analysis'
              AND (analyzer_prompt IS NULL OR analyzer_prompt = '')
            """
        )

        for row in connection.execute(
            """
            SELECT id, graph_type, system_prompt, analyzer_prompt, deconstructor_prompt, prompt_values_json
            FROM graph_configs
            """
        ).fetchall():
            raw_prompt_values: dict[str, str] = {}
            prompt_values_json = (
                row["prompt_values_json"] if "prompt_values_json" in row.keys() else "{}"
            )
            if isinstance(prompt_values_json, str) and prompt_values_json.strip():
                try:
                    loaded = loads(prompt_values_json)
                except ValueError:
                    loaded = {}
                if isinstance(loaded, dict):
                    raw_prompt_values = {
                        str(key): str(value)
                        for key, value in loaded.items()
                        if isinstance(key, str) and isinstance(value, str)
                    }

            try:
                graph_type = GraphType(row["graph_type"])
            except ValueError:
                continue

            normalized_prompt_values = resolve_prompt_values(
                graph_type=graph_type,
                prompt_values=raw_prompt_values,
                system_prompt=row["system_prompt"] or "",
                analyzer_prompt=row["analyzer_prompt"] or "",
                deconstructor_prompt=row["deconstructor_prompt"] or "",
            )
            connection.execute(
                "UPDATE graph_configs SET prompt_values_json = ? WHERE id = ?",
                (
                    dumps(normalized_prompt_values, ensure_ascii=False, sort_keys=True),
                    row["id"],
                ),
            )
        connection.execute(
            """
            UPDATE conversations
            SET graph_config_id = (
                SELECT id
                FROM graph_configs
                WHERE is_active = 1
                ORDER BY updated_at DESC, id DESC
                LIMIT 1
            )
            WHERE graph_config_id IS NULL
              AND EXISTS (SELECT 1 FROM graph_configs WHERE is_active = 1)
            """
        )


def is_sqlite_lock_error(error: BaseException) -> bool:
    return (
        isinstance(error, sqlite3.OperationalError) and "database is locked" in str(error).lower()
    )


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    database_path = get_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(
        database_path,
        timeout=SQLITE_BUSY_TIMEOUT_SECONDS,
    )
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT_MS}")

    try:
        yield connection
        connection.commit()
    finally:
        connection.close()

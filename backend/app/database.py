import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import get_settings

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def get_database_path() -> Path:
    raw_path = Path(get_settings().database_path)
    return raw_path if raw_path.is_absolute() else BACKEND_ROOT / raw_path


def init_db() -> None:
    database_path = get_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(database_path) as connection:
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
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
                is_active INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    database_path = get_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")

    try:
        yield connection
        connection.commit()
    finally:
        connection.close()

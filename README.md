# Jeeves

一个最小化但可扩展的全栈 LangGraph AI 助手原型：

- `backend/`: Python `FastAPI + LangGraph`
- `frontend/`: `Next.js + Tailwind + Shadcn 风格组件`

## 架构

前端负责展示与交互，后端负责状态图、模型配置、流式输出和消息持久化：

1. Next.js 使用全屏工作台布局，左侧显示历史对话，主区域展示聊天。
2. 模型配置被收进一个可打开的设置面板里，目前已有 `模型配置` 分组，后续可以继续扩展更多设置项。
3. FastAPI 通过 SQLite 持久化 LLM 配置和对话历史。
4. 聊天请求会读取当前激活配置，并通过 SSE 把模型输出逐段推送给前端。
5. assistant 回复完成后，用户消息和模型消息都会写回 SQLite。

## 目录结构

```text
.
├── backend
│   ├── .env.example
│   ├── app
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── conversation_store.py
│   │   ├── graph.py
│   │   ├── llm.py
│   │   ├── llm_config_store.py
│   │   ├── main.py
│   │   ├── messages.py
│   │   └── schemas.py
│   └── pyproject.toml
├── frontend
│   ├── .env.example
│   ├── app
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── not-found.tsx
│   │   └── page.tsx
│   ├── components
│   │   ├── assistant-workspace.tsx
│   │   ├── chat-assistant.tsx
│   │   └── ui
│   ├── lib
│   │   ├── api.ts
│   │   └── utils.ts
│   └── package.json
└── README.md
```

## 启动后端

```bash
cd backend
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

后端会在 `DATABASE_PATH` 指定的位置自动创建 SQLite 文件，默认是 `backend/data/jeeves.db`。
其中会保存两类数据：

- 模型配置
- 对话历史

你有两种方式让模型可用：

1. 打开前端右上角设置，在 `模型配置` 里新建并启用一个 LLM 配置。
2. 或者继续在 `backend/.env` 中提供 `OPENAI_API_KEY`，作为兜底环境变量配置。

## 启动前端

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

默认前端会请求 `http://localhost:8000/api/chat`。如果后端地址不同，修改 `frontend/.env.local` 中的 `NEXT_PUBLIC_API_URL`。

## 已实现能力

- LangGraph 状态图封装
- FastAPI SSE 聊天接口 `POST /api/chat/stream`
- SQLite 持久化 LLM 配置
- SQLite 持久化对话历史
- 配置管理接口：创建、更新、激活、测试连接
- 全屏工作台布局：历史区 + 聊天区 + 设置面板
- 前端流式聊天 UI
- Shadcn 风格基础组件拆分
- 环境变量与本地开发说明

## 下一步建议

- 增加 LangGraph Memory 持久化
- 把 `/api/chat` 扩展为流式 SSE 或 WebSocket
- 在图中加入工具节点和路由节点
- 加入用户会话 ID，支持后端持久化上下文

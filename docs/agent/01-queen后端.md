# 01 · Queen 后端

**关键词索引**：FastAPI / 分层 / JWT / CurrentUser / get_db / alembic / aiomysql / SSE / Nerve / mock 模式 / Celery / pytest / event loop / ASGITransport

## 请求生命周期

```
Nginx(Carapace) → gunicorn/uvicorn → main.py 中间件(trace_id) → api/v1/router → endpoint → deps(CurrentUser+DB) → service → models(pn_*)
```

- 入口：`queen/app/main.py:20`（lifespan 启 Redis + structlog；trace 中间件注入 X-Trace-Id）
- 路由注册：`queen/app/api/v1/router.py:7`（cephalon=用户 / thorax=订单 / abdomen=反馈 / nerve=AI / spiracle=MCP）
- 依赖注入：`queen/app/api/deps.py:15`（get_current_user 解 JWT→查库→CurrentUser）；DB Session 见 `queen/app/core/database.py:38`

## 鉴权

- JWT HS256：`queen/app/core/security.py:20`（create_access_token / decode）
- 密码 bcrypt（passlib）；**依赖锁 bcrypt<4.1**（passlib 兼容，`queen/pyproject.toml`）
- 双通道：密码登录 / 微信 code→openid（`endpoints/cephalon.py` wx_login，需 WX_APPID）
- role ∈ admin/wing/antenna；订单可见范围在 service 判断（admin 全量，普通用户本人）

## 数据库

- async engine + aiomysql，连接池在 `queen/app/core/database.py`
- 迁移：alembic（async env，`queen/alembic/env.py:41`）；表：pn_user/pn_order/pn_order_item/pn_sys_log
- **铁坑**：`server_default` 字段 flush 后必须 `refresh` 回读，否则响应序列化时 MissingGreenlet（✅ `queen/app/services/user_service.py:21` register 内有示范）
- 本机开发库：perinest_db / 用户 perinest（凭据在 queen/.env，不入库）

## Nerve AI 网关

- `queen/app/services/ai_service.py:19`（stream_chat：OpenAI 兼容流式，解析 data: 行）
- **mock 模式**：未配 AI_API_KEY 自动启用（`queen/app/core/config.py:73` ai_mock_enabled），模拟打字机流，CI/demo 零成本
- 端点：`queen/app/api/v1/endpoints/nerve.py:40`（/ai/chat + /ai/chat/stream SSE）
- 换 provider 只改 .env 三行（AI_API_BASE/AI_API_KEY/AI_MODEL）

## Celery（Pheromone）

- 实例：`queen/app/tasks/celery_app.py:9`；任务：email/report/ai_tasks
- worker 内无事件循环，async 任务用 asyncio.run 桥接（✅ `queen/app/tasks/ai_tasks.py` batch_summarize）

## 测试体系（重要：勿破坏）

- **全 async + session 单 event loop**：`queen/tests/conftest.py:14`（client fixture 含 lifespan；auth_headers 用 uuid 防碰撞）
- **历史坑**：TestClient（每测试新 loop）与全局 engine/redis 混跑必炸 "Future attached to a different loop"——已彻底改造，勿回退
- 测试矩阵：health/契约 + e2e 全链路 + AI mock(monkeypatch 强制，防本地真 key 泄漏) + MCP + **共生体**（`queen/tests/test_symbiont.py:56`）+ **能力对称**（见 04）
- CI 环境变量 PERINEST_Q_AI_MOCK=true 双保险（`.github/workflows/ci.yml`）

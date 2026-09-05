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

## Crop 嗉囊（RAG 知识库）

- 权威/投影分离（✅ 借鉴 dsh JSONL-only 决策）：MySQL `pn_crop_document/pn_crop_chunk` 是唯一权威（原文+chunk+embedding BLOB 只 INSERT，`queen/app/models/crop.py:15`）；Redis 8 **Vector Sets**（VADD/VSIM）是可丢弃投影（`queen/app/services/crop_vector_store.py:18`），`POST /crop/projection/rebuild` 从权威重建
- embedding 双模（`queen/app/services/embedding_service.py`）：接 OpenAI 兼容端点；未配 key 自动 mock（确定性哈希伪向量，同词必召回）。**真 embedding 挂了会抛错不静默降级**。分批（10/批，DashScope 硬限制）×并发（4）、响应按 index 还原（✅ `queen/app/services/embedding_service.py:48`，env 可覆盖）
- **默认配置对齐 ack-agent 生产**（DeepSeek 官方无 embeddings 端点，勿配 deepseek base）：DashScope compatible-mode / text-embedding-v4 / **1024 维**。改维度需清 crop 数据+清 `crop:vs` 投影重建（旧向量维度不兼容 VADD 会挂）
- **文件吞入**（v0.10.1+）：`POST /crop/documents/upload`（multipart）——txt/md 直读（UTF-8/GBK）、pdf 走 pypdf 文字层、docx 走 python-docx；≤10MB；**扫描件/加密 PDF 明确 422**（OCR 不在模板范围，ack 有生产方案待抄）；提取复用 create_document 全流程；依赖 pypdf/python-docx/python-multipart（✅ pyproject）
- 分块三级化（✅ `queen/app/services/crop_service.py:43`）：段落→单段超长按句→句超长硬截；相邻块 60 字 overlap 从语义边界回退（`queen/app/services/crop_service.py:36` _overlap_tail）。v1 同步 ingest，大文件 Celery 化留 v2
- 端点（`queen/app/api/v1/endpoints/crop.py`）：documents CRUD + search + projection/rebuild + health；权限 crop:read（四端角色默认）/ crop:write（admin/运营）
- MCP：`crop_search`（检索）/`crop_ingest`（吞入），PARITY_MAP 已登记；列表/详情/删除/运维端点走 EXEMPT（理由见 `queen/tests/test_capability_parity.py:35`）
- **依赖**：Redis ≥ 8.2（Vector Sets）；Redis 7 无此结构——部署文档见 03
- 坑：向量操作走独立二进制连接（decode_responses=False），不能复用主池（主池 True 会破坏 FP32 传输）

### 不采纳：wiki 编译层（2026-09-05 决策，v0.9.1 记录）

ack-agent（旭化成 RAG）验证过的失败模式，Crop 不走这条路：
- **后台孤儿**：wiki 编译是异步夜间任务，编译与否问答零感知（search_kb 照常可用）→ 实际
  29 份 raw 仅产出 10 页（sources 覆盖 17%），log 停更 3 个月、lint 只跑过 1 次
- **密度不足**：概念页/版本对比页只在跨文档综合场景兑现价值，日常问答 80% 是单文档
  条文查询，chunk 检索又快又稳——均匀编译成本在低密度下是负投入
- **实现形态**：其 wiki 化依赖 pi coding agent 跑 agent-service（LLM 读文档→工具写回），
  PeriNest 暂不引入 agent 框架形态，LLM 面保持 Nerve 网关 httpx 直调
- **触发条件**（满足才重启设计）：用户出现真实的跨文档综合查询需求，且愿意为编译
  延迟买单；届时做「同步编译进 ingest 主路径」（编译产物检索强制可见），不做后台队列

## Cercus 尾须（企微私域）

- 基建：`queen/app/services/wecom_service.py`（token 缓存/外部联系人/JS-SDK 签名/OAuth，WECOM_* 五 env 未配自动禁用 503）+ `queen/app/services/wecom_crypto.py` 回调加解密（AES-256-CBC+PKCS7+sha1，自 JJKK 移植）
- Nectar 缓存层（Redis 共享，fail-open）：access_token/jsapi_ticket TTL 7000s（多 worker+celery 共用，进程内缓存会撞企微限频）、联系人详情 300s 短缓存（吸收侧边栏高频）；回调刷新/全量同步后精确失效
- 数据：pn_wecom_contact 镜像（tags/kv 运营扩展位，**企微为权威源**，sync 只刷新镜像字段不动 tags/kv）+ pn_wecom_followup append-only 时间线
- 回调精确刷新（v2）：change_external_contact → `_refresh_one_contact`（✅ `queen/app/api/v1/endpoints/cercus.py` delete 删镜像不级联运营数据；失败仅记日志）
- 定时同步（v2）：`queen/app/tasks/cercus_tasks.py:17` sync_all_staff（celery beat 每日 06:30；员工集=存量 ∪ WECOM_SYNC_STAFF 种子）
- OAuth 免登（v2）：`POST /cercus/wecom/oauth-login`（✅ 同文件 :240）——**约定式映射：系统用户名=企微 userid** 即自动免登；匹配不上 403 fail-closed 不自动建号；EXEMPT 已登记（身份入口，与 /auth/login 同性质）
- Leg 侧边栏 `/wecom/sidebar?external_userid=x[&code=y]`：带 code 走 useEffect 免登换 token
- MCP：wecom_contact_search；Wing 尾须管理页（列表/标签/跟进/手动同步）
- 坑：测试内勿 asyncio.run 另起 loop（session 单 loop 铁律）；alembic MySQL 非事务 DDL 半途失败用幂等迁移重入

## 运行时配置（runtime_config · 管理端改 key/model）

- 优先级：pn_sys_config（DB）> .env——管理端改完即时生效免重启（内存缓存，写入失效）
- 白名单 14 键（`queen/app/services/runtime_config.py:22` AI_CONFIG_KEYS）：ai×4 + embedding×4 + **wecom×6**（corp_id/corp_secret/agent_id/token/aes_key/sync_staff——企微凭证已归拢同面）；非法键 422 fail-closed
- 敏感处理：GET 一律打码（sk-645***6f03），SET 收明文，日志不落 key
- ai_service/embedding_service/wecom_service/cercus 端点/celery 任务全部接入动态视图（AiRuntimeConfig）；**企微凭证变更自动失效 Redis token/ticket 缓存**；端点：GET/PUT /system/ai-config + POST /system/ai-config/test（真实测试消息，system 域）
- Wing「神经索配置」页（perm=system）：双卡（对话/向量）+ 来源徽章（DB 覆盖/env）+ 测试连接
- 清空值=删 DB 覆盖回落 env；embedding.dim 改动需重建向量投影

## 版本说明（system_service）

- **唯一源链路**：仓库根 CHANGELOG.md → `queen/app/services/system_service.py:70` get_version_info 解析为结构化版本列表（version/date/sections/items，缩进子项并入主条目，lru_cache）→ `GET /api/v1/system/version`（✅ `queen/app/api/v1/endpoints/abdomen.py:42`，登录即可见无权限域）
- 四端版本说明 UI 统一消费此 API；改版本记录只改 CHANGELOG.md 一处
- 打包部署读不到仓库根时降级返回纯版本号（changelog 空列表）
- PARITY 走 EXEMPT（版本号查询已由 perinest_health MCP 工具覆盖）

## Celery（Pheromone）

- 实例：`queen/app/tasks/celery_app.py:9`；任务：email/report/ai_tasks
- worker 内无事件循环，async 任务用 asyncio.run 桥接（✅ `queen/app/tasks/ai_tasks.py` batch_summarize）

## 测试体系（重要：勿破坏）

- **全 async + session 单 event loop**：`queen/tests/conftest.py:14`（client fixture 含 lifespan；auth_headers 用 uuid 防碰撞）
- **历史坑**：TestClient（每测试新 loop）与全局 engine/redis 混跑必炸 "Future attached to a different loop"——已彻底改造，勿回退
- 测试矩阵：health/契约 + e2e 全链路 + AI mock(monkeypatch 强制，防本地真 key 泄漏) + MCP + **共生体**（`queen/tests/test_symbiont.py:56`）+ **能力对称**（见 04）
- CI 环境变量 PERINEST_Q_AI_MOCK=true 双保险（`.github/workflows/ci.yml`）

# AGENTS.md — PeriNest 四端 monorepo（FastAPI×React×小程序×H5）
> 本文件是 AI Agent 理解本项目的入口。细节按需查阅 docs/agent/ 下分模块文档。
> ⚠️ 一律以代码为准；标注 ✅ 的结论均读过代码并带行号锚点。

## 这是什么项目

四端企业级模板：**Queen**（FastAPI 后端）+ **Wing**（React 管理端）+ **Antenna**（微信原生小程序）+ **Leg**（H5 移动端）。
无 Docker 部署（venv + Systemd + Nginx），MIT 开源，GitHub: steptian/PeriNest（public）。
世界观「琥珀标本馆」贯穿命名（见 00 文档）；**共生体原则**：AI 以授权用户身份行事（见 04 文档）。

## 📚 文档索引（先读哪个）

| 文档 | 内容 | 何时读 |
|:---|:---|:---|
| `00-架构与代码约定.md` | 技术栈/命名体系/版本管理/分层铁律 | 改任何代码前 |
| `01-queen后端.md` | 后端分层/鉴权/DB/AI 网关/Celery/测试体系 | 改后端 |
| `02-前端三端.md` | Wing/Leg/Antenna 同构模式/设计系统 | 改前端 |
| `03-部署与CI.md` | deploy 全套/CI 矩阵/发版三步 | 部署或发版 |
| `04-共生体原则.md` | AI 友好五原则/能力对称性机制 | **新增任何接口前必读** |

## 🚨 命名陷阱（不看必踩）

| 看到的 | 实际含义 | 不是 |
|:---|:---|:---|
| Queen/Wing/Leg/Antenna | 后端/Web/H5/小程序 | 不是业务模块名 |
| cephalon/thorax/abdomen | 后端 API 模块（头/胸/腹） | 不是蜚蠊角色 |
| Nerve/Spiracle | AI 网关 / MCP 服务 | 不是两个端 |
| Core/Nectar/Pheromone/Carapace | MySQL/Redis/Celery/Nginx | 不是代码目录 |
| Egg/Nymph/Pupa/Imago | dev/test/staging/prod 环境 | 不是数据模型 |

## ⚡ 改一个功能，去哪找代码

- 加 REST 接口：`queen/app/api/v1/endpoints/<模块>.py` → service 层写逻辑 → **同步 MCP 工具**（见 04）
- 改前端：Wing `wing/src/pages/`、Leg `leg/src/pages/`（同构，改一端看另一端）
- 改主题色：`wing/src/index.css` 与 `leg/src/index.css` 的 CSS 变量（同源令牌）
- 改版本：只改根 `VERSION` + 三处同步（见 00 文档发版三步）

## 🔑 鉴权与数据隔离速记

- JWT（HS256），`queen/app/api/deps.py:15` 统一解析 → `CurrentUser`
- 双通道：Web 密码登录 / 微信 code 换 openid（`queen/app/api/v1/endpoints/cephalon.py`）
- 权限模型：role ∈ {admin, wing, antenna}；admin 见全量订单，普通用户仅本人（service 层过滤）

## ⚠️ 改动高风险区

- `queen/tests/test_capability_parity.py:21`（PARITY_MAP）——加端点不登记 → CI 红（这是设计，不是 bug）
- `queen/app/core/config.py:15`（read_repo_version）——依赖仓库根 VERSION 的相对路径层级
- 前端测试体系是 **session 单 event loop**（`queen/tests/conftest.py:14`），勿改回 TestClient 混跑（会炸 loop）

## 📐 wiki 维护指令

六条纪律（摄取/检查/遗忘/增量/标注/检索友好）+ `.wiki-sync-commit` 基点，详见根 skill 或本目录各文档头。改代码后：`git diff --name-only` → 增量更新受影响段落 → `bash ~/.pi/agent/skills/code-to-agents/scripts/verify-anchors.sh docs/agent .`

## 📌 待深入

- Antenna 端未真机验证（仅 tsc）⚠️
- gunicorn.conf.py 生产参数未压测调优 ⚠️

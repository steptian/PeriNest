# PeriNest（蜚蠊巢穴）

[English](README_EN.md) | 中文


> [![CI](https://github.com/steptian/PeriNest/actions/workflows/ci.yml/badge.svg)](https://github.com/steptian/PeriNest/actions/workflows/ci.yml)
> ![version](https://img.shields.io/badge/version-0.8.3-c2410c) ![license](https://img.shields.io/badge/license-MIT-green) ![monorepo](https://img.shields.io/badge/monorepo-Queen·Wing·Antenna·Leg-166534)
>
> *Built to Survive, Designed to Adapt.* — 为生存而生，为适应而设计。


**这是为 AI 开发时代造的框架。**

| 你带来 | PeriNest 提供 |
|:---|:---|
| 一个想法 + 一个 AI | 造出稳定靠谱的四端系统 |

- **轮子已造好**——四端骨架/鉴权/AI 网关/部署/CI 开箱即用，AI 不必从零搭
- **原则会自己执行**——共生体原则由测试守护，AI 违规本地十秒红，不靠自觉
- **知识已编译**——`AGENTS.md` 知识库 + `make check`，任何 AI 秒上手、安全迭代

> 使命：**让人人都能带着 AI，快速、高效地开发出稳定靠谱的系统。**

四端 monorepo：**Queen**（后端核心）+ **Wing**（Web 管理端）+ **Antenna**（微信小程序）+ **Leg**（移动端 H5）。
无 Docker 部署：原生 venv + Systemd + Nginx。

## 🗺 架构一图流

<p align="center">
  <img src="assets/architecture-0.6.svg" alt="PeriNest 巢穴架构图" width="100%" />
</p>
<p align="center"><sub>四端入口 → Carapace 背甲 → Queen 虫母（五器官）→ 巢穴基础设施 · 右侧经气门接入 AI 生态</sub></p>

## 📸 演示

<p align="center">
  <img src="assets/screenshots/wing-dashboard-light.png" width="48%" alt="Wing 管理端" />
  <img src="assets/screenshots/leg-chat-light.png" width="20%" alt="Leg AI 对话" />
</p>
<p align="center">
  <img src="assets/screenshots/wing-dashboard-dark.png" width="48%" alt="Wing 暗色模式" />
  <img src="assets/screenshots/leg-chat-dark.png" width="20%" alt="Leg 暗色模式" />
</p>
<p align="center"><sub>Wing 管理端仪表盘 · Leg 移动端 AI 流式对话（亮/暗双主题）</sub></p>

## 📖 巢穴图鉴 · 每个名字都是一个器官

**故事从一个问题开始：为什么是蜚蠊？**

鹰需要风，狼需要群，鲸需要海——**蜚蠊什么都不需要**。
它不快、不强、不美，却靠一整套生存系统活过了三亿年、四次大灭绝：
核心稳固、末梢灵敏、躯体可再生、对任何环境零依赖。

**PeriNest 就是把这套生存系统翻译成软件架构。**
词源：**Peri**planeta（蜚蠊的拉丁属名）+ **Nest**（巢穴）。

### 一只蜚蠊的解剖学

| 器官 | 它在生物体做什么 | 为什么由它负责这件事 |
|:---|:---|:---|
| **Queen 虫母** · 后端 | 一巢仅一只，全部后代由它孕育；它若死亡，巢穴即灭 | 业务逻辑的唯一裁决者——所以给它数据强一致，用 Systemd「断头再生」守护 |
| **Wing 翅翼** · Web 管理端 | 飞得高、看得远 | 大屏可视化、运营配置；翅膀从不消化食物——**前端不做业务逻辑** |
| **Antenna 触角** · 小程序 | 最敏感的末梢神经，靠触碰感知世界 | 微信生态的探针：扫码、LBS、推送，都是「触碰」动作 |
| **Leg 足** · H5 | 六足行走，任何表面都能爬 | 任何浏览器直达，免安装免审核——六条腿，坏一条还能走 |
| **Nerve 神经索** · AI 网关 | 贯穿全身的神经传导——断头后仍能指挥肢体 | AI 能力贯穿四端；SSE 流式=神经信号逐段传导 |
| **Spiracle 气门** · MCP | 蜚蠊与外界交换气体的器官 | MCP 端点=与 AI 生态（Claude/Cursor）交换工具的呼吸口 |
| **Core 核心腺体** · MySQL | 腺体分泌并储存生命物质 | 永久业务数据，巢穴的记忆 |
| **Nectar 花蜜** · Redis | 快取快用的能量，不会永久保存 | 缓存/Session/锁——快进快出，过期即逝 |
| **Pheromone 信息素** · Celery | 留下化学痕迹，同伴循迹而动 | 异步任务队列：耗时工作留下信号，worker 循迹处理 |
| **Carapace 背甲** · Nginx | 外骨骼永远在最外层 | 第一道防线：SSL 终结、限流熔断、动静分离 |

### 生命周期：不完全变态

蜚蠊没有蛹期，**每次蜕皮都保留旧形态、长出新形态**——
这正是 PeriNest 的发布哲学：

`Egg 卵`（开发）→ `Nymph 若虫`（测试）→ `Pupa 蛹`（预发布）→ `Imago 成虫`（生产）

每次部署=一次蜕皮：平滑升级、可回滚，**永不推倒重来**。

### UI 为什么是琥珀？

蜚蠊最浪漫的归宿，是被树脂包裹、封存三亿年。
所以整个界面是一座**数字琥珀标本馆**：AI 的每次回复都是一枚 `EXHIBIT` 标本，
暗色模式是树脂深处，米白纸面是老图鉴的纸页，登录页写着 `since 300 Ma`。

> *Built to Survive* —— 韧性：自愈、限流、零外部依赖。
> *Designed to Adapt* —— 适应：四端触达、多态环境、AI 持续演进。

---

## ✨ 为什么选 PeriNest

**不是空壳模板，是全链路验证过的生产起点。**

### 🛑 停止重复造轮子

每次新项目都在重写注册登录、重配 JWT、重搭管理后台、重新接 AI 流式、重写部署脚本——**这些轮子 PeriNest 都造好了，而且验证过**：

| 你不用再造的轮子 | PeriNest 已交付 |
|:---|:---|
| 注册/登录/JWT/鉴权 | 开箱即用，含微信 wx.login 双通道 |
| 角色权限矩阵 RBAC | admin/operator/终端用户 + 账号级 grant/deny 覆盖，菜单按权限渲染 |
| 管理后台 + H5 + 小程序 | 四端一套仓库，同构 API 层 |
| AI 流式对话（SSE） | Nerve 网关 + 双端 UI，mock 模式零 key 体验 |
| 部署脚本/进程守护/Nginx | deploy/ 全套，无 Docker |
| CI 流水线 | GitHub Actions 四 job 矩阵 |
| 版本管理 | 单一 VERSION 源，三端自动同步 |

**你的时间应该花在真正的业务上，而不是第一周就写吐的第 1000 次登录页。**

### 🧬 四端一体，看名字就懂架构

一套 monorepo 装下全部：**Queen**（后端裁决核心）、**Wing**（Web 管理端）、**Antenna**（微信小程序）、**Leg**（移动端 H5）。
生态隐喻贯穿代码、目录、文档——新人读一遍命名，架构图已在脑中。

### 📦 零 Docker 依赖，1C1G 服务器也能跑

没有容器运行时、没有镜像构建、没有 K8s 清单。
原生 venv + Systemd（崩溃 3 秒自动拉起）+ Nginx（SSL/限流/动静分离）。
**运维成本减半，部署心智负担归零。**

### 🚀 开箱即验，不是 PPT 骨架

- 注册 → 登录 → JWT → 下单 → 落库，**全链路 e2e 测试真实跑通**
- 前端 tsc 严格模式零错误构建通过
- 微信 wx.login 换 Token 双通道登录（Web + 小程序）已就绪

### 🔒 契约驱动，拼写错误活不过编译期

Queen 的 Pydantic Schema 自动生成 OpenAPI → `openapi-typescript` 一键转 Wing 的 TS 类型。
后端改字段，前端类型立刻变红。**四端联调不再靠吼。**

### 🧠 AI Native：AI 是一等公民（共生体原则）

**AI Native 不是"系统里有个 AI 入口"——是 AI 以你的身份替你工作。**
蜚蠊体内的共生菌群以宿主的食物为食、替宿主消化；PeriNest 的 AI 以**授权用户的权限**访问数据、替用户执行操作：
- **能力对称**：你在界面上能做的，AI 经 MCP 都能做（CI 强制对账，缺口即红）
- **权限同源**：AI 的边界 = 你的边界，永远无法越权（越权返回结构化拒绝，绝不静默）
- 统一 AI 网关：一套 OpenAI 兼容适配，DeepSeek / Kimi / Qwen / Ollama 换个 base_url 即切
- **SSE 流式打字机**：`/api/v1/ai/chat/stream`，四端共享
- Leg 端 AI 对话页 + Wing 端 AI 助手抽屉，**点开即聊**
- 未配 key 自动进 mock 模式——**demo 与 CI 零成本跑真实链路**
- 🧲 **MCP Server（Spiracle 气门）**：7 个工具覆盖用户操作面（身份/订单查改/反馈/AI）——**Claude / Cursor 直连你的后端替你干活**，零额外依赖

### ⚡ 全异步链路，单机性能拉满

FastAPI + SQLAlchemy 2.0 async + aiomysql + Redis 连接池，Celery 异步解耦耗时任务。
高并发不换架构，只加 Worker。

### 🪳 蜚蠊生存哲学，落到工程细节

| 生存法则 | 工程实现 |
|:---|:---|
| 断头再生 | Gunicorn max_requests 定期回收 Worker，内存泄漏不积累 |
| 环境自适应 | .env 三环境配置，一套代码 Egg→Nymph→Pupa→Imago 四态演进 |
| 外骨骼防御 | Nginx 限流熔断 + JWT 鉴权 + 贫血模型严格分层 |
| 信息素协作 | Celery Pheromone 异步任务，核心链路零阻塞 |

### 🔍 天生可观测

structlog 输出 JSON 日志，**每个请求注入唯一 trace_id**，接入 ELK/Loki 即得全链路追踪。


## 快速开始

### Queen（后端）

```bash
cd queen
python3 -m venv .venv && source .venv/bin/activate
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple .
cp .env.example .env       # 填写 MySQL/Redis 配置
alembic upgrade head       # 建表
uvicorn app.main:app --reload
# 文档：http://localhost:8000/docs
```

### Wing（Web）

```bash
cd wing
npm install
npm run dev                # http://localhost:5173
```

### Leg（H5 移动端）

```bash
cd leg
npm install
npm run dev                # http://localhost:5174
```

### Antenna（小程序）

微信开发者工具导入 `antenna/` 目录，填入真实 appid（`project.config.json`）。

## 验证

```bash
cd queen && .venv/bin/python -m pytest tests/ -v   # 全链路冒烟
cd wing && npm run build                            # Web 管理端构建
cd leg  && npm run build                            # H5 移动端构建
cd antenna && ./node_modules/.bin/tsc --noEmit      # 小程序类型检查
```

## 架构文档

见 `docs/技术架构.md`。部署见 `deploy/DEPLOYMENT.md`。

---

## ☕ 请作者喝杯茶

如果这个项目对你有帮助，欢迎扫码打赏，让巢穴生生不息 🪳

![微信收款码](assets/reward-qr.png)


# PeriNest（蜚蠊巢穴）

> *Built to Survive, Designed to Adapt.* — 为生存而生，为适应而设计。

三端 monorepo：**Queen**（后端核心）+ **Wing**（Web 管理端）+ **Antenna**（微信小程序）。
无 Docker 部署：原生 venv + Systemd + Nginx。

## ✨ 为什么选 PeriNest

**不是空壳模板，是全链路验证过的生产起点。**

### 🧬 三端一体，看名字就懂架构

一套 monorepo 装下全部：**Queen**（后端裁决核心）、**Wing**（Web 管理端）、**Antenna**（微信小程序）。
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
后端改字段，前端类型立刻变红。**三端联调不再靠吼。**

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

### Antenna（小程序）

微信开发者工具导入 `antenna/` 目录，填入真实 appid（`project.config.json`）。

## 验证

```bash
cd queen && .venv/bin/python -m pytest tests/ -v   # 全链路冒烟
cd wing && npm run build                            # TS 严格模式构建
```

## 架构文档

见 `docs/技术架构.md`。部署见 `deploy/DEPLOYMENT.md`。

---

## ☕ 请作者喝杯茶

如果这个项目对你有帮助，欢迎扫码打赏，让巢穴生生不息 🪳

![微信收款码](assets/reward-qr.png)


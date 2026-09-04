# PeriNest（蜚蠊巢穴）

> *Built to Survive, Designed to Adapt.* — 为生存而生，为适应而设计。

三端 monorepo：**Queen**（后端核心）+ **Wing**（Web 管理端）+ **Antenna**（微信小程序）。
无 Docker 部署：原生 venv + Systemd + Nginx。

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


# PeriNest

> 🤖 Agent 规则：**改动代码前必读 `docs/agent/AGENTS.md`**（命名陷阱 + 新接口共生体强制流程）；自检跑 `make check`；收工更新状态区三行。规格见 ~/.agents/AGENTS-SPEC.md

what: 四端 monorepo：Queen(FastAPI+MySQL+Redis+Celery 后端) + Wing(React18+Vite 管理端) + Antenna(微信原生小程序) + Leg(移动端 H5)，无 Docker 部署（venv+Systemd+Nginx），MIT 开源
where: /Users/steptian/Documents/iLike/Python/feilian/PeriNest
agents: pi
domain: FastAPI / React / 微信小程序 / MySQL 8 / Redis 7 / Celery / Nginx
links: docs/技术架构.md, deploy/DEPLOYMENT.md, https://github.com/steptian/PeriNest
wiki: docs/agent/
wiki: 

## 状态区
status: v0.13.0 已发布；i18n：Leg ✅ + Wing 100%（外壳+全部业务页，切换弹层）；64 测试+冒烟 40+eval 全绿
next: Antenna 轻量 dict i18n（wx.Storage 语言偏好 + 三语字典，逐页替换）；在线 demo 上线（等服务器）；OA/进销存按契约孵化
updated: 2026-09-07

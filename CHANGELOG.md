# Changelog

本项目的所有显著变更都记录在此文件中。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [SemVer](https://semver.org/lang/zh-CN/)：
**主版本.次版本.修订号**（MAJOR.MINOR.PATCH）。

## 发版流程（三步）

1. 改根目录 `VERSION` 文件（唯一版本源）→ 同步 `antenna/miniprogram/app.ts` 的 `appVersion`（小程序读不到仓库文件，需手动同步）
2. 在本文件顶部新增版本条目
3. `git tag v<版本号> && git push --tags`

> Queen 的 `/health` 与 Wing 侧边栏版本号均自动读取 `VERSION` 文件，无需手动改。

## [0.1.0] - 2026-09-04

### Added
- **Queen**：FastAPI + MySQL 8 (aiomysql) + Redis 7 + Celery 异步任务骨架
  - JWT 鉴权 + 微信 wx.login 双通道登录
  - alembic 迁移（pn_user / pn_order / pn_order_item / pn_sys_log 四表）
  - structlog JSON 日志 + 请求级 trace_id
  - 全链路 e2e 测试（注册→登录→下单→落库）
- **Wing**：React 18 + TypeScript + Vite + Tailwind 管理端
  - 登录 / 仪表盘 / 订单管理三页骨架
  - Axios 拦截器（401 自动登出）+ TanStack Query + Zustand
- **Antenna**：微信原生 TypeScript 小程序
  - wx.request 统一封装，401 静默重登重放
  - 首页 / 订单 / 个人中心三页面 + tabBar
- **deploy**：无 Docker 部署全套（Nginx SSL 限流 + Systemd/Supervisor 守护 + deploy.sh）
- 版本管理体系：根 `VERSION` 单一版本源，三端可见

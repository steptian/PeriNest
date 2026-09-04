# Changelog

本项目的所有显著变更都记录在此文件中。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [SemVer](https://semver.org/lang/zh-CN/)：
**主版本.次版本.修订号**（MAJOR.MINOR.PATCH）。

## 发版流程（三步）

1. 改根目录 `VERSION` 文件（唯一版本源）→ 同步 `antenna/miniprogram/app.ts` 的 `appVersion`（小程序读不到仓库文件，需手动同步）
2. 在本文件顶部新增版本条目
3. `git tag v<版本号> && git push --tags`

> Queen 的 `/health` 与 Wing 侧边栏版本号均自动读取 `VERSION` 文件，无需手动改。

## [0.3.0] - 2026-09-04

### Added
- **Nerve（神经索）AI 网关** — AI Native 时代开箱即用
  - `/api/v1/ai/chat` + `/api/v1/ai/chat/stream`（SSE 流式打字机）
  - OpenAI 兼容多 provider：DeepSeek / Kimi / Qwen / Ollama 换 base_url 即切
  - 未配 key 自动 mock 模式，demo/CI 零成本
- **Leg**：AI 对话页（移动端气泡 + 流式增量渲染），底部新增 AI tab
- **Wing**：右下角 AI 助手抽屉
- **Celery**：`ai_tasks.batch_summarize` 异步批量摘要示例
- **GitHub Actions CI**：Queen（MySQL+Redis services + pytest 全链路）/ Wing / Leg / Antenna 四 job 矩阵
- 测试体系重构：全部 async + session 单 event loop + ASGITransport（消除 TestClient 跨 loop 冲突），6/6 全绿

## [0.2.0] - 2026-09-04

### Added
- **Leg（足）**：移动端 H5 端，第四端上线
  - React 18 + TS + Vite + Tailwind，移动端优先（480px 视口 + 底部 Tab 导航）
  - 登录 / 首页 / 订单 / 个人中心四页，与 Wing 同栈同模式，Queen 零改动
  - 构建期从根 VERSION 注入版本号，个人中心可见
- 开源协议：MIT License（README 徽章 + LICENSE + 三端 package 字段）
- deploy：新增 Leg 静态托管 Nginx 配置

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

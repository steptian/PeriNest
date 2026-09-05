# Changelog

本项目的所有显著变更都记录在此文件中。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [SemVer](https://semver.org/lang/zh-CN/)：
**主版本.次版本.修订号**（MAJOR.MINOR.PATCH）。

## 发版流程（三步）

1. 改根目录 `VERSION` 文件（唯一版本源）→ 同步 `antenna/miniprogram/app.ts` 的 `appVersion` 与 `queen/pyproject.toml` 的 `version`（CI 有一致性校验）
2. 在本文件顶部新增版本条目
3. `git tag v<版本号> && git push --tags`

> Queen 的 `/health` 与 Wing 侧边栏版本号均自动读取 `VERSION` 文件，无需手动改。

## [0.6.0] - 2026-09-05

### Added
- **共生体原则——AI 成为一等公民**
  - 原则定义：AI 以授权用户身份行事，权限边界=用户边界，能力面=用户操作面
  - **能力对称性测试**（test_capability_parity）：OpenAPI 与 MCP tools 强制对账，
    新端点未做 AI 面决策（加工具或登记豁免理由）→ CI 红——原则由测试执行，不靠自觉
  - MCP 工具面 3→7：get_me（AI 自知替谁工作）/ list_orders（含 scope 声明）/
    get_order（越权结构化拒绝）/ create_order（AI 代下单归属本人）/
    submit_feedback（署名归属）/ ai_chat / perinest_health
  - **权限漏洞修复**：原 list_orders 工具未按用户过滤（普通用户经 AI 可见全库订单），
    现与 REST 行为完全一致
  - 共生体验证测试 4 项：身份声明/scope 隔离/越权拒绝/写操作归属
- 架构文档第 9 章：AI 友好五原则 + 新接口开发 checklist
- 测试 15/15 全绿

## [0.5.0] - 2026-09-05

### Changed
- **🎨 UI 全面重设计：「琥珀标本馆」设计语言三端落地**
  - 设计隐喻：蜚蠊是琥珀中最古老的昆虫——琥珀金主色 / 树脂深棕暗色 / 米纸底 / 标本卡片 / 图鉴拉丁标注
  - **Leg**：全部页面重写（标本卡片 AI 回复 + exhibit 编号 + Fraunces 雕刻衬线 + 纸面颗粒纹理 + 琥珀光晕 + 标本落定动效 + 呼吸光标）
  - **Wing**：档案柜侧边栏 + 衬线仪表盘 + 订单档案表（行级 stagger 入场）+ AI 抽屉同化
  - **Antenna**：wxss 全套令牌（琥珀渐变按钮/标本卡/徽标）+ 导航栏配色
  - 暗色模式分层策略：表面亮度差 + 环境阴影替代亮描边（边线只留极淡暗示）
- 演示截图全部重拍（Playwright + 真实 DeepSeek 流式画面）

## [0.4.0] - 2026-09-05

### Added
- **暗色模式**：Wing/Leg 双端亮暗主题（CSS 变量 + localStorage 持久化 + 防首屏闪白）
- **README 中英双语**：新增 README_EN.md，双语互链
- **演示截图**：Playwright 设备视口自动截图（Wing 仪表盘 + Leg AI 对话，亮暗 4 张），scripts/take_screenshots.py 可复现
- **🧲 MCP Server（Spiracle 气门）**：`/api/v1/mcp` JSON-RPC 端点，暴露 perinest_health / list_orders / ai_chat 三个 MCP 工具，Claude/Cursor 等 AI 客户端可直连；零额外依赖
- **「停止重复造轮子」卖点区块**：明确模板价值主张（不造轮子清单表）
- MCP 认证复用 JWT；测试 9/9（新增 MCP 全链路 3 测）

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

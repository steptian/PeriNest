# Changelog

本项目的所有显著变更都记录在此文件中。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [SemVer](https://semver.org/lang/zh-CN/)：
**主版本.次版本.修订号**（MAJOR.MINOR.PATCH）。

## 发版流程（三步）

1. 改根目录 `VERSION` 文件（唯一版本源）→ 同步 `antenna/miniprogram/app.ts` 的 `appVersion` 与 `queen/pyproject.toml` 的 `version`（CI 有一致性校验）
2. 在本文件顶部新增版本条目
3. `git tag v<版本号> && git push --tags`

> Queen 的 `/health` 与 Wing 侧边栏版本号均自动读取 `VERSION` 文件，无需手动改。

## [0.8.3] - 2026-09-05

### Fixed
- **全系统 UI 清剿 emoji**（用户规范：系统内任何地方禁止 emoji，用图标库/SVG/纯文字）
  - Wing：Roles 矩阵 √/👁/✍ → lucide Check/Eye/PenLine；Modal 关闭 ✕ → lucide X
  - Antenna：登录页微信 🟢 → CSS 绿点；chat 欢迎语/错误提示去 emoji
  - Leg：Chat 错误提示去 emoji；后端 MCP 工具描述去 ⚠️
  - 注释/文档表格 ✅❌ → √×（permissions.py docstring）
  - 复查机制：rg unicode 范围扫描四端 UI 代码，终查零命中
- **小程序登录样式**：输入框加高（min-height 100rpx + 32rpx 字号）、
  label 间距放宽，视觉比例修复

## [0.8.2] - 2026-09-05

### Fixed
- **小程序登录页落地**（用户验收：登录是假的、无未登录提示）
  - 新登录页：账号密码（开发环境直连本地 Queen）+ 微信一键（生产需 appid）
  - 订单页双占位：未登录→"尚未入巢"+去登录；已登录空→empty-box+去神经索
  - 个人中心：未登录显示登录入口
  - BASE_URL 占位域名坑根治：apiBase 移入 globalData，开发默认连
    http://127.0.0.1:8000（此前占位域名导致所有请求必然失败，
    空态分支永远走不到——这才是"没有占位符"的真因）

## [0.8.1] - 2026-09-05

### Added
- **Antenna 小程序端补全**（用户验收：tab 无图标、无空态占位，参照 Z-SH）
  - tabBar 双态图标 ×4（PIL 手绘琥珀标本馆线条风：巢穴六边形/订单标签/神经索闪电/人形）
  - 全局空态组件（Z-SH 模式：图标+文案+动作按钮）；订单页空态接"去神经索聊聊"
  - **神经索对话页**（chat）：标本卡气泡 + exhibit 编号 + wx.request enableChunked
    SSE 流式（手写 UTF-8 分块解码，小程序无 TextDecoder）
- tab 从 3 项扩到 4 项（巢穴/订单/神经索/我的）

## [0.8.0] - 2026-09-05

### Changed
- **角色定义动态化**（用户决策推翻此前"代码级事实源"取舍）：pn_role/pn_role_perm 两表，
  运行时可配置，矩阵页直接增删改
  - 内置角色种子仅作初始化（DEFAULT_ROLE_SEEDS，alembic 写入），此后全部走 DB
  - 守卫保留：admin 角色锁定（防自锁）· 有用户引用不可删 · 非法权限点拒绝
  - 修掉遗留硬编码：update_user_role 角色白名单改查库校验
  - 坑：SQLAlchemy unit-of-work 中 INSERT 先于 DELETE——全量替换角色权限
    必须先 flush 删除，否则撞唯一键
- **矩阵页可编辑化**：域按钮三态切换（无→只读→读写）、新增/编辑/删除角色
  （带确认弹窗）、每角色用户数展示
- **成员角色下拉动态化**：从 /roles 运行时拉取（不再写死）
- **编辑成员回显 bug 修复**：EditModal 复用挂载导致 state 不重置——
  key={user.id} 强制重挂载

### Added
- roles CRUD 四端点 + MCP admin_role_manage 合一工具（parity 对账）
- 动态角色全链路测试（创建→授权→只读验证→更新→锁定守卫→引用守卫→删除）

## [0.7.1] - 2026-09-05

### Added
- **权限矩阵总览页**（Wing）：角色×域可视化矩阵（读写/只读标记）、admin 锁定标识、
  两条铁律说明——矩阵是代码级事实源，变更走 git 不走 UI（Z-SH 生产哲学）
- **成员编辑弹窗 v2**：邮箱资料 + 角色 + **权限覆盖管理**（生效权限标签、
  模板⊕覆盖统计、grant/deny 列表、添加/移除覆盖）一站式
- 后端：GET /roles 矩阵元数据 · PATCH /users/{id} 资料编辑 ·
  GET /users/{id}/permissions 全景（base+overrides+effective）·
  DELETE /users/{id}/perms/{perm} 移除单条覆盖
- parity 新增 3 条豁免（roles 元数据/UI 便利端点/资料编辑），理由均登记

## [0.7.0] - 2026-09-05

### Added
- **Carapace RBAC：角色 · 权限矩阵 · 用户管理**（设计参考 Z-SH 生产实践）
  - 权限矩阵唯一事实源 `queen/app/core/permissions.py`：域(users/orders/feedback/ai/system)
    × 角色(admin/operator/wing/antenna)，读写细分，fail closed
  - **两层分离**：权限域管"能不能用"，数据归属管"能看谁的"（Service 层强制）
  - **账号级覆盖** `pn_perm_override`：最终权限=角色⊕grant/deny（deny 绝对优先），
    admin 锁死不可覆盖（防自锁）
  - 用户管理 REST（列表/改角色/禁用/权限覆盖，operator 只读 users）+ 登录留痕 last_login
  - **MCP 同步 4 个 admin 工具**（共生体原则：权限不足结构化拒绝）
  - Wing「巢穴成员」管理页 + 菜单按最终权限渲染
  - **首次引导**：`make admin USER=xxx`——clone 后第一个管理员从这里来
- **CRUD 交互完整度对齐 Z-SH**（用户反馈：列表缺翻页/搜索/操作列，成员缺新增编辑确认）
  - 通用组件：Pagination / ConfirmDialog / Modal（标本馆风格）
  - 巢穴成员：新增表单弹窗 + 编辑弹窗 + 禁用二次确认 + 搜索 + 分页（X-Total-Count）
  - 订单档案：订单号/状态搜索表单 + 详情弹窗 + 分页
  - 后端：POST /users（admin 新增）、订单 keyword/status 筛选、列表 total 响应头
  - MCP 对称：admin_create_user 工具（parity 登记）
- 测试 23/23（+新增/筛选/total header/403）

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

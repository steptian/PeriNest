# 在线 Demo 部署指南

> 目标：任何人在公网体验 PeriNest 四端 + AI 共生体（嗉囊问答/审计/分域）。
> 前置：一台 Linux 服务器（1C2G 起）+ 域名（可选，无域名用 IP）。

## 一、部署（约 15 分钟）

按 `deploy/DEPLOYMENT.md` 完成基础部署（MySQL 8 + Redis ≥8.2 + venv + Systemd + Nginx），然后：

```bash
cd /opt/perinest/queen   # 你的部署目录
.venv/bin/python ../scripts/bootstrap_demo.py   # 一键 demo 数据
```

产出：
- 体验账号：`demo / Demo!2026`（终端用户）· `demo_admin / Demo!2026`（管理员）
- 6 份演示知识（含 1 份 operator 机密档——演示分域红线）
- 幂等：重复跑不重复建

## 二、演示动线（给人看什么）

1. **Wing 管理端**（demo_admin 登录）：
   - 嗉囊知识库 → 问嗉囊：「这个项目的设计语言是什么」→ AI 检索→回答→引用来源
   - 审计按钮 → 谁让 AI 干了什么（工具调用留痕）
   - 系统设置 → 运行时改 AI 配置即时生效
2. **分域红线**（demo 登录 Wing/Leg）：
   - 问「财务口径」→ AI 诚实回答知识库无相关内容（wing 检索不到 operator 机密档）
   - demo_admin 问同样问题 → 能答（admin 恒全量）
3. **Leg H5**（手机）：嗉囊 tab → 问共生体/查原文双模式
4. **Antenna 小程序**：需在微信开发者工具/真机配置 apiBase 指向服务器（暂无线上小程序号）

## 三、上线检查单

- [ ] HTTPS（Nginx + certbot；SSE 需 `proxy_buffering off`，见 DEPLOYMENT.md）
- [ ] `.env` 配 AI_API_KEY（真实 LLM——问答 fail-closed 无 key 会 503）
- [ ] `make eval` 通过（检索质量基线）
- [ ] demo 密码已改/或接受公开演示账号（demo 账号权限已最小化：wing 无写权限）
- [ ] README 的 demo 链接已更新

## 四、安全注意

demo 账号是公开演示用的：wing 角色无任何写权限（订单/知识库写均 403），
demo_admin 有管理权——**生产环境请删除或改密**（`bootstrap_demo.py` 跑完后
建议立即 `ALTER USER` 或直接改数据库）。AI_API_KEY 消耗由公开访问产生，
建议配置用量告警（`/crop/usage/summary`）。

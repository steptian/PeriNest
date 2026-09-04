# PeriNest 部署手册（无 Docker）

> Carapace（Nginx 背甲）→ Queen（Gunicorn/Uvicorn）→ Core（MySQL）/ Nectar（Redis）/ Pheromone（Celery）

## 环境划分

| 环境 | 代号 | 说明 |
|:---|:---|:---|
| 开发 | Egg（卵） | 本地 venv + npm dev |
| 测试 | Nymph（若虫） | 内网服务器，Nginx 无 SSL |
| 预发布 | Pupa（蛹） | release 分支，生产配置隔离流量 |
| 生产 | Imago（成虫） | main 分支，SSL + 限流全开 |

## 首次部署（生产）

```bash
# 1. 前端构建（本地或 CI）
cd wing && npm ci && npm run build

# 2. 服务器初始化（root）
cd deploy && bash deploy.sh

# 3. 写入生产环境变量
vim /opt/perinest/queen/.env   # 参照 .env.example，前缀 PERINEST_Q_

# 4. 重启生效
systemctl restart perinest-queen
```

## 日常更新

```bash
cd deploy && bash deploy.sh   # 幂等，重复执行安全
```

## 运维命令

```bash
systemctl status perinest-queen          # Queen 状态
journalctl -u perinest-queen -f          # 日志追踪
systemctl restart perinest-queen         # 断头再生（手动版）
curl http://127.0.0.1:8000/health        # 存活探针
tail -f /var/log/perinest/queen.err.log  # 错误日志
```

## Supervisor 替代方案

若使用 Supervisor 而非 Systemd：`cp supervisord/perinest-queen.ini /etc/supervisord.d/ && supervisorctl reread && supervisorctl update`

## SSL

证书放置 `deploy/ssl/`，Let's Encrypt 签发：`certbot --nginx -d api.yourdomain.com`

## 回滚

```bash
cd /opt/perinest/queen && git checkout <prev_tag>   # 或 rsync 备份目录回写
.venv/bin/alembic downgrade -1                        # 迁移回滚（慎重）
systemctl restart perinest-queen
```

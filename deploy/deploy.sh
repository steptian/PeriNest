#!/usr/bin/env bash
# PeriNest 无 Docker 部署脚本（首次初始化服务器用）
# 用法：以 root 身份执行 bash deploy.sh（脚本内不再使用 sudo）
set -euo pipefail

APP_ROOT="/opt/perinest"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> [1/6] 创建目录与用户"
id -u www-data >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin www-data || true
mkdir -p "$APP_ROOT"/queen/logs "$APP_ROOT"/wing/dist
chown -R www-data:www-data "$APP_ROOT"

echo "==> [2/6] 同步代码 (rsync，排除开发产物)"
rsync -a --delete \
  --exclude='.git' --exclude='.venv' --exclude='node_modules' \
  --exclude='dist' --exclude='logs/*' --exclude='__pycache__' \
  "$REPO_ROOT/queen/" "$APP_ROOT/queen/"
rsync -a --delete --exclude='node_modules' "$REPO_ROOT/wing/dist/" "$APP_ROOT/wing/dist/"

echo "==> [3/6] 构建 Python 虚拟环境"
cd "$APP_ROOT/queen"
python3 -m venv .venv
.venv/bin/pip install -q -i https://pypi.tuna.tsinghua.edu.cn/simple .

echo "==> [4/6] 数据库迁移"
.venv/bin/alembic upgrade head

echo "==> [5/6] 安装进程守护与 Nginx 配置"
cp "$REPO_ROOT/deploy/systemd/perinest-queen.service" /etc/systemd/system/
cp "$REPO_ROOT/deploy/systemd/perinest-celery.service" /etc/systemd/system/
cp "$REPO_ROOT/deploy/nginx/perinest-api.conf" /etc/nginx/conf.d/
cp "$REPO_ROOT/deploy/nginx/perinest-wing.conf" /etc/nginx/conf.d/
mkdir -p /var/log/perinest && chown -R www-data:www-data /var/log/perinest
systemctl daemon-reload

echo "==> [6/6] 启动服务"
systemctl enable --now perinest-queen perinest-celery
nginx -t && systemctl reload nginx

echo "✅ 部署完成：curl http://127.0.0.1:8000/health 验证"

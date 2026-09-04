"""Gunicorn 生产配置 — Uvicorn Worker 多进程榨取多核。"""
import multiprocessing

bind = "127.0.0.1:8000"  # 或 unix:/tmp/perinest.sock
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "uvicorn.workers.UvicornWorker"
max_requests = 1000          # 防内存泄漏，定期回收 worker
max_requests_jitter = 100
preload_app = True
timeout = 60
graceful_timeout = 30
accesslog = "logs/access.log"
errorlog = "logs/error.log"
loglevel = "info"

# PeriNest 开发入口 —— AI agent 与人类的肌肉记忆
# 自检: make check | 起环境: make dev | 截图: make shots

.PHONY: check dev shots plates

check: ## 全链路自检（改代码后的标准验证，parity 违规本地秒红）
	cd queen && .venv/bin/python -m pytest tests/ -q
	cd wing && npm run build > /dev/null && echo "wing build ✅"
	cd leg && npm run build > /dev/null && echo "leg build ✅"
	cd antenna && ./node_modules/.bin/tsc && echo "antenna 编译+类型检查 ✅"
	bash scripts/verify-anchors.sh docs/agent .

dev: ## 起三服务 queen:8000 wing:5173 leg:5174（日志 /tmp/perinest-*.log）
	cd queen && (.venv/bin/uvicorn app.main:app --port 8000 > /tmp/perinest-queen.log 2>&1 &)
	cd wing && (npm run dev > /tmp/perinest-wing.log 2>&1 &)
	cd leg && (npm run dev > /tmp/perinest-leg.log 2>&1 &)
	@sleep 4 && curl -s http://localhost:8000/health && echo " ← 三服务已起（Ctrl+C 不会停服务，用 make stop）"

stop: ## 停三服务
	pkill -f "uvicorn app.main" ; pkill -f vite ; echo "已停"

shots: ## 重拍 README 演示截图（需先 make dev）
	python3 scripts/take_screenshots.py

admin: ## 首次引导：提权/创建 admin，用法 make admin USER=xxx [PASS=yyy]
	cd queen && .venv/bin/python scripts/seed_admin.py $(USER) $(if $(PASS),--password $(PASS))

antenna-build: ## 小程序 TS 预编译（js 落盘，上传前必跑；工具内也可直接用）
	cd antenna && ./node_modules/.bin/tsc

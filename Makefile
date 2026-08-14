# ─────────────────────────────────────────────────────────────
# Email Marketing SaaS — container workflow.
#
# `make dev`  / `make prod` write `.env` from the matching profile
# (.env.dev / .env.prod) and bring the stack up with the right compose
# override. `.env` is regenerated on every run, so it always matches the
# environment you asked for.
# ─────────────────────────────────────────────────────────────

COMPOSE      := docker compose
BASE         := -f docker-compose.yml
DEV          := $(BASE) -f docker-compose.dev.yml
PROD         := $(BASE) -f docker-compose.prod.yml

.DEFAULT_GOAL := help
.PHONY: help dev prod up-dev up-prod down logs ps build clean env-dev env-prod

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

env-dev: ## Write .env from .env.dev
	@cp .env.dev .env
	@echo "→ .env is now the DEV profile"

env-prod: ## Write .env from .env.prod
	@cp .env.prod .env
	@echo "→ .env is now the PROD profile"

dev: env-dev ## Build + start the DEV stack (mongo/redis exposed, 1 api + 1 worker)
	$(COMPOSE) $(DEV) up --build -d
	@echo "→ App: http://localhost:$$(grep -E '^GATEWAY_PORT=' .env | cut -d= -f2 | cut -d' ' -f1)"

prod: env-prod ## Build + start the PROD stack (only the gateway exposed)
	$(COMPOSE) $(PROD) up --build -d
	@echo "→ App: http://<server>:$$(grep -E '^GATEWAY_PORT=' .env | cut -d= -f2 | cut -d' ' -f1)"

# Scale on demand, e.g.  make up-prod WORKER_REPLICAS=6
up-dev: env-dev ## Start DEV without rebuilding
	$(COMPOSE) $(DEV) up -d

up-prod: env-prod ## Start PROD without rebuilding
	$(COMPOSE) $(PROD) up -d

down: ## Stop the stack (keeps data)
	$(COMPOSE) $(BASE) down

logs: ## Tail logs from all services
	$(COMPOSE) $(BASE) logs -f --tail=100

ps: ## Show running services
	$(COMPOSE) $(BASE) ps

build: ## Build images only
	$(COMPOSE) $(BASE) build

clean: ## Stop the stack AND wipe volumes (fresh start)
	$(COMPOSE) $(BASE) down -v

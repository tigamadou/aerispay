# AerisPay — Makefile
# Usage : make <target>

APP_DIR = web/app
TEST_DB_URL = mysql://aerispay:aerispay@db:3306/aerispay_test
TEST_DB_URL_HOST = mysql://aerispay:aerispay@localhost:3306/aerispay_test
TEST_CONTAINER = aerispay-app-dev
TEST_PORT = 3001

## -- Tests --

.PHONY: ci test test-watch test-coverage test-e2e test-e2e-open test-db-reset test-db-setup

ci: lint test test-e2e ## Run all CI checks (lint + unit tests + e2e)

test: ## Run unit tests (Vitest)
	cd $(APP_DIR) && npx vitest run

test-watch: ## Run tests in watch mode
	cd $(APP_DIR) && npx vitest

test-coverage: ## Run tests with coverage report
	cd $(APP_DIR) && npx vitest run --coverage

test-db-setup: ## Create test database if not exists
	docker exec aerispay-mysql-dev mysql -uroot -prootsecret -e \
		"CREATE DATABASE IF NOT EXISTS aerispay_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON aerispay_test.* TO 'aerispay'@'%'; FLUSH PRIVILEGES;" 2>/dev/null

test-db-reset: test-db-setup ## Reset test database (push schema + seed)
	docker exec -e DATABASE_URL="$(TEST_DB_URL)" $(TEST_CONTAINER) npx prisma db push --force-reset --skip-generate
	docker exec -e DATABASE_URL="$(TEST_DB_URL)" $(TEST_CONTAINER) npx prisma db seed

test-e2e: test-db-reset ## Run Cypress e2e tests on test database
	@echo "Building app for e2e…"
	@docker exec $(TEST_CONTAINER) npx next build
	@echo "Starting test server on port $(TEST_PORT)…"
	@docker exec -d -e DATABASE_URL="$(TEST_DB_URL)" -e NEXTAUTH_URL="http://localhost:$(TEST_PORT)" -e AUTH_SECRET="devsecret-change-me" $(TEST_CONTAINER) npx next start -H 0.0.0.0 -p $(TEST_PORT)
	@cd $(APP_DIR) && npx wait-on http://localhost:$(TEST_PORT) --timeout 60000
	-cd $(APP_DIR) && CYPRESS_BASE_URL=http://localhost:$(TEST_PORT) CYPRESS_DB_URL="$(TEST_DB_URL_HOST)" npx cypress run
	@docker exec $(TEST_CONTAINER) sh -c 'kill $$(ps aux | grep "next start.*$(TEST_PORT)" | grep -v grep | awk "{print \$$2}") 2>/dev/null' || true

test-e2e-open: test-db-reset ## Open Cypress interactive runner on test database
	@echo "Building app for e2e…"
	@docker exec $(TEST_CONTAINER) npx next build
	@echo "Starting test server on port $(TEST_PORT)…"
	@docker exec -d -e DATABASE_URL="$(TEST_DB_URL)" -e NEXTAUTH_URL="http://localhost:$(TEST_PORT)" -e AUTH_SECRET="devsecret-change-me" $(TEST_CONTAINER) npx next start -H 0.0.0.0 -p $(TEST_PORT)
	@cd $(APP_DIR) && npx wait-on http://localhost:$(TEST_PORT) --timeout 60000
	-cd $(APP_DIR) && CYPRESS_BASE_URL=http://localhost:$(TEST_PORT) CYPRESS_DB_URL="$(TEST_DB_URL_HOST)" npx cypress open
	@docker exec $(TEST_CONTAINER) sh -c 'kill $$(ps aux | grep "next start.*$(TEST_PORT)" | grep -v grep | awk "{print \$$2}") 2>/dev/null' || true

## -- Dev --

.PHONY: dev lint lint-fix type-check

dev: ## Start Next.js dev server
	cd $(APP_DIR) && npm run dev

lint: ## Run ESLint
	cd $(APP_DIR) && npm run lint

lint-fix: ## Run ESLint with auto-fix
	cd $(APP_DIR) && npx eslint --fix .

type-check: ## Run TypeScript type checking
	cd $(APP_DIR) && npx tsc --noEmit

## -- Database --

.PHONY: db-migrate db-push db-seed db-studio

db-migrate: ## Run Prisma migrations (usage: make db-migrate name=description)
	cd $(APP_DIR) && npx prisma migrate dev --name $(name)

db-push: ## Push schema without migration
	cd $(APP_DIR) && npx prisma db push

db-seed: ## Seed database with test data
	cd $(APP_DIR) && npx prisma db seed

db-studio: ## Open Prisma Studio
	cd $(APP_DIR) && npx prisma studio

## -- Docker --

.PHONY: up down logs

up: ## Start Docker Compose (dev)
	docker compose up -d

down: ## Stop Docker Compose
	docker compose down

logs: ## Tail Docker Compose logs
	docker compose logs -f

## -- Help --

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

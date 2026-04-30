# AerisPay — Makefile
# Usage : make <target>

APP_DIR = web/app

## -- Tests --

.PHONY: test test-watch test-coverage test-e2e test-e2e-open

test: ## Run unit tests (Vitest)
	cd $(APP_DIR) && npx vitest run

test-watch: ## Run tests in watch mode
	cd $(APP_DIR) && npx vitest

test-coverage: ## Run tests with coverage report
	cd $(APP_DIR) && npx vitest run --coverage

test-e2e: ## Run Cypress e2e tests (headless)
	cd $(APP_DIR) && npx cypress run

test-e2e-open: ## Open Cypress interactive runner
	cd $(APP_DIR) && npx cypress open

## -- Dev --

.PHONY: dev lint type-check

dev: ## Start Next.js dev server
	cd $(APP_DIR) && npm run dev

lint: ## Run ESLint
	cd $(APP_DIR) && npm run lint

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

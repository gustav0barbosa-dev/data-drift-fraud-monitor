# ============================================================
# Makefile - Comandos úteis do projeto
# ============================================================

.PHONY: help build up down logs shell db-shell init-db migrate test clean

help: ## Mostra esta ajuda
	@echo "Comandos disponíveis:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Constrói os containers
	docker-compose build

up: ## Sobe os serviços
	docker-compose up -d

down: ## Derruba os serviços
	docker-compose down

logs: ## Mostra logs em tempo real
	docker-compose logs -f

shell: ## Abre shell do backend
	docker-compose exec backend bash

db-shell: ## Abre psql do banco
	docker-compose exec db psql -U admin -d drift_monitor

init-db: ## Inicializa o banco com schema e seed
	docker-compose exec backend python -m db.init_db

migrate: ## Aplica migrations do Alembic
	docker-compose exec backend alembic upgrade head

test: ## Executa testes
	docker-compose exec backend pytest -v

clean: ## Remove containers, volumes e imagens
	docker-compose down -v --rmi all

restart: down up ## Reinicia os serviços

ps: ## Mostra status dos containers
	docker-compose ps
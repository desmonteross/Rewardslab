.PHONY: up down nuke db-create setup dev seed reset test typecheck build logs psql

## One command to get the whole system running (Postgres + app + seeded demo data)
up:
	docker compose up

down:
	docker compose down

## Wipe the database volume as well
nuke:
	docker compose down -v

## Create the local `pms` role + database (non-Docker)
db-create:
	npm run db:create

## Local (non-Docker) first-time setup: push schema, seed demo data
setup:
	npm install
	npm run setup

dev:
	npm run dev

seed:
	npm run db:seed

reset:
	npm run db:reset

test:
	npm test

typecheck:
	npm run typecheck

build:
	npm run build

logs:
	docker compose logs -f app

psql:
	docker compose exec db psql -U pms -d pms

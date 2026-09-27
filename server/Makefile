# Makefile for the Attendance Tracker backend.
# Wraps the Maven Wrapper and Docker commands; run `make help` for a list of targets.

MVN        := sh ./mvnw -B
JAR        := target/attendance-tracker-server.jar
IMAGE      := attendance-tracker-server
# Prefer the `docker compose` plugin, fall back to standalone `docker-compose`
COMPOSE_BIN := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || \
                 (command -v docker-compose >/dev/null 2>&1 && echo docker-compose))
COMPOSE     = $(if $(COMPOSE_BIN),$(COMPOSE_BIN) -f ../docker-compose.yml,$(error Docker Compose not found; install it (Arch: sudo pacman -S docker-compose)))

# Runtime configuration (override on the command line, e.g. `make run PORT=8080`)
PORT         ?= 3000
DB_URL       ?= jdbc:mariadb://localhost:3307/attendance_tracker
DB_USER      ?= root
DB_PASSWORD  ?= root
CORS_ORIGINS ?= http://127.0.0.1:1337,http://localhost:1337

# Settings for a locally installed MariaDB (no Docker), used by db-local / run-local
LOCAL_DB_URL      ?= jdbc:mariadb://localhost:3306/attendance_tracker
LOCAL_DB_USER     ?= attendance
LOCAL_DB_PASSWORD ?= attendance

RUN_ENV = PORT=$(PORT) DB_URL=$(DB_URL) DB_USER=$(DB_USER) \
           DB_PASSWORD=$(DB_PASSWORD) CORS_ORIGINS=$(CORS_ORIGINS)

.DEFAULT_GOAL := help
.PHONY: help build compile test verify coverage package run dev clean \
        docker-build docker-run db-up up down down-v logs \
        db-local-user db-local run-local

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

compile: ## Compile the sources
	$(MVN) compile

test: ## Run the unit tests
	$(MVN) test

verify: ## Run tests plus JaCoCo coverage report and 75% threshold check
	$(MVN) verify

coverage: verify ## Build the coverage report and print its location
	@echo "Coverage report: target/site/jacoco/index.html"

package: ## Build the runnable fat jar (skips tests)
	$(MVN) -DskipTests package

build: package ## Alias for package

$(JAR):
	$(MVN) -DskipTests package

run: $(JAR) ## Run the packaged jar (expects MariaDB, see db-up)
	$(RUN_ENV) java -jar $(JAR)

dev: package run ## Rebuild the jar, then run it

db-local-user: ## One-time: create the local MariaDB user (asks for sudo)
	sudo mariadb -e "CREATE USER IF NOT EXISTS '$(LOCAL_DB_USER)'@'localhost' IDENTIFIED BY '$(LOCAL_DB_PASSWORD)'; \
		GRANT ALL PRIVILEGES ON attendance_tracker.* TO '$(LOCAL_DB_USER)'@'localhost';"

db-local: ## Load the schema into local MariaDB (drops and recreates the tables!)
	mariadb -h127.0.0.1 -P3306 -u$(LOCAL_DB_USER) -p$(LOCAL_DB_PASSWORD) < ../attendance_tracker_v2.sql

run-local: DB_URL = $(LOCAL_DB_URL)
run-local: DB_USER = $(LOCAL_DB_USER)
run-local: DB_PASSWORD = $(LOCAL_DB_PASSWORD)
run-local: $(JAR) ## Run the jar against local MariaDB (no Docker)
	$(RUN_ENV) java -jar $(JAR)

clean: ## Remove build output
	$(MVN) clean

docker-build: ## Build the backend Docker image
	docker build -t $(IMAGE) .

docker-run: docker-build ## Run the backend image standalone (DB on the host)
	docker run --rm -p $(PORT):3000 --add-host=host.docker.internal:host-gateway \
		-e DB_URL=jdbc:mariadb://host.docker.internal:3307/attendance_tracker \
		-e DB_USER=$(DB_USER) -e DB_PASSWORD=$(DB_PASSWORD) \
		-e CORS_ORIGINS=$(CORS_ORIGINS) $(IMAGE)

db-up: ## Start only the MariaDB container (port 3307)
	$(COMPOSE) up -d db

up: ## Start MariaDB + backend with docker compose
	$(COMPOSE) up -d --build

down: ## Stop the compose stack
	$(COMPOSE) down

down-v: ## Stop the compose stack and drop the database volume
	$(COMPOSE) down -v

logs: ## Follow the backend container logs
	$(COMPOSE) logs -f server

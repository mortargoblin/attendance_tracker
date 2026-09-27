# Makefile for the Attendance Tracker backend.
# Wraps the Maven Wrapper and Docker commands; run `make help` for a list of targets.

MVN        := sh ./mvnw -B
JAR        := target/attendance-tracker-server.jar
IMAGE      := attendance-tracker-server
COMPOSE    := docker compose -f ../docker-compose.yml

# Runtime configuration (override on the command line, e.g. `make run PORT=8080`)
PORT         ?= 3000
DB_URL       ?= jdbc:mariadb://localhost:3307/attendance_tracker
DB_USER      ?= root
DB_PASSWORD  ?= root
CORS_ORIGINS ?= http://127.0.0.1:1337,http://localhost:1337

RUN_ENV := PORT=$(PORT) DB_URL=$(DB_URL) DB_USER=$(DB_USER) \
           DB_PASSWORD=$(DB_PASSWORD) CORS_ORIGINS=$(CORS_ORIGINS)

.DEFAULT_GOAL := help
.PHONY: help build compile test verify coverage package run dev clean \
        docker-build docker-run db-up up down down-v logs

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

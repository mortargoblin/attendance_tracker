Technology stack: Java, JavaFX, MariaDB
Reasoning behind the technologies: We chose to use the technologies that the lecturer support

## Running locally

1. Load `attendance_tracker_v2.sql` into MariaDB.
2. Start the backend from `server/`: `./mvnw package` then `java -jar target/attendance-tracker-server.jar`.
   Environment variables: `DB_URL`, `DB_USER`, `DB_PASSWORD`, `PORT` (default 3000) and
   `CORS_ORIGINS` (comma separated frontend origins, default `http://127.0.0.1:1337,http://localhost:1337`).
3. Serve the frontend from `client/`: `npm run serve`, then open http://127.0.0.1:1337.

The sample users in the SQL file have placeholder password hashes, so register new accounts to log in.

## Running with Docker

The backend ships with a multi-stage `server/Dockerfile` (Maven build stage + slim JRE runtime
stage) and a `docker-compose.yml` that also spins up MariaDB and loads `attendance_tracker_v2.sql`
automatically.

```
docker compose up -d --build
```

This starts:
- `db` — MariaDB 11, seeded from `attendance_tracker_v2.sql`, exposed on host port `3307`.
- `server` — the Javalin backend built from `server/Dockerfile`, exposed on host port `3000`.

Then serve the frontend as usual (`cd client && npm run serve`) and open http://127.0.0.1:1337.

Stop everything with `docker compose down` (add `-v` to also drop the database volume).

To build just the server image (e.g. for the Jenkins pipeline):

```
docker build -t attendance-tracker-server:latest server
```

## CI/CD with Jenkins

The root `Jenkinsfile` defines a declarative pipeline with these stages:

1. **Checkout** — pulls the latest commit from the configured Git repository.
2. **Build** — `mvnw clean compile` in `server/`.
3. **Unit Tests** — `mvnw test`, results published via the JUnit plugin.
4. **Code Coverage** — `mvnw verify` runs the JaCoCo `report`/`check` goals already configured in
   `server/pom.xml`; results are recorded with the **JaCoCo plugin**'s `jacoco` step (trend graph
   + per-build report under the build's sidebar), and the HTML report directory is archived as a
   build artifact. The build fails if line/branch coverage drops below 75%.
5. **Package** — builds the runnable fat jar and archives it.
6. **Docker Build** — builds the `attendance-tracker-server` image from `server/Dockerfile`.

The pipeline uses `isUnix()` to run `sh ./mvnw ...` on Linux/macOS agents and `bat mvnw.cmd ...`
on Windows agents, so it works either way without needing Maven installed separately on the agent
(it uses the checked-in Maven Wrapper).

### Setting up the Jenkins job

1. Install the required Jenkins plugins: **Pipeline**, **Git**, **JUnit**, **JaCoCo plugin**.
   (The pipeline uses the JaCoCo plugin's own `jacoco` step rather than the newer Coverage
   plugin's `recordCoverage` or the HTML Publisher plugin, so it works on a minimal Jenkins
   install — no extra reporting plugins required.)
2. Under *Manage Jenkins → Tools*, configure:
   - a JDK installation named `jdk21` (Java 21)
   - a Maven installation named `maven3`
   (or edit the `tools {}` block in the `Jenkinsfile` to match names already on your instance).
3. The **Docker Build** stage checks whether the `docker` CLI is on `PATH` before running; if
   it isn't found, the stage logs a warning and skips instead of failing the whole pipeline.
   To make it actually build the image:
   - Install Docker Desktop on the machine running the Jenkins agent.
   - If Jenkins runs as a Windows **service** (e.g. under `LocalSystem` or a service account),
     that service's `PATH` usually does *not* include `C:\Program Files\Docker\Docker\resources\bin`
     even if your own user account can run `docker` in a terminal. Either add that folder to the
     **System** `PATH` environment variable (not just the user `PATH`) and restart the Jenkins
     service, or configure the Jenkins service to run as a user account that has Docker Desktop
     set up, then restart the service so it picks up the new PATH.
4. Create a new **Pipeline** job (or a **Multibranch Pipeline** to build every branch/PR
   automatically), point it at this repository, and set the pipeline definition to
   *Pipeline script from SCM* using the `Jenkinsfile` at the repo root.
5. Optionally add a GitHub webhook (or poll SCM) so pushes to `main`/`master` trigger a build
   automatically.

Run it locally first to sanity-check the same commands the pipeline uses:

```
cd server
./mvnw clean verify
```

## API

All endpoints except register/login take `Authorization: Bearer <token>`. Errors are `{"error": "message"}`.

| Method | Path | Who |
| --- | --- | --- |
| POST | `/api/auth/register` | anyone |
| POST | `/api/auth/login` | anyone |
| POST | `/api/auth/logout` | logged in |
| GET | `/api/students` | teacher |
| GET | `/api/courses` | teacher, student |
| POST | `/api/courses` | teacher |
| GET | `/api/courses/{courseId}` | teacher of that course |
| POST | `/api/courses/{courseId}/sessions` | teacher of that course |
| GET | `/api/sessions/{sessionId}` | teacher of that course |
| POST | `/api/sessions/{sessionId}/end` | teacher of that course |
| POST | `/api/courses/{courseId}/attendance/confirm` | student enrolled in that course |

Request and response shapes are documented in `client/js/api.js`.

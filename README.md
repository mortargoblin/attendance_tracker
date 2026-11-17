# Attendance Tracker

## Project overview & objectives

Attendance Tracker is a web application for recording lecture attendance. Taking attendance by hand
is slow and easy to fake, so the system replaces it with a short-lived code.

- **Users:** teachers and students. The schema also has an `ADMIN` role reserved for future use.
- **Core functionality:** a teacher creates a course, enrolls students and starts a session. Starting
  a session generates a two-digit code that expires after a set time. Students confirm their attendance
  by entering the code. The teacher sees every student's status for each session and can export the
  table to Excel (`.xlsx`). Students see only their own attendance.
- **Goals:** attendance that is fast to record and hard to fake, role-based access so students see only
  their own data, and an automated build/test/deploy pipeline (Jenkins + Docker) with at least 75% test
  coverage.

## Technology stack & dependencies

Technology stack: Java, Javalin, MariaDB
Reasoning behind the technologies: We chose to use the technologies that the lecturer support

| Area | Technology / version |
| --- | --- |
| Runtime | JDK 21 (LTS), Node.js (for serving the frontend) |
| Build | Maven 3.9 via the checked-in Maven Wrapper (`mvnw`) |
| Backend | Javalin 6.7.0 (embedded Jetty), Jackson 2.19.0, SLF4J 2.0.17, bcrypt 0.10.2, FastExcel 0.20.2 |
| Database | MariaDB 11 (JDBC driver `mariadb-java-client` 3.5.3) |
| Frontend | Vanilla JavaScript (ES modules, hash router), Tailwind CSS 4, `serve` |
| Testing | JUnit 5.12.2, H2 2.3.232 (in-memory, `MODE=MariaDB`), fastexcel-reader, JaCoCo 0.8.13 |
| CI/CD & deployment | Jenkins (declarative `Jenkinsfile`), Docker (multi-stage `server/Dockerfile`), Docker Compose |
| Localization | ECMAScript `Intl` API + a small custom `t()` lookup with JSON files per language (no library). UI in English, Finnish, Farsi (RTL), Japanese, Russian and Mongolian, see [`client/LOCALIZATION.md`](client/LOCALIZATION.md). Database: utf8mb4 + translation tables, see [Database localization](#database-localization). |
| Client quality | `node --test` unit tests, ESLint 9 (`client/eslint.config.js`) |

## Design & development methodology

**Architecture.** A layered client–server architecture:

```
Browser (client/)  --HTTP/JSON-->  REST API (server/, Javalin)  --JDBC-->  MariaDB
```

- **Presentation layer:** `client/` is a single-page app. `router.js` maps hash routes to page
  modules in `js/pages/` and guards each route by role. `store.js` keeps the session token, and
  `api.js` wraps every backend call.
- **API / application layer:** `server.java` creates the Javalin app and registers one handler class
  per resource: `AuthApi`, `CourseApi`, `SessionApi` and `AttendanceApi`. Cross-cutting concerns live in
  their own classes: `Auth` handles bearer-token authentication and role checks, `Passwords` handles
  bcrypt hashing, and `ApiError` produces uniform JSON errors. CORS and the security headers are set in
  `server.java`.
- **Data layer:** `Database` builds a MariaDB connection pool from environment variables. Handlers get
  connections through a `ConnectionSource` interface (dependency injection). The same interface lets
  the tests swap in H2 or a fake connection. A `Clock` is injected as well, so tests can control code
  expiry.

**UML and ER design.** All diagrams are in [`docs/diagrams/`](docs/diagrams/) (PlantUML source + PNG/SVG):
[ER diagram](docs/diagrams/er-diagram.png), [class diagram](docs/diagrams/class-diagram.png),
[component/deployment diagram](docs/diagrams/component-diagram.png),
[sequence diagram](docs/diagrams/sequence-confirm-attendance.png) and the
[use case diagram](docs/diagrams/use-case-diagram.png).
- ER model, implemented in `attendance_tracker_v2.sql` (+ `database_localization.sql`, see below):
  - `users` (role: STUDENT/TEACHER/ADMIN), with one teacher per course: `users 1–N courses`.
  - `courses 1–N sessions`. `sessions` is a weak entity, keyed by `(course_id, seq_no)`.
  - `users N–M courses` through `enrollments`.
  - `users N–M sessions` through `attendances` (status PRESENT/LATE/ABSENT/EXCUSED).
  - Foreign keys, unique keys and `CHECK` constraints enforce integrity in the database itself.
  - Localization: `languages 1–N course_translations / session_translations / enum_translations`.

**Development process.** We worked in Scrum sprints. The vision and backlog are in
`Documents/productvision.docx` and `Documents/InitialProductBacklog.docx`, and each sprint ended with a
review (`Documents/sprint1review.docx`, `spint2review.pdf`, `sprint3review.pdf`, `sprint5review.docx`,
[`docs/sprint6-report.md`](docs/sprint6-report.md)). The acceptance test plan is in
[`docs/acceptance-test-plan.md`](docs/acceptance-test-plan.md). Work was version-controlled
in Git. Every commit is built and tested automatically by the Jenkins pipeline described below.

## Functional testing

**Methodology.** The backend is verified with automated JUnit 5 tests in `server/src/test/`:

- `ApiTest` (36 tests): end-to-end functional tests. They start the real Javalin server and call it
  over HTTP with `java.net.http.HttpClient`. The database is an in-memory H2 instance in MariaDB mode,
  built from `src/test/resources/schema.sql` and emptied before each test. A controllable `TestClock`
  tests code expiry. The tests are grouped by feature:
  - **auth:** register, login, logout, duplicate/invalid input, bad or expired tokens.
  - **courses:** creation, validation, visibility per role.
  - **attendance sessions:** code generation, enrollment and course checks, wrong codes, expiry, ending a session.
  - **attendance report:** per-student status, Excel export read back with fastexcel-reader, student sees only own row.
  - **http:** CORS origins, security headers, database errors not leaked.
- `ServerTest` (5 tests): base routes and the 404 response, run against a fake database connection.
- `DatabaseTest` and `AppTest` (including parameterized cases): configuration defaults, connection handling and
  port parsing.

The client has its own unit tests in `client/test/`, run with Node's built-in test runner (`cd client && npm test`,
no dependencies): i18n (plural rules, placeholders, locale digits, server error translation), consistency
of every `locales/*.json` file with English, the routing/role rules, and the page logic that has no DOM.
`npm run lint` runs ESLint with the rules in `client/eslint.config.js`.

**Evidence.** `./mvnw clean verify` runs the whole suite. It writes JUnit reports to
`server/target/surefire-reports/` and a JaCoCo coverage report to
`server/target/site/jacoco/index.html`. The build fails if line or branch coverage falls below 75%.
Jenkins runs the same command on every new commit and publishes the test results and coverage
trend for each build (see *CI/CD with Jenkins*). Each sprint's features were also tested by hand in the
browser and demonstrated in the sprint reviews.

## Static code analysis

The code is analysed with **SonarQube** and **SonarScanner**. **PMD** (Java) and **ESLint**
(JavaScript) provide per-method complexity and length metrics. The full Sprint 6 Statistical Code
Review Report has the metrics, charts, SonarQube screenshots, triaged issues and refactoring
recommendations: [`docs/code-review/README.md`](docs/code-review/README.md).

Latest results (17 Nov 2026): quality gate **passed**, 2,045 lines of code, 0 % duplication,
10 open issues (5 bugs, 2 vulnerabilities that were reviewed as false positive / safe, 3 code
smells), 1 Java method over a cyclomatic complexity of 10.

Run it locally:

```
docker compose -f docker-compose.sonar.yml up -d          # SonarQube on http://localhost:9000
cd server && ./mvnw clean verify pmd:pmd pmd:cpd dependency:copy-dependencies -DincludeScope=test && cd ..
docker run --rm -e SONAR_HOST_URL=http://host.docker.internal:9000 -e SONAR_TOKEN=<token> -v "$(pwd):/usr/src" sonarsource/sonar-scanner-cli
```

- `sonar-project.properties`: scanner settings (sources, compiled classes, JaCoCo coverage report).
- `server/config/pmd-metrics.xml`: PMD ruleset that reports complexity and size for every method.
  It is not bound to the build, so it never fails `mvnw verify`.
- `docs/code-review/scripts/collect_metrics.py`: turns the PMD, ESLint and SonarQube output into
  the report's tables and charts.

## Running locally

Prerequisites: JDK 21+, Node.js, and MariaDB (or Docker; see below). On Windows, `start.bat`
builds the backend and starts both the backend and the frontend in one step.

1. Load `attendance_tracker_v2.sql`, then `database_localization.sql` (and optionally `demo_data.sql`) into MariaDB.
2. Start the backend from `server/`: `./mvnw package` then `java -jar target/attendance-tracker-server.jar`.
   Environment variables: `DB_URL`, `DB_USER`, `DB_PASSWORD`, `PORT` (default 3000) and
   `CORS_ORIGINS` (comma separated frontend origins, default `http://127.0.0.1:1337,http://localhost:1337`).
3. Serve the frontend from `client/`: `npm run serve`, then open http://127.0.0.1:1337.
4. Run the tests and coverage check from `server/`: `./mvnw clean verify`. This needs no database.

The sample users in the SQL file have placeholder password hashes, so register new accounts to log in.

## Running with Docker

The backend ships with a multi-stage `server/Dockerfile` (Maven build stage + slim JRE runtime
stage) and a `docker-compose.yml` that also spins up MariaDB and loads `attendance_tracker_v2.sql`
automatically.

```
docker compose up -d --build
```

This starts:
- `db` — MariaDB 11 (utf8mb4), seeded from `attendance_tracker_v2.sql`, `database_localization.sql` and
  `demo_data.sql`, exposed on host port `3307`.
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
5. Set up automatic builds on new commits/releases — pick one:

   **Option A — SCM polling (simplest, works for a Jenkins running on your own machine with no
   public URL). This is already enabled in the `Jenkinsfile`'s `triggers {}` block
   (`pollSCM('H/2 * * * *')`):**
   - Jenkins checks the repo every 2 minutes and only actually starts a build if there are new
     commits — so pushing a commit, or tagging/publishing a new version, triggers a build within
     a couple of minutes without needing Jenkins to be reachable from the internet.
   - The **first** time you create the Pipeline job in Jenkins, this trigger only takes effect
     after the first successful build (Jenkins needs to run the `Jenkinsfile` once to discover
     the `triggers {}` block). So click *Build Now* once manually after creating the job.

   **Option B — GitHub webhook (instant trigger, needs Jenkins reachable from the internet):**
   1. Install the **GitHub** plugin in Jenkins (Manage Jenkins → Plugins).
   2. In the job configuration, under *Build Triggers*, tick **"GitHub hook trigger for GITScm
      polling"**.
   3. Make sure Jenkins is reachable from GitHub's servers at some public URL — if Jenkins runs
      on your local machine, expose it first (e.g. `ngrok http 8080`, or port-forward + a domain).
   4. In the GitHub repo → *Settings → Webhooks → Add webhook*, set:
      - Payload URL: `http://<your-public-jenkins-url>/github-webhook/` (trailing slash matters)
      - Content type: `application/json`
      - Events: at least "Just the push event" (also enable "Releases" if you want a build
        specifically when you publish a GitHub Release)
   5. Push a commit (or publish a release) — GitHub calls the webhook, Jenkins starts the build
      almost immediately instead of waiting for the next poll.

   If you specifically want a build only when a **GitHub Release** is published (rather than on
   every push), select the **"Releases"** event when creating the webhook in step 4, and add a
   `when { triggeredBy 'GenericCause' }`/`GitHub Release` check via the **GitHub plugin**'s
   release trigger, or simply keep pushing a `vX.Y.Z` tag and let the existing push-based trigger
   build it — the pipeline doesn't need to know the difference, it just builds whatever commit
   Jenkins checks out.

Run it locally first to sanity-check the same commands the pipeline uses:

```
cd server
./mvnw clean verify
```

## Database localization

Sprint 6 extends localization from the UI into the database. Full plan, design choices and validation results:
[`docs/database-localization.md`](docs/database-localization.md).

**Method: translation tables with fallback.** Language-neutral data stays as it is: ENUM codes like `PRESENT`,
dates and numbers. Text that people read is translated in separate tables keyed by `(entity id, lang_code)`.
This is created by [`database_localization.sql`](database_localization.sql), an additive migration that
leaves the existing tables and backend queries unchanged.

| Object | Purpose |
| --- | --- |
| `languages` | The six UI languages (`en` default, `fi`, `fa`, `ja`, `ru`, `mn`), with text direction (fa = RTL) and the collation that sorts each correctly (fi → `utf8mb4_swedish_ci`) |
| `course_translations`, `session_translations` | Course name/description and session topic per language. The original column keeps the text as typed |
| `enum_translations` | Labels for ENUM values (`attendances.status`, `enrollments.status`, `users.role`) in every language |
| `v_courses_i18n`, `v_sessions_i18n`, `v_attendance_i18n` | Every row × every language, using `COALESCE(translation, original)`. Query with `WHERE lang_code = ?` |

**Encoding.** UTF-8 (`utf8mb4`, which also holds 4-byte characters such as emoji) at every layer: MariaDB
server flags in `docker-compose.yml`, database and table defaults, `SET NAMES utf8mb4` in the SQL scripts,
MariaDB Connector/J, and UTF-8 JSON to the browser.

**Language selection.** The client sends the UI language with every request (`Accept-Language: fi, en;q=0.5`),
so the backend can bind it to `lang_code` in the views. Dates and numbers are stored language-neutral and
formatted in the browser with `Intl`.

**Validation.** [`docs/database-localization-validation.sql`](docs/database-localization-validation.sql) checks the
charsets, multi-byte storage, 4-byte round trip, retrieval and fallback in every language, label completeness,
non-Latin search and per-locale sorting. All checks pass (results in the report).

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
| GET | `/api/courses/{courseId}/attendance` | teacher of that course (every student), or a student enrolled in it (only their own row) |
| GET | `/api/courses/{courseId}/attendance/export` | teacher of that course |
| POST | `/api/courses/{courseId}/sessions` | teacher of that course |
| GET | `/api/sessions/{sessionId}` | teacher of that course |
| POST | `/api/sessions/{sessionId}/end` | teacher of that course |
| POST | `/api/sessions/{sessionId}/students/{studentId}/present` | teacher of that course (manual mark) |
| POST | `/api/courses/{courseId}/attendance/confirm` | student enrolled in that course |

Request and response shapes are documented in `client/js/api.js`.

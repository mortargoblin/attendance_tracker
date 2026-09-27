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

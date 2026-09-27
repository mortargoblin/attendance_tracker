Technology stack: Java, JavaFX, MariaDB
Reasoning behind the technologies: We chose to use the technologies that the lecturer support

## Running locally

1. Load `attendance_tracker_v2.sql` into MariaDB.
2. Start the backend from `server/`: `./mvnw package` then `java -jar target/attendance-tracker-server.jar`.
   Environment variables: `DB_URL`, `DB_USER`, `DB_PASSWORD`, `PORT` (default 3000) and
   `CORS_ORIGINS` (comma separated frontend origins, default `http://127.0.0.1:1337,http://localhost:1337`).
3. Serve the frontend from `client/`: `npm run serve`, then open http://127.0.0.1:1337.

The sample users in the SQL file have placeholder password hashes, so register new accounts to log in.

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
| POST | `/api/attendance/confirm` | student enrolled in the course |

Request and response shapes are documented in `client/js/api.js`.

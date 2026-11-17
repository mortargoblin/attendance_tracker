# Acceptance Test Plan — Attendance Tracker

| | |
| --- | --- |
| Version | 1.0 (Sprint 6) |
| Date | 2026-11-17 |
| Product owner | Course lecturer |
| Status | Planned. Tests are designed here and run in the acceptance phase |

## 1. Purpose and scope

This plan defines how the product owner decides whether Attendance Tracker is ready to accept. It
lists the requirements, measurable acceptance criteria for each, and test cases with expected
outcomes. It also has a coverage matrix that maps every requirement to its tests.

**In scope:** the web client (`client/`), the REST API (`server/`), the MariaDB database including
the localization tables, and the Docker deployment.
**Out of scope:** the internals of the Jenkins pipeline (covered by the CI setup), the `ADMIN` role (reserved, no UI),
and load beyond one university department (section 6.3).

## 2. References

- Product vision and initial backlog: `Documents/productvision.docx`, `Documents/InitialProductBacklog.docx`
- Sprint requirements 1–6 and sprint reviews in `Documents/`
- API: README section *API*. Localization: `client/LOCALIZATION.md`, `docs/database-localization.md`
- Design: `docs/diagrams/` (use case, ER, class, component, sequence)

## 3. Requirements under test

User stories from the initial backlog (T = teacher) and the later sprints (S = student, L = localization, Q = quality).

| ID | User story / requirement | Origin |
| --- | --- | --- |
| **T1** | As a teacher, I want to log in securely so that only I can access attendance data. | Backlog |
| **T2** | As a teacher, I want to mark attendance digitally so that no paper sheets are needed. | Backlog |
| **T3** | As a teacher, I want to edit past attendance so that errors can be corrected. | Backlog |
| **T4** | As a teacher, I want attendance statistics so that I can spot absences. | Backlog |
| **T5** | As a teacher, I want to manage courses and students so that lists stay current. | Backlog |
| **T6** | As a teacher, I want to export a course's attendance to Excel. | Sprint 3 |
| **S1** | As a student, I want to confirm my attendance by entering the code shown in class. | Sprints 1–2 |
| **S2** | As a student, I want to see my own attendance per course, and nobody else's. | Sprint 3 |
| **L1** | As a user, I want the UI in my language (en, fi, fa, ja, ru, mn), including RTL layout for Farsi. | Sprint 5 |
| **L2** | As a user, I want dates, numbers and plurals formatted the way my language does it. | Sprint 5 |
| **L3** | As a user, I want text in any script stored and shown correctly, and translated content in my language where it exists. | Sprint 6 |
| **Q1** | The system responds quickly enough for use during a lecture. | Non-functional |
| **Q2** | The system is reliable: no data loss, clear errors, survives restarts. | Non-functional |
| **Q3** | The system is secure: role-based access, hashed passwords, no leaked internals. | Non-functional |
| **Q4** | The system is usable without training on desktop and phone. | Non-functional |

## 4. Acceptance criteria

Each criterion is measurable. A requirement is accepted when all of its criteria pass.

| ID | Acceptance criteria |
| --- | --- |
| T1 | AC1: Valid credentials log in and open the role's home page. AC2: A wrong password or unknown email gives the same message "Incorrect email or password.". AC3: Passwords are stored only as bcrypt hashes (60-char `$2…`). AC4: After logout, or 12 h, the token is rejected with 401. |
| T2 | AC1: Starting a session shows a 2-digit code and a 15:00 countdown within 2 s. AC2: The roster updates with each confirmation within 3 s (2 s polling). AC3: The teacher can end the session early, after which the code no longer works. AC4: The teacher can mark a pending student present by hand. |
| T3 | AC1: The teacher can change the status of any student in a past session (present/late/absent/excused). AC2: The change is visible in the attendance table and the export. |
| T4 | AC1: The course attendance table shows one row per enrolled student and one column per session. AC2: Each row shows attended/total and a percentage, where present + late count as attended. AC3: The numbers match the database (`v_attendance_summary`). |
| T5 | AC1: A teacher can create a course with a name (max 160 characters, unique per teacher) and enroll students. AC2: With more than 20 students, the picker switches to search (≥ 3 characters, by name or email). AC3: Invalid input shows a specific error. |
| T6 | AC1: Export downloads an `.xlsx` that opens in Excel/LibreOffice. AC2: It has the same students, sessions, statuses and totals as the screen. |
| S1 | AC1: A correct code marks the student present and shows the confirmation time. AC2: A wrong code, an expired code, or a course the student isn't enrolled in is rejected with a specific message. AC3: Confirming twice is not an error and shows the original time. AC4: Persian/Arabic-Indic digits are accepted. |
| S2 | AC1: The student sees each session and their status, plus a summary percentage. AC2: The API never returns other students' rows to a student, and the teacher-only endpoints return 403. |
| L1 | AC1: All visible UI text is translated in all six languages (no raw keys like `teacher.session.end`). AC2: The language choice persists across reloads. AC3: In Farsi the layout is mirrored (`dir="rtl"`), while the attendance code and emails stay LTR. |
| L2 | AC1: Dates use the locale's calendar and digits (Farsi: Solar Hijri, ۰–۹). AC2: Plural forms are correct (ru: 1 занятие / 3 занятия / 5 занятий). AC3: Server error messages appear in the UI language. |
| L3 | AC1: Names and course names in Latin with diacritics, Cyrillic, Arabic script and CJK are stored and shown unchanged. AC2: Translated course names are returned for the requested language, and untranslated ones fall back to the original. AC3: All tables and columns use utf8mb4. |
| Q1 | AC1: The 95th percentile API response time is < 500 ms with 30 concurrent students confirming. AC2: The first page load is < 2 s on a typical campus network. |
| Q2 | AC1: 0 failed or duplicated confirmations when 30 students submit at the same second. AC2: After a backend restart, all data is intact and users only have to log in again. AC3: Database errors show a generic message, never SQL or a stack trace. |
| Q3 | AC1: Every protected endpoint returns 401 without a token and 403 for the wrong role. AC2: Teachers cannot see other teachers' courses (404). AC3: User text is HTML-escaped (no XSS). |
| Q4 | AC1: A first-time student can confirm attendance in ≤ 30 s, and a teacher can start a session in ≤ 3 clicks from login. AC2: Every page works at 360 px width without horizontal scrolling (except the wide attendance table, which scrolls inside its card). AC3: All form fields have labels. |

## 5. Test environment

| Item | Setup |
| --- | --- |
| Deployment | `docker compose down -v && docker compose up -d --build` (MariaDB 11 + backend). Client served with `cd client && npm run serve` |
| Data | `attendance_tracker_v2.sql` + `database_localization.sql` + `demo_data.sql` (1 demo teacher, 104 students including Cyrillic, Japanese and Persian names). Password for all demo users: `password123` |
| Browsers | Latest Chrome and Firefox on desktop. Chrome on Android, Safari on iOS |
| Tools | Browser devtools (network timing), `curl`, k6 or JMeter for load tests, LibreOffice Calc for exports |
| Roles | Teacher: `teacher@example.com`. Students: e.g. `aino.virtanen@example.com`, `ivan.petrov@example.com`, `sara.mohammadi@example.com` |

**Entry criteria:** all unit tests pass (`server: ./mvnw clean verify`, `client: npm test`), coverage ≥ 75 %, and
the Jenkins build is green.
**Exit criteria:** every *Critical* and *High* test passes. Any failing *Medium/Low* test has an accepted backlog item.

## 6. Test cases

Priority: **C** critical · **H** high · **M** medium · **L** low.

### 6.1 Functional tests

| ID | Req. | Pri. | Preconditions | Steps | Expected outcome |
| --- | --- | --- | --- | --- | --- |
| AT-F-01 | T1 | C | Logged out | Log in as the demo teacher | Teacher dashboard opens. The header shows "Demo Teacher" and a log-out button |
| AT-F-02 | T1 | C | Logged out | Log in with a wrong password, then with an unknown email | Both show "Incorrect email or password.". No hint which part was wrong |
| AT-F-03 | T1, Q3 | H | DB access | `SELECT password_hash FROM users WHERE email='teacher@example.com'` | A 60-character bcrypt hash, never the plain password |
| AT-F-04 | T1 | H | Logged in | Log out, then call `GET /api/courses` with the old token | 401 "Your session has expired. Please log in again." |
| AT-F-05 | T5 | C | Teacher | Create course "Testikurssi" with 2 students chosen by search ("aino", "ivan") | Course appears in the list with "2 students" |
| AT-F-06 | T5 | H | Course "Testikurssi" exists | Create another course named "testikurssi" | Error "You already have a course with that name." |
| AT-F-07 | T5 | M | Teacher | Create a course with an empty name, then with 161 characters | Specific errors for required / too long. Nothing is created |
| AT-F-08 | T5 | M | > 20 students | Type "ai" in the student search, then "ain" | 2 characters show the hint. 3 characters show matching students by name or email |
| AT-F-09 | T2 | C | Course with students | Click "Start attendance session" | Session page shows a 2-digit code, "Active — expires in 15:00" counting down, and every student "Pending" |
| AT-F-10 | S1, T2 | C | Active session (AT-F-09) | Student enters the code in "Enter code" | Student sees "You're marked present for … — hh:mm". Teacher roster shows "Confirmed hh:mm" within 3 s |
| AT-F-11 | S1 | H | Same student, same session | Enter the code again | "You're already marked present … (confirmed at hh:mm)" with the original time |
| AT-F-12 | S1 | H | Active session | Student enters a different code | "That code doesn't match an active session for this course." |
| AT-F-13 | S1 | H | Session ended or > 15 min old | Student enters the old code | "This code has expired." |
| AT-F-14 | T2 | H | Active session | Teacher clicks "End session". A student enters the code | Status "Ended", button disabled. Student gets "This code has expired." |
| AT-F-15 | T2 | H | Active session, student pending | Teacher clicks "Mark present" for the student | Badge becomes "Confirmed hh:mm". The attendance table shows present |
| AT-F-16 | T3 | H | A past session with an absent student | Teacher changes the student's status to "Excused" | Status saved, and the table and export show "Excused". *Currently only "mark present" during the session view exists. This case is expected to fail until editing past attendance is built (backlog item)* |
| AT-F-17 | T4 | C | Course with ≥ 2 sessions | Open "View attendance" | Table: rows = enrolled students, columns = sessions in order. Totals "x/y (z %)" match a manual count (present + late) |
| AT-F-18 | T6 | H | AT-F-17 | Click "Export to Excel", open the file | File `<course> attendance.xlsx` opens. Same rows, columns, colored statuses, attended and % columns |
| AT-F-19 | S2 | C | Student enrolled in the course | Student opens "View attendance" | Only their own sessions/statuses and "Attended x of y sessions (z %)" |
| AT-F-20 | S2, Q3 | C | Student token | `GET /api/courses/{id}/attendance` for a course they're not in. `GET .../export`. `GET /api/students` | 404, 403, 403 |
| AT-F-21 | Q3 | C | Two teachers | Teacher B opens teacher A's course/session URL | "Course not found." / "Session not found." (404), no data |
| AT-F-22 | Q3 | H | Teacher | Create a course named `<img src=x onerror=alert(1)>` | Name shows as text everywhere. No script runs |
| AT-F-23 | L1 | C | Any page | Switch through all six languages on every page | No untranslated text and no raw keys. The page re-renders in place |
| AT-F-24 | L1 | H | Language set to Suomi | Reload the browser | Still Finnish |
| AT-F-25 | L1 | H | Farsi | Open the teacher attendance table and the code entry page | Layout mirrored, student column on the right, back arrow points right. Code and emails stay LTR |
| AT-F-26 | L2 | H | Russian, course with 1, 3 and 5 sessions | Look at the session counts | "1 занятие", "3 занятия", "5 занятий" |
| AT-F-27 | L2 | M | Farsi | Look at dates and the countdown | Solar Hijri dates and Persian digits (e.g. ۱۴:۵۹) |
| AT-F-28 | S1, L2 | M | Farsi keyboard | Enter the code with Persian digits (۴۲) | Accepted as 42 |
| AT-F-29 | L2 | M | Japanese | Trigger an error (wrong code) | Error message in Japanese |
| AT-F-30 | L3 | C | Demo data | Teacher creates a course named `データベース入門 — Käyttöliittymät` and enrolls Иван Петров, 山田 太郎, سارا محمدی | All names and the course name display correctly in every language, and in the export |
| AT-F-31 | L3 | H | `database_localization.sql` loaded | `SELECT name FROM v_courses_i18n WHERE course_id = 3 AND lang_code IN ('ja','fa')` | ja: "Webサーバープログラミング". fa: falls back to the original "Web-palvelinohjelmointi" |
| AT-F-32 | L3 | H | Same | Run `docs/database-localization-validation.sql` | V1–V12 give the expected results (V3 and V8 return no rows) |

### 6.2 Usability tests

Run with at least 3 students and 1 teacher who haven't used the app before. Observe, don't help.

| ID | Req. | Pri. | Task given to the participant | Expected outcome / measure |
| --- | --- | --- | --- | --- |
| AT-U-01 | Q4, S1 | C | "Your teacher shows code NN. Mark yourself present." (phone, logged out) | Done in ≤ 30 s without help, including login |
| AT-U-02 | Q4, T2 | C | "Start taking attendance for course X." | ≤ 3 clicks after login. The code is readable from the back of a classroom (≥ 72 px font, projected) |
| AT-U-03 | Q4, T4 | H | "Which students have attended less than 50 %?" | Answered correctly in ≤ 60 s from the attendance table |
| AT-U-04 | Q4, L1 | H | Native speaker of fi / ru / fa / ja / mn: "Change the language to yours and register." | Finds the selector by its native name. Rates the translation ≥ 4/5 for understandability |
| AT-U-05 | Q4 | M | Use every page at 360 px width (phone) | No horizontal page scroll. Buttons ≥ 40 px tall. The table scrolls inside its card |
| AT-U-06 | Q4 | M | Keyboard only: log in, enter a code, log out | Possible without a mouse. Focus is visible |
| AT-U-07 | Q4 | M | Screen reader (NVDA/VoiceOver) on the login and code pages | Every field announces its label. Error messages are read out |
| AT-U-08 | Q4 | L | After the tasks: SUS questionnaire | Mean SUS score ≥ 70 |

### 6.3 Performance and reliability tests

| ID | Req. | Pri. | Setup | Steps | Expected outcome |
| --- | --- | --- | --- | --- | --- |
| AT-P-01 | Q1 | H | 1 active session, 30 enrolled student accounts | Load tool: 30 virtual students each log in and confirm once within 5 s | p95 response < 500 ms, 0 errors |
| AT-P-02 | Q1 | H | 10 teachers each polling a session every 2 s, 15 min | Measure `GET /api/sessions/{id}` | p95 < 200 ms. Server CPU < 50 % on a 2-vCPU host |
| AT-P-03 | Q1 | M | Course with 100 students × 30 sessions | Open the attendance table. Export to Excel | Table renders < 2 s. Export downloads < 3 s |
| AT-P-04 | Q1 | M | 104 students | Type in the student search | Results < 500 ms after the 250 ms typing pause |
| AT-P-05 | Q1 | M | Desktop browser, cold cache | Load the login page | DOMContentLoaded < 2 s. Total transfer < 300 kB |
| AT-R-01 | Q2 | C | AT-P-01 | Check the database afterwards | Exactly one `attendances` row per student (unique key), 30 PRESENT, no duplicates |
| AT-R-02 | Q2 | C | 50 sessions started at the same time (more than half the 100 codes) | Start sessions in parallel | All active codes are distinct. Once all 100 are in use, a clear "All attendance codes are in use" (503) |
| AT-R-03 | Q2 | H | Data entered | `docker compose restart server` | All courses/sessions/attendance intact. Users are asked to log in again (tokens are in memory) |
| AT-R-04 | Q2 | H | Running system | Stop the `db` container and use the app | Generic "Something went wrong on the server…". No SQL in the response. The app recovers when `db` returns |
| AT-R-05 | Q2 | H | Teacher session page open | Disconnect the network for 10 s, then reconnect | Page keeps the last state, then resumes polling with no reload needed |
| AT-R-06 | Q2 | M | 12 h token lifetime | Wait or manipulate the clock past 12 h | 401, then redirect to login. Logging in again works |
| AT-R-07 | Q2 | M | Running system | `docker compose down` then `up` (without `-v`) | All data still there |
| AT-R-08 | Q2 | M | Backend | Send a 100 kB request body / invalid JSON | 413 / "The request body is not valid JSON." The server keeps running |

## 7. Coverage matrix

✔ = the test verifies this requirement.

| Test \ Req. | T1 | T2 | T3 | T4 | T5 | T6 | S1 | S2 | L1 | L2 | L3 | Q1 | Q2 | Q3 | Q4 |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| AT-F-01–04 | ✔ | | | | | | | | | | | | | ✔ | |
| AT-F-05–08 | | | | | ✔ | | | | | | | | | | |
| AT-F-09, 14, 15 | | ✔ | | | | | | | | | | | | | |
| AT-F-10–13 | | ✔ | | | | | ✔ | | | | | | | | |
| AT-F-16 | | | ✔ | | | | | | | | | | | | |
| AT-F-17 | | | | ✔ | | | | | | | | | | | |
| AT-F-18 | | | | | | ✔ | | | | | | | | | |
| AT-F-19–20 | | | | | | | | ✔ | | | | | | ✔ | |
| AT-F-21–22 | | | | | | | | | | | | | | ✔ | |
| AT-F-23–25 | | | | | | | | | ✔ | | | | | | |
| AT-F-26–29 | | | | | | | ✔ | | | ✔ | | | | | |
| AT-F-30–32 | | | | | | ✔ | | | | | ✔ | | | | |
| AT-U-01 | | | | | | | ✔ | | | | | | | | ✔ |
| AT-U-02 | | ✔ | | | | | | | | | | | | | ✔ |
| AT-U-03 | | | | ✔ | | | | | | | | | | | ✔ |
| AT-U-04 | | | | | | | | | ✔ | | | | | | ✔ |
| AT-U-05–08 | | | | | | | | | | | | | | | ✔ |
| AT-P-01–05 | | ✔ | | ✔ | ✔ | ✔ | ✔ | | | | | ✔ | | | |
| AT-R-01–08 | ✔ | ✔ | | | | | ✔ | | | | | | ✔ | | |

| Requirement | # tests | Critical tests |
| --- | :-: | --- |
| T1 Secure login | 6 | AT-F-01 |
| T2 Digital attendance | 11 | AT-F-09, AT-F-10, AT-U-02 |
| T3 Edit past attendance | 1 | – (expected to fail, feature pending) |
| T4 Statistics | 4 | AT-F-17 |
| T5 Manage courses & students | 6 | AT-F-05 |
| T6 Excel export | 4 | – |
| S1 Confirm with code | 11 | AT-F-10, AT-U-01, AT-R-01 |
| S2 Own attendance | 2 | AT-F-19, AT-F-20 |
| L1 UI language | 4 | AT-F-23 |
| L2 Locale formatting | 5 | – |
| L3 Multilingual data | 3 | AT-F-30 |
| Q1 Performance | 5 | – |
| Q2 Reliability | 8 | AT-R-01, AT-R-02 |
| Q3 Security | 7 | AT-F-20, AT-F-21 |
| Q4 Usability | 11 | AT-U-01, AT-U-02 |

Every requirement has at least one test. Requirement T3 is only partly built. Its test is kept so
that it fails visibly until the feature is done.

## 8. Defects and sign-off

- Each failed step is logged in the backlog (Trello) with the test ID, steps, expected and actual
  result, screenshot, and severity (Critical: blocks a core task or loses data. High: wrong result
  with a workaround. Medium: cosmetic or translation error in a core flow. Low: other cosmetic).
- Retest after the fix, and re-run the related automated tests.
- Acceptance is signed off by the product owner in the final sprint review once the exit criteria in
  section 5 are met.

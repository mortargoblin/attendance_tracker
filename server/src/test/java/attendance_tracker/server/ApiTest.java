package attendance_tracker.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.Javalin;
import org.dhatim.fastexcel.reader.ReadableWorkbook;
import org.dhatim.fastexcel.reader.Row;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Drives the REST API over HTTP against an in-memory H2 database built from src/test/resources/schema.sql. */
@DisplayName("REST API")
class ApiTest {

    private static final String DB_URL = "jdbc:h2:mem:api_test;MODE=MariaDB;DB_CLOSE_DELAY=-1";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TestClock clock = new TestClock();
    private static Javalin app;
    private static HttpClient client;

    /** A clock the tests can move forward to expire codes and tokens. */
    static final class TestClock extends Clock {
        volatile Instant now = Instant.parse("2026-09-01T09:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    record Res(int status, JsonNode body) {
        String error() {
            return body.path("error").asText();
        }
    }

    @BeforeAll
    static void startServer() throws Exception {
        try (Connection c = DriverManager.getConnection(DB_URL); Statement s = c.createStatement();
             InputStream schema = ApiTest.class.getResourceAsStream("/schema.sql")) {
            s.execute(new String(schema.readAllBytes(), StandardCharsets.UTF_8));
        }
        app = server.create(() -> DriverManager.getConnection(DB_URL), clock, 4, List.of("http://localhost:1337")).start(0);
        client = HttpClient.newHttpClient();
    }

    @AfterAll
    static void stopServer() {
        app.stop();
    }

    @BeforeEach
    void emptyDatabase() throws SQLException {
        try (Connection c = DriverManager.getConnection(DB_URL); Statement s = c.createStatement()) {
            s.execute("SET REFERENTIAL_INTEGRITY FALSE");
            for (String table : List.of("attendances", "enrollments", "sessions", "courses", "users")) {
                s.execute("TRUNCATE TABLE " + table + " RESTART IDENTITY");
            }
            s.execute("SET REFERENTIAL_INTEGRITY TRUE");
        }
        clock.advance(Duration.ofDays(1));
    }

    // --- helpers ---

    private static Res call(String method, String path, String token, Object body) throws IOException, InterruptedException {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + app.port() + path))
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofString(body instanceof String s ? s : JSON.writeValueAsString(body)))
                .header("Content-Type", "application/json");
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        HttpResponse<String> response = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        JsonNode json = response.body().isEmpty() ? JSON.nullNode() : JSON.readTree(response.body());
        return new Res(response.statusCode(), json);
    }

    private static Res get(String path, String token) throws IOException, InterruptedException {
        return call("GET", path, token, null);
    }

    private static Res post(String path, String token, Object body) throws IOException, InterruptedException {
        return call("POST", path, token, body);
    }

    private static Res register(String name, String email, String role) throws IOException, InterruptedException {
        return post("/api/auth/register", null, Map.of("name", name, "email", email, "password", "secret1", "role", role));
    }

    /** Registers and returns the token plus user id. */
    private static User user(String name, String email, String role) throws IOException, InterruptedException {
        Res res = register(name, email, role);
        assertEquals(201, res.status(), res.body().toString());
        return new User(res.body().get("token").asText(), res.body().get("user").get("id").asLong());
    }

    record User(String token, long id) {
    }

    private static long createCourse(User teacher, String name, long... studentIds) throws IOException, InterruptedException {
        Res res = post("/api/courses", teacher.token(), Map.of("name", name, "studentIds", studentIds));
        assertEquals(201, res.status(), res.body().toString());
        return res.body().get("id").asLong();
    }

    private static void sql(String statement) throws SQLException {
        try (Connection c = DriverManager.getConnection(DB_URL); Statement s = c.createStatement()) {
            s.execute(statement);
        }
    }

    private static String sqlString(String query) throws SQLException {
        try (Connection c = DriverManager.getConnection(DB_URL); Statement s = c.createStatement(); ResultSet rs = s.executeQuery(query)) {
            rs.next();
            return rs.getString(1);
        }
    }

    // --- tests ---

    @Nested
    @DisplayName("auth")
    class AuthTests {

        @Test
        void registerCreatesAccountAndLogsIn() throws Exception {
            Res res = register("Anna Maria Korhonen", "Anna@Example.edu", "student");

            assertEquals(201, res.status());
            JsonNode user = res.body().get("user");
            assertEquals("Anna Maria Korhonen", user.get("name").asText());
            assertEquals("anna@example.edu", user.get("email").asText());
            assertEquals("student", user.get("role").asText());
            assertFalse(user.has("password"));
            assertTrue(res.body().get("token").asText().length() >= 40);

            assertEquals("Anna Maria|Korhonen|STUDENT|anna",
                    sqlString("SELECT first_name || '|' || last_name || '|' || role || '|' || username FROM users"));
            assertTrue(sqlString("SELECT password_hash FROM users").startsWith("$2a$04$"), "password must be stored as bcrypt");
            assertEquals(200, get("/api/courses", res.body().get("token").asText()).status());
        }

        @Test
        void singleWordNameAndCollidingUsernames() throws Exception {
            user("Anna", "anna@a.edu", "student");
            user("Anna B", "anna@b.edu", "teacher");

            assertEquals("|anna2", sqlString("SELECT MIN(last_name) || '|' || MAX(username) FROM users"));
        }

        @Test
        void rejectsDuplicateEmailIgnoringCase() throws Exception {
            user("Anna", "anna@example.edu", "student");

            Res res = register("Other", "ANNA@example.edu", "teacher");

            assertEquals(409, res.status());
            assertEquals("An account with that email already exists.", res.error());
        }

        @Test
        void validatesRegistration() throws Exception {
            assertEquals("Name is required.", register(" ", "a@b.co", "student").error());
            assertEquals("Name is too long.", register("x".repeat(81), "a@b.co", "student").error());
            assertEquals("Enter a valid email address.", register("A", "not-an-email", "student").error());
            assertEquals("Role must be student or teacher.", register("A", "a@b.co", "admin").error());

            Res shortPassword = post("/api/auth/register", null, Map.of("name", "A", "email", "a@b.co", "password", "12345", "role", "student"));
            assertEquals(400, shortPassword.status());
            assertEquals("Password must be at least 6 characters.", shortPassword.error());

            Res longPassword = post("/api/auth/register", null, Map.of("name", "A", "email", "a@b.co", "password", "x".repeat(73), "role", "student"));
            assertEquals("Password is too long.", longPassword.error());

            assertEquals("0", sqlString("SELECT COUNT(*) FROM users"));
        }

        @Test
        void rejectsMalformedBodies() throws Exception {
            assertEquals(400, post("/api/auth/register", null, "{not json").status());
            assertEquals(400, post("/api/auth/register", null, "null").status());
            assertEquals("The request body is not valid JSON.", post("/api/auth/login", null, "").error());
        }

        @Test
        void loginWithCorrectAndWrongPasswords() throws Exception {
            User anna = user("Anna Korhonen", "anna@example.edu", "teacher");

            Res ok = post("/api/auth/login", null, Map.of("email", " ANNA@example.edu ", "password", "secret1"));
            assertEquals(200, ok.status());
            assertEquals(anna.id(), ok.body().get("user").get("id").asLong());
            assertEquals("teacher", ok.body().get("user").get("role").asText());

            Res wrong = post("/api/auth/login", null, Map.of("email", "anna@example.edu", "password", "nope"));
            assertEquals(401, wrong.status());
            assertEquals("Incorrect email or password.", wrong.error());

            Res unknown = post("/api/auth/login", null, Map.of("email", "who@example.edu", "password", "secret1"));
            assertEquals(401, unknown.status());
            assertEquals("Incorrect email or password.", unknown.error());

            assertEquals(401, post("/api/auth/login", null, Map.of("email", "anna@example.edu", "password", "x".repeat(100))).status());
            assertEquals(401, post("/api/auth/login", null, Map.of()).status());
        }

        @Test
        void acceptsPhpStyleHashesAndRejectsMalformedOnes() throws Exception {
            // the sample data in attendance_tracker_v2.sql uses $2y$ hashes
            user("Anna", "anna@example.edu", "student");
            sql("UPDATE users SET password_hash = '$2y$' || SUBSTRING(password_hash, 5)");
            assertEquals(200, post("/api/auth/login", null, Map.of("email", "anna@example.edu", "password", "secret1")).status());

            sql("UPDATE users SET password_hash = 'not a bcrypt hash'");
            assertEquals(401, post("/api/auth/login", null, Map.of("email", "anna@example.edu", "password", "secret1")).status());
        }

        @Test
        void rejectsMissingBadAndExpiredTokens() throws Exception {
            assertEquals(401, get("/api/courses", null).status());
            assertEquals(401, get("/api/courses", "made-up-token").status());

            User anna = user("Anna", "anna@example.edu", "student");
            HttpRequest basic = HttpRequest.newBuilder(URI.create("http://localhost:" + app.port() + "/api/courses"))
                    .header("Authorization", "Basic " + anna.token()).build();
            assertEquals(401, client.send(basic, HttpResponse.BodyHandlers.ofString()).statusCode());
            HttpRequest empty = HttpRequest.newBuilder(URI.create("http://localhost:" + app.port() + "/api/courses"))
                    .header("Authorization", "Bearer ").build();
            assertEquals(401, client.send(empty, HttpResponse.BodyHandlers.ofString()).statusCode());

            clock.advance(Auth.TOKEN_TTL);
            Res expired = get("/api/courses", anna.token());
            assertEquals(401, expired.status());
            assertEquals("Your session has expired. Please log in again.", expired.error());
        }

        @Test
        void logoutRevokesToken() throws Exception {
            User anna = user("Anna", "anna@example.edu", "student");

            assertEquals(204, post("/api/auth/logout", anna.token(), null).status());
            assertEquals(204, post("/api/auth/logout", null, null).status());

            assertEquals(401, get("/api/courses", anna.token()).status());
        }
    }

    @Nested
    @DisplayName("courses")
    class CourseTests {

        @Test
        void teacherListsStudentsOnly() throws Exception {
            User teacher = user("Tiina Virtanen", "tiina@example.edu", "teacher");
            User sofia = user("Sofia Rantala", "sofia@example.edu", "student");
            User anni = user("Anni Korhonen", "anni@example.edu", "student");

            Res res = get("/api/students", teacher.token());

            assertEquals(200, res.status());
            assertEquals(2, res.body().size());
            assertEquals(anni.id(), res.body().get(0).get("id").asLong());
            assertEquals("Anni Korhonen", res.body().get(0).get("name").asText());
            assertEquals("anni@example.edu", res.body().get(0).get("email").asText());
            assertEquals(sofia.id(), res.body().get(1).get("id").asLong());

            Res forbidden = get("/api/students", sofia.token());
            assertEquals(403, forbidden.status());
            assertEquals("You don't have permission to do that.", forbidden.error());
        }

        @Test
        void createdCourseShowsUpForTeacherAndEnrolledStudents() throws Exception {
            User teacher = user("Tiina", "tiina@example.edu", "teacher");
            User other = user("Mikko", "mikko@example.edu", "teacher");
            User anni = user("Anni", "anni@example.edu", "student");
            User sofia = user("Sofia", "sofia@example.edu", "student");
            User joonas = user("Joonas", "joonas@example.edu", "student");

            Res created = post("/api/courses", teacher.token(), Map.of("name", "  OTP  ", "studentIds", List.of(anni.id(), String.valueOf(sofia.id()), anni.id())));
            assertEquals(201, created.status());
            assertEquals("OTP", created.body().get("name").asText());
            assertEquals(teacher.id(), created.body().get("teacherId").asLong());
            assertEquals(List.of(anni.id(), sofia.id()), JSON.convertValue(created.body().get("studentIds"), List.class).stream().map(n -> ((Number) n).longValue()).toList());

            Res teacherList = get("/api/courses", teacher.token());
            assertEquals(1, teacherList.body().size());
            assertEquals(2, teacherList.body().get(0).get("studentIds").size());

            Res anniList = get("/api/courses", anni.token());
            assertEquals(1, anniList.body().size());
            assertEquals("OTP", anniList.body().get(0).get("name").asText());
            assertEquals(1, anniList.body().get(0).get("studentIds").size(), "students must not see classmates");

            assertEquals(0, get("/api/courses", joonas.token()).body().size());
            assertEquals(0, get("/api/courses", other.token()).body().size());

            // dropped students disappear from both sides
            sql("UPDATE enrollments SET status = 'DROPPED' WHERE student_id = " + sofia.id());
            assertEquals(1, get("/api/courses", teacher.token()).body().get(0).get("studentIds").size());
            assertEquals(0, get("/api/courses", sofia.token()).body().size());

            LocalDate today = LocalDate.now(clock);
            String dates = sqlString("SELECT start_date || '/' || end_date || '/' || LENGTH(course_code) FROM courses");
            assertEquals(today + "/" + today.plusMonths(CourseApi.DEFAULT_COURSE_MONTHS) + "/8", dates);
        }

        @Test
        void courseWithoutStudents() throws Exception {
            User teacher = user("Tiina", "tiina@example.edu", "teacher");

            Res res = post("/api/courses", teacher.token(), Map.of("name", "Empty"));

            assertEquals(201, res.status());
            assertEquals(0, res.body().get("studentIds").size());
            assertEquals(0, get("/api/courses", teacher.token()).body().get(0).get("studentIds").size());
        }

        @Test
        void rejectsInvalidCourses() throws Exception {
            User teacher = user("Tiina", "tiina@example.edu", "teacher");
            User other = user("Mikko", "mikko@example.edu", "teacher");
            User student = user("Anni", "anni@example.edu", "student");
            createCourse(teacher, "OTP");

            Res duplicate = post("/api/courses", teacher.token(), Map.of("name", "otp"));
            assertEquals(409, duplicate.status());
            assertEquals("You already have a course with that name.", duplicate.error());
            createCourse(other, "OTP");

            assertEquals("Course name is required.", post("/api/courses", teacher.token(), Map.of("name", "   ")).error());
            assertEquals("Course name is required.", post("/api/courses", teacher.token(), Map.of()).error());
            assertEquals("Course name must be at most 160 characters.", post("/api/courses", teacher.token(), Map.of("name", "x".repeat(161))).error());

            // a teacher's id is not a student id, and the failed insert must be rolled back
            Res badStudent = post("/api/courses", teacher.token(), Map.of("name", "New", "studentIds", List.of(student.id(), other.id())));
            assertEquals(400, badStudent.status());
            assertEquals("2", sqlString("SELECT COUNT(*) FROM courses"));
            assertEquals("0", sqlString("SELECT COUNT(*) FROM enrollments"));

            assertEquals(403, post("/api/courses", student.token(), Map.of("name", "Mine")).status());
        }

        @Test
        void getCourseOnlyForItsTeacher() throws Exception {
            User teacher = user("Tiina", "tiina@example.edu", "teacher");
            User other = user("Mikko", "mikko@example.edu", "teacher");
            User student = user("Anni Korhonen", "anni@example.edu", "student");
            long courseId = createCourse(teacher, "OTP", student.id());

            Res res = get("/api/courses/" + courseId, teacher.token());
            assertEquals(200, res.status());
            assertEquals("OTP", res.body().get("name").asText());
            assertEquals("Anni Korhonen", res.body().get("students").get(0).get("name").asText());
            assertEquals("student", res.body().get("students").get(0).get("role").asText());

            Res notMine = get("/api/courses/" + courseId, other.token());
            assertEquals(404, notMine.status());
            assertEquals("Course not found.", notMine.error());
            assertEquals(404, get("/api/courses/999", teacher.token()).status());
            assertEquals(404, get("/api/courses/abc", teacher.token()).status());
            assertEquals(403, get("/api/courses/" + courseId, student.token()).status());
        }
    }

    @Nested
    @DisplayName("attendance sessions")
    class SessionTests {

        private User teacher;
        private User student;
        private long courseId;

        @BeforeEach
        void courseWithOneStudent() throws Exception {
            teacher = user("Tiina", "tiina@example.edu", "teacher");
            student = user("Anni", "anni@example.edu", "student");
            courseId = createCourse(teacher, "OTP", student.id());
        }

        private JsonNode start() throws Exception {
            Res res = post("/api/courses/" + courseId + "/sessions", teacher.token(), null);
            assertEquals(201, res.status(), res.body().toString());
            return res.body();
        }

        private Res confirm(User who, String code) throws Exception {
            return confirm(who, courseId, code);
        }

        private Res confirm(User who, long course, String code) throws Exception {
            return post("/api/courses/" + course + "/attendance/confirm", who.token(), Map.of("code", code));
        }

        @Test
        void startCreatesActiveSessionWithTwoDigitCode() throws Exception {
            JsonNode session = start();

            assertEquals(courseId, session.get("courseId").asLong());
            assertTrue(session.get("code").asText().matches("\\d{2}"));
            assertEquals("active", session.get("status").asText());
            assertEquals(clock.instant().toEpochMilli(), session.get("createdAt").asLong());
            assertEquals(SessionApi.CODE_TTL.toMillis(), session.get("expiresAt").asLong() - session.get("createdAt").asLong());
            assertEquals(0, session.get("confirmations").size());

            start();
            assertEquals("1,2", sqlString("SELECT LISTAGG(seq_no, ',') WITHIN GROUP (ORDER BY seq_no) FROM sessions"));
        }

        @Test
        void onlyTheCourseTeacherCanStartAndView() throws Exception {
            User other = user("Mikko", "mikko@example.edu", "teacher");
            assertEquals(404, post("/api/courses/" + courseId + "/sessions", other.token(), null).status());
            assertEquals(404, post("/api/courses/x/sessions", teacher.token(), null).status());
            assertEquals(403, post("/api/courses/" + courseId + "/sessions", student.token(), null).status());

            long sessionId = start().get("id").asLong();
            Res notMine = get("/api/sessions/" + sessionId, other.token());
            assertEquals(404, notMine.status());
            assertEquals("Session not found.", notMine.error());
            assertEquals(404, post("/api/sessions/" + sessionId + "/end", other.token(), null).status());
            assertEquals(404, get("/api/sessions/nope", teacher.token()).status());
            assertEquals(403, get("/api/sessions/" + sessionId, student.token()).status());
        }

        @Test
        void studentConfirmsOnceAndTeacherSeesIt() throws Exception {
            JsonNode session = start();
            clock.advance(Duration.ofMinutes(2));

            Res first = confirm(student, session.get("code").asText());
            assertEquals(200, first.status(), first.body().toString());
            assertEquals("OTP", first.body().get("courseName").asText());
            assertFalse(first.body().get("alreadyConfirmed").asBoolean());
            assertEquals(clock.instant().toEpochMilli(), first.body().get("confirmedAt").asLong());

            clock.advance(Duration.ofMinutes(1));
            Res second = confirm(student, " " + session.get("code").asText() + " ");
            assertTrue(second.body().get("alreadyConfirmed").asBoolean());
            assertEquals(first.body().get("confirmedAt").asLong(), second.body().get("confirmedAt").asLong());

            JsonNode status = get("/api/sessions/" + session.get("id").asLong(), teacher.token()).body();
            assertEquals(1, status.get("confirmations").size());
            assertEquals(student.id(), status.get("confirmations").get(0).get("studentId").asLong());
            assertEquals("PRESENT|CODE", sqlString("SELECT status || '|' || marked_via FROM attendances"));
        }

        @Test
        void confirmUpgradesAnAbsentMark() throws Exception {
            JsonNode session = start();
            sql("INSERT INTO attendances (session_id, student_id, status, marked_via) VALUES ("
                    + session.get("id").asLong() + ", " + student.id() + ", 'ABSENT', 'TEACHER')");

            Res res = confirm(student, session.get("code").asText());

            assertFalse(res.body().get("alreadyConfirmed").asBoolean());
            assertEquals("PRESENT|CODE", sqlString("SELECT status || '|' || marked_via FROM attendances"));
        }

        @Test
        void codeOnlyWorksForEnrolledStudents() throws Exception {
            JsonNode session = start();
            User outsider = user("Pekka", "pekka@example.edu", "student");

            Res res = confirm(outsider, session.get("code").asText());

            assertEquals(404, res.status());
            assertEquals("Course not found.", res.error());
            assertEquals(404, confirm(student, 999, session.get("code").asText()).status());
            assertEquals(404, post("/api/courses/x/attendance/confirm", student.token(), Map.of("code", "12")).status());
            assertEquals(403, confirm(teacher, session.get("code").asText()).status());
        }

        @Test
        void codeOnlyWorksForTheChosenCourse() throws Exception {
            String code = start().get("code").asText();
            long otherCourse = createCourse(teacher, "Tietokannat", student.id());

            Res res = confirm(student, otherCourse, code);

            assertEquals(400, res.status());
            assertEquals("That code doesn't match an active session for this course.", res.error());
            assertEquals(200, confirm(student, code).status());
        }

        @Test
        void rejectsWrongAndMalformedCodes() throws Exception {
            String code = start().get("code").asText();
            String wrong = code.equals("00") ? "01" : "00";

            assertEquals("That code doesn't match an active session for this course.", confirm(student, wrong).error());
            assertEquals("Enter the code shown on the screen.", confirm(student, "1; DROP").error());
            assertEquals("Enter the code shown on the screen.", post("/api/courses/" + courseId + "/attendance/confirm", student.token(), Map.of()).error());
        }

        @Test
        void codeExpiresAfterTtl() throws Exception {
            JsonNode session = start();
            clock.advance(SessionApi.CODE_TTL);

            assertEquals("expired", get("/api/sessions/" + session.get("id").asLong(), teacher.token()).body().get("status").asText());
            assertEquals("This code has expired.", confirm(student, session.get("code").asText()).error());
        }

        @Test
        void endingStopsTheCode() throws Exception {
            JsonNode session = start();
            long id = session.get("id").asLong();
            clock.advance(Duration.ofMinutes(3));

            Res ended = post("/api/sessions/" + id + "/end", teacher.token(), null);
            assertEquals(200, ended.status());
            assertEquals("ended", ended.body().get("status").asText());
            assertEquals(clock.instant().toEpochMilli(), ended.body().get("expiresAt").asLong());
            assertEquals("This code has expired.", confirm(student, session.get("code").asText()).error());

            // ending again changes nothing, and it stays "ended" after the original expiry passes
            clock.advance(Duration.ofMinutes(30));
            assertEquals("ended", post("/api/sessions/" + id + "/end", teacher.token(), null).body().get("status").asText());
            assertEquals(ended.body().get("expiresAt").asLong(), get("/api/sessions/" + id, teacher.token()).body().get("expiresAt").asLong());
        }

        @Test
        void sessionWithoutCodeCountsAsEnded() throws Exception {
            long id = start().get("id").asLong();
            sql("UPDATE sessions SET attendance_code = NULL, code_expires_at = NULL");

            JsonNode session = get("/api/sessions/" + id, teacher.token()).body();

            assertEquals("ended", session.get("status").asText());
            assertTrue(session.get("expiresAt").isNull());
        }

        @Test
        void activeSessionsNeverShareACode() throws Exception {
            Set<String> codes = new HashSet<>();
            for (int i = 0; i < SessionApi.CODE_SPACE; i++) {
                codes.add(start().get("code").asText());
            }
            assertEquals(SessionApi.CODE_SPACE, codes.size());

            Res full = post("/api/courses/" + courseId + "/sessions", teacher.token(), null);
            assertEquals(503, full.status());

            clock.advance(SessionApi.CODE_TTL);
            start();
        }
    }

    @Nested
    @DisplayName("attendance report")
    class AttendanceTests {

        private User teacher;
        private User anni;
        private User sofia;
        private long courseId;

        @BeforeEach
        void courseWithTwoStudents() throws Exception {
            teacher = user("Tiina", "tiina@example.edu", "teacher");
            anni = user("Anni Korhonen", "anni@example.edu", "student");
            sofia = user("Sofia Rantala", "sofia@example.edu", "student");
            courseId = createCourse(teacher, "Käyttöliittymät (UI) 1", anni.id(), sofia.id());
        }

        /** Starts a session, lets {@code present} confirm it, and returns its id. */
        private long session(User... present) throws Exception {
            JsonNode session = post("/api/courses/" + courseId + "/sessions", teacher.token(), null).body();
            for (User student : present) {
                Res res = post("/api/courses/" + courseId + "/attendance/confirm", student.token(), Map.of("code", session.get("code").asText()));
                assertEquals(200, res.status(), res.body().toString());
            }
            post("/api/sessions/" + session.get("id").asLong() + "/end", teacher.token(), null);
            clock.advance(Duration.ofHours(1));
            return session.get("id").asLong();
        }

        private HttpResponse<byte[]> export(String token) throws IOException, InterruptedException {
            HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + app.port() + "/api/courses/" + courseId + "/attendance/export"))
                    .header("Authorization", "Bearer " + token).build();
            return client.send(request, HttpResponse.BodyHandlers.ofByteArray());
        }

        private List<String> texts(Row row) {
            return java.util.stream.IntStream.range(0, row.getCellCount()).mapToObj(row::getCellText).toList();
        }

        @Test
        void showsEachStudentsStatusPerSession() throws Exception {
            long first = session(anni, sofia);
            session(anni);
            long third = session();
            sql("UPDATE attendances SET status = 'LATE' WHERE student_id = " + sofia.id() + " AND session_id = " + first);
            sql("INSERT INTO attendances (session_id, student_id, status) VALUES (" + third + ", " + sofia.id() + ", 'EXCUSED')");

            Res res = get("/api/courses/" + courseId + "/attendance", teacher.token());

            assertEquals(200, res.status(), res.body().toString());
            assertEquals("Käyttöliittymät (UI) 1", res.body().get("courseName").asText());
            JsonNode sessions = res.body().get("sessions");
            assertEquals(3, sessions.size());
            assertEquals(first, sessions.get(0).get("id").asLong());
            assertEquals(1, sessions.get(0).get("seqNo").asInt());
            assertEquals(3, sessions.get(2).get("seqNo").asInt());

            JsonNode students = res.body().get("students");
            assertEquals(anni.id(), students.get(0).get("id").asLong());
            assertEquals("Anni Korhonen", students.get(0).get("name").asText());
            assertEquals("[\"present\",\"present\",\"absent\"]", students.get(0).get("statuses").toString());
            assertEquals(2, students.get(0).get("attended").asInt());
            assertEquals("[\"late\",\"absent\",\"excused\"]", students.get(1).get("statuses").toString());
            assertEquals(1, students.get(1).get("attended").asInt());
        }

        @Test
        void exportsTheSameTableAsExcel() throws Exception {
            session(anni, sofia);
            session(anni);

            HttpResponse<byte[]> response = export(teacher.token());

            assertEquals(200, response.statusCode());
            assertEquals(AttendanceApi.XLSX, response.headers().firstValue("Content-Type").orElse(""));
            assertEquals("attachment; filename=\"Kayttoliittymat_UI_1-attendance.xlsx\"",
                    response.headers().firstValue("Content-Disposition").orElse(""));

            try (ReadableWorkbook wb = new ReadableWorkbook(new ByteArrayInputStream(response.body()))) {
                List<Row> rows = wb.getFirstSheet().read();
                assertEquals(3, rows.size());
                List<String> header = texts(rows.get(0));
                assertEquals(List.of("Student", "Email"), header.subList(0, 2));
                assertTrue(header.get(2).startsWith("#1 "), header.get(2));
                assertEquals(List.of("Attended", "Attendance %"), header.subList(4, 6));

                assertEquals(List.of("Anni Korhonen", "anni@example.edu", "Present", "Present"), texts(rows.get(1)).subList(0, 4));
                assertEquals(2, rows.get(1).getCellAsNumber(4).orElseThrow().intValue());
                assertEquals(1.0, rows.get(1).getCellAsNumber(5).orElseThrow().doubleValue());
                assertEquals(List.of("Sofia Rantala", "sofia@example.edu", "Present", "Absent"), texts(rows.get(2)).subList(0, 4));
                assertEquals(0.5, rows.get(2).getCellAsNumber(5).orElseThrow().doubleValue());
            }
        }

        @Test
        void courseWithoutSessions() throws Exception {
            JsonNode body = get("/api/courses/" + courseId + "/attendance", teacher.token()).body();
            assertEquals(0, body.get("sessions").size());
            assertEquals(0, body.get("students").get(0).get("statuses").size());
            assertEquals(0, body.get("students").get(0).get("attended").asInt());

            try (ReadableWorkbook wb = new ReadableWorkbook(new ByteArrayInputStream(export(teacher.token()).body()))) {
                List<Row> rows = wb.getFirstSheet().read();
                assertEquals(List.of("Student", "Email", "Attended", "Attendance %"), texts(rows.get(0)));
                assertEquals(0, rows.get(1).getCellAsNumber(2).orElseThrow().intValue());
            }
        }

        @Test
        void onlyTheCourseTeacherCanSeeIt() throws Exception {
            User other = user("Mikko", "mikko@example.edu", "teacher");

            Res notMine = get("/api/courses/" + courseId + "/attendance", other.token());
            assertEquals(404, notMine.status());
            assertEquals("Course not found.", notMine.error());
            assertEquals(404, export(other.token()).statusCode());
            assertEquals(403, get("/api/courses/" + courseId + "/attendance", anni.token()).status());
            assertEquals(403, export(anni.token()).statusCode());
            assertEquals(404, get("/api/courses/abc/attendance", teacher.token()).status());
        }

        @Test
        void fileNamesAreAscii() {
            assertEquals("OTP-attendance.xlsx", AttendanceApi.fileName("OTP"));
            assertEquals("course-attendance.xlsx", AttendanceApi.fileName("??"));
        }
    }

    @Nested
    @DisplayName("http")
    class HttpTests {

        @Test
        void allowsConfiguredOriginOnly() throws Exception {
            assertEquals("http://localhost:1337", preflight("http://localhost:1337").headers().firstValue("Access-Control-Allow-Origin").orElse(""));
            assertTrue(preflight("http://evil.example").headers().firstValue("Access-Control-Allow-Origin").isEmpty());
        }

        @Test
        void setsSecurityHeaders() throws Exception {
            HttpResponse<String> response = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + app.port() + "/")).build(),
                    HttpResponse.BodyHandlers.ofString());

            assertEquals("nosniff", response.headers().firstValue("X-Content-Type-Options").orElse(""));
            assertEquals("no-store", response.headers().firstValue("Cache-Control").orElse(""));
        }

        @Test
        void hidesDatabaseErrors() throws Exception {
            Javalin broken = server.create(() -> { throw new SQLException("secret detail"); }, clock, 4, List.of()).start(0);
            try {
                HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + broken.port() + "/api/auth/login"))
                        .POST(HttpRequest.BodyPublishers.ofString("{\"email\":\"a@b.co\",\"password\":\"x\"}")).build();
                HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

                assertEquals(500, response.statusCode());
                assertFalse(response.body().contains("secret detail"));
            } finally {
                broken.stop();
            }
        }

        @Test
        void parsesCorsOrigins() {
            assertEquals(List.of("http://127.0.0.1:1337", "http://localhost:1337"), server.corsOrigins(null));
            assertEquals(List.of("https://a.example", "https://b.example"), server.corsOrigins(" https://a.example, https://b.example,, "));
        }

        private HttpResponse<String> preflight(String origin) throws IOException, InterruptedException {
            HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + app.port() + "/api/courses"))
                    .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                    .header("Origin", origin)
                    .header("Access-Control-Request-Method", "POST")
                    .header("Access-Control-Request-Headers", "authorization, content-type")
                    .build();
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        }
    }
}

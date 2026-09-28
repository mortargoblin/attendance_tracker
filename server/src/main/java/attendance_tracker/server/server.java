package attendance_tracker.server;

import attendance_tracker.server.Database.ConnectionSource;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.javalin.json.JavalinJackson;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.time.Clock;
import java.util.Arrays;
import java.util.List;
import java.util.Map;


public final class server {

    private static final Logger LOG = LoggerFactory.getLogger(server.class);

    /** Where `npm run serve` in client/ hosts the frontend. */
    static final String DEFAULT_CORS_ORIGINS = "http://127.0.0.1:1337,http://localhost:1337";

    private server() {
    }

    public static Javalin create(ConnectionSource db) {
        return create(db, Clock.systemDefaultZone(), Passwords.DEFAULT_COST, corsOrigins(System.getenv("CORS_ORIGINS")));
    }

    static Javalin create(ConnectionSource db, Clock clock, int bcryptCost, List<String> corsOrigins) {
        ObjectMapper mapper = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

        Javalin app = Javalin.create(config -> {
            config.showJavalinBanner = false;
            config.jsonMapper(new JavalinJackson(mapper, false));
            config.http.maxRequestSize = 64 * 1024L;
            if (!corsOrigins.isEmpty()) {
                config.bundledPlugins.enableCors(cors -> cors.addRule(rule ->
                        rule.allowHost(corsOrigins.get(0), corsOrigins.subList(1, corsOrigins.size()).toArray(String[]::new))));
            }
        });

        app.exception(ApiError.class, (e, ctx) -> ctx.status(e.status).json(Map.of("error", e.getMessage())));
        app.exception(Exception.class, (e, ctx) -> {
            LOG.error("Request {} {} failed", ctx.method(), ctx.path(), e);
            ctx.status(500).json(Map.of("error", "Something went wrong on the server. Please try again."));
        });
        app.after(ctx -> {
            ctx.header("X-Content-Type-Options", "nosniff");
            ctx.header("Cache-Control", "no-store");
        });

        app.get("/", ctx -> ctx.json(Map.of("working", "well")));

        app.get("/db_test", ctx -> {
            try (Connection connection = db.open(); var statement = connection.createStatement()) {
                var resultSet = statement.executeQuery("SELECT 1");
                if (resultSet.next()) {
                    ctx.json(Map.of("db_test", "ok"));
                } else {
                    ctx.status(500).json(Map.of("db_test", "failed"));
                }
            }
        });

        Auth auth = new Auth(clock);
        AuthApi authApi = new AuthApi(db, auth, new Passwords(bcryptCost));
        CourseApi courseApi = new CourseApi(db, auth, clock);
        SessionApi sessionApi = new SessionApi(db, auth, clock);
        AttendanceApi attendanceApi = new AttendanceApi(db, auth, clock);

        app.post("/api/auth/register", authApi::register);
        app.post("/api/auth/login", authApi::login);
        app.post("/api/auth/logout", authApi::logout);

        app.get("/api/students", courseApi::listStudents);
        app.get("/api/courses", courseApi::listCourses);
        app.post("/api/courses", courseApi::createCourse);
        app.get("/api/courses/{courseId}", courseApi::getCourse);
        app.get("/api/courses/{courseId}/attendance", attendanceApi::get);
        app.get("/api/courses/{courseId}/attendance/export", attendanceApi::export);

        app.post("/api/courses/{courseId}/sessions", sessionApi::start);
        app.get("/api/sessions/{sessionId}", sessionApi::get);
        app.post("/api/sessions/{sessionId}/end", sessionApi::end);
        app.post("/api/courses/{courseId}/attendance/confirm", sessionApi::confirm);

        return app;
    }

    /** Parses CORS_ORIGINS (comma separated, e.g. "https://app.example.com"); unset means the local dev frontend. */
    static List<String> corsOrigins(String envValue) {
        return Arrays.stream(Database.orDefault(envValue, DEFAULT_CORS_ORIGINS).split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
    }

    /** Reads the JSON request body as {@code type}, answering 400 if it's missing or malformed. */
    static <T> T body(Context ctx, Class<T> type) {
        T value;
        try {
            value = ctx.jsonMapper().fromJsonString(ctx.body(), type);
        } catch (Exception e) {
            throw ApiError.badRequest("The request body is not valid JSON.");
        }
        if (value == null) {
            throw ApiError.badRequest("The request body is not valid JSON.");
        }
        return value;
    }

    /** Reads a numeric id from the path; anything that isn't one is reported as {@code notFoundMessage}. */
    static long pathId(Context ctx, String name, String notFoundMessage) {
        try {
            return Long.parseLong(ctx.pathParam(name));
        } catch (NumberFormatException e) {
            throw ApiError.notFound(notFoundMessage);
        }
    }
}

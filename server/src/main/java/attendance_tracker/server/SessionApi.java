package attendance_tracker.server;

import attendance_tracker.server.Database.ConnectionSource;
import io.javalin.http.Context;

import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLIntegrityConstraintViolationException;
import java.sql.Statement;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Attendance sessions: POST /api/courses/{courseId}/sessions, GET /api/sessions/{sessionId},
 * POST /api/sessions/{sessionId}/end and POST /api/attendance/confirm.
 *
 * <p>A session is a row in {@code sessions}. Starting one sets starts_at to now and both ends_at
 * and code_expires_at to now + {@link #CODE_TTL}. Ending it early moves code_expires_at back to
 * now, so its status is: active while now is before code_expires_at, otherwise "ended" if the code
 * was cut short (code_expires_at before ends_at) and "expired" if it simply ran out.
 *
 * <p>All times are written and read by this server in its own time zone, so the database's clock
 * and time zone never matter.
 */
final class SessionApi {

    record Confirmation(long studentId, long confirmedAt) {
    }

    record SessionDto(long id, long courseId, String code, String status, long createdAt, Long expiresAt,
                      List<Confirmation> confirmations) {
    }

    record ConfirmRequest(String code) {
    }

    record ConfirmResponse(String courseName, long confirmedAt, boolean alreadyConfirmed) {
    }

    static final Duration CODE_TTL = Duration.ofMinutes(15);

    /** Codes are two digits, matching what the student page accepts. */
    static final int CODE_SPACE = 100;

    private static final Pattern CODE_FORMAT = Pattern.compile("[A-Za-z0-9]{1,10}");
    private static final String NO_MATCH = "That code doesn't match an active session for any of your courses.";

    private final ConnectionSource db;
    private final Auth auth;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    /** Held while picking a free code and inserting the session so two sessions can't get the same code. */
    private final Object startLock = new Object();

    SessionApi(ConnectionSource db, Auth auth, Clock clock) {
        this.db = db;
        this.auth = auth;
        this.clock = clock;
    }

    void start(Context ctx) throws SQLException {
        Auth.Principal me = auth.require(ctx, "teacher");
        long courseId = server.pathId(ctx, "courseId", "Course not found.");

        try (Connection c = db.open()) {
            if (!AuthApi.exists(c, "SELECT 1 FROM courses WHERE course_id = ? AND teacher_id = ?", courseId, me.userId())) {
                throw ApiError.notFound("Course not found.");
            }
            long sessionId;
            synchronized (startLock) {
                LocalDateTime now = now();
                String code = freeCode(c, now);
                int seqNo = nextSeqNo(c, courseId);
                String sql = "INSERT INTO sessions (course_id, seq_no, starts_at, ends_at, attendance_code, code_expires_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?)";
                try (PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                    LocalDateTime expires = now.plus(CODE_TTL);
                    ps.setLong(1, courseId);
                    ps.setInt(2, seqNo);
                    ps.setObject(3, now);
                    ps.setObject(4, expires);
                    ps.setString(5, code);
                    ps.setObject(6, expires);
                    ps.executeUpdate();
                    sessionId = AuthApi.generatedId(ps);
                }
            }
            ctx.status(201).json(loadSession(c, sessionId, me.userId()));
        }
    }

    void get(Context ctx) throws SQLException {
        Auth.Principal me = auth.require(ctx, "teacher");
        long sessionId = server.pathId(ctx, "sessionId", "Session not found.");
        try (Connection c = db.open()) {
            ctx.json(loadSession(c, sessionId, me.userId()));
        }
    }

    void end(Context ctx) throws SQLException {
        Auth.Principal me = auth.require(ctx, "teacher");
        long sessionId = server.pathId(ctx, "sessionId", "Session not found.");
        try (Connection c = db.open()) {
            // load first so a session that isn't ours is reported as missing before anything changes
            loadSession(c, sessionId, me.userId());
            LocalDateTime now = now();
            try (PreparedStatement ps = c.prepareStatement(
                    "UPDATE sessions SET code_expires_at = ? WHERE session_id = ? AND code_expires_at > ?")) {
                ps.setObject(1, now);
                ps.setLong(2, sessionId);
                ps.setObject(3, now);
                ps.executeUpdate();
            }
            ctx.json(loadSession(c, sessionId, me.userId()));
        }
    }

    void confirm(Context ctx) throws SQLException {
        Auth.Principal me = auth.require(ctx, "student");
        ConfirmRequest req = server.body(ctx, ConfirmRequest.class);
        String code = req.code() == null ? "" : req.code().trim();
        if (!CODE_FORMAT.matcher(code).matches()) {
            throw ApiError.badRequest("Enter the code shown on the screen.");
        }

        LocalDateTime now = now();
        try (Connection c = db.open()) {
            long sessionId;
            String courseName;
            // only sessions of courses this student is actively enrolled in can match, so a code
            // that's live for some other course looks exactly like a wrong one
            String sql = "SELECT s.session_id, c.name FROM sessions s "
                    + "JOIN courses c ON c.course_id = s.course_id "
                    + "JOIN enrollments e ON e.course_id = s.course_id AND e.student_id = ? AND e.status = 'ACTIVE' "
                    + "WHERE s.attendance_code = ? AND s.code_expires_at > ? ORDER BY s.starts_at DESC LIMIT 1";
            try (PreparedStatement ps = c.prepareStatement(sql)) {
                ps.setLong(1, me.userId());
                ps.setString(2, code);
                ps.setObject(3, now);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) {
                        throw ApiError.badRequest(wasUsedBefore(c, me.userId(), code) ? "This code has expired." : NO_MATCH);
                    }
                    sessionId = rs.getLong("session_id");
                    courseName = rs.getString("name");
                }
            }

            LocalDateTime previous = presentSince(c, sessionId, me.userId());
            if (previous != null) {
                ctx.json(new ConfirmResponse(courseName, toMillis(previous), true));
                return;
            }
            try {
                markPresent(c, sessionId, me.userId(), now);
            } catch (SQLIntegrityConstraintViolationException e) {
                // a double submit inserted the row first; report that one
                ctx.json(new ConfirmResponse(courseName, toMillis(presentSince(c, sessionId, me.userId())), true));
                return;
            }
            ctx.json(new ConfirmResponse(courseName, toMillis(now), false));
        }
    }

    /** The session, if it exists and belongs to one of {@code teacherId}'s courses; otherwise 404. */
    private SessionDto loadSession(Connection c, long sessionId, long teacherId) throws SQLException {
        String sql = "SELECT s.course_id, s.attendance_code, s.starts_at, s.ends_at, s.code_expires_at FROM sessions s "
                + "JOIN courses c ON c.course_id = s.course_id WHERE s.session_id = ? AND c.teacher_id = ?";
        long courseId;
        String code;
        LocalDateTime startsAt;
        LocalDateTime endsAt;
        LocalDateTime expiresAt;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, sessionId);
            ps.setLong(2, teacherId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw ApiError.notFound("Session not found.");
                }
                courseId = rs.getLong("course_id");
                code = rs.getString("attendance_code");
                startsAt = rs.getObject("starts_at", LocalDateTime.class);
                endsAt = rs.getObject("ends_at", LocalDateTime.class);
                expiresAt = rs.getObject("code_expires_at", LocalDateTime.class);
            }
        }

        List<Confirmation> confirmations = new ArrayList<>();
        String confirmedSql = "SELECT student_id, marked_at FROM attendances "
                + "WHERE session_id = ? AND status IN ('PRESENT', 'LATE') ORDER BY marked_at, student_id";
        try (PreparedStatement ps = c.prepareStatement(confirmedSql)) {
            ps.setLong(1, sessionId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    confirmations.add(new Confirmation(rs.getLong("student_id"), toMillis(rs.getObject("marked_at", LocalDateTime.class))));
                }
            }
        }

        String status;
        if (expiresAt != null && now().isBefore(expiresAt)) {
            status = "active";
        } else if (expiresAt != null && !expiresAt.isBefore(endsAt)) {
            status = "expired";
        } else {
            status = "ended";
        }
        return new SessionDto(sessionId, courseId, code, status, toMillis(startsAt),
                expiresAt == null ? null : toMillis(expiresAt), confirmations);
    }

    /** A random code that no active session is using. */
    private String freeCode(Connection c, LocalDateTime now) throws SQLException {
        Set<String> taken = new HashSet<>();
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT attendance_code FROM sessions WHERE code_expires_at > ? AND attendance_code IS NOT NULL")) {
            ps.setObject(1, now);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    taken.add(rs.getString(1));
                }
            }
        }
        List<String> free = new ArrayList<>();
        for (int i = 0; i < CODE_SPACE; i++) {
            String code = String.format("%02d", i);
            if (!taken.contains(code)) {
                free.add(code);
            }
        }
        if (free.isEmpty()) {
            throw new ApiError(503, "All attendance codes are in use right now. Try again in a few minutes.");
        }
        return free.get(random.nextInt(free.size()));
    }

    private static int nextSeqNo(Connection c, long courseId) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT COALESCE(MAX(seq_no), 0) + 1 FROM sessions WHERE course_id = ?")) {
            ps.setLong(1, courseId);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        }
    }

    private static boolean wasUsedBefore(Connection c, long studentId, String code) throws SQLException {
        return AuthApi.exists(c, "SELECT 1 FROM sessions s JOIN enrollments e ON e.course_id = s.course_id "
                + "AND e.student_id = ? AND e.status = 'ACTIVE' WHERE s.attendance_code = ?", studentId, code);
    }

    /** When the student was marked present/late for the session, or null if they haven't been. */
    private static LocalDateTime presentSince(Connection c, long sessionId, long studentId) throws SQLException {
        String sql = "SELECT marked_at FROM attendances WHERE session_id = ? AND student_id = ? AND status IN ('PRESENT', 'LATE')";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, sessionId);
            ps.setLong(2, studentId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getObject("marked_at", LocalDateTime.class) : null;
            }
        }
    }

    /** Inserts a PRESENT row, or upgrades one the teacher already set to ABSENT/EXCUSED. */
    private static void markPresent(Connection c, long sessionId, long studentId, LocalDateTime now) throws SQLException {
        String update = "UPDATE attendances SET status = 'PRESENT', marked_at = ?, marked_via = 'CODE' WHERE session_id = ? AND student_id = ?";
        try (PreparedStatement ps = c.prepareStatement(update)) {
            ps.setObject(1, now);
            ps.setLong(2, sessionId);
            ps.setLong(3, studentId);
            if (ps.executeUpdate() > 0) {
                return;
            }
        }
        String insert = "INSERT INTO attendances (session_id, student_id, status, marked_at, marked_via) VALUES (?, ?, 'PRESENT', ?, 'CODE')";
        try (PreparedStatement ps = c.prepareStatement(insert)) {
            ps.setLong(1, sessionId);
            ps.setLong(2, studentId);
            ps.setObject(3, now);
            ps.executeUpdate();
        }
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    private long toMillis(LocalDateTime time) {
        return time.atZone(clock.getZone()).toInstant().toEpochMilli();
    }
}

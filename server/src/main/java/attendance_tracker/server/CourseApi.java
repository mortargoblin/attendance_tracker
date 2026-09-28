package attendance_tracker.server;

import attendance_tracker.server.AuthApi.UserDto;
import attendance_tracker.server.Database.ConnectionSource;
import io.javalin.http.Context;

import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** GET /api/students, GET+POST /api/courses and GET /api/courses/{courseId}. */
final class CourseApi {

    record CreateCourseRequest(String name, List<Long> studentIds) {
    }

    record CourseDto(long id, String name, long teacherId, List<Long> studentIds) {
    }

    record CourseDetailDto(long id, String name, List<UserDto> students) {
    }

    /** The frontend only asks for a name, but the schema also needs a code and dates; new courses run this long. */
    static final int DEFAULT_COURSE_MONTHS = 4;

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private final ConnectionSource db;
    private final Auth auth;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    CourseApi(ConnectionSource db, Auth auth, Clock clock) {
        this.db = db;
        this.auth = auth;
        this.clock = clock;
    }

    void listStudents(Context ctx) throws SQLException {
        auth.require(ctx, "teacher");
        String sql = "SELECT user_id, first_name, last_name, email, role FROM users WHERE role = 'STUDENT' "
                + "ORDER BY first_name, last_name, user_id";
        List<UserDto> students = new ArrayList<>();
        try (Connection c = db.open(); PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                students.add(AuthApi.userFrom(rs));
            }
        }
        ctx.json(students);
    }

    void listCourses(Context ctx) throws SQLException {
        Auth.Principal me = auth.require(ctx, "teacher", "student");
        try (Connection c = db.open()) {
            ctx.json(me.role().equals("teacher") ? teacherCourses(c, me.userId()) : studentCourses(c, me.userId()));
        }
    }

    void createCourse(Context ctx) throws SQLException {
        Auth.Principal me = auth.require(ctx, "teacher");
        CreateCourseRequest req = server.body(ctx, CreateCourseRequest.class);

        String name = req.name() == null ? "" : req.name().trim();
        if (name.isEmpty()) {
            throw ApiError.badRequest("Course name is required.");
        }
        if (name.length() > 160) {
            throw ApiError.badRequest("Course name must be at most 160 characters.");
        }
        Set<Long> studentIds = new LinkedHashSet<>(req.studentIds() == null ? List.of() : req.studentIds());
        studentIds.remove(null);

        try (Connection c = db.open()) {
            c.setAutoCommit(false);
            try {
                long courseId = insertCourse(c, me.userId(), name, studentIds);
                c.commit();
                ctx.status(201).json(new CourseDto(courseId, name, me.userId(), List.copyOf(studentIds)));
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            } finally {
                c.setAutoCommit(true);
            }
        }
    }

    void getCourse(Context ctx) throws SQLException {
        Auth.Principal me = auth.require(ctx, "teacher");
        long courseId = server.pathId(ctx, "courseId", "Course not found.");

        try (Connection c = db.open()) {
            String name = teacherCourseName(c, courseId, me.userId());
            ctx.json(new CourseDetailDto(courseId, name, enrolledStudents(c, courseId)));
        }
    }

    /** The name of the course if {@code teacherId} teaches it; otherwise 404. */
    static String teacherCourseName(Connection c, long courseId, long teacherId) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT name FROM courses WHERE course_id = ? AND teacher_id = ?")) {
            ps.setLong(1, courseId);
            ps.setLong(2, teacherId);
            try (ResultSet rs = ps.executeQuery()) {
                // someone else's course looks the same as a missing one
                if (!rs.next()) {
                    throw ApiError.notFound("Course not found.");
                }
                return rs.getString("name");
            }
        }
    }

    /** The students actively enrolled in the course, sorted by name. */
    static List<UserDto> enrolledStudents(Connection c, long courseId) throws SQLException {
        String sql = "SELECT u.user_id, u.first_name, u.last_name, u.email, u.role FROM enrollments e "
                + "JOIN users u ON u.user_id = e.student_id "
                + "WHERE e.course_id = ? AND e.status = 'ACTIVE' ORDER BY u.first_name, u.last_name, u.user_id";
        List<UserDto> students = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, courseId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    students.add(AuthApi.userFrom(rs));
                }
            }
        }
        return students;
    }

    private long insertCourse(Connection c, long teacherId, String name, Set<Long> studentIds) throws SQLException {
        if (AuthApi.exists(c, "SELECT 1 FROM courses WHERE teacher_id = ? AND LOWER(name) = LOWER(?)", teacherId, name)) {
            throw ApiError.conflict("You already have a course with that name.");
        }
        if (countStudents(c, studentIds) != studentIds.size()) {
            throw ApiError.badRequest("One or more of the selected students don't exist.");
        }

        LocalDate start = LocalDate.now(clock);
        String sql = "INSERT INTO courses (course_code, name, start_date, end_date, teacher_id) VALUES (?, ?, ?, ?, ?)";
        long courseId;
        try (PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, uniqueCourseCode(c));
            ps.setString(2, name);
            ps.setObject(3, start);
            ps.setObject(4, start.plusMonths(DEFAULT_COURSE_MONTHS));
            ps.setLong(5, teacherId);
            ps.executeUpdate();
            courseId = AuthApi.generatedId(ps);
        }

        String enroll = "INSERT INTO enrollments (student_id, course_id, enrolled_at, status) VALUES (?, ?, ?, 'ACTIVE')";
        try (PreparedStatement ps = c.prepareStatement(enroll)) {
            LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
            for (long studentId : studentIds) {
                ps.setLong(1, studentId);
                ps.setLong(2, courseId);
                ps.setObject(3, now);
                ps.addBatch();
            }
            ps.executeBatch();
        }
        return courseId;
    }

    private static int countStudents(Connection c, Set<Long> ids) throws SQLException {
        if (ids.isEmpty()) {
            return 0;
        }
        String placeholders = String.join(", ", Collections.nCopies(ids.size(), "?"));
        String sql = "SELECT COUNT(*) FROM users WHERE role = 'STUDENT' AND user_id IN (" + placeholders + ")";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            for (long id : ids) {
                ps.setLong(i++, id);
            }
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        }
    }

    private String uniqueCourseCode(Connection c) throws SQLException {
        String code;
        do {
            StringBuilder sb = new StringBuilder("C");
            for (int i = 0; i < 7; i++) {
                sb.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
            }
            code = sb.toString();
        } while (AuthApi.exists(c, "SELECT 1 FROM courses WHERE course_code = ?", code));
        return code;
    }

    private static List<CourseDto> teacherCourses(Connection c, long teacherId) throws SQLException {
        Map<Long, String> names = new LinkedHashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT course_id, name FROM courses WHERE teacher_id = ? ORDER BY course_id")) {
            ps.setLong(1, teacherId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    names.put(rs.getLong("course_id"), rs.getString("name"));
                }
            }
        }

        Map<Long, List<Long>> students = new LinkedHashMap<>();
        String sql = "SELECT e.course_id, e.student_id FROM enrollments e JOIN courses c ON c.course_id = e.course_id "
                + "WHERE c.teacher_id = ? AND e.status = 'ACTIVE' ORDER BY e.student_id";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, teacherId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    students.computeIfAbsent(rs.getLong("course_id"), k -> new ArrayList<>()).add(rs.getLong("student_id"));
                }
            }
        }

        List<CourseDto> courses = new ArrayList<>();
        names.forEach((id, name) -> courses.add(new CourseDto(id, name, teacherId, students.getOrDefault(id, List.of()))));
        return courses;
    }

    /** A student sees the courses they're enrolled in, but not who else is on them. */
    private static List<CourseDto> studentCourses(Connection c, long studentId) throws SQLException {
        String sql = "SELECT c.course_id, c.name, c.teacher_id FROM courses c "
                + "JOIN enrollments e ON e.course_id = c.course_id "
                + "WHERE e.student_id = ? AND e.status = 'ACTIVE' ORDER BY c.course_id";
        List<CourseDto> courses = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, studentId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    courses.add(new CourseDto(rs.getLong("course_id"), rs.getString("name"), rs.getLong("teacher_id"), List.of(studentId)));
                }
            }
        }
        return courses;
    }
}

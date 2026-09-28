package attendance_tracker.server;

import attendance_tracker.server.AuthApi.UserDto;
import attendance_tracker.server.Database.ConnectionSource;
import io.javalin.http.Context;
import org.dhatim.fastexcel.Workbook;
import org.dhatim.fastexcel.Worksheet;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.text.Normalizer;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * A course's attendance across all its sessions: GET /api/courses/{courseId}/attendance as JSON,
 * and GET /api/courses/{courseId}/attendance/export as an Excel workbook with the same table.
 *
 * <p>Rows are the actively enrolled students, columns are the course's sessions in order. A student
 * without an attendances row for a session counts as absent, since confirming is what creates one.
 */
final class AttendanceApi {

    record SessionColumn(long id, int seqNo, long startedAt) {
    }

    /** {@code statuses} lines up with the sessions: "present", "late", "absent" or "excused". */
    record StudentRow(long id, String name, String email, List<String> statuses, int attended) {
    }

    record AttendanceDto(long courseId, String courseName, List<SessionColumn> sessions, List<StudentRow> students) {
    }

    static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private static final DateTimeFormatter HEADER_TIME = DateTimeFormatter.ofPattern("d.M.yyyy HH:mm");

    /** Cell fill per status, so the sheet reads at a glance. */
    private static final Map<String, String> FILLS = Map.of(
            "present", "C6EFCE", "late", "FFEB9C", "absent", "FFC7CE", "excused", "DDEBF7");

    private record Session(long id, int seqNo, LocalDateTime startsAt) {
    }

    private record Report(long courseId, String courseName, List<Session> sessions, List<UserDto> students,
                          Map<Long, Map<Long, String>> statuses) {

        /** The student's status in the session, "absent" if they never confirmed. */
        String status(long studentId, long sessionId) {
            return statuses.getOrDefault(studentId, Map.of()).getOrDefault(sessionId, "absent");
        }

        int attended(long studentId) {
            int count = 0;
            for (Session s : sessions) {
                String status = status(studentId, s.id());
                if (status.equals("present") || status.equals("late")) {
                    count++;
                }
            }
            return count;
        }
    }

    private final ConnectionSource db;
    private final Auth auth;
    private final Clock clock;

    AttendanceApi(ConnectionSource db, Auth auth, Clock clock) {
        this.db = db;
        this.auth = auth;
        this.clock = clock;
    }

    void get(Context ctx) throws SQLException {
        Report report = load(ctx);

        List<SessionColumn> sessions = new ArrayList<>();
        for (Session s : report.sessions()) {
            sessions.add(new SessionColumn(s.id(), s.seqNo(), s.startsAt().atZone(clock.getZone()).toInstant().toEpochMilli()));
        }
        List<StudentRow> students = new ArrayList<>();
        for (UserDto student : report.students()) {
            List<String> statuses = new ArrayList<>();
            for (Session s : report.sessions()) {
                statuses.add(report.status(student.id(), s.id()));
            }
            students.add(new StudentRow(student.id(), student.name(), student.email(), statuses, report.attended(student.id())));
        }
        ctx.json(new AttendanceDto(report.courseId(), report.courseName(), sessions, students));
    }

    void export(Context ctx) throws SQLException, IOException {
        Report report = load(ctx);
        ctx.contentType(XLSX)
                .header("Content-Disposition", "attachment; filename=\"" + fileName(report.courseName()) + "\"")
                .result(workbook(report));
    }

    private Report load(Context ctx) throws SQLException {
        Auth.Principal me = auth.require(ctx, "teacher");
        long courseId = server.pathId(ctx, "courseId", "Course not found.");

        try (Connection c = db.open()) {
            String name = CourseApi.teacherCourseName(c, courseId, me.userId());
            List<UserDto> students = CourseApi.enrolledStudents(c, courseId);

            List<Session> sessions = new ArrayList<>();
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT session_id, seq_no, starts_at FROM sessions WHERE course_id = ? ORDER BY seq_no")) {
                ps.setLong(1, courseId);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        sessions.add(new Session(rs.getLong("session_id"), rs.getInt("seq_no"), rs.getObject("starts_at", LocalDateTime.class)));
                    }
                }
            }

            Map<Long, Map<Long, String>> statuses = new HashMap<>();
            String sql = "SELECT a.student_id, a.session_id, a.status FROM attendances a "
                    + "JOIN sessions s ON s.session_id = a.session_id WHERE s.course_id = ?";
            try (PreparedStatement ps = c.prepareStatement(sql)) {
                ps.setLong(1, courseId);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        statuses.computeIfAbsent(rs.getLong("student_id"), k -> new HashMap<>())
                                .put(rs.getLong("session_id"), rs.getString("status").toLowerCase(Locale.ROOT));
                    }
                }
            }
            return new Report(courseId, name, sessions, students, statuses);
        }
    }

    /**
     * One sheet: a header row, then a row per student with their status in each session, how many
     * they attended (present or late) and that as a share of all sessions.
     */
    private static byte[] workbook(Report report) throws IOException {
        List<Session> sessions = report.sessions();
        int attendedCol = 2 + sessions.size();
        int pctCol = attendedCol + 1;

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Workbook wb = new Workbook(out, "Attendance Tracker", "1.0");
        Worksheet ws = wb.newWorksheet("Attendance");

        ws.value(0, 0, "Student");
        ws.value(0, 1, "Email");
        for (int i = 0; i < sessions.size(); i++) {
            Session s = sessions.get(i);
            ws.value(0, 2 + i, "#" + s.seqNo() + " " + HEADER_TIME.format(s.startsAt()));
            ws.width(2 + i, 18);
        }
        ws.value(0, attendedCol, "Attended");
        ws.value(0, pctCol, "Attendance %");
        ws.range(0, 0, 0, pctCol).style().bold().fillColor("D9D9D9").set();
        ws.width(0, 28);
        ws.width(1, 32);
        ws.width(attendedCol, 12);
        ws.width(pctCol, 14);
        ws.freezePane(1, 1);

        int row = 1;
        for (UserDto student : report.students()) {
            ws.value(row, 0, student.name());
            ws.value(row, 1, student.email());
            for (int i = 0; i < sessions.size(); i++) {
                String status = report.status(student.id(), sessions.get(i).id());
                ws.value(row, 2 + i, capitalize(status));
                ws.style(row, 2 + i).fillColor(FILLS.getOrDefault(status, "FFFFFF")).set();
            }
            int attended = report.attended(student.id());
            ws.value(row, attendedCol, attended);
            if (!sessions.isEmpty()) {
                ws.value(row, pctCol, (double) attended / sessions.size());
                ws.style(row, pctCol).format("0%").set();
            }
            row++;
        }

        wb.finish();
        return out.toByteArray();
    }

    /** "Käyttöliittymät (UI) 1" becomes "Kayttoliittymat_UI_1-attendance.xlsx": ASCII only, so it's safe in a header. */
    static String fileName(String courseName) {
        String safe = Normalizer.normalize(courseName, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .replaceAll("[^A-Za-z0-9._-]+", "_").replaceAll("^_+|_+$", "");
        return (safe.isEmpty() ? "course" : safe) + "-attendance.xlsx";
    }

    private static String capitalize(String status) {
        return Character.toUpperCase(status.charAt(0)) + status.substring(1);
    }
}

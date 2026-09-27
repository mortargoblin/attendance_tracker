package attendance_tracker.server;

import attendance_tracker.server.Database.ConnectionSource;
import io.javalin.http.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLIntegrityConstraintViolationException;
import java.sql.Statement;
import java.util.Locale;
import java.util.regex.Pattern;

/** POST /api/auth/register, /api/auth/login and /api/auth/logout. */
final class AuthApi {

    record RegisterRequest(String name, String email, String password, String role) {
    }

    record LoginRequest(String email, String password) {
    }

    record UserDto(long id, String name, String email, String role) {
    }

    record AuthResponse(String token, UserDto user) {
    }

    static final int MIN_PASSWORD_LENGTH = 6;

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final String BAD_LOGIN = "Incorrect email or password.";

    private final ConnectionSource db;
    private final Auth auth;
    private final Passwords passwords;

    AuthApi(ConnectionSource db, Auth auth, Passwords passwords) {
        this.db = db;
        this.auth = auth;
        this.passwords = passwords;
    }

    void register(Context ctx) throws SQLException {
        RegisterRequest req = server.body(ctx, RegisterRequest.class);

        String name = req.name() == null ? "" : req.name().trim().replaceAll("\\s+", " ");
        if (name.isEmpty()) {
            throw ApiError.badRequest("Name is required.");
        }
        String[] names = splitName(name);
        if (names[0].length() > 80 || names[1].length() > 80) {
            throw ApiError.badRequest("Name is too long.");
        }
        String email = normalizeEmail(req.email());
        if (email.length() > 255 || !EMAIL.matcher(email).matches()) {
            throw ApiError.badRequest("Enter a valid email address.");
        }
        String password = req.password() == null ? "" : req.password();
        if (password.length() < MIN_PASSWORD_LENGTH) {
            throw ApiError.badRequest("Password must be at least " + MIN_PASSWORD_LENGTH + " characters.");
        }
        if (!Passwords.fitsLimit(password)) {
            throw ApiError.badRequest("Password is too long.");
        }
        // only students and teachers can sign up; admins are created directly in the database
        String role = req.role() == null ? "" : req.role();
        if (!role.equals("student") && !role.equals("teacher")) {
            throw ApiError.badRequest("Role must be student or teacher.");
        }

        String hash = passwords.hash(password);
        long userId;
        try (Connection c = db.open()) {
            if (exists(c, "SELECT 1 FROM users WHERE email = ?", email)) {
                throw ApiError.conflict("An account with that email already exists.");
            }
            String sql = "INSERT INTO users (username, email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?)";
            try (PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                ps.setString(1, uniqueUsername(c, email));
                ps.setString(2, email);
                ps.setString(3, hash);
                ps.setString(4, names[0]);
                ps.setString(5, names[1]);
                ps.setString(6, role.toUpperCase(Locale.ROOT));
                ps.executeUpdate();
                userId = generatedId(ps);
            } catch (SQLIntegrityConstraintViolationException e) {
                // someone registered the same email or username between the check and the insert
                throw ApiError.conflict("An account with that email already exists.");
            }
        }

        UserDto user = new UserDto(userId, name, email, role);
        ctx.status(201).json(new AuthResponse(auth.issue(new Auth.Principal(userId, role)), user));
    }

    void login(Context ctx) throws SQLException {
        LoginRequest req = server.body(ctx, LoginRequest.class);
        String email = normalizeEmail(req.email());
        String password = req.password() == null ? "" : req.password();

        String sql = "SELECT user_id, first_name, last_name, email, role, password_hash FROM users WHERE email = ?";
        try (Connection c = db.open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    passwords.burnTime();
                    throw ApiError.unauthorized(BAD_LOGIN);
                }
                if (!passwords.verify(password, rs.getString("password_hash"))) {
                    throw ApiError.unauthorized(BAD_LOGIN);
                }
                UserDto user = userFrom(rs);
                String token = auth.issue(new Auth.Principal(user.id(), user.role()));
                ctx.json(new AuthResponse(token, user));
            }
        }
    }

    void logout(Context ctx) {
        auth.revoke(ctx);
        ctx.status(204);
    }

    /** Builds a {@link UserDto} from a row with user_id, first_name, last_name, email and role. */
    static UserDto userFrom(ResultSet rs) throws SQLException {
        String name = (rs.getString("first_name") + " " + rs.getString("last_name")).trim();
        return new UserDto(rs.getLong("user_id"), name, rs.getString("email"), rs.getString("role").toLowerCase(Locale.ROOT));
    }

    static long generatedId(PreparedStatement ps) throws SQLException {
        try (ResultSet keys = ps.getGeneratedKeys()) {
            keys.next();
            return keys.getLong(1);
        }
    }

    static boolean exists(Connection c, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                ps.setObject(i + 1, params[i]);
            }
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    private static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    /** "Anna Maria Korhonen" becomes first name "Anna Maria", last name "Korhonen"; one word is just a first name. */
    static String[] splitName(String name) {
        int lastSpace = name.lastIndexOf(' ');
        return lastSpace < 0
                ? new String[] {name, ""}
                : new String[] {name.substring(0, lastSpace), name.substring(lastSpace + 1)};
    }

    /** The schema needs a unique username; the frontend doesn't ask for one, so derive it from the email. */
    private static String uniqueUsername(Connection c, String email) throws SQLException {
        String base = email.substring(0, email.indexOf('@')).replaceAll("[^A-Za-z0-9._-]", "");
        if (base.isEmpty()) {
            base = "user";
        }
        if (base.length() > 56) {
            base = base.substring(0, 56);
        }
        String candidate = base;
        for (int n = 2; exists(c, "SELECT 1 FROM users WHERE username = ?", candidate); n++) {
            candidate = base + n;
        }
        return candidate;
    }
}

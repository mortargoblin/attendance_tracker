package attendance_tracker.server;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Opens the MariaDB connection. Connection details come from the environment:
 * DB_URL (default jdbc:mariadb://localhost:3306/attendance_tracker),
 * DB_USER (default root) and DB_PASSWORD (default empty).
 */
public final class Database {

    private static final Logger LOG = LoggerFactory.getLogger(Database.class);

    static final String DEFAULT_URL = "jdbc:mariadb://localhost:3306/attendance_tracker";
    static final String DEFAULT_USER = "root";
    static final String DEFAULT_PASSWORD = "";

    /** Something that can open a raw JDBC connection; lets tests swap out {@link DriverManager}. */
    @FunctionalInterface
    interface ConnectionSource {
        Connection open() throws SQLException;
    }

    private Database() {
    }

    /** Connects using the environment variables and verifies the connection with a trivial query. */
    public static Connection connect() throws SQLException {
        return connect(
                orDefault(System.getenv("DB_URL"), DEFAULT_URL),
                orDefault(System.getenv("DB_USER"), DEFAULT_USER),
                orDefault(System.getenv("DB_PASSWORD"), DEFAULT_PASSWORD));
    }

    public static Connection connect(String url, String user, String password) throws SQLException {
        return connect(url, user, () -> DriverManager.getConnection(url, user, password));
    }

    /**
     * Opens a connection from {@code source} and verifies it with {@code SELECT 1}.
     * If verification fails the connection is closed before the exception propagates.
     */
    static Connection connect(String url, String user, ConnectionSource source) throws SQLException {
        Connection connection = source.open();
        try (Statement statement = connection.createStatement()) {
            statement.execute("SELECT 1");
        } catch (SQLException e) {
            connection.close();
            throw e;
        }
        LOG.info("Connected to database {} as {}", url, user);
        return connection;
    }

    /** Closes the connection, logging instead of throwing so shutdown always completes. */
    static void closeQuietly(Connection connection) {
        try {
            connection.close();
        } catch (SQLException e) {
            LOG.warn("Error closing database connection", e);
        }
    }

    static String orDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value.trim();
    }
}

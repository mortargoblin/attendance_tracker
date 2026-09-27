package attendance_tracker.server;

import org.mariadb.jdbc.MariaDbPoolDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Opens the MariaDB connection pool. Connection details come from the environment:
 * DB_URL (default jdbc:mariadb://localhost:3306/attendance_tracker),
 * DB_USER (default root) and DB_PASSWORD (default root).
 */
public final class Database {

    private static final Logger LOG = LoggerFactory.getLogger(Database.class);

    static final String DEFAULT_URL = "jdbc:mariadb://localhost:3306/attendance_tracker";
    static final String DEFAULT_USER = "root";
    static final String DEFAULT_PASSWORD = "root";

    /**
     * Something that hands out JDBC connections. Every request borrows one and closes it when
     * done, which returns it to the pool; tests plug in an in-memory database or a fake instead.
     */
    @FunctionalInterface
    interface ConnectionSource {
        Connection open() throws SQLException;
    }

    private Database() {
    }

    /** Creates a pool using the environment variables and verifies it with a trivial query. */
    public static MariaDbPoolDataSource connect() throws SQLException {
        return connect(
                orDefault(System.getenv("DB_URL"), DEFAULT_URL),
                orDefault(System.getenv("DB_USER"), DEFAULT_USER),
                orDefault(System.getenv("DB_PASSWORD"), DEFAULT_PASSWORD));
    }

    public static MariaDbPoolDataSource connect(String url, String user, String password) throws SQLException {
        MariaDbPoolDataSource pool = new MariaDbPoolDataSource();
        try {
            pool.setUrl(url);
            pool.setUser(user);
            pool.setPassword(password);
            verify(url, user, pool::getConnection);
        } catch (SQLException e) {
            pool.close();
            throw e;
        }
        return pool;
    }

    /** Borrows a connection from {@code source}, runs {@code SELECT 1} on it and gives it back. */
    static void verify(String url, String user, ConnectionSource source) throws SQLException {
        try (Connection connection = source.open(); Statement statement = connection.createStatement()) {
            statement.execute("SELECT 1");
        }
        LOG.info("Connected to database {} as {}", url, user);
    }

    /** Closes the resource, logging instead of throwing so shutdown always completes. */
    static void closeQuietly(AutoCloseable resource) {
        try {
            resource.close();
        } catch (Exception e) {
            LOG.warn("Error closing database resource", e);
        }
    }

    static String orDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value.trim();
    }
}

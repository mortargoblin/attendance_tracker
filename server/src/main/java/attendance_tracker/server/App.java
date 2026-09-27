package attendance_tracker.server;

import org.mariadb.jdbc.MariaDbPoolDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.SQLException;

/**
 * Entry point. Connects to the database (see {@link Database} for the DB_*
 * variables), then starts the HTTP server on the port given by the PORT
 * environment variable (default 3000). CORS_ORIGINS lists the frontend
 * origins allowed to call the API (see {@link server#corsOrigins}).
 */
public final class App {

    private static final Logger LOG = LoggerFactory.getLogger(App.class);

    static final int DEFAULT_PORT = 3000;

    private App() {
    }

    public static void main(String[] args) {
        MariaDbPoolDataSource pool;
        try {
            pool = Database.connect();
        } catch (SQLException e) {
            LOG.error("Could not connect to the database: {}", e.getMessage());
            System.exit(1);
            return;
        }

        Runtime.getRuntime().addShutdownHook(new Thread(() -> Database.closeQuietly(pool)));

        server.create(pool::getConnection).start(resolvePort(System.getenv("PORT")));
    }

    static int resolvePort(String envValue) {
        if (envValue == null || envValue.isBlank()) {
            return DEFAULT_PORT;
        }
        return Integer.parseInt(envValue.trim());
    }
}

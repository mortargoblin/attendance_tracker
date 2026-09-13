package attendance_tracker.server;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.SQLException;

/**
 * Entry point. Connects to the database (see {@link Database} for the DB_*
 * variables), then starts the HTTP server on the port given by the PORT
 * environment variable (default 7070).
 */
public final class App {

    private static final Logger LOG = LoggerFactory.getLogger(App.class);

    static final int DEFAULT_PORT = 3000;

    private App() {
    }

    public static void main(String[] args) {
        Connection db;
        try {
            db = Database.connect();
        } catch (SQLException e) {
            LOG.error("Could not connect to the database: {}", e.getMessage());
            System.exit(1);
            return;
        }

        Runtime.getRuntime().addShutdownHook(new Thread(() -> Database.closeQuietly(db)));

        server.create(db).start(resolvePort(System.getenv("PORT")));
    }

    static int resolvePort(String envValue) {
        if (envValue == null || envValue.isBlank()) {
            return DEFAULT_PORT;
        }
        return Integer.parseInt(envValue.trim());
    }
}

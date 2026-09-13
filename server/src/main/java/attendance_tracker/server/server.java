package attendance_tracker.server;

import io.javalin.Javalin;

import java.sql.Connection;
import java.util.Map;


public final class server {

    private server() {
    }

    public static Javalin create(Connection db) {
        Javalin app = Javalin.create();

        app.get("/", ctx -> ctx.json(Map.of("working", "well")));

        app.get("/db_test", ctx -> {
            try (var statement = db.createStatement()) {
                var resultSet = statement.executeQuery("SELECT 1");
                if (resultSet.next()) {
                    ctx.json(Map.of("db_test", "ok"));
                } else {
                    ctx.status(500).json(Map.of("db_test", "failed"));
                }
            }
        });

        return app;
    }
}

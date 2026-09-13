package attendance_tracker.server;

import io.javalin.Javalin;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("HTTP routes")
class ServerTest {

    private static final FakeConnection db = new FakeConnection();
    private static Javalin app;
    private static HttpClient client;

    @BeforeAll
    static void startServer() {
        app = server.create(db.connection).start(0);
        client = HttpClient.newHttpClient();
    }

    @AfterAll
    static void stopServer() {
        app.stop();
    }

    @BeforeEach
    void resetFakeDatabase() {
        db.hasRow = true;
        db.failure = null;
    }

    @Nested
    @DisplayName("GET /")
    class Root {

        @Test
        void returnsOkJson() throws IOException, InterruptedException {
            HttpResponse<String> response = get("/");

            assertEquals(200, response.statusCode());
            assertEquals("{\"working\":\"well\"}", response.body());
            assertJson(response);
        }
    }

    @Nested
    @DisplayName("GET /db_test")
    class DbTest {

        @Test
        void returnsOkWhenQueryProducesRow() throws IOException, InterruptedException {
            db.hasRow = true;

            HttpResponse<String> response = get("/db_test");

            assertEquals(200, response.statusCode());
            assertEquals("{\"db_test\":\"ok\"}", response.body());
            assertJson(response);
        }

        @Test
        void returnsServerErrorWhenQueryProducesNoRow() throws IOException, InterruptedException {
            db.hasRow = false;

            HttpResponse<String> response = get("/db_test");

            assertEquals(500, response.statusCode());
            assertEquals("{\"db_test\":\"failed\"}", response.body());
        }

        @Test
        void returnsServerErrorWhenQueryThrows() throws IOException, InterruptedException {
            db.failure = new SQLException("connection lost");

            assertEquals(500, get("/db_test").statusCode());
        }
    }

    @Test
    @DisplayName("Unknown path returns 404")
    void unknownPathReturnsNotFound() throws IOException, InterruptedException {
        assertEquals(404, get("/does-not-exist").statusCode());
    }

    private static HttpResponse<String> get(String path) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + app.port() + path))
                .GET()
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private static void assertJson(HttpResponse<?> response) {
        String contentType = response.headers().firstValue("Content-Type").orElse("");
        assertTrue(contentType.startsWith("application/json"), "expected JSON but got: " + contentType);
    }
}

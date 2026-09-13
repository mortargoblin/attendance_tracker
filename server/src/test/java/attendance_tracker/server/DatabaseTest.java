package attendance_tracker.server;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.sql.Connection;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DatabaseTest {

    @Nested
    @DisplayName("orDefault")
    class OrDefault {

        @ParameterizedTest(name = "value={0} returns the default")
        @NullAndEmptySource
        @ValueSource(strings = {"   "})
        void returnsDefaultWhenValueIsMissingOrBlank(String value) {
            assertEquals("fallback", Database.orDefault(value, "fallback"));
        }

        @Test
        void returnsValueWhenPresent() {
            assertEquals("given", Database.orDefault("given", "fallback"));
        }

        @Test
        void trimsSurroundingWhitespace() {
            assertEquals("given", Database.orDefault("  given  ", "fallback"));
        }
    }

    @Nested
    @DisplayName("connect")
    class Connect {

        private final FakeConnection fake = new FakeConnection();

        @Test
        void returnsVerifiedConnectionFromSource() throws SQLException {
            Connection connection = Database.connect("jdbc:fake", "user", () -> fake.connection);

            assertSame(fake.connection, connection);
            assertEquals(0, fake.closeCount, "a healthy connection must stay open");
        }

        @Test
        void closesConnectionAndRethrowsWhenVerificationQueryFails() {
            fake.failure = new SQLException("server gone away");

            SQLException thrown = assertThrows(SQLException.class,
                    () -> Database.connect("jdbc:fake", "user", () -> fake.connection));

            assertSame(fake.failure, thrown);
            assertEquals(1, fake.closeCount, "a broken connection must be closed");
        }

        @Test
        void propagatesExceptionWhenSourceCannotOpen() {
            SQLException cause = new SQLException("access denied");

            SQLException thrown = assertThrows(SQLException.class,
                    () -> Database.connect("jdbc:fake", "user", () -> { throw cause; }));

            assertSame(cause, thrown);
        }

        @Test
        void throwsSqlExceptionWhenServerIsUnreachable() {
            // Port 1 is never a MariaDB server, so the driver fails fast with "connection refused"
            String unreachableUrl = "jdbc:mariadb://localhost:1/attendance_tracker?connectTimeout=1000";

            assertThrows(SQLException.class, () -> Database.connect(unreachableUrl, "user", "password"));
        }
    }

    @Nested
    @DisplayName("closeQuietly")
    class CloseQuietly {

        private final FakeConnection fake = new FakeConnection();

        @Test
        void closesConnection() {
            Database.closeQuietly(fake.connection);

            assertEquals(1, fake.closeCount);
        }

        @Test
        void swallowsExceptionFromClose() {
            fake.closeFailure = new SQLException("already closed");

            assertDoesNotThrow(() -> Database.closeQuietly(fake.connection));
            assertEquals(1, fake.closeCount);
        }
    }
}

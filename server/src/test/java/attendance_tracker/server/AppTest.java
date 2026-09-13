package attendance_tracker.server;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@DisplayName("App.resolvePort")
class AppTest {

    @ParameterizedTest(name = "PORT={0} falls back to the default port")
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t"})
    void fallsBackToDefaultWhenPortIsMissingOrBlank(String envValue) {
        assertEquals(App.DEFAULT_PORT, App.resolvePort(envValue));
    }

    @Test
    void parsesNumericPort() {
        assertEquals(8080, App.resolvePort("8080"));
    }

    @Test
    void trimsSurroundingWhitespace() {
        assertEquals(9090, App.resolvePort("  9090 \n"));
    }

    @Test
    void rejectsNonNumericPort() {
        assertThrows(NumberFormatException.class, () -> App.resolvePort("eighty"));
    }
}

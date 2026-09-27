package attendance_tracker.server;

import io.javalin.http.Context;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Login tokens. A token is 32 random bytes handed to the client on login/register and sent back
 * as {@code Authorization: Bearer <token>}. Tokens live in memory only, so restarting the server
 * logs everyone out.
 */
final class Auth {

    static final Duration TOKEN_TTL = Duration.ofHours(12);

    /** The logged-in user behind a request. {@code role} is lower case: student, teacher or admin. */
    record Principal(long userId, String role) {
    }

    private record Entry(Principal principal, Instant expiresAt) {
    }

    private final Map<String, Entry> tokens = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final Clock clock;

    Auth(Clock clock) {
        this.clock = clock;
    }

    String issue(Principal principal) {
        Instant now = clock.instant();
        tokens.values().removeIf(e -> !now.isBefore(e.expiresAt()));

        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tokens.put(token, new Entry(principal, now.plus(TOKEN_TTL)));
        return token;
    }

    void revoke(Context ctx) {
        String token = bearerToken(ctx);
        if (token != null) {
            tokens.remove(token);
        }
    }

    /** Returns the caller, or throws 401 if not logged in and 403 if their role isn't one of {@code roles}. */
    Principal require(Context ctx, String... roles) {
        String token = bearerToken(ctx);
        Entry entry = token == null ? null : tokens.get(token);
        if (entry == null || !clock.instant().isBefore(entry.expiresAt())) {
            if (entry != null) {
                tokens.remove(token);
            }
            throw ApiError.unauthorized("Your session has expired. Please log in again.");
        }
        if (!Arrays.asList(roles).contains(entry.principal().role())) {
            throw ApiError.forbidden();
        }
        return entry.principal();
    }

    private static String bearerToken(Context ctx) {
        String header = ctx.header("Authorization");
        if (header == null || !header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return null;
        }
        String token = header.substring(7).trim();
        return token.isEmpty() ? null : token;
    }
}

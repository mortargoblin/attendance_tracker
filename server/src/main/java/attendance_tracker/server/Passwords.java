package attendance_tracker.server;

import at.favre.lib.crypto.bcrypt.BCrypt;

import java.nio.charset.StandardCharsets;

/** bcrypt hashing for users.password_hash. */
final class Passwords {

    static final int DEFAULT_COST = 12;

    /** bcrypt only looks at the first 72 bytes, so longer passwords are rejected rather than silently cut. */
    static final int MAX_BYTES = 72;

    private final int cost;

    /** Hash of a random string, checked against when the email is unknown so both cases take equally long. */
    private final String dummyHash;

    Passwords(int cost) {
        this.cost = cost;
        this.dummyHash = hash("not a real password " + System.nanoTime());
    }

    String hash(String password) {
        return BCrypt.withDefaults().hashToString(cost, password.toCharArray());
    }

    /** True if {@code password} matches {@code hash}; false for a wrong password or a malformed hash. */
    boolean verify(String password, String hash) {
        if (!fitsLimit(password)) {
            burnTime();
            return false;
        }
        return BCrypt.verifyer().verify(password.toCharArray(), hash).verified;
    }

    /** Spends as long as a real {@link #verify} would, for logins with an unknown email. */
    void burnTime() {
        BCrypt.verifyer().verify(new char[] {'x'}, dummyHash);
    }

    static boolean fitsLimit(String password) {
        return password.getBytes(StandardCharsets.UTF_8).length <= MAX_BYTES;
    }
}

package attendance_tracker.server;

/**
 * An error whose message is safe to show to the user. The server turns it into
 * {@code {"error": message}} with the given HTTP status; the frontend displays the message.
 */
final class ApiError extends RuntimeException {

    final int status;

    ApiError(int status, String message) {
        // no stack trace: these are expected outcomes, not bugs
        super(message, null, false, false);
        this.status = status;
    }

    static ApiError badRequest(String message) {
        return new ApiError(400, message);
    }

    static ApiError unauthorized(String message) {
        return new ApiError(401, message);
    }

    static ApiError forbidden() {
        return new ApiError(403, "You don't have permission to do that.");
    }

    static ApiError notFound(String message) {
        return new ApiError(404, message);
    }

    static ApiError conflict(String message) {
        return new ApiError(409, message);
    }
}

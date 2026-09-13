package attendance_tracker.server;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;


final class FakeConnection {

    volatile boolean hasRow = true;
    volatile SQLException failure;
    volatile int closeCount;
    volatile SQLException closeFailure;

    final Connection connection = proxy(Connection.class, (proxy, method, args) -> {
        switch (method.getName()) {
            case "createStatement":
                return statement();
            case "close":
                closeCount++;
                if (closeFailure != null) {
                    throw closeFailure;
                }
                return null;
            default:
                throw unsupported(method.getName());
        }
    });

    private Statement statement() {
        return proxy(Statement.class, (proxy, method, args) -> {
            switch (method.getName()) {
                case "execute":
                    if (failure != null) {
                        throw failure;
                    }
                    return true;
                case "executeQuery":
                    if (failure != null) {
                        throw failure;
                    }
                    return resultSet();
                case "close":
                    return null;
                default:
                    throw unsupported(method.getName());
            }
        });
    }

    private ResultSet resultSet() {
        return proxy(ResultSet.class, (proxy, method, args) -> {
            switch (method.getName()) {
                case "next":
                    return hasRow;
                case "close":
                    return null;
                default:
                    throw unsupported(method.getName());
            }
        });
    }

    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type}, handler));
    }

    private static UnsupportedOperationException unsupported(String method) {
        return new UnsupportedOperationException("FakeConnection does not support " + method);
    }
}

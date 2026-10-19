package com.neueda.leap;

import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;

/**
 * Trade records are permanent (TS-15.5): triggers refuse any UPDATE, DELETE or TRUNCATE. A test that
 * must clear or rewrite them runs its statements here, with the triggers off inside one transaction,
 * as the schema owner.
 */
public final class TradeRecordsForTests {
    private static final List<String> PERMANENT = List.of(
            "audit_log", "order_status_history", "holding_movements", "cash_transactions");

    private TradeRecordsForTests() {
    }

    /**
     * Runs the statements with the permanent-record triggers disabled, then restores them.
     *
     * @param jdbc owner connection to the test schema
     * @param statements SQL to run, in order
     */
    public static void unlocked(JdbcTemplate jdbc, String... statements) {
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            boolean autoCommit = connection.getAutoCommit();
            connection.setAutoCommit(false);
            try (Statement statement = connection.createStatement()) {
                for (String table : PERMANENT) {
                    statement.execute("ALTER TABLE " + table + " DISABLE TRIGGER USER");
                }
                for (String sql : statements) {
                    statement.execute(sql);
                }
                for (String table : PERMANENT) {
                    statement.execute("ALTER TABLE " + table + " ENABLE TRIGGER USER");
                }
                connection.commit();
            } catch (SQLException | RuntimeException failure) {
                connection.rollback();
                throw failure;
            } finally {
                connection.setAutoCommit(autoCommit);
            }
            return null;
        });
    }
}

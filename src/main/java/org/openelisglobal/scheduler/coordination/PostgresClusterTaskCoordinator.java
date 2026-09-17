package org.openelisglobal.scheduler.coordination;

import jakarta.annotation.PreDestroy;
import java.net.InetAddress;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.sql.DataSource;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.log.LogEvent;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class PostgresClusterTaskCoordinator implements ClusterTaskCoordinator {

    private static final String TASK_NAME_PATTERN = "[a-z0-9][a-z0-9._-]{0,119}";
    private static final Duration MINIMUM_DURATION = Duration.ofSeconds(1);
    private static final Duration MAXIMUM_DURATION = Duration.ofDays(1);

    private final DataSource dataSource;
    private final String ownerId;
    private final ScheduledExecutorService heartbeatExecutor;

    @Autowired
    public PostgresClusterTaskCoordinator(DataSource dataSource) {
        this(dataSource, defaultOwnerId(), Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "cluster-task-heartbeat");
            thread.setDaemon(true);
            return thread;
        }));
    }

    PostgresClusterTaskCoordinator(DataSource dataSource, String ownerId,
            ScheduledExecutorService heartbeatExecutor) {
        this.dataSource = dataSource;
        this.ownerId = ownerId;
        this.heartbeatExecutor = heartbeatExecutor;
    }

    @Override
    public Outcome executeOnce(String taskName, Duration executionWindow, Duration leaseDuration, Work work) {
        validate(taskName, executionWindow, leaseDuration, work);
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(true);
            if (!tryAdvisoryLock(connection, taskName)) {
                return Outcome.SKIPPED_LOCKED;
            }
            try {
                LeaseState lease = claimExecutionSlot(connection, taskName, executionWindow, leaseDuration);
                if (lease == null) {
                    return Outcome.SKIPPED_COMPLETED;
                }
                ScheduledFuture<?> heartbeat = startHeartbeat(lease, leaseDuration);
                try {
                    work.run(lease);
                    lease.assertOwned();
                    finish(connection, lease, "SUCCEEDED", null);
                    return Outcome.EXECUTED;
                } catch (Exception exception) {
                    finishBestEffort(connection, lease, exception);
                    if (exception instanceof RuntimeException runtimeException) {
                        throw runtimeException;
                    }
                    throw new LIMSRuntimeException("Cluster task failed: " + taskName, exception);
                } finally {
                    heartbeat.cancel(false);
                }
            } finally {
                unlockBestEffort(connection, taskName);
            }
        } catch (SQLException exception) {
            throw new LIMSRuntimeException("Unable to coordinate cluster task: " + taskName, exception);
        }
    }

    static void validate(String taskName, Duration executionWindow, Duration leaseDuration, Work work) {
        if (taskName == null || !taskName.matches(TASK_NAME_PATTERN)) {
            throw new IllegalArgumentException("Invalid cluster task name");
        }
        validateDuration(executionWindow, "executionWindow");
        validateDuration(leaseDuration, "leaseDuration");
        if (work == null) {
            throw new IllegalArgumentException("work is required");
        }
    }

    private static void validateDuration(Duration duration, String name) {
        if (duration == null || duration.compareTo(MINIMUM_DURATION) < 0
                || duration.compareTo(MAXIMUM_DURATION) > 0) {
            throw new IllegalArgumentException(name + " must be between one second and one day");
        }
    }

    private boolean tryAdvisoryLock(Connection connection, String taskName) throws SQLException {
        try (PreparedStatement statement = connection
                .prepareStatement("SELECT pg_try_advisory_lock(hashtextextended(?, 0))")) {
            statement.setString(1, taskName);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() && result.getBoolean(1);
            }
        }
    }

    private LeaseState claimExecutionSlot(Connection connection, String taskName, Duration executionWindow,
            Duration leaseDuration) throws SQLException {
        String sql = "WITH current_slot AS (SELECT floor(extract(epoch FROM clock_timestamp()) / ?)::bigint AS slot) "
                + "INSERT INTO cluster_task_execution (task_name, execution_slot, owner_id, fencing_token, status, "
                + "started_at, heartbeat_at, lease_until) SELECT ?, slot, ?, nextval('cluster_task_fencing_token_seq'), "
                + "'RUNNING', clock_timestamp(), clock_timestamp(), clock_timestamp() + (? * interval '1 millisecond') "
                + "FROM current_slot ON CONFLICT (task_name, execution_slot) DO UPDATE SET owner_id = EXCLUDED.owner_id, "
                + "fencing_token = nextval('cluster_task_fencing_token_seq'), status = 'RUNNING', "
                + "started_at = clock_timestamp(), heartbeat_at = clock_timestamp(), "
                + "lease_until = clock_timestamp() + (? * interval '1 millisecond'), completed_at = NULL, last_error = NULL "
                + "WHERE cluster_task_execution.status <> 'SUCCEEDED' "
                + "AND cluster_task_execution.lease_until <= clock_timestamp() "
                + "RETURNING execution_slot, fencing_token";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, executionWindow.toSeconds());
            statement.setString(2, taskName);
            statement.setString(3, ownerId);
            statement.setLong(4, leaseDuration.toMillis());
            statement.setLong(5, leaseDuration.toMillis());
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                return new LeaseState(taskName, result.getLong(1), result.getLong(2), ownerId);
            }
        }
    }

    private ScheduledFuture<?> startHeartbeat(LeaseState lease, Duration leaseDuration) {
        long intervalMillis = Math.max(500L, leaseDuration.toMillis() / 3L);
        return heartbeatExecutor.scheduleAtFixedRate(() -> {
            if (!lease.owned.get()) {
                return;
            }
            try (Connection heartbeatConnection = dataSource.getConnection()) {
                String sql = "UPDATE cluster_task_execution SET heartbeat_at = clock_timestamp(), "
                        + "lease_until = clock_timestamp() + (? * interval '1 millisecond') WHERE task_name = ? "
                        + "AND execution_slot = ? AND owner_id = ? AND fencing_token = ? AND status = 'RUNNING'";
                try (PreparedStatement statement = heartbeatConnection.prepareStatement(sql)) {
                    statement.setLong(1, leaseDuration.toMillis());
                    bindLease(statement, lease, 2);
                    if (statement.executeUpdate() != 1) {
                        lease.owned.set(false);
                    }
                }
            } catch (SQLException exception) {
                lease.owned.set(false);
                LogEvent.logError("Cluster task heartbeat failed for " + lease.taskName, exception);
            }
        }, intervalMillis, intervalMillis, TimeUnit.MILLISECONDS);
    }

    private void finish(Connection connection, LeaseState lease, String status, String error) throws SQLException {
        String sql = "UPDATE cluster_task_execution SET status = ?, completed_at = clock_timestamp(), "
                + "heartbeat_at = clock_timestamp(), lease_until = CASE WHEN ? = 'SUCCEEDED' THEN clock_timestamp() "
                + "ELSE lease_until END, last_error = ? "
                + "WHERE task_name = ? AND execution_slot = ? AND owner_id = ? AND fencing_token = ? "
                + "AND status = 'RUNNING'";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, status);
            statement.setString(2, status);
            statement.setString(3, error);
            bindLease(statement, lease, 4);
            if (statement.executeUpdate() != 1) {
                lease.owned.set(false);
                throw new IllegalStateException("Cluster task lease was lost before completion");
            }
        }
    }

    private void finishBestEffort(Connection connection, LeaseState lease, Exception exception) {
        try {
            finish(connection, lease, "FAILED", truncate(exception.getClass().getSimpleName() + ": "
                    + String.valueOf(exception.getMessage()), 1000));
        } catch (Exception finishException) {
            lease.owned.set(false);
            LogEvent.logError("Unable to record cluster task failure for " + lease.taskName, finishException);
        }
    }

    private void unlockBestEffort(Connection connection, String taskName) {
        try (PreparedStatement statement = connection
                .prepareStatement("SELECT pg_advisory_unlock(hashtextextended(?, 0))")) {
            statement.setString(1, taskName);
            statement.executeQuery();
        } catch (SQLException exception) {
            LogEvent.logError("Unable to release cluster task lock for " + taskName, exception);
        }
    }

    private static void bindLease(PreparedStatement statement, LeaseState lease, int start) throws SQLException {
        statement.setString(start, lease.taskName);
        statement.setLong(start + 1, lease.executionSlot);
        statement.setString(start + 2, lease.ownerId);
        statement.setLong(start + 3, lease.fencingToken);
    }

    private static String truncate(String value, int length) {
        return value.length() <= length ? value : value.substring(0, length);
    }

    private static String defaultOwnerId() {
        String hostname;
        try {
            hostname = InetAddress.getLocalHost().getHostName();
        } catch (Exception exception) {
            hostname = "unknown-host";
        }
        return hostname + ":" + ProcessHandle.current().pid() + ":" + UUID.randomUUID();
    }

    @PreDestroy
    public void shutdown() {
        heartbeatExecutor.shutdownNow();
    }

    private static final class LeaseState implements Lease {
        private final String taskName;
        private final long executionSlot;
        private final long fencingToken;
        private final String ownerId;
        private final AtomicBoolean owned = new AtomicBoolean(true);

        private LeaseState(String taskName, long executionSlot, long fencingToken, String ownerId) {
            this.taskName = taskName;
            this.executionSlot = executionSlot;
            this.fencingToken = fencingToken;
            this.ownerId = ownerId;
        }

        @Override
        public long fencingToken() {
            return fencingToken;
        }

        @Override
        public void assertOwned() {
            if (!owned.get()) {
                throw new IllegalStateException("Cluster task lease is no longer owned");
            }
        }
    }
}

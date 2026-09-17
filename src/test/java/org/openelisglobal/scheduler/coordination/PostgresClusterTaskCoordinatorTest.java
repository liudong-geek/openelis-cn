package org.openelisglobal.scheduler.coordination;

import static org.junit.Assert.assertThrows;

import java.time.Duration;
import org.junit.Test;

public class PostgresClusterTaskCoordinatorTest {

    private static final ClusterTaskCoordinator.Work NO_OP = lease -> {
    };

    @Test
    public void validateAcceptsBoundedProductionTask() {
        PostgresClusterTaskCoordinator.validate("result-export", Duration.ofMinutes(1), Duration.ofMinutes(2),
                NO_OP);
    }

    @Test
    public void validateRejectsTaskNamesThatCouldAlterSqlOrAliasAnotherTask() {
        for (String taskName : new String[] { null, "", "Result Export", "result/export", "result-export;drop",
                "-result-export", "a".repeat(121) }) {
            assertThrows(IllegalArgumentException.class, () -> PostgresClusterTaskCoordinator.validate(taskName,
                    Duration.ofMinutes(1), Duration.ofMinutes(2), NO_OP));
        }
    }

    @Test
    public void validateRejectsUnboundedOrSubsecondWindows() {
        for (Duration duration : new Duration[] { Duration.ZERO, Duration.ofMillis(999), Duration.ofDays(2) }) {
            assertThrows(IllegalArgumentException.class, () -> PostgresClusterTaskCoordinator
                    .validate("result-export", duration, Duration.ofMinutes(2), NO_OP));
        }
    }

    @Test
    public void validateRejectsUnboundedOrSubsecondLeases() {
        for (Duration duration : new Duration[] { Duration.ZERO, Duration.ofMillis(999), Duration.ofDays(2) }) {
            assertThrows(IllegalArgumentException.class, () -> PostgresClusterTaskCoordinator
                    .validate("result-export", Duration.ofMinutes(1), duration, NO_OP));
        }
    }

    @Test
    public void validateRequiresWork() {
        assertThrows(IllegalArgumentException.class, () -> PostgresClusterTaskCoordinator.validate("result-export",
                Duration.ofMinutes(1), Duration.ofMinutes(2), null));
    }
}

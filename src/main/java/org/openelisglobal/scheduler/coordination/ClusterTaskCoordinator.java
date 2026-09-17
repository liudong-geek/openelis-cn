package org.openelisglobal.scheduler.coordination;

import java.time.Duration;

/** Coordinates scheduled work between application instances sharing PostgreSQL. */
public interface ClusterTaskCoordinator {

    enum Outcome {
        EXECUTED,
        SKIPPED_LOCKED,
        SKIPPED_COMPLETED
    }

    @FunctionalInterface
    interface Work {
        void run(Lease lease) throws Exception;
    }

    interface Lease {
        long fencingToken();

        void assertOwned();
    }

    Outcome executeOnce(String taskName, Duration executionWindow, Duration leaseDuration, Work work);
}

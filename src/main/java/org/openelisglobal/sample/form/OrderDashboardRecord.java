package org.openelisglobal.sample.form;

import java.sql.Timestamp;
import org.openelisglobal.sample.valueholder.OrderPriority;

/**
 * Scalar database projection; no managed entities escape the query boundary.
 */
public record OrderDashboardRecord(String id, String labNumber, Timestamp lastUpdated, OrderPriority priority,
        String clinicalOrderId, String firstName, String lastName, String facilityName, boolean storageSkipped,
        boolean registered, boolean collected, boolean storageAssigned, boolean qaVerified,
        boolean hasDisposedSpecimens, boolean hasRejectedSpecimens, boolean hasIntakeStatusConflict,
        boolean hasNoActiveTests, String patientId) {
    public OrderDashboardRecord(String id, String labNumber, Timestamp lastUpdated, OrderPriority priority,
            String clinicalOrderId, String firstName, String lastName, String facilityName, boolean storageSkipped,
            boolean registered, boolean collected, boolean storageAssigned, boolean qaVerified,
            boolean hasDisposedSpecimens, boolean hasRejectedSpecimens, boolean hasIntakeStatusConflict,
            boolean hasNoActiveTests) {
        this(id, labNumber, lastUpdated, priority, clinicalOrderId, firstName, lastName, facilityName, storageSkipped,
                registered, collected, storageAssigned, qaVerified, hasDisposedSpecimens, hasRejectedSpecimens,
                hasIntakeStatusConflict, hasNoActiveTests, null);
    }
}

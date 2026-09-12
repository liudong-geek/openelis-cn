package org.openelisglobal.sample.service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Optional legacy navigation/label defaults, never an authoritative save receipt.
 * Session mutations cannot roll back with the database, so publish only after the
 * enclosing transaction commits. This also respects an outer intake transaction.
 */
final class SampleEntrySessionContext {
    private static final Log LOG = LogFactory.getLog(SampleEntrySessionContext.class);

    private SampleEntrySessionContext() {
    }

    static void publishAfterCommit(HttpServletRequest request, String accessionNumber, String patientId) {
        if (request == null || !TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()) {
            // No proof of a commit: never fall back to publishing immediately.
            return;
        }
        final HttpSession session = request.getSession(false);
        if (session == null) {
            return;
        }
        // Capture immutable values and the original session, not mutable updateData
        // or a request that might return a replacement session after logout.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    synchronized (session) {
                        session.setAttribute("lastAccessionNumber", accessionNumber);
                        // Servlet semantics remove the old patient for environmental orders.
                        session.setAttribute("lastPatientId", patientId);
                    }
                } catch (RuntimeException error) {
                    // The database has already committed. A lost session must not turn
                    // that save into an apparent failure and encourage a duplicate retry.
                    // Do not log patient/order identifiers or session exception content.
                    LOG.warn("Committed sample entry could not update its optional session context");
                }
            }
        });
    }
}

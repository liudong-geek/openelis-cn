package org.openelisglobal.sample.service;

import static org.junit.Assert.*;

import java.util.Map;
import org.junit.After;
import org.junit.Test;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.exception.SampleCollectionValidationException;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** In-memory completion contract only; actual proxy rollback is tested separately. */
public class CollectionSaveAttemptTest {
    private static final String KEY = "11111111-2222-4333-8444-555555555555";
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private final SamplePatientEntryForm form = new SamplePatientEntryForm();

    private CollectionSaveAttempt prepare() {
        form.setCollectionOnly(true);
        var identity = new SampleOrderItem(); identity.setSampleId("1"); identity.setLabNo("SIM-COLLECTION");
        form.setSampleOrderItems(identity); form.setSampleXML("<samples />");
        request.addHeader(CollectionSaveAttempt.HEADER, KEY);
        var attempt = new CollectionSaveAttempt(KEY, "a".repeat(64), form);
        request.setAttribute(CollectionSaveAttempt.ATTRIBUTE, attempt);
        return attempt;
    }
    private void begin() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }
    private void complete(int status) {
        TransactionSynchronizationManager.getSynchronizations().forEach(s -> s.afterCompletion(status));
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }
    private Map<String, Object> rejection(CollectionSaveAttempt attempt) {
        return attempt.rejection(new SampleCollectionValidationException(409, "collection.requestChanged"));
    }
    @After public void cleanup() { TransactionSynchronizationManager.clear(); }

    @Test public void onlyObservedRollbackCanProveThisAttemptWasNotSaved() {
        var attempt = prepare(); assertNull(rejection(attempt));
        begin(); CollectionSaveAttempt.observe(request, "1", "SIM-COLLECTION", "<samples />");
        assertNull(rejection(attempt)); complete(TransactionSynchronization.STATUS_ROLLED_BACK);
        assertEquals(Map.of("success", false, "code", "COLLECTION_NOT_SAVED", "version", 1,
                "attemptId", KEY, "fingerprint", "a".repeat(64), "errorKey", "collection.requestChanged"), rejection(attempt));
    }
    @Test public void commitUnknownAndUnobservedCompletionNeverProveRejection() {
        var attempt = prepare(); begin(); CollectionSaveAttempt.observe(request, "1", "SIM-COLLECTION", "<samples />");
        complete(TransactionSynchronization.STATUS_UNKNOWN); assertNull(rejection(attempt));
        complete(TransactionSynchronization.STATUS_COMMITTED); assertNull(rejection(attempt));
        complete(TransactionSynchronization.STATUS_ROLLED_BACK); assertNull(rejection(attempt));
    }
    @Test public void noProxyOrChangedBodyCannotJoinAttempt() {
        var attempt = prepare();
        assertThrows(IllegalStateException.class, () -> CollectionSaveAttempt.observe(request, "1", "SIM-COLLECTION", "<samples />"));
        begin();
        assertThrows(IllegalStateException.class, () -> CollectionSaveAttempt.observe(request, "2", "SIM-COLLECTION", "<samples />"));
        assertNull(rejection(attempt));
    }
    @Test public void wrongFormHeadersOrRepeatedObservationAreRejected() {
        prepare(); begin();
        assertThrows(IllegalStateException.class, () -> CollectionSaveAttempt.fromRequest(request, new SamplePatientEntryForm()));
        CollectionSaveAttempt.observe(request, "1", "SIM-COLLECTION", "<samples />");
        assertThrows(IllegalStateException.class, () -> CollectionSaveAttempt.observe(request, "1", "SIM-COLLECTION", "<samples />"));
        request.addHeader(CollectionSaveAttempt.HEADER, KEY);
        assertThrows(IllegalStateException.class, () -> CollectionSaveAttempt.fromRequest(request, form));
    }
    @Test public void arbitraryErrorKeysAndStatusesNeverBecomeTrustedRejection() {
        var attempt = prepare(); begin(); CollectionSaveAttempt.observe(request, "1", "SIM-COLLECTION", "<samples />");
        complete(TransactionSynchronization.STATUS_ROLLED_BACK);
        assertNull(attempt.rejection(new SampleCollectionValidationException(503, "collection.requestChanged")));
        assertNull(attempt.rejection(new SampleCollectionValidationException(400, "SIM-PRIVATE")));
        assertNull(attempt.rejection(new SampleCollectionValidationException(400, "collection.sampleMismatch")));
    }
}

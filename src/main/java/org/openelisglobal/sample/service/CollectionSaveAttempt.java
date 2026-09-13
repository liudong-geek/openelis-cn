package org.openelisglobal.sample.service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.Objects;
import org.openelisglobal.sample.exception.SampleCollectionValidationException;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Request-scoped rollback evidence, not an idempotency key or durable receipt. */
public final class CollectionSaveAttempt {
    public static final String HEADER = "X-LIS-Collection-Attempt";
    public static final String ATTRIBUTE = CollectionSaveAttempt.class.getName();
    private static final Map<String, Integer> REJECTIONS = Map.of(
            "collection.requestInvalid", 400, "collection.confirmationRequired", 400,
            "collection.dateTimeInvalid", 400, "collection.sampleMismatch", 409,
            "collection.requestChanged", 409);
    private final String key, fingerprint, sampleId, labNo, xml;
    private final SamplePatientEntryForm form;
    private boolean observed;
    private volatile int completion = -1;

    public CollectionSaveAttempt(String key, String fingerprint, SamplePatientEntryForm form) {
        this.key = EntrySubmissionCommand.validateKey(key);
        if (fingerprint == null || !fingerprint.matches("[a-f0-9]{64}") || form == null
                || !form.isCollectionOnly() || form.getRequestedSpecimens() != null) {
            throw new IllegalStateException("Invalid collection attempt");
        }
        this.fingerprint = fingerprint;
        this.form = form;
        sampleId = form.getSampleOrderItems() == null ? null : form.getSampleOrderItems().getSampleId();
        labNo = form.getSampleOrderItems() == null ? null : form.getSampleOrderItems().getLabNo();
        xml = form.getSampleXML();
    }

    public static CollectionSaveAttempt fromRequest(HttpServletRequest request, SamplePatientEntryForm form) {
        if (request.getHeader(HEADER) == null) { return null; }
        var headers = request.getHeaders(HEADER);
        if (headers == null || !headers.hasMoreElements()) { throw invalid(); }
        String key = headers.nextElement();
        if (headers.hasMoreElements() || request.getHeader(EntrySubmissionCommand.HEADER) != null
                || !(request.getAttribute(ATTRIBUTE) instanceof CollectionSaveAttempt attempt)
                || attempt.form != form || !attempt.key.equals(key) || !form.isCollectionOnly()
                || form.getRequestedSpecimens() != null || !attempt.matches(
                        form.getSampleOrderItems() == null ? null : form.getSampleOrderItems().getSampleId(),
                        form.getSampleOrderItems() == null ? null : form.getSampleOrderItems().getLabNo(),
                        form.getSampleXML())) { throw invalid(); }
        return attempt;
    }

    public static void observe(HttpServletRequest request, String sampleId, String labNo, String xml) {
        if (request.getHeader(HEADER) == null) { return; }
        if (!(request.getAttribute(ATTRIBUTE) instanceof CollectionSaveAttempt attempt)
                || fromRequest(request, attempt.form) != attempt || !attempt.matches(sampleId, labNo, xml)
                || attempt.observed || !TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()) { throw invalid(); }
        attempt.observed = true;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                attempt.completion = attempt.completion == -1 ? status : STATUS_UNKNOWN;
            }
        });
    }

    public Map<String, Object> rejection(SampleCollectionValidationException failure) {
        if (!observed || completion != TransactionSynchronization.STATUS_ROLLED_BACK
                || TransactionSynchronizationManager.isActualTransactionActive()
                || !Objects.equals(REJECTIONS.get(failure.getErrorKey()), failure.getStatus())) { return null; }
        return Map.of("success", false, "code", "COLLECTION_NOT_SAVED", "version", 1,
                "attemptId", key, "fingerprint", fingerprint, "errorKey", failure.getErrorKey());
    }

    private boolean matches(String sampleId, String labNo, String xml) {
        return Objects.equals(this.sampleId, sampleId) && Objects.equals(this.labNo, labNo)
                && Objects.equals(this.xml, xml);
    }
    private static IllegalStateException invalid() { return new IllegalStateException("Invalid collection attempt"); }
}

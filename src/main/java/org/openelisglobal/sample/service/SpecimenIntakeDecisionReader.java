package org.openelisglobal.sample.service;

import java.sql.Connection;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.result.form.SpecimenResultAdmission;
import org.openelisglobal.result.service.SpecimenResultAdmissionReader;
import org.openelisglobal.sample.dao.SpecimenIntakeDecisionDAO;
import org.openelisglobal.sample.service.EntryCurrentStateReader.SpecimenView;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Called only after the original current reader authorizes the complete order.
 */
@Service
public class SpecimenIntakeDecisionReader {
    private final SpecimenIntakeDecisionDAO dao;

    private final SpecimenResultAdmissionReader admissions;

    @Autowired
    public SpecimenIntakeDecisionReader(SpecimenIntakeDecisionDAO dao, SpecimenResultAdmissionReader admissions) {
        this.dao = dao;
        this.admissions = admissions;
    }

    public SpecimenIntakeDecisionReader(SpecimenIntakeDecisionDAO dao) {
        this(dao, null);
    }

    public record Tube(String sampleItemId, String state, String recordedDecision, String operationId,
            SpecimenIntakeDecision.Reason reason, String decidedBy, String decidedAt, boolean currentAcceptanceVerified,
            String evidenceDigest, SpecimenResultAdmission resultEntryAdmission) {
        public Tube(String sampleItemId, String state, String recordedDecision, String operationId,
                SpecimenIntakeDecision.Reason reason, String decidedBy, String decidedAt,
                boolean currentAcceptanceVerified, String evidenceDigest) {
            this(sampleItemId, state, recordedDecision, operationId, reason, decidedBy, decidedAt,
                    currentAcceptanceVerified, evidenceDigest, null);
        }
    }

    public record Reasons(int schema, String state, List<SpecimenIntakeDecision.Reason> items) {
    }

    @Transactional(propagation = Propagation.MANDATORY, readOnly = true)
    public Reasons reasons() {
        requireReadTransaction();
        var rows = dao.activeRejectionReasons();
        if (rows == null || rows.size() > 1000) {
            return new Reasons(1, "UNAVAILABLE", List.of());
        }
        var ids = new HashSet<String>();
        var values = new ArrayList<SpecimenIntakeDecision.Reason>();
        try {
            for (var row : rows) {
                if (row == null || !ids.add(row.getId()) || !"Y".equals(row.getIsActive())
                        || row.getLastupdated() == null || row.getDictionaryCategory() == null
                        || row.getDictionaryCategory().getLastupdated() == null
                        || !"resultRejectionReasons".equals(row.getDictionaryCategory().getCategoryName())) {
                    throw new IllegalArgumentException();
                }
                var reason = new SpecimenIntakeDecision.Reason("DICTIONARY:resultRejectionReasons", row.getId(),
                        row.getLastupdated().toInstant().toString(), row.getDictEntry());
                org.openelisglobal.sample.form.SpecimenIntakeEvidence.requireId(row.getDictionaryCategory().getId());
                var categoryTime = org.openelisglobal.sample.form.SpecimenIntakeEvidence
                        .time(row.getDictionaryCategory().getLastupdated().toInstant().toString());
                if (row.getLastupdated().toInstant().isAfter(java.time.Instant.now())
                        || categoryTime.isAfter(java.time.Instant.now())) {
                    throw new IllegalArgumentException();
                }
                values.add(reason);
            }
            return new Reasons(1, values.isEmpty() ? "EMPTY" : "READY", List.copyOf(values));
        } catch (IllegalArgumentException invalid) {
            return new Reasons(1, "UNAVAILABLE", List.of());
        }
    }

    @Transactional(propagation = Propagation.MANDATORY, readOnly = true)
    public List<Tube> read(String sampleId, String labNo, String patientId, List<SpecimenView> physical) {
        requireReadTransaction();
        var ids = physical.stream().map(SpecimenView::id).toList();
        var rows = dao.findForTubes(ids);
        Map<String, List<SpecimenIntakeDecision>> byTube = new HashMap<>();
        var operations = new HashSet<String>();
        boolean invalidSet = rows == null;
        if (rows != null) {
            for (var row : rows) {
                if (row == null || !ids.contains(row.getSampleItemId()) || !operations.add(row.getOperationId())) {
                    invalidSet = true;
                } else {
                    byTube.computeIfAbsent(row.getSampleItemId(), key -> new ArrayList<>()).add(row);
                }
            }
        }
        List<Tube> result = new ArrayList<>();
        for (var item : physical) {
            var matches = byTube.getOrDefault(item.id(), List.of());
            if (invalidSet || matches.size() > 1) {
                result.add(unverified(item.id(), "INVALID_RECORD"));
            } else if (matches.isEmpty()) {
                result.add(unverified(item.id(), item.rejected() ? "LEGACY_REJECTION" : "NOT_RECORDED"));
            } else {
                result.add(project(matches.get(0), sampleId, labNo, patientId, item));
            }
        }
        return List.copyOf(result);
    }

    @Transactional(propagation = Propagation.MANDATORY, readOnly = true)
    public List<Tube> read(String sampleId, String labNo, String patientId, List<SpecimenView> physical, String actorId,
            List<Analysis> actual) {
        var history = read(sampleId, labNo, patientId, physical);
        if (admissions == null || patientId == null) {
            return history;
        }
        var current = admissions.read(sampleId, actorId, physical, actual);
        return history.stream().map(row -> {
            var admission = current.get(row.sampleItemId());
            if (admission != null && List.of("INVALID_RECORD", "REVIEW_REQUIRED").contains(row.state())) {
                admission = SpecimenResultAdmission.unavailable(sampleId, row.sampleItemId(), admission.itemVersion());
            }
            return new Tube(row.sampleItemId(), row.state(), row.recordedDecision(), row.operationId(), row.reason(),
                    row.decidedBy(), row.decidedAt(), false, row.evidenceDigest(), admission);
        }).toList();
    }

    private void requireReadTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(Connection.TRANSACTION_REPEATABLE_READ)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel())) {
            throw new IllegalStateException("Specimen decision read requires the authorized current transaction");
        }
    }

    private Tube project(SpecimenIntakeDecision row, String sample, String lab, String patient, SpecimenView item) {
        try {
            row.validateRecord();
            if (row.getId() == null) {
                return unverified(item.id(), "INVALID_RECORD");
            }
            if (!Objects.equals(sample, row.getSampleId()) || !Objects.equals(lab, row.getLabNo())
                    || !Objects.equals(patient, row.getPatientId())
                    || !Objects.equals(item.requestId(), row.getRequestId())
                    || !Objects.equals(item.typeOfSampleId(), row.evidence().typeOfSampleId())) {
                // Do not reveal another patient's old reason or signature through a moved tube.
                return unverified(item.id(), "REVIEW_REQUIRED");
            }
            // First decision remains history after later result/status/version changes.
            // Current rejected/voided/status fields are separate in physicalSpecimens.
            return new Tube(item.id(), "RECORDED", row.getDecision().name(), row.getOperationId(), row.reason(),
                    row.getCreatedBy(), row.getCreatedAt().toString(), false, row.getEvidenceDigest());
        } catch (IllegalArgumentException e) {
            return unverified(item.id(), "INVALID_RECORD");
        }
    }

    private Tube unverified(String item, String state) {
        return new Tube(item, state, null, null, null, null, null, false, null);
    }
}

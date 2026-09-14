package org.openelisglobal.sample.service;

import java.sql.Connection;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.openelisglobal.sample.dao.SpecimenIntakeDecisionDAO;
import org.openelisglobal.sample.service.EntryCurrentStateReader.SpecimenView;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
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

    public SpecimenIntakeDecisionReader(SpecimenIntakeDecisionDAO dao) {
        this.dao = dao;
    }

    public record Tube(String sampleItemId, String state, String recordedDecision, String operationId,
            SpecimenIntakeDecision.Reason reason, String decidedBy, String decidedAt,
            boolean currentAcceptanceVerified) {
    }

    @Transactional(propagation = Propagation.MANDATORY, readOnly = true)
    public List<Tube> read(String sampleId, String labNo, String patientId, List<SpecimenView> physical) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(Connection.TRANSACTION_REPEATABLE_READ)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel())) {
            throw new IllegalStateException("Specimen decision read requires the authorized current transaction");
        }
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
                    row.getCreatedBy(), row.getCreatedAt().toString(), false);
        } catch (IllegalArgumentException e) {
            return unverified(item.id(), "INVALID_RECORD");
        }
    }

    private Tube unverified(String item, String state) {
        return new Tube(item, state, null, null, null, null, null, false);
    }
}

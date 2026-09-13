package org.openelisglobal.qachecklist.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.qachecklist.dao.QaChecklistPrerequisiteDAO;
import org.openelisglobal.qachecklist.valueholder.SampleQaChecklist;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Joins the existing authorized current read, never opens another transaction.
 */
@Service
public class QaChecklistReviewReader {
    private final SampleQaChecklistService checklists;
    private final QaChecklistPrerequisiteDAO prerequisites;
    private final PatientService patients;
    private final org.openelisglobal.sample.dao.SpecimenReceiptDAO specimenFacts;

    public QaChecklistReviewReader(SampleQaChecklistService checklists, QaChecklistPrerequisiteDAO prerequisites,
            PatientService patients, org.openelisglobal.sample.dao.SpecimenReceiptDAO specimenFacts) {
        this.checklists = checklists;
        this.prerequisites = prerequisites;
        this.patients = patients;
        this.specimenFacts = specimenFacts;
    }

    public record Review(int schema, String scope, String state, String reason, String currentFactsDigest,
            String checklistVersion, List<String> specimenIds, JsonNode checklistItems, String confirmationId,
            String reviewedAt, Integer reviewerId, boolean currentAcceptanceVerified) {
    }

    @Transactional(propagation = Propagation.MANDATORY, readOnly = true)
    public Review read(Sample sample, String patientId, List<SampleTypeRequest> requests, List<SampleItem> items,
            List<Analysis> analyses) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(java.sql.Connection.TRANSACTION_REPEATABLE_READ)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel())) {
            throw new IllegalStateException("QA context requires the authorized current read boundary");
        }
        if (patientId == null) {
            return blocked(null, "该申请不是临床患者标本，不能使用本次全部实管核对。");
        }
        var row = checklists.findBySampleId(Integer.valueOf(sample.getId()));
        if (row != null && !Integer.valueOf(sample.getId()).equals(row.getSampleId())) {
            return blocked(null, "核对记录关联异常，请联系管理员核对。");
        }
        // Missing configuration, incomplete tubes and malformed legacy confirmation
        // block only QA. The patient/collection/receipt part of current stays visible.
        QaChecklistFacts.Basis basis;
        try {
            var patient = patients.get(patientId);
            if (patient == null || !patientId.equals(patient.getId())) {
                throw QaChecklistFacts.conflict();
            }
            basis = QaChecklistFacts.capture(sample, patient, requests, items, analyses,
                    checklists.getActiveChecklistItems(),
                    prerequisites.findPrerequisites(Integer.valueOf(sample.getId())), specimenFacts::statusName);
            if (row != null && row.getLastupdated() == null) {
                throw QaChecklistFacts.conflict();
            }
        } catch (org.openelisglobal.qachecklist.exception.QaChecklistValidationException | NullPointerException e) {
            return blocked(row, "尚未具备全部实管核对条件：请核对采集签收、患者主档、存放义务及验收配置。");
        }
        String state = QaChecklistConfirmation.state(row, basis);
        String reason = switch (state) {
        case "MATCHED_CONFIRMATION" -> "本次全部实管核对记录与当前事实一致；不代表逐管临床结论或检验放行。";
        case "STALE_CONFIRMATION" -> "上次核对后标本或配置已变化，请重新核对。";
        case "INVALID_CONFIRMATION" -> "历史核对记录不完整，请联系管理员核对。";
        default -> "请逐项核对当前全部实管后明确确认。";
        };
        return new Review(1, QaChecklistFacts.SCOPE, state, reason,
                "INVALID_CONFIRMATION".equals(state) ? null : basis.digest(), version(row), basis.specimenIds(),
                basis.content().path("configuration"), row == null ? null : row.getConfirmationId(),
                row == null ? null : QaChecklistFacts.time(row.getVerifiedDate()),
                row == null ? null : row.getVerifiedByUserId(), false);
    }

    private Review blocked(SampleQaChecklist row, String reason) {
        return new Review(1, QaChecklistFacts.SCOPE, "BLOCKED", reason, null, version(row), List.of(), null,
                row == null ? null : row.getConfirmationId(), null, null, false);
    }

    private String version(SampleQaChecklist row) {
        return row == null ? null : QaChecklistFacts.time(row.getLastupdated());
    }
}

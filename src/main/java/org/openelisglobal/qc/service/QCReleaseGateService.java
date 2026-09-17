package org.openelisglobal.qc.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.qc.dao.QCRuleViolationDAO;
import org.openelisglobal.qc.dto.QCReleaseBlocker;
import org.openelisglobal.qc.valueholder.QCRuleViolation;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Applies unresolved rejection-level QC failures to clinical result release. */
@Service
public class QCReleaseGateService {
    private final QCRuleViolationDAO violations;

    public QCReleaseGateService(QCRuleViolationDAO violations) {
        this.violations = violations;
    }

    @Transactional(readOnly = true)
    public List<QCReleaseBlocker> blockersFor(Analysis analysis) {
        if (!isInstrumentResult(analysis)) {
            return List.of();
        }
        return toBlockers(violations.findReleaseBlocking(analysis.getAnalyzerId(), analysis.getTest().getId()));
    }

    /**
     * Locks the active blocker rows. The surrounding SERIALIZABLE review
     * transaction calls this before signing and again before commit.
     */
    public void requireReleasable(Map<String, Analysis> analyses, Map<String, List<AnalysisItem>> decisions) {
        List<QCReleaseBlocker> blocking = new ArrayList<>();
        decisions.forEach((analysisId, rows) -> {
            if (rows == null || rows.isEmpty() || !rows.get(0).getIsAccepted()) {
                return;
            }
            Analysis analysis = analyses.get(analysisId);
            if (isInstrumentResult(analysis)) {
                blocking.addAll(toBlockers(
                        violations.lockReleaseBlocking(analysis.getAnalyzerId(), analysis.getTest().getId())));
            }
        });
        if (!blocking.isEmpty()) {
            throw blocked();
        }
    }

    private boolean isInstrumentResult(Analysis analysis) {
        return analysis != null && analysis.getTest() != null && StringUtils.isNotBlank(analysis.getAnalyzerId())
                && StringUtils.isNotBlank(analysis.getTest().getId());
    }

    private List<QCReleaseBlocker> toBlockers(List<QCRuleViolation> rows) {
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        return rows.stream().map(this::toBlocker)
                .sorted(Comparator.comparing(QCReleaseBlocker::violationDateTime).reversed()
                        .thenComparing(QCReleaseBlocker::violationId))
                .toList();
    }

    private QCReleaseBlocker toBlocker(QCRuleViolation violation) {
        return new QCReleaseBlocker(violation.getId(), violation.getRuleCode(), violation.getSeverity(),
                violation.getInstrumentId(), violation.getTestId(), violation.getViolationDateTime(),
                violation.getResolutionStatus());
    }

    public static ResponseStatusException blocked() {
        return new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                "Result release is blocked by unresolved rejection-level quality control failures");
    }
}

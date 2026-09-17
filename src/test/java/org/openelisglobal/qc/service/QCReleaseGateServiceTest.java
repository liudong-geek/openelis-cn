package org.openelisglobal.qc.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.qc.dao.QCRuleViolationDAO;
import org.openelisglobal.qc.valueholder.QCRuleViolation;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.springframework.web.server.ResponseStatusException;

public class QCReleaseGateServiceTest {
    private QCRuleViolationDAO violations;
    private QCReleaseGateService gate;
    private Analysis analysis;
    private AnalysisItem decision;

    @Before
    public void setup() {
        violations = mock(QCRuleViolationDAO.class);
        gate = new QCReleaseGateService(violations);
        analysis = new Analysis();
        analysis.setId("101");
        analysis.setAnalyzerId("31");
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        analysis.setTest(test);
        decision = new AnalysisItem();
        decision.setAnalysisId("101");
        decision.setIsAccepted(true);
    }

    @Test
    public void unresolvedAndAcknowledgedRejectionsAreProjectedAndBlockAcceptance() {
        QCRuleViolation violation = blocker("ACKNOWLEDGED");
        when(violations.findReleaseBlocking("31", "401")).thenReturn(List.of(violation));
        when(violations.lockReleaseBlocking("31", "401")).thenReturn(List.of(violation));

        var projected = gate.blockersFor(analysis);
        assertEquals(1, projected.size());
        assertEquals("v-1", projected.get(0).violationId());
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> gate.requireReleasable(Map.of("101", analysis), Map.of("101", List.of(decision))));
        assertEquals(422, error.getStatusCode().value());
    }

    @Test
    public void manualResultsAndReturnDecisionsDoNotUseTheReleaseGate() {
        analysis.setAnalyzerId(null);
        assertTrue(gate.blockersFor(analysis).isEmpty());
        gate.requireReleasable(Map.of("101", analysis), Map.of("101", List.of(decision)));
        verify(violations, never()).lockReleaseBlocking("31", "401");

        analysis.setAnalyzerId("31");
        decision.setIsAccepted(false);
        decision.setIsRejected(true);
        gate.requireReleasable(Map.of("101", analysis), Map.of("101", List.of(decision)));
        verify(violations, never()).lockReleaseBlocking("31", "401");
    }

    private QCRuleViolation blocker(String status) {
        QCRuleViolation violation = new QCRuleViolation();
        violation.setId("v-1");
        violation.setRuleCode("1_3S");
        violation.setSeverity("REJECTION");
        violation.setInstrumentId("31");
        violation.setTestId("401");
        violation.setViolationDateTime(Timestamp.valueOf("2026-09-17 08:00:00"));
        violation.setResolutionStatus(status);
        return violation;
    }
}

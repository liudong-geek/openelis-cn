package org.openelisglobal.analyzerresults.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.Test;
import org.openelisglobal.analyzerresults.dao.AnalyzerResultsDAO;
import org.openelisglobal.analyzerresults.valueholder.AnalyzerResults;
import org.springframework.test.util.ReflectionTestUtils;

public class QCStagingRetentionTest {
    @Test
    public void patientAcceptanceDoesNotDeleteControlOriginal() {
        AnalyzerResultsServiceImpl service = new AnalyzerResultsServiceImpl();
        AnalyzerResults control = new AnalyzerResults();
        control.setId("700");
        control.setIsControl(true);
        AnalyzerResultsDAO dao = mock(AnalyzerResultsDAO.class);
        when(dao.get("700")).thenReturn(Optional.of(control));
        ReflectionTestUtils.setField(service, "baseObjectDAO", dao);
        ReflectionTestUtils.setField(service, "auditTrailLog", false);

        // The patient acceptance cleanup uses this public deletion entry point.
        service.delete("700", "1");

        verify(dao, never()).delete(control);
    }
}

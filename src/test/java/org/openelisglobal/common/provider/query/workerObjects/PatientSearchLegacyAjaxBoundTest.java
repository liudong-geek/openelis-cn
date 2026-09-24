package org.openelisglobal.common.provider.query.workerObjects;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.List;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.provider.query.workerObjects.PatientSearchWorker.BoundedPatientSearchResults;
import org.openelisglobal.common.rest.util.PatientSearchResultsPaging;

public class PatientSearchLegacyAjaxBoundTest {

    @Test
    public void localAjaxSearchUsesTheTwoThousandAndOneRowProbe() {
        assertLegacySearchIsBounded(mock(PatientSearchLocalWorker.class, CALLS_REAL_METHODS));
    }

    @Test
    public void combinedAjaxSearchUsesTheTwoThousandAndOneRowProbe() {
        assertLegacySearchIsBounded(mock(PatientSearchLocalAndExternalWorker.class, CALLS_REAL_METHODS));
    }

    private void assertLegacySearchIsBounded(PatientSearchWorker worker) {
        doReturn(new BoundedPatientSearchResults(List.of(), true)).when(worker).getPatientSearchResults(anyString(),
                anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(),
                anyInt());
        StringBuilder xml = new StringBuilder();

        String status = worker.createSearchResultXML("Smith", "", "", "", "", "", "", "", "", xml);

        assertEquals(IActionConstants.INVALID, status);
        assertEquals(PatientSearchWorker.TOO_MANY_RESULTS, xml.toString());
        assertFalse(xml.toString().contains("<result>"));
        assertEquals(PatientSearchResultsPaging.MAX_CACHED_ROWS + 1, PatientSearchWorker.AJAX_QUERY_RESULT_PROBE_LIMIT);
        verify(worker).getPatientSearchResults("Smith", "", "", "", "", "", "", "", "",
                PatientSearchWorker.AJAX_QUERY_RESULT_PROBE_LIMIT);
    }
}

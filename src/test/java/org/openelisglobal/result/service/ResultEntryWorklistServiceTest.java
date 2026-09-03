package org.openelisglobal.result.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotSame;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collections;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.beanItems.TestResultItem;

@RunWith(MockitoJUnitRunner.class)
public class ResultEntryWorklistServiceTest {

    @Mock
    private AnalysisService analysisService;
    @Mock
    private IStatusService statusService;
    @Mock
    private UserService userService;
    @Mock
    private ResultEntryWorklistLoader worklistLoader;

    @InjectMocks
    private ResultEntryWorklistServiceImpl worklistService;

    @Test
    public void pendingWorklist_usesDashboardStatusAndAppliesLabUnitPermissions() {
        Analysis analysis = new Analysis();
        analysis.setId("42");
        TestResultItem pendingResult = new TestResultItem();
        pendingResult.setAnalysisId("42");
        Result nestedResult = new Result();
        nestedResult.setId("99");
        pendingResult.setResult(nestedResult);

        when(statusService.getStatusID(AnalysisStatus.NotStarted)).thenReturn("4");
        when(analysisService.getAnalysesForStatusId("4")).thenReturn(Collections.singletonList(analysis));
        when(worklistLoader.load(Collections.singletonList(analysis), "7"))
                .thenReturn(Collections.singletonList(pendingResult));
        when(userService.filterResultsByLabUnitRoles("7", Collections.singletonList(pendingResult),
                Constants.ROLE_RESULTS)).thenReturn(Collections.singletonList(pendingResult));

        List<TestResultItem> results = worklistService.getPendingResultsForUser("7");

        assertEquals(1, results.size());
        assertEquals("42", results.get(0).getAnalysisId());
        assertEquals("99", results.get(0).getResult().getId());
        assertNotSame(nestedResult, results.get(0).getResult());
        verify(worklistLoader).load(Collections.singletonList(analysis), "7");
        verify(userService).filterResultsByLabUnitRoles("7", Collections.singletonList(pendingResult),
                Constants.ROLE_RESULTS);
    }
}

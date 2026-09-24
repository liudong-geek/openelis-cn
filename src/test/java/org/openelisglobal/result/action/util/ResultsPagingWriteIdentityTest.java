package org.openelisglobal.result.action.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.paging.PagingBean;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.result.form.LogbookResultsForm;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.mock.web.MockHttpServletRequest;

public class ResultsPagingWriteIdentityTest {
    @Test
    public void normalEditKeepsTheServerOwnedVersionAndIdentity() {
        TestResultItem cached = row("101", "201", "501", "1000");
        TestResultItem posted = row("101", "201", "501", "9999");
        posted.setResultValue("9.5");
        posted.setIsModified(true);
        MockHttpServletRequest request = requestWith(cached);

        new ResultsPaging().updatePagedResults(request, form(posted));

        TestResultItem stored = new ResultsPaging().getResults(request).get(0);
        assertEquals("1000", stored.getAnalysisLastupdated());
        assertEquals("101", stored.getAnalysisId());
        assertEquals("201", stored.getSampleItemId());
        assertEquals("9.5", stored.getResultValue());
    }

    @Test
    public void legacyJspMayOmitServerOwnedIdentityFields() {
        TestResultItem cached = row("101", "201", "501", "1000");
        cached.setQualifiedResultId("601");
        cached.setTestResultComponentId("701");
        TestResultItem posted = row("101", null, "501", null);
        posted.setAccessionNumber("S-201");
        posted.setQualifiedResultId(null);
        posted.setTestResultComponentId(null);
        posted.setResultValue("9.5");
        posted.setIsModified(true);
        MockHttpServletRequest request = requestWith(cached);

        new ResultsPaging().updatePagedResults(request, form(posted));

        TestResultItem stored = new ResultsPaging().getResults(request).get(0);
        assertEquals("1000", stored.getAnalysisLastupdated());
        assertEquals("201", stored.getSampleItemId());
        assertEquals("601", stored.getQualifiedResultId());
        assertEquals("701", stored.getTestResultComponentId());
    }

    @Test
    public void explicitlyChangingAnOptionalServerOwnedIdentityIsRejected() {
        TestResultItem cached = row("101", "201", "501", "1000");
        TestResultItem posted = row("101", "999", "501", "1000");
        posted.setIsModified(true);
        MockHttpServletRequest request = requestWith(cached);

        ResultSaveValidationException mismatch = assertThrows(ResultSaveValidationException.class,
                () -> new ResultsPaging().updatePagedResults(request, form(posted)));

        assertEquals("error.results.analysisMismatch", mismatch.getErrorCode());
        assertEquals("201", new ResultsPaging().getResults(request).get(0).getSampleItemId());
    }

    @Test
    public void replacingAPagePositionWithAnotherAnalysisIsRejected() {
        TestResultItem cached = row("101", "201", "501", "1000");
        TestResultItem posted = row("999", "299", "599", "1000");
        posted.setIsModified(true);
        MockHttpServletRequest request = requestWith(cached);

        ResultSaveValidationException mismatch = assertThrows(ResultSaveValidationException.class,
                () -> new ResultsPaging().updatePagedResults(request, form(posted)));

        assertEquals("error.results.analysisMismatch", mismatch.getErrorCode());
        assertEquals("101", new ResultsPaging().getResults(request).get(0).getAnalysisId());
    }

    private MockHttpServletRequest requestWith(TestResultItem cached) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        List<TestResultItem> page = new ArrayList<>(List.of(cached));
        request.getSession().setAttribute(IActionConstants.RESULTS_SESSION_CACHE, new ArrayList<>(List.of(page)));
        return request;
    }

    private LogbookResultsForm form(TestResultItem posted) {
        PagingBean paging = new PagingBean();
        paging.setCurrentPage("1");
        paging.setTotalPages("1");
        LogbookResultsForm form = new LogbookResultsForm();
        form.setPaging(paging);
        form.setTestResult(new ArrayList<>(List.of(posted)));
        return form;
    }

    private TestResultItem row(String analysisId, String itemId, String resultId, String version) {
        TestResultItem row = new TestResultItem();
        row.setAnalysisId(analysisId);
        row.setTestId("401");
        row.setSampleItemId(itemId);
        row.setAccessionNumber("S-" + itemId);
        row.setResultId(resultId);
        row.setAnalysisLastupdated(version);
        return row;
    }
}

package org.openelisglobal.result.controller;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.Test;
import org.openelisglobal.referral.service.ReferralTypeService;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.form.LogbookResultsForm;
import org.openelisglobal.result.service.LegacyResultEntryWriteService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.BindingResult;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

public class LogbookResultsControllerWriteGuardTest {

    @Test
    public void retainedJspWriteUsesTheTransactionalLegacyGuard() throws Exception {
        Field dependency = LogbookResultsController.class.getDeclaredField("legacyResultEntryWriteService");

        assertEquals(LegacyResultEntryWriteService.class, dependency.getType());
    }

    @Test
    public void retainedJspWriteExplicitlyRequiresTheResultsRole() throws Exception {
        Method write = LogbookResultsController.class.getMethod("showLogbookResultsUpdate", HttpServletRequest.class,
                LogbookResultsForm.class, BindingResult.class, RedirectAttributes.class);
        PreAuthorize authorization = write.getAnnotation(PreAuthorize.class);

        assertNotNull(authorization);
        assertEquals("hasRole('RESULTS')", authorization.value());
    }

    @Test
    public void staleOrMalformedSessionCacheIsRejectedBeforePaging() {
        assertFalse(LogbookResultsController.isUsableResultsSessionCache(null));
        assertFalse(LogbookResultsController.isUsableResultsSessionCache(List.of()));
        assertFalse(LogbookResultsController.isUsableResultsSessionCache(List.of("wrong page type")));
        assertFalse(LogbookResultsController.isUsableResultsSessionCache(List.of(List.of("wrong row type"))));
        assertFalse(LogbookResultsController.isUsableResultsSessionCache(List.of(List.of())));
    }

    @Test
    public void populatedResultSessionCacheCanProceedToPaging() {
        assertTrue(LogbookResultsController.isUsableResultsSessionCache(List.of(List.of(new TestResultItem()))));
    }

    @Test
    public void retainedJspPreparationUsesTheSharedForceAcceptanceGuard() throws Exception {
        TestResultItem item = new TestResultItem();
        item.setAnalysisId("42");
        item.setForceTechApproval("true");
        item.setForceTechApprovalNote(" ");
        ResultsUpdateDataSet data = org.mockito.Mockito.mock(ResultsUpdateDataSet.class);
        org.mockito.Mockito.when(data.getModifiedItems()).thenReturn(List.of(item));
        Method prepare = LogbookResultsController.class.getDeclaredMethod("createResultsFromItems",
                ResultsUpdateDataSet.class, boolean.class, boolean.class, boolean.class, String.class);
        prepare.setAccessible(true);

        var constructor = LogbookResultsController.class.getDeclaredConstructor(ReferralTypeService.class);
        constructor.setAccessible(true);
        var controller = constructor.newInstance(org.mockito.Mockito.mock(ReferralTypeService.class));
        InvocationTargetException thrown = org.junit.Assert.assertThrows(InvocationTargetException.class,
                () -> prepare.invoke(controller, data, false, false, false, "DEFAULT"));

        assertTrue(thrown.getCause() instanceof ResponseStatusException);
    }
}

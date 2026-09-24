package org.openelisglobal.result.controller.rest;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.referral.service.ReferralTypeService;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.result.form.LogbookResultsForm;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.BindingResult;

public class LogbookResultsRestControllerWriteConflictTest {
    private LogbookResultsRestController controller;

    @Before
    public void setup() {
        ReferralTypeService referrals = mock(ReferralTypeService.class);
        when(referrals.getReferralTypeByName("Confirmation")).thenReturn(null);
        controller = new LogbookResultsRestController(referrals);
    }

    @Test
    public void staleLegacyWriteHasAStable409Contract() {
        var response = controller
                .resultSaveValidationFailure(new ResultSaveValidationException("error.results.staleSave"));

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertEquals("error.results.staleSave", response.getBody().get("error"));
    }

    @Test
    public void legacyWriteExplicitlyRequiresTheResultsRole() throws Exception {
        Method write = LogbookResultsRestController.class.getMethod("showReactLogbookResultsUpdate",
                HttpServletRequest.class, LogbookResultsForm.class, BindingResult.class);
        PreAuthorize authorization = write.getAnnotation(PreAuthorize.class);

        assertNotNull(authorization);
        assertEquals("hasRole('RESULTS')", authorization.value());
    }
}

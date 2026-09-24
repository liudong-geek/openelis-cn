package org.openelisglobal.config;

import static org.junit.Assert.assertEquals;

import java.util.Map;
import org.junit.Test;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.http.HttpStatus;

public class ControllerSetupResultConflictTest {

    private final ControllerSetup advice = new ControllerSetup();

    @Test
    public void specialtyValidationConflictKeepsStable409Code() {
        var response = advice.handleResultSaveValidationException(
                new ResultSaveValidationException("error.results.specimenNotEligible"), null);

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertEquals("error.results.specimenNotEligible", ((Map<?, ?>) response.getBody()).get("error"));
    }

    @Test
    public void unknownValidationConflictDoesNotLeakInternalMessage() {
        var response = advice.handleResultSaveValidationException(
                new ResultSaveValidationException("private-database-detail"), null);

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertEquals("error.save.msg", ((Map<?, ?>) response.getBody()).get("error"));
    }

    @Test
    public void serializationConflictIsReportedAsStale409() {
        var response = advice.handleConcurrencyFailureException(new ConcurrencyFailureException("database detail"),
                null);

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertEquals("error.results.staleSave", ((Map<?, ?>) response.getBody()).get("error"));
    }
}

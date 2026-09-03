package org.openelisglobal.sample.action.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.openelisglobal.common.validator.BaseErrors;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.springframework.validation.BeanPropertyBindingResult;

public class SamplePatientErrorMergeTest {

    @Test
    public void patientErrorsWithDifferentObjectName_areCopiedWithoutServerException() {
        BaseErrors patientErrors = new BaseErrors();
        patientErrors.reject("error.duplicate.nationalId", null, "National ID is already in use");

        BeanPropertyBindingResult result = new BeanPropertyBindingResult(new SamplePatientEntryForm(),
                "samplePatientEntryForm");

        SamplePatientUpdateData.copyPatientErrors(patientErrors, result);

        assertTrue(result.hasGlobalErrors());
        assertEquals("error.duplicate.nationalId", result.getGlobalError().getCode());
        assertEquals("National ID is already in use", result.getGlobalError().getDefaultMessage());
    }
}

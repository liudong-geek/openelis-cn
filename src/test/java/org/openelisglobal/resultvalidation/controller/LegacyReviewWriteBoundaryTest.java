package org.openelisglobal.resultvalidation.controller;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.note.service.NoteService;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.reports.service.DocumentTrackService;
import org.openelisglobal.reports.service.DocumentTypeService;
import org.openelisglobal.resultvalidation.form.ResultValidationForm;
import org.openelisglobal.resultvalidation.service.ResultValidationService;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.testresult.service.TestResultService;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.web.server.ResponseStatusException;

public class LegacyReviewWriteBoundaryTest {
    @Test
    public void oldManualFormsRejectBeforeConsumingCacheOrMutatingEntities() throws Exception {
        var references = mock(ReferenceTablesService.class, RETURNS_DEEP_STUBS);
        var documents = mock(DocumentTypeService.class, RETURNS_DEEP_STUBS);
        var analyses = mock(AnalysisService.class);
        var persist = mock(ResultValidationService.class);
        var byTest = new ResultValidationController(analyses, mock(TestResultService.class),
                mock(SampleHumanService.class), mock(DocumentTrackService.class), mock(TestSectionService.class),
                mock(SystemUserService.class), references, documents, persist, mock(NoteService.class),
                mock(FhirTransformService.class));
        var byAccession = new AccessionValidationRangeController(analyses, mock(TestResultService.class),
                mock(SampleHumanService.class), mock(DocumentTrackService.class), mock(TestSectionService.class),
                mock(SystemUserService.class), references, documents, persist, mock(NoteService.class),
                mock(FhirTransformService.class));
        var request = new MockHttpServletRequest();
        var form = new ResultValidationForm();
        var errors = new BeanPropertyBindingResult(form, "form");
        assertEquals(409, assertThrows(ResponseStatusException.class,
                () -> byTest.showResultValidationSave(request, form, errors, null)).getStatusCode().value());
        assertEquals(409,
                assertThrows(ResponseStatusException.class,
                        () -> byAccession.showAccessionValidationRangeSave(request, form, errors, null)).getStatusCode()
                        .value());
        assertNull(request.getSession(false));
        verifyZeroInteractions(analyses, persist);
    }
}

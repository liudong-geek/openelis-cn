package org.openelisglobal.resultvalidation.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.config.ControllerSetup;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.note.service.NoteService;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.reports.service.DocumentTrackService;
import org.openelisglobal.reports.service.DocumentTypeService;
import org.openelisglobal.reports.valueholder.DocumentType;
import org.openelisglobal.resultvalidation.form.ResultValidationForm;
import org.openelisglobal.resultvalidation.service.ResultValidationService;
import org.openelisglobal.resultvalidation.service.ReviewQueryContextService;
import org.openelisglobal.resultvalidation.util.ResultsValidationUtility;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.testresult.service.TestResultService;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.web.server.ResponseStatusException;

/** HTTP entry-point routing and fail-closed behavior; no database writes. */
public class AccessionValidationQueryControllerTest {
    private AccessionValidationRestController controller;
    private ReviewQueryContextService contexts;
    private ResultValidationService persistence;
    private org.openelisglobal.resultvalidation.service.ReviewSubmissionService submissions;
    private MockHttpServletRequest request;

    @Before
    public void setup() {
        ReferenceTablesService references = mock(ReferenceTablesService.class);
        ReferenceTables reference = new ReferenceTables();
        reference.setId("1");
        when(references.getReferenceTableByName("RESULT")).thenReturn(reference);
        DocumentTypeService documentTypes = mock(DocumentTypeService.class);
        DocumentType documentType = new DocumentType();
        documentType.setId("2");
        when(documentTypes.getDocumentTypeByName("resultExport")).thenReturn(documentType);
        persistence = mock(ResultValidationService.class);
        controller = new AccessionValidationRestController(mock(AnalysisService.class), mock(TestResultService.class),
                mock(SampleHumanService.class), mock(DocumentTrackService.class), mock(TestSectionService.class),
                mock(SystemUserService.class), references, documentTypes, persistence, mock(NoteService.class),
                mock(FhirTransformService.class));
        contexts = mock(ReviewQueryContextService.class);
        ReflectionTestUtils.setField(controller, "reviewQueryContextService", contexts);
        submissions = mock(org.openelisglobal.resultvalidation.service.ReviewSubmissionService.class);
        ReflectionTestUtils.setField(controller, "reviewSubmissionService", submissions);
        request = new MockHttpServletRequest();
        UserSessionData user = new UserSessionData();
        user.setSytemUserId(7);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, user);
    }

    @Test
    public void saveDelegatesOnlyServerSnapshotAndReturnsQueryReceiptWithoutCredentials() throws Exception {
        ResultValidationForm form = new ResultValidationForm();
        form.setQueryId("SIM-query-A");
        var credentials = new ResultValidationForm.ReviewSignature();
        credentials.setUsername("SIM-user");
        credentials.setPassword("SIM-secret");
        form.setReviewSignature(credentials);
        var serverRows = java.util.List.of(new org.openelisglobal.resultvalidation.bean.AnalysisItem());
        when(contexts.consumeForSave(request.getSession(), "7", form)).thenReturn(serverRows);
        var response = controller.showAccessionValidationRangeSave(request, form,
                new BeanPropertyBindingResult(form, "form"));
        verify(submissions).save(request, "7", serverRows, credentials);
        assertEquals("SIM-query-A", response.getQueryId());
        assertTrue(response.getResultList().isEmpty());
        assertNull(response.getReviewSignature());
        verifyZeroInteractions(persistence);
    }

    @Test
    public void actualHttpMappingPreservesStaleAndForbiddenStatuses() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ControllerSetup()).build();
        for (HttpStatus error : new HttpStatus[] { HttpStatus.CONFLICT, HttpStatus.FORBIDDEN }) {
            doThrow(new ResponseStatusException(error)).when(contexts).page(any(), eq("7"), any(), eq("SIM-query-A"),
                    eq("1"));
            mvc.perform(get("/rest/AccessionValidation").session((MockHttpSession) request.getSession())
                    .param("accessionNumber", "SIM-A").param("doRange", "false").param("queryId", "SIM-query-A")
                    .param("page", "1")).andExpect(status().is(error.value()));
        }
        verifyZeroInteractions(persistence);
    }

    @Test
    public void missingSampleInitialGetStillCreatesAnEmptyIndependentQuery() throws Exception {
        Object oldForms = ReflectionTestUtils.getField(FormFields.class, "instance");
        Object oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        Object oldDisplay = ReflectionTestUtils.getField(DisplayListService.class, "instance");
        try {
            ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
            ReflectionTestUtils.setField(DisplayListService.class, "instance", mock(DisplayListService.class));
            AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class);
            when(factory.getBean(ResultsValidationUtility.class)).thenReturn(mock(ResultsValidationUtility.class));
            ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
            RoleService roles = mock(RoleService.class);
            Role role = new Role();
            role.setId("3");
            when(roles.getRoleByName(anyString())).thenReturn(role);
            ReflectionTestUtils.setField(controller, "roleService", roles);
            ReflectionTestUtils.setField(controller, "userService", mock(UserService.class));
            SampleService samples = mock(SampleService.class);
            ReflectionTestUtils.setField(controller, "sampleService", samples);
            ResultValidationForm response = controller.showAccessionValidationRange(request, "SIM-missing", null, null,
                    false);
            verify(samples).getSampleByAccessionNumber("SIM-missing");
            verify(contexts).create(eq(request.getSession()), eq("7"), same(response), eq(java.util.List.of()),
                    eq(false));
            assertEquals("SIM-missing", response.getAccessionNumber());
            assertEquals(Boolean.FALSE, response.getDoRange());
        } finally {
            ReflectionTestUtils.setField(FormFields.class, "instance", oldForms);
            ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
            ReflectionTestUtils.setField(DisplayListService.class, "instance", oldDisplay);
        }
    }

    @Test
    public void getPageForwardsQueryIdentityAndOriginalCriteria() throws Exception {
        request.setParameter("queryId", "SIM-query-A");
        request.setParameter("page", "2");
        ResultValidationForm response = controller.showAccessionValidationRange(request, "SIM-A", null, null, false);
        verify(contexts).page(eq(request.getSession()), eq("7"), same(response), eq("SIM-query-A"), eq("2"));
        assertEquals("SIM-A", response.getAccessionNumber());
        assertEquals(Boolean.FALSE, response.getDoRange());
        verifyZeroInteractions(persistence);
    }

    @Test
    public void missingPageTokenNeverFallsBackToLegacySessionCache() throws Exception {
        request.getSession().setAttribute(IActionConstants.RESULTS_SESSION_CACHE, java.util.List.of("SIM-old"));
        request.setParameter("page", "1");
        doThrow(new ResponseStatusException(HttpStatus.CONFLICT)).when(contexts).page(any(), anyString(), any(),
                isNull(), eq("1"));
        try {
            controller.showAccessionValidationRange(request, "SIM-A", null, null, false);
            fail();
        } catch (ResponseStatusException e) {
            assertEquals(409, e.getStatusCode().value());
        }
        verifyZeroInteractions(persistence);
    }

    @Test
    public void invalidBodyStopsBeforeContextConsumptionOrPersistence() throws Exception {
        ResultValidationForm form = new ResultValidationForm();
        BeanPropertyBindingResult errors = new BeanPropertyBindingResult(form, "form");
        errors.reject("SIM-invalid");
        try {
            controller.showAccessionValidationRangeSave(request, form, errors);
            fail();
        } catch (ResponseStatusException e) {
            assertEquals(400, e.getStatusCode().value());
        }
        verifyZeroInteractions(contexts, persistence);
    }

    @Test
    public void unsupportedLegacyPostPagingIsRejectedBeforeAnyCacheAccess() throws Exception {
        request.setParameter("pageResults", "true");
        ResultValidationForm form = new ResultValidationForm();
        try {
            controller.showAccessionValidationRangeSave(request, form, new BeanPropertyBindingResult(form, "form"));
            fail();
        } catch (ResponseStatusException e) {
            assertEquals(409, e.getStatusCode().value());
        }
        verifyZeroInteractions(contexts, persistence);
    }

    @Test
    public void postStaleContextOrRevokedPermissionCannotReachPersistence() throws Exception {
        for (HttpStatus status : new HttpStatus[] { HttpStatus.CONFLICT, HttpStatus.FORBIDDEN }) {
            ResultValidationForm form = new ResultValidationForm();
            form.setQueryId("SIM-query-A");
            when(contexts.consumeForSave(same(request.getSession()), eq("7"), same(form)))
                    .thenThrow(new ResponseStatusException(status));
            try {
                controller.showAccessionValidationRangeSave(request, form, new BeanPropertyBindingResult(form, "form"));
                fail();
            } catch (ResponseStatusException e) {
                assertEquals(status.value(), e.getStatusCode().value());
            }
        }
        verifyZeroInteractions(persistence);
    }
}

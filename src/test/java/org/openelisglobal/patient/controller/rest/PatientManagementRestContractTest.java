package org.openelisglobal.patient.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import jakarta.persistence.OptimisticLockException;
import java.util.Map;
import org.hibernate.validator.messageinterpolation.ParameterMessageInterpolator;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.patient.service.PatientDocumentMaintenanceService;
import org.openelisglobal.patient.service.PatientIdDocumentService;
import org.openelisglobal.patient.service.PatientMaintenanceConflictException;
import org.openelisglobal.patient.service.PatientMaintenanceService;
import org.openelisglobal.patient.service.PatientMaintenanceValidationException;
import org.openelisglobal.patient.service.PatientManagementAuthorizationService;
import org.openelisglobal.patient.service.PatientPhotoService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.siteinformation.service.SiteInformationService;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.server.ResponseStatusException;

public class PatientManagementRestContractTest {
    private static Object previousFactory;
    private static Object previousFormFields;
    private PatientManagementRestController controller;
    private PatientMaintenanceService maintenance;
    private PatientManagementAuthorizationService authorization;
    private FhirTransformService fhir;
    private PatientPhotoService photos;
    private PatientIdDocumentService documents;
    private PatientDocumentMaintenanceService documentMaintenance;
    private MockHttpServletRequest request;
    private MockMvc mvc;

    @BeforeClass
    public static void legacyValidationSetup() {
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        previousFormFields = ReflectionTestUtils.getField(FormFields.class, "instance");
        var factory = mock(AutowireCapableBeanFactory.class);
        when(factory.getBean(DefaultConfigurationProperties.class))
                .thenReturn(mock(DefaultConfigurationProperties.class));
        when(factory.getBean(SiteInformationService.class)).thenReturn(mock(SiteInformationService.class));
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
    }

    @AfterClass
    public static void restoreValidationSetup() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", previousFormFields);
    }

    @Before
    public void setup() {
        controller = new PatientManagementRestController();
        maintenance = mock(PatientMaintenanceService.class);
        authorization = mock(PatientManagementAuthorizationService.class);
        fhir = mock(FhirTransformService.class);
        photos = mock(PatientPhotoService.class);
        documents = mock(PatientIdDocumentService.class);
        ReflectionTestUtils.setField(controller, "maintenanceService", maintenance);
        ReflectionTestUtils.setField(controller, "maintenanceAuthorization", authorization);
        ReflectionTestUtils.setField(controller, "fhirTransformService", fhir);
        ReflectionTestUtils.setField(controller, "photoService", photos);
        ReflectionTestUtils.setField(controller, "idDocumentService", documents);
        documentMaintenance = mock(PatientDocumentMaintenanceService.class);
        ReflectionTestUtils.setField(controller, "documentMaintenance", documentMaintenance);
        request = new MockHttpServletRequest();
        var actor = new UserSessionData();
        actor.setSytemUserId(7);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, actor);
        var validator = new LocalValidatorFactoryBean();
        validator.setMessageInterpolator(new ParameterMessageInterpolator());
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(controller).setValidator(validator).build();
    }

    private PatientManagementInfo info(String patientId) {
        var info = new PatientManagementInfo();
        info.setPatientPK(patientId);
        info.setGender("F");
        return info;
    }

    private void saved(PatientManagementInfo info, String patientId) {
        var patient = new Patient();
        patient.setId(patientId);
        when(maintenance.persistPatientData(eq(info), eq("7"), eq(request))).thenReturn(patient);
    }

    @Test
    public void updatePermissionIsRequiredBeforeAnyPatientValidationOrWrite() throws Exception {
        var info = info("42");
        doThrow(new AccessDeniedException("private grant detail")).when(authorization).requireEdit(request, "7");
        assertThrows(AccessDeniedException.class,
                () -> controller.savepatient(request, info, new BeanPropertyBindingResult(info, "patient")));
        verifyZeroInteractions(maintenance, fhir, photos, documents);
        assertEquals(403,
                controller.patientPermissionDenied(new AccessDeniedException("private")).getStatusCodeValue());
    }

    @Test
    public void createRequiresAddGrantAndReturnsConfirmedPatientIdentity() throws Exception {
        var info = info(null);
        saved(info, "43");
        var response = controller.savepatient(request, info, new BeanPropertyBindingResult(info, "patient"));
        assertEquals(200, response.getStatusCodeValue());
        assertEquals("success", response.getBody().get("status"));
        assertEquals("43", response.getBody().get("patientId"));
        verify(authorization).requireCreate(request, "7");
        verify(authorization, never()).requireEdit(any(), any());
        verify(fhir).transformPersistPatient(info, true);
    }

    @Test
    public void updateRequiresEditAndKeepsPhotoAndNewDocumentServiceBehavior() throws Exception {
        var info = info("42");
        info.setPhotoData("data:image/png;base64,abc");
        saved(info, "42");
        assertEquals("42", controller.savepatient(request, info, new BeanPropertyBindingResult(info, "patient"))
                .getBody().get("patientId"));
        verify(authorization).requireEdit(request, "7");
        verify(authorization, never()).requireCreate(any(), any());
        verify(fhir).transformPersistPatient(info, false);
        verify(photos).savePhoto("42", info.getPhoto(), "7");
    }

    @Test
    public void bindingFailureReturns400WithoutPersistingOrClearingDraftContract() throws Exception {
        var info = info("42");
        var errors = new BeanPropertyBindingResult(info, "patient");
        errors.rejectValue("gender", "invalid");
        assertEquals(400, controller.savepatient(request, info, errors).getStatusCodeValue());
        verifyZeroInteractions(maintenance, fhir, photos, documents);
    }

    @Test
    public void coreConflictStopsAllPostCoreSideEffectsAndReturnsStable409() throws Exception {
        var info = info("42");
        when(maintenance.persistPatientData(info, "7", request))
                .thenThrow(new PatientMaintenanceConflictException("private contact ID"));
        var response = controller.savepatient(request, info, new BeanPropertyBindingResult(info, "patient"));
        assertEquals(409, response.getStatusCodeValue());
        assertEquals("PATIENT_MANAGEMENT_CONFLICT", response.getBody().get("code"));
        assertFalse(response.getBody().toString().contains("private"));
        verifyZeroInteractions(fhir, photos, documents);
    }

    @Test
    public void lateFhirFailureDoesNotClaimSaveSuccessOrUndoAlreadyReturnedCore() throws Exception {
        var info = info("42");
        saved(info, "42");
        doThrow(new IllegalArgumentException("private downstream detail")).when(fhir).transformPersistPatient(info,
                false);
        var response = controller.savepatient(request, info, new BeanPropertyBindingResult(info, "patient"));
        assertEquals(500, response.getStatusCodeValue());
        assertFalse(response.getBody().containsKey("patientId"));
        verify(maintenance).persistPatientData(info, "7", request);
        verifyZeroInteractions(photos, documents);
    }

    @Test
    public void latePhotoOptimisticConflictRemainsUnknown500AfterCoreCommit() throws Exception {
        var info = info("42");
        saved(info, "42");
        when(photos.savePhoto("42", info.getPhoto(), "7"))
                .thenThrow(new OptimisticLockException("private photo version"));
        var response = controller.savepatient(request, info, new BeanPropertyBindingResult(info, "patient"));
        assertEquals(500, response.getStatusCodeValue());
        assertFalse(response.getBody().containsKey("patientId"));
        verify(maintenance).persistPatientData(info, "7", request);
        verifyZeroInteractions(documents);
    }

    @Test
    public void missingPatientReturns404AndOptimisticFailureReturns409() throws Exception {
        var info = info("42");
        when(maintenance.persistPatientData(info, "7", request))
                .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        assertEquals(404, controller.savepatient(request, info, new BeanPropertyBindingResult(info, "patient"))
                .getStatusCodeValue());
        doThrow(new OptimisticLockException("private stale timestamp")).when(maintenance).persistPatientData(info, "7",
                request);
        assertEquals(409, controller.savepatient(request, info, new BeanPropertyBindingResult(info, "patient"))
                .getStatusCodeValue());
    }

    @Test public void capabilityResponseUsesCurrentServiceFlagsWithoutChangingReadAccess() {
        when(authorization.canCreate(request,"7")).thenReturn(true);
        when(authorization.canEdit(request,"7")).thenReturn(false);
        assertEquals(Map.of("canCreate",true,"canEdit",false),controller.maintenanceCapabilities(request));
    }

    @Test
    public void actualMvcRejectsPermissionAndMalformedBodiesBeforeCoreWrites() throws Exception {
        doThrow(new AccessDeniedException("private")).when(authorization).requireEdit(any(), eq("7"));
        mvc.perform(post("/rest/PatientManagement").session((MockHttpSession) request.getSession())
                .contentType(MediaType.APPLICATION_JSON).content("{\"patientPK\":\"42\",\"gender\":\"F\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PATIENT_MANAGEMENT_FORBIDDEN"));
        for (String body : new String[] { "{bad", "null", "" }) {
            mvc.perform(post("/rest/PatientManagement").session((MockHttpSession) request.getSession())
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("PATIENT_MANAGEMENT_INVALID_REQUEST"));
        }
        verifyZeroInteractions(maintenance, fhir, photos, documents);
    }

    @Test public void actualMvcRoutesConflictAndValidWritesWithRealBeanValidation() throws Exception {
        when(maintenance.persistPatientData(any(),eq("7"),any())).thenThrow(new PatientMaintenanceConflictException("private"));
        mvc.perform(post("/rest/PatientManagement").session((MockHttpSession)request.getSession())
                .contentType(MediaType.APPLICATION_JSON).content("{\"patientPK\":\"42\",\"gender\":\"F\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PATIENT_MANAGEMENT_CONFLICT"));
        var patient=new Patient(); patient.setId("42");
        when(maintenance.persistPatientData(any(),eq("7"),any())).thenReturn(patient);
        mvc.perform(post("/rest/PatientManagement").session((MockHttpSession)request.getSession())
                .contentType(MediaType.APPLICATION_JSON).content("{\"patientPK\":\"42\",\"gender\":\"F\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.patientId").value("42"));
    }

    @Test
    public void duplicateValidationPreservesOriginalStableConflictKey() throws Exception {
        var info = info("42");
        when(maintenance.persistPatientData(info, "7", request)).thenThrow(
                new PatientMaintenanceValidationException("DUPLICATE_PATIENT", "error.duplicate.nationalId"));
        var response = controller.savepatient(request, info, new BeanPropertyBindingResult(info, "patient"));
        assertEquals(409, response.getStatusCodeValue());
        assertEquals("DUPLICATE_PATIENT", response.getBody().get("code"));
        assertEquals("error.duplicate.nationalId", response.getBody().get("errorKey"));
        verifyZeroInteractions(fhir, photos, documents);
    }

    @Test
    public void immediateDocumentMvcMutationsDelegateExplicitPatientAndVersionScope() throws Exception {
        mvc.perform(put("/rest/patient-id-documents/9").session((MockHttpSession) request.getSession())
                .param("patientId", "42").param("version", "2026-10-05 10:20:30.123456")
                .contentType(MediaType.APPLICATION_JSON).content("{\"category\":\"OTHER\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));
        verify(documentMaintenance).update(any(), eq("7"), eq(9), eq("42"), eq("2026-10-05 10:20:30.123456"), any());
        mvc.perform(delete("/rest/patient-id-documents/9").session((MockHttpSession) request.getSession())
                .param("patientId", "42").param("version", "2026-10-05 10:20:30.123456")).andExpect(status().isOk());
        verify(documentMaintenance).delete(any(), eq("7"), eq(9), eq("42"), eq("2026-10-05 10:20:30.123456"));
    }

    @Test
    public void nestedDaoOptimisticConflictUsesStable409ForCoreAndImmediateDocumentWrites() throws Exception {
        var failure = new org.openelisglobal.common.exception.LIMSRuntimeException("private DAO message",
                new org.hibernate.StaleObjectStateException("PatientIdDocument", 9));
        doThrow(failure).when(documentMaintenance).delete(any(), eq("7"), eq(9), any(), any());
        mvc.perform(delete("/rest/patient-id-documents/9").session((MockHttpSession) request.getSession()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PATIENT_MANAGEMENT_CONFLICT"));
        var info = info("42");
        doThrow(failure).when(maintenance).persistPatientData(info, "7", request);
        assertEquals(409, controller.savepatient(request, info, new BeanPropertyBindingResult(info, "patient"))
                .getStatusCodeValue());
        verifyZeroInteractions(fhir, photos, documents);
    }

    @Test
    public void immediateDocumentMvcRejectionIsStableAndNeverUsesUnguardedLegacyWrites() throws Exception {
        doThrow(new AccessDeniedException("private")).when(documentMaintenance).update(any(), eq("7"), eq(9), any(),
                any(), any());
        mvc.perform(put("/rest/patient-id-documents/9").session((MockHttpSession) request.getSession())
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PATIENT_MANAGEMENT_FORBIDDEN"));
        doThrow(new PatientMaintenanceConflictException("private")).when(documentMaintenance).delete(any(), eq("7"),
                eq(9), any(), any());
        mvc.perform(delete("/rest/patient-id-documents/9").session((MockHttpSession) request.getSession()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PATIENT_MANAGEMENT_CONFLICT"));
        verifyZeroInteractions(documents);
    }
}

package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.lang.reflect.InvocationTargetException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.common.validator.BaseErrors;
import org.openelisglobal.labelpreset.dto.OrderLabelPersistRequest;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.userrole.service.UserRoleService;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.patient.action.IPatientUpdate.PatientUpdateStatus;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.sample.action.util.SamplePatientUpdateData;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampletyperequest.dto.SampleTypeRequestDTO;
import org.openelisglobal.sampletyperequest.service.SampleTypeRequestService;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.BindException;
import org.springframework.validation.BindingResult;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Actual entry service and annotated Spring proxy, with SIM memory resources only.
 */
public class SamplePatientEntryTransactionTest {
    private Object oldFactory;
    private Object oldFields;
    private SamplePatientEntryServiceImpl target;
    private SamplePatientEntryService service;
    private SamplePatientUpdateData data;
    private PatientManagementUpdate patientUpdate;
    private SamplePatientEntryForm form;
    private BindingResult errors;
    private MockHttpServletRequest request;
    private MemoryTransactionManager manager;
    private OrderLabelPersistRequest labels;
    private AutowireCapableBeanFactory factory;
    private ApplicationEventPublisher events;
    private SampleService samples;
    private SampleTypeRequestService specimenRequests;
    private Sample savedSample;
    private EntrySubmissionService submissionService;
    private org.openelisglobal.sample.dao.EntrySubmissionReceiptDAO submissionReceipts;
    private EntrySubmissionCommand submissionCommand;

    @Before
    public void setUp() throws Exception {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        oldFields = ReflectionTestUtils.getField(FormFields.class, "instance");
        factory = mock(AutowireCapableBeanFactory.class);
        when(factory.getBean(DefaultConfigurationProperties.class))
                .thenReturn(mock(DefaultConfigurationProperties.class));
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
        patientUpdate = mock(PatientManagementUpdate.class);
        when(factory.getBean(PatientManagementUpdate.class)).thenReturn(patientUpdate);
        when(patientUpdate.getPatientUpdateStatus()).thenReturn(PatientUpdateStatus.NO_ACTION);
        form = simForm();
        labels = new OrderLabelPersistRequest();
        form.setLabelPersistRequest(labels);
        errors = new BeanPropertyBindingResult(form, "form");
        request = new MockHttpServletRequest();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        UserSessionData user = mock(UserSessionData.class);
        when(user.getSystemUserId()).thenReturn(7);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, user);
        request.getSession().setAttribute("lastAccessionNumber", "SIM-PRIOR");
        manager = new MemoryTransactionManager();
        data = mock(SamplePatientUpdateData.class);
        AtomicBoolean savePatient = new AtomicBoolean();
        doAnswer(call -> {
            savePatient.set(call.getArgument(0));
            return null;
        }).when(data).setSavePatient(anyBoolean());
        when(data.isSavePatient()).thenAnswer(call -> savePatient.get());
        when(data.getAccessionNumber()).thenReturn("SIM-ENTRY");
        when(data.getPatientId()).thenReturn("501");
        when(patientUpdate.getPatientId(form)).thenReturn("501");
        target = spy(new SamplePatientEntryServiceImpl());
        doAnswer(call -> {
            assertTrue("transaction must precede mutable initialization",
                    TransactionSynchronizationManager.isActualTransactionActive());
            return data;
        }).when(target).createEntryUpdateData("7");
        doAnswer(call -> {
            manager.write("SIM-initialized");
            return null;
        }).when(data)
                .initSampleData(eq(""), eq("13/09/2026 00:00"), eq(false), same(form.getSampleOrderItems()));
        events = mock(ApplicationEventPublisher.class);
        // Any event instance is allowed here; the real persistData method constructs it.
        doAnswer(call -> {
            manager.write("SIM-order");
            return null;
        }).when(events).publishEvent(any(ApplicationEvent.class));
        ReflectionTestUtils.setField(target, "eventPublisher", events);
        doAnswer(call -> {
            manager.write("SIM-label");
            return List.of();
        }).when(target)
                .persistLabelRequests(data, labels, "7");
        ProxyFactory proxy = new ProxyFactory(target);
        proxy.setInterfaces(SamplePatientEntryService.class);
        proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        service = (SamplePatientEntryService) proxy.getProxy();
    }

    @After
    public void tearDown() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldFields);
        TransactionSynchronizationManager.clear();
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    public void testExplicitBatch_SessionWithoutAuthenticatedPrincipalCannotWrite() throws Exception {
        prepareSpecimens();
        SecurityContextHolder.clearContext();
        assertThrows(AccessDeniedException.class, this::save);
        verify(target, never()).createEntryUpdateData("7");
        assertRolledBack();
    }

    @Test
    public void testExplicitBatch_AuthenticatedUserCannotUseAnotherUsersSession() throws Exception {
        prepareSpecimens();
        authenticate("SIM-other-operator");
        assertThrows(AccessDeniedException.class, this::save);
        verify(target, never()).createEntryUpdateData("7");
        assertRolledBack();
    }

    @Test
    public void testExplicitBatch_PrincipalChangedDuringSaveRollsBackEverything() throws Exception {
        prepareSpecimens();
        doAnswer(call -> {
            manager.write("SIM-label");
            authenticate("SIM-other-operator");
            return List.of();
        }).when(target).persistLabelRequests(data, labels, "7");
        assertThrows(AccessDeniedException.class, this::save);
        assertRolledBack();
        assertNull(form.getRequestedSpecimens().get(0).getId());
    }

    private static void authenticate(String login) {
        var principal = User.withUsername(login).password("SIM-not-a-real-password").roles("RECEPTION").build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    @Test
    public void testExplicitBatch_OtherSecuritySessionCannotSupplyTestPermissions() throws Exception {
        prepareSpecimens();
        var other = User.withUsername("SIM-other-operator").password("SIM-unused").roles("RECEPTION").build();
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT",
                new org.springframework.security.core.context.SecurityContextImpl(
                        new UsernamePasswordAuthenticationToken(other, null, other.getAuthorities())));
        assertThrows(AccessDeniedException.class, this::save);
        verify(target, never()).createEntryUpdateData("7");
        assertRolledBack();
    }

    @Test
    public void testExplicitBatch_OuterTransactionIdentityChangeAfterReturnRollsBack() throws Exception {
        prepareSpecimens();
        var outer = new TransactionTemplate(manager);
        assertThrows(AccessDeniedException.class, () -> outer.execute(status -> {
            try {
                save();
            } catch (Exception failure) {
                throw new AssertionError(failure);
            }
            authenticate("SIM-other-operator");
            return null;
        }));
        verify(specimenRequests).createRequestsForEntry(same(savedSample), anyList(), eq("7"), same(errors));
        assertRolledBack();
    }

    @Test
    public void testExplicitBatch_OeIdentityChangedDuringSaveRollsBack() throws Exception {
        prepareSpecimens();
        doAnswer(call -> {
            manager.write("SIM-label");
            var changed = new UserSessionData();
            changed.setSytemUserId(8);
            request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, changed);
            return List.of();
        }).when(target).persistLabelRequests(data, labels, "7");
        assertThrows(AccessDeniedException.class, this::save);
        assertRolledBack();
        assertNull(form.getRequestedSpecimens().get(0).getId());
    }

    @Test
    public void testExplicitBatch_PermissionRequestChangedDuringSaveRollsBack() throws Exception {
        prepareSpecimens();
        doAnswer(call -> {
            manager.write("SIM-label");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
            return List.of();
        }).when(target).persistLabelRequests(data, labels, "7");
        assertThrows(AccessDeniedException.class, this::save);
        assertRolledBack();
        assertNull(form.getRequestedSpecimens().get(0).getId());
    }

    @Test
    public void testExplicitBatch_OuterTransactionPermissionRequestChangeRollsBack() throws Exception {
        prepareSpecimens();
        var outer = new TransactionTemplate(manager);
        assertThrows(AccessDeniedException.class, () -> outer.execute(status -> {
            try {
                save();
            } catch (Exception failure) {
                throw new AssertionError(failure);
            }
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
            return null;
        }));
        verify(specimenRequests).createRequestsForEntry(same(savedSample), anyList(), eq("7"), same(errors));
        assertRolledBack();
    }

    @Test
    public void testSaveEntry_CommitsInitializationOrderAndLabelsTogether() throws Exception {
        save();
        assertEquals(List.of("SIM-initialized", "SIM-order", "SIM-label"), manager.committed);
        assertEquals(1, manager.commits);
        assertEquals("SIM-ENTRY", request.getSession().getAttribute("lastAccessionNumber"));
        verify(data).validateSample(errors, false);
    }

    @Test
    public void testSaveEntry_LabelFailureRollsBackOrderAndRecentContext() {
        doAnswer(call -> {
            manager.write("SIM-label");
            throw new IllegalStateException("SIM label failure");
        }).when(target).persistLabelRequests(data, labels, "7");
        assertThrows(IllegalStateException.class, this::save);
        assertRolledBack();
    }

    @Test
    public void testSaveEntry_LateValidationRollsBackInitializedEntities() {
        doAnswer(call -> {
            errors.reject("SIM-invalid-order");
            return null;
        }).when(data).validateSample(errors, false);
        assertThrows(BindException.class, this::save);
        assertRolledBack();
        verify(target, never()).persistData(data, patientUpdate, form.getPatientProperties(), form, request);
        verify(target, never()).persistLabelRequests(data, labels, "7");
    }

    @Test
    public void testSaveEntry_CheckedPreparationFailureRollsBack() throws Exception {
        when(patientUpdate.getPatientUpdateStatus()).thenReturn(PatientUpdateStatus.ADD);
        when(patientUpdate.preparePatientData(request, form.getPatientProperties())).thenAnswer(call -> {
            manager.write("SIM-patient-initialized");
            throw new InvocationTargetException(new IllegalStateException("SIM prepare failure"));
        });
        assertThrows(InvocationTargetException.class, this::save);
        assertRolledBack();
    }

    @Test
    public void testSaveEntry_NewPatientIsPreparedAndSavedInSameTransaction() throws Exception {
        when(patientUpdate.getPatientUpdateStatus()).thenReturn(PatientUpdateStatus.ADD);
        when(patientUpdate.preparePatientData(request, form.getPatientProperties())).thenAnswer(call -> {
            manager.write("SIM-patient-initialized");
            return new BaseErrors();
        });
        doAnswer(call -> {
            manager.write("SIM-patient");
            return null;
        }).when(patientUpdate)
                .persistPatientData(form.getPatientProperties());
        save();
        assertEquals(List.of("SIM-patient-initialized", "SIM-initialized", "SIM-patient", "SIM-order", "SIM-label"),
                manager.committed);
        assertEquals(1, manager.commits);
    }

    @Test
    public void testSaveEntry_EqaReusesConfiguredPatient() throws Exception {
        var patients = mock(org.openelisglobal.patient.service.PatientService.class);
        var patient = mock(org.openelisglobal.patient.valueholder.Patient.class);
        when(factory.getBean(org.openelisglobal.patient.service.PatientService.class)).thenReturn(patients);
        when(patients.getPatientByNationalId("NULL")).thenReturn(patient);
        when(patient.getId()).thenReturn("502");
        form.getSampleOrderItems().setIsEQASample(true);
        form.getSampleOrderItems().setEqaProgramId("41");
        form.getSampleOrderItems().setEqaProviderSampleId("SIM-EQA");
        save();
        assertEquals("502", form.getPatientProperties().getPatientPK());
        assertEquals(PatientUpdateStatus.NO_ACTION, form.getPatientProperties().getPatientUpdateStatus());
        verify(data).setEqaSample(true);
        verify(data).setEqaProgramId("41");
        verify(data).setEqaProviderSampleId("SIM-EQA");
        verify(patientUpdate, never()).preparePatientData(request, form.getPatientProperties());
    }

    @Test
    public void testSaveEntry_MissingLabelPayloadDoesNotCallLabels() throws Exception {
        form.setLabelPersistRequest(null);
        save();
        assertEquals(List.of("SIM-initialized", "SIM-order"), manager.committed);
        verify(target, never()).persistLabelRequests(data, labels, "7");
    }

    @Test
    public void testSaveEntry_PhysicalCollectionStillRequiresSampleItems() throws Exception {
        form.setOrderEntryOnly(false);
        save();
        verify(data).validateSample(errors, true);
    }

    @Test
    public void testSaveEntry_ProgramInitializationPrecedesSave() throws Exception {
        form.getSampleOrderItems().setProgramId("41");
        save();
        var sequence = inOrder(data, target);
        sequence.verify(data).initSampleData("", "13/09/2026 00:00", false, form.getSampleOrderItems());
        sequence.verify(data).initProgramQuestions("41", form.getSampleOrderItems().getAdditionalQuestions());
        sequence.verify(target).persistData(data, patientUpdate, form.getPatientProperties(), form, request);
    }

    @Test
    public void testSaveEntry_EnvironmentalOrderNeverPreparesPatient() throws Exception {
        form.getSampleOrderItems().setEnvironmentalFields(java.util.Map.of("workflowType", "environmental"));
        form.setPatientProperties(null);
        errors.rejectValue("patientProperties", "SIM-patient-not-required");
        save();
        verify(patientUpdate, never()).setPatientUpdateStatus(null);
        verify(data).setSavePatient(false);
        assertEquals(1, manager.commits);
    }

    @Test
    public void testSaveEntry_EnvironmentalGlobalErrorIsNotIgnored() {
        form.getSampleOrderItems().setEnvironmentalFields(java.util.Map.of("workflowType", "environmental"));
        errors.reject("SIM-invalid-request");
        assertThrows(BindException.class, this::save);
        verify(target, never()).createEntryUpdateData("7");
        assertRolledBack();
    }

    @Test
    public void testSaveEntry_PrototypePatientStateIsAcquiredPerCall() throws Exception {
        PatientManagementUpdate nextPatient = mock(PatientManagementUpdate.class);
        when(nextPatient.getPatientUpdateStatus()).thenReturn(PatientUpdateStatus.NO_ACTION);
        when(factory.getBean(PatientManagementUpdate.class)).thenReturn(patientUpdate, nextPatient);
        save();
        save();
        verify(factory, times(2)).getBean(PatientManagementUpdate.class);
        verify(patientUpdate).setPatientUpdateStatus(form.getPatientProperties());
        verify(nextPatient).setPatientUpdateStatus(form.getPatientProperties());
        assertEquals(2, manager.commits);
    }

    @Test
    public void testSaveEntry_OuterFailureRollsBackLabelsAndOrder() {
        assertThrows(IllegalStateException.class, () -> new TransactionTemplate(manager).execute(status -> {
            try {
                save();
            } catch (Exception error) {
                throw new AssertionError(error);
            }
            assertEquals("SIM-PRIOR", request.getSession().getAttribute("lastAccessionNumber"));
            throw new IllegalStateException("SIM outer failure");
        }));
        assertRolledBack();
    }

    @Test
    public void testSaveEntry_ListenerFailurePreventsLabelsAndCommit() {
        doAnswer(call -> {
            throw new IllegalStateException("SIM listener failure");
        }).when(events).publishEvent(any(ApplicationEvent.class));
        assertThrows(IllegalStateException.class, this::save);
        assertRolledBack();
        verify(target, never()).persistLabelRequests(data, labels, "7");
    }

    @Test
    public void testSaveEntry_CommitFailurePropagatesWithoutPublishingSession() {
        manager.failCommit = true;
        assertThrows(TransactionSystemException.class, this::save);
        assertEquals("SIM-PRIOR", request.getSession().getAttribute("lastAccessionNumber"));
        // A real connection loss during commit is unknown, not proof of database rollback.
        assertEquals(0, manager.commits);
    }

    @Test
    public void testSaveEntry_ExplicitSpecimensShareOrderAndLabelTransaction() throws Exception {
        prepareSpecimens();
        save();
        assertEquals(List.of("SIM-initialized", "SIM-order-record", "SIM-order", "SIM-tube-1", "SIM-tube-2",
                "SIM-label"), manager.committed);
        assertEquals(1, manager.commits);
        assertEquals("301", form.getSampleOrderItems().getSampleId());
        assertEquals("701", form.getRequestedSpecimens().get(0).getId());
        assertEquals("702", form.getRequestedSpecimens().get(1).getId());
    }

    @Test
    public void testSaveEntry_SecondSpecimenFailureRollsBackOrderAndPatient() throws Exception {
        prepareSpecimens();
        when(patientUpdate.getPatientUpdateStatus()).thenReturn(PatientUpdateStatus.ADD);
        when(patientUpdate.preparePatientData(request, form.getPatientProperties())).thenReturn(new BaseErrors());
        doAnswer(call -> {
            manager.write("SIM-patient");
            return null;
        }).when(patientUpdate).persistPatientData(form.getPatientProperties());
        when(specimenRequests.createRequestsForEntry(same(savedSample), anyList(), eq("7"), same(errors)))
                .thenAnswer(call -> {
                    manager.write("SIM-tube-1");
                    throw new IllegalStateException("SIM tube failure");
                });
        assertThrows(IllegalStateException.class, this::save);
        assertRolledBack();
        verify(patientUpdate).persistPatientData(form.getPatientProperties());
        verify(target, never()).persistLabelRequests(data, labels, "7");
        assertNull(form.getRequestedSpecimens().get(0).getId());
    }

    @Test
    public void testSaveEntry_SpecimenValidationRollsBackOrder() throws Exception {
        prepareSpecimens();
        when(specimenRequests.createRequestsForEntry(same(savedSample), anyList(), eq("7"), same(errors)))
                .thenAnswer(call -> {
                    errors.rejectValue("requestedSpecimens", "SIM-invalid-tube");
                    throw new BindException(errors);
                });
        assertThrows(BindException.class, this::save);
        assertRolledBack();
    }

    @Test
    public void testSaveEntry_LabelFailureAlsoRollsBackSpecimens() throws Exception {
        prepareSpecimens();
        doThrow(new IllegalStateException("SIM label failure")).when(target).persistLabelRequests(data, labels, "7");
        assertThrows(IllegalStateException.class, this::save);
        verify(specimenRequests).createRequestsForEntry(same(savedSample), anyList(), eq("7"), same(errors));
        assertRolledBack();
        assertNull(form.getRequestedSpecimens().get(0).getId());
    }

    @Test
    public void testSaveEntry_ExplicitBatchCannotEditExistingIdentity() throws Exception {
        prepareSpecimens();
        form.getSampleOrderItems().setSampleId("301");
        assertBatchRejectedBeforeInitialization();
    }

    @Test
    public void testSaveEntry_ExplicitBatchCannotReuseExistingAccession() throws Exception {
        prepareSpecimens();
        var existing = new Sample();
        existing.setId("999");
        when(samples.getSampleByAccessionNumber("SIM-ENTRY")).thenReturn(existing);
        assertBatchRejectedBeforeInitialization();
    }

    @Test
    public void testSaveEntry_ExplicitBatchCannotUseModifiedFlag() throws Exception {
        prepareSpecimens();
        form.getSampleOrderItems().setModified(true);
        assertBatchRejectedBeforeInitialization();
    }

    @Test
    public void testSaveEntry_ExplicitBatchCannotMixPhysicalSampleXml() throws Exception {
        prepareSpecimens();
        form.setSampleXML("<SIM-physical-sample/>");
        assertBatchRejectedBeforeInitialization();
    }

    @Test
    public void testSaveEntry_ExplicitBatchRequiresEntryMode() throws Exception {
        prepareSpecimens();
        form.setOrderEntryOnly(false);
        assertBatchRejectedBeforeInitialization();
    }

    @Test
    public void testSaveEntry_EmptyExplicitBatchIsRejectedBeforeInitialization() throws Exception {
        prepareSpecimens();
        form.setRequestedSpecimens(List.of());
        assertBatchRejectedBeforeInitialization();
    }

    @Test
    public void testSaveEntry_CollectionFlagCannotEnterNewBatchService() throws Exception {
        prepareSpecimens();
        form.setCollectionOnly(true);
        assertBatchRejectedBeforeInitialization();
    }

    @Test
    public void testSaveEntry_ExplicitBatchRejectsPerTubeLabelRequests() throws Exception {
        prepareSpecimens();
        var row = new OrderLabelPersistRequest.PersistSampleRow("SIM-1");
        row.setCells(List.of(new OrderLabelPersistRequest.PersistCell(1, 2)));
        labels.setSampleRows(List.of(row));
        assertBatchRejectedBeforeInitialization();
    }

    @Test
    public void testSaveEntry_ExplicitBatchCanKeepOrderLabelsAndEmptyTubeCells() throws Exception {
        prepareSpecimens();
        labels.setOrderCells(List.of(new OrderLabelPersistRequest.PersistCell(1, 2)));
        var row = new OrderLabelPersistRequest.PersistSampleRow("SIM-1");
        row.setCells(List.of(new OrderLabelPersistRequest.PersistCell(1, 0)));
        labels.setSampleRows(List.of(row));
        save();
        verify(target).persistLabelRequests(data, labels, "7");
        assertEquals(1, manager.commits);
    }

    @Test
    public void receiptAndRealEntryUseOneTransaction() throws Exception {
        prepareSubmission();
        var result = submitEntry();
        assertEquals("301", result.receipt().path("sampleId").asText());
        assertEquals(1, manager.commits);
        assertEquals(List.of("SIM-receipt-claim", "SIM-initialized", "SIM-order-record", "SIM-order",
                "SIM-tube-1", "SIM-tube-2", "SIM-label", "SIM-receipt-complete"), manager.committed);
        assertEquals("SIM-ENTRY", request.getSession().getAttribute("lastAccessionNumber"));
    }

    @Test
    public void receiptCompletionFailureRollsBackActualEntryAndTubes() throws Exception {
        prepareSubmission();
        doThrow(new IllegalStateException("SIM receipt flush failure")).when(submissionReceipts).complete(any(), any());
        assertThrows(IllegalStateException.class, this::submitEntry);
        verify(target).persistLabelRequests(data, labels, "7");
        assertRolledBack();
    }

    @Test
    public void missingActualTubeReadbackRollsBackEntryAndClaim() throws Exception {
        prepareSubmission();
        when(specimenRequests.getRequestsBySampleId("301")).thenReturn(List.of());
        assertThrows(org.openelisglobal.sample.exception.EntrySubmissionException.class, this::submitEntry);
        verify(submissionReceipts, never()).complete(any(), any()); assertRolledBack();
    }

    @Test
    public void claimConflictCannotInitializeActualEntry() throws Exception {
        prepareSubmission();
        doThrow(new IllegalStateException("SIM unique conflict")).when(submissionReceipts).claim(any());
        assertThrows(IllegalStateException.class, this::submitEntry);
        verify(target, never()).createEntryUpdateData(anyString()); assertRolledBack();
    }

    @Test
    public void actualLabelFailureAlsoRollsBackClaim() throws Exception {
        prepareSubmission();
        doThrow(new IllegalStateException("SIM label failure")).when(target).persistLabelRequests(data, labels, "7");
        assertThrows(IllegalStateException.class, this::submitEntry);
        verify(submissionReceipts, never()).complete(any(), any()); assertRolledBack();
    }

    @Test
    public void actorChangesAfterReceiptReturnAbortOuterCommit() throws Exception {
        prepareSubmission();
        assertThrows(AccessDeniedException.class, () -> new TransactionTemplate(manager).execute(status -> {
            try { submitEntry(); } catch (Exception error) { throw new AssertionError(error); }
            authenticate("SIM-other-operator"); return null;
        }));
        assertRolledBack();
    }

    private EntrySubmissionService.Result submitEntry() throws Exception {
        return submissionService.submit(submissionCommand, form, request, errors);
    }

    private void prepareSubmission() throws Exception {
        prepareSpecimens();
        form.getPatientProperties().setPatientPK("501");
        form.getPatientProperties().setPatientUpdateStatus(PatientUpdateStatus.NO_ACTION);
        var patient = new org.openelisglobal.patient.valueholder.Patient(); patient.setId("501");
        when(samples.get("301")).thenReturn(savedSample); when(samples.getPatient(savedSample)).thenReturn(patient);
        var rows = new ArrayList<org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest>();
        for (int index = 0; index < 2; index++) {
            var row = new org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest();
            row.setId(701 + index); row.setSortOrder(index); row.setSample(savedSample);
            var type = new org.openelisglobal.typeofsample.valueholder.TypeOfSample(); type.setId("31");
            row.setTypeOfSample(type); row.setRequestedTests("41"); rows.add(row);
        }
        when(specimenRequests.getRequestsBySampleId("301")).thenReturn(rows);
        when(specimenRequests.createRequestsForEntry(same(savedSample), anyList(), eq("7"), same(errors)))
                .thenAnswer(call -> {
                    manager.write("SIM-tube-1"); manager.write("SIM-tube-2");
                    List<SampleTypeRequestDTO> result = new ArrayList<>();
                    for (var row : rows) {
                        var dto = new SampleTypeRequestDTO(); dto.setId(row.getId().toString());
                        dto.setSampleId("301"); dto.setTypeOfSampleId("31"); dto.setSortOrder(row.getSortOrder());
                        dto.setRequestedQuantity(1.0); dto.setRequestedTests("41"); dto.setStatus("REQUESTED");
                        result.add(dto);
                    }
                    return result;
                });
        var coordinator = new EntrySubmissionService();
        submissionReceipts = mock(org.openelisglobal.sample.dao.EntrySubmissionReceiptDAO.class);
        doAnswer(call -> { manager.write("SIM-receipt-claim"); return null; }).when(submissionReceipts).claim(any());
        doAnswer(call -> {
            manager.write("SIM-receipt-complete");
            ((org.openelisglobal.sample.valueholder.EntrySubmissionReceipt) call.getArgument(0)).complete(call.getArgument(1));
            return null;
        }).when(submissionReceipts).complete(any(), any());
        ReflectionTestUtils.setField(coordinator, "receipts", submissionReceipts);
        ReflectionTestUtils.setField(coordinator, "actors", ReflectionTestUtils.getField(target, "orderEntryActorGuard"));
        ReflectionTestUtils.setField(coordinator, "entries", service);
        ReflectionTestUtils.setField(coordinator, "samples", samples);
        ReflectionTestUtils.setField(coordinator, "specimenRequests", specimenRequests);
        ReflectionTestUtils.setField(coordinator, "validator", mock(org.openelisglobal.sample.validator.SamplePatientEntryFormValidator.class));
        var labelDao = mock(org.openelisglobal.labelpreset.dao.OrderLabelRequestDAO.class);
        when(labelDao.listByParentSampleId("301")).thenReturn(List.of());
        ReflectionTestUtils.setField(coordinator, "labels", labelDao);
        var proxy = new ProxyFactory(coordinator);
        proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        submissionService = (EntrySubmissionService) proxy.getProxy();
        String key = "f3cdcd87-a1ef-4e67-b297-b26af08a36fc";
        request.addHeader(EntrySubmissionCommand.HEADER, key);
        submissionCommand = new EntrySubmissionCommand(key, EntrySubmissionCommand.fingerprint(new byte[] {1, 2}), form);
        request.setAttribute(EntrySubmissionCommand.ATTRIBUTE, submissionCommand);
    }

    private void assertBatchRejectedBeforeInitialization() {
        assertThrows(BindException.class, this::save);
        verify(target, never()).createEntryUpdateData("7");
        assertRolledBack();
    }

    private void prepareSpecimens() throws Exception {
        authenticate("SIM-entry-operator");
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", SecurityContextHolder.getContext());
        OrderEntryActorGuard actorGuard = new OrderEntryActorGuard();
        var users = mock(SystemUserService.class);
        var logins = mock(LoginUserService.class);
        var roles = mock(UserRoleService.class);
        var current = new SystemUser();
        current.setId("7");
        current.setLoginName("SIM-entry-operator");
        current.setIsActive("Y");
        var account = new LoginUser();
        account.setLoginName("SIM-entry-operator");
        account.setSystemUserId(7);
        account.setAccountDisabled("N");
        account.setAccountLocked("N");
        account.setPasswordExpiredDayNo(1);
        when(users.getMatch("loginName", "SIM-entry-operator")).thenReturn(Optional.of(current));
        when(logins.getMatch("loginName", "SIM-entry-operator")).thenReturn(Optional.of(account));
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(true);
        ReflectionTestUtils.setField(actorGuard, "systemUserService", users);
        ReflectionTestUtils.setField(actorGuard, "loginUserService", logins);
        ReflectionTestUtils.setField(actorGuard, "userRoleService", roles);
        ReflectionTestUtils.setField(target, "orderEntryActorGuard", actorGuard);
        var first = new SampleTypeRequestDTO();
        first.setTypeOfSampleId("31");
        first.setRequestedQuantity(1.0);
        first.setRequestedTests("41");
        var second = new SampleTypeRequestDTO();
        second.setTypeOfSampleId("31");
        second.setRequestedQuantity(1.0);
        second.setRequestedTests("41");
        form.setRequestedSpecimens(List.of(first, second));
        samples = mock(SampleService.class);
        specimenRequests = mock(SampleTypeRequestService.class);
        ReflectionTestUtils.setField(target, "sampleService", samples);
        ReflectionTestUtils.setField(target, "sampleTypeRequestService", specimenRequests);
        ReflectionTestUtils.setField(target, "sampleHumanService",
                mock(org.openelisglobal.samplehuman.service.SampleHumanService.class));
        ReflectionTestUtils.setField(target, "barcodeInfoService",
                mock(org.openelisglobal.barcode.service.BarcodeInfoService.class));
        savedSample = new Sample();
        savedSample.setAccessionNumber("SIM-ENTRY");
        when(data.getSample()).thenReturn(savedSample);
        doAnswer(call -> {
            manager.write("SIM-order-record");
            savedSample.setId("301");
            return null;
        }).when(samples).insertDataWithAccessionNumber(savedSample);
        when(specimenRequests.createRequestsForEntry(same(savedSample), anyList(), eq("7"), same(errors)))
                .thenAnswer(call -> {
                    assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
                    assertEquals("301", savedSample.getId());
                    manager.write("SIM-tube-1");
                    manager.write("SIM-tube-2");
                    var savedFirst = new SampleTypeRequestDTO();
                    savedFirst.setId("701");
                    var savedSecond = new SampleTypeRequestDTO();
                    savedSecond.setId("702");
                    return List.of(savedFirst, savedSecond);
                });
    }

    private void save() throws Exception {
        service.saveEntry(form, request, errors);
    }

    private void assertRolledBack() {
        assertEquals(List.of(), manager.committed);
        assertEquals(0, manager.commits);
        assertEquals(1, manager.rollbacks);
        assertEquals("SIM-PRIOR", request.getSession().getAttribute("lastAccessionNumber"));
    }

    private static SamplePatientEntryForm simForm() {
        SamplePatientEntryForm form = new SamplePatientEntryForm();
        SampleOrderItem order = new SampleOrderItem();
        order.setLabNo("SIM-ENTRY");
        order.setReceivedDateForDisplay("13/09/2026");
        form.setSampleOrderItems(order);
        form.setPatientProperties(new PatientManagementInfo());
        form.setOrderEntryOnly(true);
        form.setSampleXML("");
        return form;
    }

    private static class MemoryTransactionManager extends AbstractPlatformTransactionManager
            implements org.springframework.transaction.support.SmartTransactionObject {
        private final List<String> pending = new ArrayList<>();
        private final List<String> committed = new ArrayList<>();
        private int commits;
        private int rollbacks;
        private boolean active;
        private boolean failCommit;
        private boolean rollbackOnly;

        @Override public boolean isRollbackOnly() { return rollbackOnly; }
        @Override public void flush() { }
        @Override protected void doSetRollbackOnly(DefaultTransactionStatus status) { rollbackOnly = true; }

        void write(String value) {
            assertTrue("write outside transaction", active);
            pending.add(value);
        }

        @Override
        protected Object doGetTransaction() {
            return this;
        }

        @Override
        protected boolean isExistingTransaction(Object value) {
            return active;
        }

        @Override
        protected void doBegin(Object value, TransactionDefinition definition) {
            active = true;
            rollbackOnly = false;
            pending.clear();
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            if (failCommit) {
                throw new TransactionSystemException("SIM commit failure");
            }
            committed.addAll(pending);
            commits++;
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            rollbacks++;
        }

        @Override
        protected void doCleanupAfterCompletion(Object value) {
            pending.clear();
            active = false;
        }
    }
}

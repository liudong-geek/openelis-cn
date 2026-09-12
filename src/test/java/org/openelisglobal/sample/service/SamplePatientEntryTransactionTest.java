package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.lang.reflect.InvocationTargetException;
import java.util.ArrayList;
import java.util.List;
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
import org.openelisglobal.patient.action.IPatientUpdate.PatientUpdateStatus;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.sample.action.util.SamplePatientUpdateData;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockHttpServletRequest;
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

    private static class MemoryTransactionManager extends AbstractPlatformTransactionManager {
        private final List<String> pending = new ArrayList<>();
        private final List<String> committed = new ArrayList<>();
        private int commits;
        private int rollbacks;
        private boolean active;
        private boolean failCommit;

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

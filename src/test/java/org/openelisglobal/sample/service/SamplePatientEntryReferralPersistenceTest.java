package org.openelisglobal.sample.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.ServiceRequest;
import org.hl7.fhir.r4.model.Specimen;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.mockito.Spy;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.barcode.service.BarcodeInfoService;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.SampleAddService;
import org.openelisglobal.common.services.StatusService.OrderStatus;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.dataexchange.fhir.exception.FhirLocalPersistingException;
import org.openelisglobal.dataexchange.fhir.service.FhirPersistanceService;
import org.openelisglobal.dataexchange.fhir.service.FhirPersistanceServiceImpl.FhirOperations;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformServiceImpl;
import org.openelisglobal.dataexchange.service.order.ElectronicOrderService;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.referral.action.beanitems.ReferralItem;
import org.openelisglobal.referral.service.ReferralSetService;
import org.openelisglobal.sample.action.util.SamplePatientUpdateData;
import org.openelisglobal.sample.event.SamplePatientUpdateDataCreatedEvent;
import org.openelisglobal.sample.event.listener.SampleFhirTransformEventListener;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.service.SampleTypeRequestService;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.service.TestService;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Real save, post-commit listener and FHIR orchestration; no database or network. */
public class SamplePatientEntryReferralPersistenceTest {
    @InjectMocks
    private SamplePatientEntryServiceImpl entries = new SamplePatientEntryServiceImpl();
    @Spy
    @InjectMocks
    private FhirTransformServiceImpl fhir = new FhirTransformServiceImpl();
    @Mock
    private ReferralSetService referralSetService;
    @Mock
    private SampleService sampleService;
    @Mock
    private SampleItemService sampleItemService;
    @Mock
    private SampleHumanService sampleHumanService;
    @Mock
    private SampleTypeRequestService sampleTypeRequestService;
    @Mock
    private AnalysisService analysisService;
    @Mock
    private TestService testService;
    @Mock
    private BarcodeInfoService barcodeInfoService;
    @Mock
    private ApplicationEventPublisher eventPublisher;
    @Mock
    private ElectronicOrderService electronicOrderService;
    @Mock
    private FhirPersistanceService fhirPersistanceService;
    @Mock
    private FhirConfig fhirConfig;
    @Mock
    private IStatusService statusService;

    private Object oldFactory;
    private Object oldFields;
    private SamplePatientUpdateData data;
    private PatientManagementUpdate patientUpdate;
    private PatientManagementInfo patientInfo;
    private SamplePatientEntryForm form;
    private List<ReferralItem> referrals;
    private Sample sample;
    private SampleFhirTransformEventListener listener;
    private SamplePatientUpdateDataCreatedEvent savedEvent;
    private final MemoryTransactionManager transactions = new MemoryTransactionManager();

    @Before
    public void setUp() throws Exception {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        oldFields = ReflectionTestUtils.getField(FormFields.class, "instance");
        var factory = mock(AutowireCapableBeanFactory.class);
        when(factory.getBean(DefaultConfigurationProperties.class))
                .thenReturn(mock(DefaultConfigurationProperties.class));
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
        MockitoAnnotations.initMocks(this);

        data = mock(SamplePatientUpdateData.class);
        patientUpdate = mock(PatientManagementUpdate.class);
        patientInfo = new PatientManagementInfo();
        patientInfo.setPatientPK("9200100");
        form = mock(SamplePatientEntryForm.class);
        var referral = new ReferralItem();
        referral.setReferredTestId("2");
        referrals = List.of(referral);
        when(form.getUseReferral()).thenReturn(true);
        when(form.getReferralItems()).thenReturn(referrals);
        when(patientUpdate.getPatientId(form)).thenReturn("9200100");
        when(data.getPatientId()).thenReturn("9200100");
        when(data.getCurrentUserId()).thenReturn("7");
        when(data.getAccessionNumber()).thenReturn("SIM-REFERRAL-SAVE");
        sample = new Sample();
        sample.setAccessionNumber("SIM-REFERRAL-SAVE");
        sample.setStatusId("1");
        when(data.getSample()).thenReturn(sample);
        doAnswer(call -> {
            sample.setId("301");
            return null;
        }).when(sampleService).insertDataWithAccessionNumber(sample);
        when(sampleService.get("301")).thenReturn(sample);
        when(statusService.getStatusID(OrderStatus.Entered)).thenReturn("1");
        when(fhirConfig.getOeFhirSystem()).thenReturn("urn:sim:referral");

        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId("2");
        var item = new SampleItem();
        item.setId("401");
        item.setSample(sample);
        item.setFhirUuid(UUID.fromString("aaaa0000-0000-0000-0000-000000000401"));
        var analysis = new Analysis();
        analysis.setId("501");
        analysis.setTest(test);
        analysis.setSampleItem(item);
        analysis.setFhirUuid(UUID.fromString("aaaa0000-0000-0000-0000-000000000501"));
        var collection = mock(SampleAddService.class).new SampleTestCollection(item, List.of(test), null,
                List.of(), Map.of(), Map.of(), null);
        when(data.getSampleItemsTests()).thenReturn(List.of(collection));
        when(sampleItemService.insert(item)).thenReturn("401");
        when(sampleItemService.get("401")).thenReturn(item);
        when(testService.get("2")).thenReturn(test);
        when(analysisService.getAnalysisBySampleItemAndTest("401", "2")).thenReturn(analysis);
        when(sampleService.getAnalysis(sample)).thenReturn(List.of(analysis));

        // Valid UUIDs isolate remote sync failure from the old SQL fixture's missing UUID.
        var patient = new org.hl7.fhir.r4.model.Patient();
        patient.setId("aaaa0000-0000-0000-0000-000009200100");
        doReturn(patient).when(fhir).transformToFhirPatient("9200100");
        var specimen = new Specimen();
        specimen.setId(item.getFhirUuidAsString());
        doReturn(specimen).when(fhir).transformToSpecimen("401");
        var serviceRequest = new ServiceRequest();
        serviceRequest.setId(analysis.getFhirUuidAsString());
        doReturn(serviceRequest).when(fhir).transformToServiceRequest("501");

        listener = new SampleFhirTransformEventListener();
        ReflectionTestUtils.setField(listener, "fhirTransformService", fhir);
        doAnswer(call -> {
            SamplePatientUpdateDataCreatedEvent event = call.getArgument(0);
            savedEvent = event;
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    listener.handleSamplePatientUpdateDataCreatedEvent(event);
                }
            });
            return null;
        }).when(eventPublisher).publishEvent(any(ApplicationEvent.class));
        doAnswer(call -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            assertEquals("The local referral belongs to the order transaction", 0, transactions.commits);
            return null;
        }).when(referralSetService).createSaveReferralSetsSamplePatientEntry(referrals, data);
        when(fhirPersistanceService.createUpdateFhirResourcesInFhirStore(any(FhirOperations.class)))
                .thenThrow(new FhirLocalPersistingException("SIM remote FHIR rejected order bundle"));
    }

    @After
    public void tearDown() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldFields);
        TransactionSynchronizationManager.clear();
    }

    @Test
    public void selectedReferralIsSavedEvenWhenPostCommitFhirFails() throws Exception {
        save();
        assertEquals(1, transactions.commits);
        assertEquals("301", sample.getId());
        assertNotNull(sample.getFhirUuid());
        verify(fhirPersistanceService).createUpdateFhirResourcesInFhirStore(any(FhirOperations.class));
        verify(referralSetService).createSaveReferralSetsSamplePatientEntry(referrals, data);
    }

    @Test
    public void unselectedReferralDoesNotCreateAReferral() {
        when(form.getUseReferral()).thenReturn(false);
        save();
        assertEquals(1, transactions.commits);
        verify(referralSetService, never()).createSaveReferralSetsSamplePatientEntry(any(), any());
    }

    @Test
    public void localReferralFailureRollsBackTheSaveAndDoesNotStartFhir() throws Exception {
        doThrow(new IllegalStateException("SIM local referral insert failed")).when(referralSetService)
                .createSaveReferralSetsSamplePatientEntry(referrals, data);

        assertThrows(IllegalStateException.class, this::save);

        assertEquals(0, transactions.commits);
        assertEquals(1, transactions.rollbacks);
        verify(eventPublisher, never()).publishEvent(any(ApplicationEvent.class));
        verify(fhirPersistanceService, never()).createUpdateFhirResourcesInFhirStore(any(FhirOperations.class));
        verify(referralSetService, never()).syncSavedEntryReferrals(any());
    }

    @Test
    public void successfulFhirAndReplaySyncTheSavedReferralWithoutCreatingItAgain() throws Exception {
        doReturn(new Bundle()).when(fhirPersistanceService)
                .createUpdateFhirResourcesInFhirStore(any(FhirOperations.class));

        save();

        assertEquals(1, transactions.commits);
        verify(referralSetService).createSaveReferralSetsSamplePatientEntry(referrals, data);
        verify(referralSetService).syncSavedEntryReferrals("301");
        assertNotNull(savedEvent);

        listener.handleSamplePatientUpdateDataCreatedEvent(savedEvent);

        verify(referralSetService).createSaveReferralSetsSamplePatientEntry(referrals, data);
        verify(referralSetService, times(2)).syncSavedEntryReferrals("301");
        verify(fhirPersistanceService, times(2)).createUpdateFhirResourcesInFhirStore(any(FhirOperations.class));
        assertEquals(1, transactions.commits);
    }

    private void save() {
        new TransactionTemplate(transactions).execute(status -> {
            entries.persistData(data, patientUpdate, patientInfo, form, new MockHttpServletRequest());
            return null;
        });
    }

    private static class MemoryTransactionManager extends AbstractPlatformTransactionManager {
        private int commits;
        private int rollbacks;

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            commits++;
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            rollbacks++;
        }
    }
}

package org.openelisglobal.dataexchange.fhir.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import ca.uhn.fhir.rest.client.api.IGenericClient;
import ca.uhn.fhir.rest.gclient.IFetchConformanceTyped;
import ca.uhn.fhir.rest.gclient.IGetPageTyped;
import ca.uhn.fhir.rest.gclient.IQuery;
import ca.uhn.fhir.rest.gclient.ITransaction;
import ca.uhn.fhir.rest.gclient.ITransactionTyped;
import ca.uhn.fhir.rest.param.DateRangeParam;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.CapabilityStatement;
import org.hl7.fhir.r4.model.DiagnosticReport;
import org.hl7.fhir.r4.model.Observation;
import org.hl7.fhir.r4.model.Patient;
import org.hl7.fhir.r4.model.Reference;
import org.hl7.fhir.r4.model.Resource;
import org.hl7.fhir.r4.model.Task;
import org.itech.fhir.dataexport.api.service.DataExportService;
import org.itech.fhir.dataexport.api.service.DataExportStatusService;
import org.itech.fhir.dataexport.api.service.impl.DataExportTaskCheckerServiceImpl;
import org.itech.fhir.dataexport.core.dao.DataExportAttemptDAO;
import org.itech.fhir.dataexport.core.model.DataExportAttempt.DataExportStatus;
import org.itech.fhir.dataexport.core.model.DataExportTask;
import org.itech.fhir.dataexport.core.service.DataExportTaskService;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.dataexchange.fhir.FhirUtil;
import org.openelisglobal.report.service.impl.ReportPublicationService;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.test.util.ReflectionTestUtils;

public class IssuedReportDataExportServiceTest {
    private final DataExportTaskService tasks = mock(DataExportTaskService.class);
    private final DataExportAttemptDAO attempts = mock(DataExportAttemptDAO.class);
    private final DataExportStatusService statuses = mock(DataExportStatusService.class);
    private final FhirUtil clients = mock(FhirUtil.class);
    private final ReportPublicationService publications = mock(ReportPublicationService.class);
    private final IGenericClient local = mock(IGenericClient.class, RETURNS_DEEP_STUBS);
    private final IGenericClient remote = mock(IGenericClient.class, RETURNS_DEEP_STUBS);
    private final ITransaction remoteTransaction = mock(ITransaction.class);
    @SuppressWarnings("unchecked")
    private final ITransactionTyped<Bundle> remoteRequest = mock(ITransactionTyped.class);
    @SuppressWarnings("unchecked")
    private final IFetchConformanceTyped<CapabilityStatement> capabilitiesRequest = mock(IFetchConformanceTyped.class);
    private final DataExportTask task = new DataExportTask();
    private final List<Bundle> transmitted = new ArrayList<>();
    private IssuedReportDataExportService service;

    @Before
    public void setUp() {
        task.setId(23L);
        task.setEndpoint("https://task-display.invalid/fhir");
        task.setHeaders(Map.of("X-Demo-Transport", "test-only"));
        when(attempts.save(any())).thenAnswer(call -> call.getArgument(0));
        when(tasks.getLatestSuccessInstantForDataExportTask(task)).thenReturn(Instant.parse("2026-01-01T00:00:00Z"));
        when(clients.getFhirClient("https://local.invalid/fhir")).thenReturn(local);
        when(clients.getFhirClient("https://subscriber.invalid/fhir")).thenReturn(remote);
        when(publications.publicationIds(any(), anyLong(), eq(100))).thenReturn(List.of());
        when(remote.capabilities().ofType(CapabilityStatement.class)).thenReturn(capabilitiesRequest);
        when(capabilitiesRequest.execute()).thenReturn(new CapabilityStatement());
        when(remote.transaction()).thenReturn(remoteTransaction);
        when(remoteRequest.execute())
                .thenAnswer(call -> response(transmitted.get(transmitted.size() - 1).getEntry().size()));
        // Capture the Bundle at withBundle; no HTTP client is created or invoked.
        doAnswer(call -> {
            transmitted.add(((Bundle) call.getArgument(0)).copy());
            return remoteRequest;
        }).when(remoteTransaction).withBundle(any(Bundle.class));
        service = new IssuedReportDataExportService(tasks, attempts, statuses, clients, publications);
        ReflectionTestUtils.setField(service, "localFhirStore", "https://local.invalid/fhir");
        ReflectionTestUtils.setField(service, "defaultRemoteServer", "https://subscriber.invalid/fhir");
        ReflectionTestUtils.setField(service, "defaultResources", new String[] { "Observation", "DiagnosticReport" });
    }

    @Test
    public void absentSubscriberDoesNotReportSuccessOrAttemptNetwork() throws Exception {
        ReflectionTestUtils.setField(service, "defaultRemoteServer", "");
        assertEquals(DataExportStatus.NOT_RAN, run());
        verifyZeroInteractions(clients, publications);
        verify(statuses).changeDataRequestAttemptStatus(any(), eq(DataExportStatus.NOT_RAN));
    }

    @Test
    public void clinicalResourcesNeverReadLegacyStoreAndOnlyRevalidatedFrozenReportIsSent() throws Exception {
        DiagnosticReport frozen = report("cn-report-71", "signed-frozen-document");
        when(publications.publicationIds(any(), eq(0L), eq(100))).thenReturn(List.of("cn-report-71", "cn-report-71"));
        publish(frozen);
        assertEquals(DataExportStatus.SUCCEEDED, run());
        verifyZeroInteractions(local);
        assertEquals(1, transmitted.size());
        DiagnosticReport sent = (DiagnosticReport) transmitted.get(0).getEntryFirstRep().getResource();
        assertEquals("signed-frozen-document", sent.getConclusion());
        assertEquals("DiagnosticReport/cn-report-71", transmitted.get(0).getEntryFirstRep().getRequest().getUrl());
        verify(publications, times(1)).withCurrentPublication(eq("cn-report-71"), any());
        verify(clients, never()).getFhirClient(task.getEndpoint());
    }

    @Test
    public void reportQueryDoesNotUseOldSuccessfulWatermarkThatCouldMissLateCommit() throws Exception {
        assertEquals(DataExportStatus.SUCCEEDED, run());
        verify(publications).publicationIds(any(Instant.class), eq(0L), eq(100));
        verify(capabilitiesRequest).execute();
        assertTrue(transmitted.isEmpty());
    }

    @Test
    public void supersededCandidateIsSkippedAndNeverSerialized() throws Exception {
        when(publications.publicationIds(any(), eq(0L), eq(100))).thenReturn(List.of("cn-report-71"));
        when(publications.withCurrentPublication(eq("cn-report-71"), any())).thenReturn(false);
        assertEquals(DataExportStatus.SUCCEEDED, run());
        assertTrue(transmitted.isEmpty());
    }

    @Test
    public void revalidationFailureStopsReportTransmission() throws Exception {
        when(publications.publicationIds(any(), eq(0L), eq(100))).thenReturn(List.of("cn-report-71"));
        when(publications.withCurrentPublication(eq("cn-report-71"), any())).thenThrow(new IllegalStateException("invalid frozen hash"));
        assertEquals(DataExportStatus.FAILED, run());
        assertTrue(transmitted.isEmpty());
        verify(statuses).changeDataRequestAttemptStatus(any(), eq(DataExportStatus.FAILED));
    }

    @Test
    public void correctedOrVoidedContentUsesCurrentPublicationAndStableIdentityOnRetry() throws Exception {
        DiagnosticReport withdrawal = report("cn-report-71", "withdrawn");
        withdrawal.setStatus(DiagnosticReport.DiagnosticReportStatus.ENTEREDINERROR);
        when(publications.publicationIds(any(), eq(0L), eq(100))).thenReturn(List.of("cn-report-71"));
        publish(withdrawal);
        assertEquals(DataExportStatus.SUCCEEDED, run());
        assertEquals(DataExportStatus.SUCCEEDED, run());
        assertEquals(2, transmitted.size());
        for (Bundle bundle : transmitted) {
            assertEquals("DiagnosticReport/cn-report-71", bundle.getEntryFirstRep().getRequest().getUrl());
            assertEquals(Bundle.HTTPVerb.PUT, bundle.getEntryFirstRep().getRequest().getMethod());
            assertEquals(DiagnosticReport.DiagnosticReportStatus.ENTEREDINERROR,
                    ((DiagnosticReport) bundle.getEntryFirstRep().getResource()).getStatus());
        }
    }

    @Test
    public void nonclinicalResourcesPreservePagingWhileOldTaskResultOutputIsRemoved() throws Exception {
        ReflectionTestUtils.setField(service, "defaultResources", new String[] { "Task" });
        Task first = new Task();
        first.setId("task-one");
        first.addOutput().setValue(new Reference("DiagnosticReport/live-analysis"));
        Task second = new Task();
        second.setId("task-two");
        Bundle page = page(first);
        page.addLink().setRelation("next").setUrl("https://local.invalid/fhir/page2");
        stubPage("Task", page);
        stubNext(page, page(second));
        assertEquals(DataExportStatus.SUCCEEDED, run());
        assertEquals(2, transmitted.size());
        assertFalse(((Task) transmitted.get(0).getEntryFirstRep().getResource()).hasOutput());
        assertTrue(first.hasOutput());
        verifyZeroInteractions(publications);
    }

    @Test
    public void nestedClinicalResourceFailsBeforeAnySend() throws Exception {
        ReflectionTestUtils.setField(service, "defaultResources", new String[] { "Patient" });
        Patient patient = new Patient();
        patient.setId("patient-one");
        patient.addContained(new Observation().setStatus(Observation.ObservationStatus.PRELIMINARY));
        stubPage("Patient", page(patient));
        assertEquals(DataExportStatus.FAILED, run());
        assertTrue(transmitted.isEmpty());
    }

    @Test
    public void transactionShapedSearchResponseCannotBeReplayedAsAnExport() throws Exception {
        ReflectionTestUtils.setField(service, "defaultResources", new String[] { "Patient" });
        Patient patient = new Patient();
        patient.setId("patient-one");
        Bundle unexpected = page(patient).setType(Bundle.BundleType.TRANSACTION);
        unexpected.getEntryFirstRep().getRequest().setMethod(Bundle.HTTPVerb.DELETE).setUrl("Patient/patient-one");
        stubPage("Patient", unexpected);
        assertEquals(DataExportStatus.FAILED, run());
        assertTrue(transmitted.isEmpty());
    }

    @Test
    public void unsupportedResourceConfigurationCannotBypassPublicationBoundary() throws Exception {
        ReflectionTestUtils.setField(service, "defaultResources", new String[] { "Bundle" });
        assertEquals(DataExportStatus.FAILED, run());
        verifyZeroInteractions(local, publications);
        assertTrue(transmitted.isEmpty());
    }

    @Test
    public void firstSuccessThenFailureRetainsIncompleteAttempt() throws Exception {
        when(publications.publicationIds(any(), eq(0L), eq(100))).thenReturn(List.of("cn-report-71", "cn-report-72"));
        publish(report("cn-report-71", "one"));
        when(publications.withCurrentPublication(eq("cn-report-72"), any())).thenThrow(new IllegalStateException("second report no longer valid"));
        assertEquals(DataExportStatus.INCOMPLETE, run());
        assertEquals(1, transmitted.size());
        verify(statuses).changeDataRequestAttemptStatus(any(), eq(DataExportStatus.INCOMPLETE));
    }

    @Test
    public void incompleteHttpResponseIsNotCountedAsConfirmedDelivery() throws Exception {
        when(publications.publicationIds(any(), eq(0L), eq(100))).thenReturn(List.of("cn-report-71"));
        publish(report("cn-report-71", "one"));
        doReturn(new Bundle()).when(remoteRequest).execute();
        assertEquals(DataExportStatus.FAILED, run());
        verify(statuses, never()).changeDataRequestAttemptStatus(any(), eq(DataExportStatus.SUCCEEDED));
    }

    @Test
    public void cyclicLocalPaginationFailsWithoutSendingPartialCollectedPages() throws Exception {
        ReflectionTestUtils.setField(service, "defaultResources", new String[] { "Patient" });
        Patient patient = new Patient();
        patient.setId("patient-one");
        Bundle cyclic = page(patient);
        cyclic.addLink().setRelation("next").setUrl("https://local.invalid/fhir/same-page");
        stubPage("Patient", cyclic);
        stubNext(cyclic, cyclic);
        assertEquals(DataExportStatus.FAILED, run());
        assertTrue(transmitted.isEmpty());
    }

    @Test
    public void nonclinicalSingleTransactionKeepsEveryResourceAndConfirmsEveryResponse() throws Exception {
        ReflectionTestUtils.setField(service, "defaultResources", new String[] { "Patient" });
        ReflectionTestUtils.setField(service, "singleTransaction", true);
        Patient first = new Patient();
        first.setId("patient-one");
        Patient second = new Patient();
        second.setId("patient-two");
        Bundle page = page(first);
        page.addEntry().setResource(second);
        stubPage("Patient", page);
        assertEquals(DataExportStatus.SUCCEEDED, run());
        assertEquals(1, transmitted.size());
        assertEquals(2, transmitted.get(0).getEntry().size());
    }

    @Test
    public void reportPagesAreConsumedBeforeTheNextPageAndEveryRetryRestartsFromZero() throws Exception {
        when(publications.publicationIds(any(), eq(0L), eq(100))).thenReturn(List.of("cn-report-71"));
        when(publications.publicationIds(any(), eq(71L), eq(100))).thenAnswer(call -> {
            assertFalse("The first report must already have been sent before loading the next page", transmitted.isEmpty());
            return List.of("cn-report-72");
        });
        publish(report("cn-report-71", "first"));
        publish(report("cn-report-72", "second"));
        assertEquals(DataExportStatus.SUCCEEDED, run());
        assertEquals(DataExportStatus.SUCCEEDED, run());
        assertEquals(4, transmitted.size());
        verify(publications, times(2)).publicationIds(any(), eq(0L), eq(100));
        verify(publications, times(2)).publicationIds(any(), eq(71L), eq(100));
        verify(publications, times(2)).publicationIds(any(), eq(72L), eq(100));
        var order = inOrder(publications);
        order.verify(publications).publicationIds(any(), eq(0L), eq(100));
        order.verify(publications).withCurrentPublication(eq("cn-report-71"), any());
        order.verify(publications).publicationIds(any(), eq(71L), eq(100));
        order.verify(publications).withCurrentPublication(eq("cn-report-72"), any());
    }

    @Test
    public void repeatedKeysetPageFailsWithoutResendingAnAlreadyHandledReport() throws Exception {
        when(publications.publicationIds(any(), eq(0L), eq(100))).thenReturn(List.of("cn-report-71"));
        when(publications.publicationIds(any(), eq(71L), eq(100))).thenReturn(List.of("cn-report-71"));
        publish(report("cn-report-71", "first"));
        assertEquals(DataExportStatus.INCOMPLETE, run());
        assertEquals(1, transmitted.size());
        verify(publications, times(1)).withCurrentPublication(eq("cn-report-71"), any());
    }

    @Test
    public void primaryBeanIsUsedByLibraryScheduledCheckerAndSharedInterface() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(DataExportTaskService.class, () -> tasks);
            context.registerBean(DataExportAttemptDAO.class, () -> attempts);
            context.registerBean(DataExportStatusService.class, () -> statuses);
            context.getBeanFactory().registerSingleton("fhirUtil", clients);
            context.getBeanFactory().registerSingleton("reportPublicationService", publications);
            context.registerBean("legacyExport", DataExportService.class, () -> mock(DataExportService.class));
            context.register(IssuedReportDataExportService.class);
            context.refresh();
            DataExportService selected = context.getBean(DataExportService.class);
            assertTrue(selected instanceof IssuedReportDataExportService);
            var checker = context.getAutowireCapableBeanFactory().createBean(DataExportTaskCheckerServiceImpl.class);
            assertSame(selected, ReflectionTestUtils.getField(checker, "dataExportService"));
        }
    }

    @SuppressWarnings("unchecked")
    private void stubPage(String type, Bundle page) {
        IQuery<Bundle> query = mock(IQuery.class);
        when(local.search().forResource(type).lastUpdated(any(DateRangeParam.class)).returnBundle(Bundle.class))
                .thenReturn(query);
        when(query.execute()).thenReturn(page);
    }

    @SuppressWarnings("unchecked")
    private void stubNext(Bundle page, Bundle next) {
        IGetPageTyped<Bundle> query = mock(IGetPageTyped.class);
        when(local.loadPage().next(page)).thenReturn(query);
        when(query.execute()).thenReturn(next);
    }

    private DataExportStatus run() throws Exception {
        return service.exportNewDataFromLocalToRemote(task).get();
    }

    private void publish(DiagnosticReport current) {
        doAnswer(call -> {
            Consumer<DiagnosticReport> sender = call.getArgument(1);
            sender.accept(current);
            return true;
        }).when(publications).withCurrentPublication(eq(current.getIdElement().getIdPart()), any());
    }

    private static DiagnosticReport report(String id, String conclusion) {
        DiagnosticReport report = new DiagnosticReport();
        report.setId(id);
        report.setStatus(DiagnosticReport.DiagnosticReportStatus.FINAL);
        report.setConclusion(conclusion);
        return report;
    }

    private static Bundle page(Resource resource) {
        Bundle page = new Bundle().setType(Bundle.BundleType.SEARCHSET);
        page.addEntry().setResource(resource);
        return page;
    }

    private static Bundle response(int entries) {
        Bundle response = new Bundle().setType(Bundle.BundleType.TRANSACTIONRESPONSE);
        for (int i = 0; i < entries; i++)
            response.addEntry().getResponse().setStatus("200 OK");
        return response;
    }
}

package org.openelisglobal.sample;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService;
import org.openelisglobal.common.services.TableIdService;
import org.openelisglobal.observationhistory.service.ObservationHistoryService;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.person.valueholder.Person;
import org.openelisglobal.sample.dao.SavedOrderReadDAO;
import org.openelisglobal.sample.form.SavedOrderReadRequest;
import org.openelisglobal.sample.service.OrderDashboardAccess;
import org.openelisglobal.sample.service.OrderEntryActorGuard;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.service.SavedOrderReadAccess;
import org.openelisglobal.sample.service.SavedOrderReadException;
import org.openelisglobal.sample.service.impl.SavedOrderReadServiceImpl;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.statusofsample.service.StatusOfSampleService;
import org.openelisglobal.statusofsample.valueholder.StatusOfSample;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

public class SavedOrderReadServiceTest {
    private SavedOrderReadDAO dao;
    private SavedOrderReadAccess access;
    private SavedOrderReadServiceImpl service;
    private HttpServletRequest request;
    private Sample sample;
    private SampleItem item;
    private Analysis analysis;
    private Patient patient;
    private TypeOfSample type;
    private StatusOfSampleService definitions;
    private IStatusService statuses;
    private TestService tests;
    private OrderDashboardAccess.Scope scope;
    private SampleService sampleService;
    private TableIdService tables;
    private PanelService panels;

    @Before
    public void setup() throws ReflectiveOperationException {
        dao = mock(SavedOrderReadDAO.class);
        access = mock(SavedOrderReadAccess.class);
        request = mock(HttpServletRequest.class);
        definitions = mock(StatusOfSampleService.class);
        statuses = mock(IStatusService.class);
        tests = mock(TestService.class);
        sampleService = mock(SampleService.class);
        tables = new TableIdService();
        tables.REFERRING_ORG_TYPE_ID = "1";
        tables.REFERRING_ORG_DEPARTMENT_TYPE_ID = "2";
        panels = mock(PanelService.class);
        service = new SavedOrderReadServiceImpl(dao, access, sampleService, tables,
                mock(ObservationHistoryService.class), tests, panels, definitions, statuses);
        // Real immutable test binding; actual actor authentication is covered by
        // OrderEntryActorGuardTest.
        var constructor = OrderEntryActorGuard.BoundActor.class.getDeclaredConstructor(Authentication.class,
                Object.class, String.class, String.class, HttpSession.class, int.class, Set.class);
        constructor.setAccessible(true);
        var authentication = new UsernamePasswordAuthenticationToken("reception7", null,
                List.of(new SimpleGrantedAuthority("Reception")));
        var actor = constructor.newInstance(authentication, authentication.getPrincipal(), "reception7", "7",
                new MockHttpSession(), 1, Set.of("Reception"));
        scope = new OrderDashboardAccess.Scope(actor, List.of("1"), List.of("1"), false);
        when(access.bind(request)).thenReturn(scope);
        when(access.canModify(request, "7")).thenReturn(true);
        sample = new Sample();
        sample.setId("4");
        sample.setAccessionNumber("HMC1");
        type = mock(TypeOfSample.class);
        when(type.getId()).thenReturn("1");
        when(type.getLocalizedName()).thenReturn("血液");
        item = item("10", "-not-derived");
        var test = mock(org.openelisglobal.test.valueholder.Test.class);
        when(test.getId()).thenReturn("1");
        when(test.getLocalizedName()).thenReturn("血糖");
        var section = new TestSection();
        section.setId("1");
        analysis = new Analysis();
        analysis.setId("20");
        analysis.setSampleItem(item);
        analysis.setTest(test);
        analysis.setTestSection(section);
        analysis.setStatusId("4");
        analysis.setLastupdated(Timestamp.valueOf("2026-10-06 12:30:15.123456"));
        var person = new Person();
        person.setId("1");
        person.setFirstName("洋");
        person.setLastName("刘");
        patient = new Patient();
        patient.setId("1");
        patient.setPerson(person);
        var sampleState = new StatusOfSample();
        sampleState.setId("1");
        sampleState.setStatusType("SAMPLE");
        var analysisState = new StatusOfSample();
        analysisState.setId("4");
        analysisState.setStatusType("ANALYSIS");
        when(definitions.get("1")).thenReturn(sampleState);
        when(definitions.get("4")).thenReturn(analysisState);
        when(statuses.getSampleStatusForID("1")).thenReturn(StatusService.SampleStatus.Entered);
        when(statuses.getAnalysisStatusForID("4")).thenReturn(StatusService.AnalysisStatus.NotStarted);
        when(statuses.getStatusNameFromId("1")).thenReturn("已录入");
        when(statuses.getStatusNameFromId("4")).thenReturn("待检验");
        when(tests.get("1")).thenReturn(test);
        setGraph(List.of(item), List.of(analysis), List.of(), List.of(patient));
    }

    private SampleItem item(String id, String barcode) {
        var result = new SampleItem();
        result.setId(id);
        result.setSample(sample);
        result.setTypeOfSample(type);
        result.setSortOrder("1");
        result.setExternalId(barcode);
        result.setStatusId("1");
        return result;
    }

    private SampleTypeRequest orderRequest(int id, SampleTypeRequest.Status status) {
        var r = new SampleTypeRequest();
        r.setId(id);
        r.setSample(sample);
        r.setTypeOfSample(type);
        r.setRequestedTests("1");
        r.setStatus(status);
        return r;
    }

    private void setGraph(List<SampleItem> items,List<Analysis> analyses,List<SampleTypeRequest> requests,List<Patient> patients){
        when(dao.loadExact("HMC1")).thenReturn(Optional.of(new SavedOrderReadDAO.Graph(sample,items,analyses,requests,patients,List.of())));
    }

    @Test
    public void realNamesBarcodeStatusAndMicrosecondVersionRemainDetached() {
        var result = service.read(new SavedOrderReadRequest("HMC1"), request);
        assertEquals("洋", result.patient().firstName());
        assertEquals("刘", result.patient().lastName());
        assertEquals("-not-derived", result.samples().get(0).barcode());
        assertEquals("10", result.samples().get(0).sampleItemId());
        var a = result.samples().get(0).analyses().get(0);
        assertEquals("20", a.analysisId());
        assertEquals("NotStarted", a.statusCode());
        assertEquals("ANALYSIS", a.statusType());
        assertEquals(analysis.getLastupdated().toInstant().toString(), a.lastupdated());
        assertTrue(result.readOnly());
        assertTrue(result.canModify());
        assertNull(result.modifyUnavailableReason());
        var calls = inOrder(dao, access);
        calls.verify(access).bind(request);
        calls.verify(dao).loadExact("HMC1");
        calls.verify(dao).refreshReadContext();
        calls.verify(access).requireUnchanged(request, scope);
        verify(access, times(2)).requireUnchanged(request, scope);
        verifyZeroInteractions(request);
    }

    @Test
    public void multipleTubesAndAllAnalysisStagesAreReturnedAlongsidePendingAndCancelledRequests() {
        var second = item("11", null);
        second.setSortOrder("2");
        var canceled = new Analysis();
        canceled.setId("21");
        canceled.setSampleItem(second);
        canceled.setTest(analysis.getTest());
        canceled.setTestSection(analysis.getTestSection());
        canceled.setStatusId("11");
        var cancelledState = new StatusOfSample();
        cancelledState.setId("11");
        cancelledState.setStatusType("ANALYSIS");
        when(definitions.get("11")).thenReturn(cancelledState);
        when(statuses.getAnalysisStatusForID("11")).thenReturn(StatusService.AnalysisStatus.Canceled);
        when(statuses.getStatusNameFromId("11")).thenReturn("已取消");
        var collected = orderRequest(1, SampleTypeRequest.Status.COLLECTED);
        collected.setSampleItem(item);
        setGraph(List.of(item, second), List.of(analysis, canceled),
                List.of(collected, orderRequest(2, SampleTypeRequest.Status.REQUESTED),
                        orderRequest(3, SampleTypeRequest.Status.CANCELLED)),
                List.of(patient));
        var result = service.read(new SavedOrderReadRequest("HMC1"), request);
        assertEquals(2, result.samples().size());
        assertEquals(1, result.samples().get(1).analyses().size());
        assertEquals("Canceled", result.samples().get(1).analyses().get(0).statusCode());
        assertNull(result.samples().get(1).barcode());
        assertEquals(3, result.requests().size());
        assertEquals("REQUESTED", result.requests().get(1).status());
        assertNull(result.requests().get(1).sampleItemId());
    }

    @Test
    public void requestWithoutPhysicalSpecimenOrAnalysisRemainsARealRequest() {
        setGraph(List.of(), List.of(), List.of(orderRequest(1, SampleTypeRequest.Status.REQUESTED)), List.of(patient));
        var result = service.read(new SavedOrderReadRequest("HMC1"), request);
        assertTrue(result.samples().isEmpty());
        assertEquals("1", result.requests().get(0).sampleTypeRequestId());
        assertEquals("血糖", result.requests().get(0).tests().get(0).testName());
    }

    @Test public void exactUnknownAndMismatchedRawIdentityFailClosed(){
        when(dao.loadExact("missing")).thenReturn(Optional.empty());assertEquals(404,assertThrows(SavedOrderReadException.class,()->service.read(new SavedOrderReadRequest("missing"),request)).status());
        sample.setAccessionNumber("OTHER");assertEquals(409,assertThrows(SavedOrderReadException.class,()->service.read(new SavedOrderReadRequest("HMC1"),request)).status());
    }

    @Test
    public void malformedIdsDuplicateAnalysesAndForeignSpecimenLinksFailClosed() {
        analysis.setId("wrong");
        assertThrows(SavedOrderReadException.class, () -> service.read(new SavedOrderReadRequest("HMC1"), request));
        analysis.setId("20");
        setGraph(List.of(item), List.of(analysis, analysis), List.of(), List.of(patient));
        assertThrows(SavedOrderReadException.class, () -> service.read(new SavedOrderReadRequest("HMC1"), request));
        var r = orderRequest(1, SampleTypeRequest.Status.COLLECTED);
        var foreign = item("99", "other");
        r.setSampleItem(foreign);
        setGraph(List.of(item), List.of(analysis), List.of(r), List.of(patient));
        assertThrows(SavedOrderReadException.class, () -> service.read(new SavedOrderReadRequest("HMC1"), request));
    }

    @Test
    public void unauthorizedTaskAndMalformedActiveRequestDoNotBecomePartialSuccess() {
        var foreign = mock(org.openelisglobal.test.valueholder.Test.class);
        when(foreign.getId()).thenReturn("2");
        analysis.setTest(foreign);
        assertThrows(AccessDeniedException.class, () -> service.read(new SavedOrderReadRequest("HMC1"), request));
        analysis.setTest(tests.get("1"));
        var r = orderRequest(1, SampleTypeRequest.Status.REQUESTED);
        r.setRequestedTests("1,,1");
        setGraph(List.of(item), List.of(analysis), List.of(r), List.of(patient));
        assertThrows(AccessDeniedException.class, () -> service.read(new SavedOrderReadRequest("HMC1"), request));
    }

    @Test
    public void unknownOrWrongCategoryStatusRetainsLocalIdentityButDisablesModify() {
        var wrong = new StatusOfSample();
        wrong.setId("1");
        wrong.setStatusType("ANALYSIS");
        when(definitions.get("1")).thenReturn(wrong);
        var result = service.read(new SavedOrderReadRequest("HMC1"), request);
        assertEquals("10", result.samples().get(0).sampleItemId());
        assertNull(result.samples().get(0).statusCode());
        assertFalse(result.canModify());
        assertEquals("INCOMPLETE_ORDER_DATA", result.modifyUnavailableReason());
    }

    @Test
    public void missingPatientIsVisibleWithWarningAndAmbiguousPatientsAreRejected() {
        setGraph(List.of(item), List.of(analysis), List.of(), List.of());
        var result = service.read(new SavedOrderReadRequest("HMC1"), request);
        assertNull(result.patient());
        assertTrue(result.warningCodes().contains("PATIENT_DATA_UNAVAILABLE"));
        assertFalse(result.canModify());
        var second = new Patient();
        second.setId("2");
        setGraph(List.of(item), List.of(analysis), List.of(), List.of(patient, second));
        assertThrows(SavedOrderReadException.class, () -> service.read(new SavedOrderReadRequest("HMC1"), request));
    }

    @Test
    public void depersonalizationNeverCompilesPatientPlaintext() {
        var masked = new OrderDashboardAccess.Scope(scope.actor(), scope.testIds(), scope.sectionIds(), true);
        when(access.bind(request)).thenReturn(masked);
        var result = service.read(new SavedOrderReadRequest("HMC1"), request);
        assertEquals("1", result.patient().patientId());
        assertNull(result.patient().firstName());
        assertNull(result.patient().lastName());
        assertNull(result.patient().nationalId());
        assertNull(result.patient().phone());
        assertTrue(result.warningCodes().contains("PATIENT_DATA_REDACTED"));
    }

    @Test
    public void currentModuleOrScopeRevocationRejectsAfterCompilationAndReadFailureIsNotEmpty() {
        doThrow(new AccessDeniedException("changed")).when(access).requireUnchanged(request, scope);
        assertThrows(AccessDeniedException.class, () -> service.read(new SavedOrderReadRequest("HMC1"), request));
        reset(access);
        when(access.bind(request)).thenReturn(scope);
        doThrow(new IllegalStateException("database down")).when(dao).loadExact("HMC1");
        assertThrows(IllegalStateException.class, () -> service.read(new SavedOrderReadRequest("HMC1"), request));
    }

    @Test public void currentModifyPermissionIsReadAfterCacheDetach(){
        when(access.canModify(request,"7")).thenReturn(false);var result=service.read(new SavedOrderReadRequest("HMC1"),request);assertFalse(result.canModify());assertFalse(result.isEditable());assertEquals("MODIFY_PERMISSION_DENIED",result.modifyUnavailableReason());
        var calls=inOrder(dao,access);calls.verify(access).bind(request);calls.verify(dao).loadExact("HMC1");calls.verify(dao).refreshReadContext();calls.verify(access).requireUnchanged(request,scope);calls.verify(access).canModify(request,"7");
    }

    @Test
    public void departmentOnlyMetadataNeverPromotesDepartmentToSendingSite() {
        var department = new org.openelisglobal.organization.valueholder.Organization();
        department.setId("2");
        department.setOrganizationName("内科");
        when(sampleService.getOrganizationRequester(sample, "2")).thenReturn(department);
        var result = service.read(new SavedOrderReadRequest("HMC1"), request);
        assertNull(result.sampleOrderItems().get("referringSiteId"));
        assertNull(result.sampleOrderItems().get("referringSiteName"));
        assertEquals("2", result.sampleOrderItems().get("referringSiteDepartmentId"));
        assertEquals("内科", result.sampleOrderItems().get("referringSiteDepartmentName"));
    }

    @Test
    public void cancelledOutOfScopeOrMalformedTestsAlsoRedactPanelNamesWithoutLoadingThem() {
        for (String csv : List.of("1,99", "1,invalid", "")) {
            var r = orderRequest(1, SampleTypeRequest.Status.CANCELLED);
            r.setRequestedTests(csv);
            r.setRequestedPanels("55");
            setGraph(List.of(item), List.of(analysis), List.of(r), List.of(patient));
            var result = service.read(new SavedOrderReadRequest("HMC1"), request);
            var requestView = result.requests().get(0);
            assertEquals("55", requestView.panels().get(0).panelId());
            assertNull(requestView.panels().get(0).panelName());
            assertTrue(requestView.warningCodes().contains("REQUEST_PANEL_DATA_UNAVAILABLE"));
        }
        verifyZeroInteractions(panels);
    }

}

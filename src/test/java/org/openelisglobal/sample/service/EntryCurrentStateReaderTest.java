package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.dao.AnalysisDAO;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.person.valueholder.Person;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.dao.SampleHumanDAO;
import org.openelisglobal.samplehuman.valueholder.SampleHuman;
import org.openelisglobal.sampleitem.dao.SampleItemDAO;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.dao.SampleTypeRequestDAO;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.statusofsample.service.StatusOfSampleService;
import org.openelisglobal.statusofsample.valueholder.StatusOfSample;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.unitofmeasure.valueholder.UnitOfMeasure;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** SIM data only. Actual transaction setup is covered by the recovery-boundary suite. */
public class EntryCurrentStateReaderTest {
    private EntryCurrentStateReader reader;
    private SampleService samples;
    private SampleHumanDAO links;
    private PatientService patients;
    private SampleTypeRequestDAO requests;
    private SampleItemDAO items;
    private AnalysisDAO analyses;
    private StatusOfSampleService statuses;
    private UserService users;
    private ObjectNode original;
    private Sample sample;
    private Patient patient;
    private SampleHuman link;
    private List<SampleTypeRequest> logical;
    private List<SampleItem> physical;
    private static final Timestamp SIM_TIME = Timestamp.valueOf("2026-09-13 08:00:00");

    @Before public void setUp() {
        reader = new EntryCurrentStateReader();
        samples = mock(SampleService.class); links = mock(SampleHumanDAO.class);
        patients = mock(PatientService.class); requests = mock(SampleTypeRequestDAO.class);
        items = mock(SampleItemDAO.class); analyses = mock(AnalysisDAO.class);
        statuses = mock(StatusOfSampleService.class); users = mock(UserService.class);
        set("samples", samples); set("patientLinks", links); set("patients", patients); set("requests", requests);
        set("items", items); set("analyses", analyses); set("statuses", statuses); set("users", users);
        var configuration = mock(DefaultConfigurationProperties.class); set("configuration", configuration);
        when(configuration.getPropertyValue("domain.human")).thenReturn("H");
        when(configuration.getPropertyValue("domain.environmental")).thenReturn("E");
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);
        TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(java.sql.Connection.TRANSACTION_REPEATABLE_READ);
        sample = new Sample(); sample.setId("301"); sample.setAccessionNumber("SIM-CURRENT");
        sample.setDomain("H"); sample.setStatusId("11"); sample.setLastupdated(SIM_TIME);
        when(samples.get("301")).thenReturn(sample);
        link = new SampleHuman(); link.setId("501"); link.setSampleId("301"); link.setPatientId("601");
        when(links.getAllMatching("sampleId", "301")).thenReturn(List.of(link));
        patient = new Patient(); patient.setId("601"); patient.setNationalId("SIM-PATIENT");
        var person = new Person(); person.setId("602"); person.setFirstName("模拟患者"); person.setLastName("测试");
        patient.setPerson(person); patient.setGender("F"); when(patients.get("601")).thenReturn(patient);
        logical = new ArrayList<>(List.of(request(701, 0), request(702, 1), request(703, 2)));
        physical = new ArrayList<>();
        when(requests.getRequestsBySampleId("301")).thenReturn(logical);
        when(items.getSampleItemsBySampleId("301")).thenReturn(physical);
        when(users.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION))
                .thenReturn(List.of(new IdValuePair("41", "SIM-test"), new IdValuePair("42", "SIM-extra")));
        status("11", "ORDER"); status("12", "SAMPLE"); status("13", "ANALYSIS");
        original = new ObjectMapper().createObjectNode().put("version", 1).put("sampleId", "301")
                .put("labNo", "SIM-CURRENT").put("patientId", "601").put("workflowType", "clinical");
        var tubes = original.putArray("requestedSpecimens");
        for (var row : logical) { tubes.addObject().put("id", row.getId().toString()).put("requestedTests", "41"); }
    }

    @After public void tearDown() { TransactionSynchronizationManager.clear(); }
    private void set(String field, Object value) { ReflectionTestUtils.setField(reader, field, value); }
    private SampleTypeRequest request(int id, int sort) {
        var row = new SampleTypeRequest(); row.setId(id); row.setSample(sample); row.setSortOrder(sort);
        row.setTypeOfSample(type("31")); row.setRequestedTests("41"); row.setRequestedQuantity(1.0);
        row.setCreatedDate(SIM_TIME); return row;
    }
    private TypeOfSample type(String id) {
        var value = new TypeOfSample(); value.setId(id); value.setDescription("SIM-type"); return value;
    }
    private void status(String id, String kind) {
        var value = new StatusOfSample(); value.setId(id); value.setStatusType(kind);
        when(statuses.get(id)).thenReturn(value);
    }
    private SampleItem collect(int index, String id) {
        var item = new SampleItem(); item.setId(id); item.setSample(sample); item.setTypeOfSample(type("31"));
        item.setSortOrder("10"); item.setQuantity(0.5); item.setCollectionDate(SIM_TIME);
        item.setStatusId("12"); physical.add(item);
        var request = logical.get(index); request.setStatus(SampleTypeRequest.Status.COLLECTED); request.setSampleItem(item);
        when(analyses.getAnalysesBySampleItem(item)).thenReturn(new ArrayList<>(List.of(analysis("9" + id, item, "41"))));
        return item;
    }
    private Analysis analysis(String id, SampleItem item, String testId) {
        // Avoid unrelated display-name initialization in the legacy setter.
        var analysis = new Analysis(); analysis.setSampleTypeName("SIM-type");
        analysis.setId(id); analysis.setSampleItem(item); analysis.setStatusId("13");
        var test = new org.openelisglobal.test.valueholder.Test(); test.setId(testId); analysis.setTest(test);
        return analysis;
    }
    private EntryCurrentStateReader.Snapshot read() { return reader.read(original, "7"); }
    private void conflict() { assertEquals(409, assertThrows(EntrySubmissionException.class, this::read).getStatus()); }

    @Test public void pendingRequestsAreCurrentRowsWithNoInventedPhysicalItems() {
        var snapshot = read();
        assertEquals(3, snapshot.requestedSpecimens().size()); assertTrue(snapshot.physicalSpecimens().isEmpty());
        assertEquals("601", snapshot.patient().id()); assertTrue(snapshot.readOnly());
        verifyZeroInteractions(analyses);
        verify(requests, never()).getPendingRequestsBySampleId(any());
    }
    @Test public void sameTypePartialCollectionAndCancellationRemainDistinct() {
        collect(0, "801"); collect(1, "802"); logical.get(2).setStatus(SampleTypeRequest.Status.CANCELLED);
        var snapshot = read();
        assertEquals(List.of("COLLECTED", "COLLECTED", "CANCELLED"), snapshot.requestedSpecimens().stream().map(EntryCurrentStateReader.RequestView::status).toList());
        assertEquals(List.of("801", "802"), snapshot.physicalSpecimens().stream().map(EntryCurrentStateReader.SpecimenView::id).toList());
        assertEquals("701", snapshot.physicalSpecimens().get(0).requestId());
        assertEquals(SampleTypeRequest.Status.CANCELLED, logical.get(2).getStatus());
        assertFalse(original.toString().contains("COLLECTED"));
    }
    @Test public void actualQuantityAndUnitsAreNotReplacedByRequestedValues() {
        var item = collect(0, "801"); var unit = new UnitOfMeasure(); unit.setId("51"); item.setUnitOfMeasure(unit);
        var snapshot = read(); assertEquals(Double.valueOf(1), snapshot.requestedSpecimens().get(0).requestedQuantity());
        assertEquals(Double.valueOf(0.5), snapshot.physicalSpecimens().get(0).quantity());
        assertEquals("51", snapshot.physicalSpecimens().get(0).unitOfMeasureId());
        assertEquals("10", snapshot.physicalSpecimens().get(0).sortOrder());
    }
    @Test public void voidedRejectedAndCanceledAnalysisFactsAreNotFilteredOut() {
        var item = collect(0, "801"); item.setVoided(true); item.setRejected(true); status("14", "ANALYSIS");
        var canceled = analysis("901", item, "41"); canceled.setStatusId("14");
        when(analyses.getAnalysesBySampleItem(item)).thenReturn(List.of(canceled));
        var snapshot = read(); var tube = snapshot.physicalSpecimens().get(0);
        assertTrue(tube.voided()); assertTrue(tube.rejected()); assertEquals("14", tube.analyses().get(0).statusId());
        assertEquals("COLLECTED", snapshot.requestedSpecimens().get(0).status());
    }
    @Test public void repeatedTestAnalysesAndAdditionalTestsRemainDistinct() {
        var item = collect(0, "801");
        when(analyses.getAnalysesBySampleItem(item)).thenReturn(List.of(analysis("902", item, "41"), analysis("901", item, "41"), analysis("903", item, "42")));
        assertEquals(3, read().physicalSpecimens().get(0).analyses().size());
    }
    @Test public void newLogicalRequestsAreRetainedWithoutRemovingOriginalIdentities() {
        var additional = request(704, 6); additional.setRequestedTests("42"); logical.add(additional);
        assertEquals(4, read().requestedSpecimens().size());
    }
    @Test public void laterOrderStatusDoesNotConvertCollectedTubesBackToPending() {
        status("15", "ORDER"); sample.setStatusId("15"); collect(0, "801");
        var snapshot = read(); assertEquals("15", snapshot.orderStatusId());
        assertEquals("COLLECTED", snapshot.requestedSpecimens().get(0).status());
    }
    @Test public void missingOriginalRequestIsNotACompleteRead() { logical.remove(1); conflict(); }
    @Test public void duplicateLogicalIdentityIsRejected() {
        logical.get(1).setId(701); conflict();
    }
    @Test public void additionalRequestMayHaveTheSameDisplaySortWithAnIndependentIdentity() {
        logical.add(request(704, 0));
        assertEquals(List.of("701", "704", "702", "703"), read().requestedSpecimens().stream()
                .map(EntryCurrentStateReader.RequestView::id).toList());
    }
    @Test public void invalidRequestedTestListsAreNotCoercedOrDropped() {
        for (String tests : new String[]{"", "41,", "41,41", "041", "41,SIM-invalid"}) {
            logical.get(0).setRequestedTests(tests); conflict();
        }
    }
    @Test public void pendingOrCanceledRequestCannotOwnAPhysicalItem() {
        collect(0, "801"); logical.get(0).setStatus(SampleTypeRequest.Status.REQUESTED); conflict();
        logical.get(0).setStatus(SampleTypeRequest.Status.CANCELLED); conflict();
    }
    @Test public void collectedRequestRequiresActualPhysicalIdentity() {
        var item = collect(0, "801"); physical.clear(); conflict(); physical.add(item);
        logical.get(0).setSampleItem(null); conflict();
    }
    @Test public void differentRequestsCannotClaimTheSamePhysicalItem() {
        var item = collect(0, "801"); logical.get(1).setSampleItem(item); logical.get(1).setStatus(SampleTypeRequest.Status.COLLECTED); conflict();
    }
    @Test public void physicalWrongSampleOrTypeIsRejected() {
        var item = collect(0, "801"); var wrong = new Sample(); wrong.setId("302"); item.setSample(wrong); conflict();
        item.setSample(sample); item.setTypeOfSample(type("32")); conflict();
    }
    @Test public void unexpectedRootOrAliquotIsExplicitlyUnsupportedNotDiscarded() {
        var item = collect(0, "801"); logical.get(0).setSampleItem(null); logical.get(0).setStatus(SampleTypeRequest.Status.REQUESTED);
        assertEquals("ENTRY_CURRENT_STATE_UNSUPPORTED", assertThrows(EntrySubmissionException.class, this::read).getCode());
        logical.get(0).setSampleItem(item); logical.get(0).setStatus(SampleTypeRequest.Status.COLLECTED);
        var parent = new SampleItem(); parent.setId("800"); item.setParentSampleItem(parent);
        assertEquals("ENTRY_CURRENT_STATE_UNSUPPORTED", assertThrows(EntrySubmissionException.class, this::read).getCode());
    }
    @Test public void duplicatePhysicalAndAnalysisIdsAreRejected() {
        var item = collect(0, "801"); physical.add(item); conflict(); physical.remove(1);
        var a = analysis("901", item, "41"); when(analyses.getAnalysesBySampleItem(item)).thenReturn(List.of(a, a)); conflict();
    }
    @Test public void missingRequestedAnalysisDoesNotCountAsComplete() {
        var item = collect(0, "801"); when(analyses.getAnalysesBySampleItem(item)).thenReturn(List.of(analysis("901", item, "42"))); conflict();
    }
    @Test public void analysisForAnotherPhysicalItemIsRejected() {
        var item = collect(0, "801"); var other = new SampleItem(); other.setId("802");
        when(analyses.getAnalysesBySampleItem(item)).thenReturn(List.of(analysis("901", other, "41"))); conflict();
    }
    @Test public void unknownOrWrongCategoryStatusIsRejected() {
        var item = collect(0, "801"); item.setStatusId("99"); conflict(); item.setStatusId("13"); conflict();
    }
    @Test public void malformedQuantityIsNotSerializedAsAUsableNumber() {
        for (Double value : new Double[]{null, Double.NaN, Double.POSITIVE_INFINITY, -1.0, 0.0}) {
            logical.get(0).setRequestedQuantity(value); conflict();
        }
    }
    @Test public void currentPhysicalTestsNeedAuthorizationEvenIfAbsentFromOriginalReceipt() {
        var item = collect(0, "801"); when(analyses.getAnalysesBySampleItem(item)).thenReturn(List.of(analysis("901", item, "41"), analysis("902", item, "99")));
        assertThrows(AccessDeniedException.class, this::read);
    }
    @Test public void canceledCurrentRequestsStillNeedAuthorization() {
        logical.get(2).setRequestedTests("99"); logical.get(2).setStatus(SampleTypeRequest.Status.CANCELLED);
        assertThrows(AccessDeniedException.class, this::read);
    }
    @Test public void historicalTestsAlsoRemainInThePermissionUnion() {
        for (var row : logical) { row.setRequestedTests("42"); }
        when(users.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION)).thenReturn(List.of(new IdValuePair("42", "SIM-only-current")));
        assertThrows(AccessDeniedException.class, this::read);
    }
    @Test public void changedPatientDomainOrNumberDoesNotSilentlyRecoverAnotherContext() {
        link.setPatientId("699"); conflict(); link.setPatientId("601"); sample.setDomain("E"); conflict();
        sample.setDomain("H"); sample.setAccessionNumber("SIM-CHANGED"); conflict();
    }
    @Test public void danglingPatientOrAmbiguousLinksAreRejected() {
        when(patients.get("601")).thenReturn(null); conflict(); when(patients.get("601")).thenReturn(patient);
        when(links.getAllMatching("sampleId", "301")).thenReturn(List.of(link, link)); conflict();
    }
    @Test public void environmentAllowsExistingEmptyPatientLinkButNeverAnAssignedPatient() {
        original.remove("patientId"); original.put("workflowType", "environmental"); sample.setDomain("E"); link.setPatientId(null);
        assertNull(read().patient()); when(links.getAllMatching("sampleId", "301")).thenReturn(List.of()); assertNull(read().patient());
        when(links.getAllMatching("sampleId", "301")).thenReturn(List.of(link)); link.setPatientId("601"); conflict();
    }
    @Test public void missingSourceListsAreFailuresNotEmptySuccess() {
        when(items.getSampleItemsBySampleId("301")).thenReturn(null); conflict();
        when(items.getSampleItemsBySampleId("301")).thenReturn(physical); when(requests.getRequestsBySampleId("301")).thenReturn(null); conflict();
    }
    @Test public void readFailurePropagatesWithoutReturningPartialFacts() {
        var item = collect(0, "801"); when(analyses.getAnalysesBySampleItem(item)).thenThrow(new IllegalStateException("SIM-storage-unavailable"));
        assertThrows(IllegalStateException.class, this::read);
    }
    @Test public void detachedReturnedCollectionsCannotModifyTheSnapshotOrEntities() {
        var item = collect(0, "801"); var snapshot = read();
        assertThrows(UnsupportedOperationException.class, () -> snapshot.physicalSpecimens().clear());
        assertThrows(UnsupportedOperationException.class, () -> snapshot.requestedSpecimens().get(0).testIds().clear());
        item.setQuantity(99.0); logical.get(0).setRequestedTests("99");
        assertEquals(Double.valueOf(0.5), snapshot.physicalSpecimens().get(0).quantity());
        assertEquals(List.of("41"), snapshot.requestedSpecimens().get(0).testIds());
    }
    @Test public void defaultReadOrWriteContextCannotRunTheCurrentStateReader() {
        TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(java.sql.Connection.TRANSACTION_READ_COMMITTED);
        assertThrows(IllegalStateException.class, this::read); verifyZeroInteractions(samples);
        TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(java.sql.Connection.TRANSACTION_REPEATABLE_READ);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(false); assertThrows(IllegalStateException.class, this::read);
    }
    @Test public void patientBirthDateIsACalendarDateNotAPreviousUtcDay() {
        var zone = java.util.TimeZone.getDefault();
        try {
            java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Shanghai"));
            ReflectionTestUtils.setField(patient, "birthDate", Timestamp.valueOf("2000-01-02 00:00:00"));
            assertEquals("2000-01-02", read().patient().birthDate());
        } finally { java.util.TimeZone.setDefault(zone); }
    }
}

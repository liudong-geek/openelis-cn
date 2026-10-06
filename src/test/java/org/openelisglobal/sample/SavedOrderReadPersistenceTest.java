package org.openelisglobal.sample;

import static org.junit.Assert.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.sql.Date;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.barcode.valueholder.BarcodeLabelInfo;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.person.valueholder.Person;
import org.openelisglobal.provider.valueholder.Provider;
import org.openelisglobal.sample.dao.SavedOrderReadDAO;
import org.openelisglobal.sample.dao.SavedOrderReadDAO.Graph;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.valueholder.SampleHuman;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest.Status;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Production DAO HQL and actual relationships in the disposable PostgreSQL from
 * BaseTestConfig. This candidate uses existing DBUnit seeds plus rollback-only
 * JPA construction; it does not configure any application/demo datasource.
 */
public class SavedOrderReadPersistenceTest extends BaseWebContextSensitiveTest {
    private static final String ACCESSION = "24-00001";

    @Autowired
    private SavedOrderReadDAO orders;
    @Autowired
    private IStatusService statuses;
    @Autowired
    private PlatformTransactionManager transactions;
    @PersistenceContext
    private EntityManager em;

    @Before
    public void loadFixture() throws Exception {
        executeDataSetWithStateManagement("testdata/sample-management-status-contract.xml");
        resyncSequence("sample_seq", "sample");
        resyncSequence("sample_item_seq", "sample_item");
        resyncSequence("analysis_seq", "analysis");
        resyncSequence("test_seq", "test");
        resyncSequence("sample_type_request_seq", "sample_type_request");
        resyncSequence("person_seq", "person");
        resyncSequence("patient_seq", "patient");
        resyncSequence("provider_seq", "provider");
        resyncSequence("sample_human_seq", "sample_human");
        resyncSequence("barcode_label_info_seq", "barcode_label_info");
    }

    @Test
    public void multiplePhysicalItemsKeepEveryAnalysisStageAndPersistedExternalId() {
        inRollback(f -> {
            f.item.setExternalId("-1");
            SampleItem canceled = createItem(f.sample, "2", f.type, SampleStatus.Canceled, "CHG074-RAW-X2");
            canceled.setVoided(true);
            SampleItem rejected = createItem(f.sample, "3", f.type, SampleStatus.SampleRejected, null);
            rejected.setRejected(true);
            Analysis biological = createAnalysis(f.item, f.test, AnalysisStatus.BiologistRejected);
            Analysis technical = createAnalysis(canceled, f.test, AnalysisStatus.TechnicalAcceptance);
            Analysis canceledAnalysis = createAnalysis(canceled, f.test, AnalysisStatus.Canceled);
            Analysis finalized = createAnalysis(rejected, f.test, AnalysisStatus.Finalized);
            finalized.setPrintedDate(Date.valueOf("2024-03-01"));

            Sample other = createSample("24-000010");
            SampleItem otherItem = createItem(other, "1", f.type, SampleStatus.Entered, "OTHER-RAW");
            Analysis otherAnalysis = createAnalysis(otherItem, f.test, AnalysisStatus.NotStarted);
            createRequest(other, f.type, 1, Status.REQUESTED, null, f.test.getId());
            Patient otherPatient = createPatient("Other", "Patient");
            Provider otherProvider = createProvider("Other", "Provider");
            createHuman(other, otherPatient, otherProvider);
            flushAndClear();

            Graph graph = exact(ACCESSION);
            assertEquals(f.sample.getId(), graph.sample().getId());
            assertEquals(ACCESSION, graph.sample().getAccessionNumber());
            assertEquals(Set.of(f.item.getId(), canceled.getId(), rejected.getId()), itemIds(graph));
            assertEquals(Set.of(f.original.getId(), biological.getId(), technical.getId(), canceledAnalysis.getId(),
                    finalized.getId()), analysisIds(graph));
            assertFalse(analysisIds(graph).contains(otherAnalysis.getId()));
            assertEquals(5, graph.analyses().size());
            assertEquals(Set.of("1"), graph.patients().stream().map(Patient::getId).collect(Collectors.toSet()));
            assertEquals(Set.of("1"), graph.providers().stream().map(Provider::getId).collect(Collectors.toSet()));
            assertTrue(graph.requests().isEmpty());
            assertEquals("-1", item(graph, f.item.getId()).getExternalId());
            assertEquals("CHG074-RAW-X2", item(graph, canceled.getId()).getExternalId());
            assertNull("Missing saved externalId must stay missing", item(graph, rejected.getId()).getExternalId());
            assertTrue(item(graph, canceled.getId()).isVoided());
            assertTrue(item(graph, rejected.getId()).isRejected());
            Map<String, String> actualStates = graph.analyses().stream()
                    .collect(Collectors.toMap(Analysis::getId, Analysis::getStatusId));
            assertEquals(statuses.getStatusID(AnalysisStatus.NotStarted), actualStates.get(f.original.getId()));
            assertEquals(statuses.getStatusID(AnalysisStatus.BiologistRejected), actualStates.get(biological.getId()));
            assertEquals(statuses.getStatusID(AnalysisStatus.TechnicalAcceptance), actualStates.get(technical.getId()));
            assertEquals(statuses.getStatusID(AnalysisStatus.Canceled), actualStates.get(canceledAnalysis.getId()));
            assertEquals(statuses.getStatusID(AnalysisStatus.Finalized), actualStates.get(finalized.getId()));
        });
    }

    @Test
    public void collectedPendingAndCancelledRequestsCoexistWithPhysicalItems() {
        inRollback(f -> {
            SampleItem second = createItem(f.sample, "2", f.type, SampleStatus.Entered, "-2");
            SampleTypeRequest collected = createRequest(f.sample, f.type, 2, Status.COLLECTED, second, f.test.getId());
            SampleTypeRequest pending = createRequest(f.sample, f.type, 3, Status.REQUESTED, null, f.test.getId());
            SampleTypeRequest cancelled = createRequest(f.sample, f.type, 4, Status.CANCELLED, null, f.test.getId());
            flushAndClear();

            Graph graph = exact(ACCESSION);
            assertEquals(Set.of(f.item.getId(), second.getId()), itemIds(graph));
            assertEquals(Set.of(collected.getId(), pending.getId(), cancelled.getId()), requestIds(graph));
            assertEquals(List.of(collected.getId(), pending.getId(), cancelled.getId()),
                    graph.requests().stream().map(SampleTypeRequest::getId).toList());
            orders.refreshReadContext();
            SampleTypeRequest actualCollected = request(graph, collected.getId());
            assertEquals(Status.COLLECTED, actualCollected.getStatus());
            assertEquals(second.getId(), actualCollected.getSampleItem().getId());
            assertEquals(f.sample.getId(), actualCollected.getSample().getId());
            assertEquals(f.type.getId(), actualCollected.getTypeOfSample().getId());
            assertTrue(actualCollected.isFulfilled());
            assertEquals(Status.REQUESTED, request(graph, pending.getId()).getStatus());
            assertNull(request(graph, pending.getId()).getSampleItem());
            assertEquals(Status.CANCELLED, request(graph, cancelled.getId()).getStatus());
            assertNull(request(graph, cancelled.getId()).getSampleItem());
            assertEquals(f.test.getId(), request(graph, cancelled.getId()).getRequestedTests());
            assertNotNull(request(graph, cancelled.getId()).getCreatedDate());
        });
    }

    @Test
    public void exactOriginalNumberDoesNotMatchPrefixesTubeSuffixesOrUnknownNumbers() {
        inRollback(f -> {
            Sample nearPrefix = createSample("24-000010");
            createItem(nearPrefix, "1", f.type, SampleStatus.Entered, "NEAR-RAW");
            flushAndClear();

            assertEquals(f.sample.getId(), exact(ACCESSION).sample().getId());
            assertEquals(nearPrefix.getId(), exact("24-000010").sample().getId());
            for (String number : List.of("2400001", "24-00001.1", "24-0000", "24-00001 ", " 24-00001", "%24-00001%",
                    "UNKNOWN-CHG074")) {
                assertFalse("DAO must match the stored original number exactly", orders.loadExact(number).isPresent());
            }
        });
    }

    @Test
    public void refreshingTheReadContextLoadsCurrentVersionsAndPatientProviderAssociations() {
        inRollback(f -> {
            SampleItem replacementItem = createItem(f.sample, "2", f.type, SampleStatus.Entered, "SAVED-NEW-RAW");
            var replacementTest = createTest("CHG074 replacement", f.section);
            Patient replacementPatient = createPatient("新", "患者");
            Provider replacementProvider = createProvider("新", "医生");
            SampleTypeRequest pending = createRequest(f.sample, f.type, 2, Status.REQUESTED, null, f.test.getId());
            flushAndClear();

            Graph first = exact(ACCESSION);
            String sampleVersion = version(first.sample().getLastupdated());
            String analysisVersion = version(analysis(first, f.original.getId()).getLastupdated());
            String requestVersion = version(request(first, pending.getId()).getLastupdated());
            assertEquals("1", first.patients().get(0).getId());
            assertEquals("1", first.providers().get(0).getId());
            orders.refreshReadContext();

            Sample changedSample = em.find(Sample.class, f.sample.getId());
            changedSample.setClientReference("CHG074 changed");
            Analysis changedAnalysis = em.find(Analysis.class, f.original.getId());
            changedAnalysis.setSampleItem(em.find(SampleItem.class, replacementItem.getId()));
            changedAnalysis.setTest(em.find(org.openelisglobal.test.valueholder.Test.class, replacementTest.getId()));
            changedAnalysis.setStatusId(statuses.getStatusID(AnalysisStatus.Finalized));
            SampleTypeRequest changedRequest = em.find(SampleTypeRequest.class, pending.getId());
            changedRequest.setStatus(Status.COLLECTED);
            changedRequest.setSampleItem(em.find(SampleItem.class, replacementItem.getId()));
            changedRequest.setRequestedTests(replacementTest.getId());
            SampleHuman changedHuman = em.find(SampleHuman.class, "1");
            changedHuman.setPatientId(replacementPatient.getId());
            changedHuman.setProviderId(replacementProvider.getId());
            em.flush();
            orders.refreshReadContext();

            Graph current = exact(ACCESSION);
            assertNotSame(first.sample(), current.sample());
            assertNotEquals(sampleVersion, version(current.sample().getLastupdated()));
            assertNotEquals(analysisVersion, version(analysis(current, f.original.getId()).getLastupdated()));
            assertNotEquals(requestVersion, version(request(current, pending.getId()).getLastupdated()));
            assertEquals("CHG074 changed", current.sample().getClientReference());
            assertEquals(replacementItem.getId(), analysis(current, f.original.getId()).getSampleItem().getId());
            assertEquals(replacementTest.getId(), analysis(current, f.original.getId()).getTest().getId());
            assertEquals(statuses.getStatusID(AnalysisStatus.Finalized),
                    analysis(current, f.original.getId()).getStatusId());
            assertEquals(Status.COLLECTED, request(current, pending.getId()).getStatus());
            assertEquals(replacementItem.getId(), request(current, pending.getId()).getSampleItem().getId());
            assertEquals(replacementPatient.getId(), current.patients().get(0).getId());
            assertEquals(replacementProvider.getId(), current.providers().get(0).getId());
            orders.refreshReadContext();
            assertEquals("患者", current.patients().get(0).getPerson().getLastName());
            assertEquals("医生", current.providers().get(0).getPerson().getLastName());
        });
    }

    @Test
    public void repeatedReadsDoNotChangeDatabaseVersionsStatesAssociationsOrLabelCounts() {
        inRollback(f -> {
            f.item.setExternalId("-1");
            SampleItem second = createItem(f.sample, "2", f.type, SampleStatus.Canceled, "-2");
            second.setVoided(true);
            Analysis completed = createAnalysis(second, f.test, AnalysisStatus.Finalized);
            completed.setPrintedDate(Date.valueOf("2024-03-01"));
            createRequest(f.sample, f.type, 1, Status.COLLECTED, f.item, f.test.getId());
            createRequest(f.sample, f.type, 2, Status.CANCELLED, null, f.test.getId());
            createLabel("-1", 2);
            createLabel("-2", 4);
            flushAndClear();
            Map<String, List<List<String>>> before = databaseSnapshot();

            for (int i = 0; i < 2; i++) {
                Graph graph = exact(ACCESSION);
                assertEquals(2, graph.items().size());
                assertEquals(2, graph.analyses().size());
                assertEquals(2, graph.requests().size());
                assertEquals(Date.valueOf("2024-03-01"), analysis(graph, completed.getId()).getPrintedDate());
                assertEquals("-2", item(graph, second.getId()).getExternalId());
                em.flush();
                orders.refreshReadContext();
            }
            assertEquals("Reading must preserve the actual stored fields and relationships", before,
                    databaseSnapshot());
        });
    }

    @Test
    public void anUncollectedOrderWithoutHumanLinksDoesNotBorrowPhysicalOrPatientData() {
        inRollback(f -> {
            Sample uncollected = createSample("CHG074-PENDING");
            SampleTypeRequest pending = createRequest(uncollected, f.type, 1, Status.REQUESTED, null, f.test.getId());
            flushAndClear();

            Graph graph = exact("CHG074-PENDING");
            assertEquals(uncollected.getId(), graph.sample().getId());
            assertTrue(graph.items().isEmpty());
            assertTrue(graph.analyses().isEmpty());
            assertEquals(Set.of(pending.getId()), requestIds(graph));
            assertTrue(graph.patients().isEmpty());
            assertTrue(graph.providers().isEmpty());
            orders.refreshReadContext();
            assertEquals(uncollected.getId(), graph.requests().get(0).getSample().getId());
            assertEquals(f.type.getId(), graph.requests().get(0).getTypeOfSample().getId());
            assertNull(graph.requests().get(0).getSampleItem());
        });
    }

    private Graph exact(String number) {
        return orders.loadExact(number).orElseThrow(() -> new AssertionError("Expected the saved original number"));
    }

    private Set<String> itemIds(Graph graph) {
        return graph.items().stream().map(SampleItem::getId).collect(Collectors.toSet());
    }

    private Set<String> analysisIds(Graph graph) {
        return graph.analyses().stream().map(Analysis::getId).collect(Collectors.toSet());
    }

    private Set<Integer> requestIds(Graph graph) {
        return graph.requests().stream().map(SampleTypeRequest::getId).collect(Collectors.toSet());
    }

    private SampleItem item(Graph graph, String id) {
        return graph.items().stream().filter(row -> row.getId().equals(id)).findFirst().orElseThrow();
    }

    private Analysis analysis(Graph graph, String id) {
        return graph.analyses().stream().filter(row -> row.getId().equals(id)).findFirst().orElseThrow();
    }

    private SampleTypeRequest request(Graph graph, Integer id) {
        return graph.requests().stream().filter(row -> row.getId().equals(id)).findFirst().orElseThrow();
    }

    private String version(Timestamp timestamp) {
        assertNotNull("A persisted row must expose its actual version", timestamp);
        return timestamp.toInstant().toString();
    }

    private void flushAndClear() {
        em.flush();
        orders.refreshReadContext();
    }

    private void inRollback(Consumer<Fixture> assertions) {
        Map<String, List<List<String>>> baseline = new TransactionTemplate(transactions)
                .execute(tx -> databaseSnapshot());
        new TransactionTemplate(transactions).execute(tx -> {
            tx.setRollbackOnly();
            Fixture fixture = new Fixture();
            fixture.original.setTestSection(fixture.section);
            assertions.accept(fixture);
            return null;
        });
        new TransactionTemplate(transactions).execute(tx -> {
            assertEquals("All constructed fixture rows and relationship changes must roll back", baseline,
                    databaseSnapshot());
            return null;
        });
    }

    /**
     * Independent scalar HQL snapshots, re-read from PostgreSQL after flush/clear.
     */
    private Map<String, List<List<String>>> databaseSnapshot() {
        Map<String, List<List<String>>> snapshot = new TreeMap<>();
        snapshot.put("sample", scalars("select s.id, s.accessionNumber, s.lastupdated, s.statusId, s.clientReference, "
                + "s.priority from Sample s order by s.id"));
        snapshot.put("item", scalars("select si.id, s.id, si.sortOrder, si.externalId, si.lastupdated, si.statusId, "
                + "si.rejected, si.voided from SampleItem si left join si.sample s order by si.id"));
        snapshot.put("analysis", scalars("select a.id, si.id, t.id, ts.id, a.lastupdated, a.statusId, a.printedDate, "
                + "a.completedDate, a.releasedDate from Analysis a left join a.sampleItem si left join a.test t "
                + "left join a.testSection ts order by a.id"));
        snapshot.put("request", scalars("select r.id, s.id, tos.id, si.id, r.sortOrder, r.status, r.lastupdated, "
                + "r.createdDate, r.requestedTests, r.requestedPanels from SampleTypeRequest r left join r.sample s "
                + "left join r.typeOfSample tos left join r.sampleItem si order by r.id"));
        snapshot.put("human", scalars("select sh.id, sh.sampleId, sh.patientId, sh.providerId, sh.lastupdated "
                + "from SampleHuman sh order by sh.id"));
        snapshot.put("patient", scalars(
                "select p.id, person.id, p.lastupdated from Patient p " + "left join p.person person order by p.id"));
        snapshot.put("provider", scalars(
                "select p.id, person.id, p.lastupdated from Provider p " + "left join p.person person order by p.id"));
        snapshot.put("person",
                scalars("select p.id, p.firstName, p.lastName, p.lastupdated from Person p order by p.id"));
        snapshot.put("label", scalars(
                "select b.id, b.code, b.type, b.numPrinted, b.lastupdated " + "from BarcodeLabelInfo b order by b.id"));
        snapshot.put("historyCount", List.of(
                List.of(em.createQuery("select count(h) from History h", Long.class).getSingleResult().toString())));
        return snapshot;
    }

    private List<List<String>> scalars(String hql) {
        List<List<String>> snapshot = new ArrayList<>();
        for (Object[] row : em.createQuery(hql, Object[].class).getResultList()) {
            snapshot.add(Arrays.stream(row).map(value -> value instanceof Timestamp ? version((Timestamp) value)
                    : value == null ? null : value.toString()).toList());
        }
        return snapshot;
    }

    private Sample createSample(String number) {
        Sample sample = new Sample();
        sample.setAccessionNumber(number);
        sample.setDomain("H");
        sample.setEnteredDate(Date.valueOf("2024-02-12"));
        sample.setReceivedTimestamp(Timestamp.valueOf("2024-02-12 10:00:00"));
        sample.setStatusId(statuses.getStatusID(SampleStatus.Entered));
        sample.setPriority(OrderPriority.ROUTINE);
        sample.setSysUserId(TEST_SYS_USER_ID);
        em.persist(sample);
        return sample;
    }

    private SampleItem createItem(Sample sample, String sortOrder, TypeOfSample type, SampleStatus status,
            String externalId) {
        SampleItem item = new SampleItem();
        item.setSample(sample);
        item.setSortOrder(sortOrder);
        item.setTypeOfSample(type);
        item.setStatusId(statuses.getStatusID(status));
        item.setExternalId(externalId);
        em.persist(item);
        return item;
    }

    private Analysis createAnalysis(SampleItem item, org.openelisglobal.test.valueholder.Test test,
            AnalysisStatus status) {
        Analysis analysis = new Analysis();
        analysis.setSampleItem(item);
        analysis.setTest(test);
        analysis.setTestSection(test.getTestSection());
        analysis.setAnalysisType("MANUAL");
        analysis.setStatusId(statuses.getStatusID(status));
        analysis.setIsReportable("Y");
        em.persist(analysis);
        return analysis;
    }

    private org.openelisglobal.test.valueholder.Test createTest(String name, TestSection section) {
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setDescription(name);
        test.setName(name);
        test.setGuid(UUID.randomUUID().toString());
        test.setIsActive("Y");
        test.setIsReportable("Y");
        test.setTestSection(section);
        em.persist(test);
        return test;
    }

    private SampleTypeRequest createRequest(Sample sample, TypeOfSample type, int sortOrder, Status status,
            SampleItem collectedItem, String testIds) {
        SampleTypeRequest request = new SampleTypeRequest();
        request.setSample(sample);
        request.setTypeOfSample(type);
        request.setSortOrder(sortOrder);
        request.setStatus(status);
        request.setSampleItem(collectedItem);
        request.setRequestedTests(testIds);
        request.setCreatedDate(Timestamp.valueOf("2024-02-12 10:00:00"));
        em.persist(request);
        return request;
    }

    private Person createPerson(String first, String last) {
        Person person = new Person();
        person.setFirstName(first);
        person.setLastName(last);
        em.persist(person);
        return person;
    }

    private Patient createPatient(String first, String last) {
        Patient patient = new Patient();
        patient.setPerson(createPerson(first, last));
        em.persist(patient);
        return patient;
    }

    private Provider createProvider(String first, String last) {
        Provider provider = new Provider();
        provider.setPerson(createPerson(first, last));
        provider.setProviderType("P");
        em.persist(provider);
        return provider;
    }

    private void createHuman(Sample sample, Patient patient, Provider provider) {
        SampleHuman human = new SampleHuman();
        human.setSampleId(sample.getId());
        human.setPatientId(patient.getId());
        human.setProviderId(provider.getId());
        em.persist(human);
    }

    private void createLabel(String savedCode, int printed) {
        BarcodeLabelInfo label = new BarcodeLabelInfo();
        label.setCode(savedCode);
        label.setType("specimen");
        label.setNumPrinted(printed);
        em.persist(label);
    }

    private final class Fixture {
        final Sample sample = em.find(Sample.class, "1");
        final SampleItem item = em.find(SampleItem.class, "1");
        final TypeOfSample type = em.find(TypeOfSample.class, "1");
        final org.openelisglobal.test.valueholder.Test test = em.find(org.openelisglobal.test.valueholder.Test.class,
                "1");
        final TestSection section = em.find(TestSection.class, "1");
        final Analysis original = em.find(Analysis.class, "1");
    }
}

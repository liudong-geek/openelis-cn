package org.openelisglobal.qaevent;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.patientidentity.valueholder.PatientIdentity;
import org.openelisglobal.patientidentitytype.valueholder.PatientIdentityType;
import org.openelisglobal.qaevent.dao.NceWorkspaceDAO;
import org.openelisglobal.qaevent.form.NceActionCommand;
import org.openelisglobal.qaevent.form.NceRegistrationCommand;
import org.openelisglobal.qaevent.form.NceRegistrationCommand.LinkedSpecimen;
import org.openelisglobal.qaevent.form.NceWorkspaceResponse.Receipt;
import org.openelisglobal.qaevent.service.NceRegistrationFileStore;
import org.openelisglobal.qaevent.service.NceWorkspaceAccess;
import org.openelisglobal.qaevent.service.NceWorkspaceAccess.Scope;
import org.openelisglobal.qaevent.service.NceWorkspaceException;
import org.openelisglobal.qaevent.service.NceWorkspaceService;
import org.openelisglobal.qaevent.valueholder.NcEvent;
import org.openelisglobal.qaevent.valueholder.NceCategory;
import org.openelisglobal.sample.dao.SavedOrderReadDAO;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Actual PostgreSQL service transactions, HQL associations and independent
 * competing connections.
 */
public class NceWorkspacePersistenceTest extends BaseWebContextSensitiveTest {
    @Autowired
    private NceWorkspaceService service;
    @Autowired
    private NceWorkspaceDAO dao;
    @Autowired
    private SavedOrderReadDAO orders;
    @Autowired
    private PlatformTransactionManager transactions;
    @PersistenceContext
    private EntityManager em;
    private Object target, originalAccess, originalFiles;
    private NceWorkspaceAccess access;
    private NceRegistrationFileStore store;
    private Path directory;
    private String categoryId;
    private String moduleId;
    private final Set<String> keys = java.util.concurrent.ConcurrentHashMap.newKeySet();
    private Map<String, Long> before;
    private final List<PatientIdentity> identityFixtures = new ArrayList<>();
    private String originalNationalId;
    private LinkedSpecimen secondOwner;

    @Before
    public void setup() throws Exception {
        executeDataSetWithStateManagement("testdata/sample-management-status-contract.xml");
        for (String[] pair : List.of(new String[] { "sample_seq", "sample" },
                new String[] { "sample_item_seq", "sample_item" }, new String[] { "analysis_seq", "analysis" },
                new String[] { "nc_event_id_seq", "nc_event" }, new String[] { "nce_specimen_id_seq", "nce_specimen" },
                new String[] { "nce_history_id_seq", "nce_history" },
                new String[] { "nce_attachment_seq", "nce_attachment" },
                new String[] { "nce_category_id_seq", "nce_category" }))
            resyncSequence(pair[0], pair[1]);
        new TransactionTemplate(transactions).execute(status -> {
            var original = em.find(Analysis.class, "1");
            original.setTestSection(original.getTest().getTestSection());
            var patient = em.find(org.openelisglobal.patient.valueholder.Patient.class, "1");
            originalNationalId = patient.getNationalId();
            var category = new NceCategory();
            category.setName("CHG075 isolated general");
            category.setDisplayKey("nce.category.general");
            category.setActive(true);
            em.persist(category);
            em.flush();
            categoryId = category.getId().toString();
            var modules = em
                    .createQuery("from SystemModule m where m.systemModuleName='NonConformity'", SystemModule.class)
                    .getResultList();
            assertFalse("Existing NonConformity mapping is required, not a new role policy", modules.isEmpty());
            moduleId = modules.get(0).getId();
            return null;
        });
        directory = Files.createTempDirectory("chg075-pg-attachments-");
        store = new NceRegistrationFileStore(directory.toString());
        target = AopTestUtils.getUltimateTargetObject(service);
        originalAccess = ReflectionTestUtils.getField(target, "access");
        originalFiles = ReflectionTestUtils.getField(target, "files");
        access = mock(NceWorkspaceAccess.class);
        when(access.bind(any(), any())).thenAnswer(invocation -> {
            var request = (MockHttpServletRequest) invocation.getArgument(0);
            var actor = NceWorkspaceTestSupport.actor(request, "1");
            var module = em.find(SystemModule.class, moduleId);
            return new Scope(actor, module, invocation.getArgument(1), List.of("5"), Set.of("1"), false);
        });
        when(access.allowed(any(), any(), any())).thenReturn(true);
        when(access.forAction(any(), any(), any())).thenAnswer(i -> i.getArgument(1));
        ReflectionTestUtils.setField(target, "access", access);
        ReflectionTestUtils.setField(target, "files", store);
        before = counts();
    }

    @After
    public void cleanup() throws Exception {
        if (target != null) {
            ReflectionTestUtils.setField(target, "access", originalAccess);
            ReflectionTestUtils.setField(target, "files", originalFiles);
        }
        new TransactionTemplate(transactions).execute(status -> {
            if (!keys.isEmpty()) {
                var ids = em.createQuery(
                        "select r.eventId from NceRegistrationReceipt r where r.id in :keys and r.eventId is not null",
                        Integer.class).setParameter("keys", keys).getResultList();
                em.createQuery("delete from NceRegistrationReceipt r where r.id in :keys").setParameter("keys", keys)
                        .executeUpdate();
                if (!ids.isEmpty()) {
                    for (String entity : List.of("NceAttachment", "NceHistory", "NceSpecimen"))
                        em.createQuery("delete from " + entity + " x where x.nceId in :ids").setParameter("ids", ids)
                                .executeUpdate();
                    em.createQuery("delete from NcEvent e where e.id in :ids").setParameter("ids", ids).executeUpdate();
                }
            }
            for (var identity : identityFixtures) {
                var managed = em.find(PatientIdentity.class, identity.getId());
                if (managed != null)
                    em.remove(managed);
            }
            var patient = em.find(org.openelisglobal.patient.valueholder.Patient.class, "1");
            if (patient != null)
                patient.setNationalId(originalNationalId);
            if (secondOwner != null) {
                var a = em.find(Analysis.class, secondOwner.analysisId());
                if (a != null)
                    em.remove(a);
                em.flush();
                var item = em.find(SampleItem.class, secondOwner.sampleItemId());
                if (item != null)
                    em.remove(item);
                em.flush();
                var sample = em.find(Sample.class, secondOwner.sampleId());
                if (sample != null)
                    em.remove(sample);
            }
            if (categoryId != null) {
                var c = em.find(NceCategory.class, Integer.valueOf(categoryId));
                if (c != null)
                    em.remove(c);
            }
            return null;
        });
        if (directory != null)
            try (Stream<Path> paths = Files.walk(directory)) {
                for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList())
                    Files.deleteIfExists(path);
            }
        keys.clear();
    }

    private NceRegistrationCommand command(List<LinkedSpecimen> links) {
        return command(UUID.randomUUID().toString(), links);
    }

    private NceRegistrationCommand command(String key, List<LinkedSpecimen> links) {
        keys.add(key);
        return new NceRegistrationCommand(key, "1", "2026-10-06", "1", "Complete isolated event", "Description",
                "Immediate", "Cause", "Proposed", "MAJOR", categoryId, null, links);
    }

    private List<LinkedSpecimen> links() {
        return new TransactionTemplate(transactions).execute(status -> {
            var graph = orders.loadExact("24-00001").orElseThrow();
            var a = graph.analyses().get(0);
            var item = a.getSampleItem();
            return List.of(new LinkedSpecimen(graph.sample().getId(), graph.sample().getAccessionNumber(),
                    graph.sample().getLastupdated().toString(), item.getId(), item.getLastupdated().toString(),
                    a.getId(), a.getLastupdated().toString()));
        });
    }

    private Receipt create(NceRegistrationCommand c) {
        return service.create(c, List.of(), new MockHttpServletRequest());
    }

    private Map<String, Long> counts() {
        return new TransactionTemplate(transactions).execute(status -> {
            Map<String, Long> result = new java.util.TreeMap<>();
            for (String name : List.of("NcEvent", "NceSpecimen", "NceHistory", "NceAttachment",
                    "NceRegistrationReceipt"))
                result.put(name, em.createQuery("select count(x) from " + name + " x", Long.class).getSingleResult());
            return result;
        });
    }

    private long files() {
        try (var paths = Files.walk(directory)) {
            return paths.filter(Files::isRegularFile).count();
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    @Test
    public void committedRegistrationKeepsAllRealLinksFilesAndStrictDate() throws Exception {
        var first = links().get(0);
        var second = new TransactionTemplate(transactions).execute(status -> {
            var sample = new Sample();
            sample.setAccessionNumber("CHG075-OTHER");
            sample.setStatusId(em.find(Sample.class, first.sampleId()).getStatusId());
            sample.setPriority(OrderPriority.ROUTINE);
            sample.setDomain("H");
            sample.setEnteredDate(java.sql.Date.valueOf("2024-02-12"));
            sample.setReceivedTimestamp(Timestamp.valueOf("2024-02-12 10:00:00"));
            em.persist(sample);
            var oldItem = em.find(SampleItem.class, first.sampleItemId());
            var item = new SampleItem();
            item.setSample(sample);
            item.setSortOrder("1");
            item.setTypeOfSample(oldItem.getTypeOfSample());
            item.setStatusId(oldItem.getStatusId());
            item.setExternalId("raw-other");
            em.persist(item);
            var original = em.find(Analysis.class, first.analysisId());
            var a = new Analysis();
            a.setSampleItem(item);
            a.setTest(original.getTest());
            a.setTestSection(original.getTestSection());
            a.setStatusId(original.getStatusId());
            a.setAnalysisType("MANUAL");
            a.setIsReportable("Y");
            em.persist(a);
            em.flush();
            return new LinkedSpecimen(sample.getId(), sample.getAccessionNumber(), sample.getLastupdated().toString(),
                    item.getId(), item.getLastupdated().toString(), a.getId(), a.getLastupdated().toString());
        });
        secondOwner = second;
        var c = command(List.of(first, second));
        var response = service.create(c,
                List.of(new MockMultipartFile("files", "one.txt", "text/plain", new byte[] { 1 }),
                        new MockMultipartFile("files", "two.txt", "text/plain", new byte[] { 2, 3 })),
                new MockHttpServletRequest());
        assertEquals("APPLIED", response.outcome());
        assertEquals(2, response.linkedSpecimens().size());
        assertEquals(2, response.attachments().size());
        assertEquals(2, files());
        assertTrue(response.nceNumber().matches("NCE-[0-9]{4}-[0-9]{5}"));
        new TransactionTemplate(transactions).execute(status -> {
            var event = em.find(NcEvent.class, Integer.valueOf(response.eventId()));
            assertEquals("2026-10-06", event.getDateOfEvent().toString());
            assertNull("Multi-order summary must not lie about the first accession", event.getLabOrderNumber());
            assertEquals(2, dao.links(event.getId()).size());
            return null;
        });
        assertSameReceiptJson(response, service.receipt(c.requestId(), "CREATE", new MockHttpServletRequest()));
    }

    @Test
    public void ordinaryLateFileFailureRollsBackEveryRecordAndNewFile() {
        ReflectionTestUtils.setField(target, "files", new NceRegistrationFileStore(directory.toString()) {
            @Override
            public List<Path> store(int id, List<Upload> uploads) {
                super.store(id, uploads);
                throw new NceWorkspaceException(503, "ISOLATED_LATE_FILE_FAILURE");
            }
        });
        var c = command(links());
        assertThrows(NceWorkspaceException.class,
                () -> service.create(c,
                        List.of(new MockMultipartFile("files", "first.txt", "text/plain", new byte[] { 1 }),
                                new MockMultipartFile("files", "second.txt", "text/plain", new byte[] { 2 })),
                        new MockHttpServletRequest()));
        assertEquals(before, counts());
        assertEquals(0, files());
        assertEquals("NOT_FOUND", service.receipt(c.requestId(), "CREATE", new MockHttpServletRequest()).outcome());
    }

    @Test
    public void lateAuthorizationFailureHasNoCommittedBusinessOrReceiptRows() {
        var c = command(links());
        doThrow(new AccessDeniedException("isolated revoke")).when(access).requireUnchanged(any(), any());
        assertThrows(AccessDeniedException.class, () -> create(c));
        assertEquals(before, counts());
        assertEquals(0, files());
    }

    @Test
    public void wrongActualAnalysisAndChangedVersionRefuseWithoutPartialRows() {
        var valid = links().get(0);
        var wrong = new LinkedSpecimen(valid.sampleId(), valid.labNumber(), valid.sampleLastupdated(),
                valid.sampleItemId(), valid.lastupdated(), "2147483647", valid.analysisLastupdated());
        assertThrows(NceWorkspaceException.class, () -> create(command(List.of(wrong))));
        var stale = new LinkedSpecimen(valid.sampleId(), valid.labNumber(), "2000-01-01 00:00:00.0",
                valid.sampleItemId(), valid.lastupdated(), valid.analysisId(), valid.analysisLastupdated());
        assertThrows(NceWorkspaceException.class, () -> create(command(List.of(stale))));
        assertEquals(before, counts());
    }

    @Test
    public void durableSameKeyReplayAndChangedPayloadRemainDistinguished() {
        var c = command(links());
        var saved = create(c);
        assertEquals(saved, create(c));
        var changed = new NceRegistrationCommand(c.requestId(), "1", "2026-10-07", "1", c.title(), c.description(),
                c.immediateAction(), c.suspectedCauses(), c.proposedAction(), c.severity(), categoryId, null,
                c.linkedSpecimens());
        assertThrows(NceWorkspaceException.class, () -> create(changed));
        assertEquals(before.get("NcEvent").longValue() + 1, counts().get("NcEvent").longValue());
        assertEquals(before.get("NceRegistrationReceipt").longValue() + 1,
                counts().get("NceRegistrationReceipt").longValue());
    }

    @Test
    public void concurrentSameKeyHasOneCommittedEventAndOriginalReceipt() throws Exception {
        var c = command(links());
        var results = compete(() -> sameKey(c), () -> sameKey(c));
        assertEquals(results.get(0), results.get(1));
        assertEquals(before.get("NcEvent").longValue() + 1, counts().get("NcEvent").longValue());
        assertEquals(before.get("NceRegistrationReceipt").longValue() + 1,
                counts().get("NceRegistrationReceipt").longValue());
    }

    private Receipt sameKey(NceRegistrationCommand c) {
        try {
            return create(c);
        } catch (NceWorkspaceException.ClaimCollision collision) {
            var found = service.receipt(c.requestId(), "CREATE", new MockHttpServletRequest());
            assertEquals("APPLIED", found.outcome());
            assertEquals(collision.requestHash(), found.requestHash());
            return found;
        }
    }

    @Test
    public void concurrentDistinctKeysAllocateDistinctOriginalFormatNumbers() throws Exception {
        var first = command(links());
        var second = command(first.linkedSpecimens());
        var results = compete(() -> create(first), () -> create(second));
        assertNotEquals(results.get(0).eventId(), results.get(1).eventId());
        assertNotEquals(results.get(0).nceNumber(), results.get(1).nceNumber());
        assertEquals(before.get("NcEvent").longValue() + 2, counts().get("NcEvent").longValue());
    }

    private List<Receipt> compete(Callable<Receipt> first, Callable<Receipt> second) throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            List<java.util.concurrent.Future<Receipt>> futures = new ArrayList<>();
            for (var action : List.of(first, second))
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    if (!start.await(10, TimeUnit.SECONDS))
                        throw new AssertionError("barrier");
                    return action.call();
                }));
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            return List.of(futures.get(0).get(30, TimeUnit.SECONDS), futures.get(1).get(30, TimeUnit.SECONDS));
        } finally {
            start.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));
        }
    }

    @Test
    public void everyNoteAndSameAssignmentAdvanceRealEventVersionAndLateRequest409() {
        var saved = create(command(List.of()));
        String noteKey = UUID.randomUUID().toString();
        keys.add(noteKey);
        var note = service.action(saved.eventId(),
                new NceActionCommand(noteKey, "1", saved.lastupdated(), "ADD_NOTE", "A real note", null),
                new MockHttpServletRequest());
        assertNotEquals(saved.lastupdated(), note.lastupdated());
        assertEquals("Pending", note.statusCode());
        String assignKey = UUID.randomUUID().toString();
        keys.add(assignKey);
        var assigned = service.action(saved.eventId(),
                new NceActionCommand(assignKey, "1", note.lastupdated(), "ASSIGN", null, "1"),
                new MockHttpServletRequest());
        String sameKey = UUID.randomUUID().toString();
        keys.add(sameKey);
        var same = service.action(saved.eventId(),
                new NceActionCommand(sameKey, "1", assigned.lastupdated(), "ASSIGN", null, "1"),
                new MockHttpServletRequest());
        assertNotEquals(assigned.lastupdated(), same.lastupdated());
        String late = UUID.randomUUID().toString();
        keys.add(late);
        var fail = assertThrows(NceWorkspaceException.class,
                () -> service.action(saved.eventId(),
                        new NceActionCommand(late, "1", note.lastupdated(), "ACKNOWLEDGE", null, null),
                        new MockHttpServletRequest()));
        assertEquals(409, fail.status());
    }

    @Test
    public void realStSubjectIdentityAndNationalIdSearchUseActualTypesWithoutReadWrites() {
        new TransactionTemplate(transactions).execute(status -> {
            for (String type : List.of("ST", "SUBJECT")) {
                var rows = em
                        .createQuery("from PatientIdentityType t where t.identityType=:type", PatientIdentityType.class)
                        .setParameter("type", type).getResultList();
                assertFalse(rows.isEmpty());
                var identity = new PatientIdentity();
                identity.setPatientId("1");
                identity.setIdentityTypeId(rows.get(0).getId());
                identity.setIdentityData("CHG075-" + type + "-number");
                em.persist(identity);
                identityFixtures.add(identity);
            }
            var p = em.find(org.openelisglobal.patient.valueholder.Patient.class, "1");
            p.setNationalId("CHG075-national-number");
            em.flush();
            return null;
        });
        var initial = counts();
        for (String value : List.of("ST-number", "SUBJECT-number", "national-number")) {
            var found = service.orders("STNumber", value, 1, 10, new MockHttpServletRequest());
            assertEquals(1, found.paging().totalResults());
            assertEquals("24-00001", found.orders().get(0).get("labNumber"));
        }
        assertEquals(initial, counts());
        assertEquals(0, files());
    }

    @Test
    public void requestedOwnerWithoutAnyAnalysisRemainsARealCandidateOutsideItsReportingUnit() {
        var initial = counts();
        new TransactionTemplate(transactions).execute(status -> {
            status.setRollbackOnly();
            var original = em.find(Analysis.class, "1");
            em.remove(original);
            em.flush();
            var sample = em.find(Sample.class, "1");
            var item = em.find(SampleItem.class, "1");
            var section = new org.openelisglobal.test.valueholder.TestSection();
            section.setTestSectionName("CHG075 req-only");
            section.setDescription("Isolated test unit");
            section.setIsActive("Y");
            section.setLocalization(
                    em.find(org.openelisglobal.test.valueholder.TestSection.class, "1").getLocalization());
            em.persist(section);
            var request = new org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest();
            request.setSample(sample);
            request.setTypeOfSample(item.getTypeOfSample());
            request.setRequestedTests("1");
            request.setStatus(org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest.Status.REQUESTED);
            request.setCreatedDate(new Timestamp(System.currentTimeMillis()));
            em.persist(request);
            var event = new NcEvent();
            event.setReportingUnitId(Integer.valueOf(section.getId()));
            event.setStatus("Pending");
            event.setNceNumber("PG-REQ-" + UUID.randomUUID().toString().substring(0, 8));
            em.persist(event);
            em.flush();
            var link = new org.openelisglobal.qaevent.valueholder.NceSpecimen();
            link.setNceId(event.getId());
            link.setSampleItemId(Integer.valueOf(item.getId()));
            em.persist(link);
            em.flush();
            em.clear();
            var graph = orders.loadExact("24-00001").orElseThrow();
            assertTrue(graph.analyses().isEmpty());
            assertEquals(1, graph.requests().size());
            assertEquals("1", graph.requests().get(0).getRequestedTests());
            assertTrue("The coarse query must include actual requested-test owners for the service scope recheck",
                    dao.candidates(Set.of("1")).stream().anyMatch(e -> e.getId().equals(event.getId())));
            return null;
        });
        assertEquals(initial, counts());
    }

    @Test
    public void sameKeyFileByteOrOrderChangesCannotReplayAndLeaveAllRecordsAndFilesUnchanged() {
        var c = command(links());
        var first = new MockMultipartFile("files", "same.txt", "text/plain", new byte[] { 1, 2 });
        var second = new MockMultipartFile("files", "other.txt", "text/plain", new byte[] { 3, 4 });
        var applied = service.create(c, List.of(first, second), new MockHttpServletRequest());
        var committed = counts();
        assertEquals(2, files());
        var changed = new MockMultipartFile("files", "same.txt", "text/plain", new byte[] { 2, 1 });
        var bytes = assertThrows(NceWorkspaceException.class,
                () -> service.create(c, List.of(changed, second), new MockHttpServletRequest()));
        assertEquals(409, bytes.status());
        assertEquals("NCE_REQUEST_REPLAY_MISMATCH", bytes.code());
        var order = assertThrows(NceWorkspaceException.class,
                () -> service.create(c, List.of(second, first), new MockHttpServletRequest()));
        assertEquals(409, order.status());
        assertEquals("NCE_REQUEST_REPLAY_MISMATCH", order.code());
        assertEquals(committed, counts());
        assertEquals(2, files());
        assertSameReceiptJson(applied, service.receipt(c.requestId(), "CREATE", new MockHttpServletRequest()));
    }

    // The HTTP/receipt contract is JSON. Untyped Map numeric values deserialize as
    // Integer while persisted attachment sizes are Long; compare every wire field.
    private static void assertSameReceiptJson(Receipt expected, Receipt actual) {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        try {
            assertEquals("The complete receipt wire JSON must remain identical", mapper.writeValueAsString(expected),
                    mapper.writeValueAsString(actual));
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new AssertionError("Receipt JSON must serialize", error);
        }
    }
}

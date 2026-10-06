package org.openelisglobal.workplan;

import static org.junit.Assert.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.sql.Date;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analysis.dao.AnalysisDAO;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.OrderStatus;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.panel.valueholder.Panel;
import org.openelisglobal.panelitem.service.PanelItemService;
import org.openelisglobal.panelitem.valueholder.PanelItem;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.statusofsample.valueholder.StatusOfSample;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Exercises the production HQL against the disposable PostgreSQL configured by
 * BaseTestConfig. Additional relationships are created through JPA and always
 * rolled back; no application or demonstration datasource is configured here.
 */
public class WorkplanQueryPersistenceTest extends BaseWebContextSensitiveTest {
    @Autowired
    private AnalysisDAO analyses;
    @Autowired
    private PanelItemService panelItems;
    @Autowired
    private IStatusService statuses;
    @Autowired
    private PlatformTransactionManager transactions;
    @PersistenceContext
    private EntityManager em;

    @Before
    public void loadFixture() throws Exception {
        executeDataSetWithStateManagement("testdata/sample-management-status-contract.xml");
        resyncSequence("analysis_seq", "analysis");
        resyncSequence("sample_seq", "sample");
        resyncSequence("sample_item_seq", "sample_item");
        resyncSequence("test_seq", "test");
        resyncSequence("test_section_seq", "test_section");
        resyncSequence("panel_seq", "panel");
        resyncSequence("panel_item_seq", "panel_item");
    }

    @Test
    public void testAndRealPanelMembershipIntersectionCountEachAnalysisOnce() {
        inRollback(f -> {
            var gb = createTest("GB", f.section);
            var hb = createTest("Hb", f.section);
            Analysis secondGlucose = createAnalysis(f.item, f.test, AnalysisStatus.NotStarted);
            Analysis gbAnalysis = createAnalysis(f.item, gb, AnalysisStatus.NotStarted);
            createAnalysis(f.item, hb, AnalysisStatus.NotStarted);
            Panel panel = new Panel();
            panel.setPanelName("CHG073 panel");
            panel.setDescription("CHG073 real membership");
            panel.setLocalization(em.find(Localization.class, "1"));
            em.persist(panel);
            addPanelItem(panel, f.test, "1");
            addPanelItem(panel, gb, "2");
            flushAndClear();

            Set<String> membership = panelItems.getPanelItemsForPanel(panel.getId()).stream()
                    .map(item -> item.getTest().getId()).collect(Collectors.toSet());
            assertEquals(Set.of(f.test.getId(), gb.getId()), membership);
            Set<String> visibleTests = Set.of(f.test.getId(), gb.getId(), hb.getId());
            membership.retainAll(visibleTests);
            assertRows(3, Set.of(f.original.getId(), secondGlucose.getId(), gbAnalysis.getId()), membership, null,
                    null);
            assertRows(2, Set.of(f.original.getId(), secondGlucose.getId()), Set.of(f.test.getId()), null, null);
            membership.retainAll(Set.of(f.test.getId()));
            assertRows(2, Set.of(f.original.getId(), secondGlucose.getId()), membership, null, null);
        });
    }

    @Test
    public void unitKeepsPartialNfsOrdinaryTestsAndFinalSampleGroup() {
        inRollback(f -> {
            var gb = createTest("GB", f.section);
            var hb = createTest("Hb", f.section);
            Analysis gbAnalysis = createAnalysis(f.item, gb, AnalysisStatus.NotStarted);
            Analysis ordinaryAfterNfs = createAnalysis(f.item, f.test, AnalysisStatus.NotStarted);
            Analysis hbAnalysis = createAnalysis(f.item, hb, AnalysisStatus.NotStarted);
            Sample lastSample = createSample("CHG073-Z-LAST", OrderPriority.ROUTINE);
            SampleItem lastItem = createItem(lastSample, "1", f.item);
            Analysis finalNfs = createAnalysis(lastItem, gb, AnalysisStatus.NotStarted);
            Analysis finalOrdinary = createAnalysis(lastItem, f.test, AnalysisStatus.NotStarted);
            TestSection otherSection = createSection("CHG073 other");
            var otherTest = createTest("CHG073 other test", otherSection);
            createAnalysis(f.item, otherTest, AnalysisStatus.NotStarted);
            flushAndClear();

            Set<String> scope = Set.of(f.test.getId(), gb.getId(), hb.getId(), otherTest.getId());
            Set<String> expected = Set.of(f.original.getId(), gbAnalysis.getId(), ordinaryAfterNfs.getId(),
                    hbAnalysis.getId(), finalNfs.getId(), finalOrdinary.getId());
            assertRows(6, expected, scope, f.section.getId(), null);
            assertRows(2, Set.of(gbAnalysis.getId(), finalNfs.getId()), Set.of(gb.getId()), f.section.getId(), null);
            assertRows(0, Set.of(), Set.of(otherTest.getId()), f.section.getId(), null);
        });
    }

    @Test
    public void allFivePrioritiesIntersectTheActualVisibleTestSet() {
        inRollback(f -> {
            Map<OrderPriority, String> expected = new EnumMap<>(OrderPriority.class);
            expected.put(OrderPriority.ROUTINE, f.original.getId());
            for (OrderPriority priority : OrderPriority.values()) {
                if (priority == OrderPriority.ROUTINE) {
                    continue;
                }
                Sample sample = createSample("CHG073-P-" + priority.name(), priority);
                SampleItem item = createItem(sample, "1", f.item);
                expected.put(priority, createAnalysis(item, f.test, AnalysisStatus.NotStarted).getId());
            }
            var hiddenTest = createTest("CHG073 hidden priority", f.section);
            Sample statSample = createSample("CHG073-P-STAT-HIDDEN", OrderPriority.STAT);
            createAnalysis(createItem(statSample, "1", f.item), hiddenTest, AnalysisStatus.NotStarted);
            flushAndClear();

            for (OrderPriority priority : OrderPriority.values()) {
                assertRows(1, Set.of(expected.get(priority)), Set.of(f.test.getId()), null, priority);
            }
            assertRows(1, Set.of(expected.get(OrderPriority.STAT)), Set.of(f.test.getId()), f.section.getId(),
                    OrderPriority.STAT);
            assertEquals(5, analyses.countWorkplanAnalyses(workplanStatuses(), Set.of(f.test.getId()), null, null));
        });
    }

    @Test
    public void configuredAnalysisStatusesAndEmptyScopesNeverBroadenTheQuery() {
        inRollback(f -> {
            Set<String> expected = new LinkedHashSet<>();
            expected.add(f.original.getId());
            for (AnalysisStatus status : List.of(AnalysisStatus.BiologistRejected, AnalysisStatus.TechnicalRejected,
                    AnalysisStatus.NonConforming_depricated)) {
                expected.add(createAnalysis(f.item, f.test, status).getId());
            }
            createAnalysis(f.item, f.test, AnalysisStatus.Finalized);
            createAnalysis(f.item, f.test, AnalysisStatus.Canceled);
            Analysis wrongCategory = createAnalysis(f.item, f.test, AnalysisStatus.NotStarted);
            wrongCategory.setStatusId(statuses.getStatusID(OrderStatus.Entered));
            flushAndClear();

            List<String> includedStatuses = workplanStatuses();
            assertEquals(4, new LinkedHashSet<>(includedStatuses).size());
            for (String statusId : includedStatuses) {
                StatusOfSample configured = em.find(StatusOfSample.class, statusId);
                assertEquals("ANALYSIS", configured.getStatusType());
                assertEquals("Y", configured.getIsActive());
            }
            assertRows(4, expected, Set.of(f.test.getId()), null, null);
            assertRows(0, Set.of(), Set.of(), null, null);
            assertEquals(0, analyses.countWorkplanAnalyses(List.of(), Set.of(f.test.getId()), null, null));
            assertTrue(analyses.getWorkplanAnalyses(List.of(), Set.of(f.test.getId()), null, null, 0, 10).isEmpty());
        });
    }

    @Test
    public void numericIdentityTieBreakersPageRealAnalysesWithoutDuplicatesOrWrites() {
        inRollback(f -> {
            Sample lateSample = createSample("CHG073-Z-LATE", OrderPriority.ROUTINE);
            Analysis late = createAnalysis(createItem(lateSample, "1", f.item), f.test, AnalysisStatus.NotStarted);
            List<String> sameItem = new ArrayList<>();
            for (int i = 0; i < 12; i++) {
                sameItem.add(createAnalysis(f.item, f.test, AnalysisStatus.NotStarted).getId());
            }
            SampleItem secondItem = createItem(f.sample, "2", f.item);
            List<String> nextItem = new ArrayList<>();
            nextItem.add(createAnalysis(secondItem, f.test, AnalysisStatus.NotStarted).getId());
            for (int sortOrder = 3; sortOrder <= 8; sortOrder++) {
                createItem(f.sample, Integer.toString(sortOrder), f.item);
            }
            SampleItem tenthItem = createItem(f.sample, "9", f.item);
            for (int i = 0; i < 2; i++) {
                nextItem.add(createAnalysis(tenthItem, f.test, AnalysisStatus.NotStarted).getId());
            }
            Sample earlySample = createSample("00-CHG073-EARLY", OrderPriority.ROUTINE);
            Analysis early = createAnalysis(createItem(earlySample, "1", f.item), f.test, AnalysisStatus.NotStarted);
            flushAndClear();

            List<String> expected = new ArrayList<>();
            expected.add(early.getId());
            expected.add(f.original.getId());
            expected.addAll(sameItem);
            expected.addAll(nextItem);
            expected.add(late.getId());
            assertEquals(18, expected.size());
            assertTrue(Long.parseLong(sameItem.get(0)) < Long.parseLong(sameItem.get(11)));
            assertTrue(Long.parseLong(f.item.getId()) < Long.parseLong(secondItem.getId()));
            assertEquals("10", tenthItem.getId());
            assertTrue(Long.parseLong(secondItem.getId()) < Long.parseLong(tenthItem.getId()));
            Timestamp beforeQueries = copy(em.find(Analysis.class, f.original.getId()).getLastupdated());
            Set<String> scope = Set.of(f.test.getId());
            assertEquals(18, analyses.countWorkplanAnalyses(workplanStatuses(), scope, null, null));
            List<Analysis> firstPage = analyses.getWorkplanAnalyses(workplanStatuses(), scope, null, null, 0, 10);
            List<Analysis> secondPage = analyses.getWorkplanAnalyses(workplanStatuses(), scope, null, null, 10, 10);
            assertEquals(expected.subList(0, 10), ids(firstPage));
            assertEquals(expected.subList(10, 18), ids(secondPage));
            assertEquals(ids(firstPage),
                    ids(analyses.getWorkplanAnalyses(workplanStatuses(), scope, null, null, 0, 10)));
            List<String> allPages = new ArrayList<>(ids(firstPage));
            allPages.addAll(ids(secondPage));
            assertEquals(18, new LinkedHashSet<>(allPages).size());
            assertEquals(expected, allPages);
            assertTrue(analyses.getWorkplanAnalyses(workplanStatuses(), scope, null, null, 18, 10).isEmpty());
            em.clear();
            assertEquals(beforeQueries, em.find(Analysis.class, f.original.getId()).getLastupdated());
            for (Analysis analysis : analyses.getWorkplanAnalysesByIds(new LinkedHashSet<>(expected))) {
                assertNull("Reading a workplan must not stamp a printed date", analysis.getPrintedDate());
            }
        });
    }

    @Test
    public void stateVersionAndAssociationChangesAreReReadFromPostgresForPrintIdentity() {
        inRollback(f -> {
            Analysis remaining = createAnalysis(f.item, f.test, AnalysisStatus.NotStarted);
            TestSection replacementSection = createSection("CHG073 replaced");
            var replacementTest = createTest("CHG073 replaced test", replacementSection);
            Sample replacementSample = createSample("CHG073-NEW-IDENTITY", OrderPriority.STAT);
            SampleItem replacementItem = createItem(replacementSample, "1", f.item);
            flushAndClear();
            Set<String> oldScope = Set.of(f.test.getId());
            assertRows(2, Set.of(f.original.getId(), remaining.getId()), oldScope, null, null);
            Analysis original = analyses.getWorkplanAnalysesByIds(Set.of(f.original.getId())).get(0);
            Timestamp before = copy(original.getLastupdated());
            assertEquals(f.sample.getId(), original.getSampleItem().getSample().getId());
            assertEquals(f.test.getId(), original.getTest().getId());
            // The production read marks fetched entities read-only. Discard that
            // snapshot before constructing a genuine writable ORM state change.
            em.clear();

            Analysis changed = em.find(Analysis.class, f.original.getId());
            changed.setStatusId(statuses.getStatusID(AnalysisStatus.Finalized));
            changed.setSampleItem(em.find(SampleItem.class, replacementItem.getId()));
            changed.setTest(em.find(org.openelisglobal.test.valueholder.Test.class, replacementTest.getId()));
            changed.setTestSection(em.find(TestSection.class, replacementSection.getId()));
            flushAndClear();

            assertRows(1, Set.of(remaining.getId()), oldScope, null, null);
            List<Analysis> refreshed = analyses
                    .getWorkplanAnalysesByIds(Set.of(f.original.getId(), remaining.getId(), "999999999"));
            assertEquals(Set.of(f.original.getId(), remaining.getId()), new LinkedHashSet<>(ids(refreshed)));
            Analysis current = refreshed.stream().filter(a -> a.getId().equals(f.original.getId())).findFirst()
                    .orElseThrow();
            assertNotEquals("A real ORM update must advance the print version", before, current.getLastupdated());
            assertEquals(statuses.getStatusID(AnalysisStatus.Finalized), current.getStatusId());
            em.clear();
            assertEquals(replacementItem.getId(), current.getSampleItem().getId());
            assertEquals(replacementSample.getId(), current.getSampleItem().getSample().getId());
            assertEquals("CHG073-NEW-IDENTITY", current.getSampleItem().getSample().getAccessionNumber());
            assertEquals(replacementTest.getId(), current.getTest().getId());
            assertEquals(replacementSection.getId(), current.getTestSection().getId());
            assertNull(current.getPrintedDate());
            assertTrue(analyses.getWorkplanAnalysesByIds(Set.of()).isEmpty());
            assertTrue(analyses.getWorkplanAnalysesByIds(Set.of("999999999")).isEmpty());
        });
    }

    private List<String> workplanStatuses() {
        return List.of(statuses.getStatusID(AnalysisStatus.NotStarted),
                statuses.getStatusID(AnalysisStatus.BiologistRejected),
                statuses.getStatusID(AnalysisStatus.TechnicalRejected),
                statuses.getStatusID(AnalysisStatus.NonConforming_depricated));
    }

    private void assertRows(long count, Set<String> expected, Set<String> testIds, String section,
            OrderPriority priority) {
        assertEquals(count, analyses.countWorkplanAnalyses(workplanStatuses(), testIds, section, priority));
        List<Analysis> rows = analyses.getWorkplanAnalyses(workplanStatuses(), testIds, section, priority, 0, 100);
        assertEquals(count, rows.size());
        assertEquals(expected, new LinkedHashSet<>(ids(rows)));
    }

    private List<String> ids(List<Analysis> rows) {
        return rows.stream().map(Analysis::getId).toList();
    }

    private void flushAndClear() {
        em.flush();
        em.clear();
    }

    private Timestamp copy(Timestamp value) {
        Timestamp snapshot = new Timestamp(value.getTime());
        snapshot.setNanos(value.getNanos());
        return snapshot;
    }

    private void inRollback(Consumer<Fixture> assertions) {
        new TransactionTemplate(transactions).execute(tx -> {
            tx.setRollbackOnly();
            Fixture f = new Fixture();
            f.sample.setPriority(OrderPriority.ROUTINE);
            f.original.setTestSection(f.section);
            assertions.accept(f);
            return null;
        });
        new TransactionTemplate(transactions).execute(tx -> {
            assertEquals("Generated analysis fixtures must roll back", Long.valueOf(1),
                    em.createQuery("select count(a) from Analysis a", Long.class).getSingleResult());
            Analysis original = em.find(Analysis.class, "1");
            assertEquals(statuses.getStatusID(AnalysisStatus.NotStarted), original.getStatusId());
            assertEquals(Timestamp.valueOf("2024-02-12 10:00:00"), original.getLastupdated());
            assertNull(original.getPrintedDate());
            return null;
        });
    }

    private org.openelisglobal.test.valueholder.Test createTest(String name, TestSection section) {
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setDescription(name);
        test.setGuid(UUID.randomUUID().toString());
        test.setName(name);
        test.setIsActive("Y");
        test.setIsReportable("Y");
        test.setTestSection(section);
        em.persist(test);
        return test;
    }

    private TestSection createSection(String name) {
        TestSection section = new TestSection();
        section.setTestSectionName(name);
        section.setDescription(name);
        section.setIsActive("Y");
        section.setLocalization(em.find(Localization.class, "1"));
        em.persist(section);
        return section;
    }

    private Sample createSample(String accession, OrderPriority priority) {
        Sample sample = new Sample();
        sample.setAccessionNumber(accession);
        sample.setEnteredDate(Date.valueOf("2026-10-06"));
        sample.setReceivedTimestamp(Timestamp.valueOf("2026-10-06 10:00:00"));
        sample.setPriority(priority);
        sample.setSysUserId(TEST_SYS_USER_ID);
        em.persist(sample);
        return sample;
    }

    private SampleItem createItem(Sample sample, String sortOrder, SampleItem template) {
        SampleItem item = new SampleItem();
        item.setSample(sample);
        item.setSortOrder(sortOrder);
        item.setTypeOfSample(template.getTypeOfSample());
        item.setStatusId(template.getStatusId());
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

    private void addPanelItem(Panel panel, org.openelisglobal.test.valueholder.Test test, String sortOrder) {
        PanelItem item = new PanelItem();
        item.setPanel(panel);
        item.setTest(test);
        item.setSortOrder(sortOrder);
        em.persist(item);
    }

    private final class Fixture {
        final Sample sample = em.find(Sample.class, "1");
        final SampleItem item = em.find(SampleItem.class, "1");
        final org.openelisglobal.test.valueholder.Test test = em.find(org.openelisglobal.test.valueholder.Test.class,
                "1");
        final TestSection section = em.find(TestSection.class, "1");
        final Analysis original = em.find(Analysis.class, "1");
    }
}

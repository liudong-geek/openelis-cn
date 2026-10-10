package org.openelisglobal.result;

import static org.junit.Assert.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.Map;
import org.hibernate.FlushMode;
import org.hibernate.Session;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.dao.ResultRestrictionDAO;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.statusofsample.valueholder.StatusOfSample;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Actual DAO/scalar reads in disposable PostgreSQL. No SIM acceptance and no
 * demonstration datasource.
 */
public class ResultRestrictionPersistenceTest extends BaseWebContextSensitiveTest {
    @Autowired
    private ResultRestrictionDAO dao;
    @Autowired
    private OrdinaryResultSaveStateDAO states;
    @Autowired
    private PlatformTransactionManager transactions;
    @PersistenceContext
    private EntityManager em;

    @Before
    public void fixture() throws Exception {
        executeDataSetWithStateManagement("testdata/sample-management-status-contract.xml");
        resyncSequence("sample_type_request_seq", "sample_type_request");
    }

    private void rollback(Runnable check) {
        new TransactionTemplate(transactions).execute(s -> {
            try {
                check.run();
                return null;
            } finally {
                s.setRollbackOnly();
            }
        });
    }

    private Analysis source() {
        var a = em.find(Analysis.class, "1");
        a.setTestSection(em.find(TestSection.class, "1"));
        em.flush();
        em.clear();
        return em.find(Analysis.class, "1");
    }

    @Test
    public void exactScalarGraphReturnsActualOwnerAndMillisecondVersion() {
        rollback(() -> {
            var a = source();
            var r = dao.findAnalysis("1").orElseThrow();
            assertEquals("1", r.sampleId());
            assertEquals("1", r.sampleItemId());
            assertEquals("1", r.testId());
            assertEquals("1", r.sectionId());
            assertEquals("24-00001", r.labNumber());
            assertEquals("1", r.sortOrder());
            assertEquals(a.getLastupdated(), r.analysisVersion());
            assertEquals(a.getSampleItem().getLastupdated(), r.itemVersion());
            assertEquals(a.getSampleItem().getSample().getLastupdated(), r.sampleVersion());
            assertTrue(dao.findAnalysis("2147483647").isEmpty());
        });
    }

    @Test
    public void freshScalarReadSeesPersistedStatusVersionAndSortOrder() {
        rollback(() -> {
            var a = source();
            var before = dao.findAnalysis("1").orElseThrow();
            a.setStatusId("13");
            a.setReleasedDate(Timestamp.valueOf("2026-10-06 10:00:00"));
            a.getSampleItem().setSortOrder("7");
            em.flush();
            var after = dao.findAnalysis("1").orElseThrow();
            assertEquals("13", after.analysisStatusId());
            assertEquals("7", after.sortOrder());
            assertNotNull(after.releasedDate());
            assertNotEquals(before.analysisVersion(), after.analysisVersion());
            assertEquals("24-00001", after.labNumber());
        });
    }

    @Test
    public void rawCategoryAndUnknownConfigurationAreNeverTranslatedByNumericId() {
        rollback(() -> {
            source();
            assertEquals("SAMPLE", dao.findStatus("12").orElseThrow().type());
            assertEquals("SampleEntered", dao.findStatus("12").orElseThrow().name());
            var status = em.find(StatusOfSample.class, "12");
            status.setStatusType("ORDER");
            em.flush();
            assertEquals("ORDER", dao.findStatus("12").orElseThrow().type());
            assertEquals("SAMPLE", dao.findStatus("32").orElseThrow().type());
            assertTrue(dao.findStatus("2147483647").isEmpty());
        });
    }

    @Test
    public void requestDateFactsKeepRealAssociationWithoutCreatingAcceptance() {
        rollback(() -> {
            var a = source();
            var item = a.getSampleItem();
            item.setCollectionDate(Timestamp.valueOf("2024-02-12 08:00:00"));
            item.setReceivedDate(Timestamp.valueOf("2024-02-12 09:00:00"));
            var request = new SampleTypeRequest();
            request.setSample(item.getSample());
            request.setTypeOfSample(item.getTypeOfSample());
            request.setSampleItem(item);
            request.setSortOrder(1);
            request.setStatus(SampleTypeRequest.Status.COLLECTED);
            request.setRequestedTests("1");
            request.setCreatedDate(Timestamp.valueOf("2024-02-12 07:00:00"));
            em.persist(request);
            em.flush();
            em.clear();
            var current = states.findIntakeState("1");
            assertEquals("24-00001", current.tube().labNo());
            assertNotNull(current.tube().collected());
            assertNotNull(current.tube().received());
            assertEquals(1, current.requests().size());
            assertEquals(request.getId().toString(), current.requests().get(0).id());
            assertEquals("1", current.requests().get(0).itemId());
            assertEquals(SampleTypeRequest.Status.COLLECTED, current.requests().get(0).status());
            assertTrue(current.decisions().isEmpty());
        });
    }

    @Test
    public void readHqlNeverAutoFlushesAPendingClinicalMutation() {
        rollback(() -> {
            var a = source();
            String persisted = dao.findAnalysis("1").orElseThrow().analysisStatusId();
            a.setStatusId("13");
            assertEquals(persisted, dao.findAnalysis("1").orElseThrow().analysisStatusId());
            var actual = em.unwrap(Session.class)
                    .createQuery("select a.statusId from Analysis a where a.id='1'", String.class)
                    .setHibernateFlushMode(FlushMode.MANUAL).uniqueResult();
            assertEquals(persisted, actual);
            assertEquals("13", a.getStatusId());
            em.clear();
        });
    }

    @Test
    public void repeatedNarrowReadsDoNotWriteVersionsAssociationsLabelsOrHistory() {
        rollback(() -> {
            source();
            em.clear();
            var before = snapshot();
            for (int i = 0; i < 3; i++) {
                assertTrue(dao.findAnalysis("1").isPresent());
                assertTrue(dao.findStatus("12").isPresent());
                states.findIntakeState("1");
            }
            em.flush();
            assertEquals(before, snapshot());
        });
    }

    private Map<String, Object> snapshot() {
        var s = em.unwrap(Session.class);
        Map<String, Object> values = new LinkedHashMap<>();
        String[] queries = {
                "select a.id,a.statusId,a.lastupdated,a.releasedDate,a.printedDate,a.sampleItem.id,a.test.id,a.testSection.id from Analysis a order by a.id",
                "select i.id,i.statusId,i.lastupdated,i.sample.id,i.sortOrder,i.externalId,i.collectionDate,i.receivedDate,i.voided,i.rejected from SampleItem i order by i.id",
                "select s.id,s.accessionNumber,s.statusId,s.lastupdated from Sample s order by s.id",
                "select p.id,p.lastupdated,p.person.id from Provider p order by p.id",
                "select r.id,r.status,r.lastupdated,r.sample.id,r.sampleItem.id from SampleTypeRequest r order by r.id",
                "select count(h) from History h", "select count(l) from BarcodeLabelInfo l",
                "select count(d) from SpecimenIntakeDecision d" };
        for (String q : queries) {
            var rows = s.createQuery(q).setHibernateFlushMode(FlushMode.MANUAL).list();
            values.put(q, rows.stream().map(v -> v instanceof Object[] a ? java.util.Arrays.asList(a) : v).toList());
        }
        return values;
    }
}

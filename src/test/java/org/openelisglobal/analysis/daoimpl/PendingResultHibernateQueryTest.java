package org.openelisglobal.analysis.daoimpl;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.cfg.Configuration;
import org.hibernate.query.Query;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.ClassRule;
import org.junit.Test;
import org.junit.rules.Timeout;
import org.openelisglobal.analysis.form.PendingResultSpecimenCount;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.analysis.valueholder.ResultFile;
import org.openelisglobal.testresultcomponent.valueholder.TestResultComponent;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Reuses the production mapping bootstrap and compiles real HQL without
 * database I/O.
 */
public class PendingResultHibernateQueryTest {
    @ClassRule
    public static final Timeout TIMEOUT = Timeout.seconds(60);
    private static SessionFactory factory;

    @BeforeClass
    @SuppressWarnings({ "rawtypes", "unchecked" })
    public static void mappings() throws Exception {
        factory = mappingConfiguration().buildSessionFactory();
    }

    static Configuration mappingConfiguration() throws Exception {
        Configuration config = new Configuration().configure("hibernate/hibernate.cfg.xml");
        // These production package-scanned entities are not in the legacy explicit
        // manifest, so register them in this no-package-scan validation bootstrap.
        config.addAnnotatedClass(ResultFile.class);
        config.addAnnotatedClass(TestResultComponent.class);
        var xml = javax.xml.parsers.DocumentBuilderFactory.newInstance();
        xml.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        try (var input = PendingResultHibernateQueryTest.class.getClassLoader()
                .getResourceAsStream("persistence/persistence.xml")) {
            assertNotNull(input);
            var classes = xml.newDocumentBuilder().parse(input).getElementsByTagName("class");
            for (int i = 0; i < classes.getLength(); i++) {
                String name = classes.item(i).getTextContent().trim();
                var loader = PendingResultHibernateQueryTest.class.getClassLoader();
                // Same legacy-bootstrap accommodation as OrderDashboardHibernateQueryTest:
                // removed unrelated manifest entries cannot be registered; required
                // entities still fail real mapping/HQL validation if missing.
                if (loader.getResource(name.replace('.', '/') + ".class") == null)
                    continue;
                Class<?> type = Class.forName(name, false, loader);
                if (type.isAnnotationPresent(jakarta.persistence.Entity.class))
                    config.addAnnotatedClass(type);
                else if (type.isAnnotationPresent(jakarta.persistence.Converter.class))
                    config.addAttributeConverter((Class) type);
            }
        }
        config.setProperty("hibernate.hbm2ddl.auto", "none");
        config.setProperty("hibernate.temp.use_jdbc_metadata_defaults", "false");
        config.setProperty("hibernate.search.enabled", "false");
        config.setProperty("hibernate.search.automatic_indexing.enabled", "false");
        return config;
    }

    @AfterClass
    public static void close() {
        if (factory != null)
            factory.close();
    }

    @Test
    @SuppressWarnings("unchecked")
    public void pendingListAndSummaryCompileWithTheSameStatusTestAndRowExistenceScope() {
        try (Session real = factory.openSession()) {
            EntityManager em = mock(EntityManager.class);
            Session boundary = mock(Session.class);
            when(em.unwrap(Session.class)).thenReturn(boundary);
            AnalysisDAOImpl dao = new AnalysisDAOImpl();
            ReflectionTestUtils.setField(dao, "entityManager", em);
            List<String> statements = new ArrayList<>();
            AtomicBoolean closed = new AtomicBoolean();
            Query<Analysis> analysisIo = mock(Query.class, RETURNS_SELF);
            when(analysisIo.list()).thenReturn(List.of());
            Query<Object[]> groupIo = mock(Query.class, RETURNS_SELF);
            when(groupIo.stream()).thenReturn(
                    Stream.<Object[]>of(new Object[] { "10", "A", 2L, 1L, 2L }).onClose(() -> closed.set(true)));
            when(boundary.createQuery(anyString(), eq(Analysis.class))).thenAnswer(invocation -> {
                String hql = invocation.getArgument(0);
                statements.add(hql);
                Query<Analysis> parsed = real.createQuery(hql, Analysis.class);
                parsed.setParameterList("statusIds", List.of("4", "5"));
                parsed.setParameterList("allowedTestIds", Set.of("11", "12"));
                return analysisIo;
            });
            when(boundary.createQuery(anyString(), eq(Object[].class))).thenAnswer(invocation -> {
                String hql = invocation.getArgument(0);
                statements.add(hql);
                Query<Object[]> parsed = real.createQuery(hql, Object[].class);
                parsed.setParameterList("statusIds", List.of("4", "5"));
                parsed.setParameterList("allowedTestIds", Set.of("11", "12"));
                return groupIo;
            });
            dao.getPendingResultAnalyses(List.of("4", "5"), Set.of("11", "12"), 100, 100);
            List<PendingResultSpecimenCount> groups = new ArrayList<>();
            dao.visitPendingResultSpecimenCounts(List.of("4", "5"), Set.of("11", "12"), groups::add);
            assertEquals(2, statements.size());
            for (String hql : statements) {
                assertTrue(hql.contains("a.statusId in (:statusIds)"));
                assertTrue(hql.contains("a.test.id in (:allowedTestIds)"));
                assertTrue(hql.contains("a.releasedDate is null and a.printedDate is null"));
                assertTrue(hql.contains("not exists (select r.id from Result r where r.analysis.id = a.id)"));
                assertTrue(hql.contains("r.parentResult is null"));
                assertTrue(hql.contains("c.isActive = 'Y') > 1"));
                assertFalse(hql.contains("r.value"));
                assertFalse(hql.contains("componentId"));
                assertFalse(hql.contains("patient"));
            }
            verify(analysisIo).setFirstResult(100);
            verify(analysisIo).setMaxResults(100);
            verify(groupIo).setFetchSize(128);
            verify(groupIo, never()).list();
            assertTrue(closed.get());
            assertEquals(new PendingResultSpecimenCount("10", "A", 2, 1, 2), groups.get(0));
        }
    }

    @Test
    public void emptyTestPermissionsNeverProduceAnUnrestrictedQuery() {
        AnalysisDAOImpl dao = new AnalysisDAOImpl();
        EntityManager em = mock(EntityManager.class);
        ReflectionTestUtils.setField(dao, "entityManager", em);
        assertTrue(dao.getPendingResultAnalyses(List.of("4", "5"), Set.of(), 0, 100).isEmpty());
        dao.visitPendingResultSpecimenCounts(List.of("4", "5"), Set.of(), ignored -> fail("No groups expected"));
        verifyZeroInteractions(em);
    }
}

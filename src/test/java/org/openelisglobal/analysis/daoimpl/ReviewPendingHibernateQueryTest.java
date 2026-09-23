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
import org.hibernate.query.Query;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.ClassRule;
import org.junit.Test;
import org.junit.rules.Timeout;
import org.openelisglobal.analysis.form.ReviewPendingAccessionCount;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Reuses the production mapping bootstrap and compiles real HQL without
 * database I/O.
 */
public class ReviewPendingHibernateQueryTest {
    @ClassRule
    public static final Timeout TIMEOUT = Timeout.seconds(60);
    private static SessionFactory factory;

    @BeforeClass
    @SuppressWarnings({ "rawtypes", "unchecked" })
    public static void mappings() throws Exception {
        factory = PendingResultHibernateQueryTest.mappingConfiguration().buildSessionFactory();
    }

    @AfterClass
    public static void close() {
        if (factory != null)
            factory.close();
    }

    @Test
    @SuppressWarnings("unchecked")
    public void reviewQueriesParseWithActualSectionScopeAndNoPublishedExclusion() {
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
                parsed.setParameterList("sectionIds", Set.of("11", "12"));
                return analysisIo;
            });
            when(boundary.createQuery(anyString(), eq(Object[].class))).thenAnswer(invocation -> {
                String hql = invocation.getArgument(0);
                statements.add(hql);
                Query<Object[]> parsed = real.createQuery(hql, Object[].class);
                parsed.setParameterList("statusIds", List.of("4", "5"));
                parsed.setParameterList("sectionIds", Set.of("11", "12"));
                return groupIo;
            });
            dao.getReviewPendingAnalyses(List.of("4", "5"), Set.of("11", "12"),
                    org.openelisglobal.analysis.form.ReviewPendingQuery.all(), 100, 100);
            List<ReviewPendingAccessionCount> groups = new ArrayList<>();
            dao.visitReviewPendingAccessionCounts(List.of("4", "5"), Set.of("11", "12"), groups::add);
            assertEquals(2, statements.size());
            for (String hql : statements) {
                assertTrue(hql.contains("a.statusId in (:statusIds)"));
                assertTrue(hql.contains("a.testSection.id in (:sectionIds)"));
                assertFalse(hql.contains("releasedDate"));
                assertFalse(hql.contains("printedDate"));
                assertFalse(hql.contains("a.test.id in"));
                assertFalse(hql.contains("r.value"));
                assertFalse(hql.contains("componentId"));
                assertFalse(hql.contains("patient"));
            }
            verify(analysisIo).setFirstResult(100);
            verify(analysisIo).setMaxResults(100);
            verify(groupIo).setFetchSize(128);
            verify(groupIo, never()).list();
            assertTrue(closed.get());
            assertEquals(new ReviewPendingAccessionCount("10", "A", 2, 1, 2), groups.get(0));
        }
    }

    @Test
    public void emptyTestPermissionsNeverProduceAnUnrestrictedQuery() {
        AnalysisDAOImpl dao = new AnalysisDAOImpl();
        EntityManager em = mock(EntityManager.class);
        ReflectionTestUtils.setField(dao, "entityManager", em);
        assertTrue(dao.getReviewPendingAnalyses(List.of("4", "5"), Set.of(),
                org.openelisglobal.analysis.form.ReviewPendingQuery.all(), 0, 100).isEmpty());
        dao.visitReviewPendingAccessionCounts(List.of("4", "5"), Set.of(), ignored -> fail("No groups expected"));
        verifyZeroInteractions(em);
    }
}

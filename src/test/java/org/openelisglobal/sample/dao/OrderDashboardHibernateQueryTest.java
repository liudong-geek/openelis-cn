package org.openelisglobal.sample.dao;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import java.util.List;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.cfg.Configuration;
import org.hibernate.query.Query;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.ClassRule;
import org.junit.Test;
import org.junit.rules.Timeout;
import org.openelisglobal.analysis.valueholder.ResultFile;
import org.openelisglobal.sample.daoimpl.OrderDashboardDAOImpl;
import org.openelisglobal.sample.form.OrderDashboardCriteria;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Compiles the production HQL against actual legacy mappings, without database
 * I/O.
 */
public class OrderDashboardHibernateQueryTest {
    @ClassRule
    public static final Timeout TIMEOUT = Timeout.seconds(60);

    private static SessionFactory factory;

    @BeforeClass
    @SuppressWarnings({ "rawtypes", "unchecked" })
    public static void mappings() throws Exception {
        Configuration config = new Configuration().configure("hibernate/hibernate.cfg.xml");
        // Analysis.hbm.xml references this newer entity which is package-discovered
        // at runtime but has not yet been added to the legacy explicit manifest.
        config.addAnnotatedClass(ResultFile.class);
        // Use the production explicit class list rather than scanning thousands of
        // classpath files or maintaining a drifting hand-written subset.
        var xml = javax.xml.parsers.DocumentBuilderFactory.newInstance();
        xml.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        try (var input = OrderDashboardHibernateQueryTest.class.getClassLoader()
                .getResourceAsStream("persistence/persistence.xml")) {
            assertNotNull(input);
            var classes = xml.newDocumentBuilder().parse(input).getElementsByTagName("class");
            for (int i = 0; i < classes.getLength(); i++) {
                String className = classes.item(i).getTextContent().trim();
                var loader = OrderDashboardHibernateQueryTest.class.getClassLoader();
                // This legacy manifest still lists removed, unrelated QC classes;
                // production uses package discovery. Only available classes can be
                // registered. Missing dashboard dependencies still fail Hibernate's
                // real mapping/HQL validation below, rather than being mocked away.
                if (loader.getResource(className.replace('.', '/') + ".class") == null) {
                    continue;
                }
                Class<?> type = Class.forName(className, false, loader);
                if (type.isAnnotationPresent(jakarta.persistence.Entity.class)) {
                    config.addAnnotatedClass(type);
                } else if (type.isAnnotationPresent(jakarta.persistence.Converter.class)) {
                    config.addAttributeConverter((Class) type);
                }
            }
        }
        config.setProperty("hibernate.hbm2ddl.auto", "none");
        config.setProperty("hibernate.temp.use_jdbc_metadata_defaults", "false");
        config.setProperty("hibernate.search.enabled", "false");
        config.setProperty("hibernate.search.automatic_indexing.enabled", "false");
        factory = config.buildSessionFactory();
    }

    @AfterClass
    public static void close() {
        if (factory != null) {
            factory.close();
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    public void everyIntakeStateAndSearchCompilesWithBoundParameters() {
        try (Session real = factory.openSession()) {
            Session boundary = mock(Session.class);
            EntityManager em = mock(EntityManager.class);
            when(em.unwrap(Session.class)).thenReturn(boundary);
            OrderDashboardDAOImpl dao = new OrderDashboardDAOImpl();
            ReflectionTestUtils.setField(dao, "entityManager", em);
            // Execute only HQL compilation/parameter binding; never list() on the real
            // query. Simulated I/O result is irrelevant to this mapping-validation test.
            when(boundary.createQuery(anyString(), eq(Object[].class))).thenAnswer(invocation -> {
                Query<Object[]> compiled = real.createQuery(invocation.getArgument(0), Object[].class);
                assertNotNull(compiled);
                Query<Object[]> io = mock(Query.class, RETURNS_SELF);
                when(io.list()).thenReturn(List.of());
                return io;
            });
            when(boundary.createQuery(anyString(), eq(Long.class))).thenAnswer(invocation -> {
                Query<Long> compiled = real.createQuery(invocation.getArgument(0), Long.class);
                assertNotNull(compiled);
                Query<Long> io = mock(Query.class);
                when(io.uniqueResult()).thenReturn(0L);
                return io;
            });
            when(boundary.createQuery(anyString(), eq(String.class))).thenAnswer(invocation -> {
                assertNotNull(real.createQuery(invocation.getArgument(0), String.class));
                Query<String> io = mock(Query.class, RETURNS_SELF);
                when(io.list()).thenReturn(List.of("1"));
                return io;
            });
            for (String state : List.of("registration_pending", "collection_pending", "label_pending", "qa_pending",
                    "checklist_complete")) {
                var criteria = new OrderDashboardCriteria(0, 25, "张", List.of(state), null, false, null, null,
                        List.of("1", "2"), List.of("3"), false);
                dao.count(criteria);
                dao.findPage(criteria);
            }
            dao.tubes(List.of("42"), List.of("1"));
            verify(boundary, times(5)).createQuery(anyString(), eq(Long.class));
            verify(boundary, times(6)).createQuery(anyString(), eq(Object[].class));
        }
    }

}

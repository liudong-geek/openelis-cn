package org.openelisglobal.analysis.daoimpl;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.engine.jdbc.connections.spi.ConnectionProvider;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.ClassRule;
import org.junit.Test;
import org.junit.rules.Timeout;
import org.openelisglobal.analysis.form.PendingResultSpecimenCount;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Explicitly selected integration test. The runner provisions a fresh, guarded
 * database with production table definitions and only synthetic records.
 */
public class PendingResultDatabaseIT {
    @ClassRule
    public static final Timeout TIMEOUT = Timeout.seconds(120);
    private static SessionFactory factory;
    private static Object previousBeanFactory;
    private static final Set<String> ALLOWED = Set.of("11", "12", "13", "14");
    private static final List<String> STATUSES = List.of("4", "5");

    public static class IsolatedConnectionProvider implements ConnectionProvider {
        @Override
        public Connection getConnection() throws SQLException {
            String url = System.getenv("A02_TEST_DB_URL");
            if (url == null
                    || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/lis_a02_test_[0-9]{8}_[a-z0-9]+")) {
                throw new SQLException("A fresh task-specific test database is required");
            }
            Properties credentials = new Properties();
            credentials.setProperty("user", System.getenv("A02_TEST_DB_USER"));
            credentials.setProperty("password", System.getenv("A02_TEST_DB_PASSWORD"));
            Connection connection = DriverManager.getConnection(url, credentials);
            try (var statement = connection.createStatement();
                    var result = statement.executeQuery("select current_database()")) {
                if (!result.next() || !url.endsWith("/" + result.getString(1))) {
                    connection.close();
                    throw new SQLException("Unexpected test database");
                }
            }
            connection.setAutoCommit(false);
            return connection;
        }

        @Override
        public void closeConnection(Connection connection) throws SQLException {
            connection.close();
        }

        @Override
        public boolean supportsAggressiveRelease() {
            return false;
        }

        @Override
        public boolean isUnwrappableAs(Class type) {
            return type.isAssignableFrom(getClass());
        }

        @Override
        public <T> T unwrap(Class<T> type) {
            return type.cast(this);
        }
    }

    @BeforeClass
    public static void prepareSyntheticFixtures() throws Exception {
        previousBeanFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        AutowireCapableBeanFactory beans = mock(AutowireCapableBeanFactory.class);
        DefaultConfigurationProperties configurationProperties = mock(DefaultConfigurationProperties.class);
        when(beans.getBean(DefaultConfigurationProperties.class)).thenReturn(configurationProperties);
        when(configurationProperties.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("zh-CN");
        when(configurationProperties.getPropertyValue(Property.AmbiguousDateHolder)).thenReturn("X");
        ReflectionTestUtils.setField(SpringContext.class, "factory", beans);
        try (Connection connection = new IsolatedConnectionProvider().getConnection();
                var statement = connection.createStatement()) {
            // The isolated database is newly provisioned. Never truncate or replace
            // an existing dataset; accidental reuse must fail visibly.
            try (var result = statement.executeQuery("select count(*) from clinlims.analysis")) {
                assertTrue(result.next());
                assertEquals(0, result.getLong(1));
            }
            statement.executeUpdate("""
                    insert into clinlims.sample (id, accession_number, entered_date, received_date)
                    values (1,'SYNTHETIC-A',current_timestamp,current_timestamp),
                           (2,'SYNTHETIC-B',current_timestamp,current_timestamp)
                    """);
            statement.executeUpdate("""
                    insert into clinlims.sample_item (id,sort_order,samp_id,status_id)
                    values (10,1,1,4),(20,1,2,4)
                    """);
            for (int id : List.of(11, 12, 13, 14, 99)) {
                statement.executeUpdate("insert into clinlims.test (id,description,name,guid,is_active) values (" + id
                        + ",'Synthetic " + id + "','Synthetic " + id + "','a02-synthetic-" + id + "','Y')");
            }
            statement.executeUpdate("""
                    insert into clinlims.test_result_component (id,test_id,code,label,is_active)
                    values ('c12',12,'c12','One active','Y'),
                           ('c13a',13,'c13a','Two active A','Y'),
                           ('c13b',13,'c13b','Two active B','Y'),
                           ('c14a',14,'c14a','Only active','Y'),
                           ('c14b',14,'c14b','Inactive','N')
                    """);
            statement.executeUpdate("""
                    insert into clinlims.analysis
                        (id,sampitem_id,test_id,status_id,analysis_type,result_calculated)
                    values (1,10,11,4,'MANUAL',false), (2,10,11,5,'MANUAL',false),
                           (3,10,12,4,'MANUAL',false), (4,10,13,5,'MANUAL',false),
                           (5,10,14,4,'MANUAL',false), (6,10,99,4,'MANUAL',false),
                           (7,10,11,4,'MANUAL',false), (8,10,11,5,'MANUAL',false),
                           (9,10,11,6,'MANUAL',false), (10,10,12,4,'MANUAL',false),
                           (11,10,13,4,'MANUAL',false), (12,20,12,4,'MANUAL',false),
                           (13,20,13,5,'MANUAL',false), (14,10,11,4,'MANUAL',false)
                    """);
            statement.executeUpdate("update clinlims.analysis set released_date=current_timestamp where id=7");
            statement.executeUpdate("update clinlims.analysis set printed_date=current_timestamp where id=8");
            statement.executeUpdate("""
                    insert into clinlims.test_result (id,test_id,tst_rslt_type,component_id)
                    values (9999,13,'N','missing-component')
                    """);
            statement.executeUpdate("""
                    insert into clinlims.result (id,analysis_id,parent_id,value,test_result_id)
                    values (999,null,null,null,null), (301,3,999,'child',null),
                           (401,4,999,'child',null), (501,5,999,'child',null),
                           (1401,14,999,'child',null), (1001,10,null,null,null),
                           (1101,11,null,'',9999)
                    """);
            connection.commit();
        }
        var configuration = PendingResultHibernateQueryTest.mappingConfiguration();
        configuration.setProperty("hibernate.connection.provider_class", IsolatedConnectionProvider.class.getName());
        factory = configuration.buildSessionFactory();
    }

    @AfterClass
    public static void close() {
        if (factory != null) {
            factory.close();
        }
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousBeanFactory);
    }

    @Test
    public void actualDaoIncludesReturnedAndRenderableCandidatesButExcludesPublishedUnauthorizedAndChildOnly() {
        try (Session session = factory.openSession()) {
            var transaction = session.beginTransaction();
            AnalysisDAOImpl dao = dao(session);
            List<Analysis> rows = dao.getPendingResultAnalyses(STATUSES, ALLOWED, 0, 0);
            assertEquals(List.of("1", "2", "4", "10", "11", "12", "13"), ids(rows));
            List<PendingResultSpecimenCount> counts = new ArrayList<>();
            dao.visitPendingResultSpecimenCounts(STATUSES, ALLOWED, counts::add);
            assertEquals(rows.size(), counts.stream().mapToLong(PendingResultSpecimenCount::analysisCount).sum());
            assertEquals(Set.of(new PendingResultSpecimenCount("10", "SYNTHETIC-A", 5, 1, 11),
                    new PendingResultSpecimenCount("20", "SYNTHETIC-B", 2, 12, 13)), Set.copyOf(counts));
            transaction.rollback();
        }
    }

    @Test
    public void actualDatabasePagingAndRestrictedTestSetUseTheSameCandidateMembership() {
        try (Session session = factory.openSession()) {
            var transaction = session.beginTransaction();
            AnalysisDAOImpl dao = dao(session);
            assertEquals(List.of("4", "10"), ids(dao.getPendingResultAnalyses(STATUSES, ALLOWED, 2, 2)));
            assertEquals(List.of("1", "2"), ids(dao.getPendingResultAnalyses(STATUSES, Set.of("11"), 0, 100)));
            List<PendingResultSpecimenCount> restricted = new ArrayList<>();
            dao.visitPendingResultSpecimenCounts(STATUSES, Set.of("11"), restricted::add);
            assertEquals(List.of(new PendingResultSpecimenCount("10", "SYNTHETIC-A", 2, 1, 2)), restricted);
            assertTrue(dao.getPendingResultAnalyses(STATUSES, Set.of(), 0, 100).isEmpty());
            dao.visitPendingResultSpecimenCounts(STATUSES, Set.of(), ignored -> fail("No unauthorized groups"));
            transaction.rollback();
        }
    }

    private static AnalysisDAOImpl dao(Session session) {
        AnalysisDAOImpl dao = new AnalysisDAOImpl();
        ReflectionTestUtils.setField(dao, "entityManager", session);
        return dao;
    }

    private static List<String> ids(List<Analysis> rows) {
        return rows.stream().map(Analysis::getId).toList();
    }
}

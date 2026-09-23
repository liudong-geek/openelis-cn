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
import org.openelisglobal.analysis.form.ReviewPendingAccessionCount;
import org.openelisglobal.analysis.form.ReviewPendingQuery;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

/** Actual production HQL, real PostgreSQL; all rows are synthetic. */
public class ReviewPendingDatabaseIT {
    @ClassRule
    public static final Timeout TIMEOUT = Timeout.seconds(120);
    private static SessionFactory factory;
    private static Object previousFactory;

    public static class IsolatedConnectionProvider implements ConnectionProvider {
        public Connection getConnection() throws SQLException {
            String url = System.getenv("A02_REVIEW_TEST_DB_URL");
            if (url == null
                    || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/lis_a02_review_test_[0-9]{8}_[a-z0-9]+"))
                throw new SQLException("Fresh task-specific review test database required");
            Properties credentials = new Properties();
            credentials.setProperty("user", System.getenv("A02_REVIEW_TEST_DB_USER"));
            credentials.setProperty("password", System.getenv("A02_REVIEW_TEST_DB_PASSWORD"));
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

        public void closeConnection(Connection connection) throws SQLException {
            connection.close();
        }

        public boolean supportsAggressiveRelease() {
            return false;
        }

        public boolean isUnwrappableAs(Class type) {
            return type.isAssignableFrom(getClass());
        }

        public <T> T unwrap(Class<T> type) {
            return type.cast(this);
        }
    }

    @BeforeClass
    public static void setup() throws Exception {
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        var beans = mock(AutowireCapableBeanFactory.class);
        var config = mock(DefaultConfigurationProperties.class);
        when(beans.getBean(DefaultConfigurationProperties.class)).thenReturn(config);
        when(config.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("en");
        when(config.getPropertyValue(Property.AmbiguousDateHolder)).thenReturn("X");
        ReflectionTestUtils.setField(SpringContext.class, "factory", beans);
        try (Connection c = new IsolatedConnectionProvider().getConnection(); var sql = c.createStatement()) {
            try (var r = sql.executeQuery("select count(*) from clinlims.analysis")) {
                assertTrue(r.next());
                assertEquals(0, r.getLong(1));
            }
            sql.executeUpdate(
                    "insert into clinlims.localization (id,description) values(201,'Synthetic allowed section'),(202,'Synthetic denied section')");
            sql.executeUpdate(
                    "insert into clinlims.test_section(id,name,description,name_localization_id,is_active) values(101,'SYN-101','Synthetic allowed',201,'Y'),(102,'SYN-102','Synthetic denied',202,'Y')");
            sql.executeUpdate(
                    "insert into clinlims.sample(id,accession_number,entered_date,received_date) values(1,'SIM-A02-R-A',current_timestamp,current_timestamp),(2,'SIM-A02-R-B',current_timestamp,current_timestamp),(3,'SIM-A02-R-C',current_timestamp,current_timestamp)");
            sql.executeUpdate(
                    "insert into clinlims.sample_item(id,sort_order,samp_id,status_id) values(10,1,1,4),(11,2,1,4),(20,1,2,4),(30,1,3,4)");
            for (int id : List.of(11, 12, 13, 14))
                sql.executeUpdate(
                        "insert into clinlims.test(id,description,name,guid,is_active,test_section_id) values(" + id
                                + ",'Synthetic " + id + "','Synthetic " + id + "','a02-review-synthetic-" + id
                                + "','Y'," + (id == 12 ? 102 : 101) + ")");
            sql.executeUpdate(
                    """
                            insert into clinlims.analysis(id,sampitem_id,test_id,test_sect_id,status_id,analysis_type,result_calculated,started_date)
                            values (1,10,11,101,15,'MANUAL',false,'2026-09-20'),(2,10,12,101,15,'MANUAL',false,'2026-09-20'),
                            (3,11,11,102,15,'MANUAL',false,'2026-09-20'),(4,20,13,101,16,'MANUAL',false,'2026-09-21'),
                            (5,20,11,101,21,'MANUAL',false,'2026-09-21'),(6,20,11,101,20,'MANUAL',false,'2026-09-21'),
                            (7,20,11,101,15,'MANUAL',false,'2026-09-21'),(8,20,11,101,15,'MANUAL',false,'2026-09-21'),
                            (9,30,14,101,15,'MANUAL',false,'2026-09-22'),(10,30,14,101,15,'MANUAL',false,'2026-09-22'),
                            (11,30,11,101,15,'MANUAL',false,'2026-09-22'),(12,30,11,101,4,'MANUAL',false,'2026-09-22'),
                            (13,30,11,101,15,'MANUAL',false,'2026-09-22')
                            """);
            sql.executeUpdate("update clinlims.analysis set released_date=current_timestamp where id=7");
            sql.executeUpdate("update clinlims.analysis set printed_date=current_timestamp where id=8");
            sql.executeUpdate(
                    "insert into clinlims.test_result_component(id,test_id,code,label,is_active,is_primary) values('p11',11,'p11','Primary','Y',true),('p12',12,'p12','Primary','Y',true),('c12',12,'c12','Component','Y',false),('p13',13,'p13','Primary','Y',true),('p14',14,'p14','Primary','Y',true)");
            sql.executeUpdate(
                    "insert into clinlims.test_result(id,test_id,tst_rslt_type,component_id,value) values(111,11,'N','p11',null),(121,12,'N','p12',null),(122,12,'N','c12',null),(131,13,'N','p13',null),(144,14,'N','p14',null),(141,14,'M','p14','11'),(142,14,'M','p14','12'),(143,14,'M','p14','13')");
            sql.executeUpdate(
                    "insert into clinlims.result(id,analysis_id,test_result_id,value) values(101,1,111,'1'),(201,2,121,'1'),(202,2,122,'2'),(301,3,111,'1'),(401,4,131,'1'),(501,5,111,'1'),(601,6,111,'1'),(701,7,111,'1'),(801,8,111,'1'),(901,9,141,'11'),(902,9,142,'12'),(903,9,143,'13'),(1001,10,144,'1'),(1301,13,111,null)");
            c.commit();
        }
        var mappings = PendingResultHibernateQueryTest.mappingConfiguration();
        mappings.setProperty("hibernate.connection.provider_class", IsolatedConnectionProvider.class.getName());
        factory = mappings.buildSessionFactory();
    }

    @AfterClass
    public static void close() {
        if (factory != null)
            factory.close();
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
    }

    @Test
    public void actualGroupPermissionStateAndPublishedVisibilityMatchScalarCounts() {
        try (Session s = factory.openSession()) {
            var tx = s.beginTransaction();
            var dao = dao(s);
            for (boolean rejected : List.of(false, true)) {
                var statuses = rejected ? List.of("15", "16") : List.of("15");
                var rows = dao.getReviewPendingAnalyses(statuses, Set.of("101"), ReviewPendingQuery.all(), 0, 0);
                assertEquals(rejected ? List.of("1", "2", "4", "7", "8", "9", "10", "11", "13")
                        : List.of("1", "2", "7", "8", "9", "10", "11", "13"), ids(rows));
                assertEquals("102", rows.get(1).getTest().getTestSection().getId());
                assertEquals("101", rows.get(1).getTestSection().getId());
                assertTrue(rows.stream().anyMatch(a -> a.getReleasedDate() != null));
                assertTrue(rows.stream().anyMatch(a -> a.getPrintedDate() != null));
                List<ReviewPendingAccessionCount> counts = new ArrayList<>();
                dao.visitReviewPendingAccessionCounts(statuses, Set.of("101"), counts::add);
                assertEquals(3, counts.size());
                assertEquals(rows.size(), counts.stream().mapToLong(ReviewPendingAccessionCount::analysisCount).sum());
            }
            tx.rollback();
        }
    }

    @Test
    public void actualFiltersDatabasePagingAndEmptyPermissionPreserveMembership() {
        try (Session s = factory.openSession()) {
            var tx = s.beginTransaction();
            var dao = dao(s);
            var status = List.of("15");
            var allowed = Set.of("101");
            assertEquals(List.of("7", "8"),
                    ids(dao.getReviewPendingAnalyses(status, allowed, ReviewPendingQuery.all(), 2, 2)));
            assertEquals(List.of("1", "2"), ids(dao.getReviewPendingAnalyses(status, allowed,
                    new ReviewPendingQuery(null, null, "1", null), 0, 0)));
            assertEquals(List.of("7", "8", "9", "10", "11", "13"), ids(dao.getReviewPendingAnalyses(status, allowed,
                    new ReviewPendingQuery(null, "SIM-A02-R-B", null, null), 0, 0)));
            assertEquals(List.of("7", "8"), ids(dao.getReviewPendingAnalyses(status, allowed,
                    new ReviewPendingQuery(null, null, null, java.sql.Date.valueOf("2026-09-21")), 0, 0)));
            assertTrue(
                    dao.getReviewPendingAnalyses(status, allowed, new ReviewPendingQuery("102", null, null, null), 0, 0)
                            .isEmpty());
            assertTrue(dao.getReviewPendingAnalyses(status, Set.of(), ReviewPendingQuery.all(), 0, 100).isEmpty());
            dao.visitReviewPendingAccessionCounts(status, Set.of(), ignored -> fail("No unauthorized groups"));
            tx.rollback();
        }
    }

    private static AnalysisDAOImpl dao(Session session) {
        var dao = new AnalysisDAOImpl();
        ReflectionTestUtils.setField(dao, "entityManager", session);
        return dao;
    }

    private static List<String> ids(List<Analysis> rows) {
        return rows.stream().map(Analysis::getId).toList();
    }
}

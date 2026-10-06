package org.openelisglobal.qaevent;

import static org.junit.Assert.*;

import java.io.InputStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Map;
import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.SchemaFactory;
import liquibase.Contexts;
import liquibase.LabelExpression;
import liquibase.Liquibase;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.resource.ClassLoaderResourceAccessor;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.Before;
import org.junit.ClassRule;
import org.junit.Test;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Exercises the exact new migration in its own disposable PostgreSQL, never the
 * demo database.
 */
public class NceWorkspaceMigrationTest {
    private static final String MIGRATION = "liquibase/3.5.x.x/091-nce-registration-receipt.xml";
    private static final String KEY = "17ec9d29-7e2a-4c89-a2df-3606cde9a482";

    @ClassRule
    public static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:14.4")
            .withDatabaseName("chg075_nce_migration");

    @Before
    public void prepareSeparateFixture() throws Exception {
        try (var connection = connection(); var sql = connection.createStatement()) {
            sql.execute("drop schema if exists clinlims cascade");
            sql.execute("drop table if exists public.databasechangelog");
            sql.execute("drop table if exists public.databasechangeloglock");
            sql.execute("create schema clinlims");
            sql.execute("create table clinlims.nc_event (id integer primary key, nce_number text)");
            sql.execute("insert into clinlims.nc_event values (71,'HISTORICAL-NCE-71')");
            sql.execute("create table clinlims.clinical_control (id integer primary key, value text)");
            sql.execute("insert into clinlims.clinical_control values (83,'unchanged clinical fixture')");
        }
    }

    @Test
    public void exactMigrationValidatesAgainstBundledSchemaWithoutNetwork() throws Exception {
        var factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        try (InputStream xsd = getClass().getClassLoader()
                .getResourceAsStream("www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.8.xsd");
                InputStream migration = getClass().getClassLoader().getResourceAsStream(MIGRATION)) {
            assertNotNull("Use the actual bundled schema", xsd);
            assertNotNull("Use the exact production migration", migration);
            factory.newSchema(new StreamSource(xsd)).newValidator().validate(new StreamSource(migration));
        }
    }

    @Test
    public void updateIsRepeatableAndEmptyRollbackReapplyPreservesExistingRows() throws Exception {
        update();
        assertEquals("0", scalar("select count(*)::text from clinlims.nce_registration_receipt"));
        update();
        assertEquals("1", scalar("select count(*)::text from public.databasechangelog"));
        assertClinicalFixture();
        rollback();
        assertNull(scalar("select to_regclass('clinlims.nce_registration_receipt')::text"));
        assertEquals("0", scalar("select count(*)::text from public.databasechangelog"));
        assertClinicalFixture();
        update();
        assertEquals("0", scalar("select count(*)::text from clinlims.nce_registration_receipt"));
        assertEquals("EXECUTED", scalar("select exectype from public.databasechangelog"));
        assertClinicalFixture();
    }

    @Test
    public void persistedReceiptsPreventRollbackAndRemainAvailableForRecovery() throws Exception {
        update();
        try (var connection = connection(); var sql = connection.createStatement()) {
            sql.executeUpdate("insert into clinlims.nce_registration_receipt "
                    + "(request_id,created_by,operation,request_hash,hash_version,created_at,event_id,response_json,last_updated) "
                    + "values ('" + KEY + "','19','CREATE','" + "a".repeat(64)
                    + "','NCE_V2_SHA256_1',CURRENT_TIMESTAMP,71,'{\"outcome\":\"APPLIED\"}',CURRENT_TIMESTAMP)");
        }
        Throwable failure = assertThrows(Exception.class, this::rollback);
        assertNotNull(failure);
        assertEquals("{\"outcome\":\"APPLIED\"}",
                scalar("select response_json from clinlims.nce_registration_receipt"));
        assertEquals("1", scalar("select count(*)::text from public.databasechangelog"));
        assertClinicalFixture();
        update();
        assertEquals("1", scalar("select count(*)::text from clinlims.nce_registration_receipt"));
        assertClinicalFixture();
    }

    @Test
    public void rollbackWaitsForConcurrentReceiptCommitThenPreservesIt() throws Exception {
        update();
        var pool = java.util.concurrent.Executors.newSingleThreadExecutor();
        try (var writer = connection(); var sql = writer.createStatement()) {
            writer.setAutoCommit(false);
            sql.executeUpdate("insert into clinlims.nce_registration_receipt "
                    + "(request_id,created_by,operation,request_hash,hash_version,created_at,event_id,response_json,last_updated) "
                    + "values ('" + KEY + "','19','CREATE','" + "a".repeat(64)
                    + "','NCE_V2_SHA256_1',CURRENT_TIMESTAMP,71,'{\"outcome\":\"APPLIED\"}',CURRENT_TIMESTAMP)");
            var rollback = pool.submit(() -> {
                rollback();
                return null;
            });
            long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(20);
            boolean waiting = false;
            while (System.nanoTime() < deadline) {
                waiting = "true".equals(scalar("select exists(select 1 from pg_locks "
                        + "where relation='clinlims.nce_registration_receipt'::regclass "
                        + "and mode='AccessExclusiveLock' and not granted)::text"));
                if (waiting || rollback.isDone())
                    break;
                Thread.sleep(20);
            }
            assertTrue("Rollback must wait for the independent writer, not inspect and drop around it", waiting);
            assertFalse(rollback.isDone());
            writer.commit();
            assertThrows(java.util.concurrent.ExecutionException.class,
                    () -> rollback.get(20, java.util.concurrent.TimeUnit.SECONDS));
            assertEquals("{\"outcome\":\"APPLIED\"}",
                    scalar("select response_json from clinlims.nce_registration_receipt"));
            assertEquals("1", scalar("select count(*)::text from public.databasechangelog"));
            assertClinicalFixture();
        } finally {
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(20, java.util.concurrent.TimeUnit.SECONDS));
        }
    }

    @Test
    public void receiptOrmMappingBuildsWithoutDatabaseMetadataOrConnection() throws Exception {
        var registry = new StandardServiceRegistryBuilder()
                .applySettings(Map.of("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect",
                        "hibernate.temp.use_jdbc_metadata_defaults", "false", "hibernate.hbm2ddl.auto", "none"))
                .build();
        try (var factory = new MetadataSources(registry)
                .addAnnotatedClass(Class.forName("org.openelisglobal.qaevent.valueholder.NceRegistrationReceipt"))
                .buildMetadata().buildSessionFactory()) {
            assertNotNull(factory.getMetamodel()
                    .entity(Class.forName("org.openelisglobal.qaevent.valueholder.NceRegistrationReceipt")));
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }

    private Connection connection() throws Exception {
        return DriverManager.getConnection(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
    }

    private void update() throws Exception {
        migrate(false);
    }

    private void rollback() throws Exception {
        migrate(true);
    }

    private void migrate(boolean rollback) throws Exception {
        try (var connection = connection()) {
            var database = DatabaseFactory.getInstance()
                    .findCorrectDatabaseImplementation(new JdbcConnection(connection));
            try (var migration = new Liquibase(MIGRATION, new ClassLoaderResourceAccessor(), database)) {
                if (rollback) {
                    migration.rollback(1, new Contexts(), new LabelExpression());
                } else {
                    migration.update(new Contexts(), new LabelExpression());
                }
            }
        }
    }

    private String scalar(String statement) throws Exception {
        try (var connection = connection();
                var sql = connection.createStatement();
                var rows = sql.executeQuery(statement)) {
            assertTrue(rows.next());
            return rows.getString(1);
        }
    }

    private void assertClinicalFixture() throws Exception {
        assertEquals("HISTORICAL-NCE-71", scalar("select nce_number from clinlims.nc_event where id=71"));
        assertEquals("1", scalar("select count(*)::text from clinlims.nc_event"));
        assertEquals("unchanged clinical fixture", scalar("select value from clinlims.clinical_control where id=83"));
        assertEquals("1", scalar("select count(*)::text from clinlims.clinical_control"));
    }
}

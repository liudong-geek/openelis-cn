package org.openelisglobal.siteinformation.migration;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import liquibase.integration.spring.SpringLiquibase;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.util.StreamUtils;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Exact update/insert coverage for the China clinical order-workflow default.
 */
public class ChinaClinicalOrderWorkflowMigrationTest {

    private static final String CONFIG_NAME = "orderEntryWorkflowType";
    private static final String MIGRATION_PATH =
            "liquibase/3.5.x.x/074-cn-clinical-order-workflow.xml";

    private static PostgreSQLContainer<?> postgres;
    private static DriverManagerDataSource dataSource;
    private static boolean externalDatabase;

    private JdbcTemplate jdbcTemplate;

    @BeforeClass
    public static void configureDatabase() {
        String externalUrl = System.getProperty("migration.test.jdbcUrl");
        externalDatabase = externalUrl != null && !externalUrl.isBlank();
        if (externalDatabase) {
            if (!Boolean.getBoolean("migration.test.allowSchemaReset")) {
                throw new IllegalStateException(
                        "External migration test database requires -Dmigration.test.allowSchemaReset=true");
            }
            dataSource = dataSource(withClinicalSchema(externalUrl),
                    System.getProperty("migration.test.jdbcUser", "clinlims"),
                    System.getProperty("migration.test.jdbcPassword",
                            System.getenv().getOrDefault("POSTGRES_PASSWORD", "clinlims")));
            return;
        }

        postgres = new PostgreSQLContainer<>("postgres:14.4");
        postgres.start();
        dataSource = dataSource(withClinicalSchema(postgres.getJdbcUrl()),
                postgres.getUsername(), postgres.getPassword());
    }

    @AfterClass
    public static void closeDatabase() {
        if (dataSource != null && externalDatabase) {
            new JdbcTemplate(dataSource).execute("DROP SCHEMA IF EXISTS clinlims CASCADE");
        }
        if (postgres != null) {
            postgres.stop();
        }
    }

    @Before
    public void setUp() {
        jdbcTemplate = new JdbcTemplate(dataSource);
        resetDatabase();
    }

    @Test
    public void migration_updatesExistingWorkflowToClinical_withoutReplacingMetadata()
            throws Exception {
        jdbcTemplate.update(
                "INSERT INTO clinlims.site_information"
                        + " (id, name, lastupdated, description, value, encrypted, domain_id, value_type, \"group\")"
                        + " VALUES (nextval('clinlims.site_information_seq'), ?, NOW(), ?, ?, false,"
                        + " (SELECT id FROM clinlims.site_information_domain WHERE name = 'hiddenProperties'),"
                        + " 'text', 7)",
                CONFIG_NAME, "Existing workflow metadata", "Both");

        runMigration();

        assertEquals("an existing workflow setting must be updated in place", 1L,
                configCount());
        assertEquals("Clinical", configValue());
        assertEquals("Existing workflow metadata", jdbcTemplate.queryForObject(
                "SELECT description FROM clinlims.site_information WHERE name = ?",
                String.class, CONFIG_NAME));
        assertEquals("hiddenProperties", jdbcTemplate.queryForObject(
                "SELECT d.name FROM clinlims.site_information i"
                        + " JOIN clinlims.site_information_domain d ON d.id = i.domain_id"
                        + " WHERE i.name = ?",
                String.class, CONFIG_NAME));
        assertEquals(Integer.valueOf(7), jdbcTemplate.queryForObject(
                "SELECT \"group\" FROM clinlims.site_information WHERE name = ?",
                Integer.class, CONFIG_NAME));

        runMigration();
        assertEquals("a repeated Liquibase run must not duplicate the setting", 1L,
                configCount());
        assertEquals("Clinical", configValue());
    }

    @Test
    public void migration_insertsClinicalWorkflow_whenSettingIsMissing() throws Exception {
        assertEquals(0L, configCount());

        runMigration();

        assertEquals("a missing workflow setting must be inserted exactly once", 1L,
                configCount());
        assertEquals("Clinical", configValue());
        assertEquals("text", jdbcTemplate.queryForObject(
                "SELECT value_type FROM clinlims.site_information WHERE name = ?",
                String.class, CONFIG_NAME));
        assertEquals("sampleEntryConfig", jdbcTemplate.queryForObject(
                "SELECT d.name FROM clinlims.site_information i"
                        + " JOIN clinlims.site_information_domain d ON d.id = i.domain_id"
                        + " WHERE i.name = ?",
                String.class, CONFIG_NAME));

        runMigration();
        assertEquals("a repeated Liquibase run must not duplicate the setting", 1L,
                configCount());
        assertEquals("Clinical", configValue());
    }

    @Test
    public void baseChangelog_includesChinaClinicalOrderWorkflowMigration()
            throws Exception {
        ClassPathResource resource =
                new ClassPathResource("liquibase/3.5.x.x/base.xml");
        String baseXml;
        try (java.io.InputStream inputStream = resource.getInputStream()) {
            baseXml = StreamUtils.copyToString(inputStream,
                    java.nio.charset.StandardCharsets.UTF_8);
        }
        assertTrue("3.5.x.x/base.xml must include the China clinical workflow migration",
                baseXml.contains("074-cn-clinical-order-workflow.xml"));
    }

    private void runMigration() throws Exception {
        SpringLiquibase liquibase = new SpringLiquibase();
        liquibase.setDataSource(dataSource);
        liquibase.setChangeLog("classpath:" + MIGRATION_PATH);
        liquibase.afterPropertiesSet();
    }

    private void resetDatabase() {
        jdbcTemplate.execute("DROP SCHEMA IF EXISTS clinlims CASCADE");
        jdbcTemplate.execute("CREATE SCHEMA clinlims");
        jdbcTemplate.execute("CREATE SEQUENCE clinlims.site_information_seq START WITH 1");
        jdbcTemplate.execute("CREATE TABLE clinlims.site_information_domain"
                + " (id numeric(10,0) PRIMARY KEY, name varchar(20) NOT NULL,"
                + " description varchar(120))");
        jdbcTemplate.execute("CREATE TABLE clinlims.site_information"
                + " (id integer PRIMARY KEY, name varchar(32) NOT NULL,"
                + " lastupdated timestamp with time zone, description varchar(120),"
                + " value varchar(200), encrypted boolean DEFAULT false,"
                + " domain_id numeric(10,0), value_type varchar(10) DEFAULT 'text' NOT NULL,"
                + " instruction_key varchar(40), \"group\" numeric DEFAULT 0,"
                + " schedule_id numeric(10,0), tag varchar(20),"
                + " dictionary_category_id numeric(10,0), description_key varchar(42),"
                + " name_key varchar)");
        jdbcTemplate.update("INSERT INTO clinlims.site_information_domain"
                + " (id, name, description) VALUES (10, 'sampleEntryConfig', 'Order entry')");
        jdbcTemplate.update("INSERT INTO clinlims.site_information_domain"
                + " (id, name, description) VALUES (11, 'hiddenProperties', 'Hidden')");
    }

    private long configCount() {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM clinlims.site_information WHERE name = ?",
                Long.class, CONFIG_NAME);
    }

    private String configValue() {
        return jdbcTemplate.queryForObject(
                "SELECT value FROM clinlims.site_information WHERE name = ?",
                String.class, CONFIG_NAME);
    }

    private static DriverManagerDataSource dataSource(String url, String username,
            String password) {
        DriverManagerDataSource configured = new DriverManagerDataSource();
        configured.setDriverClassName("org.postgresql.Driver");
        configured.setUrl(url);
        configured.setUsername(username);
        configured.setPassword(password);
        return configured;
    }

    private static String withClinicalSchema(String jdbcUrl) {
        return jdbcUrl + (jdbcUrl.contains("?") ? "&" : "?")
                + "currentSchema=clinlims";
    }
}

package org.openelisglobal.organization.migration;

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

/** Verifies the non-destructive organization bootstrap used by a fresh China installation. */
public class ChinaClinicalOrganizationBootstrapMigrationTest {

    private static final String MIGRATION_PATH =
            "liquibase/3.5.x.x/077-cn-clinical-organization-bootstrap.xml";
    private static final String NORMALIZATION_MIGRATION_PATH =
            "liquibase/3.5.x.x/078-cn-normalize-bootstrap-organization-short-names.xml";

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
    public void freshInstallation_receivesEditableFacilityAndDepartmentsExactlyOnce() throws Exception {
        runMigration();

        assertEquals(1L, count("SELECT count(*) FROM clinlims.organization WHERE code = 'CN-LOCAL'"));
        assertEquals(4L, count("SELECT count(*) FROM clinlims.organization child"
                + " JOIN clinlims.organization parent ON parent.id = child.org_id"
                + " WHERE parent.code = 'CN-LOCAL'"));
        assertEquals(1L, count("SELECT count(*) FROM clinlims.organization o"
                + " JOIN clinlims.organization_organization_type link ON link.org_id = o.id"
                + " JOIN clinlims.organization_type type ON type.id = link.org_type_id"
                + " WHERE o.code = 'CN-LOCAL' AND type.short_name = 'referring clinic'"));
        assertEquals(4L, count("SELECT count(*) FROM clinlims.organization child"
                + " JOIN clinlims.organization parent ON parent.id = child.org_id"
                + " JOIN clinlims.organization_organization_type link ON link.org_id = child.id"
                + " JOIN clinlims.organization_type type ON type.id = link.org_type_id"
                + " WHERE parent.code = 'CN-LOCAL' AND type.short_name = 'dept'"));

        runMigration();
        assertEquals(1L, count("SELECT count(*) FROM clinlims.organization WHERE code = 'CN-LOCAL'"));
        assertEquals(4L, count("SELECT count(*) FROM clinlims.organization child"
                + " JOIN clinlims.organization parent ON parent.id = child.org_id"
                + " WHERE parent.code = 'CN-LOCAL'"));
    }

    @Test
    public void configuredInstallation_isNeverPollutedWithBootstrapOrganizations() throws Exception {
        jdbcTemplate.update("INSERT INTO clinlims.organization"
                + " (id, name, code, is_active, mls_sentinel_lab_flag)"
                + " VALUES (nextval('clinlims.organization_seq'), '某医院', 'HOSP', 'Y', 'N')");
        jdbcTemplate.update("INSERT INTO clinlims.organization_organization_type (org_id, org_type_id)"
                + " SELECT o.id, t.id FROM clinlims.organization o"
                + " JOIN clinlims.organization_type t ON t.short_name = 'referring clinic'"
                + " WHERE o.code = 'HOSP'");

        runMigration();

        assertEquals(0L, count("SELECT count(*) FROM clinlims.organization WHERE code = 'CN-LOCAL'"));
        assertEquals(1L, count("SELECT count(*) FROM clinlims.organization WHERE code = 'HOSP'"));
    }

    @Test
    public void existingOrganizationUsingReservedCode_isNeverReclassifiedOrGivenChildren() throws Exception {
        jdbcTemplate.update("INSERT INTO clinlims.organization"
                + " (id, name, code, is_active, mls_sentinel_lab_flag)"
                + " VALUES (nextval('clinlims.organization_seq'), '既有自定义机构', 'CN-LOCAL', 'Y', 'N')");

        runMigration();

        assertEquals(1L, count("SELECT count(*) FROM clinlims.organization WHERE code = 'CN-LOCAL'"));
        assertEquals(0L, count("SELECT count(*) FROM clinlims.organization child"
                + " JOIN clinlims.organization parent ON parent.id = child.org_id"
                + " WHERE parent.code = 'CN-LOCAL'"));
        assertEquals(0L, count("SELECT count(*) FROM clinlims.organization o"
                + " JOIN clinlims.organization_organization_type link ON link.org_id = o.id"
                + " WHERE o.code = 'CN-LOCAL'"));
    }

    @Test
    public void baseChangelog_includesOrganizationBootstrapAfterMasterDataGuard() throws Exception {
        ClassPathResource resource = new ClassPathResource("liquibase/3.5.x.x/base.xml");
        String baseXml;
        try (java.io.InputStream inputStream = resource.getInputStream()) {
            baseXml = StreamUtils.copyToString(inputStream, java.nio.charset.StandardCharsets.UTF_8);
        }

        int guardPosition = baseXml.indexOf("076-cn-clinical-master-data-guardrails.xml");
        int bootstrapPosition = baseXml.indexOf("077-cn-clinical-organization-bootstrap.xml");
        int normalizationPosition =
                baseXml.indexOf("078-cn-normalize-bootstrap-organization-short-names.xml");
        assertTrue(guardPosition >= 0);
        assertTrue(bootstrapPosition > guardPosition);
        assertTrue(normalizationPosition > bootstrapPosition);
    }

    @Test
    public void normalization_removesOnlyLegacyLiteralEmptyShortNamesFromBootstrapRecords()
            throws Exception {
        runMigration();
        jdbcTemplate.update("UPDATE clinlims.organization SET short_name = '\"\"'"
                + " WHERE code IN ('CN-LOCAL', 'CN-OPD', 'CN-ED', 'CN-IPD', 'CN-PE')");
        jdbcTemplate.update("INSERT INTO clinlims.organization"
                + " (id, name, short_name, code, is_active, mls_sentinel_lab_flag)"
                + " VALUES (nextval('clinlims.organization_seq'), '既有机构', '\"\"', 'OTHER', 'Y', 'N')");

        runMigration(NORMALIZATION_MIGRATION_PATH);

        assertEquals(5L, count("SELECT count(*) FROM clinlims.organization"
                + " WHERE code IN ('CN-LOCAL', 'CN-OPD', 'CN-ED', 'CN-IPD', 'CN-PE')"
                + " AND short_name IS NULL"));
        assertEquals(1L, count("SELECT count(*) FROM clinlims.organization"
                + " WHERE code = 'OTHER' AND short_name = '\"\"'"));
    }

    private void runMigration() throws Exception {
        runMigration(MIGRATION_PATH);
    }

    private void runMigration(String migrationPath) throws Exception {
        SpringLiquibase liquibase = new SpringLiquibase();
        liquibase.setDataSource(dataSource);
        liquibase.setChangeLog("classpath:" + migrationPath);
        liquibase.afterPropertiesSet();
    }

    private void resetDatabase() {
        jdbcTemplate.execute("DROP SCHEMA IF EXISTS clinlims CASCADE");
        jdbcTemplate.execute("CREATE SCHEMA clinlims");
        jdbcTemplate.execute("CREATE SEQUENCE clinlims.organization_seq START WITH 1");
        jdbcTemplate.execute("CREATE TABLE clinlims.organization_type"
                + " (id numeric(10,0) PRIMARY KEY, short_name varchar(40) NOT NULL)");
        jdbcTemplate.execute("CREATE TABLE clinlims.organization"
                + " (id numeric(10,0) PRIMARY KEY, name varchar(80) NOT NULL,"
                + " short_name varchar(15), code varchar(20), org_id numeric(10,0),"
                + " is_active char(1), mls_sentinel_lab_flag varchar(1) NOT NULL DEFAULT 'N',"
                + " lastupdated timestamp without time zone)");
        jdbcTemplate.execute("CREATE TABLE clinlims.organization_organization_type"
                + " (org_id numeric(10,0) NOT NULL, org_type_id numeric(10,0) NOT NULL,"
                + " PRIMARY KEY (org_id, org_type_id))");
        jdbcTemplate.update("INSERT INTO clinlims.organization_type (id, short_name)"
                + " VALUES (5, 'referring clinic'), (11, 'dept')");
    }

    private long count(String sql) {
        return jdbcTemplate.queryForObject(sql, Long.class);
    }

    private static DriverManagerDataSource dataSource(String url, String username, String password) {
        DriverManagerDataSource configured = new DriverManagerDataSource();
        configured.setDriverClassName("org.postgresql.Driver");
        configured.setUrl(url);
        configured.setUsername(username);
        configured.setPassword(password);
        return configured;
    }

    private static String withClinicalSchema(String jdbcUrl) {
        return jdbcUrl + (jdbcUrl.contains("?") ? "&" : "?") + "currentSchema=clinlims";
    }
}

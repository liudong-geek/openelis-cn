package org.openelisglobal.siteinformation.migration;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
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

/** Exact safety and idempotency coverage for the China product-branding migration. */
public class ChinaProductBrandingMigrationTest {

    private static final String PRODUCT_NAME = "临床检验信息系统";
    private static final String MIGRATION_PATH =
            "liquibase/3.5.x.x/075-cn-chinese-product-branding.xml";

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
            dataSource =
                    dataSource(
                            withClinicalSchema(externalUrl),
                            System.getProperty("migration.test.jdbcUser", "clinlims"),
                            System.getProperty(
                                    "migration.test.jdbcPassword",
                                    System.getenv().getOrDefault("POSTGRES_PASSWORD", "clinlims")));
            return;
        }

        postgres = new PostgreSQLContainer<>("postgres:14.4");
        postgres.start();
        dataSource =
                dataSource(
                        withClinicalSchema(postgres.getJdbcUrl()),
                        postgres.getUsername(),
                        postgres.getPassword());
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
    public void migration_usesBannerReferenceRatherThanFixedLocalizationId() throws Exception {
        seedLocalization(2);
        seedLocalization(9187);
        seedBannerReference(9187);
        seedChineseValue(2, "其他名称");
        seedUser(1, "admin", "Open", "ELIS");
        seedUser(2, "technician", "Open", "ELIS");

        runMigration();

        assertEquals(PRODUCT_NAME, chineseValue(9187));
        assertEquals("其他名称", chineseValue(2));
        assertEquals("系统", firstName("admin"));
        assertEquals("管理员", lastName("admin"));
        assertEquals("Open", firstName("technician"));
        assertEquals("ELIS", lastName("technician"));
    }

    @Test
    public void migration_isIdempotentWhenChangeSetsAreReapplied() throws Exception {
        seedLocalization(73);
        seedBannerReference(73);
        seedUser(1, "admin", "Open", "ELIS");

        runMigration();
        jdbcTemplate.update(
                "DELETE FROM clinlims.databasechangelog WHERE id LIKE '3.5.0-075-%'");
        runMigration();

        assertEquals(1L, chineseValueCount(73));
        assertEquals(PRODUCT_NAME, chineseValue(73));
        assertEquals("系统", firstName("admin"));
        assertEquals("管理员", lastName("admin"));
    }

    @Test
    public void migration_preservesCustomizedAdministratorName() throws Exception {
        seedLocalization(346);
        seedBannerReference(346);
        seedUser(1, "admin", "李", "主任");

        runMigration();

        assertEquals("李", firstName("admin"));
        assertEquals("主任", lastName("admin"));
        assertEquals(PRODUCT_NAME, chineseValue(346));
    }

    @Test
    public void migration_doesNotCreateAChineseValueForAnUnreferencedLocalization()
            throws Exception {
        seedLocalization(101);
        seedLocalization(102);
        seedBannerReference(102);

        runMigration();

        assertNull(chineseValue(101));
        assertEquals(PRODUCT_NAME, chineseValue(102));
    }

    @Test
    public void baseChangelog_includesChinaProductBrandingMigration() throws Exception {
        ClassPathResource resource = new ClassPathResource("liquibase/3.5.x.x/base.xml");
        String baseXml;
        try (java.io.InputStream inputStream = resource.getInputStream()) {
            baseXml =
                    StreamUtils.copyToString(
                            inputStream, java.nio.charset.StandardCharsets.UTF_8);
        }

        assertTrue(
                "3.5.x.x/base.xml must include the China product-branding migration",
                baseXml.contains("075-cn-chinese-product-branding.xml"));
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
        jdbcTemplate.execute("CREATE SEQUENCE clinlims.localization_value_seq START WITH 1");
        jdbcTemplate.execute(
                "CREATE TABLE clinlims.localization"
                        + " (id numeric PRIMARY KEY, description text, lastupdated timestamp with time zone)");
        jdbcTemplate.execute(
                "CREATE TABLE clinlims.localization_value"
                        + " (id numeric PRIMARY KEY, localization_id numeric NOT NULL"
                        + " REFERENCES clinlims.localization(id) ON DELETE CASCADE,"
                        + " locale varchar(10) NOT NULL, value text NOT NULL,"
                        + " last_updated timestamp with time zone,"
                        + " CONSTRAINT uq_localization_value_locale UNIQUE (localization_id, locale))");
        jdbcTemplate.execute(
                "CREATE TABLE clinlims.site_information"
                        + " (id integer PRIMARY KEY, name varchar(32) NOT NULL,"
                        + " value varchar(200), lastupdated timestamp with time zone)");
        jdbcTemplate.execute(
                "CREATE TABLE clinlims.system_user"
                        + " (id numeric PRIMARY KEY, login_name varchar(30) NOT NULL,"
                        + " first_name varchar(30), last_name varchar(30),"
                        + " lastupdated timestamp with time zone)");
    }

    private void seedLocalization(long id) {
        jdbcTemplate.update(
                "INSERT INTO clinlims.localization (id, description, lastupdated)"
                        + " VALUES (?, 'branding test', NOW())",
                id);
    }

    private void seedBannerReference(long localizationId) {
        jdbcTemplate.update(
                "INSERT INTO clinlims.site_information (id, name, value, lastupdated)"
                        + " VALUES (1, 'bannerHeading', ?, NOW())",
                Long.toString(localizationId));
    }

    private void seedChineseValue(long localizationId, String value) {
        jdbcTemplate.update(
                "INSERT INTO clinlims.localization_value"
                        + " (id, localization_id, locale, value, last_updated)"
                        + " VALUES (nextval('clinlims.localization_value_seq'), ?, 'zh', ?, NOW())",
                localizationId,
                value);
    }

    private void seedUser(
            long id, String loginName, String firstName, String lastName) {
        jdbcTemplate.update(
                "INSERT INTO clinlims.system_user"
                        + " (id, login_name, first_name, last_name, lastupdated)"
                        + " VALUES (?, ?, ?, ?, NOW())",
                id,
                loginName,
                firstName,
                lastName);
    }

    private String chineseValue(long localizationId) {
        return jdbcTemplate.query(
                "SELECT value FROM clinlims.localization_value"
                        + " WHERE localization_id = ? AND locale = 'zh'",
                resultSet -> resultSet.next() ? resultSet.getString(1) : null,
                localizationId);
    }

    private long chineseValueCount(long localizationId) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM clinlims.localization_value"
                        + " WHERE localization_id = ? AND locale = 'zh'",
                Long.class,
                localizationId);
    }

    private String firstName(String loginName) {
        return jdbcTemplate.queryForObject(
                "SELECT first_name FROM clinlims.system_user WHERE login_name = ?",
                String.class,
                loginName);
    }

    private String lastName(String loginName) {
        return jdbcTemplate.queryForObject(
                "SELECT last_name FROM clinlims.system_user WHERE login_name = ?",
                String.class,
                loginName);
    }

    private static DriverManagerDataSource dataSource(
            String url, String username, String password) {
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

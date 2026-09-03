package org.openelisglobal.localization;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.FileCopyUtils;

/**
 * Exact-targeting, locale isolation and idempotency coverage for the China
 * delivery core-laboratory master-data overlay.
 */
public class ChinaCoreLabMasterDataLocalizationMigrationTest extends BaseWebContextSensitiveTest {

    private static final String MIGRATION_SQL_PATH =
            "liquibase/3.5.x.x/072-cn-core-lab-master-data-localization.sql";

    private static final long SECTION_ID = 996001L;
    private static final long SAMPLE_TYPE_ID = 996002L;
    private static final long PANEL_ID = 996003L;
    private static final long GLUCOSE_TEST_ID = 996004L;
    private static final long GB_TEST_ID = 996005L;
    private static final long UNRELATED_TEST_ID = 996006L;
    private static final long NON_CLINICAL_TEST_ID = 996007L;
    private static final long REPORT_MISMATCH_TEST_ID = 996008L;
    private static final long VIROLOGY_SECTION_ID = 996009L;
    private static final long HEMATOLOGY_SECTION_ID = 996010L;

    private static final long SECTION_LOCALIZATION_ID = 995001L;
    private static final long SAMPLE_LOCALIZATION_ID = 995002L;
    private static final long PANEL_LOCALIZATION_ID = 995003L;
    private static final long GLUCOSE_NAME_LOCALIZATION_ID = 995004L;
    private static final long GLUCOSE_REPORT_LOCALIZATION_ID = 995005L;
    private static final long GB_NAME_LOCALIZATION_ID = 995006L;
    private static final long GB_REPORT_LOCALIZATION_ID = 995007L;
    private static final long UNRELATED_LOCALIZATION_ID = 995008L;
    private static final long NON_CLINICAL_LOCALIZATION_ID = 995009L;
    private static final long MISMATCH_NAME_LOCALIZATION_ID = 995010L;
    private static final long MISMATCH_REPORT_LOCALIZATION_ID = 995011L;
    private static final long VIROLOGY_LOCALIZATION_ID = 995012L;
    private static final long HEMATOLOGY_LOCALIZATION_ID = 995013L;

    private static final long[] TEST_IDS = { GLUCOSE_TEST_ID, GB_TEST_ID, UNRELATED_TEST_ID,
            NON_CLINICAL_TEST_ID, REPORT_MISMATCH_TEST_ID };

    private static final long[] LOCALIZATION_IDS = { SECTION_LOCALIZATION_ID, SAMPLE_LOCALIZATION_ID,
            PANEL_LOCALIZATION_ID, GLUCOSE_NAME_LOCALIZATION_ID, GLUCOSE_REPORT_LOCALIZATION_ID,
            GB_NAME_LOCALIZATION_ID, GB_REPORT_LOCALIZATION_ID, UNRELATED_LOCALIZATION_ID,
            NON_CLINICAL_LOCALIZATION_ID, MISMATCH_NAME_LOCALIZATION_ID,
            MISMATCH_REPORT_LOCALIZATION_ID, VIROLOGY_LOCALIZATION_ID,
            HEMATOLOGY_LOCALIZATION_ID };

    @Autowired
    private javax.sql.DataSource dataSource;

    private JdbcTemplate jdbcTemplate;

    @Before
    @Override
    public void setUp() throws Exception {
        super.setUp();
        jdbcTemplate = new JdbcTemplate(dataSource);
        cleanSeededData();

        insertLocalization(SECTION_LOCALIZATION_ID, "Biochemistry");
        insertLocalization(SAMPLE_LOCALIZATION_ID, "Serum");
        insertLocalization(PANEL_LOCALIZATION_ID, "NFS");
        insertLocalization(GLUCOSE_NAME_LOCALIZATION_ID, "Glucose");
        insertLocalization(GLUCOSE_REPORT_LOCALIZATION_ID, "Glucose");
        insertLocalization(GB_NAME_LOCALIZATION_ID, "GB");
        insertLocalization(GB_REPORT_LOCALIZATION_ID, "GB");
        insertLocalization(UNRELATED_LOCALIZATION_ID, "Glucose Research Control");
        insertLocalization(NON_CLINICAL_LOCALIZATION_ID, "Glucose");
        insertLocalization(MISMATCH_NAME_LOCALIZATION_ID, "Glucose");
        insertLocalization(MISMATCH_REPORT_LOCALIZATION_ID, "Blood glucose report");
        insertLocalization(VIROLOGY_LOCALIZATION_ID, "Virologie");
        insertLocalization(HEMATOLOGY_LOCALIZATION_ID, "Hematology");

        jdbcTemplate.update(
                "INSERT INTO clinlims.test_section"
                        + " (id, name, description, is_external, is_active, name_localization_id, domain,"
                        + " lastupdated) VALUES (?, 'Biochemistry', ?, 'N', 'Y', ?, 'CLINICAL', NOW())",
                SECTION_ID, "China core localization migration test section", SECTION_LOCALIZATION_ID);
        jdbcTemplate.update(
                "INSERT INTO clinlims.test_section"
                        + " (id, name, description, is_external, is_active, name_localization_id, domain,"
                        + " lastupdated) VALUES (?, 'Virologie', ?, 'N', 'Y', ?, 'CLINICAL', NOW())",
                VIROLOGY_SECTION_ID, "China French virology localization test section",
                VIROLOGY_LOCALIZATION_ID);
        jdbcTemplate.update(
                "INSERT INTO clinlims.test_section"
                        + " (id, name, description, is_external, is_active, name_localization_id, domain,"
                        + " lastupdated) VALUES (?, 'Hematology', ?, 'N', 'Y', ?, 'CLINICAL', NOW())",
                HEMATOLOGY_SECTION_ID, "China hematology localization test section",
                HEMATOLOGY_LOCALIZATION_ID);
        jdbcTemplate.update(
                "INSERT INTO clinlims.type_of_sample"
                        + " (id, description, domain, is_active, name_localization_id, lastupdated)"
                        + " VALUES (?, 'Serum', 'CLINICAL', true, ?, NOW())",
                SAMPLE_TYPE_ID, SAMPLE_LOCALIZATION_ID);
        jdbcTemplate.update(
                "INSERT INTO clinlims.panel"
                        + " (id, name, description, is_active, name_localization_id, lastupdated)"
                        + " VALUES (?, 'NFS', ?, 'Y', ?, NOW())",
                PANEL_ID, "China core localization migration test panel", PANEL_LOCALIZATION_ID);

        insertTest(GLUCOSE_TEST_ID, GLUCOSE_NAME_LOCALIZATION_ID,
                GLUCOSE_REPORT_LOCALIZATION_ID, "Glucose", "CLINICAL");
        insertTest(GB_TEST_ID, GB_NAME_LOCALIZATION_ID, GB_REPORT_LOCALIZATION_ID, "GB", "CLINICAL");
        jdbcTemplate.update("UPDATE clinlims.test SET test_section_id = ? WHERE id = ?",
                HEMATOLOGY_SECTION_ID, GB_TEST_ID);
        insertTest(UNRELATED_TEST_ID, UNRELATED_LOCALIZATION_ID, null,
                "Glucose Research Control", "CLINICAL");
        insertTest(NON_CLINICAL_TEST_ID, NON_CLINICAL_LOCALIZATION_ID, null,
                "Glucose", "ENVIRONMENTAL");
        insertTest(REPORT_MISMATCH_TEST_ID, MISMATCH_NAME_LOCALIZATION_ID,
                MISMATCH_REPORT_LOCALIZATION_ID, "Glucose", "CLINICAL");
    }

    @After
    public void tearDown() {
        cleanSeededData();
    }

    @Test
    public void migration_localizesExactClinicalTargets_preservesEnglish_andIsIdempotent()
            throws Exception {
        runMigration();

        assertEquals("生化", value(SECTION_LOCALIZATION_ID, "zh"));
        assertEquals("病毒学", value(VIROLOGY_LOCALIZATION_ID, "zh"));
        assertEquals("血清", value(SAMPLE_LOCALIZATION_ID, "zh"));
        assertEquals("血常规（CBC）", value(PANEL_LOCALIZATION_ID, "zh"));
        assertEquals("葡萄糖", value(GLUCOSE_NAME_LOCALIZATION_ID, "zh"));
        assertEquals("葡萄糖", value(GLUCOSE_REPORT_LOCALIZATION_ID, "zh"));
        assertEquals("白细胞计数（WBC）", value(GB_NAME_LOCALIZATION_ID, "zh"));
        assertEquals("白细胞计数（WBC）", value(GB_REPORT_LOCALIZATION_ID, "zh"));
        assertEquals("葡萄糖", value(MISMATCH_NAME_LOCALIZATION_ID, "zh"));

        assertNull("a longer name must not be prefix- or substring-matched",
                value(UNRELATED_LOCALIZATION_ID, "zh"));
        assertNull("an exact non-clinical test must remain outside the China clinical overlay",
                value(NON_CLINICAL_LOCALIZATION_ID, "zh"));
        assertNull("a distinct report label must not inherit a guessed translation",
                value(MISMATCH_REPORT_LOCALIZATION_ID, "zh"));

        assertEquals("Biochemistry", value(SECTION_LOCALIZATION_ID, "en"));
        assertEquals("Virologie", value(VIROLOGY_LOCALIZATION_ID, "en"));
        assertEquals("Serum", value(SAMPLE_LOCALIZATION_ID, "en"));
        assertEquals("NFS", value(PANEL_LOCALIZATION_ID, "en"));
        assertEquals("Glucose", value(GLUCOSE_NAME_LOCALIZATION_ID, "en"));
        assertEquals("Blood glucose report", value(MISMATCH_REPORT_LOCALIZATION_ID, "en"));
        assertEquals("Biochemistry", jdbcTemplate.queryForObject(
                "SELECT name FROM clinlims.test_section WHERE id = ?", String.class, SECTION_ID));
        assertEquals("Virologie", jdbcTemplate.queryForObject(
                "SELECT name FROM clinlims.test_section WHERE id = ?", String.class,
                VIROLOGY_SECTION_ID));
        assertEquals("Serum", jdbcTemplate.queryForObject(
                "SELECT description FROM clinlims.type_of_sample WHERE id = ?", String.class,
                SAMPLE_TYPE_ID));
        assertEquals("NFS", jdbcTemplate.queryForObject(
                "SELECT name FROM clinlims.panel WHERE id = ?", String.class, PANEL_ID));
        assertEquals("Glucose", jdbcTemplate.queryForObject(
                "SELECT name FROM clinlims.test WHERE id = ?", String.class, GLUCOSE_TEST_ID));

        long zhCount = localizedTargetCount();
        assertEquals("only the nine exact locale targets should receive zh values", 9L, zhCount);
        runMigration();
        assertEquals("a repeated deployment must not create duplicate zh rows", zhCount,
                localizedTargetCount());
        assertEquals("葡萄糖", value(GLUCOSE_REPORT_LOCALIZATION_ID, "zh"));
    }

    private void runMigration() throws IOException {
        String sql = FileCopyUtils.copyToString(new InputStreamReader(
                new ClassPathResource(MIGRATION_SQL_PATH).getInputStream(), StandardCharsets.UTF_8));
        assertTrue("core-lab localization SQL must not be empty", sql.trim().length() > 0);
        jdbcTemplate.execute(sql);
    }

    private void insertLocalization(long id, String englishValue) {
        jdbcTemplate.update("INSERT INTO clinlims.localization (id, description, lastupdated)"
                + " VALUES (?, ?, NOW())", id, "China core localization migration test");
        jdbcTemplate.update(
                "INSERT INTO clinlims.localization_value"
                        + " (id, localization_id, locale, value, last_updated)"
                        + " VALUES (nextval('clinlims.localization_value_seq'), ?, 'en', ?, NOW())",
                id, englishValue);
    }

    private void insertTest(long testId, long nameLocalizationId, Long reportingLocalizationId,
            String name, String domain) {
        jdbcTemplate.update(
                "INSERT INTO clinlims.test"
                        + " (id, name, description, is_active, guid, test_section_id,"
                        + " name_localization_id, reporting_name_localization_id, domain, lastupdated)"
                        + " VALUES (?, ?, ?, 'Y', ?, ?, ?, ?, ?, NOW())",
                testId, name, "China core localization migration test " + testId,
                UUID.randomUUID().toString(), SECTION_ID, nameLocalizationId,
                reportingLocalizationId, domain);
    }

    private String value(long localizationId, String locale) {
        return jdbcTemplate.query(
                "SELECT value FROM clinlims.localization_value WHERE localization_id = ? AND locale = ?",
                rs -> rs.next() ? rs.getString(1) : null, localizationId, locale);
    }

    private long localizedTargetCount() {
        StringBuilder placeholders = new StringBuilder();
        Object[] args = new Object[LOCALIZATION_IDS.length + 1];
        args[0] = "zh";
        for (int i = 0; i < LOCALIZATION_IDS.length; i++) {
            if (i > 0) {
                placeholders.append(',');
            }
            placeholders.append('?');
            args[i + 1] = LOCALIZATION_IDS[i];
        }
        return jdbcTemplate.queryForObject("SELECT count(*) FROM clinlims.localization_value"
                + " WHERE locale = ? AND localization_id IN (" + placeholders + ")", Long.class,
                args);
    }

    private void cleanSeededData() {
        if (jdbcTemplate == null) {
            return;
        }
        for (long testId : TEST_IDS) {
            jdbcTemplate.update("DELETE FROM clinlims.test WHERE id = ?", testId);
        }
        jdbcTemplate.update("DELETE FROM clinlims.panel WHERE id = ?", PANEL_ID);
        jdbcTemplate.update("DELETE FROM clinlims.type_of_sample WHERE id = ?", SAMPLE_TYPE_ID);
        jdbcTemplate.update("DELETE FROM clinlims.test_section WHERE id = ?", VIROLOGY_SECTION_ID);
        jdbcTemplate.update("DELETE FROM clinlims.test_section WHERE id = ?", HEMATOLOGY_SECTION_ID);
        jdbcTemplate.update("DELETE FROM clinlims.test_section WHERE id = ?", SECTION_ID);
        for (long localizationId : LOCALIZATION_IDS) {
            jdbcTemplate.update("DELETE FROM clinlims.localization_value WHERE localization_id = ?",
                    localizationId);
            jdbcTemplate.update("DELETE FROM clinlims.localization WHERE id = ?", localizationId);
        }
    }
}

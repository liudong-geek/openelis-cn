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
 * Targeting and idempotency coverage for the China delivery CBC master-data
 * localization overlay. The test executes the same SQL file as Liquibase.
 */
public class ChinaCommonMasterDataLocalizationMigrationTest extends BaseWebContextSensitiveTest {

    private static final String MIGRATION_SQL_PATH =
            "liquibase/3.5.x.x/071-cn-common-master-data-localization.sql";

    private static final long SECTION_ID = 997001L;
    private static final long SAMPLE_TYPE_ID = 997002L;
    private static final long WBC_TEST_ID = 997003L;
    private static final long WBC_LONG_TEST_ID = 997004L;
    private static final long HCT_TEST_ID = 997005L;
    private static final long CMCH_TEST_ID = 997006L;
    private static final long UNRELATED_TEST_ID = 997007L;

    private static final long SECTION_LOCALIZATION_ID = 998001L;
    private static final long SAMPLE_LOCALIZATION_ID = 998002L;
    private static final long WBC_LOCALIZATION_ID = 998003L;
    private static final long WBC_LONG_LOCALIZATION_ID = 998004L;
    private static final long HCT_LOCALIZATION_ID = 998005L;
    private static final long CMCH_LOCALIZATION_ID = 998006L;
    private static final long UNRELATED_LOCALIZATION_ID = 998007L;

    private static final long[] LOCALIZATION_IDS = { SECTION_LOCALIZATION_ID, SAMPLE_LOCALIZATION_ID,
            WBC_LOCALIZATION_ID, WBC_LONG_LOCALIZATION_ID, HCT_LOCALIZATION_ID, CMCH_LOCALIZATION_ID,
            UNRELATED_LOCALIZATION_ID };

    @Autowired
    private javax.sql.DataSource dataSource;

    private JdbcTemplate jdbcTemplate;

    @Before
    @Override
    public void setUp() throws Exception {
        super.setUp();
        jdbcTemplate = new JdbcTemplate(dataSource);
        cleanSeededData();

        insertLocalization(SECTION_LOCALIZATION_ID, "Hematology");
        insertLocalization(SAMPLE_LOCALIZATION_ID, "Whole Blood");
        insertLocalization(WBC_LOCALIZATION_ID, "WBC(Whole Blood)");
        insertLocalization(WBC_LONG_LOCALIZATION_ID, "White Blood Cells Count (WBC)");
        insertLocalization(HCT_LOCALIZATION_ID, "HCT");
        insertLocalization(CMCH_LOCALIZATION_ID, "CMCH");
        insertLocalization(UNRELATED_LOCALIZATION_ID, "WBC Research Control");

        jdbcTemplate.update(
                "INSERT INTO clinlims.test_section"
                        + " (id, name, description, is_external, is_active, name_localization_id, lastupdated)"
                        + " VALUES (?, 'Hematology', 'Hematology migration test', 'N', 'Y', ?, NOW())",
                SECTION_ID, SECTION_LOCALIZATION_ID);
        jdbcTemplate.update(
                "INSERT INTO clinlims.type_of_sample"
                        + " (id, description, domain, is_active, name_localization_id, lastupdated)"
                        + " VALUES (?, 'Whole Blood', 'H', true, ?, NOW())",
                SAMPLE_TYPE_ID, SAMPLE_LOCALIZATION_ID);

        insertTest(WBC_TEST_ID, WBC_LOCALIZATION_ID, "WBC(Whole Blood)");
        insertTest(WBC_LONG_TEST_ID, WBC_LONG_LOCALIZATION_ID, "White Blood Cells Count (WBC)");
        insertTest(HCT_TEST_ID, HCT_LOCALIZATION_ID, "HCT");
        insertTest(CMCH_TEST_ID, CMCH_LOCALIZATION_ID, "CMCH");
        insertTest(UNRELATED_TEST_ID, UNRELATED_LOCALIZATION_ID, "WBC Research Control");
    }

    @After
    public void tearDown() {
        cleanSeededData();
    }

    @Test
    public void migration_addsOnlyZhValues_preservesEnglish_andIsIdempotent() throws Exception {
        runMigration();

        assertEquals("血液学", value(SECTION_LOCALIZATION_ID, "zh"));
        assertEquals("全血", value(SAMPLE_LOCALIZATION_ID, "zh"));
        assertEquals("白细胞计数（WBC）", value(WBC_LOCALIZATION_ID, "zh"));
        assertEquals("白细胞计数（WBC）", value(WBC_LONG_LOCALIZATION_ID, "zh"));
        assertEquals("红细胞压积（HCT）", value(HCT_LOCALIZATION_ID, "zh"));
        assertEquals("平均红细胞血红蛋白浓度（MCHC）", value(CMCH_LOCALIZATION_ID, "zh"));

        assertEquals("Hematology", value(SECTION_LOCALIZATION_ID, "en"));
        assertEquals("Whole Blood", value(SAMPLE_LOCALIZATION_ID, "en"));
        assertEquals("WBC(Whole Blood)", value(WBC_LOCALIZATION_ID, "en"));
        assertEquals("Hematology", jdbcTemplate.queryForObject(
                "SELECT name FROM clinlims.test_section WHERE id = ?", String.class, SECTION_ID));
        assertEquals("Whole Blood", jdbcTemplate.queryForObject(
                "SELECT description FROM clinlims.type_of_sample WHERE id = ?", String.class, SAMPLE_TYPE_ID));
        assertNull("an unrelated WBC-prefixed master value must not be over-matched",
                value(UNRELATED_LOCALIZATION_ID, "zh"));

        long zhCount = localizedTargetCount();
        runMigration();
        assertEquals("a repeated deployment must not create duplicate zh rows", zhCount, localizedTargetCount());
        assertEquals("白细胞计数（WBC）", value(WBC_LOCALIZATION_ID, "zh"));
    }

    private void runMigration() throws IOException {
        String sql = FileCopyUtils.copyToString(new InputStreamReader(
                new ClassPathResource(MIGRATION_SQL_PATH).getInputStream(), StandardCharsets.UTF_8));
        assertTrue("master-data localization SQL must not be empty", sql.trim().length() > 0);
        jdbcTemplate.execute(sql);
    }

    private void insertLocalization(long id, String englishValue) {
        jdbcTemplate.update("INSERT INTO clinlims.localization (id, description, lastupdated) VALUES (?, ?, NOW())",
                id, "China CBC localization migration test");
        jdbcTemplate.update(
                "INSERT INTO clinlims.localization_value"
                        + " (id, localization_id, locale, value, last_updated)"
                        + " VALUES (nextval('clinlims.localization_value_seq'), ?, 'en', ?, NOW())",
                id, englishValue);
    }

    private void insertTest(long testId, long localizationId, String name) {
        jdbcTemplate.update(
                "INSERT INTO clinlims.test"
                        + " (id, name, description, is_active, guid, name_localization_id, lastupdated)"
                        + " VALUES (?, ?, ?, 'Y', ?, ?, NOW())",
                testId, name, name, UUID.randomUUID().toString(), localizationId);
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
                + " WHERE locale = ? AND localization_id IN (" + placeholders + ")", Long.class, args);
    }

    private void cleanSeededData() {
        if (jdbcTemplate == null) {
            return;
        }
        jdbcTemplate.update("DELETE FROM clinlims.test WHERE id BETWEEN ? AND ?", WBC_TEST_ID, UNRELATED_TEST_ID);
        jdbcTemplate.update("DELETE FROM clinlims.type_of_sample WHERE id = ?", SAMPLE_TYPE_ID);
        jdbcTemplate.update("DELETE FROM clinlims.test_section WHERE id = ?", SECTION_ID);
        for (long localizationId : LOCALIZATION_IDS) {
            jdbcTemplate.update("DELETE FROM clinlims.localization_value WHERE localization_id = ?", localizationId);
            jdbcTemplate.update("DELETE FROM clinlims.localization WHERE id = ?", localizationId);
        }
    }
}

package org.openelisglobal.common.management.service;

import static org.junit.Assert.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.AppTestConfig;
import org.openelisglobal.BaseTestConfig;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.audittrail.daoimpl.AuditTrailServiceImpl;
import org.openelisglobal.common.management.form.SampleTypeBasicInfoForm;
import org.openelisglobal.history.service.HistoryService;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.testcatalog.form.TestCatalogBasicInfo;
import org.openelisglobal.testcatalog.service.TestCatalogBasicInfoService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Service calls really commit/flush against the disposable PostgreSQL database.
 */
@ContextConfiguration(classes = { BaseTestConfig.class, AppTestConfig.class,
        AdminBasicEditPersistenceTest.TestConfig.class })
public class AdminBasicEditPersistenceTest extends BaseWebContextSensitiveTest {
    @Configuration(proxyBeanMethods = false)
    @org.springframework.context.annotation.Import({ SampleTypeManagementServiceImpl.class,
            org.openelisglobal.integration.outbox.HisResultOutboxServiceImpl.class,
            org.openelisglobal.integration.outbox.HisResultOutboxRepositoryImpl.class })
    public static class TestConfig {
    }

    @Autowired
    private SampleTypeManagementService samples;
    @Autowired
    private TestCatalogBasicInfoService catalog;
    @Autowired
    private TypeOfSampleService types;
    @Autowired
    private HistoryService histories;
    @Autowired
    private ReferenceTablesService references;
    @PersistenceContext
    private EntityManager entityManager;
    private Object sampleTarget, catalogTarget;
    private AuditTrailService previousSampleAudit, previousCatalogAudit;

    @Before
    public void prepare() throws Exception {
        cleanup();
        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);
        for (int i = 1; i <= 2; i++) {
            jdbcTemplate.update("INSERT INTO clinlims.localization (id, description,lastupdated) VALUES (?, ?, NOW())",
                    985100 + i, "Basic specimen " + i);
            for (String locale : List.of("en", "fr", "zh"))
                jdbcTemplate.update(
                        "INSERT INTO clinlims.localization_value (id, localization_id,locale,value,last_updated) VALUES (?, ?, ?, ?, NOW())",
                        985500 + i * 10 + List.of("en", "fr", "zh").indexOf(locale), 985100 + i, locale,
                        locale.equals("zh") ? "原标本" + i : locale + " specimen " + i);
            jdbcTemplate.update(
                    "INSERT INTO clinlims.type_of_sample (id,description,domain,local_abbrev,whonet_code,disposal_instructions,is_active,sort_order,name_localization_id,lastupdated) VALUES (?, ?, 'H', ?, 'BLD', '原处置', true, ?, ?, NOW())",
                    985000 + i, "Internal specimen " + i, "BAS" + i, 17 + i, 985100 + i);
        }
        jdbcTemplate.update(
                "INSERT INTO clinlims.localization (id,description,lastupdated) VALUES (985103,'Basic section',NOW())");
        jdbcTemplate.update(
                "INSERT INTO clinlims.localization_value (id,localization_id,locale,value,last_updated) VALUES (985531,985103,'en','Basic section',NOW())");
        jdbcTemplate.update(
                "INSERT INTO clinlims.test_section (id,name,description,is_active,is_external,sort_order,name_localization_id,lastupdated) VALUES (985301,'BasicEdit section','BasicEdit section','N','N',1,985103,NOW())");
        jdbcTemplate.update(
                "INSERT INTO clinlims.test (id,name,description,local_code,is_active,guid,domain,orderable,lastupdated) VALUES (985201,'BasicEdit test','BasicEdit test','BEFORE','Y',?,'CLINICAL',true,NOW())",
                UUID.randomUUID().toString());
        jdbcTemplate.update(
                "INSERT INTO clinlims.sampletype_test (id,test_id,sample_type_id,display_order) VALUES (985401,985201,985001,3)");
        types.clearCache();
        var realAudit = new AuditTrailServiceImpl();
        ReflectionTestUtils.setField(realAudit, "historyService", histories);
        ReflectionTestUtils.setField(realAudit, "referenceTablesService", references);
        sampleTarget = AopTestUtils.getUltimateTargetObject(samples);
        catalogTarget = AopTestUtils.getUltimateTargetObject(catalog);
        previousSampleAudit = (AuditTrailService) ReflectionTestUtils.getField(sampleTarget, "audit");
        previousCatalogAudit = (AuditTrailService) ReflectionTestUtils.getField(catalogTarget, "audit");
        ReflectionTestUtils.setField(sampleTarget, "audit", realAudit);
        ReflectionTestUtils.setField(catalogTarget, "audit", realAudit);
    }

    @After
    public void finish() {
        if (sampleTarget != null)
            ReflectionTestUtils.setField(sampleTarget, "audit", previousSampleAudit);
        if (catalogTarget != null)
            ReflectionTestUtils.setField(catalogTarget, "audit", previousCatalogAudit);
        cleanup();
        types.clearCache();
        LocaleContextHolder.resetLocaleContext();
    }

    private void cleanup() {
        jdbcTemplate.execute("ALTER TABLE clinlims.sampletype_test DROP CONSTRAINT IF EXISTS chg067_rejected_link");
        jdbcTemplate.execute("ALTER TABLE clinlims.history DROP CONSTRAINT IF EXISTS chg067_rejected_audit");
        jdbcTemplate.update("DELETE FROM clinlims.history WHERE reference_id IN (985001,985002,985101,985102,985201)");
        jdbcTemplate.update(
                "DELETE FROM clinlims.sampletype_test WHERE test_id=985201 OR sample_type_id IN (985001,985002)");
        jdbcTemplate.update("DELETE FROM clinlims.test WHERE id=985201");
        jdbcTemplate.update("DELETE FROM clinlims.test_section WHERE id=985301");
        jdbcTemplate.update("DELETE FROM clinlims.type_of_sample WHERE id IN (985001,985002)");
        jdbcTemplate.update("DELETE FROM clinlims.localization_value WHERE localization_id IN (985101,985102,985103)");
        jdbcTemplate.update("DELETE FROM clinlims.localization WHERE id IN (985101,985102,985103)");
    }

    @Test
    public void chinesePartialSavePreservesRawLocalesIdentifierAndAllUnsentMetadata() {
        SampleTypeBasicInfoForm body = new SampleTypeBasicInfoForm();
        body.setNameZh("新中文标本");
        body.setId("985002");
        SampleTypeBasicInfoForm saved = samples.save("985001", body, TEST_SYS_USER_ID);
        assertEquals("985001", saved.getId());
        assertEquals("新中文标本", saved.getTranslations().get("zh"));
        SampleTypeBasicInfoForm fresh = samples.read("985001");
        assertEquals("en specimen 1", fresh.getTranslations().get("en"));
        assertEquals("fr specimen 1", fresh.getTranslations().get("fr"));
        assertEquals("新中文标本", fresh.getName());
        assertEquals("Internal specimen 1", fresh.getDescription());
        assertEquals("BAS1", fresh.getAbbreviation());
        assertEquals(18, fresh.getSortOrder());
        assertEquals("BLD", fresh.getWhonetCode());
        assertEquals("原处置", fresh.getDisposalInstructions());
        assertEquals("原标本2", samples.read("985002").getTranslations().get("zh"));
        String history = auditXml("985101", "LOCALIZATION");
        assertTrue(history.contains("<zhBefore>原标本1</zhBefore>"));
        assertTrue(history.contains("<zhAfter>新中文标本</zhAfter>"));
        assertTrue(history.contains("<businessId>985001</businessId>"));
        assertTrue(history.contains("<configurationType>sampleType</configurationType>"));
        assertFalse(history.contains("<enBefore>"));
        assertFalse(history.contains("<frBefore>"));
    }

    @Test
    public void oldEnglishNameContractPreservesChineseFrenchAndInternalIdentifier() {
        SampleTypeBasicInfoForm body = new SampleTypeBasicInfoForm();
        body.setName("Changed English");
        samples.save("985001", body, TEST_SYS_USER_ID);
        Map<String, String> names = samples.read("985001").getTranslations();
        assertEquals("Changed English", names.get("en"));
        assertEquals("fr specimen 1", names.get("fr"));
        assertEquals("原标本1", names.get("zh"));
        assertEquals("Internal specimen 1", samples.read("985001").getDescription());
        assertTrue(auditXml("985101", "LOCALIZATION").contains("<enBefore>en specimen 1</enBefore>"));
    }

    @Test
    public void rawReadDoesNotInventChineseFromEnglishFallback() {
        jdbcTemplate.update("DELETE FROM clinlims.localization_value WHERE localization_id=985101 AND locale='zh'");
        SampleTypeBasicInfoForm fresh = samples.read("985001");
        assertEquals("en specimen 1", fresh.getName());
        assertFalse(fresh.getTranslations().containsKey("zh"));
    }

    @Test
    public void firstChineseValuePersistsWithoutDroppingExistingLocales() {
        jdbcTemplate.update("DELETE FROM clinlims.localization_value WHERE localization_id=985101 AND locale='zh'");
        SampleTypeBasicInfoForm body = new SampleTypeBasicInfoForm();
        body.setNameZh("首次中文");
        samples.save("985001", body, TEST_SYS_USER_ID);
        assertEquals(Map.of("en", "en specimen 1", "fr", "fr specimen 1", "zh", "首次中文"),
                samples.read("985001").getTranslations());
        assertTrue(auditXml("985101", "LOCALIZATION").contains("<zhBefore></zhBefore>"));
    }

    @Test
    public void explicitBlankChineseRejectsBeforeAnyDatabaseWrite() {
        SampleTypeBasicInfoForm body = new SampleTypeBasicInfoForm();
        body.setNameZh(" ");
        body.setAbbreviation("CHANGED");
        try {
            samples.save("985001", body, TEST_SYS_USER_ID);
            fail();
        } catch (IllegalArgumentException expected) {
        }
        assertSampleBaseline();
        assertEquals(0, historyCount());
    }

    @Test
    public void chineseDatabaseTextFailureRollsBackMetadataAndAllNamesAndAudit() {
        types.getTypeOfSampleNameForId("985001");
        SampleTypeBasicInfoForm body = new SampleTypeBasicInfoForm();
        body.setNameZh("未提交\0中文");
        body.setAbbreviation("CHANGED");
        body.setIsActive(false);
        assertPgFailure(() -> samples.save("985001", body, TEST_SYS_USER_ID), "22021");
        assertSampleBaseline();
        assertEquals(0, historyCount());
        assertEquals("原标本1", types.getTypeOfSampleNameForId("985001"));
    }

    @Test
    public void sampleAuditFailureRollsBackTheAlreadyFlushedEntityAndTranslation() {
        jdbcTemplate.execute(
                "ALTER TABLE clinlims.history ADD CONSTRAINT chg067_rejected_audit CHECK (reference_id NOT IN (985001,985101))");
        SampleTypeBasicInfoForm body = new SampleTypeBasicInfoForm();
        body.setNameZh("不应提交");
        body.setAbbreviation("CHANGED");
        assertPgFailure(() -> samples.save("985001", body, TEST_SYS_USER_ID), "23514");
        assertSampleBaseline();
        assertEquals(0, historyCount());
    }

    @Test
    public void committedChineseNameInvalidatesCachedSampleNameAtNextRead() {
        assertEquals("原标本1", types.getTypeOfSampleNameForId("985001"));
        SampleTypeBasicInfoForm body = new SampleTypeBasicInfoForm();
        body.setNameZh("缓存新名称");
        samples.save("985001", body, TEST_SYS_USER_ID);
        assertEquals("缓存新名称", types.getTypeOfSampleNameForId("985001"));
    }

    @Test
    public void metadataSnapshotHasIndependentOldAndNewValuesAndUser() {
        SampleTypeBasicInfoForm body = new SampleTypeBasicInfoForm();
        body.setAbbreviation("AFTER");
        body.setIsActive(false);
        samples.save("985001", body, TEST_SYS_USER_ID);
        String xml = auditXml("985001", "TYPE_OF_SAMPLE");
        assertTrue(xml.contains("<abbreviationBefore>BAS1</abbreviationBefore>"));
        assertTrue(xml.contains("<abbreviationAfter>AFTER</abbreviationAfter>"));
        assertTrue(xml.contains("<isActiveBefore>true</isActiveBefore>"));
        assertTrue(xml.contains("<isActiveAfter>false</isActiveAfter>"));
        assertEquals(0, histories
                .getHistoryByRefIdAndRefTableId("985101", references.getReferenceTableByName("LOCALIZATION").getId())
                .size());
    }

    @Test
    public void catalogAtomicSaveCommitsSectionTestLinksAndAuditAndIgnoresGuidAndBodyId() {
        String guid = catalog.read("985201").testGuid;
        TestCatalogBasicInfo body = catalogUpdate();
        body.testGuid = "attempted replacement";
        body.testId = "985202";
        TestCatalogBasicInfo saved = catalog.save("985201", body, TEST_SYS_USER_ID);
        assertEquals("985201", saved.testId);
        assertEquals(guid, saved.testGuid);
        assertEquals(List.of("985002"), saved.sampleTypeIds);
        TestCatalogBasicInfo fresh = catalog.read("985201");
        assertEquals("AFTER", fresh.code);
        assertEquals("985301", fresh.labUnitId);
        assertEquals("Y", jdbcTemplate.queryForObject("SELECT is_active FROM clinlims.test_section WHERE id=985301",
                String.class));
        assertEquals(List.of("985002"), fresh.sampleTypeIds);
        String xml = auditXml("985201", "TEST");
        assertTrue(xml.contains("<codeBefore>BEFORE</codeBefore>"));
        assertTrue(xml.contains("<codeAfter>AFTER</codeAfter>"));
        assertTrue(xml.contains("<sampleTypeIdsBefore>985001</sampleTypeIdsBefore>"));
        assertTrue(xml.contains("<sampleTypeIdsAfter>985002</sampleTypeIdsAfter>"));
    }

    @Test
    public void catalogLateJunctionFailureRollsBackSectionTestDeletedLinksAndHistory() {
        jdbcTemplate.execute(
                "ALTER TABLE clinlims.sampletype_test ADD CONSTRAINT chg067_rejected_link CHECK (test_id<>985201 OR sample_type_id<>985002)");
        assertPgFailure(() -> catalog.save("985201", catalogUpdate(), TEST_SYS_USER_ID), "23514");
        TestCatalogBasicInfo fresh = catalog.read("985201");
        assertEquals("BEFORE", fresh.code);
        assertNull(fresh.labUnitId);
        assertEquals(List.of("985001"), fresh.sampleTypeIds);
        assertEquals("N", jdbcTemplate.queryForObject("SELECT is_active FROM clinlims.test_section WHERE id=985301",
                String.class));
        assertEquals(0, historyCount());
    }

    @Test
    public void catalogAuditFailureRollsBackAllRelatedWrites() {
        jdbcTemplate.execute(
                "ALTER TABLE clinlims.history ADD CONSTRAINT chg067_rejected_audit CHECK (reference_id<>985201)");
        assertPgFailure(() -> catalog.save("985201", catalogUpdate(), TEST_SYS_USER_ID), "23514");
        TestCatalogBasicInfo fresh = catalog.read("985201");
        assertEquals("BEFORE", fresh.code);
        assertNull(fresh.labUnitId);
        assertEquals(List.of("985001"), fresh.sampleTypeIds);
        assertEquals("N", jdbcTemplate.queryForObject("SELECT is_active FROM clinlims.test_section WHERE id=985301",
                String.class));
        assertEquals(0, historyCount());
    }

    @Test
    public void catalogCannotChangeNameOrActivateThroughBasicInfo() {
        TestCatalogBasicInfo bad = new TestCatalogBasicInfo();
        bad.name = "Renamed";
        bad.code = "AFTER";
        try {
            catalog.save("985201", bad, TEST_SYS_USER_ID);
            fail();
        } catch (IllegalArgumentException expected) {
        }
        assertEquals("BEFORE", catalog.read("985201").code);
        TestCatalogBasicInfo deactivate = new TestCatalogBasicInfo();
        deactivate.active = false;
        catalog.save("985201", deactivate, TEST_SYS_USER_ID);
        TestCatalogBasicInfo activate = new TestCatalogBasicInfo();
        activate.active = true;
        catalog.save("985201", activate, TEST_SYS_USER_ID);
        assertFalse(catalog.read("985201").active);
    }

    @Test
    public void auditCandidateScanUsesReadOnlyRepeatableReadDetachesRowsAndStableNumericTies() {
        insertAuditCandidates(601);
        var checked = new AtomicBoolean();
        var result = histories.scanSystemEventHistory(auditStart(), auditEnd(), TEST_SYS_USER_ID, List.of(auditTable()),
                "U", history -> {
                    assertFalse("Candidate scan must not accumulate managed history", entityManager.contains(history));
                    if (checked.compareAndSet(false, true)) {
                        var settings = entityManager.unwrap(org.hibernate.Session.class).doReturningWork(connection -> {
                            try (var statement = connection.createStatement()) {
                                String isolation;
                                String readOnly;
                                try (var settingsRow = statement.executeQuery("SHOW transaction_isolation")) {
                                    assertTrue(settingsRow.next());
                                    isolation = settingsRow.getString(1);
                                }
                                try (var settingsRow = statement.executeQuery("SHOW transaction_read_only")) {
                                    assertTrue(settingsRow.next());
                                    readOnly = settingsRow.getString(1);
                                }
                                return Map.of("isolation", isolation, "readOnly", readOnly);
                            }
                        });
                        assertEquals("repeatable read", settings.get("isolation"));
                        assertEquals("on", settings.get("readOnly"));
                    }
                    return true;
                }, 499L, 3, true);
        assertTrue(checked.get());
        assertEquals(601L, result.total);
        assertEquals(List.of("9000102", "9000101", "9000100"), result.events.stream().map(h -> h.getId()).toList());
    }

    @Test
    public void auditCandidatesKeepDatabaseDateUserActionAndRegisteredTableFilters() {
        insertAuditCandidates(2);
        jdbcTemplate.update(
                "INSERT INTO clinlims.history(id,sys_user_id,reference_id,reference_table,timestamp,activity) VALUES(9000003,1,985101,?,'2026-10-03 10:00:00','U')",
                Integer.valueOf(auditTable()));
        jdbcTemplate.update(
                "INSERT INTO clinlims.history(id,sys_user_id,reference_id,reference_table,timestamp,activity) VALUES(9000004,1,985101,?,'2026-10-04 10:00:00','I')",
                Integer.valueOf(auditTable()));
        jdbcTemplate.update(
                "INSERT INTO clinlims.history(id,sys_user_id,reference_id,reference_table,timestamp,activity) VALUES(9000005,1,985101,?,'2026-10-04 10:00:00','U')",
                Integer.valueOf(references.getReferenceTableByName("TEST").getId()));
        var selected = histories.scanSystemEventHistory(auditStart(), auditEnd(), TEST_SYS_USER_ID,
                List.of(auditTable()), "U", h -> true, 0, 30, true);
        assertEquals(2L, selected.total);
        assertEquals(List.of("9000002", "9000001"), selected.events.stream().map(h -> h.getId()).toList());
        assertEquals(0L, histories.scanSystemEventHistory(auditStart(), auditEnd(), "999999", List.of(auditTable()),
                "U", h -> true, 0, 30, true).total);
        assertEquals(0L, histories.scanSystemEventHistory(auditStart(), auditEnd(), TEST_SYS_USER_ID, List.of(), "U",
                h -> true, 0, 30, true).total);
    }

    @Test
    public void auditBatchesKeepOneDatabaseSnapshotAcrossAConcurrentCommittedInsert() {
        insertAuditCandidates(601);
        var inserted = new AtomicBoolean();
        var selected = histories.scanSystemEventHistory(auditStart(), auditEnd(), TEST_SYS_USER_ID,
                List.of(auditTable()), "U", h -> {
                    if (inserted.compareAndSet(false, true)) {
                        try (var connection = jdbcTemplate.getDataSource().getConnection();
                                var statement = connection.prepareStatement(
                                        "INSERT INTO clinlims.history(id,sys_user_id,reference_id,reference_table,timestamp,activity) VALUES(9000602,1,985101,?,'2026-10-04 10:00:00','U')")) {
                            connection.setAutoCommit(true);
                            statement.setInt(1, Integer.parseInt(auditTable()));
                            assertEquals(1, statement.executeUpdate());
                        } catch (SQLException e) {
                            throw new AssertionError(e);
                        }
                    }
                    return true;
                }, 499L, 3, true);
        assertEquals(601L, selected.total);
        assertEquals(List.of("9000102", "9000101", "9000100"), selected.events.stream().map(h -> h.getId()).toList());
        assertEquals(602L, histories.getSystemEventHistoryCount(auditStart(), auditEnd(), TEST_SYS_USER_ID,
                List.of(auditTable()), "U", null, null));
    }

    @Test
    public void auditTotalScansBeyondExportCapAndRetainsOnlyRequestedPageOrExportRows() {
        insertAuditCandidates(10005);
        var page = histories.scanSystemEventHistory(auditStart(), auditEnd(), TEST_SYS_USER_ID, List.of(auditTable()),
                "U", h -> true, 10000L, 100, true);
        assertEquals(10005L, page.total);
        assertEquals(List.of("9000005", "9000004", "9000003", "9000002", "9000001"),
                page.events.stream().map(h -> h.getId()).toList());
        var export = histories.scanSystemEventHistory(auditStart(), auditEnd(), TEST_SYS_USER_ID, List.of(auditTable()),
                "U", h -> true, 0, 10000, false);
        assertEquals(10000, export.events.size());
        assertEquals("9010005", export.events.get(0).getId());
        assertEquals("9000006", export.events.get(9999).getId());
    }

    private void insertAuditCandidates(int count) {
        jdbcTemplate.update(
                "INSERT INTO clinlims.history(id,sys_user_id,reference_id,reference_table,timestamp,activity) SELECT 9000000+g,1,985101,?,'2026-10-04 10:00:00'::timestamp,'U' FROM generate_series(1,?) g",
                Integer.parseInt(auditTable()), count);
    }

    private String auditTable() {
        return references.getReferenceTableByName("LOCALIZATION").getId();
    }

    private Timestamp auditStart() {
        return Timestamp.valueOf("2026-10-04 00:00:00");
    }

    private Timestamp auditEnd() {
        return Timestamp.valueOf("2026-10-04 23:59:59");
    }

    private TestCatalogBasicInfo catalogUpdate() {
        var f = new TestCatalogBasicInfo();
        f.code = "AFTER";
        f.labUnitId = "985301";
        f.sampleTypeIds = List.of("985002");
        return f;
    }

    private void assertSampleBaseline() {
        SampleTypeBasicInfoForm f = samples.read("985001");
        assertEquals("原标本1", f.getTranslations().get("zh"));
        assertEquals("en specimen 1", f.getTranslations().get("en"));
        assertEquals("fr specimen 1", f.getTranslations().get("fr"));
        assertEquals("BAS1", f.getAbbreviation());
        assertTrue(f.getIsActive());
        assertEquals("Internal specimen 1", f.getDescription());
        assertEquals(18, f.getSortOrder());
    }

    private int historyCount() {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM clinlims.history WHERE reference_id IN (985001,985101,985201)", Integer.class);
    }

    private String auditXml(String id, String table) {
        var rows = histories.getHistoryByRefIdAndRefTableId(id, references.getReferenceTableByName(table).getId());
        assertEquals(1, rows.size());
        assertEquals(TEST_SYS_USER_ID, rows.get(0).getSysUserId());
        return new String(rows.get(0).getChanges(), StandardCharsets.UTF_8);
    }

    private void assertPgFailure(Runnable action, String state) {
        try {
            action.run();
            fail("Expected actual PostgreSQL persistence failure");
        } catch (RuntimeException expected) {
            for (Throwable cause = expected; cause != null; cause = cause.getCause())
                if (cause instanceof SQLException sql && state.equals(sql.getSQLState()))
                    return;
            throw new AssertionError("Missing PostgreSQL SQLSTATE " + state, expected);
        }
    }
}

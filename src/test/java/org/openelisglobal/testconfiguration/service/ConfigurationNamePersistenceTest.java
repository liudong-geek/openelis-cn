package org.openelisglobal.testconfiguration.service;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.AppTestConfig;
import org.openelisglobal.BaseTestConfig;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.audittrail.daoimpl.AuditTrailServiceImpl;
import org.openelisglobal.audittrail.valueholder.History;
import org.openelisglobal.history.service.HistoryService;
import org.openelisglobal.integration.outbox.HisResultOutboxService;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.testconfiguration.form.PanelRenameEntryForm;
import org.openelisglobal.testconfiguration.form.TestSectionRenameEntryForm;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Full ORM/PostgreSQL transaction tests against BaseTestConfig's disposable
 * test database.
 */
@ContextConfiguration(classes = { BaseTestConfig.class, AppTestConfig.class,
        ConfigurationNamePersistenceTest.TestConfig.class })
public class ConfigurationNamePersistenceTest extends BaseWebContextSensitiveTest {
    @Configuration
    static class TestConfig {
        @Bean
        HisResultOutboxService hisResultOutboxService() {
            // Outbox startup is unrelated to configuration names and must not send
            // messages.
            return org.mockito.Mockito.mock(HisResultOutboxService.class);
        }
    }

    @Autowired
    private ConfigurationNameService names;
    @Autowired
    private PanelService panels;
    @Autowired
    private TestSectionService sections;
    @Autowired
    private HistoryService histories;
    @Autowired
    private ReferenceTablesService references;
    private Object serviceTarget;
    private AuditTrailService originalAudit;
    private String referenceId;

    @Before
    public void prepare() throws Exception {
        executeDataSetWithStateManagement("testdata/configuration-name-rename.xml");
        referenceId = references.getReferenceTableByName("LOCALIZATION").getId();
        jdbcTemplate.update(
                "DELETE FROM clinlims.history WHERE reference_table = ?::numeric AND reference_id IN (990141, 990173)",
                referenceId);
        AuditTrailServiceImpl realAudit = new AuditTrailServiceImpl();
        ReflectionTestUtils.setField(realAudit, "historyService", histories);
        ReflectionTestUtils.setField(realAudit, "referenceTablesService", references);
        serviceTarget = AopTestUtils.getUltimateTargetObject(names);
        originalAudit = (AuditTrailService) ReflectionTestUtils.getField(serviceTarget, "auditTrail");
        ReflectionTestUtils.setField(serviceTarget, "auditTrail", realAudit);
    }

    @After
    public void restore() {
        if (serviceTarget != null && originalAudit != null) {
            ReflectionTestUtils.setField(serviceTarget, "auditTrail", originalAudit);
        }
        LocaleContextHolder.resetLocaleContext();
    }

    @Test
    public void panelChineseSaveCommitsAllLocalesAndExactAuditSnapshot() {
        PanelRenameEntryForm form = panelForm("新组合名称");
        names.renamePanel(form, TEST_SYS_USER_ID);
        Map<String, String> persisted = names.getPanelTranslations("990041");
        assertEquals("Panel English Updated", persisted.get("en"));
        assertEquals("Panel French Updated", persisted.get("fr"));
        assertEquals("新组合名称", persisted.get("zh"));
        for (Locale locale : new Locale[] { Locale.CHINESE, Locale.SIMPLIFIED_CHINESE }) {
            LocaleContextHolder.setLocale(locale);
            assertEquals("新组合名称", panels.getPanelById("990041").getLocalizedName());
        }
        List<History> saved = histories.getHistoryByRefIdAndRefTableId("990141", referenceId);
        assertEquals(1, saved.size());
        assertEquals(TEST_SYS_USER_ID, saved.get(0).getSysUserId());
        String xml = new String(saved.get(0).getChanges(), StandardCharsets.UTF_8);
        assertTrue(xml.contains("<zhBefore>原组合名称</zhBefore>"));
        assertTrue(xml.contains("<zhAfter>新组合名称</zhAfter>"));
        assertTrue(xml.contains("<enBefore>Panel English</enBefore>"));
        assertTrue(xml.contains("<enAfter>Panel English Updated</enAfter>"));
        assertTrue(xml.contains("<businessId>990041</businessId>"));
    }

    @Test
    public void groupChineseSaveCommitsAllLocalesAndExactAuditSnapshot() {
        names.renameTestSection(sectionForm("新专业组名称"), TEST_SYS_USER_ID);
        Map<String, String> persisted = names.getTestSectionTranslations("990073");
        assertEquals("Group English Updated", persisted.get("en"));
        assertEquals("Group French Updated", persisted.get("fr"));
        assertEquals("新专业组名称", persisted.get("zh"));
        for (Locale locale : new Locale[] { Locale.CHINESE, Locale.SIMPLIFIED_CHINESE }) {
            LocaleContextHolder.setLocale(locale);
            assertEquals("新专业组名称", sections.getTestSectionById("990073").getLocalizedName());
        }
        List<History> saved = histories.getHistoryByRefIdAndRefTableId("990173", referenceId);
        assertEquals(1, saved.size());
        String xml = new String(saved.get(0).getChanges(), StandardCharsets.UTF_8);
        assertTrue(xml.contains("<zhBefore>原专业组名称</zhBefore>"));
        assertTrue(xml.contains("<zhAfter>新专业组名称</zhAfter>"));
        assertTrue(xml.contains("<configurationType>testSection</configurationType>"));
    }

    @Test
    public void oldEnglishFrenchClientDoesNotDeleteChineseInDatabase() {
        names.renamePanel(panelForm(null), TEST_SYS_USER_ID);
        assertEquals("原组合名称", names.getPanelTranslations("990041").get("zh"));
        List<History> saved = histories.getHistoryByRefIdAndRefTableId("990141", referenceId);
        assertEquals(1, saved.size());
        assertFalse(new String(saved.get(0).getChanges(), StandardCharsets.UTF_8).contains("<zhBefore>"));
    }

    @Test
    public void firstChineseTranslationCreatesARealValueWithAuditedEmptyPreviousName() {
        jdbcTemplate.update("DELETE FROM clinlims.localization_value WHERE localization_id = 990141 AND locale = 'zh'");
        names.renamePanel(panelForm("首次中文组合名称"), TEST_SYS_USER_ID);
        Map<String, String> persisted = names.getPanelTranslations("990041");
        assertEquals("首次中文组合名称", persisted.get("zh"));
        assertEquals("Panel English Updated", persisted.get("en"));
        assertEquals("Panel French Updated", persisted.get("fr"));
        assertEquals(Integer.valueOf(1), jdbcTemplate.queryForObject(
                "SELECT count(*) FROM clinlims.localization_value WHERE localization_id = 990141 AND locale = 'zh'",
                Integer.class));
        List<History> saved = histories.getHistoryByRefIdAndRefTableId("990141", referenceId);
        assertEquals(1, saved.size());
        String xml = new String(saved.get(0).getChanges(), StandardCharsets.UTF_8);
        assertTrue(xml.contains("<zhBefore></zhBefore>"));
        assertTrue(xml.contains("<zhAfter>首次中文组合名称</zhAfter>"));
    }

    @Test
    public void panelDatabaseTextFailureRollsBackAllLocalesAndHistory() {
        Map<String, String> before = names.getPanelTranslations("990041");
        int historyCount = histories.getHistoryByRefIdAndRefTableId("990141", referenceId).size();
        PanelRenameEntryForm form = panelForm("未提交中文");
        form.setNameFrench("PostgreSQL rejects" + '\0' + "inside text");
        expectDatabaseFailure(() -> names.renamePanel(form, TEST_SYS_USER_ID), "22021");
        assertEquals(before, names.getPanelTranslations("990041"));
        assertEquals(historyCount, histories.getHistoryByRefIdAndRefTableId("990141", referenceId).size());
    }

    @Test
    public void auditForeignKeyFailureRollsBackGroupTranslationAndHistory() {
        Map<String, String> before = names.getTestSectionTranslations("990073");
        int historyCount = histories.getHistoryByRefIdAndRefTableId("990173", referenceId).size();
        expectDatabaseFailure(() -> names.renameTestSection(sectionForm("未提交专业组中文"), "999999999"), "23503");
        assertEquals(before, names.getTestSectionTranslations("990073"));
        assertEquals(historyCount, histories.getHistoryByRefIdAndRefTableId("990173", referenceId).size());
    }

    private void expectDatabaseFailure(Runnable action, String expectedSqlState) {
        try {
            action.run();
            fail("Expected actual PostgreSQL persistence failure");
        } catch (RuntimeException expected) {
            Throwable cause = expected;
            org.postgresql.util.PSQLException postgres = null;
            while (cause != null) {
                if (cause instanceof org.postgresql.util.PSQLException) {
                    postgres = (org.postgresql.util.PSQLException) cause;
                    break;
                }
                cause = cause.getCause();
            }
            assertNotNull("Failure must originate from PostgreSQL, not a mocked or fixture error", postgres);
            assertEquals(expectedSqlState, postgres.getSQLState());
        }
    }

    private PanelRenameEntryForm panelForm(String chinese) {
        PanelRenameEntryForm form = new PanelRenameEntryForm();
        form.setPanelId("990041");
        form.setNameEnglish("Panel English Updated");
        form.setNameFrench("Panel French Updated");
        form.setNameChinese(chinese);
        return form;
    }

    private TestSectionRenameEntryForm sectionForm(String chinese) {
        TestSectionRenameEntryForm form = new TestSectionRenameEntryForm();
        form.setTestSectionId("990073");
        form.setNameEnglish("Group English Updated");
        form.setNameFrench("Group French Updated");
        form.setNameChinese(chinese);
        return form;
    }
}

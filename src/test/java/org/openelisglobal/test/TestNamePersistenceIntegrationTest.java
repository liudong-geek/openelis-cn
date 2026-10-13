package org.openelisglobal.test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analyzer.form.OpenELISFieldForm;
import org.openelisglobal.analyzer.service.OpenELISFieldService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.configuration.service.DomainConfigurationHandler;
import org.openelisglobal.localization.service.LocalizationService;
import org.openelisglobal.localization.service.LocalizationServiceImpl;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.testcatalog.service.TestCatalogCreationService;
import org.openelisglobal.testconfiguration.controller.TestRenameEntryController;
import org.openelisglobal.testconfiguration.controller.rest.TestRenameEntryRestController;
import org.openelisglobal.testconfiguration.form.TestRenameEntryForm;
import org.openelisglobal.testconfiguration.service.TestModifyService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.i18n.LocaleContext;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.web.servlet.mvc.support.RedirectAttributesModelMap;

/**
 * Real Hibernate flushes against the existing isolated PostgreSQL test
 * container.
 */
public class TestNamePersistenceIntegrationTest extends BaseWebContextSensitiveTest {

    @Autowired
    private TestService testService;
    @Autowired
    private TestCatalogCreationService creationService;
    @Autowired
    private OpenELISFieldService fieldService;
    @Autowired
    private TestModifyService modifyService;
    @Autowired
    private LocalizationService localizationService;
    @Autowired
    private TestRenameEntryController renameController;
    @Autowired
    private TestRenameEntryRestController renameRestController;
    @Autowired
    @Qualifier("testConfigurationHandler")
    private DomainConfigurationHandler configurationHandler;
    @Autowired
    private DataSource dataSource;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @PersistenceContext
    private EntityManager entityManager;

    private JdbcTemplate jdbc;
    private LocaleContext previousLocale;
    private final List<String> createdTestIds = new ArrayList<>();

    @Before
    public void prepareTestNames() throws Exception {
        previousLocale = LocaleContextHolder.getLocaleContext();
        LocaleContextHolder.setLocale(Locale.ENGLISH);
        executeDataSetWithStateManagement("testdata/test.xml");
        jdbc = new JdbcTemplate(dataSource);
        jdbc.update("INSERT INTO clinlims.localization_value (id, localization_id, locale, value) "
                + "VALUES (90001, 1, 'zh', '结核检验')");
    }

    @After
    public void restoreLocale() {
        LocaleContextHolder.setLocaleContext(previousLocale);
        for (String id : createdTestIds) {
            jdbc.update("DELETE FROM clinlims.test_result_component WHERE test_id = ?", Long.valueOf(id));
            jdbc.update("DELETE FROM clinlims.test WHERE id = ?", Long.valueOf(id));
        }
    }

    @Test
    public void englishAndChineseReadsAndFlushesPreserveStoredNameAndVersion() {
        Map<String, Object> before = storedName();
        assertEquals("Complete Blood Count", before.get("name"));

        for (Locale locale : List.of(Locale.ENGLISH, Locale.SIMPLIFIED_CHINESE)) {
            LocaleContextHolder.setLocale(locale);
            new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                var tests = testService.getTestsByTestSectionIds(List.of("1"));
                assertEquals(1, tests.size());
                assertEquals(locale.equals(Locale.ENGLISH) ? "TB" : "结核检验", tests.get(0).getName());
                assertEquals(tests.get(0).getName(), tests.get(0).getLocalizedName());
                entityManager.flush();
            });
            assertEquals("Reading names in " + locale + " must not write the entity", before, storedName());
        }
    }

    @Test
    public void explicitSetNameStillPersistsAndAdvancesVersionWithoutChangingLocalizedDisplay() {
        Map<String, Object> before = storedName();
        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            var test = testService.get("1");
            test.setName("Explicit catalog name");
            assertEquals("结核检验", test.getName());
            entityManager.flush();
        });

        Map<String, Object> after = storedName();
        assertEquals("Explicit catalog name", after.get("name"));
        assertNotEquals("An explicit edit must retain optimistic versioning", before.get("lastupdated"),
                after.get("lastupdated"));
    }

    @Test
    public void catalogCreationPersistsItsNameAlongsideLocalizedDisplay() {
        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);
        var params = new TestCatalogCreationService.CreateTestParams();
        params.name = "Name persistence catalog";
        params.description = "A distinct descriptive value";
        params.domain = "CLINICAL";
        String id = creationService.createInactiveTest(params, "1");
        createdTestIds.add(id);

        assertEquals(params.name,
                jdbc.queryForObject("SELECT name FROM clinlims.test WHERE id = ?", String.class, Long.valueOf(id)));
        assertEquals(params.name, testService.get(id).getName());
    }

    @Test
    public void configurationCreationPersistsEnglishFallbackAlongsideChineseDisplay() throws Exception {
        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);
        String csv = "testName,testSection,localization:en,localization:zh\n"
                + "NamePersistenceCSV,TB,Canonical English,中文导入名称\n";
        configurationHandler.processConfiguration(new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8)),
                "test-name-persistence.csv");
        String id = jdbc.queryForObject("SELECT id::text FROM clinlims.test WHERE description = ?", String.class,
                "NamePersistenceCSV");
        createdTestIds.add(id);

        assertEquals("Canonical English",
                jdbc.queryForObject("SELECT name FROM clinlims.test WHERE id = ?", String.class, Long.valueOf(id)));
        assertEquals("中文导入名称", testService.get(id).getName());
    }

    @Test
    public void analyzerFieldCreationPersistsItsNameAlongsideLocalizedDisplay() {
        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);
        var form = new OpenELISFieldForm();
        form.setEntityType(OpenELISFieldForm.EntityType.TEST);
        form.setFieldName("Name persistence analyzer field");
        String id = fieldService.createField(form);
        createdTestIds.add(id);

        assertEquals(form.getFieldName(),
                jdbc.queryForObject("SELECT name FROM clinlims.test WHERE id = ?", String.class, Long.valueOf(id)));
        assertEquals(form.getFieldName(), testService.get(id).getName());
    }

    @Test
    public void directRenamePersistsEnglishBaseNameAndPreservesChineseDisplay() {
        prepareRenameLocalizations();
        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);
        var test = testService.get("1");
        var name = test.getLocalizedTestName();
        var reportingName = test.getLocalizedReportingName();
        name.setEnglish("  Explicit English rename  ");
        reportingName.setEnglish("  Explicit English report  ");
        modifyService.updateTestNames("1", name, reportingName, "1");

        assertEquals("Explicit English rename", storedName().get("name"));
        var renamed = testService.get("1");
        assertEquals("结核检验", renamed.getName());
        assertEquals("Explicit English report", renamed.getLocalizedReportingName().getLocalizedValue(Locale.ENGLISH));
    }

    @Test
    public void bothLegacyRenameEntriesPersistEnglishAndRetainUnsubmittedChinese() {
        prepareRenameLocalizations();
        jdbc.update("INSERT INTO clinlims.supported_locale "
                + "(id, locale_code, display_name, is_active, is_fallback, sort_order) "
                + "VALUES (90001, 'zh', '中文', true, false, 3)");
        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);
        var request = new MockHttpServletRequest();
        var user = new UserSessionData();
        user.setSytemUserId(1);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, user);

        for (boolean rest : List.of(false, true)) {
            var form = new TestRenameEntryForm();
            form.setTestId("1");
            form.setNameEnglish(rest ? "  REST English rename  " : "  MVC English rename  ");
            form.setNameFrench("Nom français");
            form.setReportNameEnglish(rest ? "REST English report" : "MVC English report");
            form.setReportNameFrench("Rapport français");
            var binding = new BeanPropertyBindingResult(form, "form");
            if (rest) {
                renameRestController.updateTestRenameEntry(request, form, binding, new RedirectAttributesModelMap());
            } else {
                renameController.updateTestRenameEntry(request, form, binding, new RedirectAttributesModelMap());
            }
            assertEquals(form.getNameEnglish().trim(), storedName().get("name"));
            var renamed = testService.get("1");
            assertEquals("结核检验", renamed.getName());
            assertEquals("Nom français", renamed.getLocalizedTestName().getLocalizedValue(Locale.FRENCH));
            assertEquals(form.getReportNameEnglish(),
                    renamed.getLocalizedReportingName().getLocalizedValue(Locale.ENGLISH));
            assertEquals("Rapport français", renamed.getLocalizedReportingName().getLocalizedValue(Locale.FRENCH));
            assertEquals(form.getReportNameEnglish(),
                    renamed.getLocalizedReportingName().getLocalizedValue(Locale.SIMPLIFIED_CHINESE));
            assertFalse("An en/fr form must not manufacture a zh reporting translation",
                    renamed.getLocalizedReportingName().getValues().containsKey("zh"));
        }
    }

    private void prepareRenameLocalizations() {
        // The legacy read fixture omits localization versions. Rename requires a
        // persisted version, as in test-modify-service.xml, and a separate report name.
        jdbc.update("UPDATE clinlims.localization SET lastupdated = TIMESTAMP '2025-01-01 00:00:00' WHERE id = 1");
        jdbc.update("UPDATE clinlims.localization_value SET last_updated = TIMESTAMP '2025-01-01 00:00:00' "
                + "WHERE localization_id = 1");
        var report = LocalizationServiceImpl.createNewLocalization("Initial report", "Rapport initial",
                LocalizationServiceImpl.LocalizationType.REPORTING_TEST_NAME);
        report.setSysUserId("1");
        String reportId = localizationService.insert(report);
        jdbc.update("UPDATE clinlims.test SET reporting_name_localization_id = ? WHERE id = 1", Long.valueOf(reportId));
        var test = testService.get("1");
        assertNotEquals(test.getLocalizedTestName().getId(), test.getLocalizedReportingName().getId());
        assertNotNull(test.getLocalizedTestName().getLastupdated());
        assertNotNull(test.getLocalizedReportingName().getLastupdated());
    }

    private Map<String, Object> storedName() {
        return jdbc.queryForMap("SELECT name, lastupdated FROM clinlims.test WHERE id = 1");
    }
}

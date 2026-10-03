package org.openelisglobal.testconfiguration.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.localization.service.LocalizationService;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.panel.valueholder.Panel;
import org.openelisglobal.renametestsection.service.RenameTestSectionService;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.testconfiguration.form.PanelRenameEntryForm;
import org.openelisglobal.testconfiguration.form.TestSectionRenameEntryForm;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public class ConfigurationNameServiceTest {
    private PanelService panels;
    private RenameTestSectionService sections;
    private LocalizationService localizations;
    private DisplayListService lists;
    private TestSectionService sectionNames;
    private ConfigurationNameServiceImpl service;
    private AuditTrailService auditTrail;
    private Localization name;
    private Object originalSpringFactory;

    @Before
    public void setUp() {
        panels = mock(PanelService.class);
        sections = mock(RenameTestSectionService.class);
        localizations = mock(LocalizationService.class);
        lists = mock(DisplayListService.class);
        sectionNames = mock(TestSectionService.class);
        auditTrail = mock(AuditTrailService.class);
        service = new ConfigurationNameServiceImpl(panels, sections, localizations, lists, sectionNames, auditTrail);
        name = new Localization();
        name.setId("987");
        name.setLocalizedValue("en", "Original English");
        name.setLocalizedValue("fr", "Original French");
        name.setLocalizedValue("zh", "原中文名称");
        name.setLocalizedValue("pt", "Portuguese");
        when(panels.getLocalizationForPanel("41")).thenReturn(name);
        when(sections.getLocalizationForRenameTestSection("73")).thenReturn(name);
        originalSpringFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        DefaultListableBeanFactory factory = new DefaultListableBeanFactory();
        when(localizations.getLocalizedValueById("987")).thenAnswer(invocation -> name.getLocalizedValue());
        when(sectionNames.getUserLocalizedTesSectionName(any(TestSection.class))).thenAnswer(
                invocation -> ((TestSection) invocation.getArgument(0)).getLocalization().getLocalizedValue());
        factory.registerSingleton("localizations", localizations);
        factory.registerSingleton("sections", sectionNames);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        TransactionSynchronizationManager.initSynchronization();
    }

    @After
    public void tearDown() {
        TransactionSynchronizationManager.clearSynchronization();
        ReflectionTestUtils.setField(SpringContext.class, "factory", originalSpringFactory);
        LocaleContextHolder.resetLocaleContext();
    }

    @Test
    public void panelWriteUsesBusinessIdAndAuditsChineseWithoutChangingOtherLocales() {
        service.renamePanel(panelForm(" 肝功能组合 "), "12");
        verify(panels).getLocalizationForPanel("41");
        verify(localizations).update(same(name));
        assertEquals("English", name.getValuesAsMap().get("en"));
        assertEquals("French", name.getValuesAsMap().get("fr"));
        assertEquals("肝功能组合", name.getValuesAsMap().get("zh"));
        assertEquals("Portuguese", name.getValuesAsMap().get("pt"));
        assertEquals("12", name.getSysUserId());
        for (String locale : new String[] { "en", "fr", "zh" }) {
            assertEquals("12", name.getValues().get(locale).getSysUserId());
        }
        verifyZeroInteractions(lists, sectionNames);
        commitCallbacks();
        verify(lists).invalidateLists(ListType.PANELS, ListType.PANELS_ACTIVE, ListType.PANELS_INACTIVE);
        verifyZeroInteractions(sectionNames);
    }

    @Test
    public void professionalGroupWriteInvalidatesAllAffectedCachesOnlyAfterCommit() {
        service.renameTestSection(sectionForm("临床生化组"), "12");
        verify(sections).getLocalizationForRenameTestSection("73");
        verify(localizations).update(same(name));
        assertEquals("临床生化组", name.getValuesAsMap().get("zh"));
        verifyZeroInteractions(lists, sectionNames);
        commitCallbacks();
        verify(lists).invalidateLists(ListType.TEST_SECTION_ACTIVE, ListType.TEST_SECTION_INACTIVE,
                ListType.TEST_SECTION_BY_NAME);
        verify(sectionNames).invalidateNames();
    }

    @Test
    public void oldPanelClientOmittingChinesePreservesOriginalTranslation() {
        service.renamePanel(panelForm(null), "12");
        assertEquals("原中文名称", name.getValuesAsMap().get("zh"));
        assertNull(name.getValues().get("zh").getSysUserId());
        verify(localizations).update(same(name));
    }

    @Test
    public void oldGroupClientOmittingChinesePreservesOriginalTranslation() {
        service.renameTestSection(sectionForm(null), "12");
        assertEquals("原中文名称", name.getValuesAsMap().get("zh"));
        verify(localizations).update(same(name));
    }

    @Test
    public void panelWithoutChineseCreatesCanonicalZhValueWithAuditActor() {
        name.getValues().remove("zh");
        service.renamePanel(panelForm("凝血功能组合"), "12");
        assertEquals("凝血功能组合", name.getValuesAsMap().get("zh"));
        assertSame(name, name.getValues().get("zh").getLocalization());
        assertEquals("12", name.getValues().get("zh").getSysUserId());
        verify(localizations).update(same(name));
    }

    @Test
    public void blankChineseCannotEraseExistingName() {
        expectFailure(IllegalArgumentException.class, () -> service.renamePanel(panelForm("  "), "12"));
        assertEquals("原中文名称", name.getValuesAsMap().get("zh"));
        verifyZeroInteractions(localizations, lists, sectionNames);
    }

    @Test
    public void blankFrenchAndEnglishAreRejectedBeforePersistence() {
        PanelRenameEntryForm form = panelForm("组合");
        form.setNameFrench(" ");
        expectFailure(IllegalArgumentException.class, () -> service.renamePanel(form, "12"));
        form.setNameFrench("French");
        form.setNameEnglish(null);
        expectFailure(IllegalArgumentException.class, () -> service.renamePanel(form, "12"));
        verifyZeroInteractions(localizations, lists, sectionNames);
    }

    @Test
    public void invalidBusinessIdIsRejectedBeforeLookup() {
        PanelRenameEntryForm form = panelForm("组合");
        form.setPanelId("41 OR 1=1");
        expectFailure(IllegalArgumentException.class, () -> service.renamePanel(form, "12"));
        verifyZeroInteractions(panels, localizations, lists, sectionNames);
    }

    @Test
    public void missingActorCannotWriteOrReachBusinessLookup() {
        expectFailure(AccessDeniedException.class, () -> service.renamePanel(panelForm("组合"), null));
        verifyZeroInteractions(panels, localizations, lists, sectionNames);
    }

    @Test
    public void unknownPanelDoesNotPretendToSave() {
        PanelRenameEntryForm form = panelForm("组合");
        form.setPanelId("999");
        expectFailure(NoSuchElementException.class, () -> service.renamePanel(form, "12"));
        verify(panels).getLocalizationForPanel("999");
        verifyZeroInteractions(localizations, lists, sectionNames);
    }

    @Test
    public void unknownGroupDoesNotPretendToSave() {
        TestSectionRenameEntryForm form = sectionForm("组");
        form.setTestSectionId("999");
        expectFailure(NoSuchElementException.class, () -> service.renameTestSection(form, "12"));
        verify(sections).getLocalizationForRenameTestSection("999");
        verifyZeroInteractions(localizations, lists, sectionNames);
    }

    @Test
    public void panelPersistenceFailurePropagatesAndRegistersNoCacheInvalidation() {
        doThrow(new LIMSRuntimeException("database unavailable")).when(localizations).update(name);
        expectFailure(LIMSRuntimeException.class, () -> service.renamePanel(panelForm("组合"), "12"));
        assertTrue(TransactionSynchronizationManager.getSynchronizations().isEmpty());
        verifyZeroInteractions(lists, sectionNames);
    }

    @Test
    public void groupPersistenceFailurePropagatesAndRegistersNoCacheInvalidation() {
        doThrow(new LIMSRuntimeException("database unavailable")).when(localizations).update(name);
        expectFailure(LIMSRuntimeException.class, () -> service.renameTestSection(sectionForm("组"), "12"));
        assertTrue(TransactionSynchronizationManager.getSynchronizations().isEmpty());
        verifyZeroInteractions(lists, sectionNames);
    }

    @Test
    public void rolledBackWriteDoesNotInvalidateCaches() {
        service.renamePanel(panelForm("组合"), "12");
        for (TransactionSynchronization callback : TransactionSynchronizationManager.getSynchronizations()) {
            callback.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }
        verifyZeroInteractions(lists, sectionNames);
    }

    @Test
    public void persistedZhNameAppearsInPanelAndGroupForZhAndZhCnRequests() {
        service.renamePanel(panelForm("新中文名称"), "12");
        Panel panel = new Panel();
        panel.setLocalization(name);
        TestSection section = new TestSection();
        section.setLocalization(name);
        for (Locale locale : new Locale[] { Locale.CHINESE, Locale.SIMPLIFIED_CHINESE }) {
            LocaleContextHolder.setLocale(locale);
            assertEquals("新中文名称", panel.getLocalizedName());
            assertEquals("新中文名称", section.getLocalizedName());
        }
        verify(localizations).update(same(name));
    }

    @Test
    public void translationReadCompilesExactLocaleMapWithinServiceAndCannotMutateEntity() {
        Map<String, String> result = service.getPanelTranslations("41");
        result.put("zh", "outside edit");
        assertEquals("原中文名称", name.getValuesAsMap().get("zh"));
        verify(panels).getLocalizationForPanel("41");
        assertEquals("原中文名称", service.getTestSectionTranslations("73").get("zh"));
        verify(sections).getLocalizationForRenameTestSection("73");
    }

    @Test
    public void missingChineseReadContainsNoEnglishFallback() {
        name.getValues().remove("zh");
        assertFalse(service.getPanelTranslations("41").containsKey("zh"));
        assertEquals("Original English", name.getLocalizedValue(Locale.CHINESE));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void auditContainsBusinessContextAndExactBeforeAndAfterValues() {
        service.renamePanel(panelForm("新中文名称"), "12");
        ArgumentCaptor<Map> changes = ArgumentCaptor.forClass(Map.class);
        verify(auditTrail).saveNamedChanges(eq("987"), eq("LOCALIZATION"), eq("12"), changes.capture());
        assertEquals("Original English", changes.getValue().get("enBefore"));
        assertEquals("English", changes.getValue().get("enAfter"));
        assertEquals("Original French", changes.getValue().get("frBefore"));
        assertEquals("French", changes.getValue().get("frAfter"));
        assertEquals("原中文名称", changes.getValue().get("zhBefore"));
        assertEquals("新中文名称", changes.getValue().get("zhAfter"));
        assertEquals("41", changes.getValue().get("businessId"));
        assertEquals("panel", changes.getValue().get("configurationType"));
    }

    @Test
    public void failedAuditPropagatesAndCannotInvalidateCacheBeforeRollback() {
        doThrow(new LIMSRuntimeException("audit unavailable")).when(auditTrail).saveNamedChanges(eq("987"),
                eq("LOCALIZATION"), eq("12"), anyMap());
        expectFailure(LIMSRuntimeException.class, () -> service.renamePanel(panelForm("新中文名称"), "12"));
        assertTrue(TransactionSynchronizationManager.getSynchronizations().isEmpty());
        verifyZeroInteractions(lists, sectionNames);
    }

    private PanelRenameEntryForm panelForm(String chinese) {
        PanelRenameEntryForm form = new PanelRenameEntryForm();
        form.setPanelId("41");
        form.setNameEnglish(" English ");
        form.setNameFrench(" French ");
        form.setNameChinese(chinese);
        return form;
    }

    private TestSectionRenameEntryForm sectionForm(String chinese) {
        TestSectionRenameEntryForm form = new TestSectionRenameEntryForm();
        form.setTestSectionId("73");
        form.setNameEnglish(" English ");
        form.setNameFrench(" French ");
        form.setNameChinese(chinese);
        return form;
    }

    private void commitCallbacks() {
        for (TransactionSynchronization callback : TransactionSynchronizationManager.getSynchronizations()) {
            callback.afterCommit();
        }
    }

    private void expectFailure(Class<? extends RuntimeException> type, Runnable operation) {
        try {
            operation.run();
            fail("Expected " + type.getSimpleName());
        } catch (RuntimeException error) {
            assertTrue("Unexpected exception " + error, type.isInstance(error));
        }
    }
}

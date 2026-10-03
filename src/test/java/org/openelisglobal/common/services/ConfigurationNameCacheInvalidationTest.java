package org.openelisglobal.common.services;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.panel.valueholder.Panel;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.dao.TestSectionDAO;
import org.openelisglobal.test.service.TestSectionServiceImpl;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

public class ConfigurationNameCacheInvalidationTest {
    private DisplayListService lists;
    private PanelService panels;
    private Panel panel;
    private Object originalSpringFactory;
    private Map<ListType, List<IdValuePair>> originalCache;

    @SuppressWarnings("unchecked")
    @Before
    public void setUp() {
        lists = new DisplayListService();
        panels = mock(PanelService.class);
        ReflectionTestUtils.setField(lists, "panelService", panels);
        originalCache = (Map<ListType, List<IdValuePair>>) ReflectionTestUtils.getField(DisplayListService.class,
                "typeToListMap");
        ReflectionTestUtils.setField(DisplayListService.class, "typeToListMap",
                new HashMap<ListType, List<IdValuePair>>());
        ((Map<?, ?>) ReflectionTestUtils.getField(DisplayListService.class, "freshListCacheTimes")).clear();
        ((Set<?>) ReflectionTestUtils.getField(DisplayListService.class, "invalidatedLists")).clear();
        panel = new Panel();
        panel.setId("41");
        panel.setIsActive("Y");
        panel.setSortOrder("1");
        Localization localization = new Localization();
        localization.setLocalizedValue("en", "English");
        localization.setLocalizedValue("zh", "原组合名称");
        panel.setLocalization(localization);
        when(panels.getAllPanels()).thenAnswer(invocation -> new ArrayList<>(List.of(panel)));
        originalSpringFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        DefaultListableBeanFactory factory = new DefaultListableBeanFactory();
        org.openelisglobal.localization.service.LocalizationService localizations = mock(
                org.openelisglobal.localization.service.LocalizationService.class);
        localization.setId("987");
        when(localizations.getLocalizedValueById("987")).thenAnswer(invocation -> localization.getLocalizedValue());
        factory.registerSingleton("localizations", localizations);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);
    }

    @After
    public void cleanUp() {
        ReflectionTestUtils.setField(DisplayListService.class, "typeToListMap", originalCache);
        ((Map<?, ?>) ReflectionTestUtils.getField(DisplayListService.class, "freshListCacheTimes")).clear();
        ((Set<?>) ReflectionTestUtils.getField(DisplayListService.class, "invalidatedLists")).clear();
        LocaleContextHolder.resetLocaleContext();
        ReflectionTestUtils.setField(SpringContext.class, "factory", originalSpringFactory);
    }

    @Test
    public void normalListReadRebuildsCommittedNameAfterInvalidation() {
        lists.refreshList(ListType.PANELS);
        assertEquals("原组合名称", lists.getList(ListType.PANELS).get(0).getValue());
        panel.getLocalization().setLocalizedValue("zh", "新组合名称");
        lists.invalidateLists(ListType.PANELS);
        assertEquals("新组合名称", lists.getList(ListType.PANELS).get(0).getValue());
        verify(panels, times(2)).getAllPanels();
        lists.getList(ListType.PANELS);
        verifyNoMoreInteractions(panels);
    }

    @Test
    public void freshListReadCannotKeepOldValueWithinTtlAfterInvalidation() {
        assertEquals("原组合名称", lists.getFreshList(ListType.PANELS_ACTIVE).get(0).getValue());
        panel.getLocalization().setLocalizedValue("zh", "新组合名称");
        lists.invalidateLists(ListType.PANELS_ACTIVE);
        assertEquals("新组合名称", lists.getFreshList(ListType.PANELS_ACTIVE).get(0).getValue());
        verify(panels, times(2)).getAllPanels();
        lists.getFreshList(ListType.PANELS_ACTIVE);
        verifyNoMoreInteractions(panels);
    }

    @Test
    public void failedRefreshKeepsListDirtyForRetry() {
        lists.refreshList(ListType.PANELS);
        lists.invalidateLists(ListType.PANELS);
        when(panels.getAllPanels()).thenThrow(new LIMSRuntimeException("unavailable"));
        try {
            lists.getList(ListType.PANELS);
            fail("Expected database failure");
        } catch (LIMSRuntimeException expected) {
        }
        panel.getLocalization().setLocalizedValue("zh", "恢复后的新名称");
        doAnswer(invocation -> new ArrayList<>(List.of(panel))).when(panels).getAllPanels();
        assertEquals("恢复后的新名称", lists.getList(ListType.PANELS).get(0).getValue());
        verify(panels, times(3)).getAllPanels();
    }

    @Test
    public void invalidatingPanelDoesNotRebuildUnrelatedCachedList() {
        lists.refreshList(ListType.PANELS);
        lists.refreshList(ListType.PANELS_ACTIVE);
        panel.getLocalization().setLocalizedValue("zh", "新名称");
        lists.invalidateLists(ListType.PANELS);
        assertEquals("原组合名称", lists.getList(ListType.PANELS_ACTIVE).get(0).getValue());
        assertEquals("新名称", lists.getList(ListType.PANELS).get(0).getValue());
        verify(panels, times(3)).getAllPanels();
    }

    @Test
    public void rolledBackNameWriteKeepsTheActualCachedListWithoutRequeryingTheDatabase() {
        lists.refreshList(ListType.PANELS);
        List<IdValuePair> committedList = lists.getList(ListType.PANELS);
        when(panels.getLocalizationForPanel("41")).thenReturn(panel.getLocalization());
        org.openelisglobal.testconfiguration.service.ConfigurationNameService names = new org.openelisglobal.testconfiguration.service.ConfigurationNameServiceImpl(
                panels, mock(org.openelisglobal.renametestsection.service.RenameTestSectionService.class),
                mock(org.openelisglobal.localization.service.LocalizationService.class), lists,
                mock(org.openelisglobal.test.service.TestSectionService.class),
                mock(org.openelisglobal.audittrail.dao.AuditTrailService.class));
        org.openelisglobal.testconfiguration.form.PanelRenameEntryForm form = new org.openelisglobal.testconfiguration.form.PanelRenameEntryForm();
        form.setPanelId("41");
        form.setNameEnglish("Pending English");
        form.setNameFrench("Pending French");
        form.setNameChinese("未提交的中文名称");
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        try {
            names.renamePanel(form, "12");
            for (org.springframework.transaction.support.TransactionSynchronization callback : org.springframework.transaction.support.TransactionSynchronizationManager
                    .getSynchronizations()) {
                callback.afterCompletion(
                        org.springframework.transaction.support.TransactionSynchronization.STATUS_ROLLED_BACK);
            }
            assertSame(committedList, lists.getList(ListType.PANELS));
            assertEquals("原组合名称", lists.getList(ListType.PANELS).get(0).getValue());
            verify(panels, times(1)).getAllPanels();
        } finally {
            org.springframework.transaction.support.TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    public void professionalGroupNameCacheRebuildsLazilyWithoutDatabaseDuringInvalidation() {
        TestSectionServiceImpl sectionNames = new TestSectionServiceImpl();
        TestSectionDAO dao = mock(TestSectionDAO.class);
        TestSection section = new TestSection();
        section.setId("73");
        section.setLocalization(panel.getLocalization());
        ReflectionTestUtils.setField(sectionNames, "baseObjectDAO", dao);
        when(dao.getAllTestSections()).thenReturn(List.of(section));
        sectionNames.refreshNames();
        assertEquals("原组合名称", sectionNames.getUserLocalizedTestSectionName("73"));
        panel.getLocalization().setLocalizedValue("zh", "新专业组名称");
        sectionNames.invalidateNames();
        verify(dao, times(1)).getAllTestSections();
        assertEquals("新专业组名称", sectionNames.getUserLocalizedTestSectionName("73"));
        verify(dao, times(2)).getAllTestSections();
    }
}

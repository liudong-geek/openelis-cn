package org.openelisglobal.testconfiguration.service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.localization.service.LocalizationService;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.renametestsection.service.RenameTestSectionService;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.testconfiguration.form.PanelRenameEntryForm;
import org.openelisglobal.testconfiguration.form.TestSectionRenameEntryForm;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Updates names through their business IDs in a single transaction. */
@Service
public class ConfigurationNameServiceImpl implements ConfigurationNameService {
    private final PanelService panels;
    private final RenameTestSectionService testSections;
    private final LocalizationService localizations;
    private final DisplayListService displayLists;
    private final TestSectionService testSectionNames;
    private final AuditTrailService auditTrail;

    public ConfigurationNameServiceImpl(PanelService panels, RenameTestSectionService testSections,
            LocalizationService localizations, DisplayListService displayLists, TestSectionService testSectionNames,
            AuditTrailService auditTrail) {
        this.panels = panels;
        this.testSections = testSections;
        this.localizations = localizations;
        this.displayLists = displayLists;
        this.testSectionNames = testSectionNames;
        this.auditTrail = auditTrail;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, String> getPanelTranslations(String panelId) {
        Localization name = panels.getLocalizationForPanel(panelId);
        return name == null ? null : name.getValuesAsMap();
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, String> getTestSectionTranslations(String testSectionId) {
        Localization name = testSections.getLocalizationForRenameTestSection(testSectionId);
        return name == null ? null : name.getValuesAsMap();
    }

    @Override
    @Transactional
    public void renamePanel(PanelRenameEntryForm form, String userId) {
        validate(form.getPanelId(), form.getNameEnglish(), form.getNameFrench(), form.getNameChinese(), userId);
        rename(panels.getLocalizationForPanel(form.getPanelId()), form.getNameEnglish(), form.getNameFrench(),
                form.getNameChinese(), userId, "panel", form.getPanelId());
        invalidateAfterCommit(false, ListType.PANELS, ListType.PANELS_ACTIVE, ListType.PANELS_INACTIVE);
    }

    @Override
    @Transactional
    public void renameTestSection(TestSectionRenameEntryForm form, String userId) {
        validate(form.getTestSectionId(), form.getNameEnglish(), form.getNameFrench(), form.getNameChinese(), userId);
        rename(testSections.getLocalizationForRenameTestSection(form.getTestSectionId()), form.getNameEnglish(),
                form.getNameFrench(), form.getNameChinese(), userId, "testSection", form.getTestSectionId());
        invalidateAfterCommit(true, ListType.TEST_SECTION_ACTIVE, ListType.TEST_SECTION_INACTIVE,
                ListType.TEST_SECTION_BY_NAME);
    }

    private void validate(String id, String english, String french, String chinese, String userId) {
        if (StringUtils.isBlank(userId)) {
            throw new AccessDeniedException("No authenticated user for configuration rename");
        }
        if (id == null || !id.matches("[0-9]+") || StringUtils.isBlank(english) || StringUtils.isBlank(french)
                || chinese != null && StringUtils.isBlank(chinese)) {
            throw new IllegalArgumentException("Invalid configuration rename request");
        }
    }

    private void rename(Localization name, String english, String french, String chinese, String userId,
            String configurationType, String businessId) {
        if (name == null) {
            throw new NoSuchElementException("Configuration name not found");
        }
        Map<String, String> before = name.getValuesAsMap();
        setTranslation(name, "en", english, userId);
        setTranslation(name, "fr", french, userId);
        // Old clients do not send Chinese. Preserve it rather than replacing it with
        // English.
        if (chinese != null) {
            setTranslation(name, "zh", chinese, userId);
        }
        name.setSysUserId(userId);
        localizations.update(name);
        Map<String, String> changes = new LinkedHashMap<>();
        Map<String, String> after = name.getValuesAsMap();
        for (String locale : new String[] { "en", "fr", "zh" }) {
            if (!Objects.equals(before.get(locale), after.get(locale))) {
                changes.put(locale + "Before", before.get(locale));
                changes.put(locale + "After", after.get(locale));
            }
        }
        if (!changes.isEmpty()) {
            changes.put("configurationType", configurationType);
            changes.put("businessId", businessId);
            auditTrail.saveNamedChanges(name.getId(), "LOCALIZATION", userId, changes);
        }
    }

    private void setTranslation(Localization name, String locale, String value, String userId) {
        name.setLocalizedValue(locale, value.trim());
        name.getValues().get(locale).setSysUserId(userId);
    }

    private void invalidateAfterCommit(boolean section, ListType... lists) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                displayLists.invalidateLists(lists);
                if (section) {
                    testSectionNames.invalidateNames();
                }
            }
        });
    }
}

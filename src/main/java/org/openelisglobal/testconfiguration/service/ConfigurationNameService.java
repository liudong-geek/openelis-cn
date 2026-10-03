package org.openelisglobal.testconfiguration.service;

import java.util.Map;
import org.openelisglobal.testconfiguration.form.PanelRenameEntryForm;
import org.openelisglobal.testconfiguration.form.TestSectionRenameEntryForm;

public interface ConfigurationNameService {
    Map<String, String> getPanelTranslations(String panelId);

    Map<String, String> getTestSectionTranslations(String testSectionId);

    void renamePanel(PanelRenameEntryForm form, String userId);

    void renameTestSection(TestSectionRenameEntryForm form, String userId);
}

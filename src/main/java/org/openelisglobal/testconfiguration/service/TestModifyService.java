package org.openelisglobal.testconfiguration.service;

import java.util.List;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.testconfiguration.controller.TestModifyEntryController.TestAddParams;
import org.openelisglobal.testconfiguration.controller.TestModifyEntryController.TestSet;

public interface TestModifyService {

    void updateTestSets(List<TestSet> testSets, TestAddParams testAddParams, Localization nameLocalization,
            Localization reportingNameLocalization, String currentUserId);

    void updateTestNames(String testId, Localization nameLocalization, Localization reportingNameLocalization,
            String currentUserId);

    void updateTestNames(String testId, String nameEnglish, String nameFrench, String reportNameEnglish,
            String reportNameFrench, String currentUserId);
}

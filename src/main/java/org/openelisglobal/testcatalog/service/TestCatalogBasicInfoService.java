package org.openelisglobal.testcatalog.service;

import org.openelisglobal.testcatalog.form.TestCatalogBasicInfo;

public interface TestCatalogBasicInfoService {
    TestCatalogBasicInfo read(String testId);

    TestCatalogBasicInfo save(String testId, TestCatalogBasicInfo form, String actor);
}

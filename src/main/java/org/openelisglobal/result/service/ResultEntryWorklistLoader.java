package org.openelisglobal.result.service;

import java.util.List;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.test.beanItems.TestResultItem;

/**
 * Isolates the legacy result-loading utility behind a service boundary so the
 * pending worklist can be tested without bootstrapping its static form-field
 * configuration.
 */
public interface ResultEntryWorklistLoader {

    List<TestResultItem> load(List<Analysis> analyses, String systemUserId);
}

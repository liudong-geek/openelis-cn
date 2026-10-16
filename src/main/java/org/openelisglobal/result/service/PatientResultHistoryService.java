package org.openelisglobal.result.service;

import java.util.List;
import java.util.Set;
import org.openelisglobal.common.rest.provider.bean.patientHistory.PanelDisplay;
import org.openelisglobal.common.rest.provider.bean.patientHistory.ResultTree;

public interface PatientResultHistoryService {

    List<ResultTree> getResultTree(String patientId);

    List<ResultTree> getResultTree(String patientId, Set<String> permittedSectionIds);

    PanelDisplay getTestResultTree(String patientId, String testId);

    PanelDisplay getTestResultTree(String patientId, String testId, Set<String> permittedSectionIds);
}

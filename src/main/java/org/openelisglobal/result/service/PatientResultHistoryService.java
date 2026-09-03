package org.openelisglobal.result.service;

import java.util.List;
import org.openelisglobal.common.rest.provider.bean.patientHistory.PanelDisplay;
import org.openelisglobal.common.rest.provider.bean.patientHistory.ResultTree;

public interface PatientResultHistoryService {

    List<ResultTree> getResultTree(String patientId);

    PanelDisplay getTestResultTree(String patientId, String testId);
}

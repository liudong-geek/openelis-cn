package org.openelisglobal.result.service;

import java.util.List;
import java.util.Map;
import org.openelisglobal.common.services.registration.interfaces.IResultUpdate;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;

/** Response scalars are assembled before the save transaction closes. */
public record ResultEntrySaveOutcome(int status, Map<String, Object> response, ResultsUpdateDataSet dataSet,
        List<IResultUpdate> updaters) {
    public ResultEntrySaveOutcome {
        response = Map.copyOf(response);
        updaters = List.copyOf(updaters);
    }

    static ResultEntrySaveOutcome rejected(int status, Map<String, Object> response) {
        return new ResultEntrySaveOutcome(status, response, null, List.of());
    }
}

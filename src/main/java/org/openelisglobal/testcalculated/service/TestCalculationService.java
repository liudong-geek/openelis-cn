package org.openelisglobal.testcalculated.service;

import org.openelisglobal.common.service.BaseObjectService;
import org.openelisglobal.testcalculated.valueholder.Calculation;

public interface TestCalculationService extends BaseObjectService<Calculation, Integer> {
    Calculation saveDefinition(Calculation calculation);

    Calculation getDefinition(Integer id);

    Calculation setDefinitionActive(Integer id, boolean active);
}

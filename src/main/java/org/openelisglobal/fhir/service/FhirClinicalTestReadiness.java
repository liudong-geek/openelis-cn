package org.openelisglobal.fhir.service;

import ca.uhn.fhir.rest.server.exceptions.UnprocessableEntityException;
import java.math.BigDecimal;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.test.valueholder.Test;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.springframework.stereotype.Service;

/**
 * Validate the current result-component model, not the retired test-analyte
 * setup check.
 */
@Service
public class FhirClinicalTestReadiness {
    private final TestResultComponentService components;

    public FhirClinicalTestReadiness(TestResultComponentService components) {
        this.components = components;
    }

    public void validate(Test test) {
        if (test == null || !"Y".equals(test.getIsActive()) || test.getTestSection() == null
                || !"Y".equals(test.getTestSection().getIsActive())) {
            throw new UnprocessableEntityException("检验项目或检验组未启用");
        }
        var active = components.getActiveComponentsByTestId(test.getId());
        if (active.size() != 1 || !active.getFirst().getIsPrimary() || !"N".equals(active.getFirst().getResultType())
                || active.getFirst().getAllowMultipleReadings()) {
            throw new UnprocessableEntityException("当前试点只接收单一主结果的定量项目，请先完成结果组件配置");
        }
        var unit = test.getUnitOfMeasure();
        if (unit == null || unit.getName() == null || unit.getName().isBlank()
                || !unit.getId().equals(active.getFirst().getUomId())) {
            throw new UnprocessableEntityException("项目与主结果的单位配置不完整或不一致");
        }
        Integer digits = active.getFirst().getSignificantDigits();
        if (digits == null || digits < -1) {
            throw new UnprocessableEntityException("请先配置定量结果的小数位数，不能默认截断仪器结果");
        }
    }

    public void configureResult(Test test, TestResultItem item) {
        validate(test);
        var component = components.getActiveComponentsByTestId(test.getId()).getFirst();
        int digits = component.getSignificantDigits();
        if (digits >= 0 && new BigDecimal(item.getResultValue()).stripTrailingZeros().scale() > digits) {
            throw new UnprocessableEntityException("结果小数位超过项目配置，请核对映射和精度；接口不会自动截断或舍入");
        }
        item.setSignificantDigits(digits);
        item.setTestResultComponentId(component.getId());
        item.setUnitsOfMeasure(test.getUnitOfMeasure().getName());
    }
}

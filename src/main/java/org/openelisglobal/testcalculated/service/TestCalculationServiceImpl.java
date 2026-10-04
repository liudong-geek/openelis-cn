package org.openelisglobal.testcalculated.service;

import static org.openelisglobal.testcalculated.service.RuleConfigurationValidation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.openelisglobal.common.service.AuditableBaseObjectServiceImpl;
import org.openelisglobal.common.util.UserContextHolder;
import org.openelisglobal.testcalculated.action.util.SafeCalculationExpressionEvaluator;
import org.openelisglobal.testcalculated.dao.TestCalculationDAO;
import org.openelisglobal.testcalculated.valueholder.Calculation;
import org.openelisglobal.testcalculated.valueholder.Operation;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TestCalculationServiceImpl extends AuditableBaseObjectServiceImpl<Calculation, Integer>
        implements TestCalculationService {
    @Autowired
    TestCalculationDAO testCalculationDAOdao;

    @Autowired
    private TypeOfSampleService samples;
    @Autowired
    private UserContextHolder userContext;

    @Override
    @Transactional(readOnly = true)
    public Calculation getDefinition(Integer id) {
        require(id != null && id > 0);
        return testCalculationDAOdao.get(id).orElseThrow(() -> missing());
    }

    @Override
    @Transactional
    public Calculation saveDefinition(Calculation supplied) {
        SafeCalculationExpressionEvaluator.validateDefinition(supplied);
        require(supplied.getActive() != null && supplied.getName().length() <= 64);
        require(supplied.getNote() == null || supplied.getNote().length() <= 64);
        require(supplied.getResult() == null || supplied.getResult().length() <= 64);
        linked(supplied.getTestId().toString(), supplied.getSampleId());
        Calculation stored = supplied.getId() == null ? null : getDefinition(supplied.getId());
        if (stored != null)
            version(supplied.getConfigurationVersion(), stored);
        else
            require(supplied.getLastupdated() == null);
        Map<Integer, Operation> originals = new HashMap<>();
        if (stored != null)
            stored.getOperations().forEach(operation -> originals.put(operation.getId(), operation));
        Set<Integer> ids = new HashSet<>();
        for (Operation operation : supplied.getOperations()) {
            require(operation.getValue().length() <= 64);
            require(operation.getId() == null
                    || (originals.containsKey(operation.getId()) && ids.add(operation.getId())));
            if (operation.getType() == Operation.OperationType.TEST_RESULT)
                linked(operation.getValue(), operation.getSampleId());
        }
        Calculation target = supplied;
        if (stored != null) {
            List<Operation> retained = new ArrayList<>();
            for (Operation operation : supplied.getOperations()) {
                Operation item = operation.getId() == null ? new Operation() : originals.get(operation.getId());
                item.setOrder(operation.getOrder());
                item.setType(operation.getType());
                item.setValue(operation.getValue());
                item.setSampleId(operation.getSampleId());
                retained.add(item);
            }
            stored.getOperations().clear();
            stored.getOperations().addAll(retained);
            stored.setName(supplied.getName());
            stored.setSampleId(supplied.getSampleId());
            stored.setTestId(supplied.getTestId());
            stored.setResult(supplied.getResult());
            stored.setActive(supplied.getActive());
            stored.setNote(supplied.getNote());
            target = stored;
        }
        target.setConfigurationVersion(null);
        target.setSysUserId(userContext.requireSysUserId());
        if (target.getId() == null)
            testCalculationDAOdao.insert(target);
        else
            testCalculationDAOdao.update(target);
        return getDefinition(target.getId());
    }

    @Override
    @Transactional
    public Calculation setDefinitionActive(Integer id, boolean active) {
        Calculation target = getDefinition(id);
        if (active) {
            SafeCalculationExpressionEvaluator.validateDefinition(target);
            linked(target.getTestId().toString(), target.getSampleId());
            for (Operation operation : target.getOperations())
                if (operation.getType() == Operation.OperationType.TEST_RESULT)
                    linked(operation.getValue(), operation.getSampleId());
        }
        target.setActive(active);
        target.setSysUserId(userContext.requireSysUserId());
        testCalculationDAOdao.update(target);
        return getDefinition(id);
    }

    private void linked(String testId, Integer sampleId) {
        positiveId(testId);
        require(sampleId != null && sampleId > 0);
        var sample = samples.getTypeOfSampleById(sampleId.toString());
        require(sample != null && sample.isActive());
        require(samples.getActiveTestsBySampleTypeId(sampleId.toString(), false).stream()
                .anyMatch(test -> testId.equals(test.getId())));
    }

    public TestCalculationServiceImpl() {
        super(Calculation.class);
    }

    @Override
    protected TestCalculationDAO getBaseObjectDAO() {
        return testCalculationDAOdao;
    }
}

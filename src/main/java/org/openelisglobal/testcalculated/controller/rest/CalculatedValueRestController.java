package org.openelisglobal.testcalculated.controller.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.testcalculated.action.util.SafeCalculationExpressionEvaluator;
import org.openelisglobal.testcalculated.service.ResultCalculationService;
import org.openelisglobal.testcalculated.service.TestCalculationService;
import org.openelisglobal.testcalculated.valueholder.Calculation;
import org.openelisglobal.testcalculated.valueholder.Operation;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
@PreAuthorize("hasRole('ADMIN')")
@RequestMapping(value = "/rest/")
public class CalculatedValueRestController extends RuleConfigurationRestSupport {

    @Autowired
    TypeOfSampleService typeOfSampleService;

    @Autowired
    TestCalculationService testCalculationService;

    @Autowired
    DictionaryService dictionaryService;

    @Autowired
    PatientService patientService;

    @Autowired
    ResultService resultService;

    @Autowired
    ResultCalculationService resultCalculationService;

    @PostMapping(value = "test-calculation", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Calculation> saveReflexRule(HttpServletRequest request,
            @RequestBody Calculation calculation) {
        SafeCalculationExpressionEvaluator.validateDefinition(calculation);
        return ResponseEntity.ok(testCalculationService.saveDefinition(calculation));
    }

    @PostMapping(value = "deactivate-test-calculation/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Calculation> deactivateReflexRule(@PathVariable Integer id) {
        return ResponseEntity.ok(testCalculationService.setDefinitionActive(id, false));
    }

    @PostMapping(value = "activate-test-calculation/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Calculation> activateReflexRule(@PathVariable Integer id) {
        return ResponseEntity.ok(testCalculationService.setDefinitionActive(id, true));
    }

    @GetMapping(value = "test-calculation/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Calculation> getCalculation(@PathVariable Integer id) {
        return ResponseEntity.ok(testCalculationService.getDefinition(id));
    }

    @GetMapping(value = "test-calculations", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public List<Calculation> getReflexRules(HttpServletRequest request) {
        // OGC-655: previously forced toggled=false on every load, which made
        // an active rule's body collapse on reload even though active=true. The
        // Toggle Rule control is a UI-collapse affordance; seed it from the
        // persisted active state so reload reflects what was saved.
        List<Calculation> calculations = testCalculationService.getAll().stream().collect(Collectors.toList());
        calculations.forEach(c -> c.setToggled(Boolean.TRUE.equals(c.getActive())));
        return !calculations.isEmpty() ? calculations : Collections.<Calculation>emptyList();
    }

    @GetMapping(value = "math-functions", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public List<IdValuePair> getMathFunctions() {
        return Operation.mathFunctions();
    }
}

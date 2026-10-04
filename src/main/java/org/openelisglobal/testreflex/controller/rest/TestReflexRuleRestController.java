package org.openelisglobal.testreflex.controller.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.openelisglobal.common.util.LabelValuePair;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.testcalculated.controller.rest.RuleConfigurationRestSupport;
import org.openelisglobal.testcalculated.service.RuleConfigurationValidation;
import org.openelisglobal.testreflex.action.bean.ReflexRule;
import org.openelisglobal.testreflex.action.bean.ReflexRuleOptions;
import org.openelisglobal.testreflex.action.bean.ReflexRuleOptionsDisplayItem;
import org.openelisglobal.testreflex.service.ReflexRuleConfigurationService;
import org.openelisglobal.testreflex.service.TestReflexService;
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
public class TestReflexRuleRestController extends RuleConfigurationRestSupport {

    @Autowired
    TestReflexService reflexService;
    @Autowired
    ReflexRuleConfigurationService configuration;
    @Autowired
    DictionaryService dictionaryService;
    @Autowired
    TypeOfSampleService typeOfSampleService;

    @PostMapping(value = "reflexrule", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ReflexRule> saveReflexRule(HttpServletRequest request, @RequestBody ReflexRule reflexRule) {
        return ResponseEntity.ok(configuration.save(reflexRule));
    }

    @PostMapping(value = "deactivate-reflexrule/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ReflexRule> deactivateReflexRule(@PathVariable String id) {
        return ResponseEntity.ok(configuration.setActive(RuleConfigurationValidation.positiveId(id), false));
    }

    @PostMapping(value = "activate-reflexrule/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ReflexRule> activateReflexRule(@PathVariable String id) {
        return ResponseEntity.ok(configuration.setActive(RuleConfigurationValidation.positiveId(id), true));
    }

    @GetMapping(value = "reflexrule/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ReflexRule> getReflexRule(@PathVariable String id) {
        return ResponseEntity.ok(configuration.get(RuleConfigurationValidation.positiveId(id)));
    }

    @GetMapping(value = "reflexrules", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public List<ReflexRule> getReflexRules(HttpServletRequest request) {
        return reflexService.getAllReflexRules().stream().collect(Collectors.toList());
    }

    @GetMapping(value = "reflexrule-options", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ReflexRuleOptionsDisplayItem getReflexRuleOptions() {
        ReflexRuleOptionsDisplayItem options = new ReflexRuleOptionsDisplayItem();
        List<LabelValuePair> overallOptions = new ArrayList<>();
        ReflexRuleOptions.OverallOptions.stream()
                .forEach(option -> overallOptions.add(new LabelValuePair(option.getDisplayName(), option.name())));
        List<LabelValuePair> generalRelationOptions = new ArrayList<>();
        ReflexRuleOptions.GeneralRelationOptions.stream().forEach(
                option -> generalRelationOptions.add(new LabelValuePair(option.getDisplayName(), option.name())));
        List<LabelValuePair> numericRelationOptions = new ArrayList<>();
        ReflexRuleOptions.NumericRelationOptions.stream().forEach(
                option -> numericRelationOptions.add(new LabelValuePair(option.getDisplayName(), option.name())));
        options.setOverallOptions(overallOptions);
        options.setGeneralRelationOptions(generalRelationOptions);
        options.setNumericRelationOptions(numericRelationOptions);
        return options;
    }
}

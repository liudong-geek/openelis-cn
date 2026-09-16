package org.openelisglobal.report.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.openelisglobal.report.form.ReportGroupingRules;
import org.openelisglobal.reportdefinition.service.ReportDefinitionService;
import org.openelisglobal.reportdefinition.valueholder.ReportDefinition;
import org.openelisglobal.test.service.TestService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReportGroupingConfigurationService {
    public static final String DEFINITION_ID = "lis-patient-group-rules";
    private final ObjectMapper mapper = new ObjectMapper();
    @Autowired
    private ReportDefinitionService definitions;
    @Autowired
    private TestService testService;

    @Transactional(readOnly = true)
    public ReportGroupingRules getRules() {
        ReportDefinition definition = findConfiguration();
        if (definition == null)
            throw new IllegalStateException("Report grouping is not configured");
        return parse(definition);
    }

    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public ReportGroupingRules configure(String expectedRuleVersion, List<ReportGroupingRules.Group> groups,
            String actor) {
        if (actor == null || !actor.matches("[1-9][0-9]*"))
            throw new IllegalArgumentException("Invalid configuration actor");
        ReportGroupingRules next = new ReportGroupingRules(UUID.randomUUID().toString(), groups);
        for (String id : groups.stream().flatMap(group -> group.testIds().stream()).distinct().toList()) {
            var test = testService.getTestById(id);
            if (test == null || !id.equals(test.getId()))
                throw new IllegalArgumentException("Configured report test does not exist");
        }
        ReportDefinition definition = findConfiguration();
        String current = definition == null ? null : parse(definition).ruleVersion();
        if (!Objects.equals(current, expectedRuleVersion))
            throw new IllegalStateException("Report grouping changed; reload before saving");
        boolean creating = definition == null;
        if (creating) {
            definition = new ReportDefinition();
            definition.setId(DEFINITION_ID);
            definition.setCreatedBy(actor);
            definition.setCreatedDate(Timestamp.from(Instant.now()));
            definition.setName("Patient report grouping");
            definition.setCategory("PATIENT_GROUPING");
            definition.setReportType("PATIENT_GROUPS");
            definition.setIsActive(true);
            definition.setIsPublic(false);
        }
        try {
            definition.setDefinitionJson(mapper.writeValueAsString(next));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize report grouping", e);
        }
        definition.setSysUserId(actor);
        if (creating)
            definitions.insert(definition);
        else
            definitions.update(definition);
        return next;
    }

    private ReportDefinition findConfiguration() {
        List<ReportDefinition> found = definitions.getAllMatching("id", DEFINITION_ID);
        if (found == null || found.size() > 1)
            throw new IllegalStateException("Invalid report grouping configuration");
        return found.isEmpty() ? null : found.get(0);
    }

    private ReportGroupingRules parse(ReportDefinition definition) {
        if (!Boolean.TRUE.equals(definition.getIsActive()) || !"PATIENT_GROUPS".equals(definition.getReportType())) {
            throw new IllegalStateException("Report grouping is not active");
        }
        try {
            return mapper.readValue(definition.getDefinitionJson(), ReportGroupingRules.class);
        } catch (Exception e) {
            throw new IllegalStateException("Invalid persisted report grouping configuration", e);
        }
    }
}

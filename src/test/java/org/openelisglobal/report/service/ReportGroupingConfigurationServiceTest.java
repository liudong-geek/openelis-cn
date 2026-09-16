package org.openelisglobal.report.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.report.form.ReportGroupingRules;
import org.openelisglobal.reportdefinition.service.ReportDefinitionService;
import org.openelisglobal.reportdefinition.valueholder.ReportDefinition;
import org.openelisglobal.test.service.TestService;

@RunWith(MockitoJUnitRunner.Silent.class)
public class ReportGroupingConfigurationServiceTest {
    @Mock
    private ReportDefinitionService definitions;
    @Mock
    private TestService testService;
    @InjectMocks
    private ReportGroupingConfigurationService service;
    private final List<ReportGroupingRules.Group> groups = List
            .of(new ReportGroupingRules.Group("SIM-CHEM", "SIM chemistry", List.of("11", "12")));

    @Before public void setup() {
        when(definitions.getAllMatching("id", ReportGroupingConfigurationService.DEFINITION_ID)).thenReturn(List.of());
        for (String id : List.of("11", "12")) {
            var test = new org.openelisglobal.test.valueholder.Test(); test.setId(id); when(testService.getTestById(id)).thenReturn(test);
        }
    }

    @Test
    public void missingConfigFailsClosedInsteadOfInferringClinicalGroups() {
        assertThrows(IllegalStateException.class, () -> service.getRules());
    }

    @Test
    public void firstConfigurationValidatesTestsAndAllocatesServerVersion() {
        var saved = service.configure(null, groups, "7");
        assertNotNull(saved.ruleVersion());
        assertEquals(groups, saved.groups());
        var captured = org.mockito.ArgumentCaptor.forClass(ReportDefinition.class);
        verify(definitions).insert(captured.capture());
        assertEquals("7", captured.getValue().getSysUserId());
        assertEquals("PATIENT_GROUPS", captured.getValue().getReportType());
        verify(testService).getTestById("11");
        verify(testService).getTestById("12");
    }

    @Test public void nonexistentCatalogTestCannotBeConfigured() {
        when(testService.getTestById("12")).thenReturn(null);
        assertThrows(IllegalArgumentException.class, () -> service.configure(null, groups, "7"));
        verify(definitions, never()).insert(any());
    }

    @Test
    public void staleVersionCannotReplaceChangedConfiguration() throws Exception {
        persisted("SIM-NEW");
        assertThrows(IllegalStateException.class, () -> service.configure("SIM-OLD", groups, "7"));
        verify(definitions, never()).update(any());
    }

    @Test
    public void updateRequiresCurrentVersionAndReturnsFreshVersion() throws Exception {
        persisted("SIM-OLD");
        var updated = service.configure("SIM-OLD", groups, "7");
        assertNotEquals("SIM-OLD", updated.ruleVersion());
        verify(definitions).update(any());
    }

    @Test
    public void duplicateOrPaddedGroupAndTestKeysAreRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> new ReportGroupingRules("SIM", List.of(groups.get(0), groups.get(0))));
        assertThrows(IllegalArgumentException.class,
                () -> new ReportGroupingRules.Group("bad key", "SIM", List.of("11")));
        assertThrows(IllegalArgumentException.class,
                () -> new ReportGroupingRules.Group("SIM", "SIM", List.of("11", "11")));
        assertThrows(IllegalArgumentException.class, () -> new ReportGroupingRules.Group("SIM", "SIM", List.of("01")));
        assertThrows(IllegalArgumentException.class, () -> new ReportGroupingRules.Group("SIM", "SIM", List.of()));
    }

    @Test
    public void disabledOrMalformedPersistedConfigurationFailsClosed() throws Exception {
        var definition = persisted("SIM-OLD");
        definition.setIsActive(false);
        assertThrows(IllegalStateException.class, () -> service.getRules());
        definition.setIsActive(true);
        definition.setDefinitionJson("{}");
        assertThrows(IllegalStateException.class, () -> service.getRules());
    }

    @Test
    public void rulesDefensivelyCopyGroupAndTestLists() {
        var ids = new java.util.ArrayList<>(List.of("11"));
        var group = new ReportGroupingRules.Group("SIM", "SIM", ids);
        ids.add("12");
        assertEquals(List.of("11"), group.testIds());
        assertThrows(UnsupportedOperationException.class, () -> group.testIds().add("12"));
    }

    private ReportDefinition persisted(String version) throws Exception {
        var definition = new ReportDefinition();
        definition.setId(ReportGroupingConfigurationService.DEFINITION_ID);
        definition.setIsActive(true);
        definition.setReportType("PATIENT_GROUPS");
        definition.setDefinitionJson(new ObjectMapper().writeValueAsString(new ReportGroupingRules(version, groups)));
        when(definitions.getAllMatching("id", ReportGroupingConfigurationService.DEFINITION_ID))
                .thenReturn(List.of(definition));
        return definition;
    }
}

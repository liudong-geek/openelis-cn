package org.openelisglobal.report.service.impl;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.reportdefinition.service.ReportDefinitionService;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.systemuser.service.UserServiceImpl;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.test.util.ReflectionTestUtils;

@RunWith(MockitoJUnitRunner.Silent.class)
public class PatientReportPreviewAuthorizationTest {
    @Mock
    private PatientService patientService;
    @Mock
    private AnalysisService analysisService;
    @Mock
    private ReportDefinitionService reportDefinitionService;
    @Mock
    private IStatusService statusService;
    @InjectMocks
    private PatientReportServiceImpl service;
    private final Patient patient = mock(Patient.class);
    private UserServiceImpl realUserService;

    @Before public void setup() {
        when(statusService.matches("finalized", AnalysisStatus.Finalized)).thenReturn(true);
        realUserService = spy(new UserServiceImpl());
        RoleService roleService = mock(RoleService.class); Role role = new Role(); role.setId("9");
        when(roleService.getRoleByName(org.openelisglobal.common.constants.Constants.ROLE_RESULTS)).thenReturn(role);
        ReflectionTestUtils.setField(realUserService, "roleService", roleService);
        doReturn(List.of(new IdValuePair("50", "SIM allowed"))).when(realUserService).getUserTestSections("7", "9");
        ReflectionTestUtils.setField(service, "userService", realUserService);
    }

    @Test
    public void previewUsesActualAnalysisSectionsDespiteOppositeCatalogDefaults() {
        var denied = analysis("401", "60", "50");
        var allowed = analysis("402", "50", "60");
        var projected = List.of(row("401", "99.9"), row("402", "5.5"));
        when(analysisService.get(List.of("401", "402"))).thenReturn(List.of(denied, allowed));
        var report = service.buildReportFromResults(service.authorizePreviewResults("7", projected), patient);
        assertEquals(1, report.getRows().size());
        assertEquals("5.5", report.getRows().get(0).getDataMap().get("resultValue"));
        verify(realUserService, never()).filterResultsByLabUnitRoles(any(), any(), any());
    }

    @Test
    public void missingActualSectionDoesNotFallBackToAnAllowedCatalogSection() {
        var analysis = analysis("401", null, "50");
        var projected = List.of(row("401", "99.9"));
        when(analysisService.get(List.of("401"))).thenReturn(List.of(analysis));
        assertTrue(service.authorizePreviewResults("7", projected).isEmpty());
    }

    @Test
    public void incompleteAnalysisLookupFailsClosedInsteadOfTrustingProjectedTestIds() {
        var projected = List.of(row("401", "99.9"), row("402", "5.5"));
        when(analysisService.get(List.of("401", "402"))).thenReturn(List.of(analysis("401", "50", "50")));
        assertThrows(IllegalStateException.class, () -> service.authorizePreviewResults("7", projected));
    }

    @Test
    public void projectionWithoutAnalysisIdentityIsRejectedBeforeLookup() {
        var projected = List.of(row(null, "99.9"));
        assertThrows(IllegalStateException.class, () -> service.authorizePreviewResults("7", projected));
        verify(analysisService, never()).get(anyList());
    }

    private TestResultItem row(String id, String value) {
        var item = new TestResultItem();
        item.setAnalysisId(id);
        item.setTestId("11");
        item.setAnalysisStatusId("finalized");
        item.setReportable(true);
        item.setResultValue(value);
        item.setValid(true);
        item.setNormal(true);
        return item;
    }

    private Analysis analysis(String id, String actualSectionId, String catalogSectionId) {
        var analysis = new Analysis();
        analysis.setId(id);
        if (actualSectionId != null) {
            var section = new TestSection();
            section.setId(actualSectionId);
            analysis.setTestSection(section);
        }
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId("11");
        var catalogSection = new TestSection();
        catalogSection.setId(catalogSectionId);
        test.setTestSection(catalogSection);
        analysis.setTest(test);
        return analysis;
    }
}

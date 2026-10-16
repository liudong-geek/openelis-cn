package org.openelisglobal.report.service.impl;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
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
        Role reports = new Role(); reports.setId("10");
        when(roleService.getRoleByName(Constants.ROLE_REPORTS)).thenReturn(reports);
        doReturn(List.of(new IdValuePair("70", "Report section"))).when(realUserService).getUserTestSections("7", "10");
        authenticate("ROLE_RESULTS");
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

    @After
    public void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    public void reportsOnlyPreviewUsesReportsSectionsAndExcludesResultsOnlySections() {
        authenticate("ROLE_REPORTS");
        doReturn(List.of()).when(realUserService).getUserTestSections("7", "9");
        var projected = List.of(row("401", "99.9"), row("402", "5.5"));
        when(analysisService.get(List.of("401", "402")))
                .thenReturn(List.of(analysis("401", "50", "70"), analysis("402", "70", "50")));
        var report = service.buildReportFromResults(service.authorizePreviewResults("7", projected), patient);
        assertEquals(1, report.getRows().size());
        assertEquals("5.5", report.getRows().get(0).getDataMap().get("resultValue"));
    }

    @Test
    public void bothRolesPreviewUnionsTheirAssignedActualSections() {
        authenticate("ROLE_RESULTS", "ROLE_REPORTS");
        var projected = List.of(row("401", "4.4"), row("402", "5.5"), row("403", "99.9"));
        when(analysisService.get(List.of("401", "402", "403"))).thenReturn(
                List.of(analysis("401", "50", "60"), analysis("402", "70", "60"), analysis("403", "60", "50")));
        var visible = service.authorizePreviewResults("7", projected);
        assertEquals(List.of("401", "402"), visible.stream().map(TestResultItem::getAnalysisId).toList());
    }

    @Test
    public void otherRoleCannotUseLaboratoryAssignmentsFromAnUnheldReadRole() {
        authenticate("ROLE_RECEPTION");
        var projected = List.of(row("401", "99.9"));
        when(analysisService.get(List.of("401"))).thenReturn(List.of(analysis("401", "50", "50")));
        assertTrue(service.authorizePreviewResults("7", projected).isEmpty());
    }

    @Test
    public void missingAuthenticationDoesNotExposeProjectedRows() {
        SecurityContextHolder.clearContext();
        var projected = List.of(row("401", "99.9"));
        when(analysisService.get(List.of("401"))).thenReturn(List.of(analysis("401", "50", "50")));
        assertTrue(service.authorizePreviewResults("7", projected).isEmpty());
    }

    @Test
    public void reportsRoleWithNoSectionsCannotFallBackToResultsAssignments() {
        authenticate("ROLE_REPORTS");
        doReturn(List.of()).when(realUserService).getUserTestSections("7", "10");
        var projected = List.of(row("401", "99.9"));
        when(analysisService.get(List.of("401"))).thenReturn(List.of(analysis("401", "50", "50")));
        assertTrue(service.authorizePreviewResults("7", projected).isEmpty());
    }

    @Test
    public void administratorAuthorityAloneDoesNotImplyClinicalPreviewRoles() {
        var authorities = new java.util.LinkedHashSet<String>();
        org.openelisglobal.security.login.CustomUserDetailsService.addAuthoritiesForRole(Constants.ROLE_GLOBAL_ADMIN,
                authorities);
        assertEquals(java.util.Set.of("ROLE_GLOBAL_ADMIN", "ROLE_ADMIN"), authorities);
        authenticate(authorities.toArray(String[]::new));
        var projected = List.of(row("401", "99.9"));
        when(analysisService.get(List.of("401"))).thenReturn(List.of(analysis("401", "50", "50")));
        assertTrue(service.authorizePreviewResults("7", projected).isEmpty());
    }

    @Test
    public void administratorWithResultsRoleRetainsItsAssignedPreviewScope() {
        var authorities = new java.util.LinkedHashSet<String>();
        org.openelisglobal.security.login.CustomUserDetailsService.addAuthoritiesForRole(Constants.ROLE_GLOBAL_ADMIN,
                authorities);
        org.openelisglobal.security.login.CustomUserDetailsService.addAuthoritiesForRole(Constants.ROLE_RESULTS,
                authorities);
        authenticate(authorities.toArray(String[]::new));
        var projected = List.of(row("401", "5.5"), row("402", "99.9"));
        when(analysisService.get(List.of("401", "402")))
                .thenReturn(List.of(analysis("401", "50", "70"), analysis("402", "70", "50")));
        assertEquals(List.of("401"),
                service.authorizePreviewResults("7", projected).stream().map(TestResultItem::getAnalysisId).toList());
    }

    private void authenticate(String... authorities) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("7", "unused",
                java.util.Arrays.stream(authorities).map(SimpleGrantedAuthority::new).toList()));
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

package org.openelisglobal.reports.service;

import static org.junit.Assert.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.patientidentity.service.PatientIdentityService;
import org.openelisglobal.program.service.ImmunohistochemistrySampleService;
import org.openelisglobal.program.service.PathologySampleService;
import org.openelisglobal.program.service.cytology.CytologySampleService;
import org.openelisglobal.program.valueholder.cytology.CytologySample;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample;
import org.openelisglobal.program.valueholder.pathology.PathologySample;
import org.openelisglobal.referral.service.ReferralService;
import org.openelisglobal.reports.action.implementation.CovidResultsReport;
import org.openelisglobal.reports.action.implementation.IReportCreator;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator.SelectionType;
import org.openelisglobal.reports.action.implementation.SafeNonPatientReportCreator;
import org.openelisglobal.reports.form.ReportForm;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.sampleproject.service.SampleProjectService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

public class ReportAnalysisAuthorizationServiceTest {

    private ReportAnalysisAuthorizationService service;
    private AnalysisService analysisService;
    private UserService userService;
    private RoleService roleService;
    private SampleService sampleService;
    private SampleHumanService sampleHumanService;
    private PatientService patientService;
    private PatientIdentityService patientIdentityService;
    private SampleProjectService sampleProjectService;
    private ReferralService referralService;
    private CovidResultsCandidateService covidResultsCandidateService;
    private PathologySampleService pathologySampleService;
    private CytologySampleService cytologySampleService;
    private ImmunohistochemistrySampleService immunohistochemistrySampleService;

    @Before
    public void setUp() {
        service = new TestableReportAnalysisAuthorizationService();
        analysisService = mock(AnalysisService.class);
        userService = mock(UserService.class);
        roleService = mock(RoleService.class);
        sampleService = mock(SampleService.class);
        sampleHumanService = mock(SampleHumanService.class);
        patientService = mock(PatientService.class);
        patientIdentityService = mock(PatientIdentityService.class);
        sampleProjectService = mock(SampleProjectService.class);
        referralService = mock(ReferralService.class);
        covidResultsCandidateService = mock(CovidResultsCandidateService.class);
        pathologySampleService = mock(PathologySampleService.class);
        cytologySampleService = mock(CytologySampleService.class);
        immunohistochemistrySampleService = mock(ImmunohistochemistrySampleService.class);
        ReflectionTestUtils.setField(service, "analysisService", analysisService);
        ReflectionTestUtils.setField(service, "userService", userService);
        ReflectionTestUtils.setField(service, "roleService", roleService);
        ReflectionTestUtils.setField(service, "sampleService", sampleService);
        ReflectionTestUtils.setField(service, "sampleHumanService", sampleHumanService);
        ReflectionTestUtils.setField(service, "patientService", patientService);
        ReflectionTestUtils.setField(service, "patientIdentityService", patientIdentityService);
        ReflectionTestUtils.setField(service, "sampleProjectService", sampleProjectService);
        ReflectionTestUtils.setField(service, "referralService", referralService);
        ReflectionTestUtils.setField(service, "covidResultsCandidateService", covidResultsCandidateService);
        ReflectionTestUtils.setField(service, "pathologySampleService", pathologySampleService);
        ReflectionTestUtils.setField(service, "cytologySampleService", cytologySampleService);
        ReflectionTestUtils.setField(service, "immunohistochemistrySampleService",
                immunohistochemistrySampleService);
        Role reportsRole = new Role();
        reportsRole.setId("77");
        when(roleService.getRoleByName("Reports")).thenReturn(reportsRole);
        when(userService.getUserTestSections("7", "77")).thenReturn(List.of(new IdValuePair("301", "A")));
        SecurityContextHolder.clearContext();
    }

    @After
    public void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    public void authorize_allowsExplicitlySafeNonPatientReportForReportsUser() {
        authenticate("ROLE_REPORTS");
        service.authorize(report("aggregateReport", List.of()), "7", mock(SafeNonPatientReportCreator.class),
                "aggregateReport");

        verifyZeroInteractions(analysisService, userService, sampleService);
    }

    @Test
    public void authorize_rejectsUnclassifiedBulkExportEvenWhenCallerAddsAuthorizedAnalysisId() {
        authenticate("ROLE_REPORTS");
        ReportForm form = report("CISampleRoutineExport", List.of("101"));

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", mock(IReportCreator.class), form.getReport()));

        verifyZeroInteractions(analysisService, userService, sampleService);
    }

    @Test
    public void authorize_requiresReportsRoleForSafeNonPatientReport() {
        authenticate("ROLE_RESULTS");
        ReportForm form = report("statisticsReport", List.of());

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                mock(SafeNonPatientReportCreator.class), form.getReport()));
    }

    @Test
    public void authorize_rejectsReportParameterConfusionEvenForNonResultsReport() {
        ReportForm form = report("aggregateReport", List.of());

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, null, mock(IReportCreator.class), "differentReport"));

        verifyZeroInteractions(analysisService, userService, sampleService);
    }

    @Test
    public void authorize_requiresReportsRoleRatherThanResultsEntryRole() {
        authenticate("ROLE_RESULTS");
        ReportForm form = report("patientCILNSP_vreduit", List.of());

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport()));

        verifyZeroInteractions(analysisService, userService, sampleService);
    }

    @Test
    public void authorize_rejectsUnauthenticatedResultsScopedReport() {
        ReportForm form = report("patientCILNSP_vreduit", List.of());

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport()));
    }

    @Test
    public void authorize_rejectsMissingSystemUserIdBeforeSelectionLookup() {
        authenticate("ROLE_REPORTS");
        ReportForm form = report("patientCILNSP_vreduit", List.of());
        form.setAccessionDirect("A100");

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, null, scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport()));

        verifyZeroInteractions(analysisService, userService, sampleService);
    }

    @Test
    public void authorize_rejectsGetReportParameterConfusion() {
        authenticate("ROLE_REPORTS");
        ReportForm form = report("patientCILNSP_vreduit", List.of());

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT),
                        "patientHaitiClinical"));

        verifyZeroInteractions(analysisService, userService, sampleService);
    }

    @Test
    public void authorize_usesCreatorPriorityAndIgnoresLowerPriorityPatientSelector() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        Analysis analysis = analysis("101");
        when(sampleService.getSamplesByAccessionRange("A100", "A100")).thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(analysis));
        ReportForm form = report("patientCILNSP_vreduit", List.of());
        form.setAccessionDirect("A100");
        form.setSelPatient("55");

        service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport());

        verifyZeroInteractions(sampleHumanService);
    }

    @Test
    public void authorize_ignoresEmptyAccessionSuffixAndUsesCreatorsPatientBranch() {
        authenticate("ROLE_REPORTS");
        Patient patient = patient("55");
        Sample sample = sample("201");
        Analysis analysis = analysis("101");
        when(patientService.get("55")).thenReturn(patient);
        when(sampleHumanService.getSamplesForPatient("55")).thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(analysis));
        ReportForm form = report("patientCILNSP_vreduit", List.of());
        form.setAccessionDirect(".");
        form.setSelPatient("55");

        service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport());

        verify(sampleService, never()).getSamplesByAccessionRange(anyString(), anyString());
    }

    @Test
    public void authorize_allowsAccessionRangeWhenEveryResultIsInUsersReportsLabUnits() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        Analysis first = analysis("101");
        Analysis second = analysis("102");
        when(sampleService.getSamplesByAccessionRange("A100", "A110")).thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(first, second));
        ReportForm form = report("patientCILNSP_vreduit", List.of());
        form.setAccessionDirect("A100");
        form.setHighAccessionDirect("A110");

        service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport());

        verify(userService).getUserTestSections("7", "77");
    }

    @Test
    public void authorize_rejectsMixedAuthorizedAndUnauthorizedResultsFromSelectedSamples() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        Analysis allowed = analysis("101");
        Analysis denied = analysis("102");
        denied.setTestSection(testSection("302"));
        when(sampleService.getSamplesByAccessionRange("A100", "A100")).thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(allowed, denied));
        ReportForm form = report("patientCILNSP_vreduit", List.of());
        form.setAccessionDirect("A100");

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport()));
    }

    @Test
    public void authorize_resolvesSelectedPatientBeforeCheckingLabUnits() {
        authenticate("ROLE_REPORTS");
        Patient patient = patient("55");
        Sample sample = sample("201");
        Analysis analysis = analysis("101");
        when(patientService.get("55")).thenReturn(patient);
        when(sampleHumanService.getSamplesForPatient("55")).thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(analysis));
        ReportForm form = report("patientCILNSP_vreduit", List.of());
        form.setSelPatient("55");

        service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport());

        verify(sampleHumanService).getSamplesForPatient("55");
        verifyZeroInteractions(patientIdentityService);
        verify(patientService, never()).getPatientByNationalId(anyString());
        verify(patientService, never()).getPatientByExternalId(anyString());
    }

    @Test
    public void authorize_rejectsUnknownSelectedPatientBeforeSampleLookup() {
        authenticate("ROLE_REPORTS");
        when(patientService.get("55")).thenReturn(null);
        ReportForm form = report("patientCILNSP_vreduit", List.of());
        form.setSelPatient("55");

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport()));

        verifyZeroInteractions(sampleHumanService);
    }

    @Test
    public void authorize_resolvesPatientNumberBeforeCheckingLabUnits() {
        authenticate("ROLE_REPORTS");
        Patient patient = patient("55");
        Sample sample = sample("201");
        Analysis analysis = analysis("101");
        when(patientService.getPatientsByNationalId("P-001")).thenReturn(List.of(patient));
        when(sampleHumanService.getSamplesForPatient("55")).thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(analysis));
        ReportForm form = report("patientCILNSP_vreduit", List.of());
        form.setPatientNumberDirect("P-001");

        service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport());

        verify(sampleHumanService).getSamplesForPatient("55");
        verifyZeroInteractions(patientIdentityService);
        verify(patientService, never()).getPatientByNationalId(anyString());
        verify(patientService, never()).getPatientByExternalId(anyString());
    }

    @Test
    public void authorize_resolvesSiteOrderDateRangeBeforeCheckingLabUnits() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        Analysis analysis = analysis("101");
        when(sampleService.getSamplesForSiteBetweenOrderDates(eq("44"), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(analysis));
        ReportForm form = report("patientCILNSP_vreduit", List.of());
        form.setReferringSiteId("44");
        form.setLowerDateRange("2024-01-01");
        form.setUpperDateRange("2024-01-31");
        form.setDateType(ReportForm.DateType.ORDER_DATE);

        service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport());

        verify(sampleService).getSamplesForSiteBetweenOrderDates(eq("44"), any(LocalDate.class),
                any(LocalDate.class));
        verify(sampleService, never()).getStudySamplesForSiteBetweenOrderDates(anyString(), any(LocalDate.class),
                any(LocalDate.class));
    }

    @Test
    public void authorize_studyResultDateUsesOnlyStudyCreatorQuery() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        Analysis analysis = analysis("101");
        when(analysisService.getStudyAnalysisForSiteBetweenResultDates(eq("44"), any(LocalDate.class),
                any(LocalDate.class))).thenReturn(List.of(analysis));
        when(sampleService.getSamplesByAnalysisIds(List.of("101"))).thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(analysis));
        ReportForm form = report("patientARV1", List.of());
        form.setReferringSiteId("44");
        form.setLowerDateRange("2024-01-01");
        form.setUpperDateRange("2024-01-31");
        form.setDateType(ReportForm.DateType.RESULT_DATE);

        service.authorize(form, "7", scopedCreator(SelectionType.STUDY_PATIENT), form.getReport());

        verify(analysisService, never()).getAnalysisForSiteBetweenResultDates(anyString(), any(LocalDate.class),
                any(LocalDate.class));
    }

    @Test
    public void authorize_studyAccessionUsesCreatorProjectAndStatusScopeOnly() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        Analysis analysis = analysis("101");
        ResultsScopedReportCreator creator = scopedCreator(SelectionType.STUDY_PATIENT);
        when(creator.getResultsAuthorizationProjectIds()).thenReturn(List.of("9", "10"));
        when(creator.getResultsAuthorizationSampleStatusIds()).thenReturn(List.of("4", "5"));
        when(sampleService.getSamplesByProjectAndStatusIDAndAccessionRange(List.of("9", "10"), List.of("4", "5"),
                "A100", "A110")).thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(analysis));
        ReportForm form = report("patientARV1", List.of());
        form.setAccessionDirect("A100");
        form.setHighAccessionDirect("A110");

        service.authorize(form, "7", creator, form.getReport());

        verify(sampleService, never()).getSamplesByAccessionRange(anyString(), anyString());
    }

    @Test
    public void authorize_studyAccessionUsesCreatorsNumericSuffixOrdering() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        Analysis analysis = analysis("101");
        ResultsScopedReportCreator creator = scopedCreator(SelectionType.STUDY_PATIENT);
        when(creator.getResultsAuthorizationProjectIds()).thenReturn(List.of("9"));
        when(creator.getResultsAuthorizationSampleStatusIds()).thenReturn(List.of("4"));
        when(sampleService.getSamplesByProjectAndStatusIDAndAccessionRange(List.of("9"), List.of("4"), "A2",
                "A10")).thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(analysis));
        ReportForm form = report("patientARV1", List.of());
        form.setAccessionDirect("A10");
        form.setHighAccessionDirect("A2");

        service.authorize(form, "7", creator, form.getReport());

        verify(sampleService).getSamplesByProjectAndStatusIDAndAccessionRange(List.of("9"), List.of("4"), "A2",
                "A10");
    }

    @Test
    public void authorize_patientCollectionFailsClosedUntilNestedSelectorsAreSnapshotted() {
        authenticate("ROLE_REPORTS");
        ReportForm form = report("patientCollection", List.of());
        form.setPatientNumberDirect("EXT-1");

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                scopedCreator(SelectionType.PATIENT_COLLECTION), form.getReport()));

        verifyZeroInteractions(patientService, sampleHumanService, analysisService, sampleService, userService);
    }

    @Test
    public void authorize_patientCollectionRejectsInjectedHigherPriorityAnalysisIds() {
        authenticate("ROLE_REPORTS");
        ReportForm form = report("patientCollection", List.of("999"));
        form.setPatientNumberDirect("EXT-1");

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                scopedCreator(SelectionType.PATIENT_COLLECTION), form.getReport()));

        verifyZeroInteractions(patientService, sampleHumanService, analysisService, sampleService, userService);
    }

    @Test
    public void authorize_patientCollectionRejectsInjectedAccessionRangeSelector() {
        authenticate("ROLE_REPORTS");
        ReportForm form = report("patientCollection", List.of());
        form.setPatientNumberDirect("EXT-1");
        form.setHighAccessionDirect("UNAUTHORIZED-HIGH");

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                scopedCreator(SelectionType.PATIENT_COLLECTION), form.getReport()));

        verifyZeroInteractions(patientService, sampleHumanService, analysisService, sampleService, userService);
    }

    @Test
    public void authorize_rejectsSelectedSampleWithoutAnyAuthorizableAnalysis() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        when(sampleService.getSamplesByAccessionRange("A100", "A100")).thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of());
        ReportForm form = report("patientCILNSP_vreduit", List.of());
        form.setAccessionDirect("A100");

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport()));

        verifyZeroInteractions(userService);
    }

    @Test
    public void authorize_rejectsMalformedSiteDateRangeBeforeDataLookup() {
        authenticate("ROLE_REPORTS");
        ReportForm form = report("patientCILNSP_vreduit", List.of());
        form.setReferringSiteId("44");
        form.setLowerDateRange("not-a-date");

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport()));

        verify(sampleService, never()).getSamplesForSiteBetweenOrderDates(anyString(), any(LocalDate.class),
                any(LocalDate.class));
    }

    @Test
    public void authorize_analysisIdsOnPatientReportChecksEveryResultOnResolvedSample() {
        authenticate("ROLE_REPORTS");
        Analysis requested = analysis("101");
        Analysis otherLabUnit = analysis("102");
        otherLabUnit.setTestSection(testSection("302"));
        Sample sample = sample("201");
        when(analysisService.get(List.of("101"))).thenReturn(List.of(requested));
        when(sampleService.getSamplesByAnalysisIds(List.of("101"))).thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(requested, otherLabUnit));
        ReportForm form = report("patientCILNSP_vreduit", List.of("101"));

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport()));
    }

    @Test
    public void authorize_analysisIdsTakePriorityOverStaleUnauthorizedAccessionSelector() {
        authenticate("ROLE_REPORTS");
        Analysis requested = analysis("101");
        Sample sample = sample("201");
        when(analysisService.get(List.of("101"))).thenReturn(List.of(requested));
        when(sampleService.getSamplesByAnalysisIds(List.of("101"))).thenReturn(List.of(sample));
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(requested));
        ReportForm form = report("patientCILNSP_vreduit", List.of("101"));
        form.setAccessionDirect("UNAUTHORIZED-LOWER-PRIORITY");

        service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport());

        verify(sampleService, never()).getSamplesByAccessionRange(anyString(), anyString());
    }

    @Test
    public void authorize_rejectsWhenAnyRequestedAnalysisDoesNotExist() {
        authenticate("ROLE_REPORTS");
        Analysis first = analysis("101");
        when(analysisService.get(List.of("101", "102"))).thenReturn(List.of(first));
        ReportForm form = report("patientCILNSP_vreduit", List.of("101", "102"));

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport()));

        verify(userService, never()).getUserTestSections(anyString(), anyString());
    }

    @Test
    public void authorize_rejectsMalformedAnalysisIdBeforeLookup() {
        authenticate("ROLE_REPORTS");
        ReportForm form = report("patientCILNSP_vreduit", List.of("101", "not-an-id"));

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", scopedCreator(SelectionType.CLINICAL_PATIENT), form.getReport()));

        verifyZeroInteractions(analysisService, userService, sampleService);
    }

    @Test
    public void authorize_covidExportBulkChecksAndSnapshotsEveryCandidate() {
        authenticateReportsAdmin();
        Analysis first = analysis("101");
        Analysis second = analysis("102");
        java.sql.Date lower = java.sql.Date.valueOf("2024-01-01");
        java.sql.Date upper = java.sql.Date.valueOf("2024-01-31");
        when(covidResultsCandidateService.getCandidates(lower, upper)).thenReturn(List.of(first, second));
        ResultsScopedReportCreator creator = covidCreator();
        ReportForm form = report("covidResultsReport", List.of());
        form.setType("CSV");
        form.setLowerDateRange("2024-01-01");
        form.setUpperDateRange("2024-01-31");

        service.authorize(form, "7", creator, form.getReport());

        verify(creator).setResultsAuthorizationCandidates(List.of(first, second));
    }

    @Test
    public void authorize_covidExportRejectsMixedLabUnitsWithoutPublishingCandidateSnapshot() {
        authenticateReportsAdmin();
        Analysis allowed = analysis("101");
        Analysis denied = analysis("102");
        denied.setTestSection(testSection("302"));
        java.sql.Date day = java.sql.Date.valueOf("2024-01-01");
        when(covidResultsCandidateService.getCandidates(day, day)).thenReturn(List.of(allowed, denied));
        ResultsScopedReportCreator creator = covidCreator();
        ReportForm form = report("covidResultsReport", List.of());
        form.setType("JSON");
        form.setLowerDateRange("2024-01-01");

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", creator, form.getReport()));

        verify(creator, never()).setResultsAuthorizationCandidates(anyList());
    }

    @Test
    public void authorize_covidExportRejectsInvalidTypeBeforeCandidateQuery() {
        authenticateReportsAdmin();
        ReportForm form = report("covidResultsReport", List.of());
        form.setType("PDF");
        form.setLowerDateRange("2024-01-01");

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                covidCreator(), form.getReport()));

        verifyZeroInteractions(covidResultsCandidateService);
    }

    @Test
    public void authorize_covidExportRejectsInvalidDateBeforeCandidateQuery() {
        authenticateReportsAdmin();
        ReportForm form = report("covidResultsReport", List.of());
        form.setType("CSV");
        form.setLowerDateRange("not-a-date");

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                covidCreator(), form.getReport()));

        verifyZeroInteractions(covidResultsCandidateService);
    }

    @Test
    public void authorize_rejectsWhenTestDefaultSectionIsAllowedButAnalysisActualSectionIsNot() {
        authenticateReportsAdmin();
        Analysis candidate = analysisWithDefaultAndActualSection("101", "301", "302");
        java.sql.Date day = java.sql.Date.valueOf("2024-01-01");
        when(covidResultsCandidateService.getCandidates(day, day)).thenReturn(List.of(candidate));
        ReportForm form = covidReportForDay("2024-01-01");

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                covidCreator(), form.getReport()));
    }

    @Test
    public void authorize_allowsWhenAnalysisActualSectionIsAllowedEvenIfTestDefaultIsDifferent() {
        authenticateReportsAdmin();
        when(userService.getUserTestSections("7", "77")).thenReturn(List.of(new IdValuePair("302", "B")));
        Analysis candidate = analysisWithDefaultAndActualSection("101", "301", "302");
        java.sql.Date day = java.sql.Date.valueOf("2024-01-01");
        when(covidResultsCandidateService.getCandidates(day, day)).thenReturn(List.of(candidate));
        ResultsScopedReportCreator creator = covidCreator();
        ReportForm form = covidReportForDay("2024-01-01");

        service.authorize(form, "7", creator, form.getReport());

        verify(creator).setResultsAuthorizationCandidates(List.of(candidate));
    }

    @Test
    public void authorize_rejectsAnalysisWithoutActualTestSection() {
        authenticateReportsAdmin();
        Analysis candidate = analysisWithDefaultAndActualSection("101", "301", null);
        java.sql.Date day = java.sql.Date.valueOf("2024-01-01");
        when(covidResultsCandidateService.getCandidates(day, day)).thenReturn(List.of(candidate));
        ReportForm form = covidReportForDay("2024-01-01");

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                covidCreator(), form.getReport()));
    }

    @Test
    public void authorize_covidBulkExportRejectsReportsUserWhoIsNotGlobalAdministrator() {
        authenticate("ROLE_REPORTS");
        ReportForm form = covidReportForDay("2024-01-01");

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", covidCreator(), form.getReport()));

        verifyZeroInteractions(covidResultsCandidateService, userService);
    }

    @Test
    public void authorize_covidBulkExportRejectsGlobalAdministratorWithoutReportsRole() {
        authenticate("ROLE_GLOBAL_ADMIN");
        ReportForm form = covidReportForDay("2024-01-01");

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", covidCreator(), form.getReport()));

        verifyZeroInteractions(covidResultsCandidateService, userService);
    }

    @Test
    public void authorize_pathologyProgramReportResolvesTypedSampleBeforeCheckingAllAnalyses() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        PathologySample programSample = new PathologySample();
        programSample.setId(501);
        programSample.setSample(sample);
        Analysis analysis = analysis("101");
        when(pathologySampleService.get(501)).thenReturn(programSample);
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(analysis));
        ReportForm form = report("PatientPathologyReport", List.of());
        form.setProgramSampleId("501");

        service.authorize(form, "7", scopedCreator(SelectionType.PATHOLOGY_PROGRAM_SAMPLE), form.getReport());

        verifyZeroInteractions(cytologySampleService, immunohistochemistrySampleService);
    }

    @Test
    public void authorize_programReportRejectsWhenAnySampleAnalysisIsOutsideReportsLabUnits() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        PathologySample programSample = new PathologySample();
        programSample.setId(501);
        programSample.setSample(sample);
        Analysis allowed = analysis("101");
        Analysis denied = analysis("102");
        denied.setTestSection(testSection("302"));
        when(pathologySampleService.get(501)).thenReturn(programSample);
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(allowed, denied));
        ReportForm form = report("PatientPathologyReport", List.of());
        form.setProgramSampleId("501");

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                scopedCreator(SelectionType.PATHOLOGY_PROGRAM_SAMPLE), form.getReport()));
    }

    @Test
    public void authorize_cytologyProgramReportUsesCytologyResolverOnly() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        CytologySample programSample = new CytologySample();
        programSample.setId(502);
        programSample.setSample(sample);
        Analysis analysis = analysis("101");
        when(cytologySampleService.get(502)).thenReturn(programSample);
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(analysis));
        ReportForm form = report("PatientCytologyReport", List.of());
        form.setProgramSampleId("502");

        service.authorize(form, "7", scopedCreator(SelectionType.CYTOLOGY_PROGRAM_SAMPLE), form.getReport());

        verifyZeroInteractions(pathologySampleService, immunohistochemistrySampleService);
    }

    @Test
    public void authorize_immunohistochemistryProgramReportsUseSharedTypedResolver() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        ImmunohistochemistrySample programSample = new ImmunohistochemistrySample();
        programSample.setId(503);
        programSample.setSample(sample);
        Analysis analysis = analysis("101");
        when(immunohistochemistrySampleService.get(503)).thenReturn(programSample);
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of(analysis));
        ReportForm form = report("DualInSituHybridizationReport", List.of());
        form.setProgramSampleId("503");

        service.authorize(form, "7", scopedCreator(SelectionType.IMMUNOHISTOCHEMISTRY_PROGRAM_SAMPLE),
                form.getReport());

        verifyZeroInteractions(pathologySampleService, cytologySampleService);
    }

    @Test
    public void authorize_programReportRejectsMissingTypedProgramSample() {
        authenticate("ROLE_REPORTS");
        when(pathologySampleService.get(501)).thenReturn(null);
        ReportForm form = report("PatientPathologyReport", List.of());
        form.setProgramSampleId("501");

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                scopedCreator(SelectionType.PATHOLOGY_PROGRAM_SAMPLE), form.getReport()));

        verifyZeroInteractions(analysisService, userService);
    }

    @Test
    public void authorize_programReportRejectsInvalidProgramSampleIdBeforeResolver() {
        authenticate("ROLE_REPORTS");
        ReportForm form = report("PatientPathologyReport", List.of());
        form.setProgramSampleId("not-an-id");

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                scopedCreator(SelectionType.PATHOLOGY_PROGRAM_SAMPLE), form.getReport()));

        verifyZeroInteractions(pathologySampleService, cytologySampleService, immunohistochemistrySampleService);
    }

    @Test
    public void authorize_programReportRejectsSampleWithoutAnalysis() {
        authenticate("ROLE_REPORTS");
        Sample sample = sample("201");
        PathologySample programSample = new PathologySample();
        programSample.setId(501);
        programSample.setSample(sample);
        when(pathologySampleService.get(501)).thenReturn(programSample);
        when(analysisService.getAnalysesBySampleId("201")).thenReturn(List.of());
        ReportForm form = report("PatientPathologyReport", List.of());
        form.setProgramSampleId("501");

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                scopedCreator(SelectionType.PATHOLOGY_PROGRAM_SAMPLE), form.getReport()));

        verifyZeroInteractions(userService);
    }

    @Test
    public void authorize_rejectsPatientAssociatedUntilNestedReportCandidatesCanBeAuthorized() {
        authenticate("ROLE_REPORTS");
        ReportForm form = report("patientAssociated", List.of());
        form.setPatientNumberDirect("PAT-1");

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                scopedCreator(SelectionType.PATIENT_ASSOCIATED_UNSUPPORTED), form.getReport()));

        verifyZeroInteractions(patientService, sampleHumanService, analysisService, userService);
    }

    @Test
    public void authorize_clinicalPatientCreatorWithoutASelectorFailsClosed() {
        authenticate("ROLE_REPORTS");
        ReportForm form = report("futurePatientReport", List.of());

        assertThrows(AccessDeniedException.class, () -> service.authorize(form, "7",
                scopedCreator(SelectionType.CLINICAL_PATIENT), "futurePatientReport"));

        verifyZeroInteractions(analysisService, userService, sampleService);
    }

    @Test
    public void authorize_untypedResultsScopedCreatorFailsClosed() {
        authenticate("ROLE_REPORTS");
        ReportForm form = report("futurePatientReport", List.of());
        ResultsScopedReportCreator untypedCreator = mock(ResultsScopedReportCreator.class);

        assertThrows(AccessDeniedException.class,
                () -> service.authorize(form, "7", untypedCreator, "futurePatientReport"));

        verifyZeroInteractions(analysisService, userService, sampleService);
    }

    private void authenticate(String... authorities) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", "N/A",
                Arrays.stream(authorities).map(SimpleGrantedAuthority::new).collect(java.util.stream.Collectors.toList())));
    }

    private void authenticateReportsAdmin() {
        authenticate("ROLE_REPORTS", "ROLE_GLOBAL_ADMIN");
    }

    private ResultsScopedReportCreator scopedCreator(SelectionType selectionType) {
        ResultsScopedReportCreator creator = mock(ResultsScopedReportCreator.class);
        when(creator.getResultsAuthorizationSelectionType()).thenReturn(selectionType);
        return creator;
    }

    private ResultsScopedReportCreator covidCreator() {
        return mock(CovidResultsReport.class, CALLS_REAL_METHODS);
    }

    private ReportForm report(String reportName, List<String> analysisIds) {
        ReportForm form = new ReportForm();
        form.setReport(reportName);
        form.setAnalysisIds(analysisIds);
        return form;
    }

    private ReportForm covidReportForDay(String day) {
        ReportForm form = report("covidResultsReport", List.of());
        form.setType("CSV");
        form.setLowerDateRange(day);
        return form;
    }

    private Analysis analysisWithDefaultAndActualSection(String id, String defaultSectionId, String actualSectionId) {
        Analysis analysis = analysis(id);
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setTestSection(testSection(defaultSectionId));
        analysis.setTest(test);
        analysis.setTestSection(actualSectionId == null ? null : testSection(actualSectionId));
        return analysis;
    }

    private Analysis analysis(String id) {
        Analysis analysis = new Analysis();
        analysis.setId(id);
        analysis.setTestSection(testSection("301"));
        return analysis;
    }

    private TestSection testSection(String id) {
        TestSection testSection = new TestSection();
        testSection.setId(id);
        return testSection;
    }

    private Sample sample(String id) {
        Sample sample = new Sample();
        sample.setId(id);
        return sample;
    }

    private Patient patient(String id) {
        Patient patient = new Patient();
        patient.setId(id);
        return patient;
    }

    private static class TestableReportAnalysisAuthorizationService extends ReportAnalysisAuthorizationService {
        @Override
        LocalDate parseLocalDate(String value) {
            return LocalDate.parse(value);
        }

        @Override
        java.sql.Date parseSqlDate(String value) {
            return java.sql.Date.valueOf(value);
        }
    }
}

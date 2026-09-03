package org.openelisglobal.reports.service;

import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.apache.commons.validator.GenericValidator;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.service.PatientServiceImpl;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.patientidentity.service.PatientIdentityService;
import org.openelisglobal.patientidentity.valueholder.PatientIdentity;
import org.openelisglobal.program.service.ImmunohistochemistrySampleService;
import org.openelisglobal.program.service.PathologySampleService;
import org.openelisglobal.program.service.cytology.CytologySampleService;
import org.openelisglobal.program.valueholder.ProgramSample;
import org.openelisglobal.referral.service.ReferralService;
import org.openelisglobal.referral.valueholder.Referral;
import org.openelisglobal.reports.action.implementation.BulkPatientExportReportCreator;
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
import org.openelisglobal.sampleproject.valueholder.SampleProject;
import org.openelisglobal.systemuser.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Enforces report permission and Reports-lab-unit isolation before a legacy
 * report creator loads patient data.
 *
 * <p>
 * Patient-result reports are identified by a capability implemented by the
 * concrete creator returned by {@code ReportImplementationFactory}; the caller's
 * report-name string is never used as the security allow-list. Every analysis in
 * the resolved result set must be visible through the caller's Reports lab-unit
 * assignments. Mixed authorized/unauthorized selections are rejected in full.
 */
@Service
public class ReportAnalysisAuthorizationService {

    private static final String REPORTS_AUTHORITY = "ROLE_REPORTS";
    private static final String GLOBAL_ADMIN_AUTHORITY = "ROLE_GLOBAL_ADMIN";
    private static final long ONE_DAY_MILLIS = 24L * 60L * 60L * 1000L;

    private enum LegacySelectionMode {
        ANALYSES,
        ACCESSION_RANGE,
        PATIENT_ID,
        PATIENT_NUMBER,
        SITE_DATE_RANGE
    }

    @Autowired
    private AnalysisService analysisService;

    @Autowired
    private UserService userService;

    @Autowired
    private RoleService roleService;

    @Autowired
    private SampleService sampleService;

    @Autowired
    private SampleHumanService sampleHumanService;

    @Autowired
    private PatientService patientService;

    @Autowired
    private PatientIdentityService patientIdentityService;

    @Autowired
    private SampleProjectService sampleProjectService;

    @Autowired
    private ReferralService referralService;

    @Autowired
    private CovidResultsCandidateService covidResultsCandidateService;

    @Autowired
    private PathologySampleService pathologySampleService;

    @Autowired
    private CytologySampleService cytologySampleService;

    @Autowired
    private ImmunohistochemistrySampleService immunohistochemistrySampleService;

    /**
     * Backward-compatible entry point for callers that only submit analysis ids.
     */
    @Transactional(readOnly = true)
    public void authorize(ReportForm form, String systemUserId) {
        authorize(form, systemUserId, null, form == null ? null : form.getReport());
    }

    /**
     * Authorizes both explicit analysis-id requests and legacy patient-result
     * selectors resolved by a results-scoped report creator.
     */
    @Transactional(readOnly = true)
    public void authorize(ReportForm form, String systemUserId, IReportCreator reportCreator, String requestedReport) {
        boolean resultsScoped = reportCreator instanceof ResultsScopedReportCreator;
        requireUnambiguousReportIdentity(form, requestedReport);
        requireReportPrincipal(systemUserId);

        if (resultsScoped) {
            if (reportCreator instanceof BulkPatientExportReportCreator) {
                requireGlobalAdministrator();
            }
            ResultsScopedReportCreator scopedCreator = (ResultsScopedReportCreator) reportCreator;
            authorizeResultsSelection(form, systemUserId, scopedCreator);
            return;
        }
        if (reportCreator instanceof SafeNonPatientReportCreator) {
            return;
        }
        throw accessDenied();
    }

    boolean requiresAuthorization(ReportForm form) {
        return hasAnalysisIds(form);
    }

    private void authorizeResultsSelection(ReportForm form, String systemUserId,
            ResultsScopedReportCreator scopedCreator) {
        SelectionType selectionType = scopedCreator.getResultsAuthorizationSelectionType();
        if (form == null || selectionType == null) {
            throw accessDenied();
        }

        switch (selectionType) {
        case CLINICAL_PATIENT:
            authorizeLegacyPatientSelection(form, systemUserId, scopedCreator, false);
            break;
        case STUDY_PATIENT:
            authorizeLegacyPatientSelection(form, systemUserId, scopedCreator, true);
            break;
        case PATIENT_COLLECTION:
            throw accessDenied();
        case INDETERMINATE_BY_LOCATION:
            authorizeSamples(resolveIndeterminateLocationSamples(form), systemUserId);
            break;
        case REFERRED_OUT_BY_LOCATION:
            authorizeAnalyses(resolveReferredOutAnalyses(form), systemUserId);
            break;
        case PATIENT_ASSOCIATED_UNSUPPORTED:
            throw accessDenied();
        case COVID_RESULTS_BY_DATE:
            List<Analysis> covidCandidates = resolveCovidResultsAnalyses(form);
            authorizeAnalyses(covidCandidates, systemUserId);
            scopedCreator.setResultsAuthorizationCandidates(covidCandidates);
            break;
        case PATHOLOGY_PROGRAM_SAMPLE:
        case CYTOLOGY_PROGRAM_SAMPLE:
        case IMMUNOHISTOCHEMISTRY_PROGRAM_SAMPLE:
            authorizeSamples(List.of(resolveProgramSample(form, selectionType)), systemUserId);
            break;
        default:
            throw accessDenied();
        }
    }

    private void authorizeLegacyPatientSelection(ReportForm form, String systemUserId,
            ResultsScopedReportCreator scopedCreator, boolean studyReport) {
        LegacySelectionMode mode = legacySelectionMode(form);
        if (mode == null) {
            throw accessDenied();
        }
        switch (mode) {
        case ANALYSES:
            authorizeRequestedAnalyses(form.getAnalysisIds(), systemUserId, true);
            break;
        case ACCESSION_RANGE:
            authorizeSamples(resolveAccessionSamples(form, scopedCreator, studyReport), systemUserId);
            break;
        case PATIENT_ID:
            authorizeSamples(resolvePatientIdSamples(form.getSelPatient()), systemUserId);
            break;
        case PATIENT_NUMBER:
            authorizeSamples(resolveLegacyPatientNumberSamples(form), systemUserId);
            break;
        case SITE_DATE_RANGE:
            authorizeSamples(resolveSiteDateSamples(form, studyReport), systemUserId);
            break;
        default:
            throw accessDenied();
        }
    }

    /**
     * Mirrors the creator's historical branch order exactly. Lower-priority stale
     * form values are ignored by both the report and its authorization query.
     */
    private LegacySelectionMode legacySelectionMode(ReportForm form) {
        if (hasAnalysisIds(form)) {
            return LegacySelectionMode.ANALYSES;
        }
        if (isPresent(form.getAccessionDirectNoSuffix()) || isPresent(form.getHighAccessionDirectNoSuffix())) {
            return LegacySelectionMode.ACCESSION_RANGE;
        }
        if (isPresent(form.getSelPatient())) {
            return LegacySelectionMode.PATIENT_ID;
        }
        if (isPresent(form.getPatientNumberDirect())) {
            return LegacySelectionMode.PATIENT_NUMBER;
        }
        if (isPresent(form.getReferringSiteId())) {
            return LegacySelectionMode.SITE_DATE_RANGE;
        }
        return null;
    }

    private void authorizeRequestedAnalyses(List<String> rawAnalysisIds, String systemUserId,
            boolean authorizeWholeSamples) {
        Set<String> requestedIds = normalizeRequestedIds(rawAnalysisIds);
        if (requestedIds.isEmpty()) {
            throw accessDenied();
        }

        List<Analysis> analyses = analysisService.get(new ArrayList<>(requestedIds));
        if (!analysisIds(analyses).equals(requestedIds)) {
            throw accessDenied();
        }

        if (authorizeWholeSamples) {
            authorizeSamples(nullSafeSamples(sampleService.getSamplesByAnalysisIds(new ArrayList<>(requestedIds))),
                    systemUserId);
        } else {
            authorizeAnalyses(analyses, systemUserId);
        }
    }

    private List<Sample> resolveAccessionSamples(ReportForm form, ResultsScopedReportCreator scopedCreator,
            boolean studyReport) {
        String lower = form.getAccessionDirectNoSuffix();
        String upper = form.getHighAccessionDirectNoSuffix();
        if (!isPresent(lower)) {
            lower = upper;
        }
        if (!isPresent(upper)) {
            upper = lower;
        }
        if (!isPresent(lower) || !isPresent(upper)) {
            throw accessDenied();
        }
        if (studyReport) {
            String[] orderedRange = orderStudyAccessionRange(lower, upper);
            lower = orderedRange[0];
            upper = orderedRange[1];
            List<String> projectIds = scopedCreator.getResultsAuthorizationProjectIds();
            List<String> statusIds = scopedCreator.getResultsAuthorizationSampleStatusIds();
            if (projectIds == null || projectIds.isEmpty() || statusIds == null || statusIds.isEmpty()) {
                throw accessDenied();
            }
            return nullSafeSamples(sampleService.getSamplesByProjectAndStatusIDAndAccessionRange(projectIds, statusIds,
                    lower, upper));
        }
        if (lower.compareToIgnoreCase(upper) > 0) {
            String swap = lower;
            lower = upper;
            upper = swap;
        }
        return nullSafeSamples(sampleService.getSamplesByAccessionRange(lower, upper));
    }

    private String[] orderStudyAccessionRange(String lower, String upper) {
        try {
            int lowerNumberIndex = findFirstNumber(lower);
            int upperNumberIndex = findFirstNumber(upper);
            if (lowerNumberIndex == lower.length() || upperNumberIndex == upper.length()
                    || !lower.substring(0, lowerNumberIndex).equals(upper.substring(0, upperNumberIndex))) {
                throw accessDenied();
            }
            double lowerNumber = Double.parseDouble(lower.substring(lowerNumberIndex));
            double upperNumber = Double.parseDouble(upper.substring(upperNumberIndex));
            return upperNumber < lowerNumber ? new String[] { upper, lower } : new String[] { lower, upper };
        } catch (RuntimeException e) {
            throw accessDenied();
        }
    }

    private int findFirstNumber(String value) {
        for (int i = 0; i < value.length(); i++) {
            if (Character.isDigit(value.charAt(i))) {
                return i;
            }
        }
        return value.length();
    }

    private List<Sample> resolvePatientIdSamples(String patientId) {
        if (!isNumericId(patientId)) {
            throw accessDenied();
        }
        Patient patient = patientService.get(patientId);
        if (patient == null || !patientId.equals(patient.getId())) {
            throw accessDenied();
        }
        return nullSafeSamples(sampleHumanService.getSamplesForPatient(patientId));
    }

    private List<Sample> resolveLegacyPatientNumberSamples(ReportForm form) {
        String patientNumber = form.getPatientNumberDirect();
        if (!isPresent(patientNumber)) {
            throw accessDenied();
        }

        Map<String, Patient> patientsById = new LinkedHashMap<>();
        addPatients(patientsById, patientService.getPatientsByNationalId(patientNumber));
        if (patientsById.isEmpty()) {
            addPatientsFromIdentities(patientsById,
                    patientIdentityService.getPatientIdentitiesByValueAndType(patientNumber,
                            PatientServiceImpl.getPatientSTIdentity()));
        }
        if (patientsById.isEmpty()) {
            addPatientsFromIdentities(patientsById,
                    patientIdentityService.getPatientIdentitiesByValueAndType(patientNumber,
                            PatientServiceImpl.getPatientSubjectIdentity()));
        }

        List<Sample> samples = new ArrayList<>();
        for (String patientId : patientsById.keySet()) {
            samples.addAll(nullSafeSamples(sampleHumanService.getSamplesForPatient(patientId)));
        }
        return deduplicateSamples(samples);
    }

    private List<Sample> resolveSiteDateSamples(ReportForm form, boolean studyReport) {
        // The legacy creators select the site branch but perform no query unless a
        // lower date is present. Keep the authorization query on the same branch.
        if (!isPresent(form.getLowerDateRange())) {
            return List.of();
        }
        String siteId = form.getReferringSiteId();
        String departmentId = form.getReferringSiteDepartmentId();
        String requesterId = isPresent(departmentId) ? departmentId : siteId;
        if (!isNumericId(siteId) || (isPresent(departmentId) && !isNumericId(departmentId))) {
            throw accessDenied();
        }

        LocalDate[] range = localDateRange(form.getLowerDateRange(), form.getUpperDateRange());
        List<Sample> samples = new ArrayList<>();
        if (ReportForm.DateType.ORDER_DATE.equals(form.getDateType())) {
            if (studyReport) {
                samples.addAll(nullSafeSamples(sampleService.getStudySamplesForSiteBetweenOrderDates(requesterId,
                        range[0], range[1])));
            } else {
                samples.addAll(nullSafeSamples(
                        sampleService.getSamplesForSiteBetweenOrderDates(requesterId, range[0], range[1])));
            }
        } else {
            List<Analysis> analyses = studyReport
                    ? nullSafeAnalyses(
                            analysisService.getStudyAnalysisForSiteBetweenResultDates(requesterId, range[0], range[1]))
                    : nullSafeAnalyses(
                            analysisService.getAnalysisForSiteBetweenResultDates(requesterId, range[0], range[1]));
            if (!analyses.isEmpty()) {
                samples.addAll(nullSafeSamples(sampleService.getSamplesByAnalysisIds(
                        analyses.stream().map(Analysis::getId).filter(Objects::nonNull).collect(Collectors.toList()))));
            }
        }
        return deduplicateSamples(samples);
    }

    private List<Sample> resolveIndeterminateLocationSamples(ReportForm form) {
        String locationId = form.getLocationCode();
        if (!isNumericId(locationId)) {
            throw accessDenied();
        }
        Date[] range = sqlDateRange(form.getLowerDateRange(), form.getUpperDateRange());
        List<SampleProject> projects = sampleProjectService.getByOrganizationProjectAndReceivedOnRange(locationId,
                "Indeterminate Results", range[0], range[1]);
        if (projects == null) {
            return List.of();
        }
        List<Sample> samples = new ArrayList<>();
        for (SampleProject project : projects) {
            if (project == null || project.getSample() == null) {
                throw accessDenied();
            }
            samples.add(project.getSample());
        }
        return deduplicateSamples(samples);
    }

    private List<Analysis> resolveReferredOutAnalyses(ReportForm form) {
        String locationId = form.getLocationCode();
        if (!isNumericId(locationId)) {
            throw accessDenied();
        }
        Date[] range = sqlDateRange(form.getLowerDateRange(), form.getUpperDateRange());
        Date highDateAtEndOfDay = new Date(range[1].getTime() + ONE_DAY_MILLIS);
        List<Referral> referrals = referralService.getReferralsByOrganization(locationId, range[0],
                highDateAtEndOfDay);
        if (referrals == null) {
            return List.of();
        }
        List<Analysis> analyses = new ArrayList<>();
        for (Referral referral : referrals) {
            if (referral == null || referral.getAnalysis() == null) {
                throw accessDenied();
            }
            if (!referral.isCanceled()) {
                analyses.add(referral.getAnalysis());
            }
        }
        return analyses;
    }

    private List<Analysis> resolveCovidResultsAnalyses(ReportForm form) {
        if (!"CSV".equals(form.getType()) && !"JSON".equals(form.getType())) {
            throw accessDenied();
        }
        Date[] range = sqlDateRange(form.getLowerDateRange(), form.getUpperDateRange());
        return nullSafeAnalyses(covidResultsCandidateService.getCandidates(range[0], range[1]));
    }

    private Sample resolveProgramSample(ReportForm form, SelectionType selectionType) {
        String rawId = form.getProgramSampleId();
        if (!isNumericId(rawId)) {
            throw accessDenied();
        }

        Integer programSampleId;
        try {
            programSampleId = Integer.valueOf(rawId);
        } catch (NumberFormatException e) {
            throw accessDenied();
        }

        ProgramSample programSample;
        switch (selectionType) {
        case PATHOLOGY_PROGRAM_SAMPLE:
            programSample = pathologySampleService.get(programSampleId);
            break;
        case CYTOLOGY_PROGRAM_SAMPLE:
            programSample = cytologySampleService.get(programSampleId);
            break;
        case IMMUNOHISTOCHEMISTRY_PROGRAM_SAMPLE:
            programSample = immunohistochemistrySampleService.get(programSampleId);
            break;
        default:
            throw accessDenied();
        }

        if (programSample == null || !programSampleId.equals(programSample.getId())
                || programSample.getSample() == null) {
            throw accessDenied();
        }
        return programSample.getSample();
    }

    private void authorizeSamples(List<Sample> samples, String systemUserId) {
        List<Sample> uniqueSamples = deduplicateSamples(nullSafeSamples(samples));
        if (uniqueSamples.isEmpty()) {
            return;
        }
        List<Analysis> analyses = new ArrayList<>();
        for (Sample sample : uniqueSamples) {
            if (sample == null || !isNumericId(sample.getId())) {
                throw accessDenied();
            }
            List<Analysis> sampleAnalyses = nullSafeAnalyses(analysisService.getAnalysesBySampleId(sample.getId()));
            if (sampleAnalyses.isEmpty()) {
                throw accessDenied();
            }
            analyses.addAll(sampleAnalyses);
        }
        authorizeAnalyses(analyses, systemUserId);
    }

    private void authorizeAnalyses(List<Analysis> analyses, String systemUserId) {
        List<Analysis> safeAnalyses = nullSafeAnalyses(analyses);
        if (safeAnalyses.isEmpty()) {
            return;
        }

        Map<String, Analysis> uniqueAnalyses = new LinkedHashMap<>();
        for (Analysis analysis : safeAnalyses) {
            if (analysis == null || !isNumericId(analysis.getId())) {
                throw accessDenied();
            }
            uniqueAnalyses.put(analysis.getId(), analysis);
        }
        Set<String> authorizedSectionIds = getAuthorizedReportSectionIds(systemUserId);
        for (Analysis analysis : uniqueAnalyses.values()) {
            if (analysis.getTestSection() == null || !isNumericId(analysis.getTestSection().getId())
                    || !authorizedSectionIds.contains(analysis.getTestSection().getId())) {
                throw accessDenied();
            }
        }
    }

    private Set<String> getAuthorizedReportSectionIds(String systemUserId) {
        Role reportsRole = roleService.getRoleByName(Constants.ROLE_REPORTS);
        if (reportsRole == null || !isNumericId(reportsRole.getId())) {
            throw accessDenied();
        }
        List<IdValuePair> sections = userService.getUserTestSections(systemUserId, reportsRole.getId());
        if (sections == null) {
            return Set.of();
        }
        Set<String> sectionIds = new LinkedHashSet<>();
        for (IdValuePair section : sections) {
            if (section == null || !isNumericId(section.getId())) {
                throw accessDenied();
            }
            sectionIds.add(section.getId());
        }
        return sectionIds;
    }

    private void requireReportPrincipal(String systemUserId) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!hasReportsRole(authentication) || GenericValidator.isBlankOrNull(systemUserId)) {
            throw accessDenied();
        }
    }

    private void requireGlobalAdministrator() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority)
                .noneMatch(GLOBAL_ADMIN_AUTHORITY::equals)) {
            throw accessDenied();
        }
    }

    private void requireUnambiguousReportIdentity(ReportForm form, String requestedReport) {
        if (form == null || !Objects.equals(normalizedValue(form.getReport()), normalizedValue(requestedReport))) {
            throw accessDenied();
        }
    }

    private LocalDate[] localDateRange(String lowerValue, String upperValue) {
        try {
            String lowerText = lowerValue;
            String upperText = isPresent(upperValue) ? upperValue : lowerText;
            if (!isPresent(lowerText)) {
                throw accessDenied();
            }
            LocalDate lower = parseLocalDate(lowerText);
            LocalDate upper = parseLocalDate(upperText);
            if (lower == null || upper == null) {
                throw accessDenied();
            }
            return lower.isAfter(upper) ? new LocalDate[] { upper, lower } : new LocalDate[] { lower, upper };
        } catch (RuntimeException e) {
            throw accessDenied();
        }
    }

    private Date[] sqlDateRange(String lowerValue, String upperValue) {
        try {
            String lowerText = lowerValue;
            String upperText = isPresent(upperValue) ? upperValue : lowerText;
            if (!isPresent(lowerText)) {
                throw accessDenied();
            }
            Date lower = parseSqlDate(lowerText);
            Date upper = parseSqlDate(upperText);
            if (lower == null || upper == null) {
                throw accessDenied();
            }
            return lower.after(upper) ? new Date[] { upper, lower } : new Date[] { lower, upper };
        } catch (RuntimeException e) {
            throw accessDenied();
        }
    }

    private void addPatients(Map<String, Patient> patients, List<Patient> candidates) {
        if (candidates == null) {
            return;
        }
        for (Patient patient : candidates) {
            addPatient(patients, patient);
        }
    }

    LocalDate parseLocalDate(String value) {
        return DateUtil.convertStringDateToLocalDate(value);
    }

    Date parseSqlDate(String value) {
        return DateUtil.convertStringDateToSqlDate(value);
    }

    private void addPatient(Map<String, Patient> patients, Patient patient) {
        if (patient != null && isNumericId(patient.getId())) {
            patients.put(patient.getId(), patient);
        }
    }

    private void addPatientsFromIdentities(Map<String, Patient> patients, List<PatientIdentity> identities) {
        if (identities == null) {
            return;
        }
        for (PatientIdentity identity : identities) {
            if (identity == null || !isNumericId(identity.getPatientId())) {
                throw accessDenied();
            }
            Patient patient = new Patient();
            patient.setId(identity.getPatientId());
            patients.put(patient.getId(), patient);
        }
    }

    private List<Sample> deduplicateSamples(List<Sample> samples) {
        Map<String, Sample> samplesById = new LinkedHashMap<>();
        for (Sample sample : samples) {
            if (sample == null || !isNumericId(sample.getId())) {
                throw accessDenied();
            }
            samplesById.put(sample.getId(), sample);
        }
        return new ArrayList<>(samplesById.values());
    }

    private Set<String> normalizeRequestedIds(List<String> analysisIds) {
        if (analysisIds == null) {
            return Set.of();
        }
        Set<String> normalized = new LinkedHashSet<>();
        for (String analysisId : analysisIds) {
            if (!isNumericId(analysisId)) {
                return Set.of();
            }
            normalized.add(analysisId);
        }
        return normalized;
    }

    private boolean hasReportsRole(Authentication authentication) {
        return authentication != null && authentication.isAuthenticated() && authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority).anyMatch(REPORTS_AUTHORITY::equals);
    }

    private boolean hasAnalysisIds(ReportForm form) {
        return form != null && form.getAnalysisIds() != null && !form.getAnalysisIds().isEmpty();
    }

    private Set<String> analysisIds(List<Analysis> analyses) {
        if (analyses == null) {
            return Set.of();
        }
        return analyses.stream().filter(Objects::nonNull).map(Analysis::getId).filter(this::isNumericId)
                .collect(Collectors.toSet());
    }

    private List<Analysis> nullSafeAnalyses(List<Analysis> analyses) {
        return analyses == null ? List.of() : analyses;
    }

    private List<Sample> nullSafeSamples(List<Sample> samples) {
        return samples == null ? List.of() : samples;
    }

    private String normalizedValue(String value) {
        return value == null ? null : value.trim();
    }

    private boolean isPresent(String value) {
        return !GenericValidator.isBlankOrNull(value);
    }

    private boolean isNumericId(String value) {
        return isPresent(value) && value.matches("[0-9]+");
    }

    private AccessDeniedException accessDenied() {
        return new AccessDeniedException("Not authorized to print one or more selected results");
    }
}

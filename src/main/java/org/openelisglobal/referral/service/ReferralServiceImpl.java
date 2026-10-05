package org.openelisglobal.referral.service;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.apache.commons.validator.GenericValidator;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.service.AuditableBaseObjectServiceImpl;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.organization.valueholder.Organization;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.referral.action.beanitems.ReferralDisplayItem;
import org.openelisglobal.referral.dao.ReferralDAO;
import org.openelisglobal.referral.form.ReferredOutTestsForm;
import org.openelisglobal.referral.form.ReferredOutTestsForm.ReferDateType;
import org.openelisglobal.referral.valueholder.Referral;
import org.openelisglobal.referral.valueholder.ReferralStatus;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.typeoftestresult.service.TypeOfTestResultServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ReferralServiceImpl extends AuditableBaseObjectServiceImpl<Referral, String> implements ReferralService {
    @Autowired
    protected ReferralDAO baseObjectDAO;

    @Autowired
    private SampleHumanService sampleHumanService;
    @Autowired
    private SampleService sampleService;
    @Autowired
    private DictionaryService dictionaryService;
    @Autowired
    private AnalysisService analysisService;
    @Autowired
    private UserService userService;

    ReferralServiceImpl() {
        super(Referral.class);
    }

    @Override
    protected ReferralDAO getBaseObjectDAO() {
        return baseObjectDAO;
    }

    @Override
    @Transactional(readOnly = true)
    public Referral getReferralByAnalysisId(String id) {
        return getMatch("analysis.id", id).orElse(null);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Referral> getUncanceledOpenReferrals() {
        return getBaseObjectDAO().getReferralsByStatus(
                Arrays.asList(ReferralStatus.CREATED, ReferralStatus.SENT, ReferralStatus.RECEIVED));
    }

    @Override
    @Transactional(readOnly = true)
    public Referral getReferralById(String referralId) {
        return getBaseObjectDAO().getReferralById(referralId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Referral> getReferralsBySampleId(String id) {
        return getBaseObjectDAO().getAllReferralsBySampleId(id);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Referral> getReferralsByOrganization(String organizationId, Date lowDate, Date highDate) {
        return getBaseObjectDAO().getAllReferralsByOrganization(organizationId, lowDate, highDate);
    }

    @Override
    public List<Referral> getSentReferrals() {
        return getBaseObjectDAO().getReferralsByStatus(Arrays.asList(ReferralStatus.SENT));
    }

    @Override
    public List<UUID> getSentReferralUuids() {
        return getBaseObjectDAO().getReferralsByStatus(Arrays.asList(ReferralStatus.SENT)).stream()
                .map(e -> e.getFhirUuid()).filter(e -> e != null).collect(Collectors.toList());
    }

    @Override
    public List<Referral> getReferralsByTestAndDate(ReferDateType dateType, Timestamp startTimestamp,
            Timestamp endTimestamp, List<String> testUnitIds, List<String> testIds) {
        return baseObjectDAO.getReferralsByTestAndDate(dateType, startTimestamp, endTimestamp, testUnitIds, testIds);
    }

    @Override
    public List<Referral> getReferralsByAccessionNumber(String labNumber) {
        Sample sample = sampleService.getSampleByAccessionNumber(labNumber);
        if (sample != null) {
            List<Analysis> analysises = analysisService.getAnalysesBySampleId(sample.getId());
            return baseObjectDAO
                    .getReferralsByAnalysisIds(analysises.stream().map(Analysis::getId).collect(Collectors.toList()));
        }
        return new ArrayList<>();
    }

    @Override
    @Transactional
    public List<Referral> getReferralByPatientId(String selPatient) {
        List<Sample> samples = sampleHumanService.getSamplesForPatient(selPatient);
        List<Analysis> analysises = new ArrayList<>();
        for (Sample sample : samples) {
            analysises.addAll(analysisService.getAnalysesBySampleId(sample.getId()));
        }
        return baseObjectDAO
                .getReferralsByAnalysisIds(analysises.stream().map(Analysis::getId).collect(Collectors.toList()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReferralDisplayItem> getReferralItems(ReferredOutTestsForm form) {
        return convertToDisplayItems(getReferrals(form));
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReferralDisplayItem> getReferralItems(ReferredOutTestsForm form, String systemUserId) {
        List<Referral> referrals = getReferrals(form);
        return convertToDisplayItems(filterReferralsByLabUnitRoles(systemUserId, referrals));
    }

    private List<Referral> getReferrals(ReferredOutTestsForm form) {
        if (form == null || form.getSearchType() == null) {
            throw invalidReferralQuery();
        }
        switch (form.getSearchType()) {
        case TEST_AND_DATES:
            return getReferralsByTestAndDate(form);
        case LAB_NUMBER:
            return getReferralsByLabNumber(form);
        case PATIENT:
            return getReferralsByPatient(form);
        default:
            return new ArrayList<>();
        }
    }

    List<Referral> filterReferralsByLabUnitRoles(String systemUserId, List<Referral> referrals) {
        if (referrals == null || referrals.isEmpty() || GenericValidator.isBlankOrNull(systemUserId)) {
            return new ArrayList<>();
        }

        List<Analysis> analyses = referrals.stream().map(Referral::getAnalysis).filter(java.util.Objects::nonNull)
                .collect(Collectors.toList());
        List<Analysis> authorizedAnalyses = userService.filterAnalysesByLabUnitRoles(systemUserId, analyses,
                Constants.ROLE_RESULTS);
        if (authorizedAnalyses == null || authorizedAnalyses.isEmpty()) {
            return new ArrayList<>();
        }
        Set<String> authorizedAnalysisIds = authorizedAnalyses.stream().map(Analysis::getId)
                .collect(Collectors.toSet());
        return referrals.stream().filter(referral -> referral.getAnalysis() != null)
                .filter(referral -> authorizedAnalysisIds.contains(referral.getAnalysis().getId()))
                .collect(Collectors.toList());
    }

    private List<ReferralDisplayItem> convertToDisplayItems(List<Referral> referrals) {
        List<ReferralDisplayItem> referralItems = new ArrayList<>();
        if (referrals == null) {
            return referralItems;
        }
        for (Referral referral : referrals) {
            referralItems.add(convertToDisplayItem(referral));
        }
        return referralItems;
    }

    private List<Referral> getReferralsByTestAndDate(ReferredOutTestsForm form) {
        if (form.getDateType() == null) {
            throw invalidReferralQuery();
        }
        List<String> testUnitIds = validatedQueryIds(form.getTestUnitIds());
        List<String> testIds = validatedQueryIds(form.getTestIds());
        String startDate = form.getStartDate();
        String endDate = form.getEndDate();
        if (GenericValidator.isBlankOrNull(startDate) && !GenericValidator.isBlankOrNull(endDate)) {
            startDate = endDate;
        }
        if (GenericValidator.isBlankOrNull(endDate) && !GenericValidator.isBlankOrNull(startDate)) {
            endDate = startDate;
        }
        Timestamp startTimestamp = null;
        Timestamp endTimestampExclusive = null;
        if (!GenericValidator.isBlankOrNull(startDate)) {
            LocalDate firstDay = parseQueryDate(startDate);
            LocalDate lastDay = parseQueryDate(endDate);
            if (firstDay.isAfter(lastDay)) {
                throw invalidReferralQuery();
            }
            startTimestamp = Timestamp.valueOf(firstDay.atStartOfDay());
            endTimestampExclusive = Timestamp.valueOf(lastDay.plusDays(1).atStartOfDay());
        }
        return getReferralsByTestAndDate(form.getDateType(), startTimestamp, endTimestampExclusive, testUnitIds,
                testIds);
    }

    private LocalDate parseQueryDate(String value) {
        try {
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern(DateUtil.getDateFormat().replace("yyyy", "uuuu"))
                    .withResolverStyle(ResolverStyle.STRICT);
            return LocalDate.parse(value, formatter);
        } catch (DateTimeException e) {
            throw invalidReferralQuery();
        }
    }

    private List<String> validatedQueryIds(List<String> values) {
        if (values == null) {
            return null;
        }
        List<String> ids = new ArrayList<>();
        for (String value : values) {
            // Empty multi-select placeholders retain the existing no-filter behavior.
            if (!GenericValidator.isBlankOrNull(value)) {
                ids.add(validatedQueryId(value));
            }
        }
        return ids;
    }

    private String validatedQueryId(String value) {
        if (GenericValidator.isBlankOrNull(value) || !value.matches("[0-9]+")) {
            throw invalidReferralQuery();
        }
        try {
            // Existing numeric identifiers are bound through LIMSStringNumberUserType.
            Integer.parseInt(value);
        } catch (NumberFormatException e) {
            throw invalidReferralQuery();
        }
        return value;
    }

    private ResponseStatusException invalidReferralQuery() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "error.validation");
    }

    private List<Referral> getReferralsByLabNumber(ReferredOutTestsForm form) {
        if (GenericValidator.isBlankOrNull(form.getLabNumber())) {
            throw invalidReferralQuery();
        }
        return getReferralsByAccessionNumber(form.getLabNumber());
    }

    private List<Referral> getReferralsByPatient(ReferredOutTestsForm form) {
        return getReferralByPatientId(validatedQueryId(form.getSelPatient()));
    }

    @Override
    @Transactional(readOnly = true)
    public ReferralDisplayItem convertToDisplayItem(Referral referral) {
        ReferralDisplayItem referralItem = new ReferralDisplayItem();

        Analysis analysis = referral.getAnalysis();
        List<Result> resultList = analysisService.getResults(analysis);
        Patient patient = sampleHumanService.getPatientForSample(analysis.getSampleItem().getSample());

        referralItem.setAccessionNumber(analysis.getSampleItem().getSample().getAccessionNumber());
        referralItem.setReferredSendDate(DateUtil.convertTimestampToStringDate(referral.getSentDate()));
        referralItem.setReferralStatus(referral.getStatus());
        referralItem.setReferralStatusDisplay(referral.getStatus() == null ? "" : referral.getStatus().toString());
        referralItem.setPatientLastName(patient.getPerson().getLastName());
        referralItem.setPatientFirstName(patient.getPerson().getFirstName());
        referralItem.setReferringTestName(analysis.getTest().getLocalizedTestName().getLocalizedValue());
        if (!resultList.isEmpty()) {
            referralItem.setReferralResultsDisplay(getAppropriateResultValue(resultList));
            referralItem.setResultDate(analysis.getCompletedDateForDisplay());
        }
        Organization organization = referral.getOrganization();
        if (organization != null) {
            referralItem.setReferenceLabDisplay(organization.getOrganizationName());
        }
        referralItem.setNotes(analysisService.getNotesAsString(analysis, true, true, "<br/>", false));
        referralItem.setAnalysisId(analysis.getId());

        return referralItem;
    }

    private String getAppropriateResultValue(List<Result> results) {
        Result result = results.get(0);
        if (TypeOfTestResultServiceImpl.ResultType.isMultiSelectVariant(result.getResultType())) {
            List<String> localizedResults = new ArrayList<>();
            for (Result subResult : results) {
                if (GenericValidator.isBlankOrNull(subResult.getValue()) || "0".equals(subResult.getValue())) {
                    continue;
                }
                Dictionary dictionary = dictionaryService.get(subResult.getValue());
                if (dictionary != null && !GenericValidator.isBlankOrNull(dictionary.getLocalizedName())) {
                    localizedResults.add(dictionary.getLocalizedName());
                }
            }
            return String.join(", ", localizedResults);
        } else if (TypeOfTestResultServiceImpl.ResultType.isDictionaryVariant(result.getResultType())) {
            if (!GenericValidator.isBlankOrNull(result.getValue()) && !"0".equals(result.getValue())) {
                Dictionary dictionary = dictionaryService.get(result.getValue());
                if (dictionary != null) {
                    return dictionary.getLocalizedName();
                }
            }
        } else {
            String resultValue = GenericValidator.isBlankOrNull(result.getValue()) ? "" : result.getValue();

            if (!GenericValidator.isBlankOrNull(resultValue)
                    && result.getAnalysis().getTest().getUnitOfMeasure() != null) {
                resultValue += " " + result.getAnalysis().getTest().getUnitOfMeasure().getName();
            }

            return resultValue;
        }

        return "";
    }
}

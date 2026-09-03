package org.openelisglobal.report.service.impl;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.provider.service.ProviderService;
import org.openelisglobal.provider.valueholder.Provider;
import org.openelisglobal.report.ReportColumn;
import org.openelisglobal.report.ReportDefinitionColumnParser;
import org.openelisglobal.report.ReportRow;
import org.openelisglobal.report.ReportingData;
import org.openelisglobal.report.service.PatientReportService;
import org.openelisglobal.reportdefinition.service.ReportDefinitionService;
import org.openelisglobal.reportdefinition.valueholder.ReportDefinition;
import org.openelisglobal.result.action.util.ResultsLoadUtility;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.samplehuman.valueholder.SampleHuman;
import org.openelisglobal.sampleorganization.service.SampleOrganizationService;
import org.openelisglobal.sampleorganization.valueholder.SampleOrganization;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.test.service.TestService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/** Report type constant for patient results report definition lookup. */
final class PatientReportConstants {
    static final String REPORT_TYPE_PATIENT = "PATIENT";
}

/**
 * Default implementation of {@link PatientReportService}. Column definitions
 * are read from report_definition when report_type=PATIENT; otherwise a default
 * column set is used.
 */
@Service
public class PatientReportServiceImpl implements PatientReportService {

    @Autowired
    private PatientService patientService;

    @Autowired
    private SampleService sampleService;

    @Autowired
    private SampleHumanService sampleHumanService;

    @Autowired
    private SampleOrganizationService sampleOrganizationService;

    @Autowired
    private ProviderService providerService;

    @Autowired
    private ReportDefinitionService reportDefinitionService;

    @Autowired
    private TestService testService;

    @Autowired
    private org.openelisglobal.systemuser.service.UserService userService;

    @Autowired
    private ObjectProvider<ResultsLoadUtility> resultsLoadUtilityProvider;

    @Autowired
    private IStatusService statusService;

    @Autowired
    private ChinesePatientReportPdfRenderer patientReportPdfRenderer;

    @Override
    public ReportingData buildPatientResultsReport(String patientId, String sysUserId) {
        if (sysUserId == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED, "Unauthorized");
        }

        Patient patient = patientService.getData(patientId);
        if (patient == null) {
            return null;
        }

        ResultsLoadUtility resultsUtility = resultsLoadUtilityProvider.getObject();
        resultsUtility.setSysUser(sysUserId);
        excludeNonFinalResults(resultsUtility);

        List<TestResultItem> results = resultsUtility.getGroupedTestsForPatient(patient);
        results = userService.filterResultsByLabUnitRoles(sysUserId, results,
                org.openelisglobal.common.constants.Constants.ROLE_RESULTS);
        return buildReportFromResults(results, patient);
    }

    @Override
    public byte[] buildPatientResultsPdf(String patientId, String sysUserId) {
        ReportingData data = buildPatientResultsReport(patientId, sysUserId);
        return data == null ? null : patientReportPdfRenderer.render(data);
    }

    ReportingData buildReportFromResults(List<TestResultItem> results, Patient patient) {
        results = results.stream()
                .filter(item -> item.getIsGroupSeparator()
                        || (IActionConstants.YES.equals(item.getReportable())
                                && isFinalized(item.getAnalysisStatusId())))
                .collect(Collectors.toList());

        List<ReportColumn> columns = resolveColumns();
        return mapToReportingData(results, patient, columns);
    }

    /**
     * Resolve report columns from the active PATIENT report definition, or return
     * default columns if none is configured.
     */
    private List<ReportColumn> resolveColumns() {
        ReportDefinition definition = reportDefinitionService
                .getActiveByReportType(PatientReportConstants.REPORT_TYPE_PATIENT);
        if (definition != null && definition.getDefinitionJson() != null) {
            List<ReportColumn> parsed = ReportDefinitionColumnParser.parseColumns(definition.getDefinitionJson());
            if (!parsed.isEmpty()) {
                return parsed;
            }
        }
        return getDefaultPatientReportColumns();
    }

    private static List<ReportColumn> getDefaultPatientReportColumns() {
        List<ReportColumn> columns = new ArrayList<>();
        columns.add(new ReportColumn("accessionNumber", "实验室编号", "String"));
        columns.add(new ReportColumn("patientName", "患者姓名", "String"));
        columns.add(new ReportColumn("patientExternalId", "患者编号", "String"));
        columns.add(new ReportColumn("patientGender", "性别", "String"));
        columns.add(new ReportColumn("patientDateOfBirth", "出生日期", "String"));
        columns.add(new ReportColumn("organizationName", "送检机构", "String"));
        columns.add(new ReportColumn("clinicianName", "申请医生", "String"));
        columns.add(new ReportColumn("sampleType", "标本类型", "String"));
        columns.add(new ReportColumn("sampleCollectionDate", "采集时间", "String"));
        columns.add(new ReportColumn("sampleReceivedDate", "接收时间", "String"));
        columns.add(new ReportColumn("testName", "检验项目", "String"));
        columns.add(new ReportColumn("resultValue", "结果", "String"));
        columns.add(new ReportColumn("unitsOfMeasure", "单位", "String"));
        columns.add(new ReportColumn("referenceRange", "参考范围", "String"));
        columns.add(new ReportColumn("resultFlag", "结果提示", "String"));
        columns.add(new ReportColumn("testMethod", "检验方法", "String"));
        columns.add(new ReportColumn("testDate", "检测完成时间", "String"));
        columns.add(new ReportColumn("technician", "检验人员", "String"));
        columns.add(new ReportColumn("analysisStatus", "报告状态", "String"));
        columns.add(new ReportColumn("remarks", "备注", "String"));
        return columns;
    }

    private void excludeNonFinalResults(ResultsLoadUtility resultsUtility) {
        resultsUtility.addExcludedAnalysisStatus(AnalysisStatus.SampleRejected);
        resultsUtility.addExcludedAnalysisStatus(AnalysisStatus.NotStarted);
        resultsUtility.addExcludedAnalysisStatus(AnalysisStatus.Canceled);
        resultsUtility.addExcludedAnalysisStatus(AnalysisStatus.TechnicalAcceptance);
        resultsUtility.addExcludedAnalysisStatus(AnalysisStatus.TechnicalRejected);
        resultsUtility.addExcludedAnalysisStatus(AnalysisStatus.BiologistRejected);
        resultsUtility.addExcludedAnalysisStatus(AnalysisStatus.NonConforming_depricated);
    }

    private boolean isFinalized(String analysisStatusId) {
        return statusService.matches(analysisStatusId, AnalysisStatus.Finalized);
    }

    private ReportingData mapToReportingData(List<TestResultItem> results, Patient patient,
            List<ReportColumn> columns) {
        ReportingData data = new ReportingData();
        data.setColumns(columns);

        // Pre-fetch related metadata to avoid N+1 queries
        java.util.Map<String, String> orgNameMap = new java.util.HashMap<>();
        java.util.Map<String, String> clinicianMap = new java.util.HashMap<>();
        java.util.Map<String, String> collectionDateMap = new java.util.HashMap<>();

        java.util.Set<String> uniqueAccessions = results.stream()
                .filter(item -> !item.getIsGroupSeparator() && item.getAccessionNumber() != null)
                .map(TestResultItem::getAccessionNumber).collect(java.util.stream.Collectors.toSet());

        for (String accNum : uniqueAccessions) {
            Sample sample = new Sample();
            sample.setAccessionNumber(accNum);
            sampleService.getSampleByAccessionNumber(sample);

            if (sample.getId() != null) {
                SampleOrganization sampleOrg = new SampleOrganization();
                sampleOrg.setSample(sample);
                sampleOrganizationService.getDataBySample(sampleOrg);
                if (sampleOrg.getOrganization() != null) {
                    orgNameMap.put(accNum, sampleOrg.getOrganization().getOrganizationName());
                }

                SampleHuman sampleHuman = new SampleHuman();
                sampleHuman.setSampleId(sample.getId());
                sampleHumanService.getDataBySample(sampleHuman);
                if (sampleHuman.getProviderId() != null) {
                    Provider provider = new Provider();
                    provider.setId(sampleHuman.getProviderId());
                    providerService.getData(provider);
                    if (provider.getPerson() != null) {
                        clinicianMap.put(accNum,
                                provider.getPerson().getLastName() + ", " + provider.getPerson().getFirstName());
                    }
                }

                collectionDateMap.put(accNum, sample.getCollectionDateForDisplay());
            }
        }

        // Define Rows
        List<ReportRow> rows = new ArrayList<>();
        for (TestResultItem item : results) {
            if (item.getIsGroupSeparator()) {
                continue;
            }

            ReportRow row = new ReportRow();
            String accNum = item.getAccessionNumber();
            String orgName = orgNameMap.getOrDefault(accNum, "");
            String clinician = clinicianMap.getOrDefault(accNum, "");
            String collectionDate = collectionDateMap.getOrDefault(accNum, "");

            // Build row data by column key so order matches definition
            for (ReportColumn col : columns) {
                String value = getCellValue(col.getKey(), item, patient, orgName, clinician, collectionDate);
                row.addData(col.getKey(), value);
                row.addCell(value);
            }
            rows.add(row);
        }
        data.setRows(rows);
        return data;
    }

    private String getCellValue(String key, TestResultItem item, Patient patient, String orgName, String clinician,
            String collectionDate) {
        if (key == null) {
            return "";
        }
        switch (key) {
        case "accessionNumber":
            return item.getAccessionNumber() != null ? item.getAccessionNumber() : "";
        case "patientName":
            return item.getPatientName() != null ? item.getPatientName() : "";
        case "patientExternalId":
            return patient.getExternalId() != null ? patient.getExternalId() : "";
        case "patientGender":
            return localizeGender(patient.getGender());
        case "patientDateOfBirth":
            return patient.getBirthDateForDisplay() != null ? patient.getBirthDateForDisplay() : "";
        case "organizationName":
            return orgName != null ? orgName : "";
        case "sampleCollectionDate":
            return collectionDate != null ? collectionDate : "";
        case "sampleReceivedDate":
            return item.getReceivedDate() != null ? item.getReceivedDate() : "";
        case "sampleType":
            return item.getSampleType() != null ? item.getSampleType() : "";
        case "clinicianName":
            return clinician != null ? clinician : "";
        case "testName":
            return item.getTestName() != null ? item.getTestName() : "";
        case "testDescription":
            if (item.getTestId() != null) {
                org.openelisglobal.test.valueholder.Test test = testService.getTestById(item.getTestId());
                if (test != null && test.getDescription() != null) {
                    return test.getDescription();
                }
            }
            return "";
        case "analysisStatus":
            return isFinalized(item.getAnalysisStatusId()) ? "已审核" : "";
        case "resultValue":
            return item.getResultValue() != null ? item.getResultValue() : "";
        case "unitsOfMeasure":
            return item.getUnitsOfMeasure() != null ? item.getUnitsOfMeasure() : "";
        case "referenceRange":
            return item.getNormalRange() != null ? item.getNormalRange() : "";
        case "resultFlag":
            return getResultFlag(item);
        case "testMethod":
            return item.getTestMethod() != null ? item.getTestMethod() : "";
        case "testDate":
            return item.getTestDate() != null ? item.getTestDate() : "";
        case "technician":
            return item.getTechnician() != null ? item.getTechnician() : "";
        case "remarks":
            return item.getRemarks() != null ? item.getRemarks() : "";
        default:
            return "";
        }
    }

    private String localizeGender(String gender) {
        if (gender == null) {
            return "";
        }
        return switch (gender.trim().toUpperCase(Locale.ROOT)) {
        case "M", "MALE" -> "男";
        case "F", "FEMALE" -> "女";
        case "U", "UNKNOWN" -> "未知";
        default -> gender;
        };
    }

    private String getResultFlag(TestResultItem item) {
        Double numericResult = parseNumericResult(item.getResultValue());
        if (numericResult != null
                && ((item.getLowerCritical() != 0 && numericResult < item.getLowerCritical())
                        || (item.getHigherCritical() != 0 && numericResult > item.getHigherCritical()))) {
            return "危急";
        }
        if (!item.isValid()) {
            return "超出有效范围";
        }
        return item.isNormal() ? "正常" : "异常";
    }

    private Double parseNumericResult(String value) {
        if (value == null) {
            return null;
        }
        try {
            return Double.valueOf(value.trim().replaceFirst("^[<>]=?\\s*", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}

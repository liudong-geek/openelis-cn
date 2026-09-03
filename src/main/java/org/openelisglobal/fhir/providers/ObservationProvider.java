package org.openelisglobal.fhir.providers;

import ca.uhn.fhir.model.api.Include;
import ca.uhn.fhir.rest.annotation.Create;
import ca.uhn.fhir.rest.annotation.Delete;
import ca.uhn.fhir.rest.annotation.IdParam;
import ca.uhn.fhir.rest.annotation.IncludeParam;
import ca.uhn.fhir.rest.annotation.OptionalParam;
import ca.uhn.fhir.rest.annotation.Read;
import ca.uhn.fhir.rest.annotation.ResourceParam;
import ca.uhn.fhir.rest.annotation.Search;
import ca.uhn.fhir.rest.annotation.Sort;
import ca.uhn.fhir.rest.annotation.Update;
import ca.uhn.fhir.rest.api.MethodOutcome;
import ca.uhn.fhir.rest.api.SortSpec;
import ca.uhn.fhir.rest.param.DateRangeParam;
import ca.uhn.fhir.rest.param.QuantityAndListParam;
import ca.uhn.fhir.rest.param.ReferenceAndListParam;
import ca.uhn.fhir.rest.param.StringAndListParam;
import ca.uhn.fhir.rest.param.TokenAndListParam;
import ca.uhn.fhir.rest.server.IResourceProvider;
import ca.uhn.fhir.rest.server.exceptions.InternalErrorException;
import ca.uhn.fhir.rest.server.exceptions.InvalidRequestException;
import ca.uhn.fhir.rest.server.exceptions.ResourceNotFoundException;
import ca.uhn.fhir.rest.server.exceptions.UnprocessableEntityException;
import jakarta.servlet.http.HttpServletRequest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.DiagnosticReport;
import org.hl7.fhir.r4.model.Encounter;
import org.hl7.fhir.r4.model.IdType;
import org.hl7.fhir.r4.model.Observation;
import org.hl7.fhir.r4.model.OperationOutcome;
import org.hl7.fhir.r4.model.Patient;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.formfields.FormFields.Field;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.registration.ResultUpdateRegister;
import org.openelisglobal.common.services.registration.interfaces.IResultUpdate;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.dataexchange.fhir.FhirUtil;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.provider.service.ProviderService;
import org.openelisglobal.provider.valueholder.Provider;
import org.openelisglobal.result.action.util.ResultSet;
import org.openelisglobal.result.action.util.ResultUtil;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.service.LogbookResultsPersistService;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.samplehuman.valueholder.SampleHuman;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.validation.Errors;
import org.springframework.validation.ObjectError;

/**
 * FHIR R4 Resource Provider for Observation resources.
 *
 * <p>
 * Exposes lab results from OpenELIS directly via the native FHIR facade. Read
 * and Write operations query OpenELIS DB directly for consistency with the
 * source of truth. Search forwards to the HAPI FHIR store to support the full
 * FHIR search parameter set.
 *
 * <p>
 * Creation accepts a single quantitative result for an existing, collected and
 * received clinical specimen. External final status never approves a result
 * inside LIS; the local validation workflow remains mandatory.
 *
 * <p>
 * Supported operations:
 * <ul>
 * <li>READ: GET /fhir/Observation/{uuid}</li>
 * <li>CREATE: POST /fhir/Observation</li>
 * <li>SEARCH: GET /fhir/Observation?patient={uuid}&amp;...</li>
 * <li>UPDATE: PUT /fhir/Observation/{uuid}</li>
 * <li>DELETE is rejected; results require the controlled LIS correction
 * workflow.</li>
 * </ul>
 */
@Component
public class ObservationProvider implements IResourceProvider {

    @Autowired
    private org.openelisglobal.fhir.service.FhirObservationIntakeGuard intakeGuard;

    @Autowired
    private org.openelisglobal.fhir.service.FhirClinicalTestReadiness testReadiness;

    @Autowired
    private FhirTransformService fhirTransformService;

    @Autowired
    private SampleItemService sampleItemService;
    @Autowired
    private SampleHumanService sampleHumanService;

    @Autowired
    private IStatusService statusService;

    @Autowired
    private ProviderService providerService;

    @Autowired
    private DictionaryService dictionaryService;

    @Autowired
    private ResultService resultService;

    @Autowired
    private LogbookResultsPersistService logbookResultsPersistService;

    @Autowired
    private FhirUtil util;

    @Override
    public Class<Observation> getResourceType() {
        return Observation.class;
    }

    @Read
    public Observation read(@IdParam IdType id) {
        String method = "read";
        try {
            if (id == null || !id.hasIdPart()) {
                throw new ResourceNotFoundException("Missing Observation ID");
            }
            String uuid = id.getIdPart();

            Result result = resultService.getResultByFhirUuid(uuid);
            if (result == null) {
                throw new ResourceNotFoundException("Observation not found: " + uuid);
            }

            Observation observation = fhirTransformService.transformResultToObservation(result);
            if (observation == null) {
                throw new ResourceNotFoundException("Failed to transform result to observation: " + uuid);
            }

            return observation;

        } catch (ResourceNotFoundException e) {
            throw e;
        } catch (Exception e) {
            LogEvent.logError(this.getClass().getSimpleName(), method,
                    "Unexpected error reading observation: " + e.getMessage());
            throw new InternalErrorException("Unexpected server error retrieving Observation");
        }
    }

    @Create
    public MethodOutcome createObservation(@ResourceParam Observation observation, HttpServletRequest request) {

        String method = "createObservation";

        if (observation == null) {
            LogEvent.logError(getClass().getSimpleName(), method, "Observation resource is null");
            throw new InvalidRequestException("Observation resource cannot be null");
        }

        try {

            var analysis = intakeGuard.validate(observation, FhirProviderUtils.getSysUserId(request), null);
            TestResultItem item = fhirTransformService.createResultFromObservation(observation);
            item.setTestId(analysis.getTest().getId());
            testReadiness.configureResult(analysis.getTest(), item);
            item.setAnalysisStatusId(statusService.getStatusID(AnalysisStatus.TechnicalAcceptance));

            ResultsUpdateDataSet actionDataSet = handleObservationPersistence(item, observation, null, request, method);

            List<IResultUpdate> updaters = ResultUpdateRegister.getRegisteredUpdaters();

            String sysUserId = FhirProviderUtils.getSysUserId(request);

            logbookResultsPersistService.persistDataSet(actionDataSet, updaters, sysUserId);

            fhirTransformService.transformPersistResultsEntryFhirObjects(actionDataSet);

            LogEvent.logInfo(getClass().getSimpleName(), method,
                    "Results created: " + actionDataSet.getNewResults().size());

            MethodOutcome outcome = new MethodOutcome();
            outcome.setCreated(true);

            for (ResultSet resultSet : actionDataSet.getNewResults()) {

                if (resultSet == null || resultSet.result == null) {
                    continue;
                }

                Observation fhirObservation = fhirTransformService.transformResultToObservation(resultSet.result);

                outcome.setResource(fhirObservation);
                outcome.setId(fhirObservation.getIdElement());
            }

            return outcome;

        } catch (ca.uhn.fhir.rest.server.exceptions.BaseServerResponseException e) {

            throw e;

        } catch (Exception e) {

            LogEvent.logError(e);

            OperationOutcome outcome = new OperationOutcome();

            outcome.addIssue().setSeverity(OperationOutcome.IssueSeverity.ERROR)
                    .setCode(OperationOutcome.IssueType.EXCEPTION).setDiagnostics(e.getMessage());

            throw new InternalErrorException("Unexpected server error while creating Observation", e);
        }
    }

    @Update
    public MethodOutcome update(@IdParam IdType theId, @ResourceParam Observation fhirObservation,
            HttpServletRequest request) {

        String method = "updateObservation";

        LogEvent.logInfo(getClass().getSimpleName(), method,
                "Received update request for Observation id=" + (theId != null ? theId.getIdPart() : "NULL"));

        if (theId == null) {
            LogEvent.logError(getClass().getSimpleName(), method, "Observation ID is null");
            throw new InvalidRequestException("Observation ID cannot be null");
        }

        if (fhirObservation == null) {
            LogEvent.logError(getClass().getSimpleName(), method, "Observation resource is null");
            throw new InvalidRequestException("Observation resource cannot be null");
        }

        try {

            String resultUUID = theId.getIdPart();

            LogEvent.logInfo(getClass().getSimpleName(), method,
                    "Looking up existing Result using FHIR UUID=" + resultUUID);

            Result existingResult = fhirTransformService.getItemByFhirId(resultUUID, resultService);

            if (existingResult == null) {
                LogEvent.logError(getClass().getSimpleName(), method, "No Result found for UUID=" + resultUUID);
                throw new ResourceNotFoundException("Observation/" + resultUUID);
            }

            LogEvent.logInfo(getClass().getSimpleName(), method,
                    "Existing Result found with ID=" + existingResult.getId());

            var analysis = intakeGuard.validate(fhirObservation, FhirProviderUtils.getSysUserId(request),
                    existingResult);
            TestResultItem item = fhirTransformService.createResultFromObservation(fhirObservation);
            item.setTestId(analysis.getTest().getId());
            testReadiness.configureResult(analysis.getTest(), item);
            item.setAnalysisStatusId(statusService.getStatusID(AnalysisStatus.TechnicalAcceptance));

            ResultsUpdateDataSet actionDataSet = handleObservationPersistence(item, fhirObservation, existingResult,
                    request, method);

            List<IResultUpdate> updaters = ResultUpdateRegister.getRegisteredUpdaters();

            String sysUserId = FhirProviderUtils.getSysUserId(request);

            LogEvent.logInfo(getClass().getSimpleName(), method,
                    "Persisting dataset with updaters count=" + updaters.size());

            logbookResultsPersistService.persistDataSet(actionDataSet, updaters, sysUserId);

            LogEvent.logInfo(getClass().getSimpleName(), method, "Transforming persisted results to FHIR resources");

            fhirTransformService.transformPersistResultsEntryFhirObjects(actionDataSet);

            LogEvent.logInfo(getClass().getSimpleName(), method,
                    "Results updated successfully: count=" + actionDataSet.getModifiedItems().size());

            MethodOutcome outcome = new MethodOutcome();
            outcome.setCreated(false);

            for (ResultSet resultSet : actionDataSet.getModifiedResults()) {

                if (resultSet == null || resultSet.result == null) {

                    LogEvent.logWarn(getClass().getSimpleName(), method,
                            "Null ResultSet encountered during response building");
                    continue;
                }

                Observation updatedObservation = fhirTransformService.transformResultToObservation(resultSet.result);

                updatedObservation.setId(theId);

                outcome.setResource(updatedObservation);
            }

            return outcome;

        } catch (ca.uhn.fhir.rest.server.exceptions.BaseServerResponseException e) {

            LogEvent.logError(getClass().getSimpleName(), method, "Handled exception: " + e.getMessage());

            throw e;

        } catch (Exception e) {

            LogEvent.logError(getClass().getSimpleName(), method, "Unexpected error during Observation update");

            OperationOutcome outcome = new OperationOutcome();

            outcome.addIssue().setSeverity(OperationOutcome.IssueSeverity.ERROR)
                    .setCode(OperationOutcome.IssueType.EXCEPTION).setDiagnostics(e.getMessage());

            throw new InternalErrorException("Unexpected server error while update Observation", e);
        }
    }

    @Delete
    public MethodOutcome delete(@IdParam IdType theId, HttpServletRequest request) {
        throw new ca.uhn.fhir.rest.server.exceptions.MethodNotAllowedException("检验结果不允许通过设备接口删除，请使用 LIS 受控结果更正流程");
    }

    @Search
    public Bundle search(
            @OptionalParam(name = Observation.SP_ENCOUNTER, chainWhitelist = { "",
                    Encounter.SP_TYPE }, targetTypes = Encounter.class) ReferenceAndListParam encounterReference,
            @OptionalParam(name = Observation.SP_SUBJECT, chainWhitelist = { "", Patient.SP_IDENTIFIER,
                    Patient.SP_GIVEN, Patient.SP_FAMILY,
                    Patient.SP_NAME }, targetTypes = Patient.class) ReferenceAndListParam patientReference,
            @OptionalParam(name = Observation.SP_HAS_MEMBER, chainWhitelist = { "",
                    Observation.SP_CODE }, targetTypes = Observation.class) ReferenceAndListParam hasMemberReference,
            @OptionalParam(name = Observation.SP_VALUE_CONCEPT) TokenAndListParam valueConcept,
            @OptionalParam(name = Observation.SP_VALUE_DATE) DateRangeParam valueDateParam,
            @OptionalParam(name = Observation.SP_VALUE_QUANTITY) QuantityAndListParam valueQuantityParam,
            @OptionalParam(name = Observation.SP_VALUE_STRING) StringAndListParam valueStringParam,
            @OptionalParam(name = Observation.SP_DATE) DateRangeParam date,
            @OptionalParam(name = Observation.SP_CODE) TokenAndListParam code,
            @OptionalParam(name = Observation.SP_CATEGORY) TokenAndListParam category,
            @OptionalParam(name = Observation.SP_RES_ID) TokenAndListParam id,
            @OptionalParam(name = "_lastUpdated") DateRangeParam lastUpdated, @Sort SortSpec sort,
            @OptionalParam(name = Observation.SP_PATIENT, chainWhitelist = { "", Patient.SP_IDENTIFIER,
                    Patient.SP_GIVEN, Patient.SP_FAMILY,
                    Patient.SP_NAME }, targetTypes = Patient.class) ReferenceAndListParam patientParam,
            @IncludeParam(allow = { "Observation:" + Observation.SP_ENCOUNTER, "Observation:" + Observation.SP_PATIENT,
                    "Observation:" + Observation.SP_HAS_MEMBER }) HashSet<Include> includes,
            @IncludeParam(reverse = true, allow = { "Observation:" + Observation.SP_HAS_MEMBER,
                    "DiagnosticReport:" + DiagnosticReport.SP_RESULT }) HashSet<Include> revIncludes,
            HttpServletRequest request) {
        String method = "search";
        try {

            Bundle resultBundle = util.forwardSearchToFhirStore(request);

            if (resultBundle == null) {
                resultBundle = new Bundle();
            }

            if (resultBundle.getType() == null) {
                resultBundle.setType(Bundle.BundleType.SEARCHSET);
            }

            if (resultBundle.getEntry() == null) {
                resultBundle.setEntry(new ArrayList<>());
            }

            return resultBundle;
        } catch (Exception e) {
            LogEvent.logError(this.getClass().getSimpleName(), method,
                    "Error searching Observations: " + e.getMessage());
            throw new InternalErrorException("Unexpected server error searching Observations");
        }
    }

    private ResultsUpdateDataSet handleObservationPersistence(TestResultItem item, Observation observation,
            Result existingResult, HttpServletRequest request, String method) {

        if (item == null) {
            if (existingResult == null) {
                throw new UnprocessableEntityException("Failed to transform Observation into TestResultItem");
            } else {
                LogEvent.logError(getClass().getSimpleName(), method, "createResultFromObservation returned NULL");
                throw new InternalErrorException("Failed to transform Observation to TestResultItem");
            }
        }

        if (item.getSampleItemId() == null) {
            throw new UnprocessableEntityException("SampleItemId is null in TestResultItem");
        }

        Sample sample = sampleItemService.get(item.getSampleItemId()).getSample();

        if (sample == null) {
            throw new UnprocessableEntityException("SampleItem not found: " + item.getSampleItemId());
        }

        SampleHuman sampleHuman = sampleHumanService.getMatch("sampleId", sample.getId()).orElse(null);

        if (sampleHuman == null) {
            throw new UnprocessableEntityException("Failed to get SampleHuman for sample: " + sample.getId());
        }

        if (observation.hasPerformer()) {

            String practitionerUUID = observation.getPerformerFirstRep().getReferenceElement().getIdPart();

            Provider provider = fhirTransformService.getItemByFhirId(practitionerUUID, providerService);

            if (provider == null) {
                throw new UnprocessableEntityException("Provider not found: " + practitionerUUID);
            }

            sampleHuman.setProviderId(provider.getId());
            sampleHumanService.save(sampleHuman);
        }

        if (existingResult != null) {

            Result transformedResult = item.getResult();

            if (transformedResult == null) {
                LogEvent.logWarn(getClass().getSimpleName(), method,
                        "Transformed Result was null, creating new Result instance");
                transformedResult = new Result();
                item.setResult(transformedResult);
            }

            transformedResult.setId(existingResult.getId());
            item.setResultId(existingResult.getId());
            item.setIsModified(true);

            LogEvent.logInfo(getClass().getSimpleName(), method,
                    "Prepared TestResultItem for Result ID=" + existingResult.getId());

        } else {
            item.setIsModified(true);

            LogEvent.logInfo(getClass().getSimpleName(), method, "Transformed Observation to TestResultItem");
        }

        List<TestResultItem> items = new ArrayList<>();
        items.add(item);

        String sysUserId = FhirProviderUtils.getSysUserId(request);

        if (existingResult != null) {
            LogEvent.logInfo(getClass().getSimpleName(), method,
                    "Creating ResultsUpdateDataSet with systemUserId=" + sysUserId);
        }

        ResultsUpdateDataSet actionDataSet = new ResultsUpdateDataSet(sysUserId);

        actionDataSet.filterModifiedItems(items);

        if (existingResult != null) {
            LogEvent.logInfo(getClass().getSimpleName(), method,
                    "Filtered modified items count=" + actionDataSet.getModifiedItems().size());
        }

        if (actionDataSet.getModifiedItems().isEmpty()) {

            LogEvent.logWarn(getClass().getSimpleName(), method, "No modified items after filtering");

            throw new UnprocessableEntityException("No valid results found to process");
        }

        Errors errors = actionDataSet.validateModifiedItems();

        if (errors != null && errors.hasErrors()) {

            if (existingResult != null) {
                LogEvent.logError(getClass().getSimpleName(), method,
                        "Validation errors detected: count=" + errors.getErrorCount());
            }

            OperationOutcome outcome = new OperationOutcome();

            for (ObjectError error : errors.getAllErrors()) {

                LogEvent.logError("FHIR_VALIDATION", "ERROR",
                        "code=" + error.getCode() + ", message=" + error.getDefaultMessage());

                outcome.addIssue().setSeverity(OperationOutcome.IssueSeverity.ERROR)
                        .setCode(OperationOutcome.IssueType.INVALID).setDiagnostics(error.getDefaultMessage());
            }

            throw new InternalErrorException("Unexpected Error during validation");
        }

        boolean useTechnicianName = ConfigurationProperties.getInstance()
                .isPropertyValueEqual(Property.resultTechnicianName, "true");

        // Instrument completion is not LIS approval, even if interactive
        // auto-validation is configured.
        boolean alwaysValidate = true;

        boolean supportReferrals = FormFields.getInstance().useField(Field.ResultsReferral);

        String statusRuleSet = ConfigurationProperties.getInstance().getPropertyValueUpperCase(Property.StatusRules);

        if (existingResult != null) {
            LogEvent.logInfo(getClass().getSimpleName(), method, "Running ResultUtil.createResultsFromItems");
        }

        ResultUtil.createResultsFromItems(actionDataSet, supportReferrals, alwaysValidate, useTechnicianName,
                statusRuleSet, request);

        if (existingResult != null) {
            LogEvent.logInfo(getClass().getSimpleName(), method, "Running ResultUtil.createAnalysisOnlyUpdates");
        }

        ResultUtil.createAnalysisOnlyUpdates(actionDataSet, request);

        return actionDataSet;
    }

    private ResultsUpdateDataSet handleObservationDeletePersistence(Result result, HttpServletRequest request,
            String method) {

        if (result == null) {
            throw new ResourceNotFoundException("Observation result not found for delete");
        }

        TestResultItem item = new TestResultItem();
        item.setResult(result);
        item.setRejected(true);
        item.setShadowRejected(true);
        item.setShadowResultValue(result.getValue());
        item.setModified(true);
        item.setAnalysisId(result.getAnalysis().getId());
        item.setRejectReasonId(dictionaryService
                .getDictionaryByDictEntry("Free sample request form or vice versa. Please submit another sample.")
                .getId());
        item.setTestId(result.getAnalysis().getTest().getId());
        item.setAccessionNumber(result.getAnalysis().getSampleItem().getSample().getAccessionNumber());
        item.setAnalysisStatusId(statusService.getStatusID(AnalysisStatus.TechnicalRejected));

        String formattedDate = new SimpleDateFormat(DateUtil.getDateFormat()).format(new Date());
        item.setTestDate(formattedDate);

        String sysUserId = FhirProviderUtils.getSysUserId(request);

        List<TestResultItem> items = new ArrayList<>();
        items.add(item);

        ResultsUpdateDataSet actionDataSet = new ResultsUpdateDataSet(sysUserId);

        actionDataSet.filterModifiedItems(items);

        LogEvent.logInfo(getClass().getSimpleName(), method,
                "Filtered modified items count=" + actionDataSet.getModifiedItems().size());

        if (actionDataSet.getModifiedItems().isEmpty()) {
            LogEvent.logWarn(getClass().getSimpleName(), method, "No modified items after filtering");
            throw new UnprocessableEntityException("No valid results found to process");
        }

        Errors errors = actionDataSet.validateModifiedItems();

        if (errors != null && errors.hasErrors()) {
            LogEvent.logError(getClass().getSimpleName(), method,
                    "Validation errors detected: count=" + errors.getErrorCount());

            OperationOutcome outcome = new OperationOutcome();

            for (ObjectError error : errors.getAllErrors()) {
                LogEvent.logError("FHIR_VALIDATION", "ERROR",
                        "code=" + error.getCode() + ", message=" + error.getDefaultMessage());

                outcome.addIssue().setSeverity(OperationOutcome.IssueSeverity.ERROR)
                        .setCode(OperationOutcome.IssueType.INVALID).setDiagnostics(error.getDefaultMessage());
            }

            throw new InternalErrorException("Unexpected Error during validation");
        }

        boolean useTechnicianName = ConfigurationProperties.getInstance()
                .isPropertyValueEqual(Property.resultTechnicianName, "true");

        boolean alwaysValidate = ConfigurationProperties.getInstance()
                .isPropertyValueEqual(Property.ALWAYS_VALIDATE_RESULTS, "true");

        boolean supportReferrals = FormFields.getInstance().useField(Field.ResultsReferral);

        String statusRuleSet = ConfigurationProperties.getInstance().getPropertyValueUpperCase(Property.StatusRules);

        LogEvent.logInfo(getClass().getSimpleName(), method, "Running ResultUtil.createResultsFromItems");

        ResultUtil.createResultsFromItems(actionDataSet, supportReferrals, alwaysValidate, useTechnicianName,
                statusRuleSet, request);

        LogEvent.logInfo(getClass().getSimpleName(), method, "Running ResultUtil.createAnalysisOnlyUpdates");

        ResultUtil.createAnalysisOnlyUpdates(actionDataSet, request);

        return actionDataSet;
    }
}

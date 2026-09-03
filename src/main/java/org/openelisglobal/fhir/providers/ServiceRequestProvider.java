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
import ca.uhn.fhir.rest.annotation.Update;
import ca.uhn.fhir.rest.api.MethodOutcome;
import ca.uhn.fhir.rest.param.DateRangeParam;
import ca.uhn.fhir.rest.param.ReferenceAndListParam;
import ca.uhn.fhir.rest.param.TokenAndListParam;
import ca.uhn.fhir.rest.server.IResourceProvider;
import ca.uhn.fhir.rest.server.exceptions.InternalErrorException;
import ca.uhn.fhir.rest.server.exceptions.InvalidRequestException;
import ca.uhn.fhir.rest.server.exceptions.ResourceNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.hibernate.StaleObjectStateException;
import org.hl7.fhir.instance.model.api.IBaseResource;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.IdType;
import org.hl7.fhir.r4.model.Patient;
import org.hl7.fhir.r4.model.Practitioner;
import org.hl7.fhir.r4.model.ServiceRequest;
import org.hl7.fhir.r4.model.Specimen;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.dataexchange.fhir.FhirUtil;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.sample.action.util.SamplePatientUpdateData;
import org.openelisglobal.sample.action.util.SampleUtil;
import org.openelisglobal.sample.bean.SampleEditItem;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.form.SampleEditForm;
import org.openelisglobal.sample.service.SampleEditService;
import org.openelisglobal.sample.service.SamplePatientEntryService;
import org.openelisglobal.sample.validator.SampleEditFormValidator;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.validation.BindException;
import org.springframework.validation.Errors;
import org.springframework.validation.FieldError;

@Component
public class ServiceRequestProvider implements IResourceProvider {

    @Autowired
    private SamplePatientEntryService samplePatientService;

    @Autowired
    private AnalysisService analysisService;

    @Autowired
    private FhirTransformService fhirTransformService;

    @Autowired
    private SampleUtil sampleUtil;

    @Autowired
    private IStatusService statusService;

    @Autowired
    private SampleHumanService sampleHumanService;

    @Autowired
    private SampleEditService sampleEditService;

    @Autowired
    private FhirUtil util;

    @Autowired
    public SampleEditFormValidator formValidator;

    @Autowired
    private TestService testService;

    @Autowired
    private UserService userService;

    @Autowired
    private SampleItemService sampleItemService;

    @Autowired
    private PatientService patientService;

    @Autowired
    private org.openelisglobal.fhir.service.FhirOrderIntakeService intakeService;

    @Override
    public Class<? extends IBaseResource> getResourceType() {
        return ServiceRequest.class;

    }

    @Read
    public ServiceRequest readServiceRequest(@IdParam IdType theId) {
        String method = "readServiceRequest";
        try {
            FhirProviderUtils.validateIdParam(theId, "ServiceRequest", this.getClass().getSimpleName(), method);

            String analysisUuid = theId.getIdPart();
            final UUID requestUuid;
            try {
                requestUuid = UUID.fromString(analysisUuid);
            } catch (IllegalArgumentException e) {
                throw new InvalidRequestException("ServiceRequest ID must be a valid UUID");
            }
            List<Analysis> analyses = analysisService.getAllMatching("fhirUuid", requestUuid);

            if (analyses == null || analyses.isEmpty()) {
                ServiceRequest pending = intakeService.readPending(requestUuid);
                if (pending != null)
                    return pending;
                throw new ResourceNotFoundException("Analysis with FHIR ID: " + analysisUuid + " does not exist");
            }
            if (analyses.size() > 1) {
                LogEvent.logError(this.getClass().getSimpleName(), method,
                        "Duplicate Analysis records found for fhirUuid=" + analysisUuid);
                throw new InternalErrorException("Multiple Analysis records found for ServiceRequest UUID");
            }

            Analysis analysis = analyses.get(0);

            ServiceRequest serviceRequest = fhirTransformService.transformToServiceRequest(analysis.getId());
            if (serviceRequest == null) {
                throw new InternalErrorException("Failed to transform Analysis to ServiceRequest");
            }
            return intakeService.readCollected(requestUuid, serviceRequest);

        } catch (ResourceNotFoundException | InvalidRequestException e) {
            throw e;
        } catch (Exception e) {
            LogEvent.logError(this.getClass().getSimpleName(), method,
                    "Unexpected error while Reading ServiceRequest: " + e.getMessage());
            throw new InternalErrorException("Unexpected server error while Reading ServiceRequest", e);
        }
    }

    @Create
    public MethodOutcome createServiceRequest(@ResourceParam ServiceRequest serviceRequest,
            HttpServletRequest request) {
        try {
            return intakeService.create(serviceRequest, request);
        } catch (ca.uhn.fhir.rest.server.exceptions.BaseServerResponseException e) {
            throw e;
        } catch (Exception e) {
            LogEvent.logError(getClass().getSimpleName(), "createServiceRequest", "Clinical order intake failed");
            throw new InternalErrorException("检验申请接收失败，未完成的事务已回滚", e);
        }
    }

    @Update
    public MethodOutcome updateServiceRequest(@IdParam IdType theId, @ResourceParam ServiceRequest serviceRequest,
            HttpServletRequest request) {

        final String method = "updateServiceRequest";

        try {
            final String analysisUuid = requireNonBlank(theId != null ? theId.getIdPart() : null,
                    "Missing ServiceRequest ID in URL");

            requireNonNull(request, "HttpServletRequest cannot be null");

            requireNonNull(serviceRequest, "ServiceRequest resource cannot be null");
            requireTrue(serviceRequest.hasCode() && serviceRequest.getCode().hasCoding(),
                    "ServiceRequest.code.coding is required");

            final String sysUserId = requireNonBlank(FhirProviderUtils.getSysUserId(request),
                    "Missing or invalid system user ID");

            final List<Analysis> existingAnalyses = requireNonEmpty(
                    analysisService.getAllMatching("fhirUuid", UUID.fromString(analysisUuid)),
                    "Analysis not found with UUID: " + analysisUuid);

            final Analysis existingAnalysis = requireNonNull(existingAnalyses.get(0), "Analysis is invalid");

            final SampleItem sampleItem = requireNonNull(existingAnalysis.getSampleItem(), "SampleItem is missing");

            final Sample existingSample = requireNonNull(sampleItem.getSample(), "Sample is missing");

            final SampleEditForm form = new SampleEditForm();
            form.setAccessionNumber(
                    requireNonBlank(existingSample.getAccessionNumber(), "Accession number is missing"));
            form.setCurrentDate(DateUtil.getCurrentDateAsText());
            form.setIsEditable(true);
            form.setSearchFinished(true);
            form.setNoSampleFound(false);

            final SampleOrderItem orderItem = requireNonNull(
                    fhirTransformService.buildSampleOrderItemFromServiceRequest(serviceRequest, sysUserId),
                    "Failed to build SampleOrderItem");
            form.setSampleOrderItems(orderItem);

            final List<SampleEditItem> editItems = requireNonEmpty(
                    fhirTransformService.buildSampleEditItemsListFromServiceRequest(serviceRequest, sysUserId),
                    "No sample edit items derived");

            final List<SampleEditItem> existingTests = editItems.stream()
                    .filter(i -> i != null && !i.isAdd() && !i.isCanceled()).collect(Collectors.toList());

            final List<SampleEditItem> possibleTests = editItems.stream().filter(i -> i != null && i.isAdd())
                    .collect(Collectors.toList());

            form.setExistingTests(existingTests);
            form.setPossibleTests(possibleTests);

            if (!possibleTests.isEmpty()) {
                final List<Test> allTests = new ArrayList<>();

                existingAnalyses.stream()
                        .filter(a -> a != null && a.getTest() != null
                                && !statusService.matches(a.getStatusId(), AnalysisStatus.Canceled))
                        .map(Analysis::getTest).forEach(allTests::add);

                possibleTests.stream().map(SampleEditItem::getTestId).filter(Objects::nonNull).map(testService::get)
                        .filter(Objects::nonNull).forEach(allTests::add);

                final String sampleXml = requireNonBlank(
                        SampleUtil.buildSampleXml(allTests, sampleItem, sampleItem.getId()),
                        "Failed to build sample XML");

                form.setSampleXML(sampleXml);
            }

            final List<SampleItem> sampleItems = sampleItemService.getSampleItemsBySampleId(existingSample.getId());

            int maxSortOrder = 0;
            if (sampleItems != null && !sampleItems.isEmpty()) {
                maxSortOrder = sampleItems.stream().filter(Objects::nonNull).map(SampleItem::getSortOrder)
                        .filter(Objects::nonNull).mapToInt(v -> {
                            try {
                                return Integer.parseInt(v);
                            } catch (NumberFormatException e) {
                                return 0;
                            }
                        }).max().orElse(0);
            }

            form.setMaxAccessionNumber(existingSample.getAccessionNumber() + "-" + maxSortOrder);

            form.setSampleTypes(requireNonNull(userService.getUserSampleTypes(sysUserId, Constants.ROLE_RECEPTION),
                    "Sample types not found"));

            form.setTestSectionList(DisplayListService.getInstance().getList(ListType.TEST_SECTION_ACTIVE));

            form.setRejectReasonList(DisplayListService.getInstance().getList(ListType.REJECTION_REASONS));

            final Errors result = new BindException(form, "form");
            formValidator.validate(form, result);

            if (result.hasErrors()) {
                throw new InvalidRequestException(formatErrors(result));
            }

            final boolean sampleChanged = sampleUtil.accessionNumberChanged(form);

            Sample updatedSample = null;

            if (sampleChanged) {
                sampleUtil.validateNewAccessionNumber(form.getNewAccessionNumber(), result);

                if (result.hasErrors()) {
                    throw new InvalidRequestException(formatErrors(result));
                }

                updatedSample = sampleUtil.updateAccessionNumberInSample(form, sysUserId);
            }

            try {
                sampleEditService.editSample(form, request, updatedSample, sampleChanged, sysUserId);

            } catch (LIMSRuntimeException e) {
                if (e.getCause() instanceof StaleObjectStateException) {
                    throw new InvalidRequestException(
                            "Optimistic locking failed - resource was modified by another user");
                }
                LogEvent.logDebug(e);
                throw new InternalErrorException("Error updating sample: " + safeMessage(e), e);
            }

            try {
                fhirTransformService.transformAnalysisByIds(sampleEditService.getUpdatedAnalysisList());
            } catch (Exception fhirEx) {
                LogEvent.logWarn(this.getClass().getSimpleName(), method,
                        "FHIR sync failed during delete (non-blocking): " + safeMessage(fhirEx));
            }

            final ServiceRequest updatedServiceRequest = requireNonNull(
                    fhirTransformService.transformToServiceRequest(existingAnalysis.getId()),
                    "Failed to transform updated Analysis to ServiceRequest");

            final MethodOutcome outcome = new MethodOutcome();
            outcome.setCreated(false);
            outcome.setId(new IdType("ServiceRequest", analysisUuid));
            outcome.setResource(updatedServiceRequest);

            return outcome;

        } catch (InvalidRequestException | ResourceNotFoundException e) {
            LogEvent.logError(this.getClass().getSimpleName(), method, safeMessage(e));
            throw e;

        } catch (Exception e) {
            LogEvent.logError(this.getClass().getSimpleName(), method, safeMessage(e));
            throw new InternalErrorException("Unexpected server error while updating ServiceRequest: " + safeMessage(e),
                    e);
        }
    }

    @Delete
    public MethodOutcome deleteServiceRequest(@IdParam IdType theId, HttpServletRequest request) {
        final String method = "deleteServiceRequest";

        try {
            if (theId == null || theId.getIdPart() == null) {
                throw new InvalidRequestException("Missing ServiceRequest ID in URL");
            }

            String sysUserId = FhirProviderUtils.getSysUserId(request);
            String analysisUuid = theId.getIdPart();

            List<Analysis> existingAnalyses = analysisService.getAllMatching("fhirUuid", UUID.fromString(analysisUuid));
            if (existingAnalyses.isEmpty()) {
                throw new ResourceNotFoundException("Analysis not found with UUID: " + analysisUuid);
            }

            Analysis analysis = existingAnalyses.get(0);

            analysis = analysisService.get(analysis.getId());

            // Cancel the analysis
            analysis.setSysUserId(sysUserId);
            analysis.setStatusId(SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.Canceled));

            Analysis updatedAnalysis = analysisService.update(analysis);

            try {
                fhirTransformService.transformAnalysisByIds(List.of(updatedAnalysis.getId()));
            } catch (Exception fhirEx) {
                LogEvent.logWarn(this.getClass().getSimpleName(), method,
                        "FHIR sync failed during delete (non-blocking): " + safeMessage(fhirEx));
            }

            MethodOutcome outcome = new MethodOutcome();
            outcome.setResponseStatusCode(204);
            return outcome;

        } catch (InvalidRequestException | ResourceNotFoundException e) {
            LogEvent.logError(this.getClass().getSimpleName(), method, "Client error: " + safeMessage(e));
            throw e;
        } catch (InternalErrorException e) {
            LogEvent.logError(this.getClass().getSimpleName(), method, "Internal error: " + safeMessage(e));
            throw e;
        } catch (Exception e) {
            LogEvent.logError(this.getClass().getSimpleName(), method, "Unhandled exception: " + safeMessage(e));
            throw new InternalErrorException("Unexpected server error while deleting ServiceRequest: " + e.getMessage(),
                    e);
        }
    }

    @Search
    public Bundle searchForServiceRequests(
            @OptionalParam(name = ServiceRequest.SP_PATIENT, chainWhitelist = { "", Patient.SP_IDENTIFIER,
                    Patient.SP_GIVEN, Patient.SP_FAMILY,
                    Patient.SP_NAME }, targetTypes = Patient.class) ReferenceAndListParam patientReference,

            @OptionalParam(name = ServiceRequest.SP_SUBJECT, chainWhitelist = { "", Patient.SP_IDENTIFIER,
                    Patient.SP_GIVEN, Patient.SP_FAMILY,
                    Patient.SP_NAME }, targetTypes = Patient.class) ReferenceAndListParam subjectReference,

            @OptionalParam(name = ServiceRequest.SP_CODE) TokenAndListParam code,

            @OptionalParam(name = ServiceRequest.SP_REQUESTER, chainWhitelist = { "", Practitioner.SP_IDENTIFIER,
                    Practitioner.SP_GIVEN, Practitioner.SP_FAMILY,
                    Practitioner.SP_NAME }, targetTypes = Practitioner.class) ReferenceAndListParam participantReference,

            @OptionalParam(name = ServiceRequest.SP_OCCURRENCE) DateRangeParam occurrence,

            @OptionalParam(name = ServiceRequest.SP_RES_ID) TokenAndListParam uuid,

            @OptionalParam(name = "_lastUpdated") DateRangeParam lastUpdated,

            @OptionalParam(name = ServiceRequest.SP_SPECIMEN, chainWhitelist = { "",
                    Specimen.SP_IDENTIFIER }, targetTypes = Specimen.class) ReferenceAndListParam specimenReference,

            @IncludeParam(allow = { "ServiceRequest:" + ServiceRequest.SP_PATIENT,
                    "ServiceRequest:" + ServiceRequest.SP_SUBJECT, "ServiceRequest:" + ServiceRequest.SP_REQUESTER,
                    "ServiceRequest:" + ServiceRequest.SP_SPECIMEN }) HashSet<Include> includes,

            @IncludeParam(reverse = true, allow = { "Observation:based-on" }) HashSet<Include> revIncludes,

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
                    "Error searching ServiceRequest: " + e.getMessage());
            throw new InternalErrorException("Unexpected server error searching ServiceRequest");
        }
    }

    /**
     * Prevents NPE when logging exception messages
     */
    private String safeMessage(Exception e) {
        return (e == null || e.getMessage() == null) ? "No error message available" : e.getMessage();
    }

    private String formatErrors(Errors errors) {
        if (!errors.hasErrors()) {
            return "";
        }
        StringBuilder logMessage = new StringBuilder();
        logMessage.append("Validation failed with ").append(errors.getErrorCount()).append(" error(s)\n");

        for (Object error : errors.getAllErrors()) {
            if (error instanceof FieldError) {
                FieldError fieldError = (FieldError) error;
                logMessage.append("  - Field: '").append(fieldError.getField()).append("'")
                        .append(", Rejected value: '").append(fieldError.getRejectedValue()).append("'")
                        .append(", Message: ").append(fieldError.getDefaultMessage()).append("\n");
            } else {
                logMessage.append("  - ").append(error.toString()).append("\n");
            }
        }

        LogEvent.logError(this.getClass().getSimpleName(), "formatErrors", logMessage.toString());

        // Return formatted message for exception
        return errors.getAllErrors().stream().map(e -> {
            if (e instanceof FieldError) {
                FieldError fe = (FieldError) e;
                return fe.getField() + ": " + fe.getDefaultMessage();
            }
            return e.getDefaultMessage();
        }).filter(Objects::nonNull).collect(Collectors.joining("; "));
    }

    private <T> T requireNonNull(T obj, String message) {
        if (obj == null)
            throw new InternalErrorException(message);
        return obj;
    }

    private String requireNonBlank(String val, String message) {
        if (val == null || val.trim().isEmpty()) {
            throw new InvalidRequestException(message);
        }
        return val;
    }

    private void requireTrue(boolean condition, String message) {
        if (!condition)
            throw new InvalidRequestException(message);
    }

    private <T> List<T> requireNonEmpty(List<T> list, String message) {
        if (list == null || list.isEmpty()) {
            throw new InvalidRequestException(message);
        }
        return list;
    }

    private ServiceRequest extractCreatedServiceRequest(SamplePatientUpdateData updateData) {
        if (updateData.getSampleItemsTests() == null)
            return null;

        return updateData.getSampleItemsTests().stream()
                .filter(c -> c != null && c.analysises != null && !c.analysises.isEmpty()).map(c -> c.analysises.get(0))
                .filter(a -> a != null && a.getId() != null).findFirst()
                .map(a -> fhirTransformService.transformToServiceRequest(a.getId())).orElse(null);
    }

}

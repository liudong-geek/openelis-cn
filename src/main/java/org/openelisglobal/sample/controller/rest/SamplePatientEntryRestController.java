package org.openelisglobal.sample.controller.rest;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Pattern;
import java.lang.reflect.InvocationTargetException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.validator.GenericValidator;
import org.hibernate.StaleObjectStateException;
import org.hl7.fhir.r4.model.Enumerations.ResourceType;
import org.hl7.fhir.r4.model.Reference;
import org.hl7.fhir.r4.model.Task;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.provider.validation.AlphanumAccessionValidator;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.common.services.SampleOrderService;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.dataexchange.fhir.FhirUtil;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.dataexchange.order.valueholder.ElectronicOrder;
import org.openelisglobal.dataexchange.service.order.ElectronicOrderService;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.notifications.dao.NotificationDAO;
import org.openelisglobal.notifications.entity.Notification;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.organization.valueholder.Organization;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.patient.action.bean.PatientSearch;
import org.openelisglobal.provider.service.ProviderService;
import org.openelisglobal.provider.valueholder.Provider;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.controller.BaseSampleEntryController;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.service.SamplePatientEntryService;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.validator.SamplePatientEntryFormValidator;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.validation.BindingResult;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.web.servlet.support.RequestContextUtils;

@Controller
@RequestMapping(value = "/rest/")
public class SamplePatientEntryRestController extends BaseSampleEntryController {

    private static final org.slf4j.Logger logger = org.slf4j.LoggerFactory
            .getLogger(SamplePatientEntryRestController.class);

    @Value("${org.openelisglobal.requester.identifier:}")
    private String requestFhirUuid;

    private static final String[] ALLOWED_FIELDS = new String[] { "rememberSiteAndRequester", "customNotificationLogic",
            "patientEmailNotificationTestIds", "patientSMSNotificationTestIds", "providerEmailNotificationTestIds",
            "providerSMSNotificationTestIds", "patientProperties.currentDate", "patientProperties.patientLastUpdated",
            "patientProperties.personLastUpdated", "patientProperties.patientUpdateStatus",
            "patientProperties.patientPK", "patientProperties.guid", "patientProperties.fhirUuid",
            "patientProperties.STnumber", "patientProperties.subjectNumber", "patientProperties.nationalId",
            "patientProperties.lastName", "patientProperties.firstName", "patientProperties.aka",
            "patientProperties.mothersName", "patientProperties.mothersInitial", "patientProperties.streetAddress",
            "patientProperties.commune", "patientProperties.city", "patientProperties.addressDepartment",
            "patientProperties.addressDepartment", "patientPhone", "patientProperties.primaryPhone",
            "patientProperties.email", "patientProperties.healthRegion", "patientProperties.healthDistrict",
            "patientProperties.birthDateForDisplay", "patientProperties.age", "patientProperties.gender",
            "patientProperties.patientType", "patientProperties.insuranceNumber", "patientProperties.occupation",
            "patientProperties.education", "patientProperties.maritialStatus", "patientProperties.nationality",
            "patientProperties.otherNationality", "patientClinicalProperties.stdOther",
            "patientClinicalProperties.tbDiarrhae", "patientClinicalProperties.stdZona",
            "patientClinicalProperties.tbPrurigol", "patientClinicalProperties.stdKaposi",
            "patientClinicalProperties.tbMenigitis", "patientClinicalProperties.stdCandidiasis",
            "patientClinicalProperties.tbCerebral", "patientClinicalProperties.stdColonCancer",
            "patientClinicalProperties.tbExtraPulmanary", "patientClinicalProperties.arvProphyaxixType",
            "patientClinicalProperties.arvTreatmentReceiving", "patientClinicalProperties.arvTreatmentRemembered",
            "patientClinicalProperties.arvTreatment1", "patientClinicalProperties.arvTreatment2",
            "patientClinicalProperties.arvTreatment3", "patientClinicalProperties.arvTreatment4",
            "patientClinicalProperties.cotrimoxazoleReceiving", "patientClinicalProperties.cotrimoxazoleType",
            "patientClinicalProperties.infectionExtraPulmanary", "patientClinicalProperties.stdInfectionColon",
            "patientClinicalProperties.infectionCerebral", "patientClinicalProperties.stdInfectionCandidiasis",
            "patientClinicalProperties.infectionMeningitis", "patientClinicalProperties.stdInfectionKaposi",
            "patientClinicalProperties.infectionPrurigol", "patientClinicalProperties.stdInfectionZona",
            "patientClinicalProperties.infectionOther", "patientClinicalProperties.infectionUnderTreatment",
            "patientClinicalProperties.weight", "patientClinicalProperties.karnofskyScore",
            //
            "initialSampleConditionList", "sampleXML",
            //
            "sampleOrderItems.newRequesterName", "sampleOrderItems.modified", "sampleOrderItems.sampleId",
            "sampleOrderItems.labNo", "sampleOrderItems.requestDate", "sampleOrderItems.receivedDateForDisplay",
            "sampleOrderItems.receivedTime", "sampleOrderItems.nextVisitDate", "sampleOrderItems.requesterSampleID",
            "sampleOrderItems.referringPatientNumber", "sampleOrderItems.referringSiteId",
            "referringSiteDepartmentName", "sampleOrderItems.referringSiteDepartmentId",
            "sampleOrderItems.referringSiteName", "sampleOrderItems.referringSiteCode", "sampleOrderItems.program",
            "sampleOrderItems.providerPersonId", "sampleOrderItems.providerLastName",
            "sampleOrderItems.providerFirstName", "sampleOrderItems.providerWorkPhone", "sampleOrderItems.providerFax",
            "sampleOrderItems.providerEmail", "sampleOrderItems.facilityAddressStreet",
            "sampleOrderItems.facilityAddressCommune", "sampleOrderItems.facilityPhone", "sampleOrderItems.facilityFax",
            "sampleOrderItems.paymentOptionSelection", "sampleOrderItems.billingReferenceNumber",
            "sampleOrderItems.testLocationCode", "sampleOrderItems.otherLocationCode",
            "sampleOrderItems.contactTracingIndexName", "sampleOrderItems.contactTracingIndexRecordNumber",
            "sampleOrderItems.consentGiven", "sampleOrderItems.consentFormReference",
            "sampleOrderItems.consentRecordedAt", "sampleOrderItems.consentRecordedBy", "sampleOrderItems.priority",
            //
            "currentDate", "sampleOrderItems.newRequesterName", "sampleOrderItems.externalOrderNumber",
            // referral
            "referralItems*.additionalTestsXMLWad", "referralItems*.referralResultId", "referralItems*.referralId",
            "referralItems*.referredResultType", "referralItems*.modified", "referralItems*.inLabResultId",
            "referralItems*.referralReasonId", "referralItems*.referrer", "referralItems*.referredInstituteId",
            "referralItems*.referredSendDate", "referralItems*.referredTestId", "referralItems*.referredReportDate",
            "referralItems*.note", "useReferral", "sampleOrderItems.additionalQuestions", "sampleOrderItems.programId",
            "orderEntryOnly" };

    @Autowired
    private SamplePatientEntryFormValidator formValidator;

    @Autowired
    private SamplePatientEntryService samplePatientService;

    @Autowired
    private FhirTransformService fhirTransformService;

    @Autowired
    private UserService userService;

    @Autowired
    private ProviderService providerService;

    @Autowired
    private ElectronicOrderService electronicOrderService;

    @Autowired
    private OrganizationService organizationService;

    @Autowired
    private FhirUtil fhirUtil;
    @Autowired
    private NotificationDAO notificationDAO;
    @Autowired
    private UserRoleService userRoleService;
    @Autowired
    private SystemUserService systemUserService;
    @Autowired
    private SampleService sampleService;

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.setAllowedFields(ALLOWED_FIELDS);
    }

    @GetMapping(value = "SamplePatientEntry", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public SamplePatientEntryForm showSamplePatientEntry(HttpServletRequest request,
            @RequestParam(value = ID, required = false) @Pattern(regexp = "[a-zA-Z0-9 -]*") String externalOrderNumber)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {
        SamplePatientEntryForm form = new SamplePatientEntryForm();

        request.getSession().setAttribute(SAVE_DISABLED, TRUE);
        setupForm(form, request, externalOrderNumber);
        Map<String, ?> inputFlashMap = RequestContextUtils.getInputFlashMap(request);
        if (inputFlashMap != null) {
            form.getSampleOrderItems().setProviderId((String) inputFlashMap.get("sampleOrderItems.providerId"));
            form.getSampleOrderItems()
                    .setProviderPersonId((String) inputFlashMap.get("sampleOrderItems.providerPersonId"));
            form.getSampleOrderItems().setProviderEmail((String) inputFlashMap.get("sampleOrderItems.providerEmail"));
            form.getSampleOrderItems().setProviderFax((String) inputFlashMap.get("sampleOrderItems.providerfax"));
            form.getSampleOrderItems()
                    .setProviderFirstName((String) inputFlashMap.get("sampleOrderItems.providerFirstName"));
            form.getSampleOrderItems()
                    .setProviderLastName((String) inputFlashMap.get("sampleOrderItems.providerLastName"));
            form.getSampleOrderItems()
                    .setProviderWorkPhone((String) inputFlashMap.get("sampleOrderItems.providerWorkPhone"));
            form.getSampleOrderItems()
                    .setReferringSiteId((String) inputFlashMap.get("sampleOrderItems.referringSiteId"));
            form.getSampleOrderItems()
                    .setReferringSiteCode((String) inputFlashMap.get("sampleOrderItems.referringSiteCode"));
            form.getSampleOrderItems()
                    .setReferringSiteName((String) inputFlashMap.get("sampleOrderItems.referringSiteName"));
            form.getSampleOrderItems().setReferringSiteDepartmentId(
                    (String) inputFlashMap.get("sampleOrderItems.referringSiteDepartmentId"));
            form.getSampleOrderItems().setReferringSiteDepartmentName(
                    (String) inputFlashMap.get("sampleOrderItems.referringSiteDepartmentName"));
        }
        addFlashMsgsToRequest(request);
        return form;
    }

    private void setupReferralOption(SamplePatientEntryForm form) {
        form.setReferralOrganizations(DisplayListService.getInstance().getList(ListType.REFERRAL_ORGANIZATIONS));
        form.setReferralReasons(DisplayListService.getInstance().getList(ListType.REFERRAL_REASONS));
    }

    /**
     * Save a sample + patient order.
     *
     * <p>
     * OGC-584: This method historically returned HTTP 200 with the form body
     * regardless of success/failure (Struts 1 form-post pattern — validation errors
     * were stashed in a {@code BindingResult} and rendered inline by the
     * server-side page). In a JSON/AJAX context that's silent-failure: callers
     * can't distinguish "saved" from "dropped on the floor with errors in flash
     * scope." Converted to {@link ResponseEntity} so status codes are meaningful:
     * <ul>
     * <li>{@code 400 Bad Request} — validation failed (formValidator or
     * {@code updateData.validateSample})</li>
     * <li>{@code 500 Internal Server Error} — persistence exception caught from
     * {@code samplePatientService.saveEntry()}, or (belt-and- suspenders) the
     * response claims success but no row is found in {@code clinlims.sample}</li>
     * <li>{@code 200 OK} — verified success, row confirmed in DB</li>
     * </ul>
     * The response body is unchanged in every case — still the full form echo back
     * — so existing consumers (OrderContext.js, any integration that reads form
     * fields) keep working unchanged. Only the status code is new.
     */
    @PostMapping(value = "SamplePatientEntry", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<?> samplePatientEntrySave(HttpServletRequest request,
            @Validated(SamplePatientEntryForm.SamplePatientEntry.class) @RequestBody SamplePatientEntryForm form,
            BindingResult result, RedirectAttributes redirectAttributes)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {

        // Extract sampleOrder and workflowType early so we can check for environmental
        // workflow
        SampleOrderItem sampleOrder = form.getSampleOrderItems();
        String workflowType = sampleOrder != null ? sampleOrder.getEnvironmentalFieldAsString("workflowType") : null;

        formValidator.validate(form, result);

        // OGC-356: For environmental workflow, only check for non-patient validation
        // errors
        // Environmental samples don't require patient data (gender, nationalId, etc.)
        if (result.hasErrors()) {
            boolean hasNonPatientErrors = true;
            if ("environmental".equals(workflowType)) {
                // OGC-744 follow-up: the new @NotNull on patientProperties (added in this
                // PR) produces a FieldError whose field name is exactly "patientProperties"
                // — the previous startsWith("patientProperties.") filter required a dot
                // and let the bare top-level error fall through, breaking environmental
                // orders that legitimately omit patient data. Match both forms.
                List<org.springframework.validation.FieldError> nonPatientErrors = result.getFieldErrors().stream()
                        .filter(error -> !"patientProperties".equals(error.getField())
                                && !error.getField().startsWith("patientProperties."))
                        .collect(Collectors.toList());
                hasNonPatientErrors = !nonPatientErrors.isEmpty();
            }

            if (hasNonPatientErrors) {
                saveErrors(result);
                logger.warn("SamplePatientEntry 400 (formValidator): {}", result.getAllErrors());
                if (hasDuplicatePatientError(result)) {
                    return ResponseEntity.status(HttpStatus.CONFLICT).body(buildDuplicatePatientErrorBody(result));
                }
                return ResponseEntity.badRequest().body(buildErrorBody(result, "Validation failed"));
            }
        }
        // OGC-584: track persistence failure so we can return a proper HTTP
        // status after the catch blocks. `result.hasErrors()` alone isn't
        // reliable because the environmental-workflow path above intentionally
        // skips patient-field errors while leaving them in the BindingResult.
        boolean persistFailed = false;
        // Captures the actual failure message (e.g. storage-position-occupied)
        // when persistData rolls back, so we can return it instead of a
        // generic "Failed to save order" / "Transaction silently rolled
        // back...". Spring may wrap the original exception, so we walk the
        // cause chain.
        String persistErrorMessage = null;

        try {
            // The service transaction starts before any managed entity initialization
            // and includes optional label writes. Never split these calls here again.
            samplePatientService.saveEntry(form, request, result);

            try {
                if (sampleOrder.getPriority() != null && sampleOrder.getPriority().equals(OrderPriority.STAT)) {
                    List<String> systemUserIds = userRoleService.getUserIdsForRole(Constants.ROLE_RESULTS);
                    Sample statSample = sampleService.getSampleByAccessionNumber(sampleOrder.getLabNo());
                    List<Analysis> analyses = statSample != null ? sampleService.getAnalysis(statSample) : null;
                    String message = MessageUtil.getMessage("notification.order.stat",
                            AlphanumAccessionValidator.convertAlphaNumLabNumForDisplay(sampleOrder.getLabNo()));
                    StringBuffer sb = new StringBuffer(message);
                    for (String userId : systemUserIds) {
                        List<Analysis> userAnalyses = userService.filterAnalysesByLabUnitRoles(userId, analyses,
                                Constants.ROLE_RESULTS);
                        if (userAnalyses != null && !userAnalyses.isEmpty()) {
                            List<String> tests = userAnalyses.stream().map(a -> a.getTest().getLocalizedName())
                                    .collect(Collectors.toList());
                            String testString = String.join(", ", tests);
                            sb.append(testString);
                            try {
                                Notification notification = new Notification();
                                notification.setMessage(sb.toString());
                                notification.setUser(systemUserService.getUserById(userId));
                                notification.setCreatedDate(OffsetDateTime.now());
                                notification.setReadAt(null);
                                notificationDAO.save(notification);
                            } catch (Exception e) {
                            }
                        }
                    }
                }
            } catch (Exception notificationFailure) {
                // Best-effort notifications run after the save transaction returns.
                // They must not turn an already committed entry into a save failure.
                logger.warn("Entry committed; optional STAT notification could not be completed");
            }
        } catch (org.springframework.validation.BindException e) {
            saveErrors(result);
            if (hasDuplicatePatientError(result)) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(buildDuplicatePatientErrorBody(result));
            }
            return ResponseEntity.badRequest().body(buildErrorBody(result, "Validation failed"));
        } catch (LIMSRuntimeException e) {
            LogEvent.logError("persistData failed with LIMSRuntimeException", e);
            if (e.getCause() instanceof StaleObjectStateException) {
                result.reject("errors.OptimisticLockException", "errors.OptimisticLockException");
            } else {
                logger.error("Order save failed for labNo={}", sampleOrder.getLabNo(), e);
                result.reject("errors.UpdateException", "errors.UpdateException");
            }
            logger.error("SamplePatientEntry errors: {}", result.toString());
            persistErrorMessage = rootCauseMessage(e);
            persistFailed = true;
        } catch (Exception e) {
            logger.error("Unexpected error saving order for labNo={}", sampleOrder.getLabNo(), e);
            persistErrorMessage = rootCauseMessage(e);
            result.reject("errors.UpdateException", "errors.UpdateException");

            saveErrors(result);

            setupForm(form, request, "");
            request.setAttribute(ALLOW_EDITS_KEY, "false");
            persistFailed = true;
        }
        redirectAttributes.addFlashAttribute(FWD_SUCCESS, true);
        if (form.getRememberSiteAndRequester()) {
            redirectAttributes.addFlashAttribute("sampleOrderItems.providerId",
                    form.getSampleOrderItems().getProviderId());
            redirectAttributes.addFlashAttribute("sampleOrderItems.providerPersonId",
                    form.getSampleOrderItems().getProviderPersonId());
            redirectAttributes.addFlashAttribute("sampleOrderItems.providerEmail",
                    form.getSampleOrderItems().getProviderEmail());
            redirectAttributes.addFlashAttribute("sampleOrderItems.providerfax",
                    form.getSampleOrderItems().getProviderFax());
            redirectAttributes.addFlashAttribute("sampleOrderItems.providerFirstName",
                    form.getSampleOrderItems().getProviderFirstName());
            redirectAttributes.addFlashAttribute("sampleOrderItems.providerLastName",
                    form.getSampleOrderItems().getProviderLastName());
            redirectAttributes.addFlashAttribute("sampleOrderItems.providerWorkPhone",
                    form.getSampleOrderItems().getProviderWorkPhone());

            redirectAttributes.addFlashAttribute("sampleOrderItems.referringSiteId",
                    form.getSampleOrderItems().getReferringSiteId());
            redirectAttributes.addFlashAttribute("sampleOrderItems.referringSiteCode",
                    form.getSampleOrderItems().getReferringSiteCode());
            redirectAttributes.addFlashAttribute("sampleOrderItems.referringSiteName",
                    form.getSampleOrderItems().getReferringSiteName());

            redirectAttributes.addFlashAttribute("sampleOrderItems.referringSiteDepartmentId",
                    form.getSampleOrderItems().getReferringSiteDepartmentId());
            redirectAttributes.addFlashAttribute("sampleOrderItems.referringSiteDepartmentName",
                    form.getSampleOrderItems().getReferringSiteDepartmentName());
        }

        // OGC-584: return a non-2xx status if persistence threw an exception that
        // the catch blocks above swallowed (previously this method still returned
        // HTTP 200 in that case — the silent-200-no-persist bug).
        // Prefer the captured root-cause message (e.g. "Position Box A is
        // already occupied...") over the generic BindingResult fallback.
        if (persistFailed) {
            if (StringUtils.isNotBlank(persistErrorMessage)
                    && !persistErrorMessage.startsWith("Transaction silently rolled back")) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(Map.of("error", persistErrorMessage));
            }
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(buildErrorBody(result, "Failed to save order"));
        }

        // Belt-and-suspenders: verify the row actually made it to the DB. Guards
        // against obvious missing-row failures only. This ordinary read is not a
        // durable submission receipt and cannot prove rollback after a lost response.
        String labNoForVerify = sampleOrder != null ? sampleOrder.getLabNo() : null;
        Sample persistedSample = !GenericValidator.isBlankOrNull(labNoForVerify)
                ? sampleService.getSampleByAccessionNumber(labNoForVerify)
                : null;
        if (persistedSample == null || persistedSample.getId() == null) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Order save did not persist (verification check failed). See server logs."));
        }

        return ResponseEntity.ok(form);
    }

    private void setupForm(SamplePatientEntryForm form, HttpServletRequest request, String externalOrderNumber)
            throws LIMSRuntimeException, IllegalAccessException, InvocationTargetException, NoSuchMethodException {
        SampleOrderService sampleOrderService = new SampleOrderService();
        form.setSampleOrderItems(sampleOrderService.getSampleOrderItem());
        if (requestFhirUuid != null
                && requestFhirUuid.toUpperCase().startsWith(ResourceType.PRACTITIONER.toString().toUpperCase())) {
            Reference providerReference = new Reference(requestFhirUuid);
            Provider provider = providerService
                    .getProviderByFhirId(UUID.fromString(providerReference.getReferenceElement().getIdPart()));
            if (provider != null) {
                form.getSampleOrderItems().setProviderPersonId(provider.getPerson().getId());
            }
        }
        form.getSampleOrderItems().setExternalOrderNumber(externalOrderNumber);
        if (StringUtils.isNotBlank(externalOrderNumber)) {
            ElectronicOrder eOrder = electronicOrderService.getElectronicOrdersByExternalId(externalOrderNumber).get(0);
            if (eOrder != null) {
                form.getSampleOrderItems().setPriority(eOrder.getPriority());
                Task task = fhirUtil.getFhirParser().parseResource(Task.class, eOrder.getData());
                if (!task.getLocation().isEmpty()) {
                    Organization organization = organizationService
                            .getOrganizationByFhirId(task.getLocation().getReferenceElement().getIdPart());
                    if (organization != null) {
                        form.getSampleOrderItems().setReferringSiteName(organization.getOrganizationName());
                        form.getSampleOrderItems().setReferringSiteId(organization.getId());
                    }
                }
                if (!task.getOwner().isEmpty()) {
                    if (StringUtils.isBlank(form.getSampleOrderItems().getProviderPersonId())) {
                        Reference providerReference = task.getOwner();
                        Provider provider = providerService.getProviderByFhirId(
                                UUID.fromString(providerReference.getReferenceElement().getIdPart()));
                        if (provider != null) {
                            form.getSampleOrderItems().setProviderPersonId(provider.getPerson().getId());
                        }
                    }
                }
            }
        }
        form.setPatientProperties(new PatientManagementInfo());
        form.setPatientSearch(new PatientSearch());
        form.setSampleTypes(userService.getUserSampleTypes(getSysUserId(request), Constants.ROLE_RECEPTION));
        form.setTestSectionList(DisplayListService.getInstance().getList(ListType.TEST_SECTION_ACTIVE));
        form.setCurrentDate(DateUtil.getCurrentDateAsText());
        form.setRejectReasonList(DisplayListService.getInstance().getList(ListType.REJECTION_REASONS));

        setupReferralOption(form);
        // for (Object program : form.getSampleOrderItems().getProgramList()) {
        // LogEvent.logInfo(this.getClass().getSimpleName(), "method unkown",
        // ((IdValuePair)
        // program).getValue());
        // }

        addProjectList(form);
        addBillingLabel();

        if (FormFields.getInstance().useField(FormFields.Field.InitialSampleCondition)) {
            form.setInitialSampleConditionList(
                    DisplayListService.getInstance().getList(ListType.INITIAL_SAMPLE_CONDITION));
        }
        if (FormFields.getInstance().useField(FormFields.Field.SampleNature)) {
            form.setSampleNatureList(DisplayListService.getInstance().getList(ListType.SAMPLE_NATURE));
        }
    }

    @Override
    protected String findLocalForward(String forward) {
        if (FWD_SUCCESS.equals(forward)) {
            return "samplePatientEntryDefinition";
        } else if (FWD_FAIL.equals(forward)) {
            return "homePageDefinition";
        } else if (FWD_SUCCESS_INSERT.equals(forward)) {
            return "redirect:/SamplePatientEntry";
        } else if (FWD_FAIL_INSERT.equals(forward)) {
            return "samplePatientEntryDefinition";
        } else {
            return "PageNotFound";
        }
    }

    /**
     * Walk the exception cause chain to find the deepest non-blank message. When a
     * service throws inside a transactional event listener, Spring may wrap the
     * original LIMSRuntimeException in an UnexpectedRollbackException whose message
     * is the unhelpful "Transaction silently rolled back...". The actual message
     * ("Position Box A is already occupied...") sits on the root cause.
     */
    private static String rootCauseMessage(Throwable t) {
        Throwable cur = t;
        Throwable best = t;
        while (cur != null) {
            if (StringUtils.isNotBlank(cur.getMessage())) {
                best = cur;
            }
            if (cur.getCause() == null || cur.getCause() == cur) {
                break;
            }
            cur = cur.getCause();
        }
        return best != null ? best.getMessage() : null;
    }

    /**
     * Build a structured error response body from a failed BindingResult so the
     * frontend can surface a meaningful message. Returns a Map with a top-level
     * human-readable `error` plus the per-field list — kept separate from the form
     * (success path) to avoid mixing concerns.
     */
    private static Map<String, Object> buildErrorBody(BindingResult result, String fallbackMessage) {
        org.springframework.validation.FieldError firstFe = result.getFieldError();
        String message;
        if (firstFe != null) {
            message = firstFe.getField() + ": "
                    + (firstFe.getDefaultMessage() != null ? firstFe.getDefaultMessage() : "invalid value");
        } else if (!result.getAllErrors().isEmpty() && result.getAllErrors().get(0).getDefaultMessage() != null) {
            message = result.getAllErrors().get(0).getDefaultMessage();
        } else {
            message = fallbackMessage;
        }
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("error", message);
        body.put("fieldErrors", result.getFieldErrors().stream().map(fe -> {
            Map<String, String> entry = new java.util.HashMap<>();
            entry.put("field", fe.getField());
            entry.put("defaultMessage", fe.getDefaultMessage() != null ? fe.getDefaultMessage() : "");
            return entry;
        }).collect(Collectors.toList()));
        // OGC-743: include globalErrors so reject(...) calls aren't silently
        // dropped from the response. Existing consumers reading fieldErrors[]
        // are unaffected.
        body.put("globalErrors",
                result.getGlobalErrors().stream()
                        .map(oe -> oe.getDefaultMessage() != null ? oe.getDefaultMessage() : oe.getCode())
                        .collect(Collectors.toList()));
        return body;
    }

    private static boolean hasDuplicatePatientError(BindingResult result) {
        return result.getAllErrors().stream().anyMatch(error -> error.getCode() != null
                && error.getCode().startsWith("error.duplicate."));
    }

    private static Map<String, Object> buildDuplicatePatientErrorBody(BindingResult result) {
        Map<String, Object> body = buildErrorBody(result, "Patient identifier is already in use");
        String errorKey = result.getAllErrors().stream().map(error -> error.getCode())
                .filter(code -> code != null && code.startsWith("error.duplicate.")).findFirst()
                .orElse("error.duplicate.patient");
        body.put("code", "DUPLICATE_PATIENT");
        body.put("errorKey", errorKey);
        return body;
    }
}

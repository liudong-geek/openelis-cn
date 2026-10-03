package org.openelisglobal.sample.controller.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationTargetException;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.apache.commons.validator.GenericValidator;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.SampleOrderService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.patient.action.bean.PatientSearch;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.person.service.PersonService;
import org.openelisglobal.sample.action.util.SampleUtil;
import org.openelisglobal.sample.bean.SampleEditItem;
import org.openelisglobal.sample.controller.BaseSampleEntryController;
import org.openelisglobal.sample.form.SampleEditForm;
import org.openelisglobal.sample.form.SampleEditForm.SampleEdit;
import org.openelisglobal.sample.service.SampleEditAuthorizationService;
import org.openelisglobal.sample.service.SampleEditService;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.validator.SampleEditFormValidator;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.service.TestServiceImpl;
import org.openelisglobal.test.valueholder.Test;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.service.TypeOfSampleTestService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.typeofsample.valueholder.TypeOfSampleTest;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Controller;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
@RequestMapping(value = "/rest/")
public class SampleEditRestController extends BaseSampleEntryController {
    @Autowired
    SampleEditFormValidator formValidator;
    @Autowired
    private FhirTransformService fhirTransformService;

    @Autowired
    private SampleUtil sampleUtil;

    // private ObservationHistory paymentObservation = null;
    private static final SampleEditItemComparator testComparator = new SampleEditItemComparator();
    private static final Collection<String> ABLE_TO_CANCEL_ROLE_NAMES = new ArrayList<>();

    static {
        ABLE_TO_CANCEL_ROLE_NAMES.add("Validator");
        ABLE_TO_CANCEL_ROLE_NAMES.add("Validation");
        ABLE_TO_CANCEL_ROLE_NAMES.add("Biologist");
    }

    @Autowired
    private SampleItemService sampleItemService;
    @Autowired
    private SampleService sampleService;
    @Autowired
    private TestService testService;
    // @Autowired
    // private OrganizationOrganizationTypeService orgOrgTypeService;
    @Autowired
    private TypeOfSampleService typeOfSampleService;
    @Autowired
    private AnalysisService analysisService;
    @Autowired
    private TypeOfSampleTestService typeOfSampleTestService;
    @Autowired
    private SampleHumanService sampleHumanService;
    @Autowired
    private UserRoleService userRoleService;
    @Autowired
    private SampleEditService sampleEditService;
    @Autowired
    private SampleEditAuthorizationService authorization;
    @Autowired
    private UserService userService;

    @GetMapping(value = "SampleEdit", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public SampleEditForm showSampleEdit(HttpServletRequest request,
            @RequestParam(required = false) String accessionNumber, @RequestParam(required = false) String patientId)
            throws InvocationTargetException, NoSuchMethodException, IllegalAccessException {

        authorization.requireRead(request, getSysUserId(request));
        SampleEditForm form = new SampleEditForm();
        form.setFormAction("SampleEdit");

        request.getSession().setAttribute(SAVE_DISABLED, TRUE);

        boolean allowedToCancelResults = userModuleService.isUserAdmin(request)
                || userRoleService.userInRole(getSysUserId(request), ABLE_TO_CANCEL_ROLE_NAMES);
        boolean isEditable = !"readonly".equals(request.getParameter("type"))
                && authorization.canWrite(request, getSysUserId(request));
        form.setIsEditable(isEditable);

        if (GenericValidator.isBlankOrNull(accessionNumber) && !GenericValidator.isBlankOrNull(patientId)) {
            accessionNumber = getMostRecentAccessionNumberForPaitient(patientId);
        }
        if (!GenericValidator.isBlankOrNull(accessionNumber)) {
            form.setAccessionNumber(accessionNumber);
            form.setSearchFinished(Boolean.TRUE);

            Sample sample = getSample(accessionNumber);

            if (sample != null && !GenericValidator.isBlankOrNull(sample.getId())) {

                List<SampleItem> sampleItemList = getSampleItems(sample);
                setPatientInfo(form, sample);
                List<SampleEditItem> currentTestList = getCurrentTestInfo(sampleItemList, accessionNumber,
                        allowedToCancelResults);
                form.setExistingTests(currentTestList);
                setAddableTestInfo(form, sampleItemList, accessionNumber);
                setAddableSampleTypes(form, request);
                setSampleOrderInfo(form, sample);
                form.setAbleToCancelResults(hasResults(currentTestList, allowedToCancelResults));
                form.setMaxAccessionNumber(getMaxAccessionNumber(sampleItemList, accessionNumber));
                form.setIsConfirmationSample(sampleService.isConfirmationSample(sample));
            } else {
                form.setNoSampleFound(Boolean.TRUE);
            }
        } else {
            form.setSearchFinished(Boolean.FALSE);
            if ("readwrite".equals(request.getParameter("type"))) {
                request.getSession().setAttribute(SAMPLE_EDIT_WRITABLE, "readwrite");
            }
        }

        if (FormFields.getInstance().useField(FormFields.Field.InitialSampleCondition)) {
            form.setInitialSampleConditionList(
                    DisplayListService.getInstance().getList(ListType.INITIAL_SAMPLE_CONDITION));
        }
        if (FormFields.getInstance().useField(FormFields.Field.SampleNature)) {
            form.setSampleNatureList(DisplayListService.getInstance().getList(ListType.SAMPLE_NATURE));
        }
        // form.setRejectReasonList(DisplayListService.getInstance().getList(ListType.REJECTION_REASONS));
        form.setCurrentDate(DateUtil.getCurrentDateAsText());
        PatientSearch patientSearch = new PatientSearch();
        patientSearch.setLoadFromServerWithPatient(true);
        patientSearch.setSelectedPatientActionButtonText(MessageUtil.getMessage("label.patient.search.select"));
        // form.setPatientSearch(patientSearch);
        form.setWarning(true);

        addFlashMsgsToRequest(request);
        return form;
    }

    @GetMapping(value = "patientByLabNumer", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<Patient> getPatientByLabNumber(HttpServletRequest request,
            @RequestParam(required = false) String accessionNumber) {
        authorization.requireRead(request, getSysUserId(request));
        if (GenericValidator.isBlankOrNull(accessionNumber)) {
            return ResponseEntity.badRequest().build();
        }

        Sample sample = getSample(accessionNumber);
        if (sample == null) {
            return ResponseEntity.notFound().build();
        }

        Patient patient = sampleHumanService.getPatientForSample(sample);
        if (patient == null) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(patient);
    }

    @PostMapping(value = "SampleEdit", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<?> saveSampleEdit(HttpServletRequest request,
            @Validated(SampleEdit.class) @RequestBody SampleEditForm form, BindingResult result)
            throws InvocationTargetException, NoSuchMethodException, IllegalAccessException {
        try {
            authorization.requireWrite(request, getSysUserId(request));
        } catch (AccessDeniedException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
        }
        if (result.hasErrors()) {
            return invalidSampleEdit(result);
        }
        // Old clients send an empty XML string when only the order information changes.
        if (GenericValidator.isBlankOrNull(form.getSampleXML())) {
            form.setSampleXML("<samples/>");
        }
        formValidator.validate(form, result);
        if (result.hasErrors()) {
            return invalidSampleEdit(result);
        }
        boolean sampleChanged = sampleUtil.accessionNumberChanged(form);
        if (sampleChanged) {
            sampleUtil.validateNewAccessionNumber(form.getNewAccessionNumber(), result);
            if (result.hasErrors()) {
                return invalidSampleEdit(result);
            }
        }

        try {
            // Loading and changing the accession number belongs to the service transaction,
            // after the current sample and analysis permissions have been checked.
            sampleEditService.editSample(form, request, null, sampleChanged, getSysUserId(request));
        } catch (AccessDeniedException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
        } catch (LIMSRuntimeException e) {
            // Surface the actual reason (e.g. "Position B12 is already occupied") instead
            // of letting it fall through to the global advice's "Check server logs".
            LogEvent.logDebug(e);
            String message = e.getMessage() != null && !e.getMessage().isBlank() ? e.getMessage()
                    : "Failed to save sample edit";
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(java.util.Map.of("message", message));
        }

        try {
            fhirTransformService.transformAnalysisByIds(sampleEditService.getUpdatedAnalysisList());
        } catch (Exception e) {
            LogEvent.logError(e);
        }
        return ResponseEntity.ok().build();
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<?> permissionDenied(AccessDeniedException exception) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", exception.getMessage()));
    }

    private ResponseEntity<?> invalidSampleEdit(BindingResult result) {
        List<Map<String, String>> errors = new ArrayList<>();
        for (ObjectError error : result.getAllErrors()) {
            String code = error.getCode() == null ? "error.field.format.invalid" : error.getCode();
            String message = MessageUtil.getMessageOrDefault(code, error.getArguments(),
                    error.getDefaultMessage() == null ? code : error.getDefaultMessage());
            String field = error instanceof FieldError ? ((FieldError) error).getField() : "";
            errors.add(Map.of("field", field, "code", code, "message", message));
        }
        return ResponseEntity.badRequest().body(Map.of("message", errors.get(0).get("message"), "errors", errors));
    }

    @Override
    protected String findLocalForward(String forward) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'findLocalForward'");
    }

    private Boolean hasResults(List<SampleEditItem> currentTestList, boolean allowedToCancelResults) {
        if (!allowedToCancelResults) {
            return false;
        }

        for (SampleEditItem editItem : currentTestList) {
            if (editItem.isHasResults()) {
                return true;
            }
        }

        return false;
    }

    private void setSampleOrderInfo(SampleEditForm form, Sample sample)
            throws InvocationTargetException, NoSuchMethodException, IllegalAccessException {
        SampleOrderService sampleOrderService = new SampleOrderService(sample);
        form.setSampleOrderItems(sampleOrderService.getSampleOrderItem());
    }

    private String getMostRecentAccessionNumberForPaitient(String patientID) {
        String accessionNumber = null;
        if (!GenericValidator.isBlankOrNull(patientID)) {
            List<Sample> samples = sampleService.getSamplesForPatient(patientID);

            int maxId = 0;
            for (Sample sample : samples) {
                if (Integer.parseInt(sample.getId()) > maxId) {
                    maxId = Integer.parseInt(sample.getId());
                    accessionNumber = sample.getAccessionNumber();
                }
            }
        }
        return accessionNumber;
    }

    private Sample getSample(String accessionNumber) {
        return sampleService.getSampleByAccessionNumber(accessionNumber);
    }

    private List<SampleItem> getSampleItems(Sample sample) {
        // Read every persisted tube so its current analyses remain visible, even when
        // the tube's state no longer permits editing.
        List<SampleItem> sampleItems = new ArrayList<>(sampleItemService.getSampleItemsBySampleId(sample.getId()));
        sampleItems.sort(Comparator.comparing(item -> new BigInteger(item.getSortOrder())));
        return sampleItems;
    }

    private String getMaxAccessionNumber(List<SampleItem> sampleItems, String accessionNumber) {
        BigInteger maxSortOrder = sampleItems.stream().map(item -> new BigInteger(item.getSortOrder()))
                .max(Comparator.naturalOrder()).orElse(BigInteger.ZERO);
        return accessionNumber + "-" + maxSortOrder;
    }

    private void setPatientInfo(SampleEditForm form, Sample sample)
            throws InvocationTargetException, NoSuchMethodException, IllegalAccessException {

        Patient patient = sampleHumanService.getPatientForSample(sample);
        PatientService patientPatientService = SpringContext.getBean(PatientService.class);
        PersonService personService = SpringContext.getBean(PersonService.class);
        personService.getData(patient.getPerson());

        form.setPatientName(patientPatientService.getLastFirstName(patient));
        form.setDob(patientPatientService.getEnteredDOB(patient));
        form.setGender(patientPatientService.getGender(patient));
        form.setNationalId(patientPatientService.getNationalId(patient));
        form.setPatientId(patientPatientService.getPatientId(patient));
        form.setSubjectNumber(patientPatientService.getSubjectNumber(patient));
    }

    private List<SampleEditItem> getCurrentTestInfo(List<SampleItem> sampleItemList, String accessionNumber,
            boolean allowedToCancelAll) {
        List<SampleEditItem> currentTestList = new ArrayList<>();

        for (SampleItem sampleItem : sampleItemList) {
            addCurrentTestsToList(sampleItem, currentTestList, accessionNumber, allowedToCancelAll);
        }

        return currentTestList;
    }

    private void addCurrentTestsToList(SampleItem sampleItem, List<SampleEditItem> currentTestList,
            String accessionNumber, boolean allowedToCancelAll) {

        TypeOfSample typeOfSample = typeOfSampleService.get(sampleItem.getTypeOfSampleId());

        IStatusService statuses = SpringContext.getBean(IStatusService.class);
        List<Analysis> analysisList = analysisService.getAnalysesBySampleItemsExcludingByStatusIds(sampleItem,
                Set.of(statuses.getStatusID(AnalysisStatus.Canceled)));

        List<SampleEditItem> analysisSampleItemList = new ArrayList<>();

        String collectionDate = DateUtil.convertTimestampToStringDate(sampleItem.getCollectionDate());
        String collectionTime = DateUtil.convertTimestampToStringTime(sampleItem.getCollectionDate());
        boolean tubeEntered = statuses.matches(sampleItem.getStatusId(), SampleStatus.Entered);
        boolean canRemove = tubeEntered;
        for (Analysis analysis : analysisList) {
            SampleEditItem sampleEditItem = new SampleEditItem();

            sampleEditItem.setTestId(analysis.getTest().getId());
            sampleEditItem.setTestName(TestServiceImpl.getUserLocalizedTestName(analysis.getTest()));
            sampleEditItem.setSampleItemId(sampleItem.getId());

            boolean canCancel = tubeEntered
                    && (allowedToCancelAll || (!statuses.matches(analysis.getStatusId(), AnalysisStatus.Canceled)
                            && statuses.matches(analysis.getStatusId(), AnalysisStatus.NotStarted)));

            if (!canCancel) {
                canRemove = false;
            }
            sampleEditItem.setCanCancel(canCancel);
            sampleEditItem.setAnalysisId(analysis.getId());
            sampleEditItem
                    .setStatus(SpringContext.getBean(IStatusService.class).getStatusNameFromId(analysis.getStatusId()));
            sampleEditItem.setSortOrder(analysis.getTest().getSortOrder());
            sampleEditItem.setHasResults(!SpringContext.getBean(IStatusService.class).matches(analysis.getStatusId(),
                    AnalysisStatus.NotStarted));

            analysisSampleItemList.add(sampleEditItem);
        }

        if (!analysisSampleItemList.isEmpty()) {
            Collections.sort(analysisSampleItemList, testComparator);
            SampleEditItem firstItem = analysisSampleItemList.get(0);

            firstItem.setAccessionNumber(accessionNumber + "-" + sampleItem.getSortOrder());
            firstItem.setSampleType(typeOfSample.getLocalizedName());
            firstItem.setCanRemoveSample(canRemove);
            firstItem.setCollectionDate(collectionDate == null ? "" : collectionDate);
            firstItem.setCollectionTime(collectionTime);
            currentTestList.addAll(analysisSampleItemList);
        }
    }

    private void setAddableTestInfo(SampleEditForm form, List<SampleItem> sampleItemList, String accessionNumber)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {
        List<SampleEditItem> possibleTestList = new ArrayList<>();

        for (SampleItem sampleItem : sampleItemList) {
            addPossibleTestsToList(sampleItem, possibleTestList, accessionNumber);
        }

        form.setPossibleTests(possibleTestList);
        // form.setTestSectionList(DisplayListService.getInstance().getList(ListType.TEST_SECTION_ACTIVE));
    }

    private void setAddableSampleTypes(SampleEditForm form, HttpServletRequest request)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {
        form.setSampleTypes(userService.getUserSampleTypes(getSysUserId(request), Constants.ROLE_RECEPTION));
    }

    private void addPossibleTestsToList(SampleItem sampleItem, List<SampleEditItem> possibleTestList,
            String accessionNumber) {
        if (!SpringContext.getBean(IStatusService.class).matches(sampleItem.getStatusId(), SampleStatus.Entered)) {
            return;
        }

        TypeOfSample typeOfSample = typeOfSampleService.get(sampleItem.getTypeOfSampleId());

        List<TypeOfSampleTest> typeOfSampleTestList = typeOfSampleTestService
                .getTypeOfSampleTestsForSampleType(typeOfSample.getId());
        List<SampleEditItem> typeOfTestSampleItemList = new ArrayList<>();

        for (TypeOfSampleTest typeOfSampleTest : typeOfSampleTestList) {
            SampleEditItem sampleEditItem = new SampleEditItem();

            sampleEditItem.setTestId(typeOfSampleTest.getTestId());
            Test test = testService.get(typeOfSampleTest.getTestId());
            if ("Y".equals(test.getIsActive()) && test.getOrderable()) {
                sampleEditItem.setTestName(TestServiceImpl.getUserLocalizedTestName(test));
                sampleEditItem.setSampleItemId(sampleItem.getId());
                sampleEditItem.setSortOrder(test.getSortOrder());
                typeOfTestSampleItemList.add(sampleEditItem);
            }
        }

        if (!typeOfTestSampleItemList.isEmpty()) {
            Collections.sort(typeOfTestSampleItemList, testComparator);

            typeOfTestSampleItemList.get(0).setAccessionNumber(accessionNumber + "-" + sampleItem.getSortOrder());
            typeOfTestSampleItemList.get(0).setSampleType(typeOfSample.getLocalizedName());

            possibleTestList.addAll(typeOfTestSampleItemList);
        }
    }

    private static class SampleEditItemComparator implements Comparator<SampleEditItem> {

        @Override
        public int compare(SampleEditItem o1, SampleEditItem o2) {
            if (GenericValidator.isBlankOrNull(o1.getSortOrder())
                    || GenericValidator.isBlankOrNull(o2.getSortOrder())) {
                return o1.getTestName().compareTo(o2.getTestName());
            }

            try {
                return Integer.parseInt(o1.getSortOrder()) - Integer.parseInt(o2.getSortOrder());
            } catch (NumberFormatException e) {
                return o1.getTestName().compareTo(o2.getTestName());
            }
        }
    }
}

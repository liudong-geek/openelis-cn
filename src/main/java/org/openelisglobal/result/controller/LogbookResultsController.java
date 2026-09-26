package org.openelisglobal.result.controller;

import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationTargetException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.apache.commons.validator.GenericValidator;
import org.hibernate.StaleObjectStateException;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.formfields.FormFields.Field;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.provider.validation.AlphanumAccessionValidator;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.common.services.registration.ResultUpdateRegister;
import org.openelisglobal.common.services.registration.interfaces.IResultUpdate;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.dataexchange.fhir.exception.FhirPersistanceException;
import org.openelisglobal.dataexchange.fhir.exception.FhirTransformationException;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.method.service.MethodService;
import org.openelisglobal.note.valueholder.Note;
import org.openelisglobal.notifications.dao.NotificationDAO;
import org.openelisglobal.notifications.entity.Notification;
import org.openelisglobal.result.action.util.ResultUtil;
import org.openelisglobal.result.action.util.ResultsLoadUtility;
import org.openelisglobal.result.action.util.ResultsPaging;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.result.form.LogbookResultsForm;
import org.openelisglobal.result.form.LogbookResultsForm.LogbookResults;
import org.openelisglobal.result.service.LegacyResultEntryWriteService;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.statusofsample.util.StatusRules;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.validation.BindingResult;
import org.springframework.validation.Errors;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class LogbookResultsController extends LogbookResultsBaseController {

    private final String[] ALLOWED_FIELDS = new String[] { "accessionNumber", "collectionDate", "recievedDate",
            "selectedTest", "selectedAnalysisStatus", "selectedSampleStatus", "testSectionId", "methodId", "type",
            "currentPageID", "testResult*.accessionNumber", "testResult*.isModified", "testResult*.analysisId",
            "testResult*.resultId", "testResult*.testId", "testResult*.technicianSignatureId", "testResult*.testKitId",
            "testResult*.resultLimitId", "testResult*.resultType", "testResult*.valid", "testResult*.referralId",
            "testResult*.referralCanceled", "testResult*.considerRejectReason", "testResult*.hasQualifiedResult",
            "testResult*.shadowResultValue", "testResult*.reflexJSONResult", "testResult*.testDate",
            "testResult*.analysisMethod", "testResult*.testMethod", "testResult*.testKitInventoryId",
            "testResult*.forceTechApproval", "testResult*.forceTechApprovalNote", "testResult*.lowerNormalRange",
            "testResult*.upperNormalRange", "testResult*.lowerCritical", "testResult*.higherCritical",
            "testResult*.significantDigits", "testResult*.resultValue", "testResult*.qualifiedResultValue",
            "testResult*.multiSelectResultValues", "testResult*.testMethod", "testResult*.multiSelectResultValues",
            "testResult*.qualifiedResultValue", "testResult*.qualifiedResultValue", "testResult*.shadowReferredOut",
            "testResult*.referredOut", "testResult*.referralReasonId", "testResult*.technician",
            "testResult*.shadowRejected", "testResult*.rejected", "testResult*.rejectReasonId", "testResult*.note",
            "paging.currentPage", //
            "testResult*.refer", "testResult*.referralItem.referralReasonId",
            "testResult*.referralItem.referredInstituteId", "testResult*.referralItem.referredTestId",
            "testResult*.referralItem.referredSendDate" };

    @Autowired
    private TestSectionService testSectionService;
    @Autowired
    private LegacyResultEntryWriteService legacyResultEntryWriteService;
    @Autowired
    private AnalysisService analysisService;
    @Autowired
    private FhirTransformService fhirTransformService;
    @Autowired
    private UserService userService;
    @Autowired
    private RoleService roleService;
    @Autowired
    private MethodService methodService;
    @Autowired
    private NotificationDAO notificationDAO;
    @Autowired
    private SystemUserService systemUserService;
    @Autowired
    private UserRoleService userRoleService;

    private final String RESULT_SUBJECT = "Result Note";
    private static final String REFLEX_ACCESSIONS = "reflex_accessions";

    public LogbookResultsController() {
    }

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.setAllowedFields(ALLOWED_FIELDS);
    }

    @RequestMapping(value = "/LogbookResults", method = RequestMethod.GET)
    public ModelAndView showLogbookResults(HttpServletRequest request,
            @Validated(LogbookResults.class) @ModelAttribute("form") LogbookResultsForm form, BindingResult result)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {
        LogbookResultsForm newForm = new LogbookResultsForm();
        if (!(result.hasFieldErrors("type") || result.hasFieldErrors("testSectionId")
                || result.hasFieldErrors("methodId") || result.hasFieldErrors("accessionNumber"))) {
            newForm.setType(form.getType());
            newForm.setTestSectionId(form.getTestSectionId());

            String currentDate = getCurrentDate();
            newForm.setCurrentDate(currentDate);
            newForm.setReferralReasons(
                    DisplayListService.getInstance().getList(DisplayListService.ListType.REFERRAL_REASONS));
            newForm.setRejectReasons(DisplayListService.getInstance()
                    .getNumberedListWithLeadingBlank(DisplayListService.ListType.REJECTION_REASONS));

            // load testSections for drop down
            String resultsRoleId = roleService.getRoleByName(Constants.ROLE_RESULTS).getId();
            List<IdValuePair> testSections = userService.getUserTestSections(getSysUserId(request), resultsRoleId);
            newForm.setTestSections(testSections);
            newForm.setTestSectionsByName(DisplayListService.getInstance().getList(ListType.TEST_SECTION_BY_NAME));
            newForm.setMethods(DisplayListService.getInstance().getList(ListType.METHODS));
        }
        newForm.setDisplayTestSections(true);
        newForm.setSearchByRange(false);

        return getLogbookResults(request, newForm);
    }

    @RequestMapping(value = "/RangeResults", method = RequestMethod.GET)
    public ModelAndView showLogbookResultsByRange(HttpServletRequest request,
            @Validated(LogbookResults.class) @ModelAttribute("form") LogbookResultsForm form, BindingResult result)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {
        LogbookResultsForm newForm = new LogbookResultsForm();
        if (!(result.hasFieldErrors("type") || result.hasFieldErrors("accessionNumber"))) {
            newForm.setType(form.getType());
            newForm.setAccessionNumber(form.getAccessionNumber());

            String currentDate = getCurrentDate();
            newForm.setCurrentDate(currentDate);
            newForm.setReferralReasons(
                    DisplayListService.getInstance().getList(DisplayListService.ListType.REFERRAL_REASONS));
            newForm.setRejectReasons(DisplayListService.getInstance()
                    .getNumberedListWithLeadingBlank(DisplayListService.ListType.REJECTION_REASONS));
            newForm.setMethods(DisplayListService.getInstance().getList(ListType.METHODS));

            // load testSections for drop down
        }
        newForm.setDisplayTestSections(false);
        newForm.setSearchByRange(true);
        return getLogbookResults(request, newForm);
    }

    private ModelAndView getLogbookResults(HttpServletRequest request, LogbookResultsForm form)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {

        // boolean useTechnicianName = ConfigurationProperties.getInstance()
        // .isPropertyValueEqual(Property.resultTechnicianName, "true");
        // boolean alwaysValidate = ConfigurationProperties.getInstance()
        // .isPropertyValueEqual(Property.ALWAYS_VALIDATE_RESULTS, "true");
        // boolean supportReferrals =
        // FormFields.getInstance().useField(Field.ResultsReferral);
        // String statusRuleSet =
        // ConfigurationProperties.getInstance().getPropertyValueUpperCase(Property.StatusRules);

        request.getSession().setAttribute(SAVE_DISABLED, TRUE);

        List<TestResultItem> tests;
        List<TestResultItem> filteredTests = new ArrayList<>();

        ResultsPaging paging = new ResultsPaging();
        // TODO: Re-enable after new inventory frontend integration
        // List<InventoryKitItem> inventoryList = new ArrayList<>();
        ResultsLoadUtility resultsLoadUtility = SpringContext.getBean(ResultsLoadUtility.class);
        resultsLoadUtility.setSysUser(getSysUserId(request));

        String requestedPage = request.getParameter("page");

        if (GenericValidator.isBlankOrNull(requestedPage)) {
            requestedPage = "1";
            new StatusRules().setAllowableStatusForLoadingResults(resultsLoadUtility);

            if (!GenericValidator.isBlankOrNull(form.getTestSectionId())) {
                tests = resultsLoadUtility.getUnfinishedTestResultItemsInTestSection(form.getTestSectionId());
                filteredTests = userService.filterResultsByLabUnitRoles(getSysUserId(request), tests,
                        Constants.ROLE_RESULTS);
                int count = resultsLoadUtility.getTotalCountAnalysisByTestSectionAndStatus(form.getTestSectionId());
                request.setAttribute("analysisCount", count);
                request.setAttribute("pageSize", filteredTests.size());

                TestSection ts = null;
                if (!GenericValidator.isBlankOrNull(form.getTestSectionId())) {
                    ts = testSectionService.get(form.getTestSectionId());
                }
                setRequestType(ts == null ? MessageUtil.getMessage("workplan.unit.types") : ts.getLocalizedName());

                if (ts != null) {
                    // this does not look right what happens after a new page!!!
                    boolean isHaitiClinical = ConfigurationProperties.getInstance()
                            .isPropertyValueEqual(Property.configurationName, "Haiti Clinical");
                    if (resultsLoadUtility.inventoryNeeded()
                            || (isHaitiClinical && ("VCT").equals(ts.getTestSectionName()))) {
                        // TODO: Re-enable after new inventory frontend integration
                        // InventoryUtility inventoryUtility =
                        // SpringContext.getBean(InventoryUtility.class);
                        // inventoryList = inventoryUtility.getExistingActiveInventory();

                        form.setDisplayTestKit(true);
                    }
                }
                form.setSearchFinished(true);
            } else if (!GenericValidator.isBlankOrNull(form.getAccessionNumber())) {
                tests = resultsLoadUtility.getUnfinishedTestResultItemsByAccession(form.getAccessionNumber());
                filteredTests = userService.filterResultsByLabUnitRoles(getSysUserId(request), tests,
                        Constants.ROLE_RESULTS);
                int count = resultsLoadUtility.getTotalCountAnalysisByAccessionAndStatus(form.getAccessionNumber());
                request.setAttribute("analysisCount", count);
                request.setAttribute("pageSize", filteredTests.size());
                form.setSearchFinished(true);
            } else {
                tests = new ArrayList<>();
            }

            if (ConfigurationProperties.getInstance().isPropertyValueEqual(Property.PATIENT_DATA_ON_RESULTS_BY_ROLE,
                    "true") && !userHasPermissionForModule(request, "PatientResults")) {
                for (TestResultItem resultItem : filteredTests) {
                    resultItem.setPatientInfo("---");
                }
            }

            paging.setDatabaseResults(request, form, filteredTests);

        } else {
            int requestedPageNumber = Integer.parseInt(requestedPage);
            paging.page(request, form, requestedPageNumber);
        }
        form.setDisplayTestKit(false);
        // TODO: Re-enable after new inventory frontend integration
        // List<String> hivKits = new ArrayList<>();
        // List<String> syphilisKits = new ArrayList<>();
        // for (InventoryKitItem item : inventoryList) {
        // if (item.getType().equals("HIV")) {
        // hivKits.add(item.getInventoryLocationId());
        // } else {
        // syphilisKits.add(item.getInventoryLocationId());
        // }
        // }
        // form.setHivKits(hivKits);
        // form.setSyphilisKits(syphilisKits);

        // Temporary fix: Set empty lists
        form.setHivKits(new ArrayList<String>());
        form.setSyphilisKits(new ArrayList<String>());
        // TODO: Re-enable after new inventory frontend integration
        // form.setInventoryItems(inventoryList);
        form.setReferralOrganizations(DisplayListService.getInstance().getList(ListType.REFERRAL_ORGANIZATIONS));

        addFlashMsgsToRequest(request);

        return findForward(FWD_SUCCESS, form);
    }

    private String getCurrentDate() {
        Date today = Calendar.getInstance().getTime();
        return DateUtil.formatDateAsText(today);
    }

    @RequestMapping(value = { "/LogbookResults", "/PatientResults", "/AccessionResults",
            "/StatusResults" }, method = RequestMethod.POST)
    @PreAuthorize("hasRole('RESULTS')")
    public ModelAndView showLogbookResultsUpdate(HttpServletRequest request,
            @ModelAttribute("form") @Validated(LogbookResultsForm.LogbookResults.class) LogbookResultsForm form,
            BindingResult result, RedirectAttributes redirectAttributes)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {
        boolean useTechnicianName = ConfigurationProperties.getInstance()
                .isPropertyValueEqual(Property.resultTechnicianName, "true");
        boolean alwaysValidate = ConfigurationProperties.getInstance()
                .isPropertyValueEqual(Property.ALWAYS_VALIDATE_RESULTS, "true");
        boolean supportReferrals = FormFields.getInstance().useField(Field.ResultsReferral);
        String statusRuleSet = ConfigurationProperties.getInstance().getPropertyValueUpperCase(Property.StatusRules);

        if (form.getTestResult() != null) {
            for (TestResultItem item : form.getTestResult()) {
                if ("M".equals(item.getResultType()) || "C".equals(item.getResultType())) {

                    String raw = item.getMultiSelectResultValues();

                    if (raw != null && !raw.isEmpty()) {

                        String json = extractMultiSelectJson(raw);

                        if (json != null) {
                            item.setMultiSelectResultValues(json);
                        }
                    }
                }
            }
        }

        String resultsRoleId = roleService.getRoleByName(Constants.ROLE_RESULTS).getId();
        List<IdValuePair> testSections = userService.getUserTestSections(getSysUserId(request), resultsRoleId);
        form.setTestSections(testSections);
        form.setTestSectionsByName(DisplayListService.getInstance().getList(ListType.TEST_SECTION_BY_NAME));
        form.setMethods(DisplayListService.getInstance().getList(ListType.METHODS));
        form.setSearchFinished(true);

        if ("true".equals(request.getParameter("pageResults"))) {
            return getLogbookResults(request, form);
        }

        if (result.hasErrors()) {
            saveErrors(result);
            return findForward(FWD_FAIL_INSERT, form);
        }

        // gnr: shows current session records, can be current, stale/empty vs. other
        // user
        // ie: empty when another user saved and hasn't reloaded.

        Object cachedPages = request.getSession().getAttribute(IActionConstants.RESULTS_SESSION_CACHE);
        if (!isUsableResultsSessionCache(cachedPages)) {
            LogEvent.logDebug(this.getClass().getSimpleName(), "LogbookResults()", "Attempted save of stale page.");

            List<TestResultItem> resultList = form.getTestResult();
            if (resultList != null) {
                for (TestResultItem item : resultList) {
                    if (item != null) {
                        item.setFailedValidation(true);
                        item.setNote("Result has been saved by another user.");
                    }
                }
            }

            result.reject("error.results.staleSave", "error.results.staleSave");
            saveErrors(result);
            return findForward(FWD_VALIDATION_ERROR, form);
        }

        List<IResultUpdate> updaters = ResultUpdateRegister.getRegisteredUpdaters();

        ResultsPaging paging = new ResultsPaging();
        List<TestResultItem> tests;
        try {
            paging.updatePagedResults(request, form);
            tests = paging.getResults(request);
        } catch (ResultSaveValidationException e) {
            result.reject(e.getErrorCode(), e.getErrorCode());
            saveErrors(result);
            return findForward(FWD_VALIDATION_ERROR, form);
        }

        ResultsUpdateDataSet actionDataSet = new ResultsUpdateDataSet(getSysUserId(request));
        actionDataSet.filterModifiedItems(tests);

        Errors errors = actionDataSet.validateModifiedItems();

        if (errors.hasErrors()) {
            saveErrors(errors);
            return findForward(FWD_VALIDATION_ERROR, form);
        }

        createResultsFromItems(actionDataSet, supportReferrals, alwaysValidate, useTechnicianName, statusRuleSet);
        createAnalysisOnlyUpdates(actionDataSet);

        try {
            List<Analysis> reflexAnalysises = legacyResultEntryWriteService.persist(request, actionDataSet, updaters);
            redirectAttributes.addFlashAttribute(REFLEX_ACCESSIONS, reflexAnalysises.stream()
                    .map(e -> analysisService.getOrderAccessionNumber(e)).collect(Collectors.toList()));
            try {
                fhirTransformService.transformPersistResultsEntryFhirObjects(actionDataSet);
            } catch (FhirTransformationException | FhirPersistanceException e) {
                LogEvent.logError(e);
            }
            List<Analysis> newResultAnalyses = actionDataSet.getNewResults().stream().map(a -> a.result.getAnalysis())
                    .collect(Collectors.toList());
            List<String> systemUserIds = userRoleService.getUserIdsForRole(Constants.ROLE_VALIDATION);
            String message = MessageUtil.getMessage("notification.result.stat");
            StringBuffer sb = new StringBuffer(message);
            for (String userId : systemUserIds) {
                List<Analysis> userAnalyses = userService
                        .filterAnalysesByLabUnitRoles(userId, newResultAnalyses, Constants.ROLE_VALIDATION).stream()
                        .filter(a -> a.getSampleItem().getSample().getPriority().equals(OrderPriority.STAT))
                        .collect(Collectors.toList());

                if (userAnalyses != null && !userAnalyses.isEmpty()) {
                    List<String> userTests = userAnalyses.stream()
                            .map(a -> AlphanumAccessionValidator
                                    .convertAlphaNumLabNumForDisplay(a.getSampleItem().getSample().getAccessionNumber())
                                    + " - " + a.getTest().getLocalizedName())
                            .collect(Collectors.toList());
                    String testString = String.join(", ", userTests);
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
        } catch (ResultSaveValidationException e) {
            errors.reject(e.getErrorCode(), e.getErrorCode());
            saveErrors(errors);
            return findForward(FWD_VALIDATION_ERROR, form);
        } catch (ConcurrencyFailureException e) {
            errors.reject("error.results.staleSave", "error.results.staleSave");
            saveErrors(errors);
            return findForward(FWD_VALIDATION_ERROR, form);
        } catch (LIMSRuntimeException e) {
            String errorMsg;
            if (e.getCause() instanceof StaleObjectStateException) {
                errorMsg = "errors.OptimisticLockException";
            } else {
                LogEvent.logError(e);
                errorMsg = "errors.UpdateException";
            }

            errors.reject(errorMsg, errorMsg);
            saveErrors(errors);
            return findForward(FWD_FAIL_INSERT, form);
        }

        for (IResultUpdate updater : updaters) {
            try {
                updater.postTransactionalCommitUpdate(actionDataSet);
            } catch (Exception e) {
                LogEvent.logError(this.getClass().getSimpleName(), "showLogbookResultsUpdate",
                        "error doing a post transactional commit");
                LogEvent.logError(e);
            }
        }

        redirectAttributes.addFlashAttribute(FWD_SUCCESS, true);
        if (GenericValidator.isBlankOrNull(form.getType())) {
            return findForward(FWD_SUCCESS_INSERT, form);
        } else {
            Map<String, String> params = new HashMap<>();
            params.put("type", form.getType());
            return getForwardWithParameters(findForward(FWD_SUCCESS_INSERT, form), params);
        }
    }

    static boolean isUsableResultsSessionCache(Object cachedPages) {
        if (!(cachedPages instanceof List<?> pages) || pages.isEmpty()) {
            return false;
        }
        boolean containsResult = false;
        for (Object page : pages) {
            if (!(page instanceof List<?> rows)) {
                return false;
            }
            for (Object row : rows) {
                if (!(row instanceof TestResultItem)) {
                    return false;
                }
                containsResult = true;
            }
        }
        return containsResult;
    }

    private void createAnalysisOnlyUpdates(ResultsUpdateDataSet actionDataSet) {
        for (TestResultItem testResultItem : actionDataSet.getAnalysisOnlyChangeResults()) {

            Analysis analysis = ResultUtil.resolveModifiedAnalysis(actionDataSet, testResultItem.getAnalysisId());
            analysis.setSysUserId(getSysUserId(request));
            analysis.setCompletedDate(DateUtil.convertStringDateToTimestampLenient(testResultItem.getTestDate()));
            if (testResultItem.getAnalysisMethod() != null) {
                analysis.setAnalysisType(testResultItem.getAnalysisMethod());
            }
            if (!GenericValidator.isBlankOrNull(testResultItem.getTestMethod())) {
                analysis.setMethod(methodService.get(testResultItem.getTestMethod()));
            }
        }
    }

    private void createResultsFromItems(ResultsUpdateDataSet actionDataSet, boolean supportReferrals,
            boolean alwaysValidate, boolean useTechnicianName, String statusRuleSet) {
        ResultUtil.createResultsFromItems(actionDataSet, supportReferrals, alwaysValidate, useTechnicianName,
                statusRuleSet, request);
    }

    private String extractMultiSelectJson(String input) {

        String bestJson = null;
        int maxKeyCount = 0;

        StringBuilder current = new StringBuilder();
        boolean inObject = false;
        int braceDepth = 0;

        for (int i = 0; i < input.length(); i++) {
            char ch = input.charAt(i);

            if (ch == '{') {
                inObject = true;
                braceDepth++;
                current.setLength(0);
            }

            if (inObject) {
                current.append(ch);
            }

            if (ch == '}') {
                braceDepth--;
                if (braceDepth == 0) {
                    inObject = false;

                    String json = current.toString();
                    int keyCount = countNumericKeys(json);

                    if (keyCount > maxKeyCount) {
                        maxKeyCount = keyCount;
                        bestJson = json;
                    }
                }
            }
        }

        return bestJson;
    }

    private int countNumericKeys(String json) {
        boolean insideQuotes = false;
        StringBuilder key = new StringBuilder();
        int count = 0;

        for (int i = 0; i < json.length(); i++) {
            char ch = json.charAt(i);

            if (ch == '"') {
                insideQuotes = !insideQuotes;

                if (!insideQuotes) {
                    // closing quote
                    if (i + 1 < json.length() && json.charAt(i + 1) == ':') {
                        if (isDigits(key.toString())) {
                            count++;
                        }
                    }
                    key.setLength(0);
                }
                continue;
            }

            if (insideQuotes) {
                key.append(ch);
            }
        }
        return count;
    }

    private boolean isDigits(String s) {
        if (s.isEmpty())
            return false;
        for (char c : s.toCharArray()) {
            if (!Character.isDigit(c))
                return false;
        }
        return true;
    }

    private String findLogBookForward(String forward) {
        if (FWD_SUCCESS.equals(forward)) {
            return "resultsLogbookDefinition";
        } else if (FWD_SUCCESS_INSERT.equals(forward)) {
            return "redirect:/LogbookResults";
        } else if (FWD_VALIDATION_ERROR.equals(forward)) {
            return "resultsLogbookDefinition";
        } else if (FWD_FAIL_INSERT.equals(forward)) {
            return "resultsLogbookDefinition";
        } else {
            return "PageNotFound";
        }
    }

    private String findAccessionForward(String forward) {
        if (FWD_SUCCESS_INSERT.equals(forward)) {
            return "redirect:/AccessionResults";
        } else if (FWD_VALIDATION_ERROR.equals(forward)) {
            return "redirect:/AccessionResults";
        } else if (FWD_FAIL_INSERT.equals(forward)) {
            return "redirect:/AccessionResults";
        } else {
            return "PageNotFound";
        }
    }

    private String findPatientForward(String forward) {
        if (FWD_SUCCESS_INSERT.equals(forward)) {
            return "redirect:/PatientResults";
        } else if (FWD_SUCCESS.equals(forward)) {
            return "patientResultDefinition";
        } else if (FWD_VALIDATION_ERROR.equals(forward)) {
            return "patientResultDefinition";
        } else if (FWD_FAIL_INSERT.equals(forward)) {
            return "patientResultDefinition";
        } else {
            return "PageNotFound";
        }
    }

    private String findStatusForward(String forward) {
        if (FWD_SUCCESS_INSERT.equals(forward)) {
            return "redirect:/StatusResults?blank=true";
        } else if (FWD_VALIDATION_ERROR.equals(forward)) {
            return "statusResultDefinition";
        } else if (FWD_FAIL_INSERT.equals(forward)) {
            return "statusResultDefinition";
        } else {
            return "PageNotFound";
        }
    }

    private String findRangeForward(String forward) {
        if (FWD_SUCCESS.equals(forward)) {
            return "resultsLogbookDefinition";
        } else if (FWD_SUCCESS_INSERT.equals(forward)) {
            return "redirect:/RangeResults";
        } else if (FWD_VALIDATION_ERROR.equals(forward)) {
            return "resultsLogbookDefinition";
        } else if (FWD_FAIL_INSERT.equals(forward)) {
            return "resultsLogbookDefinition";
        } else {
            return "PageNotFound";
        }
    }

    @Override
    protected String findLocalForward(String forward) {
        if (request.getRequestURL().indexOf("RangeResults") >= 0) {
            return findRangeForward(forward);
        } else if (request.getRequestURL().indexOf("LogbookResults") >= 0) {
            return findLogBookForward(forward);
        } else if (request.getRequestURL().indexOf("AccessionResults") >= 0) {
            return findAccessionForward(forward);
        } else if (request.getRequestURL().indexOf("PatientResults") >= 0) {
            return findPatientForward(forward);
        } else if (request.getRequestURL().indexOf("StatusResults") >= 0) {
            return findStatusForward(forward);
        } else {
            return "PageNotFound";
        }
    }
}

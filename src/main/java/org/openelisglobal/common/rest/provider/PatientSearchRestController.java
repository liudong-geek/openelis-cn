package org.openelisglobal.common.rest.provider;

import ca.uhn.fhir.rest.client.api.IGenericClient;
import ca.uhn.fhir.rest.gclient.IQuery;
import ca.uhn.fhir.rest.param.StringOrListParam;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationTargetException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.function.Supplier;
import java.util.function.UnaryOperator;
import org.apache.commons.validator.GenericValidator;
import org.hl7.fhir.instance.model.api.IBaseBundle;
import org.hl7.fhir.r4.model.*;
import org.openelisglobal.common.externalLinks.ExternalPatientSearchException;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.provider.query.PatientSearchResults;
import org.openelisglobal.common.provider.query.PatientSearchResultsForm;
import org.openelisglobal.common.provider.query.workerObjects.PatientSearchLocalAndExternalWorker;
import org.openelisglobal.common.provider.query.workerObjects.PatientSearchLocalWorker;
import org.openelisglobal.common.provider.query.workerObjects.PatientSearchWorker;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.common.rest.util.PatientSearchResultsPaging;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.dataexchange.fhir.FhirUtil;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.observationhistory.service.ObservationHistoryService;
import org.openelisglobal.observationhistory.service.ObservationHistoryServiceImpl.ObservationType;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.person.service.PersonService;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.search.service.SearchResultsService;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.server.ResponseStatusException;

@Controller
@RequestMapping(value = "/rest/")
public class PatientSearchRestController extends BaseRestController {

    private static final int MAX_CLIENT_REGISTRY_PAGES = 200;

    private record ClientRegistrySearchResult(List<PatientSearchResults> results, boolean limitReached) {
    }

    record BoundedFhirPatients(List<org.hl7.fhir.r4.model.Patient> patients, boolean limitReached) {
    }

    @Autowired
    private FhirConfig fhirConfig;
    @Autowired
    private FhirUtil fhirUtil;
    @Autowired
    SampleService sampleService;
    @Autowired
    PatientService patientService;
    @Autowired
    PersonService personService;
    @Autowired
    ObservationHistoryService observationHistoryService;
    @Autowired
    SampleHumanService sampleHumanService;
    @Autowired
    SearchResultsService searchResultsService;

    StringOrListParam targetSystemsParam;

    @GetMapping(value = "patient-search-results", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public PatientSearchResultsForm getPatientResults(HttpServletRequest request,
            @RequestParam(required = false) String lastName, @RequestParam(required = false) String firstName,
            @RequestParam(required = false) String STNumber, @RequestParam(required = false) String subjectNumber,
            @RequestParam(required = false) String nationalID, @RequestParam(required = false) String guid,
            @RequestParam(required = false) String labNumber, @RequestParam(required = false) String dateOfBirth,
            @RequestParam(required = false) String gender, @RequestParam(required = false) String quickQuery,
            @RequestParam(required = false) String suppressExternalSearch)
            throws InvocationTargetException, IllegalAccessException, NoSuchMethodException {
        PatientSearchResultsPaging paging = createPatientSearchResultsPaging();
        PatientSearchResultsForm form = new PatientSearchResultsForm();

        String requestedPage = request.getParameter("page");
        String queryId = request.getParameter("queryId");
        String actor = getSysUserId(request);
        // Reject an unusable authenticated-user mapping before local queries,
        // remote registry calls, or external-patient imports can have side effects.
        paging.requireActor(actor);
        String criteriaSignature = criteriaSignature(lastName, firstName, STNumber, subjectNumber, nationalID, guid,
                labNumber, dateOfBirth, gender, quickQuery, suppressExternalSearch, request.getParameter("crSearch"));
        // Preserve the legacy endpoint contract: clients historically sent page=""
        // on an initial search, and the old controller treated it as no page.
        boolean pageWasSpecified = isPageRequest(requestedPage);
        if (pageWasSpecified) {
            if (GenericValidator.isBlankOrNull(queryId)) {
                // Older clients repeat the original criteria and only add page. Their page
                // still belongs to the latest patient query in this authenticated session.
                paging.page(request, actor, form, criteriaSignature, requestedPage);
            } else {
                paging.page(request, actor, form, queryId, criteriaSignature, requestedPage);
            }
        } else {
            List<PatientSearchResults> results = new ArrayList<>();
            if (!GenericValidator.isBlankOrNull(quickQuery)) {
                results = searchResultsService.getQuickSearchResults(quickQuery,
                        PatientSearchResultsPaging.MAX_CACHED_ROWS + 1);
                paging.requireWithinRowLimit(results);
                results.forEach(result -> result.setDataSourceName(MessageUtil.getMessage("patient.local.source")));
            } else if (!GenericValidator.isBlankOrNull(labNumber)) {
                Patient patient = getPatientForLabNumber(labNumber);
                if (patient == null || GenericValidator.isBlankOrNull(patient.getId())) {
                    paging.setDatabaseResults(request, actor, form, results, criteriaSignature, false);
                    return form;
                } else {
                    PatientSearchResults searchResult = getSearchResultsForPatient(patient, null);
                    searchResult.setDataSourceName(MessageUtil.getMessage("patient.local.source"));
                    results.add(searchResult);
                }
            } else {
                PatientSearchWorker worker = getAppropriateWorker(actor, "true".equals(suppressExternalSearch));
                if (worker != null) {
                    PatientSearchWorker.BoundedPatientSearchResults boundedResults;
                    try {
                        boundedResults = worker.getPatientSearchResults(lastName, firstName, STNumber, subjectNumber,
                                nationalID, null, guid, dateOfBirth, gender,
                                PatientSearchResultsPaging.MAX_CACHED_ROWS + 1);
                    } catch (ExternalPatientSearchException e) {
                        throw externalPatientSearchFailure(e);
                    }
                    // Fail the bounded local-query probe before an optional registry search can
                    // replace it. The final snapshot check still protects the session cache.
                    paging.requireWithinRowLimit(
                            boundedResults.limitReached() ? PatientSearchResultsPaging.MAX_CACHED_ROWS + 1
                                    : boundedResults.results().size());
                    results = boundedResults.results();
                } else {
                    paging.setDatabaseResults(request, actor, form, results, criteriaSignature, false);
                    return form;
                }
            }

            if (ConfigurationProperties.getInstance().getPropertyValue(Property.ENABLE_CLIENT_REGISTRY)
                    .equals("true")) {
                String crSearchParam = request.getParameter("crSearch");
                if (crSearchParam != null && crSearchParam.contains("true")) {
                    ClientRegistrySearchResult registryResults = searchPatientInClientRegistry(lastName, firstName,
                            STNumber, subjectNumber, nationalID, null, guid, dateOfBirth, gender,
                            PatientSearchResultsPaging.MAX_CACHED_ROWS + 1);
                    paging.requireWithinRowLimit(
                            registryResults.limitReached() ? PatientSearchResultsPaging.MAX_CACHED_ROWS + 1
                                    : registryResults.results().size());
                    LogEvent.logWarn("PatientSearchRestController", "getPatientResults()",
                            "final results have been added");
                    results = registryResults.results();
                }
            }
            paging.setDatabaseResults(request, actor, form, results, criteriaSignature);
        }
        return form;
    }

    static boolean isPageRequest(String requestedPage) {
        return !GenericValidator.isBlankOrNull(requestedPage);
    }

    PatientSearchResultsPaging createPatientSearchResultsPaging() {
        return new PatientSearchResultsPaging();
    }

    static String criteriaSignature(String lastName, String firstName, String STNumber, String subjectNumber,
            String nationalID, String guid, String labNumber, String dateOfBirth, String gender, String quickQuery,
            String suppressExternalSearch, String crSearch) {
        StringBuilder signature = new StringBuilder();
        appendCriterion(signature, "lastName", lastName);
        appendCriterion(signature, "firstName", firstName);
        appendCriterion(signature, "STNumber", STNumber);
        appendCriterion(signature, "subjectNumber", subjectNumber);
        appendCriterion(signature, "nationalID", nationalID);
        appendCriterion(signature, "guid", guid);
        appendCriterion(signature, "labNumber", labNumber);
        appendCriterion(signature, "dateOfBirth", dateOfBirth);
        appendCriterion(signature, "gender", gender);
        appendCriterion(signature, "quickQuery", quickQuery);
        appendCriterion(signature, "suppressExternalSearch", suppressExternalSearch);
        appendCriterion(signature, "crSearch", crSearch);
        return signature.toString();
    }

    private static void appendCriterion(StringBuilder signature, String name, String value) {
        String normalized = GenericValidator.isBlankOrNull(value) ? "" : value;
        signature.append(name.length()).append(':').append(name).append('=');
        signature.append(normalized.length()).append(':').append(normalized);
        signature.append(';');
    }

    private Patient getPatientForLabNumber(String labNumber) {

        Sample sample = sampleService.getSampleByAccessionNumber(labNumber);

        if (sample != null && !GenericValidator.isBlankOrNull(sample.getId())) {
            return sampleHumanService.getPatientForSample(sample);
        }

        return new Patient();
    }

    private PatientSearchResults getSearchResultsForPatient(Patient patient, String referringSitePatientId) {
        personService.getData(patient.getPerson());
        return new PatientSearchResults(BigDecimal.valueOf(Long.parseLong(patient.getId())),
                patientService.getFirstName(patient), patientService.getLastName(patient),
                patientService.getGender(patient), patientService.getEnteredDOB(patient),
                patientService.getNationalId(patient), patient.getExternalId(), patientService.getSTNumber(patient),
                patientService.getSubjectNumber(patient), patientService.getGUID(patient),
                referringSitePatientId != null ? referringSitePatientId
                        : observationHistoryService.getMostRecentValueForPatient(ObservationType.REFERRERS_PATIENT_ID,
                                patientService.getPatientId(patient)));
    }

    PatientSearchWorker getAppropriateWorker(String actor, boolean suppressExternalSearch) {

        if (ConfigurationProperties.getInstance().isCaseInsensitivePropertyValueEqual(Property.UseExternalPatientInfo,
                "false") || suppressExternalSearch) {
            return new PatientSearchLocalWorker();
        } else {
            return new PatientSearchLocalAndExternalWorker(actor);
        }
    }

    @GetMapping("/patient-search")
    public @ResponseBody List<PatientSearchResults> getSearchResults(HttpServletRequest request,
            @RequestParam(required = false) String lastName, @RequestParam(required = false) String firstName,
            @RequestParam(required = false) String STNumber, @RequestParam(required = false) String subjectNumber,
            @RequestParam(required = false) String nationalID, @RequestParam(required = false) String externalID,
            @RequestParam(required = false) String patientID, @RequestParam(required = false) String guid,
            @RequestParam(required = false) String dateOfBirth, @RequestParam(required = false) String gender) {
        PatientSearchResultsPaging paging = createPatientSearchResultsPaging();
        paging.requireActor(getSysUserId(request));
        List<PatientSearchResults> results = searchResultsService.getSearchResults(lastName, firstName, STNumber,
                subjectNumber, nationalID, externalID, patientID, guid, dateOfBirth, gender,
                PatientSearchResultsPaging.MAX_CACHED_ROWS + 1);
        paging.requireWithinRowLimit(results);
        return results;
    }

    private ClientRegistrySearchResult searchPatientInClientRegistry(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String patientID, String guid, String dateOfBirth, String gender,
            int maxResults) {
        if (maxResults < 1) {
            throw new IllegalArgumentException("Client registry result limit must be positive");
        }
        LogEvent.logWarn("PatientSearchRestController", "searchPatientInClientRegistry()",
                "searchPatientInClientRegistry method has been reached");
        if (isClientRegistryConfigInvalid()) {
            return new ClientRegistrySearchResult(List.of(), false);
        }

        IGenericClient clientRegistry = fhirUtil.getBoundedFhirClient(fhirConfig.getClientRegistryServerUrl(),
                fhirConfig.getClientRegistryUserName(), fhirConfig.getClientRegistryPassword(),
                fhirConfig.getExternalPatientSearchMaxResponseBytes(), fhirConfig.getExternalPatientSearchTimeout());
        LogEvent.logWarn("PatientSearchRestController", "searchPatientInClientRegistry()",
                "ClientRegistry connected successfully");

        IQuery<IBaseBundle> query = buildPatientSearchQuery(clientRegistry, lastName, firstName, STNumber,
                subjectNumber, nationalID, patientID, guid, dateOfBirth, gender);

        IQuery<IBaseBundle> boundedQuery = query.count(maxResults).limitTo(maxResults);
        Bundle bundle = executeClientRegistrySearch(() -> boundedQuery.returnBundle(Bundle.class).execute());
        BoundedFhirPatients boundedPatients = collectRegistryPatients(bundle, maxResults,
                fhirConfig.getClientRegistryServerUrl(), current -> clientRegistry.loadPage().next(current).execute());
        if (boundedPatients.limitReached()) {
            return new ClientRegistrySearchResult(List.of(), true);
        }

        // Transform and perform duplicate checks only after pagination proves the
        // complete upstream result is within the technical boundary.
        List<PatientSearchResults> finalResults = new ArrayList<>();
        for (org.hl7.fhir.r4.model.Patient externalPatient : boundedPatients.patients()) {
            // convert fhir object to patient search result
            PatientSearchResults transformedPatientSearchResult = SpringContext.getBean(FhirTransformService.class)
                    .transformToOpenElisPatientSearchResults(externalPatient);

            // Check for null NationalId and generate if needed
            if (transformedPatientSearchResult.getNationalId() == null
                    || transformedPatientSearchResult.getNationalId().isEmpty()) {
                String nationalId = generateDynamicID(transformedPatientSearchResult);
                LogEvent.logInfo(this.getClass().getSimpleName(), "searchPatientInClientRegistry",
                        "dynamic national id: " + nationalId);
                transformedPatientSearchResult.setNationalId(nationalId);
            }

            // Skip this patient if it's already in the local database
            if (!isPatientDuplicate(transformedPatientSearchResult)) {
                transformedPatientSearchResult.setDataSourceName(MessageUtil.getMessage("patient.cr.source"));
                finalResults.add(transformedPatientSearchResult);
            } else {
                LogEvent.logInfo("PatientSearchRestController", "searchPatientInClientRegistry",
                        String.format("Skipped duplicate patient with NationalId: %s, Name: %s %s",
                                transformedPatientSearchResult.getNationalId(),
                                transformedPatientSearchResult.getFirstName(),
                                transformedPatientSearchResult.getLastName()));
            }
        }

        return new ClientRegistrySearchResult(finalResults, false);
    }

    static BoundedFhirPatients collectRegistryPatients(Bundle initialBundle, int maxResults, String registryBaseUrl,
            UnaryOperator<Bundle> nextPageLoader) {
        if (maxResults < 1) {
            throw new IllegalArgumentException("Client registry result limit must be positive");
        }
        Objects.requireNonNull(nextPageLoader, "nextPageLoader");
        requireClientRegistrySearchBundle(initialBundle, "Client registry returned no patient-search Bundle");
        Bundle bundle = initialBundle;
        List<org.hl7.fhir.r4.model.Patient> externalPatients = new ArrayList<>();
        Set<String> visitedNextPageUrls = new HashSet<>();
        int pageBudget = Math.min(maxResults, MAX_CLIENT_REGISTRY_PAGES);
        int pagesVisited = 0;
        while (true) {
            pagesVisited++;
            if (bundle.hasTotal() && bundle.getTotal() >= maxResults) {
                return new BoundedFhirPatients(List.of(), true);
            }
            for (Bundle.BundleEntryComponent entry : bundle.getEntry()) {
                if (!(entry.getResource() instanceof org.hl7.fhir.r4.model.Patient externalPatient)) {
                    continue;
                }
                externalPatients.add(externalPatient);
                if (externalPatients.size() >= maxResults) {
                    return new BoundedFhirPatients(List.of(), true);
                }
            }

            Bundle.BundleLinkComponent next = bundle.getLink(IBaseBundle.LINK_NEXT);
            if (next == null) {
                break;
            }
            if (GenericValidator.isBlankOrNull(next.getUrl())) {
                throw clientRegistryPagingFailure("Client registry returned an invalid patient-search next link");
            }
            URI validatedNextPage = requireAllowedClientRegistryNextPage(registryBaseUrl, next.getUrl());
            if (!visitedNextPageUrls.add(validatedNextPage.toASCIIString())) {
                throw clientRegistryPagingFailure("Client registry returned a repeated patient-search page");
            }
            if (pagesVisited >= pageBudget) {
                throw clientRegistryPagingFailure("Client registry patient-search pagination exceeded the page limit");
            }
            Bundle nextBundle;
            try {
                nextBundle = nextPageLoader.apply(bundle);
            } catch (RuntimeException e) {
                throw clientRegistryFailure("Client registry could not load a patient-search next page", e);
            }
            requireClientRegistrySearchBundle(nextBundle, "Client registry returned no patient-search next page");
            bundle = nextBundle;
        }
        return new BoundedFhirPatients(List.copyOf(externalPatients), false);
    }

    static URI requireAllowedClientRegistryNextPage(String registryBaseUrl, String nextPageUrl) {
        try {
            URI base = new URI(registryBaseUrl).normalize();
            if (!base.isAbsolute() || base.isOpaque() || base.getHost() == null || base.getUserInfo() != null
                    || !("http".equalsIgnoreCase(base.getScheme()) || "https".equalsIgnoreCase(base.getScheme()))) {
                throw clientRegistryPagingFailure("Client registry server URL is invalid");
            }

            String basePath = normalizedUriPath(base);
            URI resolutionBase = new URI(base.getScheme(), null, base.getHost(), base.getPort(),
                    basePath.endsWith("/") ? basePath : basePath + "/", null, null);
            URI supplied = new URI(nextPageUrl.trim());
            URI resolved = (supplied.isAbsolute() ? supplied : resolutionBase.resolve(supplied)).normalize();
            if (resolved.isOpaque() || resolved.getHost() == null || resolved.getUserInfo() != null
                    || resolved.getFragment() != null || !base.getScheme().equalsIgnoreCase(resolved.getScheme())
                    || !base.getHost().equalsIgnoreCase(resolved.getHost())
                    || effectivePort(base) != effectivePort(resolved)) {
                throw clientRegistryPagingFailure("Client registry returned a disallowed patient-search next link");
            }

            String resolvedPath = normalizedUriPath(resolved);
            String allowedPrefix = "/".equals(basePath) ? "/" : basePath + "/";
            if (!resolvedPath.equals(basePath) && !resolvedPath.startsWith(allowedPrefix)) {
                throw clientRegistryPagingFailure("Client registry returned a next link outside its configured path");
            }
            return resolved;
        } catch (URISyntaxException | IllegalArgumentException e) {
            throw clientRegistryPagingFailure("Client registry returned an invalid patient-search next link");
        }
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() >= 0) {
            return uri.getPort();
        }
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private static String normalizedUriPath(URI uri) {
        String path = uri.getPath();
        if (GenericValidator.isBlankOrNull(path)) {
            return "/";
        }
        Deque<String> segments = new ArrayDeque<>();
        for (String segment : path.split("/")) {
            if (segment.isEmpty() || ".".equals(segment)) {
                continue;
            }
            if ("..".equals(segment)) {
                if (!segments.isEmpty()) {
                    segments.removeLast();
                }
            } else {
                segments.addLast(segment);
            }
        }
        return "/" + String.join("/", segments);
    }

    static Bundle executeClientRegistrySearch(Supplier<Bundle> queryExecution) {
        Objects.requireNonNull(queryExecution, "queryExecution");
        try {
            return queryExecution.get();
        } catch (RuntimeException e) {
            throw clientRegistryFailure("Client registry patient search could not be completed", e);
        }
    }

    private static void requireClientRegistrySearchBundle(Bundle bundle, String missingMessage) {
        if (bundle == null) {
            throw clientRegistryPagingFailure(missingMessage);
        }
        if (!bundle.hasType() || bundle.getType() != Bundle.BundleType.SEARCHSET) {
            throw clientRegistryPagingFailure("Client registry returned an invalid patient-search Bundle");
        }
    }

    private static ResponseStatusException clientRegistryPagingFailure(String message) {
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, message);
    }

    private static ResponseStatusException clientRegistryFailure(String message, RuntimeException cause) {
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, message, cause);
    }

    private static ResponseStatusException externalPatientSearchFailure(ExternalPatientSearchException cause) {
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "External patient search could not be completed",
                cause);
    }

    // FIXME: get better fallback initials and gender
    private static String generateDynamicID(PatientSearchResults transformedPatientSearchResult) {
        String genderOfTransformedPatient = transformedPatientSearchResult.getGender() != null
                && !transformedPatientSearchResult.getGender().isEmpty()
                        ? transformedPatientSearchResult.getGender().toUpperCase()
                        : "UNK";

        String initials = getInitials(transformedPatientSearchResult);

        String formattedDob = "00000000";
        if (transformedPatientSearchResult.getBirthdate() != null
                && !transformedPatientSearchResult.getBirthdate().isEmpty()) {
            try {
                formattedDob = DateUtil.parseLocalDate(transformedPatientSearchResult.getBirthdate())
                        .format(DateTimeFormatter.ofPattern("yyyyMMdd"));
            } catch (DateTimeParseException e) {
                LogEvent.logError(e);
            }
        }

        return String.format("NID-%s-%s-%s", genderOfTransformedPatient, formattedDob, initials);
    }

    private static String getInitials(PatientSearchResults transformedPatientSearchResult) {
        String initials = "";
        if (transformedPatientSearchResult.getFirstName() != null
                && !transformedPatientSearchResult.getFirstName().isEmpty()) {
            initials = transformedPatientSearchResult.getFirstName().substring(0, 1).toUpperCase();
        }
        if (transformedPatientSearchResult.getLastName() != null
                && !transformedPatientSearchResult.getLastName().isEmpty()) {
            initials += transformedPatientSearchResult.getLastName().substring(0, 1).toUpperCase();
        }

        if (initials.isEmpty()) {
            initials = "NAN";
        }
        return initials;
    }

    private boolean isClientRegistryConfigInvalid() {
        return GenericValidator.isBlankOrNull(fhirConfig.getClientRegistryServerUrl())
                || GenericValidator.isBlankOrNull(fhirConfig.getClientRegistryUserName())
                || GenericValidator.isBlankOrNull(fhirConfig.getClientRegistryPassword());
    }

    public IQuery<IBaseBundle> buildPatientSearchQuery(IGenericClient clientRegistry, String lastName, String firstName,
            String STNumber, String subjectNumber, String nationalID, String patientID, String guid, String dateOfBirth,
            String gender) {
        IQuery<IBaseBundle> query = clientRegistry.search().forResource(org.hl7.fhir.r4.model.Patient.class);
        if (!GenericValidator.isBlankOrNull(lastName)) {
            query = query.where(org.hl7.fhir.r4.model.Patient.FAMILY.matches().value(lastName));
            LogEvent.logWarn("PatientSearchRestController", "buildPatientSearchQuery()", "lastname added to query");
        }

        if (!GenericValidator.isBlankOrNull(firstName)) {
            query = query.where(org.hl7.fhir.r4.model.Patient.GIVEN.matches().value(firstName));
            LogEvent.logWarn("PatientSearchRestController", "buildPatientSearchQuery()", "first name added to query");
        }

        // Map for identifier-based queries (STNumber, SubjectNumber, NationalId,
        // PatientID, GUID)
        Map<String, String> identifierMappings = new HashMap<>();

        // Add non-null identifiers to the map
        if (STNumber != null) {
            identifierMappings.put("stnumber", STNumber);
        }
        if (subjectNumber != null) {
            identifierMappings.put("subjectnumber", subjectNumber);
        }
        if (nationalID != null) {
            identifierMappings.put("nationalid", nationalID);
        }
        if (patientID != null) {
            identifierMappings.put("patientid", patientID);
        }
        if (guid != null) {
            identifierMappings.put("guid", guid);
        }

        // Loop through identifiers and add them to the query
        for (Map.Entry<String, String> entry : identifierMappings.entrySet()) {
            String value = entry.getValue();
            if (!GenericValidator.isBlankOrNull(value)) {
                query = query.where(org.hl7.fhir.r4.model.Patient.IDENTIFIER.exactly()
                        .systemAndCode("http://openelis-global.org/pat_" + entry.getKey(), value));
                LogEvent.logInfo("PatientSearchRestController", "buildPatientSearchQuery()",
                        "Added identifier (" + entry.getKey() + ") to query.");
            }
        }

        if (!GenericValidator.isBlankOrNull(dateOfBirth)) {
            query = query.where(org.hl7.fhir.r4.model.Patient.BIRTHDATE.exactly().day(dateOfBirth));
            LogEvent.logWarn("PatientSearchRestController", "buildPatientSearchQuery()", "dob added to query");
        }

        if (!GenericValidator.isBlankOrNull(gender)) {
            query = query.where(org.hl7.fhir.r4.model.Patient.GENDER.exactly().code(gender));
            LogEvent.logWarn("PatientSearchRestController", "buildPatientSearchQuery()", "gender added to query");
        }

        return query;
    }

    private boolean isPatientDuplicate(PatientSearchResults externalPatient) {
        List<PatientSearchResults> localResults = searchResultsService.getSearchResults(externalPatient.getLastName(),
                externalPatient.getFirstName(), null, null, externalPatient.getNationalId(), null, null, null, null,
                null, 2);
        for (PatientSearchResults localPatient : localResults) {
            if (isMatchingPatient(localPatient, externalPatient)) {
                return true;
            }
        }
        return false;
    }

    private boolean isMatchingPatient(PatientSearchResults local, PatientSearchResults external) {
        boolean nationalIdMatch = (local.getNationalId() != null && external.getNationalId() != null)
                && local.getNationalId().equalsIgnoreCase(external.getNationalId());

        boolean firstNameMatch = (local.getFirstName() != null && external.getFirstName() != null)
                && local.getFirstName().equalsIgnoreCase(external.getFirstName());

        boolean lastNameMatch = (local.getLastName() != null && external.getLastName() != null)
                && local.getLastName().equalsIgnoreCase(external.getLastName());

        return nationalIdMatch && firstNameMatch && lastNameMatch;
    }
}

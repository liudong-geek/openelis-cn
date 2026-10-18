package org.openelisglobal.dataexchange.fhir.service;

import ca.uhn.fhir.rest.client.api.IGenericClient;
import ca.uhn.fhir.rest.client.interceptor.AdditionalRequestHeadersInterceptor;
import ca.uhn.fhir.rest.param.DateRangeParam;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Future;
import org.hl7.fhir.instance.model.api.IBaseBundle;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.CapabilityStatement;
import org.hl7.fhir.r4.model.DomainResource;
import org.hl7.fhir.r4.model.Resource;
import org.hl7.fhir.r4.model.Task;
import org.itech.fhir.dataexport.api.service.DataExportService;
import org.itech.fhir.dataexport.api.service.DataExportStatusService;
import org.itech.fhir.dataexport.core.dao.DataExportAttemptDAO;
import org.itech.fhir.dataexport.core.model.DataExportAttempt;
import org.itech.fhir.dataexport.core.model.DataExportAttempt.DataExportStatus;
import org.itech.fhir.dataexport.core.model.DataExportTask;
import org.itech.fhir.dataexport.core.service.DataExportTaskService;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.dataexchange.fhir.FhirUtil;
import org.openelisglobal.report.service.impl.ReportPublicationService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * The shared scheduled/manual export boundary. Technical result resources in
 * the local store are never a publication source; formal reports come from
 * their signed, frozen release. Transport success is not a hospital business
 * receipt.
 */
@Service
@Primary
public class IssuedReportDataExportService implements DataExportService {
    private static final Set<String> NONCLINICAL_RESOURCES = Set.of("Task", "Patient", "ServiceRequest", "Specimen",
            "Practitioner", "Organization", "Encounter", "Location", "Device");
    private static final Set<String> CLINICAL_RESOURCES = Set.of("Observation", "DiagnosticReport");
    private static final String PLACEHOLDER = "http://hapifhir.io/fhir/StructureDefinition/resource-placeholder";
    private static final int REPORT_PAGE_SIZE = 100;

    @Value("${org.openelisglobal.fhirstore.uri:}")
    private String localFhirStore;
    @Value("${org.openelisglobal.fhir.subscriber:}")
    private String defaultRemoteServer;
    @Value("${org.openelisglobal.fhir.subscriber.resources:}")
    private String[] defaultResources;
    @Value("${org.openelisglobal.fhir.subscriber.resource.singleTransaction:false}")
    private boolean singleTransaction;
    @Value("${org.openelisglobal.fhir.subscriber.resource.allowParallel:false}")
    private boolean allowParallel;

    private final Set<Long> runningTasks = ConcurrentHashMap.newKeySet();
    private final DataExportTaskService tasks;
    private final DataExportAttemptDAO attempts;
    private final DataExportStatusService statuses;
    private final FhirUtil clients;
    private final ReportPublicationService publications;

    public IssuedReportDataExportService(DataExportTaskService tasks, DataExportAttemptDAO attempts,
            DataExportStatusService statuses, FhirUtil clients, ReportPublicationService publications) {
        this.tasks = tasks;
        this.attempts = attempts;
        this.statuses = statuses;
        this.clients = clients;
        this.publications = publications;
    }

    @Override
    @Async
    public Future<DataExportStatus> exportNewDataFromLocalToRemote(DataExportTask task) {
        if (task == null || task.getId() == null)
            throw new IllegalArgumentException("A persisted export task is required");
        boolean tracked = !allowParallel;
        if (tracked && !runningTasks.add(task.getId()))
            return CompletableFuture.completedFuture(DataExportStatus.NOT_RAN);
        try {
            DataExportAttempt attempt = attempts.save(new DataExportAttempt(task));
            if (blank(localFhirStore) || blank(defaultRemoteServer) || defaultResources == null
                    || defaultResources.length == 0) {
                return completed(attempt, DataExportStatus.NOT_RAN);
            }
            return CompletableFuture.completedFuture(export(attempt));
        } finally {
            if (tracked)
                runningTasks.remove(task.getId());
        }
    }

    private DataExportStatus export(DataExportAttempt attempt) {
        int[] completedTransactions = { 0 };
        try {
            List<String> resourceTypes = configuredTypes();
            if (resourceTypes.isEmpty()) {
                statuses.changeDataRequestAttemptStatus(attempt, DataExportStatus.NOT_RAN);
                return DataExportStatus.NOT_RAN;
            }
            Instant through = attempt.getStartTime();
            Instant from = tasks.getLatestSuccessInstantForDataExportTask(attempt.getDataExportTask());
            if (through == null || (from != null && from.isAfter(through)))
                throw new IllegalStateException("Invalid export time window");
            statuses.changeDataRequestAttemptStatus(attempt, DataExportStatus.REQUESTING);
            IGenericClient local = clients.getFhirClient(localFhirStore);
            List<Bundle> nonclinical = collect(local, resourceTypes, from, through);
            boolean includeReports = resourceTypes.stream().anyMatch(CLINICAL_RESOURCES::contains);
            statuses.changeDataRequestAttemptStatus(attempt, DataExportStatus.COLLECTED);
            // Preserve the established global subscriber route. task.endpoint is not a
            // routing override in the existing integration contract.
            IGenericClient remote = clients.getFhirClient(defaultRemoteServer);
            var headers = new AdditionalRequestHeadersInterceptor();
            if (attempt.getDataExportTask().getHeaders() != null)
                attempt.getDataExportTask().getHeaders().forEach(headers::addHeaderValue);
            remote.registerInterceptor(headers);
            statuses.changeDataRequestAttemptStatus(attempt, DataExportStatus.EXPORTING);
            for (Bundle bundle : nonclinical) {
                if (bundle.hasEntry()) {
                    send(remote, bundle);
                    completedTransactions[0]++;
                }
            }
            if (includeReports)
                publishReports(remote, through, completedTransactions);
            if (completedTransactions[0] == 0
                    && remote.capabilities().ofType(CapabilityStatement.class).execute() == null)
                throw new IllegalStateException("FHIR subscriber did not return its capability statement");
            statuses.changeDataRequestAttemptStatus(attempt, DataExportStatus.SUCCEEDED);
            return DataExportStatus.SUCCEEDED;
        } catch (RuntimeException error) {
            // Do not log patient payloads, authorization headers or endpoint credentials.
            LogEvent.logError(getClass().getSimpleName(), "exportNewDataFromLocalToRemote",
                    "FHIR transport failed for task " + attempt.getDataExportTask().getId() + " after "
                            + completedTransactions[0] + " completed transactions: "
                            + error.getClass().getSimpleName());
            DataExportStatus status = completedTransactions[0] > 0 ? DataExportStatus.INCOMPLETE
                    : DataExportStatus.FAILED;
            statuses.changeDataRequestAttemptStatus(attempt, status);
            return status;
        }
    }

    private void publishReports(IGenericClient remote, Instant through, int[] completedTransactions) {
        // Issue timestamps precede commit. Every run starts at zero so late commits
        // behind a previous cursor are reconsidered without loading all PDF originals.
        long afterId = 0;
        while (true) {
            List<String> page = publications.publicationIds(through, afterId, REPORT_PAGE_SIZE);
            if (page == null || page.size() > REPORT_PAGE_SIZE)
                throw new IllegalStateException("Formal report publication page is incomplete");
            if (page.isEmpty())
                return;
            Set<String> pageIds = new HashSet<>();
            long nextId = afterId;
            for (String resourceId : page) {
                if (resourceId == null || !resourceId.matches("cn-report-[1-9][0-9]*"))
                    throw new IllegalStateException("Invalid formal report publication identity");
                if (!pageIds.add(resourceId))
                    continue;
                long id = Long.parseLong(resourceId.substring("cn-report-".length()));
                if (id <= nextId)
                    throw new IllegalStateException("Formal report publication cursor did not advance");
                nextId = id;
                // Only this current release's PDF is loaded, under the same locks used
                // for amendment and voiding. Candidate IDs never carry clinical content.
                publications.withCurrentPublication(resourceId, current -> {
                    if (current == null || !resourceId.equals(current.getIdElement().getIdPart()))
                        throw new IllegalStateException("Formal report publication identity changed");
                    Bundle transaction = transaction();
                    addPut(transaction, current);
                    send(remote, transaction);
                    completedTransactions[0]++;
                });
            }
            afterId = nextId;
        }
    }

    private List<String> configuredTypes() {
        List<String> types = new ArrayList<>();
        for (String configured : defaultResources) {
            String type = configured == null ? "" : configured.trim();
            if (type.isEmpty())
                continue;
            if (!NONCLINICAL_RESOURCES.contains(type) && !CLINICAL_RESOURCES.contains(type))
                throw new IllegalStateException("Unsupported resource type at formal publication boundary: " + type);
            if (!types.contains(type))
                types.add(type);
        }
        return types;
    }

    private List<Bundle> collect(IGenericClient local, List<String> types, Instant from, Instant through) {
        DateRangeParam window = new DateRangeParam().setUpperBoundInclusive(Date.from(through));
        if (from != null)
            window.setLowerBoundInclusive(Date.from(from));
        List<Bundle> transactions = new ArrayList<>();
        Bundle combined = transaction();
        for (String type : types) {
            if (CLINICAL_RESOURCES.contains(type))
                continue;
            Bundle page = local.search().forResource(type).lastUpdated(window).returnBundle(Bundle.class).execute();
            Set<String> visited = new HashSet<>();
            while (page != null) {
                if (page.getType() != Bundle.BundleType.SEARCHSET)
                    throw new IllegalStateException("FHIR export requires a search-result bundle");
                Bundle converted = transaction();
                for (var entry : page.getEntry()) {
                    Resource resource = entry.getResource();
                    if (entry.hasRequest() || resource == null || !type.equals(resource.fhirType()))
                        throw new IllegalStateException("Unexpected resource in FHIR export search results");
                    assertNonclinical(resource);
                    if (resource instanceof DomainResource domain && domain.hasExtension(PLACEHOLDER)
                            && domain.getExtensionByUrl(PLACEHOLDER)
                                    .getValue() instanceof org.hl7.fhir.r4.model.BooleanType value
                            && value.booleanValue())
                        continue;
                    Resource copy = resource.copy();
                    removeLegacyReportOutputs(copy);
                    addPut(converted, copy);
                }
                if (singleTransaction)
                    combined.getEntry().addAll(converted.getEntry());
                else
                    transactions.add(converted);
                var next = page.getLink(IBaseBundle.LINK_NEXT);
                if (next == null)
                    break;
                if (!next.hasUrl() || !visited.add(next.getUrl()))
                    throw new IllegalStateException("Invalid or cyclic FHIR export pagination");
                page = local.loadPage().next(page).execute();
                if (page == null)
                    throw new IllegalStateException("FHIR export pagination returned no bundle");
            }
            if (page == null)
                throw new IllegalStateException("FHIR export search returned no bundle");
        }
        if (singleTransaction)
            transactions.add(combined);
        return transactions;
    }

    private void assertNonclinical(Resource resource) {
        if (!NONCLINICAL_RESOURCES.contains(resource.fhirType()))
            throw new IllegalStateException("Clinical or unsupported nested resource cannot use legacy export");
        if (resource instanceof DomainResource domain)
            domain.getContained().forEach(this::assertNonclinical);
    }

    private static void removeLegacyReportOutputs(Resource resource) {
        if (resource instanceof Task task)
            task.setOutput(List.of()); // Legacy outputs reference mutable Analysis reports.
        if (resource instanceof DomainResource domain)
            domain.getContained().forEach(IssuedReportDataExportService::removeLegacyReportOutputs);
    }

    private static Bundle transaction() {
        return new Bundle().setType(Bundle.BundleType.TRANSACTION);
    }

    private static void addPut(Bundle transaction, Resource resource) {
        String id = resource.getIdElement().getIdPart();
        if (id == null || !id.matches("[A-Za-z0-9.-]{1,64}") || id.matches("[0-9]+"))
            throw new IllegalStateException("FHIR export requires a stable nonnumeric resource ID");
        transaction.addEntry().setResource(resource).getRequest().setMethod(Bundle.HTTPVerb.PUT)
                .setUrl(resource.fhirType() + "/" + id);
    }

    private static void send(IGenericClient remote, Bundle request) {
        Bundle response = remote.transaction().withBundle(request).execute();
        if (response == null || response.getType() != Bundle.BundleType.TRANSACTIONRESPONSE
                || response.getEntry().size() != request.getEntry().size())
            throw new IllegalStateException("FHIR transaction response is incomplete; delivery must be checked");
        for (var entry : response.getEntry()) {
            if (!entry.hasResponse() || !entry.getResponse().getStatus().matches("2[0-9]{2}( .*)?"))
                throw new IllegalStateException(
                        "FHIR transaction did not confirm every resource; delivery must be checked");
        }
    }

    private Future<DataExportStatus> completed(DataExportAttempt attempt, DataExportStatus status) {
        statuses.changeDataRequestAttemptStatus(attempt, status);
        return CompletableFuture.completedFuture(status);
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}

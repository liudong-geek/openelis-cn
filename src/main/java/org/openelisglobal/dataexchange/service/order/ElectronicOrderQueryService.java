package org.openelisglobal.dataexchange.service.order;

import ca.uhn.fhir.rest.client.api.IGenericClient;
import ca.uhn.fhir.rest.server.exceptions.ResourceNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.Coding;
import org.hl7.fhir.r4.model.Identifier;
import org.hl7.fhir.r4.model.ServiceRequest;
import org.hl7.fhir.r4.model.Task;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.ExternalOrderStatus;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.dataexchange.fhir.FhirUtil;
import org.openelisglobal.dataexchange.order.dao.ElectronicOrderDAO;
import org.openelisglobal.dataexchange.order.form.ElectronicOrderQueryPaging;
import org.openelisglobal.dataexchange.order.form.ElectronicOrderViewForm;
import org.openelisglobal.dataexchange.order.form.ElectronicOrderViewForm.SearchType;
import org.openelisglobal.dataexchange.order.valueholder.ElectronicOrder;
import org.openelisglobal.dataexchange.order.valueholder.ElectronicOrderDisplayItem;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.patient.service.PatientManagementAuthorizationService;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.statusofsample.service.StatusOfSampleService;
import org.openelisglobal.statusofsample.valueholder.StatusOfSample;
import org.openelisglobal.test.service.TestService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * CL-08 opt-in read contract. Every page is independently filtered; no session
 * result cache.
 */
@Service
public class ElectronicOrderQueryService {
    private final ElectronicOrderDAO orders;
    private final ElectronicOrderQueryAuthorizationService authorization;
    private final PatientManagementAuthorizationService entryAuthorization;
    private final IStatusService statusNames;
    private final StatusOfSampleService statuses;
    private final PatientService patients;
    private final SampleService samples;
    private final OrganizationService organizations;
    private final TestService tests;
    private final FhirUtil fhir;
    private final FhirConfig fhirConfig;

    public ElectronicOrderQueryService(ElectronicOrderDAO orders,
            ElectronicOrderQueryAuthorizationService authorization,
            PatientManagementAuthorizationService entryAuthorization, IStatusService statusNames,
            StatusOfSampleService statuses, PatientService patients, SampleService samples,
            OrganizationService organizations, TestService tests, FhirUtil fhir, FhirConfig fhirConfig) {
        this.orders = orders;
        this.authorization = authorization;
        this.entryAuthorization = entryAuthorization;
        this.statusNames = statusNames;
        this.statuses = statuses;
        this.patients = patients;
        this.samples = samples;
        this.organizations = organizations;
        this.tests = tests;
        this.fhir = fhir;
        this.fhirConfig = fhirConfig;
    }

    @Transactional(readOnly = true)
    public ElectronicOrderViewForm query(HttpServletRequest request, ElectronicOrderViewForm form) {
        String actor = authorization.requireRead(request);
        if (!"2".equals(form.getQueryVersion()))
            throw invalid();
        int page = form.getPage() == null ? 1 : form.getPage();
        int pageSize = form.getPageSize() == null ? 50 : form.getPageSize();
        if (page < 1 || !List.of(10, 20, 50, 100).contains(pageSize))
            throw invalid();
        if (form.getSearchType() == null)
            form.setSearchType(SearchType.DATE_STATUS);
        if (form.getTestIds() != null && !form.getTestIds().isEmpty())
            throw invalid();
        String keyword = clean(form.getSearchValue());
        if (form.getSearchType() == SearchType.IDENTIFIER
                && (keyword == null || keyword.length() > 255 || keyword.chars().anyMatch(Character::isISOControl)))
            throw invalid();
        if (form.getSearchType() == SearchType.DATE_STATUS && keyword != null)
            throw invalid();
        String first = clean(form.getStartDate());
        String last = clean(form.getEndDate());
        if (first == null)
            first = last;
        if (last == null)
            last = first;
        Timestamp start = null;
        Timestamp endExclusive = null;
        if (first != null) {
            LocalDate startDay = date(first), endDay = date(last);
            if (startDay.isAfter(endDay))
                throw invalid();
            start = Timestamp.valueOf(startDay.atStartOfDay());
            try {
                endExclusive = Timestamp.valueOf(endDay.plusDays(1).atStartOfDay());
            } catch (DateTimeException e) {
                throw invalid();
            }
        }
        boolean pending = form.getPendingOnly() == null || form.getPendingOnly();
        String filterStatus = clean(form.getStatusId());
        if (filterStatus != null && (!positiveId(filterStatus) || validStatus(filterStatus) == null))
            throw invalid();
        if (pending) {
            String entered = statusNames.getStatusID(ExternalOrderStatus.Entered);
            if (entered == null || statusCode(entered) != ExternalOrderStatus.Entered) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "eorder.statusUnavailable");
            }
            if (filterStatus != null && !entered.equals(filterStatus))
                throw invalid();
            filterStatus = entered;
        }
        LinkedHashSet<String> warningCodes = new LinkedHashSet<>();
        List<String> identifiers = null;
        if (keyword != null) {
            LinkedHashSet<String> values = new LinkedHashSet<>();
            values.add(keyword.toLowerCase(Locale.ROOT));
            try {
                Bundle bundle = client().search().forResource(ServiceRequest.class)
                        .where(ServiceRequest.IDENTIFIER.exactly().code(keyword)).returnBundle(Bundle.class).execute();
                for (Bundle.BundleEntryComponent entry : bundle.getEntry()) {
                    if (entry.getResource() instanceof ServiceRequest serviceRequest) {
                        if (serviceRequest.hasIdElement())
                            values.add(serviceRequest.getIdElement().getIdPart().toLowerCase(Locale.ROOT));
                        String imported = importedBusinessId(serviceRequest);
                        if (imported != null)
                            values.add(imported.toLowerCase(Locale.ROOT));
                    }
                }
                if (bundle.getLink("next") != null)
                    warningCodes.add("FHIR_SEARCH_INCOMPLETE");
            } catch (RuntimeException e) {
                warningCodes.add("FHIR_SEARCH_UNAVAILABLE");
                logWarning("FHIR_SEARCH_UNAVAILABLE");
            }
            identifiers = new ArrayList<>(values);
        }
        List<ElectronicOrder> matches = orders.searchElectronicOrderQuery(start, endExclusive, filterStatus,
                identifiers, keyword == null ? null : keyword.toLowerCase(Locale.ROOT));
        int total = matches.size();
        int pages = Math.max(1, (int) Math.ceil((double) total / pageSize));
        if (page > pages)
            throw invalid();
        boolean canReceive = entryAuthorization.canCreate(request, actor) && entryAuthorization.canEdit(request, actor);
        int offset = (page - 1) * pageSize;
        List<ElectronicOrderDisplayItem> rows = new ArrayList<>();
        for (ElectronicOrder order : matches.subList(Math.min(offset, total), Math.min(offset + pageSize, total))) {
            rows.add(display(order, canReceive, form.getUseAllInfo()));
        }
        ElectronicOrderQueryPaging paging = new ElectronicOrderQueryPaging();
        paging.setCurrentPage(Integer.toString(page));
        paging.setTotalPages(Integer.toString(pages));
        paging.setTotalResults(total);
        paging.setPageSize(pageSize);
        form.setPaging(paging);
        form.seteOrders(rows);
        form.setCurrentUserId(actor);
        form.setCanReceive(canReceive);
        form.setPage(page);
        form.setPageSize(pageSize);
        form.setPendingOnly(pending);
        form.setStatusId(filterStatus);
        form.setWarningCodes(new ArrayList<>(warningCodes));
        form.setSearchFinished(true);
        List<IdValuePair> choices = new ArrayList<>();
        for (StatusOfSample status : statuses.getAllMatching("statusType", "EXTERNAL_ORDER")) {
            if (status != null && statusCode(status.getId()) != null)
                choices.add(new IdValuePair(status.getId(), status.getDefaultLocalizedName()));
        }
        form.setStatusSelectionList(choices);
        return form;
    }

    private ElectronicOrderDisplayItem display(ElectronicOrder order, boolean permission, boolean details) {
        ElectronicOrderDisplayItem item = new ElectronicOrderDisplayItem();
        LinkedHashSet<String> warnings = new LinkedHashSet<>();
        item.setElectronicOrderId(order.getId());
        item.setExternalOrderId(order.getExternalId());
        item.setPriority(order.getPriority());
        item.setStatusId(order.getStatusId());
        ExternalOrderStatus state = statusCode(order.getStatusId());
        item.setStatusCode(state == null ? "UNKNOWN" : switch (state) {
        case Entered -> "ENTERED";
        case Cancelled -> "CANCELLED";
        case Realized -> "REALIZED";
        case NonConforming -> "NON_CONFORMING";
        case AwaitingSpecimen -> "AWAITING_SPECIMEN";
        });
        StatusOfSample status = validStatus(order.getStatusId());
        item.setStatus(status == null ? null : status.getDefaultLocalizedName());
        if (order.getOrderTimestamp() != null)
            item.setRequestDateDisplay(DateUtil.formatDateAsText(order.getOrderTimestamp()));
        boolean localPatientIdentity = false;
        try {
            var patient = order.getPatient();
            if (patient == null)
                warnings.add("PATIENT_MISSING");
            else {
                localPatientIdentity = positiveId(patient.getId()) && patient.getPerson() != null
                        && positiveId(patient.getPerson().getId());
                item.setPatientNationalId(patient.getNationalId());
                item.setSubjectNumber(patients.getSubjectNumber(patient));
                if (patient.getPerson() == null)
                    warnings.add("LOCAL_DATA_INCOMPLETE");
                else {
                    item.setPatientLastName(patient.getPerson().getLastName());
                    item.setPatientFirstName(patient.getPerson().getFirstName());
                }
            }
        } catch (RuntimeException e) {
            warnings.add("LOCAL_DATA_INCOMPLETE");
            logWarning("LOCAL_DATA_INCOMPLETE");
        }
        var sample = samples.getSampleByReferringId(order.getExternalId());
        if (sample != null)
            item.setLabNumber(sample.getAccessionNumber());
        boolean taskValid = false;
        String focusId = null;
        try {
            Task task = fhir.getFhirParser().parseResource(Task.class, order.getData());
            taskValid = task != null && task.hasFocus()
                    && "ServiceRequest".equals(task.getFocus().getReferenceElement().getResourceType())
                    && task.getFocus().getReferenceElement().hasIdPart();
            if (!taskValid)
                warnings.add("TASK_DATA_UNAVAILABLE");
            else
                focusId = task.getFocus().getReferenceElement().getIdPart();
            if (task.hasAuthoredOn())
                item.setRequestDateDisplay(DateUtil.formatDateAsText(task.getAuthoredOn()));
            var organization = organizations.getOrganizationByFhirId(
                    task.getRestriction().getRecipientFirstRep().getReferenceElement().getIdPart());
            if (organization == null && task.hasLocation())
                organization = organizations
                        .getOrganizationByFhirId(task.getLocation().getReferenceElement().getIdPart());
            if (organization != null)
                item.setRequestingFacility(organization.getOrganizationName());
        } catch (RuntimeException e) {
            warnings.add("TASK_DATA_UNAVAILABLE");
            logWarning("TASK_DATA_UNAVAILABLE");
            // The existing Chinese showcase stores ServiceRequest rather than Task.
            // Read its own fields without inventing Task identity or receive capability.
            try {
                var stored = fhir.getFhirParser().parseResource(order.getData());
                if (stored instanceof ServiceRequest serviceRequest && serviceRequest.hasAuthoredOn()) {
                    item.setRequestDateDisplay(DateUtil.formatDateAsText(serviceRequest.getAuthoredOn()));
                }
            } catch (RuntimeException invalidStoredResource) {
                // The stable Task warning already describes this incomplete source.
            }
        }
        boolean identity = positiveId(order.getId()) && clean(order.getExternalId()) != null
                && order.getExternalId().length() <= 60
                && order.getExternalId().chars().noneMatch(Character::isISOControl);
        String reason = !permission ? "NO_RECEIVE_PERMISSION"
                : state == null ? "UNKNOWN_STATUS"
                        : state != ExternalOrderStatus.Entered ? "NOT_PENDING"
                                : !identity ? "INVALID_IDENTITY"
                                        : sample != null ? "LINKED_LOCAL_ORDER"
                                                : !taskValid || !localPatientIdentity ? "INCOMPLETE_ORDER_DATA" : null;
        if (reason == null) {
            List<ElectronicOrder> sameExternalId = orders.getElectronicOrdersByExternalId(order.getExternalId());
            if (sameExternalId.size() != 1 || !Objects.equals(order.getId(), sameExternalId.get(0).getId()))
                reason = "AMBIGUOUS_EXTERNAL_ID";
        }
        item.setCanReceive(reason == null);
        item.setActionUnavailableReason(reason);
        if (details && taskValid) {
            if (enrich(item, warnings, focusId)) {
                item.setCanReceive(false);
                item.setActionUnavailableReason("INCOMPLETE_ORDER_DATA");
                item.setRequestingFacility(null);
                item.setRequestDateDisplay(order.getOrderTimestamp() == null ? null
                        : DateUtil.formatDateAsText(order.getOrderTimestamp()));
            }
        } else if (taskValid) {
            // Complete local identities allow entering an explicit manual review form.
            // This flag never asserts that the external source identity was verified.
            warnings.add("SOURCE_IDENTITY_UNCONFIRMED");
        }
        item.setWarningCodes(new ArrayList<>(warnings));
        item.setWarnings(warnings.stream().map(code -> "eorder.warning." + code).toList());
        return item;
    }

    private boolean enrich(ElectronicOrderDisplayItem item, LinkedHashSet<String> warnings, String focusId) {
        boolean sourceConfirmed = false;
        try {
            IGenericClient client = client();
            ServiceRequest request = client.read().resource(ServiceRequest.class).withId(focusId).execute();
            String imported = importedBusinessId(request);
            if (imported == null) {
                warnings.add("SOURCE_IDENTITY_UNCONFIRMED");
                return false;
            }
            if (!Objects.equals(imported, item.getExternalOrderId())) {
                warnings.add("SOURCE_IDENTITY_MISMATCH");
                return true;
            }
            sourceConfirmed = true;
            if (request.hasRequisition())
                item.setReferringLabNumber(request.getRequisition().getValue());
            for (Coding coding : request.getCode().getCoding()) {
                if ("http://loinc.org".equalsIgnoreCase(coding.getSystem())) {
                    var matches = tests.getActiveTestsByLoinc(coding.getCode());
                    if (!matches.isEmpty()) {
                        item.setTestName(matches.get(0).getLocalizedName());
                        break;
                    }
                }
            }
            String patientId = request.getSubject().getReferenceElement().getIdPart();
            org.hl7.fhir.r4.model.Patient patient = client.read().resource(org.hl7.fhir.r4.model.Patient.class)
                    .withId(patientId).execute();
            for (Identifier identifier : patient.getIdentifier()) {
                if ("passport".equals(identifier.getSystem()))
                    item.setPassportNumber(identifier.getValue());
                if ((fhirConfig.getOeFhirSystem() + "/pat_subjectNumber").equals(identifier.getSystem()))
                    item.setSubjectNumber(identifier.getValue());
            }
        } catch (ResourceNotFoundException e) {
            warnings.add("FHIR_RESOURCE_NOT_FOUND");
            logWarning("FHIR_RESOURCE_NOT_FOUND");
            if (!sourceConfirmed)
                warnings.add("SOURCE_IDENTITY_UNCONFIRMED");
        } catch (RuntimeException e) {
            warnings.add("FHIR_DETAILS_UNAVAILABLE");
            logWarning("FHIR_DETAILS_UNAVAILABLE");
            if (!sourceConfirmed)
                warnings.add("SOURCE_IDENTITY_UNCONFIRMED");
        }
        return false;
    }

    private String importedBusinessId(ServiceRequest request) {
        String value = request == null || !request.hasIdentifier() ? null : request.getIdentifierFirstRep().getValue();
        return clean(value) == null ? null : value.length() > 60 ? value.substring(value.length() - 60) : value;
    }

    private IGenericClient client() {
        return fhir.getFhirClient(fhirConfig.getLocalFhirStorePath());
    }

    private StatusOfSample validStatus(String id) {
        if (!positiveId(id))
            return null;
        StatusOfSample status = statuses.get(id);
        return status != null && id.equals(status.getId()) && "EXTERNAL_ORDER".equals(status.getStatusType())
                && "Y".equalsIgnoreCase(status.getIsActive()) ? status : null;
    }

    private ExternalOrderStatus statusCode(String id) {
        StatusOfSample status = validStatus(id);
        ExternalOrderStatus code = statusNames.getExternalOrderStatusForID(id);
        return status != null && code != null && code.name().equals(status.getStatusOfSampleName()) ? code : null;
    }

    private LocalDate date(String value) {
        try {
            return LocalDate.parse(value, DateTimeFormatter.ofPattern(DateUtil.getDateFormat().replace("yyyy", "uuuu"))
                    .withResolverStyle(ResolverStyle.STRICT));
        } catch (DateTimeException e) {
            throw invalid();
        }
    }

    private boolean positiveId(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,9}"))
            return false;
        try {
            return Integer.parseInt(value) > 0;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private String clean(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    private ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "error.validation");
    }

    private void logWarning(String code) {
        LogEvent.logWarn(getClass().getSimpleName(), "query", code);
    }
}

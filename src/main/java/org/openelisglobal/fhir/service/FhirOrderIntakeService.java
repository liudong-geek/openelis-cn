package org.openelisglobal.fhir.service;

import ca.uhn.fhir.context.FhirContext;
import ca.uhn.fhir.rest.api.MethodOutcome;
import ca.uhn.fhir.rest.server.exceptions.ForbiddenOperationException;
import ca.uhn.fhir.rest.server.exceptions.ResourceVersionConflictException;
import ca.uhn.fhir.rest.server.exceptions.UnprocessableEntityException;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import org.hl7.fhir.r4.model.ServiceRequest;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.fhir.dao.FhirIntakeReceiptDAO;
import org.openelisglobal.fhir.dao.FhirWriteLockDAO;
import org.openelisglobal.fhir.providers.FhirProviderUtils;
import org.openelisglobal.fhir.valueholder.FhirIntakeReceipt;
import org.openelisglobal.patient.action.IPatientUpdate.PatientUpdateStatus;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.sample.action.util.SamplePatientUpdateData;
import org.openelisglobal.sample.event.SamplePatientUpdateDataCreatedEvent;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.service.PatientManagementUpdate;
import org.openelisglobal.sample.service.SamplePatientEntryService;
import org.openelisglobal.sample.util.AccessionNumberUtil;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.sampletyperequest.service.SampleTypeRequestService;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.BindException;

/**
 * Atomic external-order intake using the same patient/order/request services as
 * the UI.
 */
@Service
public class FhirOrderIntakeService {
    private final FhirOrderIntakeValidator validator;
    private final FhirWriteLockDAO locks;
    private final FhirIntakeReceiptDAO receipts;
    private final FhirContext context;
    private final SamplePatientEntryService entries;
    private final SampleTypeRequestService requests;
    private final ObjectProvider<PatientManagementUpdate> patientUpdates;
    private final UserRoleService roles;
    private final AnalysisService analyses;

    public FhirOrderIntakeService(FhirOrderIntakeValidator validator, FhirWriteLockDAO locks,
            FhirIntakeReceiptDAO receipts, FhirContext context, SamplePatientEntryService entries,
            SampleTypeRequestService requests, ObjectProvider<PatientManagementUpdate> patientUpdates,
            UserRoleService roles, AnalysisService analyses) {
        this.validator = validator;
        this.locks = locks;
        this.receipts = receipts;
        this.context = context;
        this.entries = entries;
        this.requests = requests;
        this.patientUpdates = patientUpdates;
        this.roles = roles;
        this.analyses = analyses;
    }

    @Transactional(rollbackFor = Exception.class)
    public MethodOutcome create(ServiceRequest input, HttpServletRequest request) throws Exception {
        String userId = FhirProviderUtils.getSysUserId(request);
        if (userId == null || !(roles.userInRole(userId, Constants.ROLE_GLOBAL_ADMIN)
                || roles.userInRole(userId, Constants.ROLE_RECEPTION))) {
            throw new ForbiddenOperationException("接收检验申请需要检验登记权限");
        }
        var resolved = validator.validate(input);
        String json = context.newJsonParser().encodeResourceToString(input);
        if (json.length() > 65536)
            throw new UnprocessableEntityException("检验申请报文过大");
        String hash = HexFormat.of()
                .formatHex(MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8)));
        locks.lock("fhir-intake-" + resolved.requestId());
        var existing = receipts.find(resolved.requestId());
        if (existing != null) {
            if (!hash.equals(existing.getPayloadHash())) {
                throw new ResourceVersionConflictException("该来源申请已接收，但报文内容发生变化；请走申请更正流程");
            }
            return FhirProviderUtils.buildUpdateOutcome(toResource(existing));
        }

        var order = resolved.order();
        String date = DateUtil.getCurrentDateAsText();
        String time = java.time.LocalTime.now().format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"));
        var generator = AccessionNumberUtil.getMainAccessionNumberGenerator();
        if (generator == null)
            throw new IllegalStateException("实验室编号规则未配置");
        order.setLabNo(generator.getNextAccessionNumber(null, true));
        order.setReceivedDateForDisplay(date);
        order.setReceivedTime(time);
        // Subsequent collection uses the same mandatory order-date field as
        // interactive entry. Do not leave an API-created order impossible to collect.
        order.setRequestDate(input.hasAuthoredOn() ? DateUtil.formatDateAsText(input.getAuthoredOn()) : date);
        order.setRequesterSampleID(input.getIdentifierFirstRep().getValue());
        order.setPriority(!input.hasPriority() ? OrderPriority.ROUTINE : switch (input.getPriority()) {
        case STAT -> OrderPriority.STAT;
        case ASAP, URGENT -> OrderPriority.TIMED;
        default -> OrderPriority.ROUTINE;
        });
        var patientInfo = new PatientManagementInfo();
        patientInfo.setPatientPK(resolved.patient().getId());
        patientInfo.setPatientUpdateStatus(PatientUpdateStatus.NO_ACTION);
        var form = new SamplePatientEntryForm();
        form.setSampleOrderItems(order);
        form.setPatientProperties(patientInfo);
        form.setOrderEntryOnly(true);
        form.setSampleXML("<samples/>");
        var update = new SamplePatientUpdateData(userId);
        update.setAccessionNumber(order.getLabNo());
        update.setPatientId(resolved.patient().getId());
        update.setSavePatient(false);
        update.setPatientErrors(new BindException(patientInfo, "patientInfo"));
        update.initializeRequester(order);
        update.setPriority(order.getPriority());
        update.initSampleData(form.getSampleXML(), date + " " + time, false, order);
        var errors = new BindException(form, "form");
        update.validateSample(errors, false);
        if (errors.hasErrors())
            throw new UnprocessableEntityException("检验申请未通过业务校验：" + errors.getAllErrors());
        var patientUpdate = patientUpdates.getObject();
        patientUpdate.setSysUserIdFromRequest(request);
        patientUpdate.setPatientUpdateStatus(patientInfo);
        entries.persistData(update, patientUpdate, patientInfo, form, request);

        // No physical specimen or result exists until the operator collects/receives
        // it.
        SampleTypeRequest sampleRequest = new SampleTypeRequest();
        sampleRequest.setSample(update.getSample());
        sampleRequest.setTypeOfSample(resolved.sampleType());
        sampleRequest.setRequestedTests(resolved.test().getId());
        sampleRequest.setRequestedPanels("");
        sampleRequest.setCreatedDate(DateUtil.getNowAsTimestamp());
        sampleRequest.setSysUserId(userId);
        requests.insert(sampleRequest);

        var receipt = new FhirIntakeReceipt();
        receipt.setId(resolved.requestId());
        receipt.setSourceSystem(input.getIdentifierFirstRep().getSystem());
        receipt.setExternalId(input.getIdentifierFirstRep().getValue());
        receipt.setPayloadHash(hash);
        receipt.setPayloadJson(json);
        receipt.setSample(update.getSample());
        receipt.setTest(resolved.test());
        receipt.setCreatedBy(userId);
        receipt.setCreatedAt(Instant.now());
        receipts.insert(receipt);
        return FhirProviderUtils.buildCreateOutcome(toResource(receipt));
    }

    @Transactional(readOnly = true)
    public ServiceRequest readPending(UUID id) {
        var receipt = receipts.find(id);
        return receipt == null ? null : toResource(receipt);
    }

    @Transactional(readOnly = true)
    public ServiceRequest readCollected(UUID id, ServiceRequest current) {
        var receipt = receipts.find(id);
        if (receipt == null)
            return current;
        // Keep the sender's identity and mapping stable after physical collection.
        // Only workflow state/specimen references come from the actual analysis.
        var resource = toResource(receipt);
        resource.setStatus(current.getStatus());
        resource.setSpecimen(current.getSpecimen());
        resource.getContained().clear();
        return resource;
    }

    private ServiceRequest toResource(FhirIntakeReceipt receipt) {
        var resource = context.newJsonParser().parseResource(ServiceRequest.class, receipt.getPayloadJson());
        resource.setId("ServiceRequest/" + receipt.getId());
        resource.addIdentifier().setSystem("http://openelis-global.org/accession-number")
                .setValue(receipt.getSample().getAccessionNumber());
        if (!resource.hasAuthoredOn() && receipt.getCreatedAt() != null)
            resource.setAuthoredOn(java.util.Date.from(receipt.getCreatedAt()));
        return resource;
    }

    @EventListener
    @Transactional
    public void linkCollectedAnalyses(SamplePatientUpdateDataCreatedEvent event) {
        var update = event.getUpdateData();
        if (update.getSample() == null || update.getSample().getId() == null)
            return;
        for (var receipt : receipts.findBySample(update.getSample().getId())) {
            var matching = update.getSampleItemsTests().stream().flatMap(item -> item.analysises.stream())
                    .filter(analysis -> receipt.getTest().getId().equals(analysis.getTest().getId())).toList();
            if (matching.size() > 1)
                throw new IllegalStateException("外部申请对应多个检验任务，不能自动关联");
            if (matching.size() == 1 && !receipt.getId().equals(matching.getFirst().getFhirUuid())) {
                var analysis = matching.getFirst();
                analysis.setFhirUuid(receipt.getId());
                analysis.setSysUserId(update.getCurrentUserId());
                analyses.update(analysis);
            }
        }
    }
}

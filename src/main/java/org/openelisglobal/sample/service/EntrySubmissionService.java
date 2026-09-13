package org.openelisglobal.sample.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.labelpreset.dao.OrderLabelRequestDAO;
import org.openelisglobal.patient.action.IPatientUpdate.PatientUpdateStatus;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.sample.dao.EntrySubmissionReceiptDAO;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.validator.SamplePatientEntryFormValidator;
import org.openelisglobal.sample.valueholder.EntrySubmissionReceipt;
import org.openelisglobal.sampletyperequest.dto.SampleTypeRequestDTO;
import org.openelisglobal.sampletyperequest.service.SampleTypeRequestService;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.systemuser.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.validation.BindingResult;

/** Coordinates a durable first-entry receipt with the existing entry transaction. */
@Service
public class EntrySubmissionService {
    @Autowired private OrderEntryActorGuard actors;
    @Autowired private EntrySubmissionReceiptDAO receipts;
    @Autowired private SamplePatientEntryService entries;
    @Autowired private SamplePatientEntryFormValidator validator;
    @Autowired private SampleService samples;
    @Autowired private UserService users;
    @Autowired private OrderLabelRequestDAO labels;
    @Autowired private SampleTypeRequestService specimenRequests;
    @Autowired private PatientService patients;
    private final ObjectMapper json = new ObjectMapper();

    public record Result(boolean success, boolean replayed, JsonNode receipt) { }

    @Transactional(rollbackFor = Exception.class, timeout = 45)
    public Result submit(EntrySubmissionCommand command, SamplePatientEntryForm form,
            HttpServletRequest request, BindingResult errors) throws Exception {
        var actor = actors.bind(request);
        if (EntrySubmissionCommand.fromRequest(request, form) != command) { throw invalid(); }
        var previous = receipts.find(command.key());
        if (previous != null) {
            // Deliberately before current-date/master-data/duplicate-number checks.
            requireOwner(previous, actor.userId());
            if (!EntrySubmissionCommand.HASH_VERSION.equals(previous.getHashVersion())
                    || !command.fingerprint().equals(previous.getRequestHash())) {
                throw new EntrySubmissionException(409, "ENTRY_SUBMISSION_CHANGED",
                        "该保存标识已用于另一份内容，请先核对原保存结果，不要重新开单。");
            }
            return read(previous, request, actor);
        }
        if (form.getRequestedSpecimens() == null || form.getRequestedSpecimens().isEmpty()
                || !form.isOrderEntryOnly() || form.isCollectionOnly()) { throw invalid(); }
        List<SampleTypeRequestDTO> requested = new ArrayList<>();
        for (var tube : form.getRequestedSpecimens()) {
            if (tube == null) { throw invalid(); }
            requested.add(json.convertValue(tube, SampleTypeRequestDTO.class));
        }
        var expectedLabels = expectedLabels(form);
        var expectedPatient = expectedPatient(form);
        var receipt = EntrySubmissionReceipt.claim(command.key(), actor.userId(), command.fingerprint());
        receipts.claim(receipt);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void beforeCommit(boolean readOnly) {
                if (receipt.getResponseJson() == null) { throw new IllegalStateException("Incomplete entry receipt"); }
            }
        });
        validator.validate(form, errors);
        entries.saveEntry(form, request, errors);
        ObjectNode snapshot = snapshot(receipt, form, requested, expectedLabels, expectedPatient);
        receipts.complete(receipt, json.writeValueAsString(snapshot));
        actors.requireUnchanged(request, actor);
        return new Result(true, false, snapshot.deepCopy());
    }

    @Transactional(readOnly = true, timeout = 20)
    public Result recover(String key, HttpServletRequest request) throws Exception {
        var actor = actors.bind(request);
        var receipt = receipts.find(EntrySubmissionCommand.validateKey(key));
        if (receipt == null) {
            throw new EntrySubmissionException(404, "ENTRY_SUBMISSION_NOT_FOUND",
                    "暂未查到已提交的保存记录；原请求可能仍在处理，请保留原保存标识，不要重新开单。");
        }
        requireOwner(receipt, actor.userId());
        return read(receipt, request, actor);
    }

    private Result read(EntrySubmissionReceipt receipt, HttpServletRequest request,
            OrderEntryActorGuard.BoundActor actor) throws Exception {
        if (!EntrySubmissionCommand.HASH_VERSION.equals(receipt.getHashVersion())
                || receipt.getResponseJson() == null || receipt.getCreatedAt() == null) { throw incomplete(); }
        JsonNode snapshot = json.readTree(receipt.getResponseJson());
        if (snapshot == null || !snapshot.isObject() || !snapshot.path("version").isIntegralNumber()
                || !snapshot.path("version").canConvertToInt() || snapshot.path("version").intValue() != 1
                || !receipt.getId().equals(snapshot.path("submissionId").asText())
                || !receipt.getRequestHash().equals(snapshot.path("requestHash").asText())
                || !receipt.getHashVersion().equals(snapshot.path("hashVersion").asText())
                || !receipt.getCreatedAt().toString().equals(snapshot.path("createdAt").asText())) { throw incomplete(); }
        Set<String> tests = validateSnapshot(snapshot);
        Set<String> allowed = new HashSet<>();
        var available = users.getAllDisplayUserTestsByLabUnit(actor.userId(), Constants.ROLE_RECEPTION);
        if (available != null) {
            available.stream().filter(item -> item != null).forEach(item -> allowed.add(item.getId()));
        }
        if (!allowed.containsAll(tests)) {
            throw new AccessDeniedException("当前登记权限不足，无法查看本次申请保存记录。");
        }
        actors.requireUnchanged(request, actor);
        return new Result(true, true, snapshot.deepCopy());
    }

    private record PatientExpectation(boolean environmental, String existingId) { }

    private PatientExpectation expectedPatient(SamplePatientEntryForm form) {
        var order = form.getSampleOrderItems();
        if (order == null) { throw invalid(); }
        var info = form.getPatientProperties();
        String original = info == null ? "" : empty(info.getPatientPK());
        boolean environmental = "environmental".equals(order.getEnvironmentalFieldAsString("workflowType"));
        if (environmental) {
            if (!original.isEmpty() || order.getIsEQASample()) { throw invalid(); }
            return new PatientExpectation(true, null);
        }
        if (info == null) { throw invalid(); }
        if (order.getIsEQASample()) {
            var eqaPatient = patients.getPatientByNationalId("NULL");
            if (eqaPatient != null) {
                if (!id(eqaPatient.getId())) { throw incomplete(); }
                return new PatientExpectation(false, eqaPatient.getId());
            }
        }
        if (info.getPatientUpdateStatus() == PatientUpdateStatus.ADD) {
            return new PatientExpectation(false, null);
        }
        if ((info.getPatientUpdateStatus() != PatientUpdateStatus.NO_ACTION
                && info.getPatientUpdateStatus() != PatientUpdateStatus.UPDATE) || !id(original)) { throw invalid(); }
        return new PatientExpectation(false, original);
    }

    private ObjectNode snapshot(EntrySubmissionReceipt receipt, SamplePatientEntryForm form,
            List<SampleTypeRequestDTO> requested, Map<Integer, Integer> originalLabels,
            PatientExpectation expectedPatient) {
        var order = form.getSampleOrderItems();
        var sample = order != null && id(order.getSampleId()) ? samples.get(order.getSampleId()) : null;
        if (sample == null || !sample.getId().equals(order.getSampleId())
                || sample.getAccessionNumber() == null || sample.getAccessionNumber().isBlank()
                || !sample.getAccessionNumber().equals(order.getLabNo())) { throw incomplete(); }
        boolean environmental = "environmental".equals(order.getEnvironmentalFieldAsString("workflowType"));
        if (environmental != expectedPatient.environmental()) { throw incomplete(); }
        var patient = samples.getPatient(sample);
        String finalPatientId = form.getPatientProperties() == null ? "" : empty(form.getPatientProperties().getPatientPK());
        if (environmental) {
            if (patient != null || !finalPatientId.isEmpty()) { throw incomplete(); }
        } else if (patient == null || !id(patient.getId()) || !patient.getId().equals(finalPatientId)
                || (expectedPatient.existingId() != null && !expectedPatient.existingId().equals(finalPatientId))) {
            throw incomplete();
        }
        var saved = form.getRequestedSpecimens();
        if (saved == null || saved.size() != requested.size()) { throw incomplete(); }
        var storedRows = specimenRequests.getRequestsBySampleId(sample.getId());
        if (storedRows == null || storedRows.size() != requested.size()) { throw incomplete(); }
        Map<String, SampleTypeRequestDTO> actualRows = new LinkedHashMap<>();
        for (var row : storedRows) {
            if (row == null || row.getId() == null || row.getId() <= 0
                    || actualRows.putIfAbsent(row.getId().toString(), storedTube(row)) != null) { throw incomplete(); }
        }
        List<SampleTypeRequestDTO> verified = new ArrayList<>();
        for (int i = 0; i < saved.size(); i++) {
            var returned = saved.get(i);
            var actual = returned == null ? null : actualRows.remove(returned.getId());
            if (actual == null || !sameTubeContent(requested.get(i), actual) || !sameTubeContent(returned, actual)
                    || !java.util.Objects.equals(returned.getSampleId(), actual.getSampleId())
                    || !java.util.Objects.equals(returned.getSortOrder(), actual.getSortOrder())
                    || !java.util.Objects.equals(returned.getStatus(), actual.getStatus())
                    || !empty(returned.getSampleItemId()).equals(empty(actual.getSampleItemId()))) {
                throw incomplete();
            }
            verified.add(actual);
        }
        if (!actualRows.isEmpty()) { throw incomplete(); }
        ObjectNode output = json.createObjectNode();
        output.put("version", 1).put("submissionId", receipt.getId()).put("requestHash", receipt.getRequestHash())
                .put("hashVersion", receipt.getHashVersion()).put("createdAt", receipt.getCreatedAt().toString())
                .put("sampleId", sample.getId()).put("labNo", sample.getAccessionNumber())
                .put("workflowType", environmental ? "environmental" : "clinical");
        if (patient != null) { output.put("patientId", patient.getId()); }
        output.set("requestedSpecimens", json.valueToTree(verified));
        var outputLabels = output.putArray("labelRequests");
        Map<Integer, Integer> expectedLabels = new LinkedHashMap<>(originalLabels);
        var savedLabels = labels.listByParentSampleId(sample.getId());
        if (savedLabels == null || savedLabels.size() != expectedLabels.size()) { throw incomplete(); }
        Set<Integer> labelIds = new HashSet<>();
        for (var label : savedLabels) {
            if (label == null || label.getId() == null || label.getId() <= 0 || !labelIds.add(label.getId())
                    || label.getParentSample() == null || !sample.getId().equals(label.getParentSample().getId())
                    || label.getSampleItem() != null || label.getPreset() == null
                    || !java.util.Objects.equals(expectedLabels.remove(label.getPreset().getId()), label.getQty())
                    || label.getQty() == null || label.getQty() <= 0) { throw incomplete(); }
            outputLabels.addObject().put("id", label.getId()).put("presetId", label.getPreset().getId())
                    .put("quantity", label.getQty());
        }
        if (!expectedLabels.isEmpty()) { throw incomplete(); }
        validateSnapshot(output);
        return output;
    }

    private static Map<Integer, Integer> expectedLabels(SamplePatientEntryForm form) {
        Map<Integer, Integer> result = new LinkedHashMap<>();
        if (form.getLabelPersistRequest() != null && form.getLabelPersistRequest().getOrderCells() != null) {
            Set<Integer> presets = new HashSet<>();
            for (var cell : form.getLabelPersistRequest().getOrderCells()) {
                if (cell == null || cell.getQty() == null || cell.getQty() < 0 || cell.getPresetId() == null
                        || cell.getPresetId() <= 0 || !presets.add(cell.getPresetId())) { throw invalid(); }
                if (cell.getQty() > 0) { result.put(cell.getPresetId(), cell.getQty()); }
            }
        }
        return result;
    }

    private static boolean sameTubeContent(SampleTypeRequestDTO expected, SampleTypeRequestDTO actual) {
        return java.util.Objects.equals(expected.getTypeOfSampleId(), actual.getTypeOfSampleId())
                && java.util.Objects.equals(expected.getRequestedQuantity(), actual.getRequestedQuantity())
                && empty(expected.getUnitOfMeasureId()).equals(empty(actual.getUnitOfMeasureId()))
                && ids(expected.getRequestedTests(), true).equals(ids(actual.getRequestedTests(), true))
                && ids(expected.getRequestedPanels(), false).equals(ids(actual.getRequestedPanels(), false));
    }

    private static SampleTypeRequestDTO storedTube(SampleTypeRequest row) {
        // Stable persisted facts only: no display-name lookup or mutable client echo.
        var result = new SampleTypeRequestDTO();
        result.setId(row.getId().toString());
        result.setSampleId(row.getSample() == null ? null : row.getSample().getId());
        result.setTypeOfSampleId(row.getTypeOfSample() == null ? null : row.getTypeOfSample().getId());
        result.setUnitOfMeasureId(row.getUnitOfMeasure() == null ? null : row.getUnitOfMeasure().getId());
        result.setSortOrder(row.getSortOrder()); result.setRequestedQuantity(row.getRequestedQuantity());
        result.setRequestedTests(row.getRequestedTests()); result.setRequestedPanels(row.getRequestedPanels());
        result.setStatus(row.getStatus() == null ? null : row.getStatus().name());
        result.setSampleItemId(row.getSampleItem() == null ? null : row.getSampleItem().getId());
        result.setCreatedDate(row.getCreatedDate() == null ? null : row.getCreatedDate().toString());
        return result;
    }

    private Set<String> validateSnapshot(JsonNode snapshot) {
        String sampleId = snapshot.path("sampleId").asText();
        String workflow = snapshot.path("workflowType").asText();
        if (!id(sampleId) || snapshot.path("labNo").asText().isBlank()
                || !("clinical".equals(workflow) || "environmental".equals(workflow))
                || ("clinical".equals(workflow) && !id(snapshot.path("patientId").asText()))
                || ("environmental".equals(workflow) && snapshot.has("patientId"))
                || !snapshot.path("labelRequests").isArray()) { throw incomplete(); }
        Set<Integer> labelIds = new HashSet<>();
        Set<Integer> presets = new HashSet<>();
        for (var label : snapshot.path("labelRequests")) {
            if (!positiveInteger(label.path("id")) || !positiveInteger(label.path("presetId"))
                    || !positiveInteger(label.path("quantity")) || !labelIds.add(label.path("id").asInt())
                    || !presets.add(label.path("presetId").asInt())) { throw incomplete(); }
        }
        var tubes = snapshot.path("requestedSpecimens");
        if (!tubes.isArray() || tubes.isEmpty()) { throw incomplete(); }
        Set<String> unique = new HashSet<>();
        Set<String> tests = new HashSet<>();
        for (int i = 0; i < tubes.size(); i++) {
            var tube = tubes.get(i);
            if (!id(tube.path("id").asText()) || !unique.add(tube.path("id").asText())
                    || !sampleId.equals(tube.path("sampleId").asText()) || !id(tube.path("typeOfSampleId").asText())
                    || !tube.path("sortOrder").isIntegralNumber() || tube.path("sortOrder").asInt() != i
                    || !tube.path("requestedQuantity").isNumber()
                    || !Double.isFinite(tube.path("requestedQuantity").asDouble())
                    || tube.path("requestedQuantity").asDouble() <= 0
                    || !"REQUESTED".equals(tube.path("status").asText())
                    || !tube.path("sampleItemId").asText("").isBlank()) { throw incomplete(); }
            tests.addAll(ids(tube.path("requestedTests").asText(), true));
            ids(tube.path("requestedPanels").asText(""), false);
        }
        return tests;
    }

    private static boolean positiveInteger(JsonNode value) {
        return value.isIntegralNumber() && value.canConvertToInt() && value.intValue() > 0;
    }

    private static Set<String> ids(String value, boolean required) {
        Set<String> result = new HashSet<>();
        if (value != null && !value.isBlank()) {
            for (String item : value.split(",", -1)) {
                if (!id(item.trim()) || !result.add(item.trim())) { throw incomplete(); }
            }
        }
        if (required && result.isEmpty()) { throw incomplete(); }
        return result;
    }
    private static String empty(String value) { return value == null || value.isBlank() ? "" : value; }
    private static boolean id(String value) { return value != null && value.matches("[1-9][0-9]*"); }
    private static void requireOwner(EntrySubmissionReceipt receipt, String actor) {
        if (!actor.equals(receipt.getCreatedBy())) { throw new AccessDeniedException("无法访问其他用户的申请保存记录。"); }
    }
    private static EntrySubmissionException invalid() {
        return new EntrySubmissionException(400, "ENTRY_SUBMISSION_INVALID", "整单保存需要完整标本列表，且只能用于首次新建申请。");
    }
    private static EntrySubmissionException incomplete() {
        return new EntrySubmissionException(409, "ENTRY_SUBMISSION_INCOMPLETE", "保存记录不完整，暂不能确认结果；请保留保存标识并联系管理员，不要重复开单。");
    }
}

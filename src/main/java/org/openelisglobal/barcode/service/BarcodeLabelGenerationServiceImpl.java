package org.openelisglobal.barcode.service;

import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.barcode.dao.BarcodeLabelGenerationDAO;
import org.openelisglobal.barcode.dto.BarcodeLabelGenerateRequest;
import org.openelisglobal.barcode.dto.BarcodeLabelGenerateResponse;
import org.openelisglobal.barcode.dto.BarcodeLabelGenerateResponse.GeneratedLabel;
import org.openelisglobal.barcode.exception.BarcodeLabelGenerationException;
import org.openelisglobal.barcode.labeltype.Label;
import org.openelisglobal.barcode.valueholder.BarcodeLabelInfo;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BarcodeLabelGenerationServiceImpl implements BarcodeLabelGenerationService {
    private final BarcodeLabelGenerationDAO dao;
    private final BarcodeLabelGenerationRenderer renderer;
    private final BarcodeLabelInfoService counts;
    private final AuditTrailService audit;
    private final ReferenceTablesService referenceTables;
    @Autowired private BarcodeLabelGenerationPermissionService permissions;

    public BarcodeLabelGenerationServiceImpl(BarcodeLabelGenerationDAO dao, BarcodeLabelGenerationRenderer renderer,
            BarcodeLabelInfoService counts, AuditTrailService audit, ReferenceTablesService referenceTables) {
        this.dao = dao;
        this.renderer = renderer;
        this.counts = counts;
        this.audit = audit;
        this.referenceTables = referenceTables;
    }

    @Override
    @Transactional(timeout = 45)
    public BarcodeLabelGenerateResponse generate(BarcodeLabelGenerateRequest request,
            BarcodeLabelGenerationPermissionService.BoundOperator expectedOperator) {
        var operator = permissions.bindCurrent(expectedOperator);
        String userId = operator.userId();
        if (!BarcodeLabelGenerateRequest.positiveId(userId)) {
            throw failure(401, "BARCODE_AUTH_REQUIRED");
        }
        if (request == null) {
            throw failure(400, "BARCODE_REQUEST_INVALID");
        }
        request.validate(Math.min(100, renderer.maximumRequestQuantity()));
        ReferenceTables auditConfiguration = referenceTables.getReferenceTableByName("BARCODE_LABEL_INFO");
        if (auditConfiguration == null || !"Y".equals(auditConfiguration.getKeepHistory())) {
            throw failure(409, "BARCODE_CONFIGURATION_INVALID");
        }
        Sample order = dao.lockOrder(request.orderId());
        if (order == null) {
            throw failure(404, "BARCODE_ORDER_NOT_FOUND");
        }
        if (!request.labNumber().equals(order.getAccessionNumber())) {
            throw failure(409, "BARCODE_IDENTIFIER_MISMATCH");
        }
        List<SampleItem> specimens = dao.lockSampleItems(order.getId());
        if (dao.isOrderBlocked(order.getId())) {
            throw failure(409, "BARCODE_ORDER_BLOCKED");
        }
        List<Patient> patients = dao.findClinicalPatients(order.getId());
        if (patients.size() != 1 || patients.get(0) == null || patients.get(0).getId() == null
                || patients.get(0).getPerson() == null || patients.get(0).getPerson().getId() == null
                || order.getReceivedTimestamp() == null) {
            throw failure(409, "BARCODE_CLINICAL_ORDER_REQUIRED");
        }
        Patient patient = patients.get(0);
        Map<String, SampleItem> byId = new HashMap<>();
        Map<String, Integer> sortOrderCounts = new HashMap<>();
        for (SampleItem specimen : specimens) {
            byId.put(specimen.getId(), specimen);
            sortOrderCounts.merge(specimen.getSortOrder() == null ? "" : specimen.getSortOrder(), 1, Integer::sum);
        }

        List<GeneratedLabel> manifest = new ArrayList<>();
        List<Label> labels = new ArrayList<>();
        List<CounterChange> changes = new ArrayList<>();
        int total = 0;
        for (var item : request.labels()) {
            Label label;
            String expectedBarcode = order.getAccessionNumber();
            if ("specimen".equals(item.type())) {
                SampleItem specimen = byId.get(item.sampleItemId());
                if (specimen == null || specimen.getSample() == null || !order.getId().equals(specimen.getSample().getId())
                        || specimen.isVoided() || specimen.isRejected() || specimen.getTypeOfSample() == null
                        || !validSortOrder(specimen.getSortOrder())
                        || sortOrderCounts.getOrDefault(specimen.getSortOrder(), 0) != 1
                        || !dao.isSpecimenEligible(specimen.getId())) {
                    throw failure(409, "BARCODE_SPECIMEN_INVALID");
                }
                expectedBarcode += "." + specimen.getSortOrder();
                label = renderer.createSpecimenLabel(patient, order, specimen);
            } else {
                label = renderer.createOrderLabel(patient, order);
            }
            if (label == null || !expectedBarcode.equals(label.getCode()) || expectedBarcode.length() > 30) {
                throw failure(409, "BARCODE_SPECIMEN_INVALID");
            }
            List<BarcodeLabelInfo> existing = dao.findCounters(expectedBarcode);
            if (existing == null || existing.size() > 1) {
                throw failure(409, "BARCODE_COUNTER_INVALID");
            }
            BarcodeLabelInfo counter = existing.isEmpty() ? null : existing.get(0);
            if (counter != null && (counter.getNumPrinted() < 0 || !expectedBarcode.equals(counter.getCode())
                    || counter.getType() != null && !item.type().equals(counter.getType()))) {
                throw failure(409, "BARCODE_COUNTER_INVALID");
            }
            int maximum = label.getMaxNumLabels();
            if (maximum < 0) {
                throw failure(409, "BARCODE_CONFIGURATION_INVALID");
            }
            int previous = counter == null ? 0 : counter.getNumPrinted();
            // Existing numprinted has NUMERIC(3,0) storage; never overflow it.
            int generated = Math.min(item.quantity(), Math.max(0, Math.min(maximum, 999) - previous));
            manifest.add(new GeneratedLabel(item.type(), item.sampleItemId(), expectedBarcode, item.quantity(), generated,
                    generated < item.quantity() ? "PRINT_LIMIT" : null));
            if (generated > 0) {
                label.setNumLabels(generated);
                labels.add(label);
                changes.add(new CounterChange(counter, expectedBarcode, item.type(), generated));
                total += generated;
            }
        }
        if (total == 0) {
            permissions.requireUnchanged(operator);
            return new BarcodeLabelGenerateResponse(order.getId(), order.getAccessionNumber(), List.copyOf(manifest), 0, null);
        }
        byte[] pdf;
        try {
            pdf = renderer.render(labels);
            if (pdf == null || pdf.length < 5 || pdf[0] != '%' || pdf[1] != 'P' || pdf[2] != 'D' || pdf[3] != 'F' || pdf[4] != '-') {
                throw failure(500, "BARCODE_GENERATION_FAILED");
            }
        } catch (RuntimeException failure) {
            throw failure(500, "BARCODE_GENERATION_FAILED");
        }
        // No mutation before complete rendering. Exceptions propagate out of the
        // service transaction; no catch-and-continue, retries, override or fake success.
        permissions.requireUnchanged(operator);
        for (CounterChange change : changes) {
            BarcodeLabelInfo counter = change.existing();
            BarcodeLabelInfo before = counter == null ? null : snapshot(counter);
            if (counter == null) {
                counter = new BarcodeLabelInfo();
                counter.setCode(change.barcode());
                counter.setType(change.type());
            }
            counter.setNumPrinted(counter.getNumPrinted() + change.quantity());
            counter.setSysUserId(userId);
            counts.save(counter);
            if (before == null) {
                audit.saveNewHistory(counter, userId, "BARCODE_LABEL_INFO");
            } else {
                audit.saveHistory(counter, before, userId, IActionConstants.AUDIT_TRAIL_UPDATE, "BARCODE_LABEL_INFO");
            }
        }
        dao.flush();
        permissions.requireUnchanged(operator);
        return new BarcodeLabelGenerateResponse(order.getId(), order.getAccessionNumber(), List.copyOf(manifest), total,
                Base64.getEncoder().encodeToString(pdf));
    }

    private static BarcodeLabelInfo snapshot(BarcodeLabelInfo value) {
        BarcodeLabelInfo copy = new BarcodeLabelInfo();
        copy.setId(value.getId());
        copy.setCode(value.getCode());
        copy.setType(value.getType());
        copy.setNumPrinted(value.getNumPrinted());
        copy.setLastupdated(value.getLastupdated());
        return copy;
    }

    private static boolean validSortOrder(String sortOrder) {
        return sortOrder != null && sortOrder.matches("[1-9][0-9]{0,4}");
    }

    private record CounterChange(BarcodeLabelInfo existing, String barcode, String type, int quantity) {
    }

    private static BarcodeLabelGenerationException failure(int status, String code) {
        return new BarcodeLabelGenerationException(status, code);
    }
}

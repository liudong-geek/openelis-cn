package org.openelisglobal.qachecklist.controller;

import jakarta.servlet.http.HttpServletRequest;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.qachecklist.exception.QaChecklistValidationException;
import org.openelisglobal.qachecklist.service.QaChecklistSnapshot;
import org.openelisglobal.qachecklist.service.SampleQaChecklistService;
import org.openelisglobal.qachecklist.valueholder.SampleQaChecklist;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST Controller for Sample QA Checklist operations. Handles QA verification
 * status for orders in Step 4 of the workflow. Checklist items are configured
 * via the Dictionary system (category: QAChecklistItem).
 */
@RestController
@RequestMapping("/rest/qa-checklist")
public class SampleQaChecklistRestController extends BaseRestController {

    private static final Logger logger = LoggerFactory.getLogger(SampleQaChecklistRestController.class);

    @Autowired
    private SampleQaChecklistService sampleQaChecklistService;

    @Autowired
    private SampleService sampleService;

    /**
     * Get all active checklist item configurations from the Dictionary. GET
     * /rest/qa-checklist/config
     *
     * @return list of active checklist items
     */
    @GetMapping("/config")
    public ResponseEntity<?> getChecklistConfig() {
        try {
            List<Dictionary> items = sampleQaChecklistService.getActiveChecklistItems();

            List<Map<String, Object>> response = new ArrayList<>();
            for (Dictionary item : items) {
                Map<String, Object> itemMap = new HashMap<>();
                itemMap.put("id", item.getId());
                itemMap.put("itemKey", item.getDictEntry());
                itemMap.put("displayOrder", item.getSortOrder());
                itemMap.put("isActive", "Y".equals(item.getIsActive()));
                // Use localAbbreviation as the display label
                itemMap.put("label", item.getLocalAbbreviation());
                // Also provide the localized name if available
                itemMap.put("localizedName", item.getLocalizedName());
                response.add(itemMap);
            }

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error getting QA checklist config", e);
            return failure(500, "QA_LOAD_FAILED", "qa.checklist.loadFailed", null);
        }
    }

    /**
     * Get QA checklist by sample ID. GET /rest/qa-checklist/{sampleId}
     *
     * @param sampleId the sample ID
     * @return the QA checklist or empty checklist if not found
     */
    @GetMapping("/{sampleId}")
    public ResponseEntity<?> getQaChecklist(@PathVariable String sampleId) {
        try {
            sampleId = positiveInteger(sampleId, "QA_SAMPLE_ID_INVALID", "qa.checklist.sampleIdInvalid").toString();

            logger.info("Getting QA checklist for sample: {}", sampleId);

            SampleQaChecklist checklist = sampleQaChecklistService.findBySampleId(sampleId);
            List<Dictionary> activeItems = sampleQaChecklistService.getActiveChecklistItems();

            Map<String, Object> response = new HashMap<>();
            response.put("sampleId", sampleId);

            // Build verified items map with all active items
            Map<String, Boolean> verifiedItems = new HashMap<>();
            if (checklist != null) {
                verifiedItems.putAll(checklist.getVerifiedItems());
                response.put("id", checklist.getId());
                response.put("allRequiredVerified", checklist.getAllRequiredVerified());
                response.put("verifiedByUserId", checklist.getVerifiedByUserId());
                response.put("verifiedDate", checklist.getVerifiedDate());
            } else {
                response.put("allRequiredVerified", false);
            }

            // Ensure all active items are in the response
            for (Dictionary item : activeItems) {
                if (!verifiedItems.containsKey(item.getDictEntry())) {
                    verifiedItems.put(item.getDictEntry(), false);
                }
            }
            response.put("verifiedItems", verifiedItems);

            // Include config for frontend
            List<Map<String, Object>> configItems = new ArrayList<>();
            for (Dictionary item : activeItems) {
                Map<String, Object> itemMap = new HashMap<>();
                itemMap.put("itemKey", item.getDictEntry());
                itemMap.put("label", item.getLocalAbbreviation());
                itemMap.put("localizedName", item.getLocalizedName());
                itemMap.put("displayOrder", item.getSortOrder());
                configItems.add(itemMap);
            }
            response.put("checklistItems", configItems);
            response.putAll(QaChecklistSnapshot.project(checklist, activeItems));

            return ResponseEntity.ok(response);
        } catch (QaChecklistValidationException e) {
            return failure(e.getStatus(), e.getCode(), e.getErrorKey(), e.getBlockedStep());
        } catch (Exception e) {
            logger.error("Error getting QA checklist for sample: {}", sampleId, e);
            return failure(500, "QA_LOAD_FAILED", "qa.checklist.loadFailed", null);
        }
    }

    /**
     * Get QA checklist by lab number (accession number). GET
     * /rest/qa-checklist/by-lab-number/{labNumber}
     *
     * @param labNumber the lab/accession number
     * @return the QA checklist or empty checklist if not found
     */
    @GetMapping("/by-lab-number/{labNumber}")
    public ResponseEntity<?> getQaChecklistByLabNumber(@PathVariable String labNumber) {
        try {
            labNumber = labNumber(labNumber);
            logger.info("Getting QA checklist for lab number: {}", labNumber);

            // Find sample by accession number
            Sample sample = sampleService.getSampleByAccessionNumber(labNumber);
            if (sample == null) {
                return failure(404, "QA_SAMPLE_NOT_FOUND", "qa.checklist.sampleNotFound", null);
            }

            return getQaChecklist(sample.getId());
        } catch (QaChecklistValidationException e) {
            return failure(e.getStatus(), e.getCode(), e.getErrorKey(), e.getBlockedStep());
        } catch (Exception e) {
            logger.error("Error getting QA checklist for lab number: {}", labNumber, e);
            return failure(500, "QA_LOAD_FAILED", "qa.checklist.loadFailed", null);
        }
    }

    /**
     * Save or update QA checklist. POST /rest/qa-checklist
     *
     * Request body: { "sampleId": 123, "verifiedItems": { "patientInfoVerified":
     * true, "samplesVerified": true, "labelsVerified": false, "storageVerified":
     * false } }
     *
     * OR with labNumber: { "labNumber": "24050001234", "verifiedItems": { ... } }
     *
     * @param requestBody the QA checklist data
     * @return the saved checklist
     */
    @PostMapping("")
    public ResponseEntity<?> saveQaChecklist(@RequestBody(required = false) Map<String, Object> requestBody,
            HttpServletRequest request) {
        try {
            Integer userId = authenticatedUserId(request);
            org.openelisglobal.qachecklist.service.QaChecklistWriteGuard.requireRequestContext(request);
            if (requestBody == null) {
                return failure(400, "QA_REQUEST_INVALID", "qa.checklist.invalidRequest", null);
            }
            // Validate the complete payload before looking up the target or invoking
            // the write service. Booleans and identifiers must never be coerced.
            Map<String, Boolean> verifiedItems = verifiedItems(requestBody.get("verifiedItems"));
            Integer sampleId = resolveSampleId(requestBody);
            String accession = requestBody.containsKey("labNumber") ? labNumber(requestBody.get("labNumber")) : null;
            SampleQaChecklist checklist = sampleQaChecklistService.saveFromRequest(sampleId, accession, verifiedItems,
                    userId, request);

            Map<String, Object> response = new HashMap<>();
            response.put("id", checklist.getId());
            response.put("sampleId", checklist.getSampleId());
            response.put("verifiedItems", checklist.getVerifiedItems());
            response.put("allRequiredVerified", checklist.getAllRequiredVerified());
            response.put("verifiedByUserId", checklist.getVerifiedByUserId());
            response.put("verifiedDate", checklist.getVerifiedDate());
            response.put("success", true);
            response.putAll(QaChecklistSnapshot.project(checklist, sampleQaChecklistService.getActiveChecklistItems()));

            return ResponseEntity.ok(response);
        } catch (QaChecklistValidationException e) {
            return failure(e.getStatus(), e.getCode(), e.getErrorKey(), e.getBlockedStep());
        } catch (org.springframework.security.access.AccessDeniedException e) {
            return failure(403, "QA_PERMISSION_DENIED", "qa.checklist.permissionDenied", null);
        } catch (Exception e) {
            logger.error("Error saving QA checklist", e);
            return failure(500, "QA_SAVE_FAILED", "qa.checklist.saveFailed", null);
        }
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<?> invalidRequestBody(HttpMessageNotReadableException exception) {
        return failure(400, "QA_REQUEST_INVALID", "qa.checklist.invalidRequest", null);
    }

    private Integer authenticatedUserId(HttpServletRequest request) {
        try {
            return positiveInteger(getSysUserId(request), "QA_AUTH_REQUIRED", "qa.checklist.authRequired");
        } catch (RuntimeException e) {
            throw new QaChecklistValidationException(401, "QA_AUTH_REQUIRED", "qa.checklist.authRequired");
        }
    }

    private Integer resolveSampleId(Map<String, Object> body) {
        boolean hasId = body.containsKey("sampleId");
        boolean hasLabNumber = body.containsKey("labNumber");
        if (!hasId && !hasLabNumber) {
            throw new QaChecklistValidationException(400, "QA_IDENTIFIER_REQUIRED", "qa.checklist.identifierRequired");
        }
        Integer sampleId = hasId
                ? positiveInteger(body.get("sampleId"), "QA_SAMPLE_ID_INVALID", "qa.checklist.sampleIdInvalid")
                : null;
        if (hasLabNumber) {
            labNumber(body.get("labNumber"));
        }
        return sampleId;
    }

    private static String labNumber(Object value) {
        if (!(value instanceof String text) || text.isBlank()) {
            throw new QaChecklistValidationException(400, "QA_LAB_NUMBER_INVALID", "qa.checklist.labNumberInvalid");
        }
        return text.trim();
    }

    private static Integer positiveInteger(Object value, String code, String errorKey) {
        String text = value instanceof String string ? string.trim()
                : value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long
                        || value instanceof BigInteger ? value.toString() : null;
        if (text != null && text.matches("[0-9]+")) {
            try {
                int parsed = Integer.parseInt(text);
                if (parsed > 0) {
                    return parsed;
                }
            } catch (NumberFormatException ignored) {
                // Overflow must be rejected, never truncated with Number.intValue().
            }
        }
        throw new QaChecklistValidationException(400, code, errorKey);
    }

    private static Map<String, Boolean> verifiedItems(Object value) {
        if (!(value instanceof Map<?, ?> items)) {
            throw new QaChecklistValidationException(400, "QA_ITEMS_INVALID", "qa.checklist.itemsInvalid");
        }
        Map<String, Boolean> result = new HashMap<>();
        for (Map.Entry<?, ?> item : items.entrySet()) {
            if (!(item.getKey() instanceof String key) || key.isBlank() || !(item.getValue() instanceof Boolean flag)) {
                throw new QaChecklistValidationException(400, "QA_ITEMS_INVALID", "qa.checklist.itemsInvalid");
            }
            result.put(key, flag);
        }
        return result;
    }

    private static ResponseEntity<Map<String, Object>> failure(int status, String code, String errorKey,
            String blockedStep) {
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("code", code);
        body.put("errorKey", errorKey);
        if (blockedStep != null) {
            body.put("blockedStep", blockedStep);
        }
        return ResponseEntity.status(status).body(body);
    }
}

package org.openelisglobal.patient.controller.rest;

import jakarta.persistence.OptimisticLockException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.patient.action.IPatientUpdate.PatientUpdateStatus;
import org.openelisglobal.patient.action.bean.PatientIdDocumentInfo;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.patient.form.PatientListResponse;
import org.openelisglobal.patient.service.PatientDocumentMaintenanceService;
import org.openelisglobal.patient.service.PatientIdDocumentService;
import org.openelisglobal.patient.service.PatientMaintenanceConflictException;
import org.openelisglobal.patient.service.PatientMaintenanceService;
import org.openelisglobal.patient.service.PatientMaintenanceValidationException;
import org.openelisglobal.patient.service.PatientManagementAuthorizationService;
import org.openelisglobal.patient.service.PatientPhotoService;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.patient.valueholder.PatientIdDocument;
import org.openelisglobal.patientidentity.service.PatientIdentityService;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.search.service.SearchResultsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Controller;
import org.springframework.validation.BindingResult;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@Controller
@RequestMapping(value = "/rest/")
public class PatientManagementRestController extends BaseRestController {
    @Autowired
    PatientManagementAuthorizationService maintenanceAuthorization;
    @Autowired
    PatientMaintenanceService maintenanceService;
    @Autowired
    PatientDocumentMaintenanceService documentMaintenance;
    @Autowired
    SearchResultsService searchService;
    @Autowired
    PatientIdentityService patientIdentityService;
    @Autowired
    PatientService patientService;
    @Autowired
    FhirTransformService fhirTransformService;
    @Autowired
    PatientPhotoService photoService;
    @Autowired
    PatientIdDocumentService idDocumentService;

    @GetMapping(value = "patient-management-list", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public PatientListResponse getPatientManagementList(@RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return patientService.getPatientManagementList(page, pageSize);
    }

    @GetMapping(value = "patient-maintenance-capabilities", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public Map<String, Boolean> maintenanceCapabilities(HttpServletRequest request) {
        String actor = getSysUserId(request);
        return Map.of("canCreate", maintenanceAuthorization.canCreate(request, actor), "canEdit",
                maintenanceAuthorization.canEdit(request, actor));
    }

    @PostMapping(value = "PatientManagement", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<Map<String, Object>> savepatient(HttpServletRequest request,
            @Validated(SamplePatientEntryForm.SamplePatientEntry.class) @RequestBody PatientManagementInfo patientInfo,
            BindingResult bindingResult) throws Exception {
        String actor = getSysUserId(request);
        boolean editing = StringUtils.isNotBlank(patientInfo.getPatientPK());
        if (editing)
            maintenanceAuthorization.requireEdit(request, actor);
        else
            maintenanceAuthorization.requireCreate(request, actor);
        patientInfo.setPatientUpdateStatus(editing ? PatientUpdateStatus.UPDATE : PatientUpdateStatus.ADD);
        if (bindingResult.hasErrors())
            return invalidPatientRequest();
        Patient patient;
        try {
            patient = maintenanceService.persistPatientData(patientInfo, actor, request);
        } catch (AccessDeniedException e) {
            return patientPermissionDenied(e);
        } catch (PatientMaintenanceValidationException e) {
            return ResponseEntity
                    .status("DUPLICATE_PATIENT".equals(e.getCode()) ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST)
                    .body(Map.of("code", e.getCode(), "errorKey", e.getErrorKey()));
        } catch (PatientMaintenanceConflictException | OptimisticLockException
                | ObjectOptimisticLockingFailureException e) {
            return patientConflict(e);
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() == 404) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(
                        Map.of("code", "PATIENT_MANAGEMENT_NOT_FOUND", "errorKey", "patient.maintenance.notFound"));
            }
            throw e;
        } catch (IllegalArgumentException e) {
            return invalidPatientRequest();
        } catch (Exception e) {
            LogEvent.logError(e);
            if (hasOptimisticCause(e))
                return patientConflict(e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("code", "PATIENT_MANAGEMENT_ERROR", "errorKey", "error.save.patient"));
        }
        // These services retain their existing separate transactions. Once the
        // core has committed, every downstream failure is an unknown save result.
        try {
            fhirTransformService.transformPersistPatient(patientInfo, !editing);
            photoService.savePhoto(patient.getId(), patientInfo.getPhoto(), actor);
            if (patientInfo.getIdDocuments() != null) {
                for (PatientIdDocumentInfo docInfo : patientInfo.getIdDocuments()) {
                    if (docInfo.getId() == null && docInfo.getData() != null) {
                        idDocumentService.saveDocument(patient.getId(), docInfo.getData(), docInfo.getCategory(),
                                docInfo.getDescription(), actor);
                    }
                }
            }
            if (StringUtils.isBlank(patient.getId()))
                throw new IllegalStateException("Missing saved patient ID");
            return ResponseEntity.ok(Map.of("status", "success", "patientId", patient.getId()));
        } catch (Exception e) {
            LogEvent.logError(e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("code", "PATIENT_MANAGEMENT_ERROR", "errorKey", "error.save.patient"));
        }
    }

    @ExceptionHandler(AccessDeniedException.class)
    @ResponseBody
    public ResponseEntity<Map<String, Object>> patientPermissionDenied(AccessDeniedException exception) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(
                Map.of("code", "PATIENT_MANAGEMENT_FORBIDDEN", "errorKey", "patient.maintenance.permissionDenied"));
    }

    @ExceptionHandler({ PatientMaintenanceConflictException.class, OptimisticLockException.class,
            ObjectOptimisticLockingFailureException.class })
    @ResponseBody
    public ResponseEntity<Map<String, Object>> patientConflict(Exception exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("code", "PATIENT_MANAGEMENT_CONFLICT", "errorKey", "patient.maintenance.conflict"));
    }

    @ExceptionHandler(LIMSRuntimeException.class)
    @ResponseBody
    public ResponseEntity<Map<String, Object>> patientPersistenceFailure(LIMSRuntimeException exception) {
        if (hasOptimisticCause(exception))
            return patientConflict(exception);
        LogEvent.logError(exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("code", "PATIENT_MANAGEMENT_ERROR", "errorKey", "error.save.patient"));
    }

    @ExceptionHandler({ MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class, IllegalArgumentException.class })
    @ResponseBody
    public ResponseEntity<Map<String, Object>> invalidPatientBody(Exception exception) {
        return invalidPatientRequest();
    }

    private ResponseEntity<Map<String, Object>> invalidPatientRequest() {
        return ResponseEntity.badRequest()
                .body(Map.of("code", "PATIENT_MANAGEMENT_INVALID_REQUEST", "errorKey", "patient.maintenance.invalid"));
    }

    private boolean hasOptimisticCause(Throwable exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof OptimisticLockException || cause instanceof ObjectOptimisticLockingFailureException
                    || cause instanceof org.hibernate.StaleStateException)
                return true;
        }
        return false;
    }

    @GetMapping("patient-photos/{id}/{isThumbnail}")
    public ResponseEntity<Map<String, String>> getPhoto(@PathVariable String id, @PathVariable boolean isThumbnail)
            throws LIMSRuntimeException {
        String photo = photoService.getPhotoByPatientId(id, isThumbnail);
        if (photo == null) {
            return ResponseEntity.ok(Map.of("data", ""));
        }
        return ResponseEntity.ok(Map.of("data", photo));
    }

    @GetMapping("patient-id-documents/{patientId}")
    @ResponseBody
    public ResponseEntity<List<Map<String, Object>>> getIdDocuments(@PathVariable String patientId)
            throws LIMSRuntimeException {
        List<PatientIdDocument> documents = idDocumentService.getDocumentsByPatientId(patientId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (PatientIdDocument doc : documents) {
            Map<String, Object> docMap = new HashMap<>();
            docMap.put("id", doc.getId());
            docMap.put("thumbnail", "data:" + doc.getDocumentType() + ";base64," + doc.getThumbnailData());
            docMap.put("category", doc.getDocumentCategory());
            docMap.put("description", doc.getDescription());
            docMap.put("lastUpdated", doc.getLastupdated());
            docMap.put("documentLastUpdated", doc.getLastupdated() == null ? "" : doc.getLastupdated().toString());
            result.add(docMap);
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("patient-id-documents/{patientId}/{documentId}/full")
    @ResponseBody
    public ResponseEntity<Map<String, String>> getIdDocumentFull(@PathVariable String patientId,
            @PathVariable Integer documentId) throws LIMSRuntimeException {
        List<PatientIdDocument> documents = idDocumentService.getDocumentsByPatientId(patientId);
        for (PatientIdDocument doc : documents) {
            if (doc.getId().equals(documentId)) {
                String fullData = "data:" + doc.getDocumentType() + ";base64," + doc.getDocumentData();
                return ResponseEntity.ok(Map.of("data", fullData));
            }
        }
        return ResponseEntity.ok(Map.of("data", ""));
    }

    @PutMapping("patient-id-documents/{documentId}")
    @ResponseBody
    public ResponseEntity<Map<String, String>> updateIdDocument(HttpServletRequest request,
            @PathVariable Integer documentId, @RequestParam(required = false) String patientId,
            @RequestParam(required = false) String version, @RequestBody PatientIdDocumentInfo docInfo) {
        documentMaintenance.update(request, getSysUserId(request), documentId, patientId, version, docInfo);
        return ResponseEntity.ok(Map.of("status", "success"));
    }

    @DeleteMapping("patient-id-documents/{documentId}")
    @ResponseBody
    public ResponseEntity<Map<String, String>> deleteIdDocument(HttpServletRequest request,
            @PathVariable Integer documentId, @RequestParam(required = false) String patientId,
            @RequestParam(required = false) String version) {
        documentMaintenance.delete(request, getSysUserId(request), documentId, patientId, version);
        return ResponseEntity.ok(Map.of("status", "success"));
    }

}

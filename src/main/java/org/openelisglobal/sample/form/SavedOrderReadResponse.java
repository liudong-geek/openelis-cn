package org.openelisglobal.sample.form;

import java.util.List;
import java.util.Map;

/** Detached read projection; never accepted as an order write payload. */
public record SavedOrderReadResponse(String queryVersion, String currentUserId, SavedOrderReadRequest query,
        String orderId, String labNumber, boolean readOnly, boolean canModify, boolean isEditable,
        String modifyUnavailableReason, List<String> warningCodes, PatientView patient,
        Map<String, Object> sampleOrderItems, List<SpecimenView> samples, List<RequestView> requests) {
    public record PatientView(String patientId, String firstName, String lastName, String middleName, String gender,
            String birthDate, String nationalId, String externalId, String streetAddress, String phone, String email,
            String lastupdated) {
    }

    public record AnalysisView(String analysisId, String testId, String testName, String testSectionId, String panelId,
            String panelName, String statusId, String statusCode, String statusName, String statusType,
            String lastupdated, List<String> warningCodes) {
    }

    public record SpecimenView(String sampleItemId, String sortOrder, String barcode, String sampleTypeId,
            String typeName, String statusId, String statusCode, String statusName, String statusType,
            String lastupdated, String collectionDate, String collectionTime, String receivedDate, String receivedTime,
            Double quantity, String unitOfMeasureId, String unitOfMeasureName, String collector, boolean voided,
            boolean rejected, List<AnalysisView> analyses, List<String> warningCodes) {
    }

    public record TestView(String testId, String testName) {
    }

    public record PanelView(String panelId, String panelName) {
    }

    public record RequestView(String sampleTypeRequestId, String sampleItemId, Integer sortOrder, String sampleTypeId,
            String typeName, String status, String lastupdated, Double requestedQuantity, String unitOfMeasureId,
            String unitOfMeasureName, List<TestView> tests, List<PanelView> panels, List<String> warningCodes) {
    }
}

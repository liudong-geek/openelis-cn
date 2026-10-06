package org.openelisglobal.workplan.form;

public record WorkplanQueryRow(String analysisId, String sampleId, String sampleItemId, String testId,
        String accessionNumber, String statusId, String lastupdated, String testSectionId, String receivedDate,
        String testName, String patientInfo, String patientName, String nextVisitDate, boolean nonconforming,
        int sampleGroupingNumber, String rowKind, String groupKey, String groupLabel, boolean canPrint,
        String printUnavailableReason) {
}

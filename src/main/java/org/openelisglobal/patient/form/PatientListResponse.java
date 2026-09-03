package org.openelisglobal.patient.form;

import java.util.List;

public record PatientListResponse(List<PatientListItem> patients, int page, int pageSize, int totalItems,
        int totalPages) {
}

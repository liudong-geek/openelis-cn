package org.openelisglobal.barcode.service;

import org.openelisglobal.barcode.dto.BarcodeLabelGenerateRequest;
import org.openelisglobal.barcode.dto.BarcodeLabelGenerateResponse;

public interface BarcodeLabelGenerationService {
    BarcodeLabelGenerateResponse generate(BarcodeLabelGenerateRequest request,
            BarcodeLabelGenerationPermissionService.BoundOperator operator);
}

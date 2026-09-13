package org.openelisglobal.barcode.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** Counts describe generated PDF pages, not acknowledgement from a physical printer. */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record BarcodeLabelGenerateResponse(String orderId, String labNumber, List<GeneratedLabel> items,
        int totalGenerated, String pdfBase64) {
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record GeneratedLabel(String type, String sampleItemId, String barcode, int requestedQuantity,
            int generatedQuantity, String reason) {
    }
}

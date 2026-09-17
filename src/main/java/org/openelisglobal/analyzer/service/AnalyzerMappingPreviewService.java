package org.openelisglobal.analyzer.service;

import java.util.List;
import org.openelisglobal.analyzer.valueholder.AnalyzerFieldMapping;

/**
 * Service interface for analyzer mapping preview operations
 * 
 * 
 * Provides read-only preview operations for testing field mappings with ASTM
 * and HL7 messages.
 */
public interface AnalyzerMappingPreviewService {

    /**
     * Preview how a protocol message will be interpreted with current mappings.
     * 
     * 
     * @param analyzerId  The analyzer ID
     * @param protocolMessage The sample ASTM or HL7 message (max 10KB)
     * @param options     Preview options (detailed parsing, validation)
     * @return MappingPreviewResult containing parsed fields, applied mappings,
     *         entity preview, warnings, and errors
     */
    MappingPreviewResult previewMapping(String analyzerId, String protocolMessage, PreviewOptions options);

    /**
     * Parse ASTM message into structured fields
     * 
     * @param astmMessage The ASTM message to parse
     * @return List of parsed fields
     */
    List<ParsedField> parseAstmMessage(String astmMessage);

    /** Parse an HL7 v2 message into segment-position fields. */
    List<ParsedField> parseHl7Message(String hl7Message);

    /**
     * Apply mappings to parsed fields
     * 
     * @param parsedFields The parsed fields from ASTM message
     * @param mappings     The active mappings for the analyzer
     * @return List of applied mappings
     */
    List<AppliedMapping> applyMappings(List<ParsedField> parsedFields, List<AnalyzerFieldMapping> mappings);

    /**
     * Build entity preview from applied mappings
     * 
     * @param appliedMappings The applied mappings
     * @return EntityPreview containing Test, Result, and Sample entities
     */
    EntityPreview buildEntityPreview(List<AppliedMapping> appliedMappings);
}

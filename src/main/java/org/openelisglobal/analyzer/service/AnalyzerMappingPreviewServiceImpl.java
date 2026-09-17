package org.openelisglobal.analyzer.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.openelisglobal.analyzer.dao.AnalyzerFieldDAO;
import org.openelisglobal.analyzer.dao.AnalyzerFieldMappingDAO;
import org.openelisglobal.analyzer.valueholder.AnalyzerField;
import org.openelisglobal.analyzer.valueholder.AnalyzerFieldMapping;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read-only protocol replay for analyzer mapping verification.
 *
 * <p>The replay path deliberately stops before clinical persistence. It parses a
 * supplied ASTM or HL7 message, applies the analyzer's active mapping snapshot,
 * and returns a deterministic evidence hash and entity preview.</p>
 */
@Service
@Transactional(readOnly = true)
public class AnalyzerMappingPreviewServiceImpl implements AnalyzerMappingPreviewService {

    private static final int MAX_MESSAGE_SIZE = 10 * 1024;
    private static final String AUTO = "AUTO";
    private static final String ASTM = "ASTM";
    private static final String HL7 = "HL7";

    private final AnalyzerFieldMappingDAO analyzerFieldMappingDAO;
    @SuppressWarnings("unused")
    private final AnalyzerFieldDAO analyzerFieldDAO;
    private final AnalyzerPluginConfigService analyzerPluginConfigService;

    @Autowired
    public AnalyzerMappingPreviewServiceImpl(AnalyzerFieldMappingDAO analyzerFieldMappingDAO,
            AnalyzerFieldDAO analyzerFieldDAO, AnalyzerPluginConfigService analyzerPluginConfigService) {
        this.analyzerFieldMappingDAO = analyzerFieldMappingDAO;
        this.analyzerFieldDAO = analyzerFieldDAO;
        this.analyzerPluginConfigService = analyzerPluginConfigService;
    }

    @Override
    public MappingPreviewResult previewMapping(String analyzerId, String protocolMessage, PreviewOptions options) {
        MappingPreviewResult result = new MappingPreviewResult();
        result.setDryRun(true);

        if (protocolMessage == null || protocolMessage.isBlank()) {
            result.getErrors().add("Protocol message is required");
            return result;
        }
        if (protocolMessage.length() > MAX_MESSAGE_SIZE) {
            result.getErrors().add("Protocol message exceeds maximum size of 10KB");
            return result;
        }

        PreviewOptions effectiveOptions = options == null ? new PreviewOptions() : options;
        String protocol;
        try {
            protocol = resolveProtocol(effectiveOptions.getProtocol(), protocolMessage);
        } catch (IllegalArgumentException e) {
            result.getErrors().add(e.getMessage());
            return result;
        }

        result.setProtocol(protocol);
        result.setMessageHash(sha256(protocolMessage));

        try {
            List<AnalyzerFieldMapping> mappings = analyzerFieldMappingDAO.findActiveMappingsByAnalyzerId(analyzerId);
            if (mappings == null) {
                mappings = new ArrayList<>();
            }

            List<ParsedField> genericFields = ASTM.equals(protocol) ? parseAstmMessage(protocolMessage)
                    : parseHl7Message(protocolMessage);
            List<ParsedField> configuredFields = extractConfiguredFields(protocolMessage, protocol, mappings);
            List<ParsedField> parsedFields = configuredFields.isEmpty() || effectiveOptions.isIncludeDetailedParsing()
                    ? mergeFields(configuredFields, genericFields)
                    : configuredFields;

            if (genericFields.isEmpty()) {
                result.getErrors().add("Message does not contain recognizable " + protocol + " segments");
            }

            result.setParsedFields(parsedFields);
            List<AppliedMapping> appliedMappings = applyMappings(parsedFields, mappings);
            result.setAppliedMappings(appliedMappings);
            result.setEntityPreview(buildEntityPreview(appliedMappings));
            result.setPluginConfigSnapshot(analyzerPluginConfigService.getConfigAsMap(analyzerId));

            validateMappings(parsedFields, mappings, result, effectiveOptions.isValidateAllMappings());
            if (!analyzerPluginConfigService.hasAtLeastOneActiveQcRule(analyzerId)) {
                result.getWarnings().add("No active QC rule configured; activation gate will block ACTIVE transition");
            }
            result.setReplaySummary(buildSummary(parsedFields, mappings, appliedMappings, result));
        } catch (Exception e) {
            result.getErrors().add("Error processing " + protocol + " message: " + e.getMessage());
        }

        return result;
    }

    @Override
    public List<ParsedField> parseAstmMessage(String astmMessage) {
        return parseDelimitedMessage(astmMessage, ASTM);
    }

    @Override
    public List<ParsedField> parseHl7Message(String hl7Message) {
        return parseDelimitedMessage(hl7Message, HL7);
    }

    private List<ParsedField> parseDelimitedMessage(String message, String protocol) {
        List<ParsedField> fields = new ArrayList<>();
        if (message == null || message.isBlank()) {
            return fields;
        }

        for (String line : normalizedLines(message)) {
            String[] segments = line.split("\\|", -1);
            if (segments.length < 2 || segments[0].isBlank()) {
                continue;
            }
            String segmentType = segments[0].trim().toUpperCase(Locale.ROOT);
            if (!isRecognizedSegment(protocol, segmentType)) {
                continue;
            }

            for (int index = 1; index < segments.length; index++) {
                String value = segments[index];
                if (value == null || value.isBlank()) {
                    continue;
                }
                int displayIndex = HL7.equals(protocol) && "MSH".equals(segmentType) ? index + 1 : index;
                String reference = ASTM.equals(protocol) ? segmentType + "|" + displayIndex
                        : segmentType + "-" + displayIndex;
                ParsedField field = new ParsedField();
                field.setFieldName(reference);
                field.setAstmRef(reference);
                field.setRawValue(value);
                field.setFieldType(inferFieldType(value));
                field.setInterpretation("Unmapped");
                fields.add(field);
            }
        }
        return fields;
    }

    private List<ParsedField> extractConfiguredFields(String message, String protocol,
            List<AnalyzerFieldMapping> mappings) {
        List<ParsedField> fields = new ArrayList<>();
        for (AnalyzerFieldMapping mapping : mappings) {
            AnalyzerField analyzerField = mapping.getAnalyzerField();
            if (analyzerField == null || analyzerField.getAstmRef() == null || analyzerField.getAstmRef().isBlank()) {
                continue;
            }
            Optional<String> value = ASTM.equals(protocol)
                    ? extractAstmValue(message, analyzerField.getAstmRef())
                    : extractHl7Value(message, analyzerField.getAstmRef());
            if (value.isEmpty()) {
                continue;
            }

            ParsedField field = new ParsedField();
            field.setFieldName(analyzerField.getFieldName());
            field.setAstmRef(analyzerField.getAstmRef());
            field.setRawValue(value.get());
            field.setFieldType(analyzerField.getFieldType() == null ? inferFieldType(value.get())
                    : analyzerField.getFieldType().name());
            field.setInterpretation("Configured field found");
            fields.add(field);
        }
        return fields;
    }

    private Optional<String> extractAstmValue(String message, String selector) {
        String[] selectorParts = selector.split("\\|", -1);
        if (selectorParts.length < 2) {
            return Optional.empty();
        }
        String expectedSegment = selectorParts[0].trim().toUpperCase(Locale.ROOT);
        for (String line : normalizedLines(message)) {
            String[] fields = line.split("\\|", -1);
            if (fields.length < 2 || !expectedSegment.equals(fields[0].trim().toUpperCase(Locale.ROOT))) {
                continue;
            }

            if (selectorParts.length == 2 && selectorParts[1].matches("\\d+")) {
                int index = Integer.parseInt(selectorParts[1]);
                if (index < fields.length && !fields[index].isBlank()) {
                    return Optional.of(fields[index]);
                }
                continue;
            }

            boolean matches = selectorParts.length < fields.length;
            for (int index = 1; matches && index < selectorParts.length; index++) {
                matches = selectorParts[index].equals(fields[index]);
            }
            if (matches && selectorParts.length < fields.length && !fields[selectorParts.length].isBlank()) {
                return Optional.of(fields[selectorParts.length]);
            }
        }
        return Optional.empty();
    }

    private Optional<String> extractHl7Value(String message, String selector) {
        String normalizedSelector = selector.trim().toUpperCase(Locale.ROOT).replace('|', '-');
        int separator = normalizedSelector.indexOf('-');
        if (separator < 1 || separator == normalizedSelector.length() - 1) {
            return Optional.empty();
        }
        String expectedSegment = normalizedSelector.substring(0, separator);
        String positionText = normalizedSelector.substring(separator + 1);
        if (!positionText.matches("\\d+")) {
            return Optional.empty();
        }
        int hl7Position = Integer.parseInt(positionText);
        for (String line : normalizedLines(message)) {
            String[] fields = line.split("\\|", -1);
            if (fields.length < 2 || !expectedSegment.equals(fields[0].trim().toUpperCase(Locale.ROOT))) {
                continue;
            }
            int arrayIndex = "MSH".equals(expectedSegment) ? hl7Position - 1 : hl7Position;
            if (arrayIndex > 0 && arrayIndex < fields.length && !fields[arrayIndex].isBlank()) {
                return Optional.of(fields[arrayIndex]);
            }
        }
        return Optional.empty();
    }

    @Override
    public List<AppliedMapping> applyMappings(List<ParsedField> parsedFields, List<AnalyzerFieldMapping> mappings) {
        List<AppliedMapping> appliedMappings = new ArrayList<>();
        if (parsedFields == null || mappings == null) {
            return appliedMappings;
        }

        for (AnalyzerFieldMapping mapping : mappings) {
            AnalyzerField analyzerField = mapping.getAnalyzerField();
            if (analyzerField == null) {
                continue;
            }
            ParsedField parsedField = parsedFields.stream()
                    .filter(field -> analyzerField.getFieldName().equalsIgnoreCase(field.getFieldName())
                            || (analyzerField.getAstmRef() != null
                                    && analyzerField.getAstmRef().equalsIgnoreCase(field.getAstmRef())))
                    .findFirst().orElse(null);
            if (parsedField == null) {
                continue;
            }

            AppliedMapping applied = new AppliedMapping();
            applied.setAnalyzerFieldName(analyzerField.getFieldName());
            applied.setOpenelisFieldId(mapping.getOpenelisFieldId());
            applied.setOpenelisFieldType(mapping.getOpenelisFieldType().toString());
            applied.setMappedValue(parsedField.getRawValue());
            applied.setMappingId(mapping.getId());
            appliedMappings.add(applied);
            parsedField.setMappedTo(mapping.getOpenelisFieldType() + ":" + mapping.getOpenelisFieldId());
            parsedField.setInterpretation("Mapped");
        }
        return appliedMappings;
    }

    @Override
    public EntityPreview buildEntityPreview(List<AppliedMapping> appliedMappings) {
        EntityPreview preview = new EntityPreview();
        Map<String, List<AppliedMapping>> mappingsByType = appliedMappings.stream()
                .collect(Collectors.groupingBy(AppliedMapping::getOpenelisFieldType));

        for (AppliedMapping mapping : mappingsByType.getOrDefault("TEST", new ArrayList<>())) {
            Map<String, Object> test = new LinkedHashMap<>();
            test.put("id", mapping.getOpenelisFieldId());
            test.put("name", mapping.getAnalyzerFieldName());
            preview.getTests().add(test);
        }
        for (AppliedMapping mapping : mappingsByType.getOrDefault("RESULT", new ArrayList<>())) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("testId", mapping.getOpenelisFieldId());
            result.put("value", mapping.getMappedValue());
            result.put("fieldName", mapping.getAnalyzerFieldName());
            preview.getResults().add(result);
        }
        appliedMappings.stream()
                .filter(mapping -> "SAMPLE".equals(mapping.getOpenelisFieldType())
                        || "ORDER".equals(mapping.getOpenelisFieldType()))
                .forEach(mapping -> preview.getSample().put(mapping.getAnalyzerFieldName(), mapping.getMappedValue()));
        return preview;
    }

    private void validateMappings(List<ParsedField> parsedFields, List<AnalyzerFieldMapping> mappings,
            MappingPreviewResult result, boolean validateAllMappings) {
        if (mappings.isEmpty()) {
            result.getWarnings().add("No active mappings are configured for this analyzer");
        }

        if (validateAllMappings) {
            for (AnalyzerFieldMapping mapping : mappings) {
                AnalyzerField field = mapping.getAnalyzerField();
                boolean found = field != null && parsedFields.stream()
                        .anyMatch(parsed -> field.getFieldName().equalsIgnoreCase(parsed.getFieldName())
                                || (field.getAstmRef() != null
                                        && field.getAstmRef().equalsIgnoreCase(parsed.getAstmRef())));
                if (!found && Boolean.TRUE.equals(mapping.getIsRequired())) {
                    result.getWarnings().add("Required protocol field not found: "
                            + (field == null ? mapping.getId() : field.getFieldName()));
                }
            }
        }

        boolean hasSampleIdMapping = mappings.stream().anyMatch(mapping -> Boolean.TRUE.equals(mapping.getIsRequired())
                && mapping.getOpenelisFieldType() == AnalyzerFieldMapping.OpenELISFieldType.SAMPLE);
        boolean hasTestCodeMapping = mappings.stream().anyMatch(mapping -> Boolean.TRUE.equals(mapping.getIsRequired())
                && mapping.getMappingType() == AnalyzerFieldMapping.MappingType.TEST_LEVEL);
        boolean hasResultValueMapping = mappings.stream().anyMatch(mapping -> Boolean.TRUE.equals(mapping.getIsRequired())
                && mapping.getMappingType() == AnalyzerFieldMapping.MappingType.RESULT_LEVEL);
        if (!hasSampleIdMapping) {
            result.getWarnings().add("Required mapping missing: Sample ID");
        }
        if (!hasTestCodeMapping) {
            result.getWarnings().add("Required mapping missing: Test Code");
        }
        if (!hasResultValueMapping) {
            result.getWarnings().add("Required mapping missing: Result Value");
        }
    }

    private Map<String, Object> buildSummary(List<ParsedField> parsedFields, List<AnalyzerFieldMapping> mappings,
            List<AppliedMapping> appliedMappings, MappingPreviewResult result) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("parsedFieldCount", parsedFields.size());
        summary.put("activeMappingCount", mappings.size());
        summary.put("appliedMappingCount", appliedMappings.size());
        summary.put("unmappedFieldCount", parsedFields.stream().filter(field -> field.getMappedTo() == null).count());
        summary.put("warningCount", result.getWarnings().size());
        summary.put("errorCount", result.getErrors().size());
        summary.put("clinicalWrites", 0);
        return summary;
    }

    private List<ParsedField> mergeFields(List<ParsedField> configuredFields, List<ParsedField> genericFields) {
        List<ParsedField> merged = new ArrayList<>(configuredFields);
        for (ParsedField generic : genericFields) {
            boolean duplicate = merged.stream().anyMatch(field -> field.getAstmRef().equals(generic.getAstmRef())
                    && field.getRawValue().equals(generic.getRawValue()));
            if (!duplicate) {
                merged.add(generic);
            }
        }
        return merged;
    }

    private String resolveProtocol(String requestedProtocol, String message) {
        String normalized = requestedProtocol == null || requestedProtocol.isBlank() ? AUTO
                : requestedProtocol.trim().toUpperCase(Locale.ROOT);
        if (AUTO.equals(normalized)) {
            return normalizedLines(message).stream().anyMatch(line -> line.startsWith("MSH|")) ? HL7 : ASTM;
        }
        if (!ASTM.equals(normalized) && !HL7.equals(normalized)) {
            throw new IllegalArgumentException("Unsupported protocol: " + requestedProtocol);
        }
        return normalized;
    }

    private boolean isRecognizedSegment(String protocol, String segmentType) {
        if (ASTM.equals(protocol)) {
            return segmentType.matches("[HPOQRCML]");
        }
        return segmentType.matches("MSH|PID|PV1|ORC|OBR|OBX|NTE|SPM|SAC");
    }

    private List<String> normalizedLines(String message) {
        String normalized = message.replace("\u0002", "").replace("\u0003", "").replace("\u0004", "")
                .replace("\u001c", "");
        return java.util.Arrays.stream(normalized.split("[\\r\\n]+"))
                .map(String::trim).filter(line -> !line.isEmpty()).collect(Collectors.toList());
    }

    private String inferFieldType(String value) {
        return value != null && value.trim().matches("[-+]?\\d+(\\.\\d+)?") ? "NUMERIC" : "TEXT";
    }

    private String sha256(String message) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(message.getBytes(StandardCharsets.UTF_8));
            StringBuilder hash = new StringBuilder();
            for (byte value : digest) {
                hash.append(String.format("%02x", value));
            }
            return hash.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}

package org.openelisglobal.analyzer.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Result object for mapping preview operation
 * 
 */
public class MappingPreviewResult {
    private List<ParsedField> parsedFields;
    private List<AppliedMapping> appliedMappings;
    private EntityPreview entityPreview;
    private Map<String, Object> pluginConfigSnapshot;
    private Map<String, Object> replaySummary;
    private String protocol;
    private String messageHash;
    private boolean dryRun = true;
    private List<String> warnings;
    private List<String> errors;

    public MappingPreviewResult() {
        this.parsedFields = new ArrayList<>();
        this.appliedMappings = new ArrayList<>();
        this.warnings = new ArrayList<>();
        this.errors = new ArrayList<>();
    }

    public List<ParsedField> getParsedFields() {
        return parsedFields;
    }

    public void setParsedFields(List<ParsedField> parsedFields) {
        this.parsedFields = parsedFields;
    }

    public List<AppliedMapping> getAppliedMappings() {
        return appliedMappings;
    }

    public void setAppliedMappings(List<AppliedMapping> appliedMappings) {
        this.appliedMappings = appliedMappings;
    }

    public EntityPreview getEntityPreview() {
        return entityPreview;
    }

    public void setEntityPreview(EntityPreview entityPreview) {
        this.entityPreview = entityPreview;
    }

    public Map<String, Object> getPluginConfigSnapshot() {
        return pluginConfigSnapshot;
    }

    public void setPluginConfigSnapshot(Map<String, Object> pluginConfigSnapshot) {
        this.pluginConfigSnapshot = pluginConfigSnapshot;
    }

    public Map<String, Object> getReplaySummary() {
        return replaySummary;
    }

    public void setReplaySummary(Map<String, Object> replaySummary) {
        this.replaySummary = replaySummary;
    }

    public String getProtocol() {
        return protocol;
    }

    public void setProtocol(String protocol) {
        this.protocol = protocol;
    }

    public String getMessageHash() {
        return messageHash;
    }

    public void setMessageHash(String messageHash) {
        this.messageHash = messageHash;
    }

    public boolean isDryRun() {
        return dryRun;
    }

    public void setDryRun(boolean dryRun) {
        this.dryRun = dryRun;
    }

    public List<String> getWarnings() {
        return warnings;
    }

    public void setWarnings(List<String> warnings) {
        this.warnings = warnings;
    }

    public List<String> getErrors() {
        return errors;
    }

    public void setErrors(List<String> errors) {
        this.errors = errors;
    }
}

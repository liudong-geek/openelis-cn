package org.openelisglobal.analyzer.form;

import jakarta.validation.constraints.Size;

/**
 * Form object for mapping preview request
 * 
 */
public class MappingPreviewForm {

    /** Legacy request field retained for existing clients. */
    private String astmMessage;

    @Size(max = 10240, message = "Protocol message must not exceed 10KB")
    private String message;

    private String protocol = "AUTO";

    private boolean includeDetailedParsing = false;
    private boolean validateAllMappings = false;

    public String getAstmMessage() {
        return astmMessage;
    }

    public void setAstmMessage(String astmMessage) {
        this.astmMessage = astmMessage;
    }

    public String getMessage() {
        return message == null || message.isBlank() ? astmMessage : message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getProtocol() {
        return protocol;
    }

    public void setProtocol(String protocol) {
        this.protocol = protocol;
    }

    public boolean isIncludeDetailedParsing() {
        return includeDetailedParsing;
    }

    public void setIncludeDetailedParsing(boolean includeDetailedParsing) {
        this.includeDetailedParsing = includeDetailedParsing;
    }

    public boolean isValidateAllMappings() {
        return validateAllMappings;
    }

    public void setValidateAllMappings(boolean validateAllMappings) {
        this.validateAllMappings = validateAllMappings;
    }
}

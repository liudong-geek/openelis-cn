package org.openelisglobal.masterdata.form;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class MasterDataIdentityForm {

    @NotBlank
    @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}")
    private String canonicalCode;

    @NotBlank
    @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
    private String sourceSystem;

    @Pattern(regexp = "^$|\\d{4}-\\d{2}-\\d{2}")
    private String validFrom;

    @Pattern(regexp = "^$|\\d{4}-\\d{2}-\\d{2}")
    private String validTo;

    private String expectedLastUpdated;

    public String getCanonicalCode() {
        return canonicalCode;
    }

    public void setCanonicalCode(String canonicalCode) {
        this.canonicalCode = canonicalCode;
    }

    public String getSourceSystem() {
        return sourceSystem;
    }

    public void setSourceSystem(String sourceSystem) {
        this.sourceSystem = sourceSystem;
    }

    public String getValidFrom() {
        return validFrom;
    }

    public void setValidFrom(String validFrom) {
        this.validFrom = validFrom;
    }

    public String getValidTo() {
        return validTo;
    }

    public void setValidTo(String validTo) {
        this.validTo = validTo;
    }

    public String getExpectedLastUpdated() {
        return expectedLastUpdated;
    }

    public void setExpectedLastUpdated(String expectedLastUpdated) {
        this.expectedLastUpdated = expectedLastUpdated;
    }
}

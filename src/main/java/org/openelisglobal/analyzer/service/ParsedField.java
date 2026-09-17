package org.openelisglobal.analyzer.service;

/**
 * Parsed field from ASTM message
 * 
 */
public class ParsedField {
    private String fieldName;
    private String astmRef;
    private String rawValue;
    private String fieldType;
    private String mappedTo;
    private String interpretation;

    public String getFieldName() {
        return fieldName;
    }

    public void setFieldName(String fieldName) {
        this.fieldName = fieldName;
    }

    public String getAstmRef() {
        return astmRef;
    }

    public void setAstmRef(String astmRef) {
        this.astmRef = astmRef;
    }

    public String getRawValue() {
        return rawValue;
    }

    public void setRawValue(String rawValue) {
        this.rawValue = rawValue;
    }

    public String getFieldType() {
        return fieldType;
    }

    public void setFieldType(String fieldType) {
        this.fieldType = fieldType;
    }

    public String getMappedTo() {
        return mappedTo;
    }

    public void setMappedTo(String mappedTo) {
        this.mappedTo = mappedTo;
    }

    public String getInterpretation() {
        return interpretation;
    }

    public void setInterpretation(String interpretation) {
        this.interpretation = interpretation;
    }
}

package org.openelisglobal.common.management.form;

import org.openelisglobal.common.domain.Domain;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;

public class SampleTypeBasicInfoForm {
    private String id;
    @org.openelisglobal.validation.annotations.SafeHtml(level = org.openelisglobal.validation.annotations.SafeHtml.SafeListLevel.NONE)
    private String name;
    @org.openelisglobal.validation.annotations.SafeHtml(level = org.openelisglobal.validation.annotations.SafeHtml.SafeListLevel.NONE)
    private String nameZh;
    @com.fasterxml.jackson.annotation.JsonProperty(access = com.fasterxml.jackson.annotation.JsonProperty.Access.READ_ONLY)
    private java.util.Map<String, String> translations;

    @jakarta.validation.constraints.Size(max = 40)
    private String description;
    private String domain;
    @jakarta.validation.constraints.Size(max = 10)
    private String abbreviation;
    @jakarta.validation.constraints.Size(max = 5)
    private String whonetCode;
    private String disposalInstructions;
    private Boolean isActive;
    private int sortOrder;
    private int testCount;
    private String lastUpdated;

    // Constructors
    public SampleTypeBasicInfoForm() {
    }

    public SampleTypeBasicInfoForm(TypeOfSample typeOfSample) {
        this.id = typeOfSample.getId();

        String nameValue = typeOfSample.getDescription();
        if (typeOfSample.getLocalization() != null) {
            String localizedValue = typeOfSample.getLocalization().getLocalizedValue();
            if (localizedValue != null && !localizedValue.trim().isEmpty()) {
                nameValue = localizedValue;
            }
        }
        this.name = nameValue;
        this.description = typeOfSample.getDescription();
        this.domain = Domain.normalize(typeOfSample.getDomain()); // Map domain to frontend format
        this.abbreviation = typeOfSample.getLocalAbbreviation();
        this.whonetCode = typeOfSample.getWhonetCode();
        this.disposalInstructions = typeOfSample.getDisposalInstructions();
        this.isActive = typeOfSample.getIsActive();
        this.sortOrder = typeOfSample.getSortOrder();
        this.lastUpdated = typeOfSample.getLastupdated() == null ? null : typeOfSample.getLastupdated().toString();
        this.translations = typeOfSample.getLocalization() == null ? new java.util.LinkedHashMap<>()
                : typeOfSample.getLocalization().getValuesAsMap();
    }

    public SampleTypeBasicInfoForm(SampleTypeBasicInfoForm source) {
        id = source.id;
        name = source.name;
        description = source.description;
        domain = source.domain;
        abbreviation = source.abbreviation;
        whonetCode = source.whonetCode;
        disposalInstructions = source.disposalInstructions;
        isActive = source.isActive;
        sortOrder = source.sortOrder;
        testCount = source.testCount;
        lastUpdated = source.lastUpdated;
        translations = source.translations;
        nameZh = source.nameZh;
    }

    public String getNameZh() {
        return nameZh;
    }

    public void setNameZh(String value) {
        nameZh = value;
    }

    public java.util.Map<String, String> getTranslations() {
        return translations;
    }

    public void setTranslations(java.util.Map<String, String> values) {
        translations = values;
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public String getAbbreviation() {
        return abbreviation;
    }

    public void setAbbreviation(String abbreviation) {
        this.abbreviation = abbreviation;
    }

    public String getWhonetCode() {
        return whonetCode;
    }

    public void setWhonetCode(String whonetCode) {
        this.whonetCode = whonetCode;
    }

    public String getDisposalInstructions() {
        return disposalInstructions;
    }

    public void setDisposalInstructions(String disposalInstructions) {
        this.disposalInstructions = disposalInstructions;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public int getTestCount() {
        return testCount;
    }

    public void setTestCount(int testCount) {
        this.testCount = testCount;
    }

    public String getLastUpdated() {
        return lastUpdated;
    }

    public void setLastUpdated(String lastUpdated) {
        this.lastUpdated = lastUpdated;
    }
}

package org.openelisglobal.testcatalog.form;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * Partial basic configuration. Identity and the activation workflow remain
 * separate.
 */
public class TestCatalogBasicInfo {
    public String testId;
    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    public String testGuid;
    public String name;
    public String code;
    public String description;
    public String domain;
    public String labUnitId;
    public String sampleTypeId;
    public List<String> sampleTypeIds;
    public Boolean antimicrobialResistance;
    public Boolean active;
    public Boolean orderable;

    public TestCatalogBasicInfo() {
    }

    public TestCatalogBasicInfo(TestCatalogBasicInfo source) {
        testId = source.testId;
        testGuid = source.testGuid;
        name = source.name;
        code = source.code;
        description = source.description;
        domain = source.domain;
        labUnitId = source.labUnitId;
        sampleTypeId = source.sampleTypeId;
        sampleTypeIds = source.sampleTypeIds;
        antimicrobialResistance = source.antimicrobialResistance;
        active = source.active;
        orderable = source.orderable;
    }
}

package org.openelisglobal.sample.validator;

import java.util.List;
import org.apache.commons.validator.GenericValidator;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.organization.service.OrganizationTypeService;
import org.openelisglobal.organization.valueholder.Organization;
import org.openelisglobal.organization.valueholder.OrganizationType;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.springframework.stereotype.Component;
import org.springframework.validation.Errors;

/** Validates that requesters come from one consistent organization hierarchy. */
@Component
public class RequesterMasterDataValidator {

    private final OrganizationService organizationService;
    private final OrganizationTypeService organizationTypeService;
    private final DefaultConfigurationProperties configurationProperties;

    public RequesterMasterDataValidator(OrganizationService organizationService,
            OrganizationTypeService organizationTypeService,
            DefaultConfigurationProperties configurationProperties) {
        this.organizationService = organizationService;
        this.organizationTypeService = organizationTypeService;
        this.configurationProperties = configurationProperties;
    }

    public void validate(SampleOrderItem orderItem, Errors errors) {
        if (orderItem == null) {
            errors.reject("masterdata.requester.required");
            return;
        }
        validate(orderItem.getReferringSiteId(), orderItem.getReferringSiteDepartmentId(),
                orderItem.getNewRequesterName(), errors);
    }

    public void validate(String facilityId, String departmentId, String newRequesterName, Errors errors) {
        if (GenericValidator.isBlankOrNull(facilityId)) {
            if (!GenericValidator.isBlankOrNull(departmentId)) {
                errors.rejectValue("sampleOrderItems.referringSiteDepartmentId",
                        "masterdata.department.requires.facility");
            }
            if (requiresConfiguredRequester()) {
                errors.rejectValue("sampleOrderItems.referringSiteId", "masterdata.facility.selection.required");
            }
            return;
        }

        Organization facility = organizationService.get(facilityId);
        if (!isActive(facility) || !hasOrganizationType(facilityId, "referring clinic")) {
            errors.rejectValue("sampleOrderItems.referringSiteId", "masterdata.facility.invalid");
            return;
        }

        if (GenericValidator.isBlankOrNull(departmentId)) {
            return;
        }

        List<Organization> children = organizationService.getOrganizationsByParentId(facilityId);
        boolean validDepartment = children != null && children.stream().filter(this::isActive)
                .anyMatch(department -> departmentId.equals(department.getId())
                        && hasOrganizationType(department.getId(), "dept"));
        if (!validDepartment) {
            errors.rejectValue("sampleOrderItems.referringSiteDepartmentId", "masterdata.department.invalid");
        }
    }

    /**
     * Replaces client-supplied labels and codes with the canonical values from the
     * selected organizations. Call this only after {@link #validate} succeeds.
     */
    public void applyCanonicalValues(SampleOrderItem orderItem) {
        if (orderItem == null || GenericValidator.isBlankOrNull(orderItem.getReferringSiteId())) {
            return;
        }

        Organization facility = organizationService.get(orderItem.getReferringSiteId());
        if (facility == null) {
            return;
        }
        orderItem.setReferringSiteName(facility.getOrganizationName());
        orderItem.setReferringSiteCode(facility.getCode());
        orderItem.setNewRequesterName(null);

        if (!GenericValidator.isBlankOrNull(orderItem.getReferringSiteDepartmentId())) {
            Organization department = organizationService.get(orderItem.getReferringSiteDepartmentId());
            if (department != null) {
                orderItem.setReferringSiteDepartmentName(department.getOrganizationName());
            }
        } else {
            orderItem.setReferringSiteDepartmentName(null);
        }
    }

    private boolean requiresConfiguredRequester() {
        return configurationProperties.isPropertyValueEqual(Property.restrictFreeTextRefSiteEntry, "true");
    }

    private boolean isActive(Organization organization) {
        return organization != null && "Y".equals(organization.getIsActive());
    }

    private boolean hasOrganizationType(String organizationId, String typeName) {
        OrganizationType type = organizationTypeService.getOrganizationTypeByName(typeName);
        List<String> typeIds = organizationService.getTypeIdsForOrganizationId(organizationId);
        return type != null && typeIds != null && typeIds.contains(type.getId());
    }
}

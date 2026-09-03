package org.openelisglobal.organization.controller.rest;

import java.util.List;
import java.util.Set;
import org.openelisglobal.organization.valueholder.Organization;

final class ReferringSiteEligibility {

    private static final String INTERNAL_FACILITY_SHORT_NAME = "FACILITY_ORG";

    private ReferringSiteEligibility() {
    }

    /**
     * An order may originate from a configured referring organization or from the
     * laboratory itself. Fresh/local installations only contain the internal
     * facility, so excluding it makes the required requester field impossible to
     * complete.
     */
    static boolean isSelectable(Organization organization, List<String> organizationTypeIds,
            Set<String> referringTypeIds) {
        if (organizationTypeIds != null && organizationTypeIds.stream().anyMatch(referringTypeIds::contains)) {
            return true;
        }

        return organization != null && "Y".equalsIgnoreCase(organization.getIsActive())
                && INTERNAL_FACILITY_SHORT_NAME.equalsIgnoreCase(organization.getShortName());
    }
}

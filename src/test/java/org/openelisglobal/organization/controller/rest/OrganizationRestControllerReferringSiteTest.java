package org.openelisglobal.organization.controller.rest;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;
import java.util.Set;
import org.junit.Test;
import org.openelisglobal.organization.valueholder.Organization;

public class OrganizationRestControllerReferringSiteTest {

    @Test
    public void configuredReferringOrganizationRemainsSelectable() {
        Organization organization = organization("Clinic A", "CLINIC", "Y");

        assertTrue(ReferringSiteEligibility.isSelectable(organization, List.of("5"), Set.of("5", "9")));
    }

    @Test
    public void activeInternalFacilityIsSelectableForLocalOrders() {
        Organization organization = organization("Test LIMS", "FACILITY_ORG", "Y");

        assertTrue(ReferringSiteEligibility.isSelectable(organization, List.of(), Set.of("5", "9")));
    }

    @Test
    public void inactiveInternalFacilityIsNotSelectable() {
        Organization organization = organization("Old LIMS", "FACILITY_ORG", "N");

        assertFalse(ReferringSiteEligibility.isSelectable(organization, List.of(), Set.of("5", "9")));
    }

    private Organization organization(String name, String shortName, String active) {
        Organization organization = new Organization();
        organization.setOrganizationName(name);
        organization.setShortName(shortName);
        organization.setIsActive(active);
        return organization;
    }
}

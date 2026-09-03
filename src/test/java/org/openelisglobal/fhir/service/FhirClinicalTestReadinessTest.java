package org.openelisglobal.fhir.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import ca.uhn.fhir.rest.server.exceptions.UnprocessableEntityException;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.openelisglobal.testresultcomponent.valueholder.TestResultComponent;
import org.openelisglobal.unitofmeasure.valueholder.UnitOfMeasure;

public class FhirClinicalTestReadinessTest {
    private org.openelisglobal.test.valueholder.Test test;
    private TestResultComponent component;
    private FhirClinicalTestReadiness readiness;
    private TestResultComponentService components;

    @Before
    public void setUp() {
        components = mock(TestResultComponentService.class);
        readiness = new FhirClinicalTestReadiness(components);
        test = new org.openelisglobal.test.valueholder.Test();
        test.setId("1");
        test.setIsActive("Y");
        var section = new TestSection();
        section.setIsActive("Y");
        test.setTestSection(section);
        var unit = new UnitOfMeasure();
        unit.setId("2");
        unit.setName("%");
        test.setUnitOfMeasure(unit);
        component = new TestResultComponent();
        component.setId("7adb6e95-6f97-4516-8bad-afc820e6f112");
        component.setIsPrimary(true);
        component.setResultType("N");
        component.setUomId("2");
        component.setSignificantDigits(1);
        when(components.getActiveComponentsByTestId("1")).thenReturn(List.of(component));
    }

    @Test
    public void currentNumericComponentDoesNotRequireLegacyAnalyte() {
        readiness.validate(test);
    }

    @Test
    public void missingUnitIsRejected() {
        test.setUnitOfMeasure(null);
        assertThrows(UnprocessableEntityException.class, () -> readiness.validate(test));
    }

    @Test
    public void differentComponentUnitIsRejected() {
        component.setUomId("3");
        assertThrows(UnprocessableEntityException.class, () -> readiness.validate(test));
    }

    @Test public void multiComponentTestCannotLoseResults() { when(components.getActiveComponentsByTestId("1")).thenReturn(List.of(component, new TestResultComponent())); assertThrows(UnprocessableEntityException.class, () -> readiness.validate(test)); }

    @Test
    public void inactiveSectionIsRejected() {
        test.getTestSection().setIsActive("N");
        assertThrows(UnprocessableEntityException.class, () -> readiness.validate(test));
    }

    @Test
    public void missingPrecisionIsRejected() {
        component.setSignificantDigits(null);
        assertThrows(UnprocessableEntityException.class, () -> readiness.validate(test));
    }

    @Test
    public void resultCarriesCatalogPrecisionAndComponentIntoReview() {
        var item = new org.openelisglobal.test.beanItems.TestResultItem();
        item.setResultValue("13.5");
        readiness.configureResult(test, item);
        assertEquals(1, item.getSignificantDigits());
        assertEquals(component.getId(), item.getTestResultComponentId());
        assertEquals("13.5", item.getResultValue());
    }

    @Test
    public void resultCannotBeSilentlyTruncatedToCatalogPrecision() {
        var item = new org.openelisglobal.test.beanItems.TestResultItem();
        item.setResultValue("13.56");
        assertThrows(UnprocessableEntityException.class, () -> readiness.configureResult(test, item));
    }
}

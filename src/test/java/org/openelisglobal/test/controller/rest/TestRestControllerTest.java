package org.openelisglobal.test.controller.rest;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.service.TypeOfSampleTestService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.typeofsample.valueholder.TypeOfSampleTest;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

public class TestRestControllerTest {

    private TestService testService;
    private TypeOfSampleService typeOfSampleService;
    private TypeOfSampleTestService typeOfSampleTestService;
    private TestRestController controller;

    @Before
    public void setUp() {
        testService = mock(TestService.class);
        typeOfSampleService = mock(TypeOfSampleService.class);
        typeOfSampleTestService = mock(TypeOfSampleTestService.class);
        controller = new TestRestController();
        ReflectionTestUtils.setField(controller, "testService", testService);
        ReflectionTestUtils.setField(controller, "typeOfSampleService", typeOfSampleService);
        ReflectionTestUtils.setField(controller, "typeOfSampleTestService", typeOfSampleTestService);
    }

    @Test
    public void returnsOnlyActiveConfiguredSampleTypes() {
        org.openelisglobal.test.valueholder.Test test = mock(org.openelisglobal.test.valueholder.Test.class);
        when(test.getId()).thenReturn("11");
        when(test.getName()).thenReturn("Glucose");
        when(test.getLocalizedTestName()).thenReturn(null);
        when(testService.get("11")).thenReturn(test);

        TypeOfSampleTest activeLink = link("21");
        TypeOfSampleTest inactiveLink = link("22");
        when(typeOfSampleTestService.getTypeOfSampleTestsForTest("11"))
                .thenReturn(List.of(activeLink, inactiveLink));

        TypeOfSample active = sampleType("21", "Serum", true);
        TypeOfSample inactive = sampleType("22", "Archived plasma", false);
        when(typeOfSampleService.get("21")).thenReturn(active);
        when(typeOfSampleService.get("22")).thenReturn(inactive);

        ResponseEntity<Map<String, Object>> response = controller.getTestSampleTypes("11");

        assertTrue(response.getStatusCode().is2xxSuccessful());
        List<?> tests = (List<?>) response.getBody().get("tests");
        Map<?, ?> testResult = (Map<?, ?>) tests.get(0);
        List<?> compatible = (List<?>) testResult.get("compatibleSampleTypes");
        assertEquals(1, compatible.size());
        assertEquals("21", ((Map<?, ?>) compatible.get(0)).get("id"));
    }

    private TypeOfSampleTest link(String sampleTypeId) {
        TypeOfSampleTest link = new TypeOfSampleTest();
        link.setTypeOfSampleId(sampleTypeId);
        link.setTestId("11");
        return link;
    }

    private TypeOfSample sampleType(String id, String description, boolean active) {
        TypeOfSample sampleType = new TypeOfSample();
        sampleType.setId(id);
        sampleType.setDescription(description);
        sampleType.setIsActive(active);
        return sampleType;
    }
}

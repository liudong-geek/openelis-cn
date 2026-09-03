package org.openelisglobal.dataexchange.fhir;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.List;
import org.hl7.fhir.r4.model.CodeableConcept;
import org.junit.Test;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformServiceImpl;
import org.openelisglobal.testterminology.service.TestTerminologyMappingService;
import org.springframework.test.util.ReflectionTestUtils;

public class FhirTestCodeMappingTest {
    @Test
    public void catalogWithoutLoincStillHasStableCodeInResultsAndReports() {
        var service = new FhirTransformServiceImpl();
        var mappings = mock(TestTerminologyMappingService.class);
        var config = mock(FhirConfig.class);
        when(config.getOeFhirSystem()).thenReturn("http://openelis-global.org");
        when(mappings.getActiveByTestId("419")).thenReturn(List.of());
        ReflectionTestUtils.setField(service, "testTerminologyMappingService", mappings);
        ReflectionTestUtils.setField(service, "fhirConfig", config);
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId("419");
        test.setGuid("796cf0cc-148e-4d93-b89a-b5c8ec282ecf");
        test.setName("接口测试项目");
        CodeableConcept code = ReflectionTestUtils.invokeMethod(service, "transformTestToCodeableConcept", test);
        assertEquals(1, code.getCoding().size());
        assertEquals("http://openelis-global.org/test-guid", code.getCodingFirstRep().getSystem());
        assertEquals(test.getGuid(), code.getCodingFirstRep().getCode());
    }
}

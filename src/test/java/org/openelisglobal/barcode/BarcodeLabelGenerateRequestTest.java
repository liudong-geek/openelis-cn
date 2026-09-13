package org.openelisglobal.barcode;

import static org.junit.Assert.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;
import org.openelisglobal.barcode.dto.BarcodeLabelGenerateRequest;
import org.openelisglobal.barcode.exception.BarcodeLabelGenerationException;

public class BarcodeLabelGenerateRequestTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final String valid = "{\"orderId\":\"12\",\"labNumber\":\"TEST260001\",\"labels\":[{\"type\":\"order\",\"sampleItemId\":null,\"quantity\":2}]}";

    @Test
    public void acceptsOnlyExplicitKnownContract() throws Exception {
        var request = BarcodeLabelGenerateRequest.fromJson(mapper.readTree(valid));
        assertEquals("12", request.orderId());
        assertEquals(2, request.labels().get(0).quantity());
    }

    @Test
    public void rejectsCoercedOrNonIntegralQuantity() throws Exception {
        for (String quantity : new String[] {"\"2\"", "2.0", "true", "null", "0", "-1", "101", "2147483648"}) {
            rejects(valid.replace("\"quantity\":2", "\"quantity\":" + quantity));
        }
    }

    @Test
    public void rejectsOverrideAndOtherUnknownFields() throws Exception {
        rejects(valid.replace("\"orderId\"", "\"override\":true,\"orderId\""));
        rejects(valid.replace("\"quantity\":2", "\"quantity\":2,\"override\":true"));
    }

    @Test
    public void rejectsMissingIdentifiersAndAmbiguousType() throws Exception {
        rejects(valid.replace("\"12\"", "null"));
        rejects(valid.replace("\"TEST260001\"", "\"\""));
        rejects(valid.replace("\"type\":\"order\"", "\"type\":\"default\""));
        rejects(valid.replace("\"sampleItemId\":null", "\"sampleItemId\":\"41\""));
        rejects(valid.replace("\"type\":\"order\"", "\"type\":\"specimen\""));
        rejects("null");
    }

    private void rejects(String json) throws Exception {
        try {
            BarcodeLabelGenerateRequest.fromJson(mapper.readTree(json));
            fail("Invalid request accepted");
        } catch (BarcodeLabelGenerationException expected) {
            assertEquals(400, expected.getStatus());
        }
    }
}

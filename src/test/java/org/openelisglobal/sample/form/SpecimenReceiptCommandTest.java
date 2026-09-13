package org.openelisglobal.sample.form;

import static org.junit.Assert.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;
import org.openelisglobal.sample.exception.EntrySubmissionException;

public class SpecimenReceiptCommandTest {
    private final ObjectMapper json = new ObjectMapper();

    private ObjectNode body() throws Exception {
        return (ObjectNode) json.readTree(
                "{\"sampleId\":\"701\",\"labNo\":\"SIM-701\",\"patientId\":\"801\",\"tubes\":[{\"requestId\":\"901\",\"sampleItemId\":\"1001\",\"collectionDate\":\"2026-09-01T01:00:00.123456Z\",\"receivedDate\":\"2026-09-01T02:00:00.123Z\"}]}");
    }

    private void rejected(com.fasterxml.jackson.databind.JsonNode body) {
        try {
            SpecimenReceiptCommand.fromJson(body);
            fail("invalid request accepted");
        } catch (EntrySubmissionException expected) {
            assertEquals(400, expected.getStatus());
        }
    }

    @Test
    public void strictValidRequestKeepsPrecision() throws Exception {
        var command = SpecimenReceiptCommand.fromJson(body());
        assertEquals(123456000, command.tubes().get(0).collectionDate().getNano());
    }

    @Test
    public void arbitraryOrderFieldsCannotBeWritten() throws Exception {
        rejected(body().put("diagnosis", "SIM"));
    }

    @Test
    public void clientCannotAssignReceiver() throws Exception {
        var input = body();
        ((ObjectNode) input.at("/tubes/0")).put("receivedBy", "1");
        rejected(input);
    }

    @Test
    public void noNumericIdCoercion() throws Exception {
        rejected(body().put("sampleId", 701));
    }

    @Test
    public void emptyAndDuplicateTubesRejected() throws Exception {
        var input = body();
        input.withArray("tubes").add(input.at("/tubes/0").deepCopy());
        rejected(input);
        input.withArray("tubes").removeAll();
        rejected(input);
    }

    @Test
    public void excessiveBatchRejected() throws Exception {
        var input = body();
        for (int i = 0; i < 100; i++) {
            input.withArray("tubes").add(input.at("/tubes/0").deepCopy());
        }
        rejected(input);
    }

    @Test
    public void dateCalendarTimezoneAndPrecisionAreStrict() throws Exception {
        for (String value : new String[] { "2026-02-30T02:00:00Z", "2026-09-01T24:00:00Z", "2026-09-01T23:59:60Z",
                "2026-09-01T02:00:00", "2026-09-01T02:00:00+08:00", "2026-09-01T02:00:00.1234567Z" }) {
            var input = body();
            ((ObjectNode) input.at("/tubes/0")).put("receivedDate", value);
            rejected(input);
        }
    }

    @Test
    public void receiptBeforeCollectionRejected() throws Exception {
        var input = body();
        ((ObjectNode) input.at("/tubes/0")).put("receivedDate", "2026-09-01T00:00:00Z");
        rejected(input);
    }

    @Test
    public void missingNullOrOversizedIdsRejected() throws Exception {
        rejected(null);
        rejected(body().put("patientId", "2147483648"));
        var input = body();
        input.remove("patientId");
        rejected(input);
    }
}

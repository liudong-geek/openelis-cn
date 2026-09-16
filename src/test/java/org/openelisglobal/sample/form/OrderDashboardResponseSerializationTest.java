package org.openelisglobal.sample.form;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.annotation.JsonInclude.Include;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.config.AppConfig;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.mock.http.MockHttpOutputMessage;

public class OrderDashboardResponseSerializationTest {
    private MappingJackson2HttpMessageConverter converter;

    @Before
    public void setUp() {
        // Exercise the production HTTP converter without starting Spring or a database.
        converter = new AppConfig().jacksonMessageConverter();
        assertEquals(Include.NON_NULL,
                converter.getObjectMapper().getSerializationConfig().getDefaultPropertyInclusion().getValueInclusion());
    }

    @Test
    public void unqueriedExternalCountIsExplicitNullWithTheProductionConverter() throws Exception {
        JsonNode json = serialize(new OrderDashboardResponse(List.of(), 0, null, 1, 25, "not_included", false));

        assertTrue("The HTTP contract must distinguish an unqueried count from a missing field",
                json.has("externalCount"));
        assertTrue(json.get("externalCount").isNull());
        assertEquals("not_included", json.get("externalCountScope").asText());
        assertTrue(json.has("externalOrdersIncluded"));
        assertFalse(json.get("externalOrdersIncluded").asBoolean());
        assertTrue(json.get("orders").isArray());
        assertEquals(0, json.get("totalCount").asLong());
    }

    @Test
    public void zeroAndPositiveCountsRemainJsonNumbers() throws Exception {
        for (long count : new long[] { 0, 17 }) {
            JsonNode json = serialize(new OrderDashboardResponse(List.of(), 0, count, 1, 25, "included", true));
            assertTrue(json.get("externalCount").isIntegralNumber());
            assertEquals(count, json.get("externalCount").asLong());
        }
    }

    @Test
    public void explicitCountNullDoesNotChangeOtherNullOrBooleanFieldPolicies() throws Exception {
        OrderDashboardResponse.Order order = new OrderDashboardResponse.Order("42", "LAB-42", null, "routine", false,
                false, null, null, Map.of("enter", false, "collect", false, "label", false, "qa", false), "in_progress",
                false, "registration_pending", "specimen_intake", "not_tracked", false, false, false, false,
                "stored_checklist_snapshot", new OrderDashboardResponse.DecisionSummary(0, 0, 1, 0, false),
                "generated_counter_not_physical_print");
        JsonNode json = serialize(new OrderDashboardResponse(List.of(order), 1, null, 1, 25, "not_included", false));
        JsonNode row = json.get("orders").get(0);

        assertFalse(row.has("patientName"));
        assertFalse(row.has("facilityName"));
        assertFalse(row.has("lastUpdated"));
        assertTrue(row.has("isExternal"));
        assertFalse(row.get("isExternal").asBoolean());
        assertFalse(row.has("external"));
        assertFalse(row.get("stepProgress").get("qa").asBoolean());
        assertEquals("not_tracked", row.get("reportStatus").asText());
    }

    private JsonNode serialize(OrderDashboardResponse response) throws Exception {
        MockHttpOutputMessage output = new MockHttpOutputMessage();
        converter.write(response, MediaType.APPLICATION_JSON, output);
        return converter.getObjectMapper().readTree(output.getBodyAsBytes());
    }
}

package org.openelisglobal.system.controller.rest;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.time.Instant;
import java.time.ZonedDateTime;
import org.junit.Test;

public class SystemRestControllerTest {
    @Test
    public void oneShanghaiSnapshotProvidesMatchingWallClockAndReceiptCompatibleUtcInstant() {
        var snapshot = ZonedDateTime.parse("2026-09-26T11:21:15.123456789+08:00[Asia/Shanghai]");

        var response = SystemRestController.serverTime(snapshot);

        assertEquals("2026-09-26", response.get("date"));
        assertEquals("11:21", response.get("time"));
        assertEquals("Asia/Shanghai", response.get("timezone"));
        assertEquals("2026-09-26T03:21:15.123Z", response.get("instant"));
        assertEquals(snapshot.toInstant().toEpochMilli(), Instant.parse((String) response.get("instant")).toEpochMilli());
        assertTrue(((String) response.get("instant"))
                .matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z"));
    }
}

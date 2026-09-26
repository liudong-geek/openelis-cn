package org.openelisglobal.system.controller.rest;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import org.openelisglobal.common.log.LogEvent;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/rest")
public class SystemRestController {

    @GetMapping(value = "/server-time", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> getServerTime() {
        try {
            ZoneId zoneId = ZoneId.systemDefault();
            ZonedDateTime now = ZonedDateTime.now(zoneId);
            return ResponseEntity.ok(serverTime(now));
        } catch (Exception e) {
            LogEvent.logError(this.getClass().getName(), "getServerTime",
                    "Error getting server time: " + e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    static Map<String, Object> serverTime(ZonedDateTime now) {
        Map<String, Object> response = new HashMap<>();
        response.put("date", now.format(DateTimeFormatter.ISO_LOCAL_DATE));
        response.put("time", now.format(DateTimeFormatter.ofPattern("HH:mm")));
        response.put("timezone", now.getZone().getId());
        response.put("instant", now.toInstant().truncatedTo(ChronoUnit.MILLIS).toString());
        return response;
    }
}

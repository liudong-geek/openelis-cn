package org.openelisglobal.integration.outbox;

import jakarta.servlet.http.HttpServletRequest;
import java.time.OffsetDateTime;
import java.util.List;
import org.openelisglobal.common.util.ControllerUtills;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/rest/his-result-outbox")
@PreAuthorize("hasRole('ADMIN')")
public class HisResultOutboxRestController extends ControllerUtills {

  private final HisResultOutboxService service;

  public HisResultOutboxRestController(HisResultOutboxService service) {
    this.service = service;
  }

  @GetMapping
  public List<OutboxResponse> list(
      @RequestParam(required = false) HisResultOutboxStatus status,
      @RequestParam(defaultValue = "100") int limit) {
    return service.list(status, limit).stream().map(OutboxResponse::from).toList();
  }

  @PostMapping("/simulate")
  public ResponseEntity<OutboxResponse> simulate(
      @RequestBody SimulationRequest request, HttpServletRequest httpRequest) {
    OffsetDateTime now = OffsetDateTime.now();
    String owner = getSysUserId(httpRequest);
    HisResultOutbox message =
        service.enqueue(
            request.sourceSystem(),
            request.businessId(),
            request.eventType(),
            request.idempotencyKey(),
            request.payload(),
            request.maxAttempts(),
            owner,
            now);
    if (request.outcome() != null) {
      boolean acknowledged = request.outcome() == SimulationOutcome.ACKNOWLEDGED;
      message =
          service.recordAttempt(
              message.getId(),
              acknowledged,
              acknowledged ? "AA" : "AE",
              acknowledged ? "SIMULATED_ACK" : "SIMULATED_REJECT",
              acknowledged ? null : "模拟接收端拒绝",
              now);
    }
    return ResponseEntity.ok(OutboxResponse.from(message));
  }

  @PutMapping("/{id}/retry")
  public OutboxResponse retry(@PathVariable Long id, HttpServletRequest request) {
    return OutboxResponse.from(service.retry(id, getSysUserId(request), OffsetDateTime.now()));
  }

  @PutMapping("/{id}/receipt")
  public OutboxResponse receipt(@PathVariable Long id, @RequestBody ReceiptRequest request) {
    return OutboxResponse.from(
        service.recordAttempt(
            id,
            request.acknowledged(),
            request.responseCode(),
            request.responseBody(),
            request.error(),
            OffsetDateTime.now()));
  }

  @PutMapping("/{id}/close")
  public OutboxResponse close(
      @PathVariable Long id, @RequestBody CloseRequest closeRequest, HttpServletRequest request) {
    return OutboxResponse.from(service.close(id, closeRequest.reason(), getSysUserId(request)));
  }

  public record SimulationRequest(
      String sourceSystem,
      String businessId,
      HisResultEventType eventType,
      String idempotencyKey,
      String payload,
      int maxAttempts,
      SimulationOutcome outcome) {}

  public enum SimulationOutcome {
    ACKNOWLEDGED,
    FAILED
  }

  public record ReceiptRequest(
      boolean acknowledged, String responseCode, String responseBody, String error) {}

  public record CloseRequest(String reason) {}

  public record OutboxResponse(
      Long id,
      String sourceSystem,
      String businessId,
      HisResultEventType eventType,
      String idempotencyKey,
      String payloadHash,
      HisResultOutboxStatus status,
      int attemptCount,
      int maxAttempts,
      OffsetDateTime nextAttemptAt,
      String responseCode,
      String responseBody,
      String lastError,
      String owner,
      String closeReason,
      OffsetDateTime createdAt,
      OffsetDateTime acknowledgedAt) {

    static OutboxResponse from(HisResultOutbox message) {
      return new OutboxResponse(
          message.getId(),
          message.getSourceSystem(),
          message.getBusinessId(),
          message.getEventType(),
          message.getIdempotencyKey(),
          message.getPayloadHash(),
          message.getStatus(),
          message.getAttemptCount(),
          message.getMaxAttempts(),
          message.getNextAttemptAt(),
          message.getResponseCode(),
          message.getResponseBody(),
          message.getLastError(),
          message.getOwner(),
          message.getCloseReason(),
          message.getCreatedAt(),
          message.getAcknowledgedAt());
    }
  }
}

package org.openelisglobal.integration.outbox;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import org.openelisglobal.common.valueholder.BaseObject;

@Entity
@Table(name = "his_result_outbox")
public class HisResultOutbox extends BaseObject<Long> {

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "his_result_outbox_generator")
  @SequenceGenerator(
      name = "his_result_outbox_generator",
      sequenceName = "his_result_outbox_seq",
      allocationSize = 1)
  private Long id;

  @Column(name = "source_system", nullable = false, length = 80)
  private String sourceSystem;

  @Column(name = "business_id", nullable = false, length = 120)
  private String businessId;

  @Enumerated(EnumType.STRING)
  @Column(name = "event_type", nullable = false, length = 30)
  private HisResultEventType eventType;

  @Column(name = "idempotency_key", nullable = false, length = 128, updatable = false)
  private String idempotencyKey;

  @Column(name = "payload", nullable = false, columnDefinition = "TEXT", updatable = false)
  private String payload;

  @Column(name = "payload_hash", nullable = false, length = 64, updatable = false)
  private String payloadHash;

  @Enumerated(EnumType.STRING)
  @Column(name = "status", nullable = false, length = 30)
  private HisResultOutboxStatus status;

  @Column(name = "attempt_count", nullable = false)
  private int attemptCount;

  @Column(name = "max_attempts", nullable = false)
  private int maxAttempts;

  @Column(name = "next_attempt_at", columnDefinition = "TIMESTAMP WITH TIME ZONE")
  private OffsetDateTime nextAttemptAt;

  @Column(name = "response_code", length = 40)
  private String responseCode;

  @Column(name = "response_body", columnDefinition = "TEXT")
  private String responseBody;

  @Column(name = "last_error", columnDefinition = "TEXT")
  private String lastError;

  @Column(name = "owner", length = 120)
  private String owner;

  @Column(name = "close_reason", columnDefinition = "TEXT")
  private String closeReason;

  @Column(
      name = "created_at",
      nullable = false,
      updatable = false,
      columnDefinition = "TIMESTAMP WITH TIME ZONE")
  private OffsetDateTime createdAt;

  @Column(name = "acknowledged_at", columnDefinition = "TIMESTAMP WITH TIME ZONE")
  private OffsetDateTime acknowledgedAt;

  @Override
  public Long getId() {
    return id;
  }

  @Override
  public void setId(Long id) {
    this.id = id;
  }

  public String getSourceSystem() {
    return sourceSystem;
  }

  public void setSourceSystem(String sourceSystem) {
    this.sourceSystem = sourceSystem;
  }

  public String getBusinessId() {
    return businessId;
  }

  public void setBusinessId(String businessId) {
    this.businessId = businessId;
  }

  public HisResultEventType getEventType() {
    return eventType;
  }

  public void setEventType(HisResultEventType eventType) {
    this.eventType = eventType;
  }

  public String getIdempotencyKey() {
    return idempotencyKey;
  }

  public void setIdempotencyKey(String idempotencyKey) {
    this.idempotencyKey = idempotencyKey;
  }

  public String getPayload() {
    return payload;
  }

  public void setPayload(String payload) {
    this.payload = payload;
  }

  public String getPayloadHash() {
    return payloadHash;
  }

  public void setPayloadHash(String payloadHash) {
    this.payloadHash = payloadHash;
  }

  public HisResultOutboxStatus getStatus() {
    return status;
  }

  public void setStatus(HisResultOutboxStatus status) {
    this.status = status;
  }

  public int getAttemptCount() {
    return attemptCount;
  }

  public void setAttemptCount(int attemptCount) {
    this.attemptCount = attemptCount;
  }

  public int getMaxAttempts() {
    return maxAttempts;
  }

  public void setMaxAttempts(int maxAttempts) {
    this.maxAttempts = maxAttempts;
  }

  public OffsetDateTime getNextAttemptAt() {
    return nextAttemptAt;
  }

  public void setNextAttemptAt(OffsetDateTime nextAttemptAt) {
    this.nextAttemptAt = nextAttemptAt;
  }

  public String getResponseCode() {
    return responseCode;
  }

  public void setResponseCode(String responseCode) {
    this.responseCode = responseCode;
  }

  public String getResponseBody() {
    return responseBody;
  }

  public void setResponseBody(String responseBody) {
    this.responseBody = responseBody;
  }

  public String getLastError() {
    return lastError;
  }

  public void setLastError(String lastError) {
    this.lastError = lastError;
  }

  public String getOwner() {
    return owner;
  }

  public void setOwner(String owner) {
    this.owner = owner;
  }

  public String getCloseReason() {
    return closeReason;
  }

  public void setCloseReason(String closeReason) {
    this.closeReason = closeReason;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }

  public OffsetDateTime getAcknowledgedAt() {
    return acknowledgedAt;
  }

  public void setAcknowledgedAt(OffsetDateTime acknowledgedAt) {
    this.acknowledgedAt = acknowledgedAt;
  }
}

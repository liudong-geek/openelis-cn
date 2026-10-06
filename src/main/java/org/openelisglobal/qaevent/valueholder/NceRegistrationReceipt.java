package org.openelisglobal.qaevent.valueholder;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.openelisglobal.common.valueholder.BaseObject;
import org.openelisglobal.qaevent.form.NceRegistrationCommand;

/**
 * Technical ledger; a pending claim exists only in its uncommitted operation
 * transaction.
 */
@Entity
@Table(name = "nce_registration_receipt", schema = "clinlims")
public class NceRegistrationReceipt extends BaseObject<String> {
    @Id
    @Column(name = "request_id", length = 36, nullable = false, updatable = false)
    private String id;
    @Column(name = "created_by", length = 20, nullable = false, updatable = false)
    private String createdBy;
    @Column(name = "operation", length = 24, nullable = false, updatable = false)
    private String operation;
    @Column(name = "request_hash", length = 64, nullable = false, updatable = false)
    private String requestHash;
    @Column(name = "hash_version", length = 24, nullable = false, updatable = false)
    private String hashVersion;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "event_id")
    private Integer eventId;
    @Column(name = "response_json", columnDefinition = "text")
    private String responseJson;

    public static NceRegistrationReceipt claim(String key, String actor, String operation, String hash) {
        var r = new NceRegistrationReceipt();
        r.id = NceRegistrationCommand.key(key);
        r.createdBy = NceRegistrationCommand.id(actor);
        if (!java.util.Set.of("CREATE", "ACKNOWLEDGE", "ADD_NOTE", "ASSIGN").contains(operation) || hash == null
                || !hash.matches("[a-f0-9]{64}"))
            throw new IllegalArgumentException("INVALID_NCE_RECEIPT");
        r.operation = operation;
        r.requestHash = hash;
        r.hashVersion = "NCE_V2_SHA256_1";
        r.createdAt = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        return r;
    }

    public void complete(Integer eventId, String response) {
        if (responseJson != null || eventId == null || eventId < 1 || response == null || response.isBlank())
            throw new IllegalStateException("INVALID_NCE_RECEIPT_COMPLETION");
        this.eventId = eventId;
        this.responseJson = response;
    }

    @Override
    public String getId() {
        return id;
    }

    @Override
    public void setId(String id) {
        if (this.id != null)
            throw new IllegalStateException("IMMUTABLE_NCE_RECEIPT");
        this.id = NceRegistrationCommand.key(id);
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public String getOperation() {
        return operation;
    }

    public String getRequestHash() {
        return requestHash;
    }

    public String getHashVersion() {
        return hashVersion;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Integer getEventId() {
        return eventId;
    }

    public String getResponseJson() {
        return responseJson;
    }
}

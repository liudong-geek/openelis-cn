package org.openelisglobal.sample.valueholder;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.openelisglobal.common.valueholder.BaseObject;
import org.openelisglobal.sample.service.EntrySubmissionCommand;

/** A local first-entry transaction ledger, not a patient or report entity. */
@Entity
@Table(name = "entry_submission_receipt", schema = "clinlims")
public class EntrySubmissionReceipt extends BaseObject<String> {
    @Id
    @Column(name = "submission_id", length = 36, nullable = false, updatable = false)
    private String id;
    @Column(name = "created_by", length = 20, nullable = false, updatable = false)
    private String createdBy;
    @Column(name = "hash_version", length = 24, nullable = false, updatable = false)
    private String hashVersion;
    @Column(name = "request_hash", length = 64, nullable = false, updatable = false)
    private String requestHash;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "response_json", columnDefinition = "text")
    private String responseJson;

    public static EntrySubmissionReceipt claim(String key, String actor, String hash) {
        var receipt = new EntrySubmissionReceipt();
        receipt.id = EntrySubmissionCommand.validateKey(key);
        if (actor == null || !actor.matches("[1-9][0-9]{0,19}") || hash == null || !hash.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("Invalid submission identity");
        }
        receipt.createdBy = actor;
        receipt.requestHash = hash;
        receipt.hashVersion = EntrySubmissionCommand.HASH_VERSION;
        // PostgreSQL/JDBC timestamps do not preserve arbitrary nanoseconds.
        // Freeze a millisecond value shared by the row and its response snapshot.
        receipt.createdAt = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        return receipt;
    }

    public void complete(String json) {
        if (responseJson != null || json == null || json.isBlank()) {
            throw new IllegalStateException("A submission receipt can only be completed once");
        }
        responseJson = json;
    }

    @Override public String getId() { return id; }
    @Override public void setId(String value) {
        if (id != null) { throw new IllegalStateException("Immutable submission identity"); }
        id = EntrySubmissionCommand.validateKey(value);
    }
    public String getCreatedBy() { return createdBy; }
    public String getHashVersion() { return hashVersion; }
    public String getRequestHash() { return requestHash; }
    public Instant getCreatedAt() { return createdAt; }
    public String getResponseJson() { return responseJson; }
}

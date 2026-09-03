package org.openelisglobal.fhir.valueholder;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.test.valueholder.Test;

/**
 * Immutable intake receipt: source identity, payload hash and local order link.
 */
@Entity
@Table(name = "fhir_intake_receipt", schema = "clinlims")
@Getter
@Setter
public class FhirIntakeReceipt {
    @Id
    @Column(name = "fhir_uuid", nullable = false)
    private UUID id;
    @Column(name = "source_system", nullable = false, length = 255)
    private String sourceSystem;
    @Column(name = "external_id", nullable = false, length = 80)
    private String externalId;
    @Column(name = "payload_hash", nullable = false, length = 64)
    private String payloadHash;
    @Column(name = "payload_json", nullable = false, columnDefinition = "text")
    private String payloadJson;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sample_id", nullable = false)
    private Sample sample;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "test_id", nullable = false)
    private Test test;
    @Column(name = "created_by", nullable = false, length = 20)
    private String createdBy;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}

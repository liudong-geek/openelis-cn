package org.openelisglobal.sample.valueholder;

import jakarta.persistence.*;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.hibernate.annotations.GenericGenerator;
import org.hibernate.annotations.Parameter;
import org.hibernate.annotations.Type;
import org.openelisglobal.common.valueholder.BaseObject;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;

/**
 * Immutable provenance of a distinct replacement request, never a change to the
 * rejected tube.
 */
@Entity
@Table(name = "specimen_recollection", schema = "clinlims", uniqueConstraints = {
        @UniqueConstraint(name = "uq_recollection_operation", columnNames = "operation_id"),
        @UniqueConstraint(name = "uq_recollection_source", columnNames = "source_sample_item_id"),
        @UniqueConstraint(name = "uq_recollection_request", columnNames = "request_id") })
public class SpecimenRecollection extends BaseObject<String> {
    @Id
    @GeneratedValue(generator = "specimen_recollection_id")
    @GenericGenerator(name = "specimen_recollection_id", strategy = "org.openelisglobal.hibernate.resources.StringSequenceGenerator", parameters = {
            @Parameter(name = "sequence_name", value = "clinlims.specimen_recollection_seq"),
            @Parameter(name = "increment_size", value = "1") })
    @Column(name = "id", precision = 10, scale = 0, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String id;
    @Column(name = "operation_id", length = 36, nullable = false, updatable = false)
    private String operationId;
    @Column(name = "sample_id", precision = 10, scale = 0, nullable = false, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String sampleId;
    @Column(name = "lab_no", length = 25, nullable = false, updatable = false)
    private String labNo;
    @Column(name = "patient_id", precision = 10, scale = 0, nullable = false, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String patientId;
    @Column(name = "source_request_id", precision = 10, scale = 0, nullable = false, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String sourceRequestId;
    @Column(name = "source_sample_item_id", precision = 10, scale = 0, nullable = false, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String sourceSampleItemId;
    @Column(name = "source_decision_id", precision = 10, scale = 0, nullable = false, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String sourceDecisionId;
    @Column(name = "request_id", precision = 10, scale = 0, nullable = false, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String requestId;
    @Column(name = "created_by", precision = 10, scale = 0, nullable = false, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String createdBy;
    @Column(name = "evidence_digest", length = 64, nullable = false, updatable = false)
    private String evidenceDigest;
    @Column(name = "receipt_json", columnDefinition = "text", nullable = false, updatable = false)
    private String receiptJson;
    @Column(name = "receipt_digest", length = 64, nullable = false, updatable = false)
    private String receiptDigest;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected SpecimenRecollection() {
    }

    public static SpecimenRecollection record(String operationId, String sampleId, String labNo, String patientId,
            String sourceRequestId, String sourceSampleItemId, String sourceDecisionId, String requestId, String actor,
            String evidenceDigest, String receiptJson, Clock clock) {
        var row = new SpecimenRecollection();
        row.operationId = operationId;
        row.sampleId = sampleId;
        row.labNo = labNo;
        row.patientId = patientId;
        row.sourceRequestId = sourceRequestId;
        row.sourceSampleItemId = sourceSampleItemId;
        row.sourceDecisionId = sourceDecisionId;
        row.requestId = requestId;
        row.createdBy = actor;
        row.evidenceDigest = evidenceDigest;
        row.receiptJson = receiptJson;
        row.receiptDigest = receiptJson == null ? null : SpecimenIntakeEvidence.digest(receiptJson);
        row.createdAt = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        row.setSysUserId(actor);
        row.validateRecord();
        return row;
    }

    @PrePersist
    public void validateRecord() {
        if (id != null)
            SpecimenIntakeEvidence.requireId(id);
        for (String value : new String[] { sampleId, patientId, sourceRequestId, sourceSampleItemId, sourceDecisionId,
                requestId, createdBy })
            SpecimenIntakeEvidence.requireId(value);
        if (sourceRequestId.equals(requestId) || operationId == null
                || !operationId.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")
                || !UUID.fromString(operationId).toString().equals(operationId) || labNo == null
                || !labNo.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,24}") || evidenceDigest == null
                || !evidenceDigest.matches("[a-f0-9]{64}") || receiptJson == null || receiptJson.isBlank()
                || receiptJson.length() > 1048576 || receiptDigest == null
                || !receiptDigest.equals(SpecimenIntakeEvidence.digest(receiptJson)) || createdAt == null
                || !createdAt.isAfter(Instant.EPOCH) || !createdAt.equals(createdAt.truncatedTo(ChronoUnit.MILLIS))) {
            throw SpecimenIntakeEvidence.invalid();
        }
    }

    @PreUpdate
    @PreRemove
    public void denyMutation() {
        throw new IllegalStateException("Replacement request provenance cannot be updated or deleted");
    }

    @Override
    public String getId() {
        return id;
    }

    @Override
    public void setId(String id) {
        this.id = id;
    }

    public String getOperationId() {
        return operationId;
    }

    public String getSampleId() {
        return sampleId;
    }

    public String getLabNo() {
        return labNo;
    }

    public String getPatientId() {
        return patientId;
    }

    public String getSourceRequestId() {
        return sourceRequestId;
    }

    public String getSourceSampleItemId() {
        return sourceSampleItemId;
    }

    public String getSourceDecisionId() {
        return sourceDecisionId;
    }

    public String getRequestId() {
        return requestId;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public String getEvidenceDigest() {
        return evidenceDigest;
    }

    public String getReceiptJson() {
        return receiptJson;
    }

    public String getReceiptDigest() {
        return receiptDigest;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}

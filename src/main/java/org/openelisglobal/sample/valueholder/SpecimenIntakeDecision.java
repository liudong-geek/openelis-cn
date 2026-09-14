package org.openelisglobal.sample.valueholder;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreRemove;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import java.util.UUID;
import org.hibernate.annotations.GenericGenerator;
import org.hibernate.annotations.Parameter;
import org.hibernate.annotations.Type;
import org.openelisglobal.common.valueholder.BaseObject;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;

/**
 * First explicit human disposition of one tube. Subordinate evidence only: the
 * existing SampleItem owns lifecycle. No historical backfill or automatic entry
 * permission. The service must authorize and audit insertion in the same
 * transaction.
 */
@Entity
@Table(name = "specimen_intake_decision", schema = "clinlims", uniqueConstraints = {
        @UniqueConstraint(name = "uq_specimen_intake_tube", columnNames = "sample_item_id"),
        @UniqueConstraint(name = "uq_specimen_intake_operation", columnNames = "operation_id") })
public class SpecimenIntakeDecision extends BaseObject<String> {
    public enum Decision {
        ACCEPTED, REJECTED
    }

    public record Reason(String namespace, String id, String version, String label) {
        public Reason {
            if (namespace == null || !Set.of("DICTIONARY:resultRejectionReasons", "QA_EVENT").contains(namespace)
                    || label == null || label.isBlank() || label.length() > 500
                    || label.codePoints().anyMatch(Character::isISOControl)) {
                throw SpecimenIntakeEvidence.invalid();
            }
            SpecimenIntakeEvidence.requireId(id);
            SpecimenIntakeEvidence.time(version);
        }
    }

    @Id
    @GeneratedValue(generator = "specimen_intake_decision_id")
    @GenericGenerator(name = "specimen_intake_decision_id", strategy = "org.openelisglobal.hibernate.resources.StringSequenceGenerator", parameters = {
            @Parameter(name = "sequence_name", value = "clinlims.specimen_intake_decision_seq"),
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
    @Column(name = "request_id", precision = 10, scale = 0, nullable = false, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String requestId;
    @Column(name = "sample_item_id", precision = 10, scale = 0, nullable = false, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String sampleItemId;
    @Enumerated(EnumType.STRING)
    @Column(name = "decision", length = 8, nullable = false, updatable = false)
    private Decision decision;
    @Column(name = "reason_namespace", length = 48, updatable = false)
    private String reasonNamespace;
    @Column(name = "reason_id", precision = 10, scale = 0, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String reasonId;
    @Column(name = "reason_version", length = 32, updatable = false)
    private String reasonVersion;
    @Column(name = "reason_label", length = 500, updatable = false)
    private String reasonLabel;
    @Column(name = "evidence_json", columnDefinition = "text", nullable = false, updatable = false)
    private String evidenceJson;
    @Column(name = "evidence_digest", length = 64, nullable = false, updatable = false)
    private String evidenceDigest;
    @Column(name = "created_by", precision = 10, scale = 0, nullable = false, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String createdBy;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected SpecimenIntakeDecision() {
    }

    public static SpecimenIntakeDecision record(String operationId, String sampleId, String labNo, String patientId,
            String requestId, String sampleItemId, Decision decision, Reason reason, SpecimenIntakeEvidence evidence,
            String actorId, Clock serverClock) {
        var row = new SpecimenIntakeDecision();
        row.operationId = operationId;
        row.sampleId = sampleId;
        row.labNo = labNo;
        row.patientId = patientId;
        row.requestId = requestId;
        row.sampleItemId = sampleItemId;
        row.decision = decision;
        if (reason != null) {
            row.reasonNamespace = reason.namespace();
            row.reasonId = reason.id();
            row.reasonVersion = reason.version();
            row.reasonLabel = reason.label();
        }
        if (evidence == null || serverClock == null) {
            throw SpecimenIntakeEvidence.invalid();
        }
        row.evidenceJson = evidence.encode();
        row.evidenceDigest = SpecimenIntakeEvidence.digest(row.evidenceJson);
        row.createdBy = actorId;
        row.createdAt = serverClock.instant().truncatedTo(ChronoUnit.MILLIS);
        row.setSysUserId(actorId);
        row.validateRecord();
        return row;
    }

    @PrePersist
    public void validateRecord() {
        if (id != null) {
            SpecimenIntakeEvidence.requireId(id);
        }
        for (String value : new String[] { sampleId, patientId, requestId, sampleItemId, createdBy }) {
            SpecimenIntakeEvidence.requireId(value);
        }
        if (operationId == null || !operationId.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")
                || !UUID.fromString(operationId).toString().equals(operationId) || labNo == null
                || !labNo.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,24}") || decision == null) {
            throw SpecimenIntakeEvidence.invalid();
        }
        if (decision == Decision.ACCEPTED) {
            if (reasonNamespace != null || reasonId != null || reasonVersion != null || reasonLabel != null) {
                throw SpecimenIntakeEvidence.invalid();
            }
        } else {
            reason();
        }
        var facts = evidence();
        if (evidenceDigest == null || !evidenceDigest.equals(SpecimenIntakeEvidence.digest(evidenceJson))
                || createdAt == null || createdAt.isBefore(SpecimenIntakeEvidence.time(facts.receivedDate()))
                || !createdAt.equals(createdAt.truncatedTo(ChronoUnit.MILLIS))) {
            throw SpecimenIntakeEvidence.invalid();
        }
        // These are explicitly facts observed before this server-side decision.
        for (String version : new String[] { facts.sampleVersion(), facts.requestVersion(), facts.itemVersion() }) {
            if (SpecimenIntakeEvidence.time(version).isAfter(createdAt)) {
                throw SpecimenIntakeEvidence.invalid();
            }
        }
        for (var analysis : facts.analyses()) {
            if (SpecimenIntakeEvidence.time(analysis.version()).isAfter(createdAt)) {
                throw SpecimenIntakeEvidence.invalid();
            }
        }
        if (reasonVersion != null && SpecimenIntakeEvidence.time(reasonVersion).isAfter(createdAt)) {
            throw SpecimenIntakeEvidence.invalid();
        }
    }

    @PreUpdate
    @PreRemove
    public void denyMutation() {
        throw new IllegalStateException("First specimen decision cannot be replaced or removed");
    }

    public SpecimenIntakeEvidence evidence() {
        return SpecimenIntakeEvidence.decode(evidenceJson);
    }

    public Reason reason() {
        return decision == Decision.ACCEPTED ? null : new Reason(reasonNamespace, reasonId, reasonVersion, reasonLabel);
    }

    @Override
    public String getId() {
        return id;
    }

    @Override
    public void setId(String value) {
        if (id != null) {
            throw new IllegalStateException("Immutable first-decision identity");
        }
        id = SpecimenIntakeEvidence.requireId(value);
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

    public String getRequestId() {
        return requestId;
    }

    public String getSampleItemId() {
        return sampleItemId;
    }

    public Decision getDecision() {
        return decision;
    }

    public String getEvidenceJson() {
        return evidenceJson;
    }

    public String getEvidenceDigest() {
        return evidenceDigest;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}

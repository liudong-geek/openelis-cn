package org.openelisglobal.report.valueholder;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.GenericGenerator;
import org.hibernate.annotations.Parameter;
import org.hibernate.annotations.Type;
import org.openelisglobal.common.valueholder.BaseObject;

/**
 * Stable application/group identity, not a second release or snapshot model.
 * Current members describe the group; issued content must still be frozen on
 * PatientReportRelease. Preparation resolves and persists the complete server
 * configured group. The inherited lastupdated is the only ORM version. Members
 * are not changed implicitly; an explicit future regrouping transaction must
 * lock/version this parent as well as its members.
 */
@Entity
@Table(name = "report_document", schema = "clinlims", uniqueConstraints = {
        @UniqueConstraint(name = "uq_report_document_scope", columnNames = { "sample_id", "report_group_key" }),
        @UniqueConstraint(name = "uq_report_document_number", columnNames = "report_number"),
        @UniqueConstraint(name = "uq_report_document_uuid", columnNames = "fhir_uuid") })
public class ReportDocument extends BaseObject<String> {
    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(generator = "report_document_id")
    @GenericGenerator(name = "report_document_id", strategy = "org.openelisglobal.hibernate.resources.StringSequenceGenerator", parameters = {
            @Parameter(name = "sequence_name", value = "clinlims.report_document_seq"),
            @Parameter(name = "increment_size", value = "1") })
    @Column(name = "id", precision = 10, scale = 0, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String id;

    @NotBlank
    @Column(name = "patient_id", nullable = false, precision = 10, scale = 0, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String patientId;

    @NotBlank
    @Column(name = "sample_id", nullable = false, precision = 10, scale = 0, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String sampleId;

    @NotBlank
    @Size(max = 128)
    @Column(name = "report_group_key", nullable = false, length = 128, updatable = false)
    private String reportGroupKey;

    @NotBlank
    @Size(max = 64)
    @Column(name = "group_rule_version", nullable = false, length = 64, updatable = false)
    private String groupRuleVersion;

    @NotBlank
    @Size(max = 50)
    @Column(name = "report_number", nullable = false, length = 50, updatable = false)
    private String reportNumber;

    @Column(name = "fhir_uuid", nullable = false, updatable = false)
    private UUID fhirUuid;

    @NotBlank
    @Column(name = "created_by", nullable = false, precision = 10, scale = 0, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String createdBy;

    @NotNull
    @Column(name = "created_at", nullable = false, updatable = false)
    private Timestamp createdAt;

    @JsonIgnore
    @OneToMany(mappedBy = "document", fetch = FetchType.LAZY)
    @OrderBy("memberPosition ASC")
    private List<ReportDocumentMember> members = new ArrayList<>();

    @PrePersist
    public void ensureFhirUuid() {
        if (fhirUuid == null) {
            fhirUuid = UUID.randomUUID();
        }
    }

    @Override
    public String getId() {
        return id;
    }

    @Override
    public void setId(String id) {
        this.id = id;
    }

    public String getPatientId() {
        return patientId;
    }

    public void setPatientId(String patientId) {
        this.patientId = patientId;
    }

    public String getSampleId() {
        return sampleId;
    }

    public void setSampleId(String sampleId) {
        this.sampleId = sampleId;
    }

    public String getReportGroupKey() {
        return reportGroupKey;
    }

    public void setReportGroupKey(String reportGroupKey) {
        this.reportGroupKey = reportGroupKey;
    }

    public String getGroupRuleVersion() {
        return groupRuleVersion;
    }

    public void setGroupRuleVersion(String groupRuleVersion) {
        this.groupRuleVersion = groupRuleVersion;
    }

    public String getReportNumber() {
        return reportNumber;
    }

    public void setReportNumber(String reportNumber) {
        this.reportNumber = reportNumber;
    }

    public UUID getFhirUuid() {
        return fhirUuid;
    }

    public void setFhirUuid(UUID fhirUuid) {
        this.fhirUuid = fhirUuid;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }

    public Timestamp getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Timestamp createdAt) {
        this.createdAt = createdAt;
    }

    public List<ReportDocumentMember> getMembers() {
        return members;
    }

    public void setMembers(List<ReportDocumentMember> members) {
        this.members = members;
    }
}

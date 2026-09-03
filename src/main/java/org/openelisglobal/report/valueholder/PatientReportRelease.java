package org.openelisglobal.report.valueholder;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Basic;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.sql.Timestamp;
import org.hibernate.annotations.Type;
import org.openelisglobal.common.valueholder.BaseObject;

/**
 * Immutable PDF snapshot and lifecycle metadata for a formally issued patient
 * result report. Draft rows are signed through the existing electronic-signature
 * ceremony before they can transition to {@link PatientReportReleaseStatus#ISSUED}.
 */
@Entity
@Table(name = "patient_report_release", schema = "clinlims")
public class PatientReportRelease extends BaseObject<Long> {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "patient_report_release_seq_gen")
    @SequenceGenerator(name = "patient_report_release_seq_gen", sequenceName = "patient_report_release_seq", schema = "clinlims", allocationSize = 1)
    @Column(name = "id")
    private Long id;

    @Column(name = "patient_id", nullable = false, precision = 10, scale = 0)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String patientId;

    @Column(name = "report_number", nullable = false, length = 50, unique = true)
    private String reportNumber;

    @Column(name = "report_version", nullable = false)
    private Integer reportVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PatientReportReleaseStatus status;

    @Column(name = "created_by", nullable = false, precision = 10, scale = 0)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Timestamp createdAt;

    @Column(name = "issued_by", precision = 10, scale = 0)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String issuedBy;

    @Column(name = "issued_at")
    private Timestamp issuedAt;

    @Column(name = "issued_signature_id")
    private Long issuedSignatureId;

    @Column(name = "supersedes_release_id")
    private Long supersedesReleaseId;

    @Column(name = "amendment_reason", columnDefinition = "TEXT")
    private String amendmentReason;

    @Column(name = "voided_by", precision = 10, scale = 0)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String voidedBy;

    @Column(name = "voided_at")
    private Timestamp voidedAt;

    @Column(name = "void_signature_id")
    private Long voidSignatureId;

    @Column(name = "void_reason", columnDefinition = "TEXT")
    private String voidReason;

    @JsonIgnore
    @Basic(fetch = FetchType.LAZY)
    @Column(name = "pdf_content", columnDefinition = "BYTEA")
    private byte[] pdfContent;

    @Column(name = "pdf_sha256", length = 64)
    private String pdfSha256;

    @Column(name = "accession_numbers", columnDefinition = "TEXT")
    private String accessionNumbers;

    @Column(name = "print_count", nullable = false)
    private Integer printCount = 0;

    @Column(name = "last_printed_by", precision = 10, scale = 0)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String lastPrintedBy;

    @Column(name = "last_printed_at")
    private Timestamp lastPrintedAt;

    @Override
    public Long getId() {
        return id;
    }

    @Override
    public void setId(Long id) {
        this.id = id;
    }

    public String getPatientId() {
        return patientId;
    }

    public void setPatientId(String patientId) {
        this.patientId = patientId;
    }

    public String getReportNumber() {
        return reportNumber;
    }

    public void setReportNumber(String reportNumber) {
        this.reportNumber = reportNumber;
    }

    public Integer getReportVersion() {
        return reportVersion;
    }

    public void setReportVersion(Integer reportVersion) {
        this.reportVersion = reportVersion;
    }

    public PatientReportReleaseStatus getStatus() {
        return status;
    }

    public void setStatus(PatientReportReleaseStatus status) {
        this.status = status;
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

    public String getIssuedBy() {
        return issuedBy;
    }

    public void setIssuedBy(String issuedBy) {
        this.issuedBy = issuedBy;
    }

    public Timestamp getIssuedAt() {
        return issuedAt;
    }

    public void setIssuedAt(Timestamp issuedAt) {
        this.issuedAt = issuedAt;
    }

    public Long getIssuedSignatureId() {
        return issuedSignatureId;
    }

    public void setIssuedSignatureId(Long issuedSignatureId) {
        this.issuedSignatureId = issuedSignatureId;
    }

    public Long getSupersedesReleaseId() {
        return supersedesReleaseId;
    }

    public void setSupersedesReleaseId(Long supersedesReleaseId) {
        this.supersedesReleaseId = supersedesReleaseId;
    }

    public String getAmendmentReason() {
        return amendmentReason;
    }

    public void setAmendmentReason(String amendmentReason) {
        this.amendmentReason = amendmentReason;
    }

    public String getVoidedBy() {
        return voidedBy;
    }

    public void setVoidedBy(String voidedBy) {
        this.voidedBy = voidedBy;
    }

    public Timestamp getVoidedAt() {
        return voidedAt;
    }

    public void setVoidedAt(Timestamp voidedAt) {
        this.voidedAt = voidedAt;
    }

    public Long getVoidSignatureId() {
        return voidSignatureId;
    }

    public void setVoidSignatureId(Long voidSignatureId) {
        this.voidSignatureId = voidSignatureId;
    }

    public String getVoidReason() {
        return voidReason;
    }

    public void setVoidReason(String voidReason) {
        this.voidReason = voidReason;
    }

    public byte[] getPdfContent() {
        return pdfContent;
    }

    public void setPdfContent(byte[] pdfContent) {
        this.pdfContent = pdfContent;
    }

    public String getPdfSha256() {
        return pdfSha256;
    }

    public void setPdfSha256(String pdfSha256) {
        this.pdfSha256 = pdfSha256;
    }

    public String getAccessionNumbers() {
        return accessionNumbers;
    }

    public void setAccessionNumbers(String accessionNumbers) {
        this.accessionNumbers = accessionNumbers;
    }

    public Integer getPrintCount() {
        return printCount;
    }

    public void setPrintCount(Integer printCount) {
        this.printCount = printCount;
    }

    public String getLastPrintedBy() {
        return lastPrintedBy;
    }

    public void setLastPrintedBy(String lastPrintedBy) {
        this.lastPrintedBy = lastPrintedBy;
    }

    public Timestamp getLastPrintedAt() {
        return lastPrintedAt;
    }

    public void setLastPrintedAt(Timestamp lastPrintedAt) {
        this.lastPrintedAt = lastPrintedAt;
    }
}

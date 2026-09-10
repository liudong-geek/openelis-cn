package org.openelisglobal.report.valueholder;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.hibernate.annotations.Check;
import org.hibernate.annotations.GenericGenerator;
import org.hibernate.annotations.Parameter;
import org.hibernate.annotations.Type;
import org.openelisglobal.common.valueholder.BaseObject;

/** Current group membership, not an issued release's frozen result snapshot. */
@Entity
@Table(name = "report_document_member", schema = "clinlims", uniqueConstraints = {
        @UniqueConstraint(name = "uq_report_document_member_analysis", columnNames = { "report_document_id", "analysis_id" }),
        @UniqueConstraint(name = "uq_report_document_member_position", columnNames = { "report_document_id", "member_position" }) })
@Check(constraints = "member_position >= 0")
public class ReportDocumentMember extends BaseObject<String> {
    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(generator = "report_document_member_id")
    @GenericGenerator(name = "report_document_member_id", strategy = "org.openelisglobal.hibernate.resources.StringSequenceGenerator", parameters = {
            @Parameter(name = "sequence_name", value = "clinlims.report_document_member_seq"),
            @Parameter(name = "increment_size", value = "1") })
    @Column(name = "id", precision = 10, scale = 0, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String id;

    @JsonIgnore
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "report_document_id", nullable = false, updatable = false)
    private ReportDocument document;

    @NotBlank
    @Column(name = "analysis_id", nullable = false, precision = 10, scale = 0, updatable = false)
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String analysisId;

    @NotNull
    @Min(0)
    @Column(name = "member_position", nullable = false)
    private Integer memberPosition;

    @Override
    public String getId() {
        return id;
    }

    @Override
    public void setId(String id) {
        this.id = id;
    }

    public ReportDocument getDocument() {
        return document;
    }

    public void setDocument(ReportDocument document) {
        this.document = document;
    }

    public String getAnalysisId() {
        return analysisId;
    }

    public void setAnalysisId(String analysisId) {
        this.analysisId = analysisId;
    }

    public Integer getMemberPosition() {
        return memberPosition;
    }

    public void setMemberPosition(Integer memberPosition) {
        this.memberPosition = memberPosition;
    }
}

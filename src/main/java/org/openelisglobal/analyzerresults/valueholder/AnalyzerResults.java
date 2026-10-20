/**
 * The contents of this file are subject to the Mozilla Public License Version 1.1 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy of the
 * License at http://www.mozilla.org/MPL/
 *
 * <p>Software distributed under the License is distributed on an "AS IS" basis, WITHOUT WARRANTY OF
 * ANY KIND, either express or implied. See the License for the specific language governing rights
 * and limitations under the License.
 *
 * <p>The Original Code is OpenELIS code.
 *
 * <p>Copyright (C) CIRG, University of Washington, Seattle WA. All Rights Reserved.
 */
package org.openelisglobal.analyzerresults.valueholder;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.sql.Timestamp;
import org.hibernate.annotations.GenericGenerator;
import org.hibernate.annotations.Parameter;
import org.hibernate.annotations.Type;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.common.valueholder.BaseObject;
import org.openelisglobal.hibernate.converter.StringToIntegerConverter;

/**
 * Stores raw results from analyzer instruments before processing and
 * validation. Uses legacy uppercase table name and mixed-case column
 * conventions.
 */
@Entity
@Table(name = "ANALYZER_RESULTS")
public class AnalyzerResults extends BaseObject<String> implements Cloneable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "ID", precision = 10, scale = 0)
    @GeneratedValue(generator = "analyzer_results_seq_gen")
    @GenericGenerator(name = "analyzer_results_seq_gen", strategy = "org.openelisglobal.hibernate.resources.StringSequenceGenerator", parameters = @Parameter(name = "sequence_name", value = "analyzer_results_seq"))
    @Type(type = "org.openelisglobal.hibernate.resources.usertype.LIMSStringNumberUserType")
    private String id;

    @Column(name = "ANALYZER_ID", precision = 10, scale = 0)
    @Convert(converter = StringToIntegerConverter.class)
    private String analyzerId;

    @Column(name = "ACCESSION_NUMBER", length = 20)
    private String accessionNumber;

    @Column(name = "test_name")
    private String testName;

    @Column(name = "RESULT")
    private String result;

    @Column(name = "UNITS")
    private String units;

    @Column(name = "DUPLICATE_ID", length = 10)
    @Convert(converter = StringToIntegerConverter.class)
    private String duplicateAnalyzerResultId;

    @Column(name = "ISCONTROL", length = 1)
    private boolean isControl = false;

    @Column(name = "read_only", length = 1)
    private boolean isReadOnly = false;

    @Column(name = "test_id")
    @Convert(converter = StringToIntegerConverter.class)
    private String testId;

    // OGC-1129 — the result component this staged value belongs to
    // (test_result_component.id). Null = the test's PRIMARY component.
    @Column(name = "component_id", length = 36)
    private String componentId;

    @Column(name = "test_result_type", length = 1)
    private String resultType = "N";

    @Column(name = "complete_date")
    private Timestamp completeDate;

    // OGC-1145 FR-8: staged row held because its test runs on several sample
    // types and the message carried no specimen; the review page's chooser
    // resolves it.
    public static final String IMPORT_ISSUE_AWAITING_SPECIMEN = "awaiting_specimen";

    @Column(name = "import_issue_reason", length = 200)
    private String importIssueReason;

    @Column(name = "qc_lot_number", columnDefinition = "TEXT")
    private String lotNumber;

    @Column(name = "qc_control_level", columnDefinition = "TEXT")
    private String controlLevel;

    @Column(name = "qc_source_key", length = 64)
    private String qcSourceKey;

    @Column(name = "qc_source_identity", length = 64)
    private String qcSourceIdentity;

    @Column(name = "qc_raw_observation", columnDefinition = "TEXT")
    private String qcRawObservation;

    @Column(name = "qc_processing_status", length = 30)
    private String qcProcessingStatus;

    @Column(name = "qc_processing_reason", length = 200)
    private String qcProcessingReason;

    @Column(name = "qc_result_id", length = 36)
    private String qcResultId;

    @Column(name = "qc_processed_at")
    private Timestamp qcProcessedAt;

    @Column(name = "qc_processed_by", length = 36)
    private String qcProcessedBy;

    public String getQcSourceKey() {
        return qcSourceKey;
    }

    public void setQcSourceKey(String qcSourceKey) {
        this.qcSourceKey = qcSourceKey;
    }

    public String getQcSourceIdentity() {
        return qcSourceIdentity;
    }

    public void setQcSourceIdentity(String qcSourceIdentity) {
        this.qcSourceIdentity = qcSourceIdentity;
    }

    public String getQcRawObservation() {
        return qcRawObservation;
    }

    public void setQcRawObservation(String qcRawObservation) {
        this.qcRawObservation = qcRawObservation;
    }

    public String getQcProcessingStatus() {
        return qcProcessingStatus;
    }

    public void setQcProcessingStatus(String qcProcessingStatus) {
        this.qcProcessingStatus = qcProcessingStatus;
    }

    public String getQcProcessingReason() {
        return qcProcessingReason;
    }

    public void setQcProcessingReason(String qcProcessingReason) {
        this.qcProcessingReason = qcProcessingReason;
    }

    public String getQcResultId() {
        return qcResultId;
    }

    public void setQcResultId(String qcResultId) {
        this.qcResultId = qcResultId;
    }

    public Timestamp getQcProcessedAt() {
        return qcProcessedAt;
    }

    public void setQcProcessedAt(Timestamp qcProcessedAt) {
        this.qcProcessedAt = qcProcessedAt;
    }

    public String getQcProcessedBy() {
        return qcProcessedBy;
    }

    public void setQcProcessedBy(String qcProcessedBy) {
        this.qcProcessedBy = qcProcessedBy;
    }

    public String getImportIssueReason() {
        return importIssueReason;
    }

    public void setImportIssueReason(String importIssueReason) {
        this.importIssueReason = importIssueReason;
    }

    public String getLotNumber() {
        return lotNumber;
    }

    public void setLotNumber(String lotNumber) {
        this.lotNumber = lotNumber;
    }

    public String getControlLevel() {
        return controlLevel;
    }

    public void setControlLevel(String controlLevel) {
        this.controlLevel = controlLevel;
    }

    public Object clone() throws CloneNotSupportedException {
        return super.clone();
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getId() {
        return this.id;
    }

    public void setAnalyzerId(String analyzerId) {
        this.analyzerId = analyzerId;
    }

    public String getAnalyzerId() {
        return analyzerId;
    }

    public void setAccessionNumber(String accessionNumber) {
        this.accessionNumber = accessionNumber.replaceAll("\'", "");
    }

    public String getAccessionNumber() {
        return accessionNumber;
    }

    public void setTestName(String testName) {
        this.testName = testName;
    }

    public String getTestName() {
        return testName;
    }

    public void setResult(String result) {
        this.result = result;
    }

    public String getResult() {
        return this.result;
    }

    public void setUnits(String units) {
        this.units = units;
    }

    public String getUnits() {
        return units;
    }

    public void setIsControl(boolean isControl) {
        this.isControl = isControl;
    }

    public boolean getIsControl() {
        return isControl;
    }

    public void setCompleteDate(Timestamp completeDate) {
        this.completeDate = completeDate;
    }

    public Timestamp getCompleteDate() {
        return completeDate;
    }

    public String getCompleteDateForDisplay() {
        return DateUtil.convertTimestampToStringDate(completeDate);
    }

    public void setDuplicateAnalyzerResultId(String duplicateAnalyzerResultId) {
        this.duplicateAnalyzerResultId = duplicateAnalyzerResultId;
    }

    public String getDuplicateAnalyzerResultId() {
        return duplicateAnalyzerResultId;
    }

    public void setReadOnly(boolean isReadOnly) {
        this.isReadOnly = isReadOnly;
    }

    public boolean isReadOnly() {
        return isReadOnly;
    }

    public void setTestId(String testId) {
        this.testId = testId;
    }

    public String getTestId() {
        return testId;
    }

    public void setComponentId(String componentId) {
        this.componentId = componentId;
    }

    public String getComponentId() {
        return componentId;
    }

    public void setResultType(String resultType) {
        this.resultType = resultType;
    }

    public String getResultType() {
        return resultType;
    }
}

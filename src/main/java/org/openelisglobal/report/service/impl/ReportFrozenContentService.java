package org.openelisglobal.report.service.impl;

import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.util.*;
import java.util.stream.Collectors;
import org.apache.commons.codec.digest.DigestUtils;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.report.dao.ReportClinicalSourceDAO;
import org.openelisglobal.report.form.*;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReportFrozenContentService {
    private final ObjectMapper mapper = new ObjectMapper().configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true)
            .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
    @Autowired
    private ReportClinicalSourceDAO sourceDAO;
    @Autowired
    private DocumentReportProjectionService projection;
    @Autowired
    private PatientReportServiceImpl reportBuilder;
    @Autowired
    private IStatusService statuses;
    @Autowired
    private ReportDocumentService documents;

    @Transactional
    public ReportFrozenSnapshot capture(PatientReportRelease release, ReportReleaseScope scope, String actor) {
        documents.authorizePersistedScope(scope.documentId(), scope.authorizationScope(), actor, false);
        var source = sourceDAO.loadAndLock(scope);
        // Refresh clinical source first; then verify original grouping completeness
        // and authorization again under the source locks.
        documents.lockCurrent(scope.documentId(), actor);
        var analyses = source.analyses();
        if (source.patient() == null || !scope.patientId().equals(source.patient().getId()) || analyses == null
                || analyses.size() != scope.analysisIds().size() || analyses.stream().anyMatch(Objects::isNull)
                || !new HashSet<>(analyses.stream().map(Analysis::getId).toList())
                        .equals(new HashSet<>(scope.analysisIds())))
            throw new IllegalStateException("Report clinical analysis scope is incomplete");
        if (source.results() == null || source.results().stream().anyMatch(Objects::isNull))
            throw new IllegalStateException("Report result scope is incomplete");
        Set<String> seenResults = new HashSet<>();
        for (Result result : source.results()) {
            if (result.getId() == null || !result.getId().matches("[1-9][0-9]*") || result.getAnalysis() == null
                    || !scope.analysisIds().contains(result.getAnalysis().getId()) || !seenResults.add(result.getId()))
                throw new IllegalStateException("Unexpected or duplicate report result");
        }
        List<ReportFrozenSnapshot.AnalysisEvidence> evidence = new ArrayList<>();
        Set<String> reportableIds = new HashSet<>();
        for (Analysis analysis : analyses) {
            if (!statuses.matches(analysis.getStatusId(), AnalysisStatus.Finalized) || analysis.getTest() == null
                    || analysis.getSampleItem() == null || analysis.getTestSection() == null)
                throw new IllegalStateException("Every report member must be finalized and assigned");
            List<Result> results = source.results().stream()
                    .filter(result -> analysis.getId().equals(result.getAnalysis().getId()))
                    .sorted(Comparator.comparing(result -> new java.math.BigInteger(result.getId()))).toList();
            List<Result> visible = results.stream().filter(result -> "Y".equals(result.getIsReportable())).toList();
            if (visible.isEmpty()
                    || visible.stream().anyMatch(result -> result.getValue() == null || result.getValue().isBlank()))
                throw new IllegalStateException("Every report member needs a nonempty reportable result");
            visible.forEach(result -> reportableIds.add(result.getId()));
            var resultEvidence = results.stream()
                    .map(result -> new ReportFrozenSnapshot.ResultEvidence(result.getId(),
                            version(result.getLastupdated()), result.getValue(), result.getResultType(),
                            result.getIsReportable(), result.getMinNormal(), result.getMaxNormal(),
                            result.getAnalyte() == null ? null : result.getAnalyte().getId(),
                            result.getTestResult() == null ? null : result.getTestResult().getId(),
                            result.getParentResult() == null ? null : result.getParentResult().getId()))
                    .toList();
            evidence.add(new ReportFrozenSnapshot.AnalysisEvidence(analysis.getId(), version(analysis.getLastupdated()),
                    analysis.getStatusId(), analysis.getTest().getId(), analysis.getSampleItem().getId(),
                    analysis.getTestSection().getId(), resultEvidence));
        }
        evidence.sort(Comparator.comparing(item -> new java.math.BigInteger(item.analysisId())));
        List<TestResultItem> projected = projection.project(analyses, actor);
        if (projected == null || projected.stream().anyMatch(Objects::isNull))
            throw new IllegalStateException("Report display projection is incomplete");
        List<TestResultItem> rows = projected.stream().filter(item -> !item.getIsGroupSeparator())
                .filter(item -> "Y".equals(item.getReportable())).toList();
        Set<String> projectedIds = new HashSet<>();
        Map<String, Result> sourceResults = source.results().stream()
                .collect(Collectors.toMap(Result::getId, result -> result));
        for (TestResultItem row : rows) {
            Result sourceResult = sourceResults.get(row.getResultId());
            if (sourceResult == null || !reportableIds.contains(row.getResultId())
                    || !Objects.equals(row.getAnalysisId(), sourceResult.getAnalysis().getId())
                    || !statuses.matches(row.getAnalysisStatusId(), AnalysisStatus.Finalized)
                    || !projectedIds.add(row.getResultId()))
                throw new IllegalStateException("Report projection does not match its complete finalized source");
        }
        if (!projectedIds.equals(reportableIds))
            throw new IllegalStateException("Report projection omitted reportable result members");
        var report = reportBuilder.buildDocumentReportFromResults(rows, source.patient());
        if (report.getRows().size() != rows.size())
            throw new IllegalStateException("Report display lost result rows");
        return new ReportFrozenSnapshot(1, scope, release.getReportNumber(), release.getReportVersion(),
                release.getAmendmentReason(), ReportFrozenTemplate.current(), report, evidence);
    }

    public String encode(ReportFrozenSnapshot snapshot) {
        try {
            return mapper.writeValueAsString(snapshot);
        } catch (Exception error) {
            throw new IllegalStateException("Cannot serialize frozen report", error);
        }
    }

    public ReportFrozenSnapshot require(PatientReportRelease release) {
        if (release.getFrozenContentJson() == null || release.getFrozenContentSha256() == null
                || release.getFrozenAt() == null
                || !release.getFrozenContentSha256().equals(DigestUtils.sha256Hex(release.getFrozenContentJson())))
            throw new IllegalStateException("REPORT_FROZEN_CONTENT_REQUIRED");
        try {
            ReportFrozenSnapshot snapshot = mapper.readValue(release.getFrozenContentJson(),
                    ReportFrozenSnapshot.class);
            if (!Objects.equals(snapshot.scope().documentId(), release.getReportDocumentId())
                    || !Objects.equals(snapshot.scope().patientId(), release.getPatientId())
                    || !Objects.equals(snapshot.reportNumber(), release.getReportNumber())
                    || snapshot.reportVersion() != release.getReportVersion()
                    || !Objects.equals(snapshot.amendmentReason(), release.getAmendmentReason()))
                throw new IllegalStateException("Frozen report ownership mismatch");
            return snapshot;
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalStateException("Invalid persisted frozen report", error);
        }
    }

    private String version(java.sql.Timestamp value) {
        if (value == null)
            throw new IllegalStateException("Report source has no persisted version");
        return value.toInstant().toString();
    }
}

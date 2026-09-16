package org.openelisglobal.report.service.impl;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.service.AuditableBaseObjectServiceImpl;
import org.openelisglobal.report.dao.ReportDocumentDAO;
import org.openelisglobal.report.form.ReportDocumentSummary;
import org.openelisglobal.report.form.ReportGroupingRules;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.service.ReportGroupingConfigurationService;
import org.openelisglobal.report.valueholder.ReportDocument;
import org.openelisglobal.report.valueholder.ReportDocumentMember;
import org.openelisglobal.reports.service.ReportAnalysisAuthorizationService;
import org.openelisglobal.reports.service.ReportScopeDefinition;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReportDocumentServiceImpl extends AuditableBaseObjectServiceImpl<ReportDocument, String>
        implements ReportDocumentService {
    @Autowired
    private ReportDocumentDAO documents;
    @Autowired
    private ReportGroupingConfigurationService configuration;
    @Autowired
    private SampleService samples;
    @Autowired
    private SampleHumanService sampleHumans;
    @Autowired
    private AnalysisService analyses;
    @Autowired
    private ReportAnalysisAuthorizationService authorization;

    public ReportDocumentServiceImpl() {
        super(ReportDocument.class);
    }

    @Override
    protected ReportDocumentDAO getBaseObjectDAO() {
        return documents;
    }

    @Override
    @Transactional
    public ReportDocumentSummary prepare(String sampleId, String groupKey, String actor) {
        // Authorize before taking a write lock; then resolve again inside the locked
        // application scope.
        resolveAuthorized(sampleId, groupKey, actor);
        documents.lockSample(sampleId);
        ReportScopeDefinition scope = resolveAuthorized(sampleId, groupKey, actor);
        ReportDocument existing = documents.findBySampleAndGroup(sampleId, groupKey);
        if (existing != null) {
            requireUnchanged(existing, scope);
            return summary(existing);
        }
        ReportDocument document = new ReportDocument();
        document.setPatientId(scope.patientId());
        document.setSampleId(scope.sampleId());
        document.setReportGroupKey(scope.groupKey());
        document.setGroupRuleVersion(scope.ruleVersion());
        document.setReportNumber("BG-" + UUID.randomUUID().toString().replace("-", "").toUpperCase());
        document.setCreatedBy(actor);
        document.setCreatedAt(Timestamp.from(Instant.now()));
        document.setSysUserId(actor);
        insert(document);
        List<ReportDocumentMember> members = new ArrayList<>();
        for (String analysisId : scope.analysisIds()) {
            ReportDocumentMember member = new ReportDocumentMember();
            member.setDocument(document);
            member.setAnalysisId(analysisId);
            member.setMemberPosition(members.size());
            member.setSysUserId(actor);
            documents.insertMember(member);
            members.add(member);
        }
        document.setMembers(members);
        return summary(document);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReportDocumentSummary> getBySample(String sampleId, String actor) {
        requireId(sampleId);
        List<ReportDocument> found = documents.getBySample(sampleId);
        // Reject a mixed-scope application as a whole; never silently truncate a
        // document.
        for (ReportDocument document : found)
            authorization.authorizeExplicitScope(scope(document), actor);
        return found.stream().map(this::summary).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ReportDocumentSummary get(String documentId, String actor) {
        return summary(requireAuthorized(documentId, actor, false));
    }

    @Override
    @Transactional
    public ReportDocumentSummary lockCurrent(String documentId, String actor) {
        ReportDocument document = requireAuthorized(documentId, actor, true);
        requireUnchanged(document, resolveAuthorized(document.getSampleId(), document.getReportGroupKey(), actor));
        return summary(document);
    }

    @Override
    @Transactional(readOnly = true)
    public ReportScopeDefinition authorizedScope(String documentId, String actor) {
        return scope(requireAuthorized(documentId, actor, false));
    }

    @Override
    @Transactional
    public ReportDocumentSummary authorizePersistedScope(String documentId, ReportScopeDefinition frozenScope,
            String actor, boolean lock) {
        requireId(documentId);
        ReportDocument document = documents.getWithMembers(documentId, lock);
        if (document == null || frozenScope == null || !Objects.equals(document.getPatientId(), frozenScope.patientId())
                || !Objects.equals(document.getSampleId(), frozenScope.sampleId())
                || !Objects.equals(document.getReportGroupKey(), frozenScope.groupKey())
                || !Objects.equals(document.getGroupRuleVersion(), frozenScope.ruleVersion())) {
            throw new IllegalStateException("Report membership ownership does not match its document");
        }
        // Historical release members are authoritative here, not a later mutable
        // current group.
        authorization.authorizeExplicitScope(frozenScope, actor);
        return new ReportDocumentSummary(document.getId(), document.getPatientId(), document.getSampleId(),
                document.getReportGroupKey(), document.getGroupRuleVersion(), document.getReportNumber(),
                document.getLastupdated(), frozenScope.analysisIds());
    }

    private ReportDocument requireAuthorized(String id, String actor, boolean lock) {
        requireId(id);
        ReportDocument document = documents.getWithMembers(id, lock);
        if (document == null)
            throw new IllegalArgumentException("Report document does not exist");
        authorization.authorizeExplicitScope(scope(document), actor);
        return document;
    }

    private ReportScopeDefinition resolveAuthorized(String sampleId, String groupKey, String actor) {
        requireId(sampleId);
        ReportGroupingRules rules = configuration.getRules();
        var group = rules.requireGroup(groupKey);
        var sample = samples.get(sampleId);
        if (sample == null || !sampleId.equals(sample.getId()))
            throw new IllegalArgumentException("Application does not exist");
        var patient = sampleHumans.getPatientForSample(sample);
        if (patient == null)
            throw new IllegalArgumentException("Application patient is missing");
        List<Analysis> all = analyses.getAnalysesBySampleId(sampleId);
        if (all == null || all.stream().anyMatch(analysis -> analysis == null || analysis.getTest() == null)) {
            throw new IllegalStateException("Application members could not be loaded completely");
        }
        List<Analysis> selected = all.stream().filter(analysis -> analysis != null && analysis.getTest() != null
                && group.testIds().contains(analysis.getTest().getId())).toList();
        List<String> ids = selected.stream().map(Analysis::getId).toList();
        if (ids.stream().anyMatch(Objects::isNull) || new HashSet<>(ids).size() != ids.size()) {
            throw new IllegalStateException("Invalid application members");
        }
        List<String> ordered = ids.stream().sorted(Comparator.comparing(java.math.BigInteger::new)).toList();
        ReportScopeDefinition scope = new ReportScopeDefinition(patient.getId(), sampleId, group.key(),
                rules.ruleVersion(), ordered);
        authorization.authorizeExplicitScope(scope, actor);
        return scope;
    }

    private ReportScopeDefinition scope(ReportDocument document) {
        return new ReportScopeDefinition(document.getPatientId(), document.getSampleId(), document.getReportGroupKey(),
                document.getGroupRuleVersion(),
                document.getMembers().stream().map(ReportDocumentMember::getAnalysisId).toList());
    }

    private void requireUnchanged(ReportDocument document, ReportScopeDefinition expected) {
        if (!scope(document).equals(expected)) {
            throw new IllegalStateException(
                    "Report membership or grouping rule changed; existing document was retained");
        }
    }

    private ReportDocumentSummary summary(ReportDocument document) {
        var scope = scope(document);
        return new ReportDocumentSummary(document.getId(), scope.patientId(), scope.sampleId(), scope.groupKey(),
                scope.ruleVersion(), document.getReportNumber(), document.getLastupdated(), scope.analysisIds());
    }

    private void requireId(String id) {
        if (id == null || !id.matches("[1-9][0-9]*"))
            throw new IllegalArgumentException("Invalid report identifier");
    }
}

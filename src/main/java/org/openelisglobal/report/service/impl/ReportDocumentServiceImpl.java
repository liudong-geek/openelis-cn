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
    private final com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
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
    @Transactional(readOnly = true)
    public List<org.openelisglobal.report.form.ReportApplicationSummary> getApplications(String patientId,
            String actor) {
        requireId(patientId);
        var actorContext = authorization.beginActorCheck(actor);
        var rules = configuration.getRules();
        var found = samples.getSamplesForPatient(patientId);
        if (found == null || found.stream().anyMatch(Objects::isNull) || found.stream()
                .map(org.openelisglobal.sample.valueholder.Sample::getId).distinct().count() != found.size())
            throw new IllegalStateException("Report applications could not be resolved completely");
        List<org.openelisglobal.report.form.ReportApplicationSummary> visible = new ArrayList<>();
        for (var sample : found) {
            requireId(sample.getId());
            List<Analysis> members = analyses.getAnalysesBySampleId(sample.getId());
            if (members == null
                    || members.stream()
                            .anyMatch(member -> member == null || member.getTest() == null || member.getId() == null
                                    || !member.getId().matches("[1-9][0-9]*"))
                    || members.stream().map(Analysis::getId).distinct().count() != members.size())
                throw new IllegalStateException("Report application members could not be resolved completely");
            boolean accessible = false;
            List<ReportDocument> existing = documents.getBySample(sample.getId());
            if (existing == null)
                throw new IllegalStateException("Report documents could not be loaded completely");
            for (ReportDocument document : existing) {
                if (document == null || !sample.getId().equals(document.getSampleId())
                        || !patientId.equals(document.getPatientId()))
                    throw new IllegalStateException("Report document application ownership mismatch");
                if (authorization.isCompleteScopeVisible(scope(document), actor))
                    accessible = true;
            }
            for (var group : rules.groups()) {
                var ids = members.stream().filter(member -> group.testIds().contains(member.getTest().getId()))
                        .map(Analysis::getId).sorted(Comparator.comparing(java.math.BigInteger::new)).toList();
                if (ids.isEmpty())
                    continue;
                var scope = new ReportScopeDefinition(patientId, sample.getId(), group.key(), rules.ruleVersion(), ids);
                if (authorization.isCompleteScopeVisible(scope, actor))
                    accessible = true;
            }
            if (!accessible)
                continue;
            if (sample.getAccessionNumber() == null || sample.getAccessionNumber().isBlank())
                throw new IllegalStateException("Report application has no accession number");
            visible.add(new org.openelisglobal.report.form.ReportApplicationSummary(patientId, sample.getId(),
                    sample.getAccessionNumber()));
        }
        authorization.endActorCheck(actorContext);
        return List.copyOf(visible);
    }

    @Override
    @Transactional
    public ReportDocumentSummary prepare(String sampleId, String groupKey, String actor) {
        requireId(sampleId);
        ReportDocument observed = documents.findBySampleAndGroup(sampleId, groupKey);
        if (observed == null)
            resolveAuthorized(sampleId, groupKey, actor, configuration.getRules());
        else
            authorization.authorizeExplicitScope(scope(observed), actor);
        documents.lockSample(sampleId);
        ReportDocument existing = documents.findBySampleAndGroup(sampleId, groupKey);
        if (existing != null) {
            requireUnchanged(existing, resolveAuthorized(sampleId, groupKey, actor, frozenRules(existing)));
            return summary(existing);
        }
        ReportGroupingRules rules = configuration.getRules();
        ReportScopeDefinition scope = resolveAuthorized(sampleId, groupKey, actor, rules);
        ReportDocument document = new ReportDocument();
        document.setPatientId(scope.patientId());
        document.setSampleId(scope.sampleId());
        document.setReportGroupKey(scope.groupKey());
        document.setGroupRuleVersion(scope.ruleVersion());
        try {
            String json = mapper.writeValueAsString(rules);
            document.setGroupRulesJson(json);
            document.setGroupRulesSha256(org.apache.commons.codec.digest.DigestUtils.sha256Hex(json));
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalStateException("Cannot freeze document grouping rules", error);
        }
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
        var actorContext = authorization.beginActorCheck(actor);
        List<ReportDocument> found = documents.getBySample(sampleId);
        if (found == null || found.stream().anyMatch(Objects::isNull))
            throw new IllegalStateException("Report document list could not be loaded completely");
        List<ReportDocumentSummary> visible = new ArrayList<>();
        for (ReportDocument document : found) {
            if (!sampleId.equals(document.getSampleId()))
                throw new IllegalStateException("Report document application mismatch");
            if (authorization.isCompleteScopeVisible(scope(document), actor))
                visible.add(summary(document));
        }
        authorization.endActorCheck(actorContext);
        return List.copyOf(visible);
    }

    @Override
    @Transactional(readOnly = true)
    public ReportDocumentSummary get(String documentId, String actor) {
        return summary(requireAuthorized(documentId, actor, false));
    }

    @Override
    @Transactional
    public ReportDocumentSummary lockCurrent(String documentId, String actor) {
        requireAuthorized(documentId, actor, false);
        ReportDocument document = requireAuthorized(documentId, actor, true);
        requireUnchanged(document,
                resolveAuthorized(document.getSampleId(), document.getReportGroupKey(), actor, frozenRules(document)));
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

    private ReportScopeDefinition resolveAuthorized(String sampleId, String groupKey, String actor,
            ReportGroupingRules rules) {
        requireId(sampleId);
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

    private ReportGroupingRules frozenRules(ReportDocument document) {
        if (document.getGroupRulesJson() == null || document.getGroupRulesSha256() == null
                || !document.getGroupRulesSha256()
                        .equals(org.apache.commons.codec.digest.DigestUtils.sha256Hex(document.getGroupRulesJson())))
            throw new IllegalStateException("REPORT_DOCUMENT_RULE_EVIDENCE_REQUIRED");
        try {
            ReportGroupingRules rules = mapper.readValue(document.getGroupRulesJson(), ReportGroupingRules.class);
            if (!Objects.equals(document.getGroupRuleVersion(), rules.ruleVersion()))
                throw new IllegalStateException("Report rule version evidence mismatch");
            rules.requireGroup(document.getReportGroupKey());
            return rules;
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalStateException("Invalid frozen document grouping rules", error);
        }
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

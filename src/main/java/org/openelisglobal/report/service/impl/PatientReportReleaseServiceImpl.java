package org.openelisglobal.report.service.impl;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import org.openelisglobal.common.service.AuditableBaseObjectServiceImpl;
import org.openelisglobal.report.PatientReportReleaseSummary;
import org.openelisglobal.report.dao.PatientReportReleaseDAO;
import org.openelisglobal.report.form.ReportDocumentSummary;
import org.openelisglobal.report.service.PatientReportReleaseService;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Document-scoped release preparation. Issuance is enabled only after
 * frozen-content signing is implemented.
 */
@Service
public class PatientReportReleaseServiceImpl extends AuditableBaseObjectServiceImpl<PatientReportRelease, Long>
        implements PatientReportReleaseService {
    @Autowired
    private PatientReportReleaseDAO patientReportReleaseDAO;
    @Autowired
    private ReportDocumentService documents;
    @Autowired
    private SystemUserService systemUserService;

    public PatientReportReleaseServiceImpl() {
        super(PatientReportRelease.class);
    }

    @Override
    protected PatientReportReleaseDAO getBaseObjectDAO() {
        return patientReportReleaseDAO;
    }

    @Override
    @Transactional
    public PatientReportReleaseSummary createDocumentDraft(String documentId, String amendmentReason, String actor) {
        ReportDocumentSummary document = documents.lockCurrent(documentId, actor);
        PatientReportRelease existing = patientReportReleaseDAO.getDraft(documentId);
        if (existing != null) {
            requireOwnership(existing, document);
            if (!Objects.equals(normalize(existing.getAmendmentReason()), normalize(amendmentReason))) {
                throw new IllegalStateException("Existing draft has another amendment reason");
            }
            return toSummary(existing);
        }
        PatientReportRelease prior = patientReportReleaseDAO.getLatestReleased(documentId);
        if (prior != null) {
            requireOwnership(prior, document);
            if (normalize(amendmentReason) == null)
                throw new IllegalArgumentException("Amendment reason is required");
        }
        PatientReportRelease release = new PatientReportRelease();
        release.setPatientId(document.patientId());
        release.setReportDocumentId(document.id());
        release.setReportNumber(document.reportNumber());
        release.setReportVersion(patientReportReleaseDAO.getNextVersion(documentId));
        release.setStatus(PatientReportReleaseStatus.DRAFT);
        release.setCreatedBy(actor);
        release.setCreatedAt(Timestamp.from(Instant.now()));
        release.setSupersedesReleaseId(prior == null ? null : prior.getId());
        release.setAmendmentReason(normalize(amendmentReason));
        release.setPrintCount(0);
        release.setSysUserId(actor);
        insert(release);
        return toSummary(release);
    }

    @Override
    @Transactional
    public PatientReportReleaseSummary issue(Long releaseId, Long signatureId, String actor) {
        // Never fall back to the historical patient-wide live query or accept an
        // unbound legacy signature.
        authorizeRelease(releaseId, actor);
        throw new IllegalStateException("REPORT_FROZEN_SIGNATURE_REQUIRED");
    }

    @Override
    @Transactional
    public PatientReportReleaseSummary voidRelease(Long releaseId, Long signatureId, String actor) {
        authorizeRelease(releaseId, actor);
        throw new IllegalStateException("REPORT_FROZEN_SIGNATURE_REQUIRED");
    }

    @Override
    @Transactional(readOnly = true)
    public List<PatientReportReleaseSummary> getByDocument(String documentId, String actor) {
        ReportDocumentSummary document = documents.get(documentId, actor);
        List<PatientReportRelease> releases = patientReportReleaseDAO.getByDocument(documentId);
        for (PatientReportRelease release : releases)
            requireOwnership(release, document);
        return releases.stream().map(this::toSummary).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] getIssuedPdf(Long releaseId, String actor) {
        PatientReportRelease release = authorizeRelease(releaseId, actor);
        requirePrintable(release);
        return release.getPdfContent().clone();
    }

    @Override
    @Transactional
    public byte[] recordPrint(Long releaseId, String actor) {
        PatientReportRelease release = authorizeRelease(releaseId, actor);
        requirePrintable(release);
        release.setPrintCount((release.getPrintCount() == null ? 0 : release.getPrintCount()) + 1);
        release.setLastPrintedBy(actor);
        release.setLastPrintedAt(Timestamp.from(Instant.now()));
        release.setSysUserId(actor);
        byte[] pdf = release.getPdfContent().clone();
        update(release);
        return pdf;
    }

    private PatientReportRelease authorizeRelease(Long releaseId, String actor) {
        if (releaseId == null || releaseId <= 0)
            throw new IllegalArgumentException("Invalid report release identifier");
        PatientReportRelease release = get(releaseId);
        if (release.getReportDocumentId() == null) {
            throw new IllegalStateException("LEGACY_REPORT_MEMBERSHIP_UNVERIFIED");
        }
        requireOwnership(release, documents.get(release.getReportDocumentId(), actor));
        return release;
    }

    private void requireOwnership(PatientReportRelease release, ReportDocumentSummary document) {
        if (!Objects.equals(release.getReportDocumentId(), document.id())
                || !Objects.equals(release.getPatientId(), document.patientId())
                || !Objects.equals(release.getReportNumber(), document.reportNumber())) {
            throw new IllegalStateException("Report release ownership does not match its document");
        }
    }

    private void requirePrintable(PatientReportRelease release) {
        if (release.getStatus() != PatientReportReleaseStatus.ISSUED || release.getPdfContent() == null) {
            throw new IllegalStateException("Only a current issued report can be printed");
        }
    }

    private PatientReportReleaseSummary toSummary(PatientReportRelease release) {
        String name = "";
        if (release.getIssuedBy() != null) {
            var user = systemUserService.getUserById(release.getIssuedBy());
            if (user != null)
                name = java.util.stream.Stream.of(user.getLastName(), user.getFirstName()).filter(Objects::nonNull)
                        .map(String::trim).filter(value -> !value.isEmpty())
                        .collect(java.util.stream.Collectors.joining(" "));
        }
        return new PatientReportReleaseSummary(release.getId(), release.getPatientId(), release.getReportDocumentId(),
                release.getReportNumber(), release.getReportVersion(), release.getStatus(), release.getCreatedAt(),
                name, release.getIssuedAt(), release.getSupersedesReleaseId(), release.getAmendmentReason(),
                release.getVoidedAt(), release.getVoidReason(), release.getPdfSha256(), release.getAccessionNumbers(),
                release.getPrintCount(), release.getLastPrintedAt());
    }

    private String normalize(String text) {
        if (text == null || text.isBlank())
            return null;
        if (text.length() > 2000)
            throw new IllegalArgumentException("Amendment reason is too long");
        return text.strip();
    }
}

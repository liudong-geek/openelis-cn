package org.openelisglobal.report.service.impl;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.openelisglobal.common.service.AuditableBaseObjectServiceImpl;
import org.openelisglobal.esig.service.ElectronicSignatureService;
import org.openelisglobal.esig.valueholder.ElectronicSignature;
import org.openelisglobal.esig.valueholder.SignatureMeaning;
import org.openelisglobal.report.PatientReportPdfMetadata;
import org.openelisglobal.report.PatientReportReleaseSummary;
import org.openelisglobal.report.ReportRow;
import org.openelisglobal.report.ReportingData;
import org.openelisglobal.report.dao.PatientReportReleaseDAO;
import org.openelisglobal.report.service.PatientReportReleaseService;
import org.openelisglobal.report.service.PatientReportService;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PatientReportReleaseServiceImpl extends AuditableBaseObjectServiceImpl<PatientReportRelease, Long>
        implements PatientReportReleaseService {

    private static final DateTimeFormatter REPORT_NUMBER_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Autowired
    private PatientReportReleaseDAO patientReportReleaseDAO;

    @Autowired
    private PatientReportService patientReportService;

    @Autowired
    private ChinesePatientReportPdfRenderer pdfRenderer;

    @Autowired
    private ElectronicSignatureService electronicSignatureService;

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
    public PatientReportReleaseSummary createDraft(String patientId, String amendmentReason, String sysUserId) {
        requireIdentifier(patientId, "患者编号不能为空");
        requireIdentifier(sysUserId, "当前用户无效");

        ReportingData report = requireReportableResults(patientId, sysUserId);
        patientReportReleaseDAO.lockPatientVersion(patientId);
        PatientReportRelease existingDraft = patientReportReleaseDAO.getDraft(patientId);
        if (existingDraft != null) {
            return toSummary(existingDraft);
        }

        PatientReportRelease latestReleased = patientReportReleaseDAO.getLatestReleased(patientId);
        if (latestReleased != null && isBlank(amendmentReason)) {
            throw new IllegalArgumentException("再次出具报告必须填写更正原因");
        }

        PatientReportRelease release = new PatientReportRelease();
        release.setPatientId(patientId);
        release.setReportNumber(newReportNumber());
        release.setReportVersion(patientReportReleaseDAO.getNextVersion(patientId));
        release.setStatus(PatientReportReleaseStatus.DRAFT);
        release.setCreatedBy(sysUserId);
        release.setCreatedAt(Timestamp.valueOf(LocalDateTime.now()));
        release.setSupersedesReleaseId(latestReleased == null ? null : latestReleased.getId());
        release.setAmendmentReason(normalize(amendmentReason));
        release.setAccessionNumbers(accessionNumbers(report));
        release.setPrintCount(0);
        release.setSysUserId(sysUserId);

        insert(release);
        return toSummary(release);
    }

    @Override
    @Transactional
    public PatientReportReleaseSummary issue(Long releaseId, Long signatureId, String sysUserId) {
        if (releaseId == null) {
            throw new IllegalArgumentException("报告记录编号不能为空");
        }
        PatientReportRelease release = get(releaseId);
        if (release.getStatus() == PatientReportReleaseStatus.ISSUED
                && Objects.equals(release.getIssuedSignatureId(), signatureId)) {
            return toSummary(release);
        }
        if (release.getStatus() != PatientReportReleaseStatus.DRAFT) {
            throw new IllegalStateException("该报告记录已不能出具");
        }
        ElectronicSignature signature = requireSignature(signatureId, releaseId, sysUserId,
                SignatureMeaning.VALIDATED_AND_RELEASED);
        ReportingData report = requireReportableResults(release.getPatientId(), sysUserId);
        Timestamp issuedAt = signature.getSignedAt();
        SystemUser issuer = systemUserService.getUserById(sysUserId);
        String issuerName = displayName(issuer, sysUserId);

        PatientReportPdfMetadata metadata = new PatientReportPdfMetadata(release.getReportNumber(),
                release.getReportVersion(), issuerName, issuedAt.toLocalDateTime(), release.getAmendmentReason());
        byte[] pdf = pdfRenderer.renderOfficial(report, metadata);

        PatientReportRelease latestIssued = patientReportReleaseDAO.getLatestIssued(release.getPatientId());
        if (latestIssued != null && !Objects.equals(latestIssued.getId(), release.getId())) {
            latestIssued.setStatus(PatientReportReleaseStatus.SUPERSEDED);
            latestIssued.setSysUserId(sysUserId);
            update(latestIssued);
            release.setSupersedesReleaseId(latestIssued.getId());
        }

        release.setStatus(PatientReportReleaseStatus.ISSUED);
        release.setIssuedBy(sysUserId);
        release.setIssuedAt(issuedAt);
        release.setIssuedSignatureId(signatureId);
        release.setAccessionNumbers(accessionNumbers(report));
        release.setPdfContent(pdf);
        release.setPdfSha256(sha256(pdf));
        release.setSysUserId(sysUserId);
        return toSummary(update(release));
    }

    @Override
    @Transactional
    public PatientReportReleaseSummary voidRelease(Long releaseId, Long signatureId, String sysUserId) {
        PatientReportRelease release = get(releaseId);
        if (release.getStatus() != PatientReportReleaseStatus.ISSUED) {
            throw new IllegalStateException("只有当前正式报告可以作废");
        }
        ElectronicSignature signature = requireSignature(signatureId, releaseId, sysUserId,
                SignatureMeaning.REJECTED);
        if (isBlank(signature.getRejectionReason())) {
            throw new IllegalArgumentException("作废报告必须填写原因");
        }

        release.setStatus(PatientReportReleaseStatus.VOIDED);
        release.setVoidedBy(sysUserId);
        release.setVoidedAt(signature.getSignedAt());
        release.setVoidSignatureId(signatureId);
        release.setVoidReason(signature.getRejectionReason().trim());
        release.setSysUserId(sysUserId);
        return toSummary(update(release));
    }

    @Override
    @Transactional(readOnly = true)
    public List<PatientReportReleaseSummary> getByPatient(String patientId) {
        requireIdentifier(patientId, "患者编号不能为空");
        return patientReportReleaseDAO.getByPatient(patientId).stream().map(this::toSummary).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] getIssuedPdf(Long releaseId) {
        PatientReportRelease release = get(releaseId);
        requirePrintable(release);
        return release.getPdfContent().clone();
    }

    @Override
    @Transactional
    public byte[] recordPrint(Long releaseId, String sysUserId) {
        requireIdentifier(sysUserId, "当前用户无效");
        PatientReportRelease release = get(releaseId);
        requirePrintable(release);
        release.setPrintCount((release.getPrintCount() == null ? 0 : release.getPrintCount()) + 1);
        release.setLastPrintedBy(sysUserId);
        release.setLastPrintedAt(Timestamp.valueOf(LocalDateTime.now()));
        release.setSysUserId(sysUserId);
        byte[] pdf = release.getPdfContent().clone();
        update(release);
        return pdf;
    }

    private ElectronicSignature requireSignature(Long signatureId, Long releaseId, String sysUserId,
            SignatureMeaning meaning) {
        if (signatureId == null) {
            throw new IllegalArgumentException("正式报告必须完成电子签名");
        }
        ElectronicSignature signature = electronicSignatureService.get(signatureId);
        boolean matches = "REPORT".equals(signature.getRecordType()) && Objects.equals(releaseId, signature.getRecordId())
                && meaning == signature.getSignatureMeaning() && signature.getSignedAt() != null
                && Objects.equals(Long.valueOf(sysUserId), signature.getSignerId());
        if (!matches) {
            throw new IllegalArgumentException("电子签名与当前报告或当前用户不匹配");
        }
        return signature;
    }

    private ReportingData requireReportableResults(String patientId, String sysUserId) {
        ReportingData report = patientReportService.buildPatientResultsReport(patientId, sysUserId);
        if (report == null) {
            throw new IllegalArgumentException("未找到患者");
        }
        if (report.getRows() == null || report.getRows().isEmpty()) {
            throw new IllegalStateException("没有已审核且允许出报告的检验结果");
        }
        return report;
    }

    private void requirePrintable(PatientReportRelease release) {
        if (release.getStatus() != PatientReportReleaseStatus.ISSUED || release.getPdfContent() == null) {
            throw new IllegalStateException("只有当前有效的正式报告可以下载或打印");
        }
    }

    private PatientReportReleaseSummary toSummary(PatientReportRelease release) {
        return new PatientReportReleaseSummary(release.getId(), release.getPatientId(), release.getReportNumber(),
                release.getReportVersion(), release.getStatus(), release.getCreatedAt(),
                userDisplayName(release.getIssuedBy()),
                release.getIssuedAt(), release.getSupersedesReleaseId(), release.getAmendmentReason(),
                release.getVoidedAt(), release.getVoidReason(), release.getPdfSha256(), release.getAccessionNumbers(),
                release.getPrintCount(), release.getLastPrintedAt());
    }

    private String accessionNumbers(ReportingData data) {
        return data.getRows().stream().map(ReportRow::getDataMap)
                .map(values -> values.get("accessionNumber"))
                .filter(Objects::nonNull).map(String::valueOf).filter(value -> !value.isBlank()).distinct().sorted()
                .collect(Collectors.joining(","));
    }

    private String displayName(SystemUser user, String fallback) {
        if (user == null) {
            return fallback == null ? "" : fallback;
        }
        String name = List.of(user.getLastName(), user.getFirstName()).stream().filter(Objects::nonNull)
                .map(String::trim).filter(value -> !value.isEmpty()).collect(Collectors.joining(" "));
        return name.isEmpty() ? (fallback == null ? "" : fallback) : name;
    }

    private String userDisplayName(String userId) {
        return isBlank(userId) ? "" : displayName(systemUserService.getUserById(userId), userId);
    }

    private String newReportNumber() {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
        return "BG-" + LocalDate.now().format(REPORT_NUMBER_DATE) + "-" + suffix;
    }

    private String sha256(byte[] value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte current : digest) {
                result.append(String.format("%02x", current));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("当前运行环境不支持 SHA-256", e);
        }
    }

    private void requireIdentifier(String value, String message) {
        if (isBlank(value) || !value.matches("^[0-9]+$")) {
            throw new IllegalArgumentException(message);
        }
    }

    private String normalize(String value) {
        return isBlank(value) ? null : value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}

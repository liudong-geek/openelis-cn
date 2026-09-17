package org.openelisglobal.resultvalidation.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.apache.commons.codec.digest.DigestUtils;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.OrderStatus;
import org.openelisglobal.common.services.registration.ValidationUpdateRegister;
import org.openelisglobal.common.services.registration.interfaces.IResultUpdate;
import org.openelisglobal.common.util.ControllerUtills;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.dataexchange.orderresult.OrderResponseWorker.Event;
import org.openelisglobal.esig.service.ElectronicSignatureService;
import org.openelisglobal.esig.valueholder.SignatureMeaning;
import org.openelisglobal.note.service.NoteService;
import org.openelisglobal.note.service.NoteServiceImpl.NoteType;
import org.openelisglobal.note.valueholder.Note;
import org.openelisglobal.notification.service.TestNotificationService;
import org.openelisglobal.notification.valueholder.NotificationConfigOption.NotificationNature;
import org.openelisglobal.qc.service.QCReleaseGateService;
import org.openelisglobal.result.action.util.ResultSet;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.resultvalidation.form.ResultValidationForm.ReviewSignature;
import org.openelisglobal.resultvalidation.util.ResultValidationSaveService;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

/**
 * A review changes status, notes and signatures atomically; stored results
 * remain untouched.
 */
@Service
public class ReviewSubmissionService {
    private final ReviewWriteGuard guard;
    private final AnalysisService analyses;
    private final IStatusService statuses;
    private final NoteService notes;
    private final SampleService samples;
    private final SampleHumanService sampleHumans;
    private final ElectronicSignatureService signatures;
    private final SystemUserService users;
    private final OrdinaryResultSaveStateDAO states;
    private final FhirTransformService fhir;
    private final TestNotificationService notifications;
    private final QCReleaseGateService qcReleaseGate;
    private final ObjectMapper mapper = new ObjectMapper();

    public ReviewSubmissionService(ReviewWriteGuard guard, AnalysisService analyses, IStatusService statuses,
            NoteService notes, SampleService samples, SampleHumanService sampleHumans,
            ElectronicSignatureService signatures, SystemUserService users, OrdinaryResultSaveStateDAO states,
            FhirTransformService fhir, TestNotificationService notifications, QCReleaseGateService qcReleaseGate) {
        this.guard = guard;
        this.analyses = analyses;
        this.statuses = statuses;
        this.notes = notes;
        this.samples = samples;
        this.sampleHumans = sampleHumans;
        this.signatures = signatures;
        this.users = users;
        this.states = states;
        this.fhir = fhir;
        this.notifications = notifications;
        this.qcReleaseGate = qcReleaseGate;
    }

    @Transactional(isolation = Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    public void save(HttpServletRequest request, String actor, List<AnalysisItem> rows, ReviewSignature credentials) {
        var session = request.getSession(false);
        Runnable verifyActor = () -> {
            if (session == null || request.getSession(false) != session
                    || !Objects.equals(actor, ControllerUtills.getSysUserId(request)))
                throw ReviewWriteGuard.forbidden();
            var currentUser = users.get(actor);
            if (currentUser == null || !"Y".equals(currentUser.getIsActive()))
                throw ReviewWriteGuard.forbidden();
        };
        try {
            verifyActor.run();
            var locked = guard.begin(actor, rows);
            qcReleaseGate.requireReleasable(locked.analyses(), locked.decisions());
            boolean esigEnabled = signatures.isEsigEnabled();
            String login = null;
            if (esigEnabled) {
                var user = users.get(actor);
                if (user == null || !"Y".equals(user.getIsActive()) || credentials == null
                        || StringUtils.isBlank(credentials.getPassword())
                        || !Objects.equals(user.getLoginName(), credentials.getUsername()))
                    throw ReviewWriteGuard.badRequest("Review signing credentials are required for the current user");
                login = user.getLoginName();
            }
            Map<String, String> contents = new LinkedHashMap<>();
            Map<String, Long> signatureIds = new LinkedHashMap<>();
            for (var entry : locked.decisions().entrySet()) {
                String content = content(entry.getKey(), actor, entry.getValue(), locked.analyses().get(entry.getKey()));
                contents.put(entry.getKey(), content);
                var decision = entry.getValue().get(0);
                if (esigEnabled) {
                    try {
                        var signature = signatures.executeSignatureForSnapshot(login, credentials.getPassword(),
                                decision.getIsAccepted() ? SignatureMeaning.VALIDATED_AND_RELEASED
                                        : SignatureMeaning.REJECTED,
                                "ANALYSIS", Long.valueOf(entry.getKey()),
                                decision.getIsRejected() ? StringUtils.trimToEmpty(decision.getNote()) : null,
                                request.getRemoteAddr(), request.getHeader("User-Agent"), content);
                        if (signature == null || signature.getId() == null)
                            throw ReviewWriteGuard.conflict();
                        signatureIds.put(entry.getKey(), signature.getId());
                    } catch (IllegalArgumentException e) {
                        throw ReviewWriteGuard.badRequest("Invalid review signing credentials or certification");
                    }
                }
            }
            verifyActor.run();
            locked.verify().run();
            if (esigEnabled != signatures.isEsigEnabled())
                throw ReviewWriteGuard.conflict();
            List<Analysis> changedAnalyses = new ArrayList<>();
            ArrayList<Result> reviewedResults = new ArrayList<>();
            ArrayList<Note> createdNotes = new ArrayList<>();
            ArrayList<Sample> changedSamples = new ArrayList<>();
            ResultValidationSaveService eventData = new ResultValidationSaveService();
            eventData.setCurrentUserId(actor);
            List<IResultUpdate> updaters = registeredUpdaters();
            Map<String, String> targets = new LinkedHashMap<>();
            Map<String, Timestamp> releaseDates = new LinkedHashMap<>();
            for (var entry : locked.decisions().entrySet()) {
                String id = entry.getKey();
                var decision = entry.getValue().get(0);
                var analysis = locked.analyses().get(id);
                String target = statuses.getStatusID(
                        decision.getIsAccepted() ? AnalysisStatus.Finalized : AnalysisStatus.BiologistRejected);
                Timestamp released = decision.getIsAccepted() ? new Timestamp(System.currentTimeMillis()) : null;
                analysis.setSysUserId(actor);
                analysis.setStatusId(target);
                analysis.setReleasedDate(released);
                targets.put(id, target);
                releaseDates.put(id, released);
                analyses.update(analysis);
                changedAnalyses.add(analysis);
                String text = StringUtils.trimToEmpty(decision.getNote());
                if (!text.isEmpty())
                    addNote(analysis, decision.getIsAccepted() ? NoteType.EXTERNAL : NoteType.INTERNAL, text,
                            "Result Note", actor, createdNotes);
                // Preserve the exact reviewed content even when the site disables e-signatures.
                addNote(analysis, NoteType.INTERNAL, "sha256=" + DigestUtils.sha256Hex(contents.get(id))
                        + ";signatureId=" + signatureIds.get(id) + ";content=" + contents.get(id),
                        Note.REVIEW_AUDIT_SUBJECT, actor, createdNotes);
                if (decision.getIsAccepted()) {
                    Sample sample = analysis.getSampleItem().getSample();
                    var patient = sampleHumans.getPatientForSample(sample);
                    for (Result result : locked.results().get(id)) {
                        result.setResultEvent(Event.FINAL_RESULT); // Transient event; no result value/version update.
                        reviewedResults.add(result);
                        eventData.addNewResultSet(new ResultSet(result, null, null, patient, sample, null, false));
                    }
                }
            }
            for (IResultUpdate updater : updaters)
                updater.transactionalUpdate(eventData);
            finishSamples(actor, changedAnalyses, changedSamples);
            Runnable verifyFinal = () -> {
                verifyActor.run();
                qcReleaseGate.requireReleasable(locked.analyses(), locked.decisions());
                if (esigEnabled != signatures.isEsigEnabled())
                    throw ReviewWriteGuard.conflict();
                locked.verifyResultsAndAccess().run();
                for (var entry : locked.decisions().entrySet()) {
                    var analysis = locked.analyses().get(entry.getKey());
                    var decision = entry.getValue().get(0);
                    if (!Objects.equals(targets.get(entry.getKey()), analysis.getStatusId())
                            || !Objects.equals(targets.get(entry.getKey()),
                                    statuses.getStatusID(decision.getIsAccepted() ? AnalysisStatus.Finalized
                                            : AnalysisStatus.BiologistRejected))
                            || !Objects.equals(releaseDates.get(entry.getKey()), analysis.getReleasedDate()))
                        throw ReviewWriteGuard.conflict();
                }
            };
            verifyFinal.run();
            states.flush();
            verifyFinal.run();
            guard.verifyPersisted(locked);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void beforeCommit(boolean readOnly) {
                    states.flush();
                    verifyFinal.run();
                    guard.verifyPersisted(locked);
                }

                @Override
                public void afterCommit() {
                    // External effects are intentionally beyond the clinical transaction. A failure
                    // is logged for reconciliation and never changes a committed review to
                    // "failed".
                    try {
                        fhir.transformPersistResultValidationFhirObjects(List.of(), changedAnalyses, reviewedResults,
                                rows, changedSamples, createdNotes);
                    } catch (Exception e) {
                        LogEvent.logError(e);
                    }
                    for (Result result : reviewedResults) {
                        try {
                            notifications.createAndSendNotificationsToConfiguredSources(
                                    NotificationNature.RESULT_VALIDATION, result);
                        } catch (RuntimeException e) {
                            LogEvent.logError(e);
                        }
                    }
                    for (IResultUpdate updater : updaters) {
                        try {
                            updater.postTransactionalCommitUpdate(eventData);
                        } catch (RuntimeException e) {
                            LogEvent.logError(e);
                        }
                    }
                }
            });
        } finally {
            if (credentials != null)
                credentials.clear();
        }
    }

    protected List<IResultUpdate> registeredUpdaters() {
        return ValidationUpdateRegister.getRegisteredUpdaters();
    }

    private void addNote(Analysis analysis, NoteType type, String text, String subject, String actor,
            List<Note> created) {
        Note note = notes.createSavableNote(analysis, type, text, subject, actor);
        if (note == null)
            throw ReviewWriteGuard.conflict();
        notes.insert(note);
        created.add(note);
    }

    private void finishSamples(String actor, List<Analysis> changed, List<Sample> finished) {
        Set<String> done = Set.of(statuses.getStatusID(AnalysisStatus.Finalized),
                statuses.getStatusID(AnalysisStatus.Canceled),
                statuses.getStatusID(AnalysisStatus.NonConforming_depricated));
        changed.stream().map(a -> a.getSampleItem().getSample().getId()).distinct().forEach(id -> {
            var all = analyses.getAnalysesBySampleId(id);
            if (all != null && !all.isEmpty() && all.stream().allMatch(a -> done.contains(a.getStatusId()))) {
                Sample sample = samples.get(id);
                sample.setSysUserId(actor);
                sample.setStatusId(statuses.getStatusID(OrderStatus.Finished));
                samples.update(sample);
                finished.add(sample);
            }
        });
    }

    private String content(String analysisId, String actor, List<AnalysisItem> rows, Analysis analysis) {
        var row = rows.get(0);
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("schema", "openelis.review.v1");
        content.put("analysisId", analysisId);
        content.put("actor", actor);
        content.put("sampleId", row.getSampleId());
        content.put("sampleItemId", row.getSampleItemId());
        content.put("accessionNumber", row.getAccessionNumber());
        content.put("testId", row.getTestId());
        content.put("analyzerId", analysis == null ? null : analysis.getAnalyzerId());
        content.put("qualityControlReleaseGate",
                analysis == null || StringUtils.isBlank(analysis.getAnalyzerId()) ? "NOT_APPLICABLE" : "PASSED");
        content.put("analysisVersion", row.getAnalysisLastupdated());
        content.put("sourceStatus", row.getStatusId());
        content.put("decision", row.getIsAccepted() ? "ACCEPT" : "RETURN");
        content.put("note", StringUtils.trimToEmpty(row.getNote()));
        content.put("members", rows.stream().flatMap(r -> r.getResultMembers().stream())
                .sorted(java.util.Comparator.comparing(AnalysisItem.ResultMember::resultId)).toList());
        try {
            return mapper.writeValueAsString(content);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Review content unavailable", e);
        }
    }
}

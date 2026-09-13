package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.labelpreset.dao.OrderLabelRequestDAO;
import org.openelisglobal.labelpreset.dto.OrderLabelPersistRequest;
import org.openelisglobal.labelpreset.valueholder.OrderLabelRequest;
import org.openelisglobal.labelpreset.valueholder.LabelPreset;
import org.openelisglobal.patient.action.IPatientUpdate.PatientUpdateStatus;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.dao.EntrySubmissionReceiptDAO;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.validator.SamplePatientEntryFormValidator;
import org.openelisglobal.sample.valueholder.EntrySubmissionReceipt;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampletyperequest.dto.SampleTypeRequestDTO;
import org.openelisglobal.sampletyperequest.service.SampleTypeRequestService;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.BindingResult;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** SIM coordinator decisions. The entry-proxy suite verifies joint rollback. */
public class EntrySubmissionServiceTest {
    private static final String KEY = "a9e817f3-3356-4518-9b85-81b0a143a531";
    private EntrySubmissionService subject;
    private EntrySubmissionReceiptDAO receipts;
    private SamplePatientEntryService entries;
    private SamplePatientEntryFormValidator validator;
    private SampleService samples;
    private UserService users;
    private OrderLabelRequestDAO labels;
    private SampleTypeRequestService specimenRequests;
    private PatientService patients;
    private EntryCurrentStateReader currentStates;
    private MockHttpServletRequest request;
    private SamplePatientEntryForm form;
    private BindingResult errors;
    private EntrySubmissionCommand command;
    private EntrySubmissionReceipt stored;

    @Before
    public void setUp() throws Exception {
        subject = new EntrySubmissionService();
        receipts = mock(EntrySubmissionReceiptDAO.class);
        entries = mock(SamplePatientEntryService.class);
        validator = mock(SamplePatientEntryFormValidator.class);
        samples = mock(SampleService.class);
        users = mock(UserService.class);
        labels = mock(OrderLabelRequestDAO.class);
        specimenRequests = mock(SampleTypeRequestService.class);
        set("specimenRequests", specimenRequests);
        patients = mock(PatientService.class); set("patients", patients);
        currentStates = mock(EntryCurrentStateReader.class); set("currentStates", currentStates);
        set("receipts", receipts); set("entries", entries); set("validator", validator);
        set("samples", samples); set("users", users); set("labels", labels);
        request = new MockHttpServletRequest();
        var principal = User.withUsername("SIM-receipt-user").password("SIM-unused").roles("RECEPTION").build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", SecurityContextHolder.getContext());
        var oe = new UserSessionData(); oe.setSytemUserId(7);
        request.getSession().setAttribute("userSessionData", oe);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        var guard = new OrderEntryActorGuard();
        var systemUsers = mock(SystemUserService.class);
        var logins = mock(LoginUserService.class);
        var roles = mock(UserRoleService.class);
        var user = new SystemUser(); user.setId("7"); user.setLoginName("SIM-receipt-user"); user.setIsActive("Y");
        var account = new LoginUser(); account.setLoginName("SIM-receipt-user"); account.setSystemUserId(7);
        account.setAccountDisabled("N"); account.setAccountLocked("N"); account.setPasswordExpiredDayNo(1);
        when(systemUsers.getMatch("loginName", "SIM-receipt-user")).thenReturn(Optional.of(user));
        when(logins.getMatch("loginName", "SIM-receipt-user")).thenReturn(Optional.of(account));
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(true);
        ReflectionTestUtils.setField(guard, "systemUserService", systemUsers);
        ReflectionTestUtils.setField(guard, "loginUserService", logins);
        ReflectionTestUtils.setField(guard, "userRoleService", roles);
        set("actors", guard);
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
        form = new SamplePatientEntryForm(); form.setOrderEntryOnly(true);
        form.setPatientProperties(new org.openelisglobal.patient.action.bean.PatientManagementInfo());
        form.getPatientProperties().setPatientPK("501");
        form.getPatientProperties().setPatientUpdateStatus(org.openelisglobal.patient.action.IPatientUpdate.PatientUpdateStatus.NO_ACTION);
        var order = new SampleOrderItem(); order.setLabNo("SIM-RECEIPT"); form.setSampleOrderItems(order);
        form.setRequestedSpecimens(List.of(tube(null, 0), tube(null, 1)));
        errors = new BeanPropertyBindingResult(form, "form");
        command = command("SIM-body-v1");
        var sample = new Sample(); sample.setId("301"); sample.setAccessionNumber("SIM-RECEIPT");
        var patient = new Patient(); patient.setId("501");
        when(samples.get("301")).thenReturn(sample); when(samples.getPatient(sample)).thenReturn(patient);
        when(specimenRequests.getRequestsBySampleId("301")).thenReturn(List.of(row(701, 0), row(702, 1)));
        when(labels.listByParentSampleId("301")).thenReturn(List.of());
        when(users.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION))
                .thenReturn(List.of(new IdValuePair("41", "SIM-test")));
        doAnswer(call -> { stored = call.getArgument(0); return null; }).when(receipts).claim(any());
        doAnswer(call -> { ((EntrySubmissionReceipt) call.getArgument(0)).complete(call.getArgument(1)); return null; })
                .when(receipts).complete(any(), anyString());
        doAnswer(call -> {
            order.setSampleId("301");
            form.setRequestedSpecimens(List.of(tube("701", 0), tube("702", 1)));
            return null;
        }).when(entries).saveEntry(form, request, errors);
    }

    @After public void after() {
        TransactionSynchronizationManager.clear(); SecurityContextHolder.clearContext(); RequestContextHolder.resetRequestAttributes();
    }
    private void set(String name, Object value) { ReflectionTestUtils.setField(subject, name, value); }
    private EntrySubmissionCommand command(String body) {
        request.removeHeader(EntrySubmissionCommand.HEADER); request.addHeader(EntrySubmissionCommand.HEADER, KEY);
        var value = new EntrySubmissionCommand(KEY, EntrySubmissionCommand.fingerprint(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)), form);
        request.setAttribute(EntrySubmissionCommand.ATTRIBUTE, value); return value;
    }
    private static SampleTypeRequestDTO tube(String id, int sort) {
        var tube = new SampleTypeRequestDTO(); tube.setId(id); tube.setTypeOfSampleId("31");
        tube.setRequestedQuantity(1.0); tube.setRequestedTests("41");
        if (id != null) { tube.setSampleId("301"); tube.setSortOrder(sort); tube.setStatus("REQUESTED"); }
        return tube;
    }
    private static SampleTypeRequest row(int id, int sort) {
        var row = new SampleTypeRequest(); row.setId(id); row.setSortOrder(sort);
        var sample = new Sample(); sample.setId("301"); row.setSample(sample);
        var type = new TypeOfSample(); type.setId("31"); row.setTypeOfSample(type);
        row.setRequestedTests("41"); row.setRequestedQuantity(1.0);
        return row;
    }
    private EntrySubmissionService.Result save() throws Exception { return subject.submit(command, form, request, errors); }
    private void completed() throws Exception { save(); when(receipts.find(KEY)).thenReturn(stored); clearInvocations(entries, validator, receipts, samples, labels); }

    @Test public void claimPrecedesAllWritesAndCompleteFollowsActualIds() throws Exception {
        var result = save(); assertFalse(result.replayed()); assertEquals("701", result.receipt().path("requestedSpecimens").get(0).path("id").asText());
        assertEquals("702", result.receipt().path("requestedSpecimens").get(1).path("id").asText());
        assertEquals("501", result.receipt().path("patientId").asText());
        var order = inOrder(receipts, validator, entries);
        order.verify(receipts).find(KEY); order.verify(receipts).claim(any());
        order.verify(validator).validate(form, errors); order.verify(entries).saveEntry(form, request, errors);
        order.verify(receipts).complete(same(stored), anyString());
    }
    @Test public void sameKeyAndBodyReplaysWithoutCreateValidationOrWrites() throws Exception {
        completed(); errors.rejectValue("currentDate", "SIM-date-no-longer-today");
        assertTrue(save().replayed()); verifyZeroInteractions(entries, validator, samples, labels);
        verify(receipts, never()).claim(any()); verify(receipts, never()).complete(any(), any());
    }
    @Test public void changedBodyConflictsBeforeExistingNumberValidation() throws Exception {
        completed(); command = command("SIM-body-v2");
        assertEquals(409, assertThrows(EntrySubmissionException.class, this::save).getStatus());
        verifyZeroInteractions(entries, validator, samples, labels);
    }
    @Test public void sameKeyOtherOwnerCannotReadOrRecreate() throws Exception {
        when(receipts.find(KEY)).thenReturn(EntrySubmissionReceipt.claim(KEY, "8", command.fingerprint()));
        assertThrows(AccessDeniedException.class, this::save);
        assertThrows(AccessDeniedException.class, () -> subject.recover(KEY, request));
        verifyZeroInteractions(entries, validator, samples, labels);
    }
    @Test public void recoveryReturnsOriginalSnapshotNotCurrentOrderState() throws Exception {
        completed(); when(samples.get("301")).thenThrow(new IllegalStateException("Must not reload mutable state"));
        var result = subject.recover(KEY, request); assertTrue(result.replayed());
        assertEquals("REQUESTED", result.receipt().path("requestedSpecimens").get(0).path("status").asText());
        verifyZeroInteractions(entries, validator, samples, labels);
    }
    @Test public void currentReadUsesAuthorizedReceiptAndNeverRepeatsTheSave() throws Exception {
        completed();
        var facts = new EntryCurrentStateReader.Snapshot(1, true, "301", "SIM-RECEIPT", "clinical", "11", null, null, List.of(), List.of());
        when(currentStates.read(any(), eq("7"))).thenReturn(facts);
        String original = stored.getResponseJson();
        var result = subject.recoverCurrent(KEY, request);
        assertTrue(result.success()); assertSame(facts, result.current());
        assertEquals(original, result.receipt().toString()); assertEquals(original, stored.getResponseJson());
        verify(currentStates).read(eq(result.receipt()), eq("7"));
        verifyZeroInteractions(entries, validator, samples, labels);
        verify(receipts, never()).claim(any()); verify(receipts, never()).complete(any(), any());
    }
    @Test public void currentReadRejectsMissingOrOtherOwnersReceiptBeforeReadingPatientFacts() throws Exception {
        assertEquals(404, assertThrows(EntrySubmissionException.class, () -> subject.recoverCurrent(KEY, request)).getStatus());
        when(receipts.find(KEY)).thenReturn(EntrySubmissionReceipt.claim(KEY, "8", command.fingerprint()));
        assertThrows(AccessDeniedException.class, () -> subject.recoverCurrent(KEY, request));
        verifyZeroInteractions(currentStates, entries);
    }
    @Test public void currentReadRequiresOriginalPermissionAndCompleteReceipt() throws Exception {
        completed(); when(users.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION)).thenReturn(List.of());
        assertThrows(AccessDeniedException.class, () -> subject.recoverCurrent(KEY, request));
        when(receipts.find(KEY)).thenReturn(EntrySubmissionReceipt.claim(KEY, "7", command.fingerprint()));
        assertThrows(EntrySubmissionException.class, () -> subject.recoverCurrent(KEY, request));
        verifyZeroInteractions(currentStates, entries);
    }
    @Test public void currentReadCannotReturnSuccessAfterActorChangesDuringRead() throws Exception {
        completed(); when(currentStates.read(any(), any())).thenAnswer(call -> {
            SecurityContextHolder.clearContext();
            return new EntryCurrentStateReader.Snapshot(1, true, "301", "SIM-RECEIPT", "clinical", "11", null, null, List.of(), List.of());
        });
        assertThrows(AccessDeniedException.class, () -> subject.recoverCurrent(KEY, request));
    }
    @Test public void currentReadFailureOrNullNeverReturnsAnHistoricalOnlySuccess() throws Exception {
        completed(); assertThrows(EntrySubmissionException.class, () -> subject.recoverCurrent(KEY, request));
        when(currentStates.read(any(), any())).thenThrow(new IllegalStateException("SIM-read-failure"));
        assertThrows(IllegalStateException.class, () -> subject.recoverCurrent(KEY, request));
        verifyZeroInteractions(entries, samples, labels);
    }
    @Test public void historicalRecoveryDoesNotLoadCurrentFacts() throws Exception {
        completed(); subject.recover(KEY, request); verifyZeroInteractions(currentStates);
    }

    @Test public void revokedTestPermissionDeniesReplayAndRecovery() throws Exception {
        completed(); when(users.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION)).thenReturn(List.of());
        assertThrows(AccessDeniedException.class, this::save);
        assertThrows(AccessDeniedException.class, () -> subject.recover(KEY, request));
        verifyZeroInteractions(entries, validator, samples, labels);
    }
    @Test public void missingRecoveryIsNotProofOfRollback() {
        var error = assertThrows(EntrySubmissionException.class, () -> subject.recover(KEY, request));
        assertEquals(404, error.getStatus()); assertTrue(error.getMessage().contains("可能仍在处理"));
    }
    @Test public void claimConflictEscapesWithoutAnyEntryWritesOrSameTransactionRecovery() {
        doThrow(new IllegalStateException("SIM unique conflict")).when(receipts).claim(any());
        assertThrows(IllegalStateException.class, this::save);
        verify(receipts, times(1)).find(KEY); verifyZeroInteractions(entries, validator, samples, labels);
    }
    @Test public void completionFailureNeverReturnsSuccess() {
        doThrow(new IllegalStateException("SIM completion flush failure")).when(receipts).complete(any(), any());
        assertThrows(IllegalStateException.class, this::save);
    }
    @Test public void incompletePersistedReceiptIsNotRecreated() {
        when(receipts.find(KEY)).thenReturn(EntrySubmissionReceipt.claim(KEY, "7", command.fingerprint()));
        assertThrows(EntrySubmissionException.class, this::save); verifyZeroInteractions(entries, validator);
    }
    @Test public void missingWireCaptureOrDifferentFormCannotFallback() {
        request.removeAttribute(EntrySubmissionCommand.ATTRIBUTE);
        assertThrows(EntrySubmissionException.class, this::save); verifyZeroInteractions(receipts, entries);
    }
    @Test public void legacyAndCollectionFormsCannotClaim() {
        form.setOrderEntryOnly(false); assertThrows(EntrySubmissionException.class, this::save);
        form.setOrderEntryOnly(true); form.setCollectionOnly(true); assertThrows(EntrySubmissionException.class, this::save);
        verify(receipts, never()).claim(any()); verifyZeroInteractions(entries);
    }
    @Test public void missingTubeResultCannotBeCompleted() throws Exception {
        doAnswer(call -> { form.getSampleOrderItems().setSampleId("301"); form.setRequestedSpecimens(List.of(tube("701", 0))); return null; })
                .when(entries).saveEntry(form, request, errors);
        assertThrows(EntrySubmissionException.class, this::save); verify(receipts, never()).complete(any(), any());
    }
    @Test public void duplicateOrCrossOrderTubeCannotBeCompleted() throws Exception {
        doAnswer(call -> { form.getSampleOrderItems().setSampleId("301"); form.setRequestedSpecimens(List.of(tube("701", 0), tube("701", 1))); return null; })
                .when(entries).saveEntry(form, request, errors);
        assertThrows(EntrySubmissionException.class, this::save); verify(receipts, never()).complete(any(), any());
    }
    @Test public void missingPatientCannotBeCompleted() throws Exception {
        when(samples.getPatient(any())).thenReturn(null);
        assertThrows(EntrySubmissionException.class, this::save); verify(receipts, never()).complete(any(), any());
    }
    @Test public void validLookingReturnedTubesCannotHideMissingStoredRows() {
        when(specimenRequests.getRequestsBySampleId("301")).thenReturn(List.of());
        assertThrows(EntrySubmissionException.class, this::save);
        verify(receipts, never()).complete(any(), any());
    }
    @Test public void missingSecondStoredTubeCannotBeCompleted() {
        when(specimenRequests.getRequestsBySampleId("301")).thenReturn(List.of(row(701, 0)));
        assertThrows(EntrySubmissionException.class, this::save);
        verify(receipts, never()).complete(any(), any());
    }
    @Test public void extraStoredTubeCannotBeCompleted() {
        when(specimenRequests.getRequestsBySampleId("301")).thenReturn(List.of(row(701, 0), row(702, 1), row(703, 2)));
        assertThrows(EntrySubmissionException.class, this::save);
        verify(receipts, never()).complete(any(), any());
    }
    @Test public void storedTubeWithAnotherParentCannotBeCompleted() {
        var other = row(702, 1); other.getSample().setId("302");
        when(specimenRequests.getRequestsBySampleId("301")).thenReturn(List.of(row(701, 0), other));
        assertThrows(EntrySubmissionException.class, this::save);
        verify(receipts, never()).complete(any(), any());
    }
    @Test public void differentValidPatientCannotBeCompleted() {
        var other = new Patient(); other.setId("502"); when(samples.getPatient(any())).thenReturn(other);
        assertThrows(EntrySubmissionException.class, this::save);
        verify(receipts, never()).complete(any(), any());
    }
    @Test public void corruptLabelSnapshotCannotBeRecovered() throws Exception {
        completed();
        var json = new com.fasterxml.jackson.databind.ObjectMapper();
        var corrupted = (com.fasterxml.jackson.databind.node.ObjectNode) json.readTree(stored.getResponseJson());
        corrupted.withArray("labelRequests").addObject().put("id", -1).put("presetId", 91).put("quantity", 1);
        ReflectionTestUtils.setField(stored, "responseJson", json.writeValueAsString(corrupted));
        assertThrows(EntrySubmissionException.class, () -> subject.recover(KEY, request));
    }
    @Test public void storedTubeContentCannotBeReplacedByValidLookingReturn() {
        var other = row(702, 1); other.setRequestedTests("42");
        when(specimenRequests.getRequestsBySampleId("301")).thenReturn(List.of(row(701, 0), other));
        assertThrows(EntrySubmissionException.class, this::save);
        verify(receipts, never()).complete(any(), any());
    }
    @Test public void duplicateStoredIdsCannotConfirmTwoTubes() {
        when(specimenRequests.getRequestsBySampleId("301")).thenReturn(List.of(row(701, 0), row(701, 1)));
        assertThrows(EntrySubmissionException.class, this::save);
    }
    @Test public void storedRowsMayArriveUnorderedButSnapshotFollowsOriginalTubeOrder() throws Exception {
        when(specimenRequests.getRequestsBySampleId("301")).thenReturn(List.of(row(702, 1), row(701, 0)));
        assertEquals("701", save().receipt().path("requestedSpecimens").get(0).path("id").asText());
    }
    @Test public void existingPatientCannotBeChangedEvenWhenFinalFormAndLinkAgree() throws Exception {
        var other = new Patient(); other.setId("502"); when(samples.getPatient(any())).thenReturn(other);
        doAnswer(call -> {
            form.getSampleOrderItems().setSampleId("301");
            form.setRequestedSpecimens(List.of(tube("701", 0), tube("702", 1)));
            form.getPatientProperties().setPatientPK("502"); return null;
        }).when(entries).saveEntry(form, request, errors);
        assertThrows(EntrySubmissionException.class, this::save);
    }
    @Test public void updatePreservesExistingPatient() throws Exception {
        form.getPatientProperties().setPatientUpdateStatus(PatientUpdateStatus.UPDATE);
        assertEquals("501", save().receipt().path("patientId").asText());
    }
    @Test public void addUsesNewlyAssignedPatientNotOriginalEmptyId() throws Exception {
        form.getPatientProperties().setPatientPK(null);
        form.getPatientProperties().setPatientUpdateStatus(PatientUpdateStatus.ADD);
        doAnswer(call -> {
            form.getSampleOrderItems().setSampleId("301");
            form.setRequestedSpecimens(List.of(tube("701", 0), tube("702", 1)));
            form.getPatientProperties().setPatientPK("501"); return null;
        }).when(entries).saveEntry(form, request, errors);
        assertEquals("501", save().receipt().path("patientId").asText());
    }
    @Test public void eqaConfiguredPatientIsCapturedBeforeEntryMutation() throws Exception {
        form.getSampleOrderItems().setIsEQASample(true);
        var eqa = new Patient(); eqa.setId("601"); when(patients.getPatientByNationalId("NULL")).thenReturn(eqa);
        when(samples.getPatient(any())).thenReturn(eqa);
        doAnswer(call -> {
            form.getSampleOrderItems().setSampleId("301");
            form.setRequestedSpecimens(List.of(tube("701", 0), tube("702", 1)));
            form.getPatientProperties().setPatientPK("601"); return null;
        }).when(entries).saveEntry(form, request, errors);
        assertEquals("601", save().receipt().path("patientId").asText());
        var callOrder = inOrder(patients, receipts, entries);
        callOrder.verify(patients).getPatientByNationalId("NULL");
        callOrder.verify(receipts).claim(any()); callOrder.verify(entries).saveEntry(form, request, errors);
    }
    @Test public void eqaWithoutConfiguredPatientRetainsOriginalPatientContract() throws Exception {
        form.getSampleOrderItems().setIsEQASample(true);
        assertEquals("501", save().receipt().path("patientId").asText());
    }
    @Test public void eqaCannotSilentlyIgnoreConfiguredPatient() {
        form.getSampleOrderItems().setIsEQASample(true);
        var eqa = new Patient(); eqa.setId("601"); when(patients.getPatientByNationalId("NULL")).thenReturn(eqa);
        assertThrows(EntrySubmissionException.class, this::save);
    }
    @Test public void environmentalWithStaleClinicalPatientRejectedBeforeClaim() {
        form.getSampleOrderItems().setEnvironmentalFields(java.util.Map.of("workflowType", "environmental"));
        assertThrows(EntrySubmissionException.class, this::save);
        verify(receipts, never()).claim(any()); verifyZeroInteractions(entries);
    }
    @Test public void environmentalWithoutPatientRemainsSupported() throws Exception {
        form.getSampleOrderItems().setEnvironmentalFields(java.util.Map.of("workflowType", "environmental"));
        form.getPatientProperties().setPatientPK(null); when(samples.getPatient(any())).thenReturn(null);
        assertFalse(save().receipt().has("patientId"));
    }
    @Test public void environmentalActualPatientAssociationCannotBeHidden() {
        form.getSampleOrderItems().setEnvironmentalFields(java.util.Map.of("workflowType", "environmental"));
        form.getPatientProperties().setPatientPK(null);
        assertThrows(EntrySubmissionException.class, this::save);
        verify(receipts, never()).complete(any(), any());
    }
    private void requestOrderLabel(int quantity) {
        var payload = new OrderLabelPersistRequest();
        payload.setOrderCells(new java.util.ArrayList<>(List.of(new OrderLabelPersistRequest.PersistCell(91, quantity))));
        form.setLabelPersistRequest(payload);
    }
    private OrderLabelRequest storedLabel() {
        var label = new OrderLabelRequest(); label.setId(801); label.setQty(2);
        var sample = new Sample(); sample.setId("301"); label.setParentSample(sample);
        var preset = new LabelPreset(); preset.setId(91); label.setPreset(preset); return label;
    }
    @Test public void actualOrderLabelsAreIncludedAndRecoverable() throws Exception {
        requestOrderLabel(2); when(labels.listByParentSampleId("301")).thenReturn(List.of(storedLabel()));
        completed(); var output = subject.recover(KEY, request).receipt().path("labelRequests").get(0);
        assertEquals(801, output.path("id").asInt()); assertEquals(91, output.path("presetId").asInt());
        assertEquals(2, output.path("quantity").asInt());
    }
    @Test public void lostLabelCannotBeHiddenByMutatingSavedForm() throws Exception {
        requestOrderLabel(2);
        doAnswer(call -> {
            form.getSampleOrderItems().setSampleId("301");
            form.setRequestedSpecimens(List.of(tube("701", 0), tube("702", 1)));
            form.getLabelPersistRequest().getOrderCells().clear(); return null;
        }).when(entries).saveEntry(form, request, errors);
        assertThrows(EntrySubmissionException.class, this::save);
        verify(receipts, never()).complete(any(), any());
    }
    @Test public void crossOrderLabelCannotBeCompleted() {
        requestOrderLabel(2); var label = storedLabel(); label.getParentSample().setId("302");
        when(labels.listByParentSampleId("301")).thenReturn(List.of(label));
        assertThrows(EntrySubmissionException.class, this::save);
    }
    @Test public void duplicateOrMalformedLabelSnapshotsCannotBeRecovered() throws Exception {
        requestOrderLabel(2); when(labels.listByParentSampleId("301")).thenReturn(List.of(storedLabel())); completed();
        String original = stored.getResponseJson(); var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        for (String malformed : List.of("{\"id\":802,\"presetId\":91,\"quantity\":1}",
                "{\"id\":801,\"presetId\":92,\"quantity\":1}",
                "{\"id\":802,\"presetId\":92,\"quantity\":0}",
                "{\"id\":802,\"presetId\":92,\"quantity\":2147483648}",
                "{\"id\":802,\"presetId\":92,\"quantity\":\"1\"}")) {
            var corrupt = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(original);
            corrupt.withArray("labelRequests").add(mapper.readTree(malformed));
            ReflectionTestUtils.setField(stored, "responseJson", mapper.writeValueAsString(corrupt));
            assertThrows(EntrySubmissionException.class, () -> subject.recover(KEY, request));
        }
    }
    @Test public void returnedSnapshotCannotMutateStoredReceipt() throws Exception {
        completed(); var response = subject.recover(KEY, request);
        ((com.fasterxml.jackson.databind.node.ObjectNode) response.receipt()).put("patientId", "999");
        assertEquals("501", subject.recover(KEY, request).receipt().path("patientId").asText());
    }
    @Test public void recoveryRejectsCoercedVersionOrChangedReceiptMetadata() throws Exception {
        completed(); String original = stored.getResponseJson();
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        for (String changes : List.of("{\"version\":1.5}", "{\"version\":\"1\"}",
                "{\"hashVersion\":\"SIM-other\"}", "{\"createdAt\":\"SIM-other\"}",
                "{\"workflowType\":\"environmental\"}")) {
            var corrupt = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(original);
            corrupt.setAll((com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(changes));
            ReflectionTestUtils.setField(stored, "responseJson", mapper.writeValueAsString(corrupt));
            assertThrows(EntrySubmissionException.class, () -> subject.recover(KEY, request));
        }
    }
}

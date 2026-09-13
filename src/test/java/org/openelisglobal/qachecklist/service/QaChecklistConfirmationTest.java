package org.openelisglobal.qachecklist.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.person.valueholder.Person;
import org.openelisglobal.qachecklist.dao.QaChecklistPrerequisiteDAO;
import org.openelisglobal.qachecklist.dao.SampleQaChecklistDAO;
import org.openelisglobal.qachecklist.form.QaChecklistConfirmationCommand;
import org.openelisglobal.qachecklist.valueholder.SampleQaChecklist;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Actual confirmation service/guard/actor/transactions. All resource records
 * are explicit SIM memory.
 */
public class QaChecklistConfirmationTest {
    private final QaChecklistCompletionTest fixture = new QaChecklistCompletionTest();
    private final ObjectMapper json = new ObjectMapper();
    private SampleQaChecklistService service;
    private Sample sample;
    private Patient patient;
    private PatientService patients;
    private QaChecklistPrerequisiteDAO prerequisites;
    private SampleQaChecklistDAO checklists;
    private SampleQaChecklist existing;
    private List<SampleTypeRequest> requests;
    private List<SampleItem> specimens;
    private List<Analysis> analyses;
    private List<Dictionary> configured;
    private QaChecklistReviewReader reader;
    private org.openelisglobal.sample.dao.SpecimenReceiptDAO specimenFacts;
    private static final String CONFIRMATION = "98019b5a-59df-4ee3-a5f1-e9df04136a3b";

    @Before
    public void setup() {
        fixture.setup();
        service = field("service");
        sample = field("sample");
        requests = field("requests");
        specimens = field("items");
        analyses = field("analyses");
        configured = field("configured");
        var target = field("target");
        checklists = field("checklists");
        when(checklists.findBySampleId(701)).thenAnswer(call -> existing);
        patients = mock(PatientService.class);
        patient = new Patient();
        patient.setId("801");
        patient.setNationalId("SIM-PATIENT-801");
        patient.setIsMerged(false);
        patient.setLastupdated(time("2026-09-01T00:00:00Z"));
        var person = new Person();
        person.setId("802");
        person.setFirstName("模拟患者");
        person.setLastupdated(time("2026-09-01T00:00:00Z"));
        patient.setPerson(person);
        when(patients.get("801")).thenReturn(patient);
        ReflectionTestUtils.setField(target, "patientService", patients);
        prerequisites = (QaChecklistPrerequisiteDAO) ReflectionTestUtils.getField(target, "qaChecklistPrerequisiteDAO");
        specimenFacts = field("specimens");
        reader = new QaChecklistReviewReader(service, prerequisites, patients, specimenFacts);
        sample.setLastupdated(time("2026-09-01T00:00:00Z"));
        requests.forEach(row -> row.setLastupdated(time("2026-09-01T01:00:00Z")));
        analyses.forEach(row -> row.setLastupdated(time("2026-09-01T01:00:00Z")));
        specimens.forEach(row -> {
            row.setQuantity(1.0);
            row.getTypeOfSample().setLastupdated(time("2026-09-01T00:00:00Z"));
        });
        analyses.forEach(row -> row.getTest().setLastupdated(time("2026-09-01T00:00:00Z")));
        for (int i = 0; i < configured.size(); i++) {
            configured.get(i).setId("" + (70 + i));
            configured.get(i).setLocalAbbreviation("模拟核对项" + i);
            configured.get(i).setLastupdated(time("2026-09-01T00:00:00Z"));
        }
        afterSave(() -> {
            persisted().setId(101);
            persisted().setLastupdated(time("2026-09-01T04:00:00.123456Z"));
        });
    }

    @After
    public void cleanup() {
        TransactionSynchronizationManager.setActualTransactionActive(false);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
        TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(null);
        fixture.cleanup();
    }

    @SuppressWarnings("unchecked")
    private <T> T field(String key) {
        return (T) ReflectionTestUtils.getField(fixture, key);
    }

    private void afterSave(Runnable action) {
        ReflectionTestUtils.setField(fixture, "afterSave", action);
    }

    private SampleQaChecklist persisted() {
        return field("persisted");
    }

    private static Timestamp time(String value) {
        return Timestamp.from(Instant.parse(value));
    }

    private QaChecklistFacts.Basis basis() {
        return QaChecklistFacts.capture(sample, patient, requests, specimens, analyses, configured,
                prerequisites.findPrerequisites(701), specimenFacts::statusName);
    }

    private ObjectNode command() {
        var command = json.createObjectNode();
        command.put("sampleId", "701").put("confirmationId", CONFIRMATION).put("expectedFactsDigest", basis().digest());
        command.put("expectedChecklistVersion",
                existing == null ? null : QaChecklistFacts.time(existing.getLastupdated()));
        command.set("specimenIds", json.valueToTree(basis().specimenIds()));
        command.set("verifiedItems", json.valueToTree(Map.of("patient", true, "specimen", true)));
        return command;
    }

    private Map<String, Object> confirm(ObjectNode command) {
        return service.confirmCurrentChecklist(command,
                ((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest());
    }

    private QaChecklistReviewReader.Review read() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);
        TransactionSynchronizationManager
                .setCurrentTransactionIsolationLevel(java.sql.Connection.TRANSACTION_REPEATABLE_READ);
        try {
            return reader.read(sample, "801", requests, specimens, analyses);
        } finally {
            TransactionSynchronizationManager.setActualTransactionActive(false);
            TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
            TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(null);
        }
    }

    private void rejects(ObjectNode body) {
        assertThrows(RuntimeException.class, () -> confirm(body));
        assertNull(persisted());
    }

    @Test
    public void explicitConfirmationPersistsBoundFactsThenIndependentCurrentReadMatches() {
        var before = read();
        assertEquals("NOT_CONFIRMED", before.state());
        assertEquals(basis().digest(), before.currentFactsDigest());
        var result = confirm(command());
        assertEquals(true, result.get("readbackRequired"));
        assertEquals(false, result.get("currentAcceptanceVerified"));
        assertEquals(CONFIRMATION, persisted().getConfirmationId());
        assertEquals(Integer.valueOf(7), persisted().getVerifiedByUserId());
        assertNotNull(QaChecklistConfirmation.validated(persisted()));
        existing = persisted();
        assertEquals("MATCHED_CONFIRMATION", read().state());
        assertFalse(read().currentAcceptanceVerified());
        assertEquals(CONFIRMATION, read().confirmationId());
    }

    @Test
    public void exactReplayDoesNotWriteAgainOrChangeReviewerTime() {
        var request = command();
        confirm(request);
        existing = persisted();
        String before = existing.getConfirmedContextJson();
        Timestamp reviewed = existing.getVerifiedDate();
        afterSave(() -> fail("Replay must not save"));
        assertEquals(true, confirm(request).get("replayed"));
        assertEquals(before, existing.getConfirmedContextJson());
        assertEquals(reviewed, existing.getVerifiedDate());
    }

    @Test
    public void sameIdWithDifferentExpectedVersionIsNotAReplay() {
        var body = command();
        confirm(body);
        existing = persisted();
        body.put("expectedChecklistVersion", QaChecklistFacts.time(existing.getLastupdated()));
        assertThrows(RuntimeException.class, () -> confirm(body));
    }

    @Test
    public void oldSaveCannotInheritConfirmation() {
        confirm(command());
        existing = persisted();
        var saved = service.saveOrUpdateChecklist(701, Map.of("patient", true, "specimen", true), 7);
        assertNull(saved.getConfirmationId());
        assertNull(saved.getConfirmedContextJson());
        assertNotNull(existing.getConfirmationId());
    }

    @Test
    public void missingTubeIsRejected() {
        var body = command();
        body.putArray("specimenIds").add("1001");
        rejects(body);
    }

    @Test
    public void extraTubeIsRejected() {
        var body = command();
        body.withArray("specimenIds").add("1999");
        rejects(body);
    }

    @Test
    public void incompleteChecklistIsRejected() {
        var body = command();
        ((ObjectNode) body.get("verifiedItems")).remove("patient");
        rejects(body);
    }

    @Test
    public void noImplicitBooleanCoercion() {
        var body = command();
        ((ObjectNode) body.get("verifiedItems")).put("patient", "true");
        rejects(body);
    }

    @Test
    public void changedFactsSinceDisplayAreRejected() {
        var body = command();
        specimens.get(0).setCollector("SIM-changed");
        rejects(body);
    }

    @Test
    public void changedPatientDetailsSinceDisplayAreRejected() {
        var body = command();
        patient.getPerson().setFirstName("模拟新名");
        rejects(body);
    }

    @Test
    public void changedConfigurationLabelIsRejected() {
        var body = command();
        configured.get(0).setLocalAbbreviation("模拟新规则");
        rejects(body);
    }

    @Test
    public void missingHistoricalVersionCannotConfirm() {
        var body = command();
        analyses.get(0).setLastupdated(null);
        rejects(body);
    }

    @Test
    public void oldChecklistVersionIsRejected() {
        var body = command();
        existing = new SampleQaChecklist();
        existing.setSampleId(701);
        existing.setLastupdated(time("2026-09-01T00:00:00Z"));
        rejects(body);
    }

    @Test
    public void mergedPatientCannotConfirm() {
        var body = command();
        patient.setIsMerged(true);
        rejects(body);
    }

    @Test
    public void missingReceiptCannotConfirm() {
        var body = command();
        specimens.get(0).setReceivedDate(null);
        rejects(body);
    }

    @Test
    public void validToValidFactsChangeAfterWriteRollsBack() {
        var body = command();
        afterSave(() -> specimens.get(0).setReceivedDate(time("2026-09-01T03:00:00Z")));
        rejects(body);
    }

    @Test
    public void patientChangeAfterWriteRollsBack() {
        var body = command();
        afterSave(() -> patient.getPerson().setFirstName("模拟晚变"));
        rejects(body);
    }

    @Test
    public void confirmationMutationAtOuterCommitRollsBack() {
        var body = command();
        var template = new TransactionTemplate((PlatformTransactionManager) field("transactions"));
        assertThrows(RuntimeException.class, () -> template.execute(status -> {
            confirm(body);
            persisted().setConfirmationId("6c0f1962-bfcb-4b5b-8db3-a56d6d7e1214");
            return null;
        }));
        assertNull(persisted());
    }

    @Test
    public void currentReadDetectsChangedValidFacts() {
        confirm(command());
        existing = persisted();
        specimens.get(0).setCollector("SIM-other");
        assertEquals("STALE_CONFIRMATION", read().state());
    }

    @Test
    public void malformedStoredContextIsNotConfirmation() {
        confirm(command());
        existing = persisted();
        existing.setConfirmedContextJson("{broken");
        assertEquals("INVALID_CONFIRMATION", read().state());
        assertNull(read().currentFactsDigest());
    }

    @Test
    public void signatureMismatchIsNotConfirmation() {
        confirm(command());
        existing = persisted();
        existing.setVerifiedByUserId(8);
        assertEquals("INVALID_CONFIRMATION", read().state());
    }

    @Test
    public void emptyConfigurationOnlyBlocksQaRead() {
        configured.clear();
        assertEquals("BLOCKED", read().state());
    }

    @Test
    public void missingReceiptOnlyBlocksQaRead() {
        specimens.get(0).setReceivedDate(null);
        assertEquals("BLOCKED", read().state());
    }

    @Test
    public void readRequiresExistingRepeatableReadBoundary() {
        assertThrows(IllegalStateException.class, () -> reader.read(sample, "801", requests, specimens, analyses));
    }

    @Test
    public void fieldOrderDoesNotChangeFactsButSubMillisecondReceiptChangesDo() {
        var initial = basis();
        java.util.Collections.reverse(specimens);
        java.util.Collections.reverse(configured);
        assertEquals(initial, basis());
        specimens.get(0).setReceivedDate(time("2026-09-01T02:00:00.123457Z"));
        assertNotEquals(initial.digest(), basis().digest());
    }

    @Test
    public void duplicateSpecimensAndDecimalIdsAndMissingVersionAreInvalid() {
        var body = command();
        body.withArray("specimenIds").add("1001");
        var duplicate = body;
        assertThrows(RuntimeException.class, () -> QaChecklistConfirmationCommand.parse(duplicate));
        body = command();
        body.put("sampleId", 701.5);
        var decimal = body;
        assertThrows(RuntimeException.class, () -> QaChecklistConfirmationCommand.parse(decimal));
        body = command();
        body.remove("expectedChecklistVersion");
        var missing = body;
        assertThrows(RuntimeException.class, () -> QaChecklistConfirmationCommand.parse(missing));
    }

    @Test
    public void actualHttpEntryReachesRealConfirmationTransaction() throws Exception {
        var session = ((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest()
                .getSession(false);
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders
                .standaloneSetup(
                        new org.openelisglobal.qachecklist.controller.QaChecklistConfirmationRestController(service))
                .build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/rest/qa-checklist/confirm-current")
                .session((org.springframework.mock.web.MockHttpSession) session).contentType("application/json")
                .content(command().toString()))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
        assertEquals(CONFIRMATION, persisted().getConfirmationId());
    }

    @Test
    public void permissionChangeAfterConfirmationRollsBack() {
        var body = command();
        afterSave(() -> ReflectionTestUtils.setField(fixture, "permitted", false));
        rejects(body);
    }

    @Test
    public void replayRowMutationAtOuterCommitIsRejected() {
        var body = command();
        confirm(body);
        existing = persisted();
        var template = new TransactionTemplate((PlatformTransactionManager) field("transactions"));
        assertThrows(RuntimeException.class, () -> template.execute(status -> {
            confirm(body);
            existing.setConfirmationId("6c0f1962-bfcb-4b5b-8db3-a56d6d7e1214");
            return null;
        }));
    }

    @Test
    public void overflowingStoredSchemaAndReviewerNeverValidate() throws Exception {
        confirm(command());
        existing = persisted();
        String original = existing.getConfirmedContextJson();
        var bad = (ObjectNode) json.readTree(original);
        bad.put("schema", 4294967297L);
        existing.setConfirmedContextJson(bad.toString());
        assertNull(QaChecklistConfirmation.validated(existing));
        bad = (ObjectNode) json.readTree(original);
        bad.put("reviewerId", 4294967303L);
        existing.setConfirmedContextJson(bad.toString());
        assertNull(QaChecklistConfirmation.validated(existing));
    }

    @Test
    public void brokenConfigurationDoesNotPoisonTheOuterCurrentReadTransaction() {
        configured.add(null);
        var template = new TransactionTemplate((PlatformTransactionManager) field("transactions"));
        template.setReadOnly(true);
        template.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_REPEATABLE_READ);
        var result = template.execute(status -> reader.read(sample, "801", requests, specimens, analyses));
        assertEquals("BLOCKED", result.state());
    }

    @Test public void startedAnalysisBlocksOnlyTheQaRead() {
        when(specimenFacts.statusName("3","ANALYSIS")).thenReturn("Testing Started");
        assertEquals("BLOCKED",read().state()); assertNull(read().currentFactsDigest());
    }

    @Test
    public void invalidPatientIdAndQuantitiesCannotBypassTheReadDomain() {
        var body = command();
        patient.getPerson().setId(null);
        rejects(body);
        assertEquals("BLOCKED", read().state());
        patient.getPerson().setId("802");
        specimens.get(0).setQuantity(Double.NaN);
        assertEquals("BLOCKED", read().state());
        assertThrows(RuntimeException.class, () -> basis());
    }

    @Test
    public void missingMasterVersionCannotBecomeConfirmed() {
        var body = command();
        specimens.get(0).getTypeOfSample().setLastupdated(null);
        rejects(body);
        assertEquals("BLOCKED", read().state());
    }

    @Test
    public void legacyJsonCoercionCannotValidateAConfirmation() {
        confirm(command());
        existing = persisted();
        existing.setVerifiedItemsJson("{\"patient\":\"true\",\"specimen\":true}");
        assertEquals("INVALID_CONFIRMATION", read().state());
        existing.setVerifiedItemsJson("{\"patient\":false,\"patient\":true,\"specimen\":true}");
        assertEquals("INVALID_CONFIRMATION", read().state());
    }

    @Test
    public void successfulReconfirmationUsesTheCurrentChecklistVersionAndNewId() {
        confirm(command());
        existing = persisted();
        String previous = existing.getConfirmationId();
        var next = command();
        next.put("confirmationId", "6c0f1962-bfcb-4b5b-8db3-a56d6d7e1214");
        assertEquals(false, confirm(next).get("replayed"));
        assertNotEquals(previous, persisted().getConfirmationId());
        assertEquals(previous, existing.getConfirmationId());
    }

    @Test
    public void damagedBindingCannotBeOverwrittenByNewOrLegacyConfirmation() {
        confirm(command());
        existing = persisted();
        existing.setConfirmedContextJson("{SIM-damaged");
        var next = command();
        next.put("confirmationId", "6c0f1962-bfcb-4b5b-8db3-a56d6d7e1214");
        assertThrows(RuntimeException.class, () -> confirm(next));
        assertThrows(RuntimeException.class,
                () -> service.saveOrUpdateChecklist(701, Map.of("patient", true, "specimen", true), 7));
        assertEquals("{SIM-damaged", existing.getConfirmedContextJson());
        assertEquals(CONFIRMATION, existing.getConfirmationId());
    }

    @Test
    public void halfPopulatedBindingIsPreservedForInvestigation() {
        var next = command();
        existing = new SampleQaChecklist();
        existing.setSampleId(701);
        existing.setConfirmationId(CONFIRMATION);
        existing.setLastupdated(time("2026-09-01T00:00:00Z"));
        next.put("expectedChecklistVersion", QaChecklistFacts.time(existing.getLastupdated()));
        assertThrows(RuntimeException.class, () -> confirm(next));
        assertEquals(CONFIRMATION, existing.getConfirmationId());
    }
}

package org.openelisglobal.result.integration;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.spi.PersistenceUnitInfo;
import java.net.URL;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.audittrail.daoimpl.AuditTrailServiceImpl;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.DefaultConfigurationProperties.OEProperties;
import org.openelisglobal.common.util.DefaultConfigurationProperties.PropertyHolder;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.esig.service.ElectronicSignatureService;
import org.openelisglobal.history.service.HistoryService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.note.service.NoteService;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.report.PatientReportReleaseSummary;
import org.openelisglobal.report.form.ReportDocumentSummary;
import org.openelisglobal.report.form.ReportGroupingRules;
import org.openelisglobal.report.service.PatientReportReleaseService;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.service.ReportGroupingConfigurationService;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;
import org.openelisglobal.result.form.ResultRestrictionRequest;
import org.openelisglobal.result.form.ResultRestrictionResponse;
import org.openelisglobal.result.form.ResultRestrictionResponse.FactState;
import org.openelisglobal.result.service.LogbookResultsPersistService;
import org.openelisglobal.result.service.ResultRestrictionAccess;
import org.openelisglobal.result.service.ResultRestrictionAccess.Action;
import org.openelisglobal.result.service.ResultRestrictionAccess.Phase;
import org.openelisglobal.result.service.ResultRestrictionException;
import org.openelisglobal.result.service.ResultRestrictionService;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.resultvalidation.service.ReviewSubmissionService;
import org.openelisglobal.sample.service.SamplePatientEntryService;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.service.SpecimenIntakeDecisionService;
import org.openelisglobal.sample.service.SpecimenLookupService;
import org.openelisglobal.sample.service.SpecimenReceiptService;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.service.TestService;
import org.springframework.aop.framework.AopProxyUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.persistenceunit.DefaultPersistenceUnitManager;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * A real PostgreSQL chain across the same production services used by the four
 * clinical workspaces. Only actor/master-data setup uses JDBC; every clinical
 * mutation goes through its production service and its current write guards.
 *
 * <p>
 * AppTestConfig supplies a DisplayListService mock. This test bridges that
 * existing harness limitation with values read from the real TestSection/Test
 * services; user, role, module, lab-unit, specimen and result authorization
 * stay persisted and real.
 * </p>
 */
public class RestrictedResultCrossRoleClinicalChainTest extends BaseWebContextSensitiveTest {

    private static final String DATASET = "testdata/restricted-result-cross-role-clinical-chain.xml";
    private static final String SAMPLE_ID = "9701";
    private static final String PATIENT_ID = "9701";
    private static final String REQUEST_ID = "9701";
    private static final String TEST_ID = "9701";
    private static final String SECTION_ID = "9701";
    private static final String LAB_NO = "26-CR9701";
    private static final String REPORT_GROUP = "CR-CHEM";
    private static final String PASSWORD = "adminADMIN!";
    private static final String PASSWORD_HASH = "$2a$10$uhFDEbHodC1Fv/nFQ3pCe.AbPxJqThyanWtC117EvdFrwEAQry0Wa";
    private static final String CERTIFICATION = "I certify this test signature as my legally binding signature.";
    private static final String PRODUCTION_PERSISTENCE_XML = "classpath:persistence/persistence.xml";
    private static final Set<String> REPORT_PERSISTENCE_CLASSES = Set.of(
            "org.openelisglobal.report.valueholder.ReportDocument",
            "org.openelisglobal.report.valueholder.ReportDocumentMember",
            "org.openelisglobal.report.valueholder.PatientReportRelease",
            "org.openelisglobal.integration.outbox.HisResultOutbox");

    private static final Actor RECEPTION = new Actor(97101, "chain-reception", -19701, List.of("Reception"));
    private static final Actor RESULTS = new Actor(97102, "chain-results", -19702, List.of("Results"));
    private static final Actor VALIDATION = new Actor(97103, "chain-validation", -19703, List.of("Validation"));
    private static final Actor REPORTS = new Actor(97104, "chain-reports", -19704, List.of("Reports"));
    private static final Actor RESULTS_RECEPTION = new Actor(97105, "chain-dual", -19705,
            List.of("Results", "Reception"));
    private static final List<Actor> ACTORS = List.of(RECEPTION, RESULTS, VALIDATION, REPORTS, RESULTS_RECEPTION);

    private final ObjectMapper json = new ObjectMapper();
    private final List<AuditBinding> auditBindings = new ArrayList<>();
    private final Map<String, Long> historyBefore = new LinkedHashMap<>();

    @Autowired
    private DataSource dataSource;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private IStatusService statuses;
    @Autowired
    private DisplayListService displayLists;
    @Autowired
    private TestSectionService testSections;
    @Autowired
    private TestService tests;
    @Autowired
    private ReferenceTablesService referenceTables;
    @Autowired
    private HistoryService histories;
    @Autowired
    private SamplePatientEntryService collectionService;
    @Autowired
    private SpecimenReceiptService receiptService;
    @Autowired
    private SpecimenIntakeDecisionService intakeService;
    @Autowired
    private SpecimenLookupService specimenLookup;
    @Autowired
    private LogbookResultsPersistService resultEntry;
    @Autowired
    private ReviewSubmissionService reviews;
    @Autowired
    private ResultRestrictionService restrictions;
    @Autowired
    private ResultRestrictionAccess restrictionAccess;
    @Autowired
    private ReportGroupingConfigurationService grouping;
    @Autowired
    private ReportDocumentService documents;
    @Autowired
    private PatientReportReleaseService releases;
    @Autowired
    private ElectronicSignatureService signatures;
    @Autowired
    private SampleItemService sampleItems;
    @Autowired
    private AnalysisService analyses;
    @Autowired
    private ResultService results;
    @Autowired
    private NoteService notes;
    @Autowired
    private SampleService samples;

    private JdbcTemplate jdbc;
    private OEProperties properties;
    private PropertyHolder permissionModeBefore;
    private PropertyHolder esigBefore;
    private DisplayListService displayListInstanceBefore;
    private boolean displayListMockConfigured;
    private Map<String, String> roleIds;

    @Before
    public void prepareClinicalChain() throws Exception {
        executeDataSetWithStateManagement(DATASET);
        jdbc = new JdbcTemplate(dataSource);
        statuses.refreshCache();
        assertCompleteAnalysisStatusConfiguration();

        properties = (OEProperties) ReflectionTestUtils.getField(ConfigurationProperties.getInstance(),
                "finalProperties");
        assertNotNull("The test must preserve the actual runtime configuration holder", properties);
        permissionModeBefore = properties.getPropertyHolder("permissions.agent");
        esigBefore = properties.getPropertyHolder(ConfigurationProperties.Property.ELECTRONIC_SIGNATURE_ENABLED);
        properties.setPropertyValue("permissions.agent", "ROLE");
        properties.setPropertyValue(ConfigurationProperties.Property.ELECTRONIC_SIGNATURE_ENABLED, "false");

        roleIds = Map.of("Reception", roleId("Reception"), "Results", roleId("Results"), "Validation",
                roleId("Validation"), "Reports", roleId("Reports"));
        seedActors();
        configureDisplayListHarness();
        assertAuditReferencesExist();
        installRealAuditServices();

        jdbc.update("DELETE FROM clinlims.report_definition WHERE id = ?",
                ReportGroupingConfigurationService.DEFINITION_ID);
        signatures.clearSigningSession(REPORTS.login());
        signatures.revokeCertification(REPORTS.login());
        for (Actor actor : ACTORS)
            historyBefore.put(actor.id(), historyCount(actor.id()));
    }

    private void assertCompleteAnalysisStatusConfiguration() {
        Set<String> configuredIds = new java.util.HashSet<>();
        for (AnalysisStatus status : AnalysisStatus.values()) {
            String id = statuses.getStatusID(status);
            assertNotNull("Missing ANALYSIS status mapping for " + status, id);
            assertTrue("Invalid ANALYSIS status identifier for " + status, id.matches("[1-9][0-9]{0,9}"));
            assertTrue("Duplicate ANALYSIS status identifier " + id + " for " + status, configuredIds.add(id));
        }
        assertEquals("Every review-policy status must resolve to one distinct ANALYSIS row",
                AnalysisStatus.values().length, configuredIds.size());
        assertEquals("The similarly named SAMPLE row must not satisfy the ANALYSIS mapping", "9717",
                statuses.getStatusID(AnalysisStatus.SampleRejected));
    }

    private void assertProductionReportPersistenceRegistration() throws Exception {
        var resolver = new PathMatchingResourcePatternResolver();
        URL productionDescriptor = resolver.getResource(PRODUCTION_PERSISTENCE_XML).getURL();
        URL productionRuntimeRoot = new URL(productionDescriptor, "../");

        DefaultPersistenceUnitManager manager = new DefaultPersistenceUnitManager();
        manager.setPersistenceXmlLocations(PRODUCTION_PERSISTENCE_XML);
        manager.setDefaultPersistenceUnitRootLocation(productionRuntimeRoot.toExternalForm());
        manager.setDefaultDataSource(dataSource);
        manager.preparePersistenceUnitInfos();

        LocalContainerEntityManagerFactoryBean factory = new LocalContainerEntityManagerFactoryBean();
        factory.setPersistenceUnitManager(manager);
        factory.setPersistenceUnitName("OpenELIS-Global-persistence-unit");
        factory.setDataSource(dataSource);

        EntityManagerFactory independentFactory = null;
        EntityManager entityManager = null;
        try {
            factory.afterPropertiesSet();
            PersistenceUnitInfo unit = factory.getPersistenceUnitInfo();
            assertEquals("OpenELIS-Global-persistence-unit", unit.getPersistenceUnitName());
            assertEquals("org.hibernate.jpa.HibernatePersistenceProvider", unit.getPersistenceProviderClassName());
            assertEquals("hibernate/hibernate.cfg.xml", unit.getProperties().getProperty("hibernate.cfg_xml_file"));
            assertEquals("local-filesystem",
                    unit.getProperties().getProperty("hibernate.search.backend.directory.type"));
            assertEquals("/var/lib/lucene_index",
                    unit.getProperties().getProperty("hibernate.search.backend.directory.root"));
            for (String className : REPORT_PERSISTENCE_CLASSES) {
                assertEquals("Production persistence metadata must explicitly declare " + className, 1L,
                        unit.getManagedClassNames().stream().filter(className::equals).count());
            }
            assertEquals("The non-META-INF descriptor must use its compiled main-resource root", productionRuntimeRoot,
                    unit.getPersistenceUnitRootUrl());

            independentFactory = factory.getObject();
            assertNotNull("The independent production EntityManagerFactory must start", independentFactory);
            Set<String> runtimeEntities = independentFactory.getMetamodel().getEntities().stream()
                    .map(type -> type.getJavaType().getName()).collect(java.util.stream.Collectors.toSet());
            assertTrue("The production metamodel must contain the complete report and delivery chain",
                    runtimeEntities.containsAll(REPORT_PERSISTENCE_CLASSES));

            entityManager = independentFactory.createEntityManager();
            assertNotNull("ReportDocument LEFT JOIN members must execute on PostgreSQL",
                    entityManager
                            .createQuery("SELECT DISTINCT document FROM ReportDocument document "
                                    + "LEFT JOIN FETCH document.members WHERE document.sampleId = :sampleId")
                            .setParameter("sampleId", SAMPLE_ID).getResultList());
            assertNotNull("PatientReportRelease must execute on PostgreSQL",
                    entityManager
                            .createQuery("SELECT patientRelease FROM PatientReportRelease patientRelease "
                                    + "WHERE patientRelease.patientId = :patientId")
                            .setParameter("patientId", PATIENT_ID).getResultList());
        } finally {
            try {
                if (entityManager != null && entityManager.isOpen())
                    entityManager.close();
            } finally {
                factory.destroy();
            }
        }
    }

    @After
    public void restoreHarnessState() {
        try {
            if (properties != null) {
                restoreProperty("permissions.agent", permissionModeBefore);
                restoreProperty(ConfigurationProperties.Property.ELECTRONIC_SIGNATURE_ENABLED.name(), esigBefore);
            }
            if (displayListMockConfigured)
                org.mockito.Mockito.reset(displayLists);
            if (displayListInstanceBefore != null)
                ReflectionTestUtils.setField(DisplayListService.class, "instance", displayListInstanceBefore);
            for (int i = auditBindings.size() - 1; i >= 0; i--) {
                AuditBinding binding = auditBindings.get(i);
                ReflectionTestUtils.setField(binding.target(), binding.field(), binding.previous());
            }
            try {
                signatures.clearSigningSession(REPORTS.login());
                signatures.revokeCertification(REPORTS.login());
            } catch (RuntimeException ignored) {
                // A setup failure may precede the reporter seed.
            }
        } finally {
            RequestContextHolder.resetRequestAttributes();
            SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void realPostgresChainKeepsFreshCrossRoleScopeAndIssuesFrozenReport() throws Exception {
        assertProductionReportPersistenceRegistration();
        assertTrue("Diagnosis must cross the real Spring transaction proxy",
                org.springframework.aop.support.AopUtils.isAopProxy(restrictions));
        assertConfiguredPhaseAccess(RECEPTION, Phase.RECEPTION);
        assertConfiguredPhaseAccess(RESULTS, Phase.RESULTS);
        assertConfiguredPhaseAccess(VALIDATION, Phase.VALIDATION);
        assertConfiguredPhaseAccess(REPORTS, Phase.REPORTS);

        MockHttpServletRequest receptionRequest = authenticate(RECEPTION);
        Map<String, String> collection = collectionService.persistCollection(SAMPLE_ID, LAB_NO,
                "<samples><sample sampleID='9701' sampleTypeRequestId='9701' quantity='1' "
                        + "date='2026/10/06' time='07:00'/></samples>",
                receptionRequest);
        assertEquals(SAMPLE_ID, collection.get("sampleId"));
        assertEquals(LAB_NO, collection.get("labNo"));

        SampleItem item = only(sampleItems.getSampleItemsBySampleId(SAMPLE_ID), "one physical specimen");
        Analysis analysis = only(analyses.getAnalysesBySampleItem(item), "one requested analysis");
        assertEquals(TEST_ID, analysis.getTest().getId());
        assertEquals(SECTION_ID, analysis.getTestSection().getId());
        assertEquals(REQUEST_ID,
                jdbc.queryForObject(
                        "SELECT id::text FROM clinlims.sample_type_request WHERE sample_item_id = ?::numeric",
                        String.class, item.getId()));

        ObjectNode receipt = json.createObjectNode().put("sampleId", SAMPLE_ID).put("labNo", LAB_NO).put("patientId",
                PATIENT_ID);
        receipt.putArray("tubes").addObject().put("requestId", REQUEST_ID).put("sampleItemId", item.getId())
                .put("collectionDate",
                        org.openelisglobal.sample.form.SpecimenIntakeEvidence.instantTime(item.getCollectionDate()))
                .put("receivedDate", "2026-10-06T08:00:00Z");
        Runnable receive = () -> receiptService.receive(receipt, receptionRequest);
        assertUserSelectOnlyCannotWrite(RECEPTION, "Reception receipt", analysis.getId(), item.getId(), receive);
        assertRoleDefinitionInactiveDenied("Reception", analysis.getId(), item.getId(), receive);
        SpecimenReceiptService.Result receiptResult = receiptService.receive(receipt, receptionRequest);
        assertTrue(receiptResult.success());
        assertEquals(item.getId(), only(receiptResult.tubes(), "one received tube").sampleItemId());

        analysis = analyses.get(analysis.getId());
        ResultRestrictionRequest query = restrictionQuery(analysis, item.getId());
        MockHttpServletRequest initialDualRequest = authenticate(RESULTS_RECEPTION);
        assertReceptionSelectRevocationHidesLookup(query, initialDualRequest, analysis.getId(), item.getId());
        Map<String, Object> beforeDiagnosis = clinicalSnapshot(analysis.getId(), item.getId());
        ResultRestrictionResponse diagnosis = restrictions.inspect(query, initialDualRequest);
        assertEquals(beforeDiagnosis, clinicalSnapshot(analysis.getId(), item.getId()));
        assertEquals(RESULTS_RECEPTION.id(), diagnosis.currentUserId());
        assertTrue(diagnosis.readOnly());
        assertEquals(FactState.RECORDED, diagnosis.facts().collection().state());
        assertEquals(FactState.RECORDED, diagnosis.facts().receipt().state());
        assertEquals(FactState.RECORDED, diagnosis.facts().request().state());
        assertEquals(REQUEST_ID, diagnosis.facts().request().id());
        assertEquals("COLLECTED", diagnosis.facts().request().statusCode());
        assertEquals(FactState.MISSING, diagnosis.facts().acceptance().state());
        assertTrue("Results+Reception must receive a verified production lookup handoff", diagnosis.canOpenIntake());
        assertNull(diagnosis.actionUnavailableReason());
        assertTrue(diagnosis.canEditIntake());
        assertNull(diagnosis.intakeEditUnavailableReason());
        assertTrue(diagnosis.specimenStatus().known());
        assertEquals("Entered", diagnosis.specimenStatus().statusCode());
        assertTrue(diagnosis.analysisStatus().known());
        assertEquals("NotStarted", diagnosis.analysisStatus().statusCode());
        assertEquals(item.getId(), diagnosis.target().sampleItemId());
        assertEquals(REQUEST_ID, diagnosis.target().requestId());
        assertEquals(LAB_NO + ".1", diagnosis.target().lookupCode());
        assertEquals("specimen", diagnosis.intakeLookup().matchedKind());
        assertEquals(item.getId(), diagnosis.intakeLookup().selection().sampleItemId());
        var physical = diagnosis.intakeLookup().current().physicalSpecimens().stream()
                .filter(row -> item.getId().equals(row.id())).findFirst().orElseThrow();
        assertNotNull("The handoff must carry the production intake evidence digest",
                physical.expectedEvidenceDigest());

        assertSelectOnlyReceptionKeepsReadTarget(query, initialDualRequest, analysis.getId(), item.getId());
        assertCurrentStatusMetadataIsFresh(query, initialDualRequest, analysis.getId(), item.getId());

        ResultRestrictionResponse resultsOnly = restrictions.inspect(query, authenticate(RESULTS));
        assertEquals(FactState.RECORDED, resultsOnly.facts().receipt().state());
        assertFalse(resultsOnly.canOpenIntake());
        assertEquals("RECEPTION_PERMISSION_REQUIRED", resultsOnly.actionUnavailableReason());
        assertFalse(resultsOnly.canEditIntake());
        assertEquals("RECEPTION_PERMISSION_REQUIRED", resultsOnly.intakeEditUnavailableReason());
        assertNull(resultsOnly.target());
        assertNull(resultsOnly.intakeLookup());

        final MockHttpServletRequest diagnosticRequest = authenticate(RESULTS_RECEPTION);
        ResultRestrictionException wrongObject = assertThrows(ResultRestrictionException.class,
                () -> restrictions.inspect(new ResultRestrictionRequest(query.analysisId(), "999999", query.testId(),
                        query.labNumber(), query.analysisLastupdated()), diagnosticRequest));
        assertEquals(409, wrongObject.status());
        assertEquals("RESULT_RESTRICTION_IDENTITY_CHANGED", wrongObject.code());
        ResultRestrictionException stale = assertThrows(ResultRestrictionException.class,
                () -> restrictions.inspect(
                        new ResultRestrictionRequest(query.analysisId(), query.sampleItemId(), query.testId(),
                                query.labNumber(), Long.toString(Long.parseLong(query.analysisLastupdated()) - 1)),
                        diagnosticRequest));
        assertEquals(409, stale.status());
        assertEquals("RESULT_RESTRICTION_VERSION_CHANGED", stale.code());

        assertFreshAuthorization(query, diagnosticRequest);

        ObjectNode intake = json.createObjectNode().put("version", 1).put("operationId", UUID.randomUUID().toString())
                .put("sampleId", SAMPLE_ID).put("labNo", LAB_NO)
                .put("patientId", diagnosis.intakeLookup().current().patient().id()).put("requestId", REQUEST_ID)
                .put("sampleItemId", item.getId()).put("decision", "ACCEPTED")
                .put("expectedEvidenceDigest", physical.expectedEvidenceDigest());
        intake.putNull("reason");
        MockHttpServletRequest intakeRequest = authenticate(RESULTS_RECEPTION);
        assertUserSelectOnlyCannotWrite(RESULTS_RECEPTION, "Reception intake", analysis.getId(), item.getId(),
                () -> intakeService.decide(intake, intakeRequest));
        SpecimenIntakeDecisionService.Result accepted = intakeService.decide(intake, authenticate(RESULTS_RECEPTION));
        assertTrue(accepted.success());
        assertEquals("ACCEPTED", accepted.recordedDecision());
        assertEquals(1L, count("specimen_intake_decision", "sample_item_id", item.getId()));
        ResultRestrictionResponse acceptedDiagnosis = restrictions.inspect(query, authenticate(RESULTS_RECEPTION));
        assertEquals(FactState.RECORDED, acceptedDiagnosis.facts().acceptance().state());
        assertEquals("ACCEPTED", acceptedDiagnosis.facts().acceptance().decision());

        assertResultWriteAuthorizationIsFresh(analysis.getId(), item.getId());
        var firstSave = resultEntry.saveSingleResult(resultItem(analysis.getId(), item.getId(), null, "5.6"),
                authenticate(RESULTS));
        assertEquals(200, firstSave.status());
        analysis = analyses.get(analysis.getId());
        assertEquals(statuses.getStatusID(AnalysisStatus.TechnicalAcceptance), analysis.getStatusId());
        Result result = only(results.getResultsByAnalysis(analysis), "one stored result");
        assertEquals("5.6", result.getValue());

        assertValidationWriteAuthorizationIsFresh(analysis.getId(), item.getId());
        analysis = analyses.get(analysis.getId());
        result = only(results.getResultsByAnalysis(analysis), "one stored result after denied reviews");
        reviews.save(authenticate(VALIDATION), VALIDATION.id(), List.of(reviewRow(analysis, result, false)), null);
        analysis = analyses.get(analysis.getId());
        assertEquals(statuses.getStatusID(AnalysisStatus.BiologistRejected), analysis.getStatusId());
        assertNull(analysis.getReleasedDate());

        var secondSave = resultEntry.saveSingleResult(resultItem(analysis.getId(), item.getId(), result.getId(), "6.2"),
                authenticate(RESULTS));
        assertEquals(200, secondSave.status());
        analysis = analyses.get(analysis.getId());
        assertEquals(statuses.getStatusID(AnalysisStatus.TechnicalAcceptance), analysis.getStatusId());
        result = only(results.getResultsByAnalysis(analysis), "one re-entered result");
        assertEquals("6.2", result.getValue());

        reviews.save(authenticate(VALIDATION), VALIDATION.id(), List.of(reviewRow(analysis, result, true)), null);
        analysis = analyses.get(analysis.getId());
        assertEquals(statuses.getStatusID(AnalysisStatus.Finalized), analysis.getStatusId());
        assertNotNull(analysis.getReleasedDate());

        authenticateAdmin();
        ReportGroupingRules configured = grouping.configure(null,
                List.of(new ReportGroupingRules.Group(REPORT_GROUP, "Cross-role chemistry", List.of(TEST_ID))), "1");
        assertEquals(REPORT_GROUP, configured.groups().get(0).key());

        authenticate(REPORTS);
        ReportDocumentSummary document = documents.prepare(SAMPLE_ID, REPORT_GROUP, REPORTS.id());
        assertEquals(List.of(analysis.getId()), document.analysisIds());
        assertReportWriteAuthorizationIsFresh(document.id(), analysis.getId(), item.getId());
        authenticate(REPORTS);
        PatientReportReleaseSummary draft = releases.createDocumentDraft(document.id(), null, REPORTS.id());
        assertEquals(PatientReportReleaseStatus.DRAFT, draft.status());
        var frozen = releases.freeze(document.id(), draft.id(), REPORTS.id());
        assertNotNull(frozen.snapshotSha256());
        assertEquals(document.id(), frozen.documentId());

        properties.setPropertyValue(ConfigurationProperties.Property.ELECTRONIC_SIGNATURE_ENABLED, "true");
        signatures.clearSigningSession(REPORTS.login());
        signatures.revokeCertification(REPORTS.login());
        signatures.certifyUser(REPORTS.login(), PASSWORD, CERTIFICATION, "127.0.0.1", "cross-role-test");
        PatientReportReleaseSummary issued = releases.issueDocument(document.id(), draft.id(), frozen.snapshotSha256(),
                PASSWORD, REPORTS.id(), "127.0.0.1", "cross-role-test");
        assertEquals(PatientReportReleaseStatus.ISSUED, issued.status());
        var original = releases.getOriginalPdf(document.id(), issued.id(), REPORTS.id());
        assertTrue("The issued original must be real persisted PDF bytes", original.content().length > 0);
        assertEquals(issued.pdfSha256(), original.sha256());
        assertEquals(1L,
                jdbc.queryForObject(
                        "SELECT count(*) FROM clinlims.his_result_outbox WHERE business_id = ? "
                                + "AND event_type = 'REPORT' AND status = 'PENDING'",
                        Long.class, issued.id().toString()).longValue());

        assertHistoryAdvanced(RECEPTION);
        assertHistoryAdvanced(RESULTS_RECEPTION);
        assertHistoryAdvanced(RESULTS);
        assertHistoryAdvanced(VALIDATION);
        assertHistoryAdvanced(REPORTS);
    }

    private void assertFreshAuthorization(ResultRestrictionRequest query, MockHttpServletRequest unchangedRequest) {
        String resultRole = roleIds.get("Results");
        String receptionRole = roleIds.get("Reception");

        jdbc.update("DELETE FROM clinlims.system_user_role WHERE system_user_id = ? AND role_id = ?::numeric",
                RESULTS_RECEPTION.numericId(), resultRole);
        try {
            assertThrows(AccessDeniedException.class, () -> restrictions.inspect(query, unchangedRequest));
        } finally {
            jdbc.update("INSERT INTO clinlims.system_user_role (system_user_id, role_id) VALUES (?, ?::numeric)",
                    RESULTS_RECEPTION.numericId(), resultRole);
        }
        assertTrue(restrictions.inspect(query, unchangedRequest).canOpenIntake());

        jdbc.update("UPDATE clinlims.system_user SET is_active = 'N' WHERE id = ?", RESULTS_RECEPTION.numericId());
        try {
            assertThrows(AccessDeniedException.class, () -> restrictions.inspect(query, unchangedRequest));
        } finally {
            jdbc.update("UPDATE clinlims.system_user SET is_active = 'Y', lastupdated = NOW() WHERE id = ?",
                    RESULTS_RECEPTION.numericId());
        }
        assertTrue(restrictions.inspect(query, unchangedRequest).canOpenIntake());

        jdbc.update("DELETE FROM clinlims.lab_roles WHERE lab_unit_role_map_id = ? AND role = ?",
                RESULTS_RECEPTION.labMapId(), resultRole);
        try {
            assertThrows(AccessDeniedException.class, () -> restrictions.inspect(query, unchangedRequest));
        } finally {
            jdbc.update("INSERT INTO clinlims.lab_roles (lab_unit_role_map_id, role) VALUES (?, ?)",
                    RESULTS_RECEPTION.labMapId(), resultRole);
        }
        assertTrue(restrictions.inspect(query, unchangedRequest).canOpenIntake());

        jdbc.update("DELETE FROM clinlims.system_user_role WHERE system_user_id = ? AND role_id = ?::numeric",
                RESULTS_RECEPTION.numericId(), receptionRole);
        try {
            ResultRestrictionResponse resultFactsRemain = restrictions.inspect(query, unchangedRequest);
            assertEquals(FactState.RECORDED, resultFactsRemain.facts().receipt().state());
            assertFalse(resultFactsRemain.canOpenIntake());
            assertEquals("RECEPTION_PERMISSION_REQUIRED", resultFactsRemain.actionUnavailableReason());
            assertFalse(resultFactsRemain.canEditIntake());
            assertEquals("RECEPTION_PERMISSION_REQUIRED", resultFactsRemain.intakeEditUnavailableReason());
        } finally {
            jdbc.update("INSERT INTO clinlims.system_user_role (system_user_id, role_id) VALUES (?, ?::numeric)",
                    RESULTS_RECEPTION.numericId(), receptionRole);
        }
        assertTrue(restrictions.inspect(query, unchangedRequest).canOpenIntake());
    }

    private void assertResultWriteAuthorizationIsFresh(String analysisId, String itemId) {
        MockHttpServletRequest request = authenticate(RESULTS);
        Runnable write = () -> resultEntry.saveSingleResult(resultItem(analysisId, itemId, null, "5.6"), request);

        assertGlobalRoleBindingDenied(RESULTS, "Results", analysisId, itemId, write);
        assertModuleGrantDenied("Results", "LogbookResults", analysisId, itemId, write);
        assertRoleDefinitionInactiveDenied("Results", analysisId, itemId, write);
    }

    private void assertValidationWriteAuthorizationIsFresh(String analysisId, String itemId) {
        MockHttpServletRequest request = authenticate(VALIDATION);
        Runnable write = () -> {
            Analysis current = analyses.get(analysisId);
            Result stored = only(results.getResultsByAnalysis(current), "one result before denied review");
            reviews.save(request, VALIDATION.id(), List.of(reviewRow(current, stored, false)), null);
        };

        assertLabRoleBindingDenied(VALIDATION, "Validation", analysisId, itemId, write);
        assertModuleGrantDenied("Validation", "ResultsValidationGeneral", analysisId, itemId, write);
        assertRoleDefinitionInactiveDenied("Validation", analysisId, itemId, write);
    }

    private void assertReportWriteAuthorizationIsFresh(String documentId, String analysisId, String itemId) {
        authenticate(REPORTS);
        Runnable write = () -> releases.createDocumentDraft(documentId, null, REPORTS.id());

        assertWrongSectionScopeDenied(REPORTS, analysisId, itemId, write);
        assertModuleGrantDenied("Reports", "Report:patient", analysisId, itemId, write);
        assertRoleDefinitionInactiveDenied("Reports", analysisId, itemId, write);
    }

    private void assertUserSelectOnlyCannotWrite(Actor actor, String scenario, String analysisId, String itemId,
            Runnable write) {
        Map<String, Object> module = jdbc.queryForMap(
                "SELECT id, has_select_flag, has_update_flag FROM clinlims.system_module WHERE name = ?",
                "SamplePatientEntry");
        assertEquals("The real Reception module must configure SELECT", "Y", module.get("has_select_flag"));
        assertEquals("The real Reception module must configure UPDATE", "Y", module.get("has_update_flag"));
        int grantId = actor.labMapId() - 10000;
        jdbc.update(
                "DELETE FROM clinlims.system_user_module WHERE id = ? OR "
                        + "(system_user_id = ? AND system_module_id = ?)",
                grantId, actor.numericId(), module.get("id"));
        jdbc.update("INSERT INTO clinlims.system_user_module "
                + "(id, has_select, has_add, has_update, has_delete, system_user_id, system_module_id) "
                + "VALUES (?, 'Y', 'N', 'N', 'N', ?, ?)", grantId, actor.numericId(), module.get("id"));
        properties.setPropertyValue("permissions.agent", "USER");
        try {
            assertDeniedWithoutMutation(scenario + " with SELECT-only USER grant", analysisId, itemId, write);
        } finally {
            properties.setPropertyValue("permissions.agent", "ROLE");
            jdbc.update("DELETE FROM clinlims.system_user_module WHERE id = ?", grantId);
        }
    }

    private void assertReceptionSelectRevocationHidesLookup(ResultRestrictionRequest query,
            MockHttpServletRequest request, String analysisId, String itemId) {
        Map<String, Object> grant = roleModuleGrant("Reception", "SamplePatientEntry");
        assertEquals("Y", grant.get("has_select"));
        assertEquals(1,
                jdbc.update("UPDATE clinlims.system_role_module SET has_select = 'N' WHERE id = ?", grant.get("id")));
        try {
            Map<String, Object> before = clinicalSnapshot(analysisId, itemId);
            ResultRestrictionResponse unavailable = restrictions.inspect(query, request);
            assertEquals(FactState.RECORDED, unavailable.facts().receipt().state());
            assertFalse(unavailable.canOpenIntake());
            assertEquals("RECEPTION_PERMISSION_REQUIRED", unavailable.actionUnavailableReason());
            assertFalse(unavailable.canEditIntake());
            assertEquals("RECEPTION_PERMISSION_REQUIRED", unavailable.intakeEditUnavailableReason());
            assertNull(unavailable.target());
            assertNull(unavailable.intakeLookup());
            AccessDeniedException denied = assertThrows(AccessDeniedException.class,
                    () -> specimenLookup.lookup(LAB_NO + ".1", request));
            assertTrue(denied.getMessage() != null && denied.getMessage().contains("RESULT_RESTRICTION_DENIED"));
            assertEquals("Revoked Reception SELECT must not expose a lookup or mutate clinical evidence", before,
                    clinicalSnapshot(analysisId, itemId));
        } finally {
            jdbc.update("UPDATE clinlims.system_role_module SET has_select = ? WHERE id = ?", grant.get("has_select"),
                    grant.get("id"));
        }
    }

    private void assertSelectOnlyReceptionKeepsReadTarget(ResultRestrictionRequest query,
            MockHttpServletRequest request, String analysisId, String itemId) {
        Map<String, Object> grant = roleModuleGrant("Reception", "SamplePatientEntry");
        assertEquals("Y", grant.get("has_select"));
        assertEquals("Y", grant.get("has_update"));
        assertEquals(1,
                jdbc.update("UPDATE clinlims.system_role_module SET has_update = 'N' WHERE id = ?", grant.get("id")));
        try {
            Map<String, Object> before = clinicalSnapshot(analysisId, itemId);
            ResultRestrictionResponse selectOnly = restrictions.inspect(query, request);
            assertTrue(selectOnly.canOpenIntake());
            assertNull(selectOnly.actionUnavailableReason());
            assertFalse(selectOnly.canEditIntake());
            assertEquals("RECEPTION_UPDATE_PERMISSION_REQUIRED", selectOnly.intakeEditUnavailableReason());
            assertNotNull(selectOnly.target());
            assertNotNull(selectOnly.intakeLookup());
            assertEquals(itemId, selectOnly.target().sampleItemId());
            assertEquals(itemId, selectOnly.intakeLookup().selection().sampleItemId());
            assertEquals("SELECT-only diagnosis must remain read-only and write no clinical evidence", before,
                    clinicalSnapshot(analysisId, itemId));
        } finally {
            jdbc.update("UPDATE clinlims.system_role_module SET has_update = ? WHERE id = ?", grant.get("has_update"),
                    grant.get("id"));
        }
    }

    private void assertCurrentStatusMetadataIsFresh(ResultRestrictionRequest query, MockHttpServletRequest request,
            String analysisId, String itemId) {
        String specimenStatusId = jdbc.queryForObject(
                "SELECT status_id::text FROM clinlims.sample_item WHERE id = ?::numeric", String.class, itemId);
        String analysisStatusId = jdbc.queryForObject(
                "SELECT status_id::text FROM clinlims.analysis WHERE id = ?::numeric", String.class, analysisId);
        assertStatusMetadataIsFresh(query, request, analysisId, itemId, specimenStatusId, true,
                "SPECIMEN_STATUS_UNKNOWN");
        assertStatusMetadataIsFresh(query, request, analysisId, itemId, analysisStatusId, false,
                "ANALYSIS_STATUS_UNAVAILABLE");
    }

    private void assertStatusMetadataIsFresh(ResultRestrictionRequest query, MockHttpServletRequest request,
            String analysisId, String itemId, String statusId, boolean specimen, String diagnosticCode) {
        Map<String, Object> original = jdbc
                .queryForMap("SELECT name, is_active FROM clinlims.status_of_sample WHERE id = ?::numeric", statusId);
        assertEquals("Y", original.get("is_active"));
        String originalName = original.get("name").toString();
        Map<String, Object> before = clinicalSnapshot(analysisId, itemId);
        assertEquals(1,
                jdbc.update("UPDATE clinlims.status_of_sample SET is_active = 'N' WHERE id = ?::numeric", statusId));
        try {
            ResultRestrictionResponse inactive = restrictions.inspect(query, request);
            ResultRestrictionResponse.Status current = specimen ? inactive.specimenStatus() : inactive.analysisStatus();
            assertFalse(current.known());
            assertNull(current.statusCode());
            assertEquals(originalName, current.statusName());
            assertTrue(inactive.diagnosticCodes().contains(diagnosticCode));
            assertEquals("Inactive current status metadata must not cause a diagnosis write", before,
                    clinicalSnapshot(analysisId, itemId));
        } finally {
            jdbc.update("UPDATE clinlims.status_of_sample SET is_active = 'Y' WHERE id = ?::numeric", statusId);
        }

        String renamed = originalName + " [changed]";
        assertEquals(1,
                jdbc.update("UPDATE clinlims.status_of_sample SET name = ? WHERE id = ?::numeric", renamed, statusId));
        try {
            ResultRestrictionResponse changed = restrictions.inspect(query, request);
            ResultRestrictionResponse.Status current = specimen ? changed.specimenStatus() : changed.analysisStatus();
            assertFalse(current.known());
            assertNull(current.statusCode());
            assertEquals(renamed, current.statusName());
            assertTrue(changed.diagnosticCodes().contains(diagnosticCode));
            assertEquals("Renamed current status metadata must not cause a diagnosis write", before,
                    clinicalSnapshot(analysisId, itemId));
        } finally {
            jdbc.update("UPDATE clinlims.status_of_sample SET name = ? WHERE id = ?::numeric", originalName, statusId);
        }

        ResultRestrictionResponse restored = restrictions.inspect(query, request);
        ResultRestrictionResponse.Status current = specimen ? restored.specimenStatus() : restored.analysisStatus();
        assertTrue("Restored current status metadata must be recognized", current.known());
        assertEquals(originalName, current.statusName());
    }

    private void assertGlobalRoleBindingDenied(Actor actor, String role, String analysisId, String itemId,
            Runnable write) {
        String roleId = roleIds.get(role);
        assertEquals(1,
                jdbc.update("DELETE FROM clinlims.system_user_role WHERE system_user_id = ? AND role_id = ?::numeric",
                        actor.numericId(), roleId));
        try {
            assertDeniedWithoutMutation(role + " global binding removal", analysisId, itemId, write);
        } finally {
            jdbc.update("INSERT INTO clinlims.system_user_role (system_user_id, role_id) VALUES (?, ?::numeric)",
                    actor.numericId(), roleId);
        }
    }

    private void assertLabRoleBindingDenied(Actor actor, String role, String analysisId, String itemId,
            Runnable write) {
        String roleId = roleIds.get(role);
        assertEquals(1, jdbc.update("DELETE FROM clinlims.lab_roles WHERE lab_unit_role_map_id = ? AND role = ?",
                actor.labMapId(), roleId));
        try {
            assertDeniedWithoutMutation(role + " lab binding removal", analysisId, itemId, write);
        } finally {
            jdbc.update("INSERT INTO clinlims.lab_roles (lab_unit_role_map_id, role) VALUES (?, ?)", actor.labMapId(),
                    roleId);
        }
    }

    private void assertModuleGrantDenied(String role, String module, String analysisId, String itemId, Runnable write) {
        Map<String, Object> grant = roleModuleGrant(role, module);
        assertEquals(1, jdbc.update("DELETE FROM clinlims.system_role_module WHERE id = ?", grant.get("id")));
        try {
            assertDeniedWithoutMutation(role + " module grant removal", analysisId, itemId, write);
        } finally {
            jdbc.update(
                    "INSERT INTO clinlims.system_role_module "
                            + "(id, has_select, has_add, has_update, has_delete, system_role_id, system_module_id) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    grant.get("id"), grant.get("has_select"), grant.get("has_add"), grant.get("has_update"),
                    grant.get("has_delete"), grant.get("system_role_id"), grant.get("system_module_id"));
        }
    }

    private Map<String, Object> roleModuleGrant(String role, String module) {
        return only(jdbc.queryForList(
                "SELECT grant_row.id, grant_row.has_select, grant_row.has_add, grant_row.has_update, "
                        + "grant_row.has_delete, grant_row.system_role_id, grant_row.system_module_id "
                        + "FROM clinlims.system_role_module grant_row "
                        + "JOIN clinlims.system_module module_row ON module_row.id = grant_row.system_module_id "
                        + "WHERE grant_row.system_role_id = ?::numeric AND module_row.name = ?",
                roleIds.get(role), module), "one persisted " + role + " grant for " + module);
    }

    private void assertRoleDefinitionInactiveDenied(String role, String analysisId, String itemId, Runnable write) {
        String roleId = roleIds.get(role);
        assertEquals(1, jdbc.update("UPDATE clinlims.system_role SET active = false WHERE id = ?::numeric", roleId));
        try {
            assertDeniedWithoutMutation(role + " inactive role", analysisId, itemId, write);
        } finally {
            jdbc.update("UPDATE clinlims.system_role SET active = true WHERE id = ?::numeric", roleId);
        }
    }

    private void assertWrongSectionScopeDenied(Actor actor, String analysisId, String itemId, Runnable write) {
        String otherSection = jdbc
                .queryForObject("SELECT id::text FROM clinlims.test_section WHERE id <> ?::numeric AND is_active = 'Y' "
                        + "ORDER BY id LIMIT 1", String.class, SECTION_ID);
        assertNotNull("The production seed must contain a second active section for the wrong-scope proof",
                otherSection);
        assertEquals(1, jdbc.update("UPDATE clinlims.lab_unit_role_map SET lab_unit = ? WHERE lab_unit_role_map_id = ?",
                otherSection, actor.labMapId()));
        try {
            assertDeniedWithoutMutation("Reports wrong section scope", analysisId, itemId, write, false);
        } finally {
            jdbc.update("UPDATE clinlims.lab_unit_role_map SET lab_unit = ? WHERE lab_unit_role_map_id = ?", SECTION_ID,
                    actor.labMapId());
        }
    }

    private void assertDeniedWithoutMutation(String scenario, String analysisId, String itemId, Runnable write) {
        assertDeniedWithoutMutation(scenario, analysisId, itemId, write, true);
    }

    private void assertDeniedWithoutMutation(String scenario, String analysisId, String itemId, Runnable write,
            boolean restrictionBoundary) {
        Map<String, Object> before = clinicalSnapshot(analysisId, itemId);
        AccessDeniedException denied = assertThrows(scenario, AccessDeniedException.class, write::run);
        if (restrictionBoundary) {
            assertTrue(scenario + " must use the restriction boundary",
                    denied.getMessage() != null && denied.getMessage().contains("RESULT_RESTRICTION_DENIED"));
        }
        assertEquals(scenario + " must roll back every clinical/audit/report/signature/outbox write", before,
                clinicalSnapshot(analysisId, itemId));
    }

    private void assertConfiguredPhaseAccess(Actor actor, Phase phase) {
        MockHttpServletRequest request = authenticate(actor);
        new TransactionTemplate(transactionManager).execute(status -> {
            var scope = restrictionAccess.bindForActor(request, phase, Action.SELECT, actor.id());
            assertEquals(actor.id(), scope.actor().userId());
            assertEquals(Set.of(SECTION_ID), scope.sectionIds());
            return null;
        });
    }

    private ResultRestrictionRequest restrictionQuery(Analysis analysis, String itemId) {
        assertNotNull(analysis.getLastupdated());
        return new ResultRestrictionRequest(analysis.getId(), itemId, TEST_ID, LAB_NO,
                Long.toString(analysis.getLastupdated().getTime()));
    }

    private TestResultItem resultItem(String analysisId, String itemId, String resultId, String value) {
        Analysis current = analyses.get(analysisId);
        TestResultItem item = new TestResultItem();
        item.setAnalysisId(analysisId);
        item.setSampleItemId(itemId);
        item.setAccessionNumber(LAB_NO);
        item.setResultId(resultId);
        item.setTestId(TEST_ID);
        item.setResultType("N");
        item.setResultValue(value);
        item.setTestDate(org.openelisglobal.common.util.DateUtil.formatDateAsText(new java.util.Date()) + " 09:15");
        item.setModified(true);
        item.setValid(true);
        item.setReportable(true);
        item.setAnalysisLastupdated(Long.toString(current.getLastupdated().getTime()));
        item.setNote("");
        return item;
    }

    private AnalysisItem reviewRow(Analysis analysis, Result result, boolean accept) {
        Analysis current = analyses.get(analysis.getId());
        Result stored = results.get(result.getId());
        AnalysisItem row = new AnalysisItem();
        row.setAnalysisId(current.getId());
        row.setSampleId(SAMPLE_ID);
        row.setSampleItemId(current.getSampleItem().getId());
        row.setTestId(TEST_ID);
        row.setAccessionNumber(LAB_NO);
        row.setStatusId(current.getStatusId());
        row.setAnalysisLastupdated(Long.toString(current.getLastupdated().getTime()));
        row.setShowAcceptReject(true);
        row.setIsAccepted(accept);
        row.setIsRejected(!accept);
        row.setNote(accept ? "" : "结果需复核后重新录入");
        row.setResultId(stored.getId());
        row.setRawResultValue(stored.getValue());
        row.setResult(stored.getValue());
        row.setResultType(stored.getResultType());
        row.setResultMembers(List.of(new AnalysisItem.ResultMember(stored.getId(), stored.getValue(),
                stored.getResultType(), stored.getTestResult() == null ? null : stored.getTestResult().getComponentId(),
                stored.getParentResult() == null ? null : stored.getParentResult().getId(), stored.getGrouping(),
                stored.getLastupdated().toInstant().toString())));
        return row;
    }

    private Map<String, Object> clinicalSnapshot(String analysisId, String itemId) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("sample", jdbc.queryForMap(
                "SELECT status_id::text status, lastupdated FROM clinlims.sample WHERE id = ?::numeric", SAMPLE_ID));
        snapshot.put("item",
                jdbc.queryForMap(
                        "SELECT status_id::text status, collection_date, received_date, rejected, voided, lastupdated "
                                + "FROM clinlims.sample_item WHERE id = ?::numeric",
                        itemId));
        snapshot.put("analysis",
                jdbc.queryForMap("SELECT status_id::text status, released_date, printed_date, lastupdated "
                        + "FROM clinlims.analysis WHERE id = ?::numeric", analysisId));
        snapshot.put("request",
                jdbc.queryForMap(
                        "SELECT status, sample_item_id::text item, last_updated FROM clinlims.sample_type_request "
                                + "WHERE id = ?::numeric",
                        REQUEST_ID));
        for (String table : List.of("result", "specimen_intake_decision", "note", "report_document",
                "patient_report_release", "electronic_signature", "his_result_outbox", "history")) {
            snapshot.put(table, jdbc.queryForObject("SELECT count(*) FROM clinlims." + table, Long.class));
        }
        return snapshot;
    }

    private void seedActors() {
        String ids = ACTORS.stream().map(Actor::id).reduce((a, b) -> a + "," + b).orElseThrow();
        String mapIds = ACTORS.stream().map(actor -> Integer.toString(actor.labMapId())).reduce((a, b) -> a + "," + b)
                .orElseThrow();
        jdbc.update("DELETE FROM clinlims.lab_unit_roles WHERE system_user_id IN (" + ids + ") "
                + "OR lab_unit_role_map_id IN (" + mapIds + ")");
        jdbc.update("DELETE FROM clinlims.lab_roles WHERE lab_unit_role_map_id IN (" + mapIds + ")");
        jdbc.update("DELETE FROM clinlims.lab_unit_role_map WHERE lab_unit_role_map_id IN (" + mapIds + ")");
        jdbc.update("DELETE FROM clinlims.system_user_role WHERE system_user_id IN (" + ids + ")");

        for (Actor actor : ACTORS) {
            jdbc.update("INSERT INTO clinlims.system_user "
                    + "(id, external_id, login_name, last_name, first_name, initials, is_active, is_employee, lastupdated) "
                    + "VALUES (?, ?, ?, 'Chain', 'Clinical', 'CC', 'Y', 'Y', NOW()) "
                    + "ON CONFLICT (id) DO UPDATE SET login_name = EXCLUDED.login_name, is_active = 'Y', "
                    + "lastupdated = NOW()", actor.numericId(), "CHAIN-" + actor.id(), actor.login());
            jdbc.update("INSERT INTO clinlims.login_user "
                    + "(id, login_name, password, password_expired_dt, account_locked, account_disabled, is_admin, user_time_out) "
                    + "VALUES (?, ?, ?, DATE '2036-01-01', 'N', 'N', 'N', '220') "
                    + "ON CONFLICT (id) DO UPDATE SET login_name = EXCLUDED.login_name, password = EXCLUDED.password, "
                    + "password_expired_dt = EXCLUDED.password_expired_dt, account_locked = 'N', account_disabled = 'N'",
                    actor.numericId(), actor.login(), PASSWORD_HASH);
            jdbc.update("INSERT INTO clinlims.user_lab_unit_roles (system_user_id, last_updated) VALUES (?, NOW()) "
                    + "ON CONFLICT (system_user_id) DO UPDATE SET last_updated = NOW()", actor.numericId());
            jdbc.update("INSERT INTO clinlims.lab_unit_role_map (lab_unit_role_map_id, lab_unit) VALUES (?, ?)",
                    actor.labMapId(), SECTION_ID);
            jdbc.update("INSERT INTO clinlims.lab_unit_roles (system_user_id, lab_unit_role_map_id) VALUES (?, ?)",
                    actor.numericId(), actor.labMapId());
            for (String role : actor.roles()) {
                String roleId = roleIds.get(role);
                jdbc.update("INSERT INTO clinlims.system_user_role (system_user_id, role_id) VALUES (?, ?::numeric)",
                        actor.numericId(), roleId);
                jdbc.update("INSERT INTO clinlims.lab_roles (lab_unit_role_map_id, role) VALUES (?, ?)",
                        actor.labMapId(), roleId);
            }
        }
    }

    private void configureDisplayListHarness() {
        displayListInstanceBefore = DisplayListService.getInstance();
        if (org.mockito.Mockito.mockingDetails(displayLists).isMock()) {
            List<IdValuePair> sections = testSections.getAllActiveTestSections().stream()
                    .map(section -> new IdValuePair(section.getId(), section.getLocalizedName())).toList();
            var test = tests.getTestById(TEST_ID);
            assertNotNull(test);
            List<IdValuePair> allTests = List.of(new IdValuePair(TEST_ID, test.getLocalizedName()));
            List<IdValuePair> withBlank = new ArrayList<>();
            withBlank.add(new IdValuePair("", ""));
            withBlank.addAll(allTests);
            when(displayLists.getList(DisplayListService.ListType.TEST_SECTION_ACTIVE)).thenReturn(sections);
            when(displayLists.getList(DisplayListService.ListType.ALL_TESTS)).thenReturn(allTests);
            when(displayLists.getListWithLeadingBlank(DisplayListService.ListType.ALL_TESTS)).thenReturn(withBlank);
            ReflectionTestUtils.setField(DisplayListService.class, "instance", displayLists);
            displayListMockConfigured = true;
        } else {
            displayLists.refreshList(DisplayListService.ListType.TEST_SECTION_ACTIVE);
            displayLists.refreshList(DisplayListService.ListType.ALL_TESTS);
        }
    }

    private void assertAuditReferencesExist() {
        for (String table : List.of("SAMPLE_ITEM", "ANALYSIS", "RESULT", "NOTE", "SAMPLE", "specimen_intake_decision",
                "electronic_signature")) {
            var auditReference = referenceTables.getReferenceTableByName(table);
            assertNotNull("Missing production audit reference for " + table, auditReference);
            if (Set.of("SAMPLE_ITEM", "specimen_intake_decision").contains(table)) {
                assertEquals("Intake audit history must remain enabled for " + table, "Y",
                        auditReference.getKeepHistory());
                assertEquals("Intake audit identity must remain non-HL7 for " + table, "N",
                        auditReference.getIsHl7Encoded());
                assertNotNull("Intake audit configuration must carry a real optimistic-lock version for " + table,
                        auditReference.getLastupdated());
                String version = org.openelisglobal.sample.form.SpecimenIntakeEvidence
                        .wallClockTime(auditReference.getLastupdated());
                assertEquals(auditReference.getLastupdated().toInstant(),
                        org.openelisglobal.sample.form.SpecimenIntakeEvidence.time(version));
            }
        }
    }

    private void installRealAuditServices() throws Exception {
        AuditTrailServiceImpl realAudit = new AuditTrailServiceImpl();
        ReflectionTestUtils.setField(realAudit, "referenceTablesService", referenceTables);
        ReflectionTestUtils.setField(realAudit, "historyService", histories);
        installAudit(sampleItems, "auditTrailService", realAudit);
        installAudit(analyses, "auditTrailService", realAudit);
        installAudit(results, "auditTrailService", realAudit);
        installAudit(notes, "auditTrailService", realAudit);
        installAudit(samples, "auditTrailService", realAudit);
        installAudit(signatures, "auditTrailService", realAudit);
        installAudit(intakeService, "audit", realAudit);
    }

    private void installAudit(Object service, String field, AuditTrailServiceImpl realAudit) throws Exception {
        Object target = AopTestUtils.getUltimateTargetObject(service);
        assertNotNull(AopProxyUtils.ultimateTargetClass(service));
        auditBindings.add(new AuditBinding(target, field, ReflectionTestUtils.getField(target, field)));
        ReflectionTestUtils.setField(target, field, realAudit);
    }

    private MockHttpServletRequest authenticate(Actor actor) {
        return authenticate(actor.numericId(), actor.login(),
                actor.roles().stream().map(role -> "ROLE_" + role.toUpperCase(java.util.Locale.ROOT)).toList());
    }

    private MockHttpServletRequest authenticateAdmin() {
        return authenticate(1, "admin", List.of("ROLE_ADMIN", "ROLE_GLOBAL_ADMIN"));
    }

    private MockHttpServletRequest authenticate(int id, String login, List<String> authorities) {
        UserDetails principal = User.withUsername(login).password("N/A").authorities(authorities.toArray(String[]::new))
                .build();
        var authentication = new UsernamePasswordAuthenticationToken(principal, "N/A", principal.getAuthorities());
        SecurityContext context = new SecurityContextImpl(authentication);
        SecurityContextHolder.setContext(context);

        UserSessionData sessionUser = new UserSessionData();
        sessionUser.setSytemUserId(id);
        sessionUser.setLoginName(login);
        sessionUser.setLoginLabUnit(0);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("127.0.0.1");
        request.addHeader("User-Agent", "cross-role-clinical-chain");
        request.getSession().setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, sessionUser);
        request.setAttribute(IActionConstants.USER_SESSION_DATA, sessionUser);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        return request;
    }

    private String roleId(String name) {
        String id = jdbc.queryForObject("SELECT id::text FROM clinlims.system_role "
                + "WHERE btrim(name) = ? AND active = true ORDER BY id LIMIT 1", String.class, name);
        assertNotNull("Missing active production role " + name, id);
        return id;
    }

    private long historyCount(String actor) {
        return jdbc.queryForObject("SELECT count(*) FROM clinlims.history WHERE sys_user_id::text = ?", Long.class,
                actor);
    }

    private void assertHistoryAdvanced(Actor actor) {
        assertTrue("Expected durable audit history attributed to " + actor.login(),
                historyCount(actor.id()) > historyBefore.get(actor.id()));
    }

    private long count(String table, String column, String id) {
        return jdbc.queryForObject("SELECT count(*) FROM clinlims." + table + " WHERE " + column + " = ?::numeric",
                Long.class, id);
    }

    private void restoreProperty(String name, PropertyHolder previous) {
        if (previous == null)
            properties.stringPropertyNames().remove(name);
        else
            properties.setPropertyHolder(name, previous);
    }

    private static <T> T only(List<T> rows, String description) {
        assertNotNull(description, rows);
        assertEquals(description, 1, rows.size());
        return rows.get(0);
    }

    private record Actor(int numericId, String login, int labMapId, List<String> roles) {
        String id() {
            return Integer.toString(numericId);
        }
    }

    private record AuditBinding(Object target, String field, Object previous) {
    }
}

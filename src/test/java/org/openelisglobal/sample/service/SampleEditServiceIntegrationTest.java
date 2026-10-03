package org.openelisglobal.sample.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.AppTestConfig;
import org.openelisglobal.BaseTestConfig;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.DefaultConfigurationProperties.OEProperties;
import org.openelisglobal.common.util.DefaultConfigurationProperties.PropertyHolder;
import org.openelisglobal.integration.outbox.HisResultOutboxRepositoryImpl;
import org.openelisglobal.integration.outbox.HisResultOutboxServiceImpl;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.sample.bean.SampleEditItem;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.form.SampleEditForm;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemmodule.service.SystemModuleService;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.systemusermodule.valueholder.SystemUserModule;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@ContextConfiguration(classes = { BaseTestConfig.class, AppTestConfig.class,
        SampleEditServiceIntegrationTest.OutboxTestConfig.class })
public class SampleEditServiceIntegrationTest extends BaseWebContextSensitiveTest {

    @Configuration(proxyBeanMethods = false)
    @Import({ HisResultOutboxServiceImpl.class, HisResultOutboxRepositoryImpl.class })
    static class OutboxTestConfig {
    }

    private static final String DATASET_XML = "testdata/sample-edit-service.xml";
    private static final String SYS_USER_ID = "1";
    private static final String ACCESSION_NUMBER = "24-00001";
    private static final String EXISTING_ANALYSIS_ID = "1";
    private static final String EXISTING_SAMPLE_ITEM_ID = "1";
    private static final String TEST_ID = "1";

    @Autowired
    private SampleEditService sampleEditService;

    @Autowired
    private SampleService sampleService;

    @Autowired
    private AnalysisService analysisService;

    @Autowired
    private SampleItemService sampleItemService;

    @PersistenceContext
    private EntityManager entityManager;

    @Autowired
    private PlatformTransactionManager transactions;

    @Autowired
    private SampleEditAuthorizationService editAuthorization;

    @Autowired
    private SystemModuleService systemModules;

    @Autowired
    private PermissionModuleService<PermissionModule> permissions;

    @Autowired
    private RoleService roleService;

    @Before
    public void setUp() throws Exception {
        executeDataSetWithStateManagement(DATASET_XML);
    }

    private MockHttpServletRequest authenticatedRequest() {
        UserDetails principal = User.withUsername("admin").password("test-only").roles("ADMIN").build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
        MockHttpServletRequest request = new MockHttpServletRequest();
        UserSessionData sessionData = new UserSessionData();
        sessionData.setSytemUserId(Integer.parseInt(SYS_USER_ID));
        sessionData.setLoginName("admin");
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, sessionData);
        request.getSession().setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
                SecurityContextHolder.getContext());
        return request;
    }

    private SampleEditForm createBaseForm() {
        SampleEditForm form = new SampleEditForm();
        form.setAccessionNumber(ACCESSION_NUMBER);

        SampleOrderItem sampleOrderItem = new SampleOrderItem();
        sampleOrderItem.setPriority(OrderPriority.ROUTINE);
        form.setSampleOrderItems(sampleOrderItem);

        form.setExistingTests(new ArrayList<>());
        form.setPossibleTests(new ArrayList<>());

        return form;
    }

    @Test
    public void editSample_withValidUpdates_shouldModifySampleProperties() {
        SampleEditForm form = createBaseForm();
        form.getSampleOrderItems().setPriority(OrderPriority.STAT);
        form.getSampleOrderItems().setConsentGiven(true);
        form.getSampleOrderItems().setConsentRecordedBy("TestRecorder");
        form.getSampleOrderItems().setConsentRecordedAt("2024/02/15");
        form.getSampleOrderItems().setConsentFormReference("REF-123");

        MockHttpServletRequest request = authenticatedRequest();
        Sample sample = sampleService.getSampleByAccessionNumber(ACCESSION_NUMBER);

        sampleEditService.editSample(form, request, sample, true, SYS_USER_ID);

        Sample updatedSample = sampleService.getSampleByAccessionNumber(ACCESSION_NUMBER);

        assertEquals("Priority should be STAT", OrderPriority.STAT, updatedSample.getPriority());
        assertEquals("Consent should be true", true, updatedSample.getConsentGiven());
        assertEquals("Recorder should match", "TestRecorder", updatedSample.getConsentRecordedBy());
        assertEquals("Reference should match", "REF-123", updatedSample.getConsentFormReference());
        assertEquals("Recorded At should match exactly", "2024-02-15 00:00:00.0",
                updatedSample.getConsentRecordedAt().toString());
    }

    @Test
    public void editSample_withAddedTests_shouldCreateNewAnalyses() {
        SampleEditForm form = createBaseForm();

        SampleEditItem addItem = new SampleEditItem();
        addItem.setAdd(true);
        addItem.setTestId(TEST_ID);
        addItem.setSampleItemId(EXISTING_SAMPLE_ITEM_ID);
        form.getPossibleTests().add(addItem);

        MockHttpServletRequest request = authenticatedRequest();
        Sample sample = sampleService.getSampleByAccessionNumber(ACCESSION_NUMBER);

        sampleEditService.editSample(form, request, sample, true, SYS_USER_ID);

        SampleItem sampleItem = sampleItemService.get(EXISTING_SAMPLE_ITEM_ID);
        List<Analysis> analyses = analysisService.getAnalysesBySampleItem(sampleItem);

        assertEquals("Should have exactly 2 analyses after adding one", 2, analyses.size());

        String notStartedStatus = SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.NotStarted);

        boolean foundNewAnalysis = false;
        for (Analysis analysis : analyses) {
            if (!analysis.getId().equals(EXISTING_ANALYSIS_ID)) {
                foundNewAnalysis = true;
                Analysis freshAnalysis = analysisService.get(analysis.getId());

                assertEquals("Status should be NotStarted", notStartedStatus, freshAnalysis.getStatusId());
                assertEquals("Test ID should match", TEST_ID, freshAnalysis.getTest().getId());
                assertEquals("AnalysisType should be MANUAL", "MANUAL", freshAnalysis.getAnalysisType());
                assertEquals("Revision should be 0", "0", freshAnalysis.getRevision());
                assertEquals("Sample item ID should match", EXISTING_SAMPLE_ITEM_ID,
                        freshAnalysis.getSampleItem().getId());
                assertEquals("IsReportable should match the test definition", "Y", freshAnalysis.getIsReportable());
            }
        }

        assertTrue("Newly added analysis should be found in DB", foundNewAnalysis);
    }

    @Test
    public void editSample_withCanceledTests_shouldUpdateAnalysisStatus() {
        SampleEditForm form = createBaseForm();

        SampleEditItem cancelItem = new SampleEditItem();
        cancelItem.setCanceled(true);
        cancelItem.setAnalysisId(EXISTING_ANALYSIS_ID);
        cancelItem.setSampleItemId(EXISTING_SAMPLE_ITEM_ID);
        form.getExistingTests().add(cancelItem);

        MockHttpServletRequest request = authenticatedRequest();
        Sample sample = sampleService.getSampleByAccessionNumber(ACCESSION_NUMBER);

        sampleEditService.editSample(form, request, sample, true, SYS_USER_ID);

        Analysis freshCanceled = analysisService.get(EXISTING_ANALYSIS_ID);

        String canceledStatus = SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.Canceled);
        assertEquals("Analysis status should be exactly Canceled", canceledStatus, freshCanceled.getStatusId());
        assertEquals("Analysis should remain linked to sample item", EXISTING_SAMPLE_ITEM_ID,
                freshCanceled.getSampleItem().getId());
        assertEquals("Test ID should remain the same", TEST_ID, freshCanceled.getTest().getId());
    }

    @Test
    public void editSample_withModifiedSampleItem_shouldUpdateCollectionDate() {
        SampleEditForm form = createBaseForm();

        SampleEditItem editItem = new SampleEditItem();
        editItem.setSampleItemChanged(true);
        editItem.setSampleItemId(EXISTING_SAMPLE_ITEM_ID);
        editItem.setCollectionDate("2024/02/15");
        editItem.setCollectionTime("10:30");
        form.getExistingTests().add(editItem);

        MockHttpServletRequest request = authenticatedRequest();
        Sample sample = sampleService.getSampleByAccessionNumber(ACCESSION_NUMBER);

        sampleEditService.editSample(form, request, sample, true, SYS_USER_ID);

        SampleItem freshItem = sampleItemService.get(EXISTING_SAMPLE_ITEM_ID);
        assertEquals("Collection date should exactly match 2024-02-15 10:30", "2024-02-15 10:30:00.0",
                freshItem.getCollectionDate().toString());
    }

    @Test
    public void editSample_withRemovedSampleItem_shouldCancelSampleItemAndAnalysis() {
        SampleEditForm form = createBaseForm();

        SampleEditItem removeItem = new SampleEditItem();
        removeItem.setRemoveSample(true);
        removeItem.setSampleItemId(EXISTING_SAMPLE_ITEM_ID);
        removeItem.setAnalysisId(EXISTING_ANALYSIS_ID);
        form.getExistingTests().add(removeItem);

        MockHttpServletRequest request = authenticatedRequest();
        Sample sample = sampleService.getSampleByAccessionNumber(ACCESSION_NUMBER);

        sampleEditService.editSample(form, request, sample, true, SYS_USER_ID);

        SampleItem freshItem = sampleItemService.get(EXISTING_SAMPLE_ITEM_ID);
        Analysis freshAnalysis = analysisService.get(EXISTING_ANALYSIS_ID);

        String canceledSampleStatus = SpringContext.getBean(IStatusService.class)
                .getStatusID(org.openelisglobal.common.services.StatusService.SampleStatus.Canceled);
        String canceledAnalysisStatus = SpringContext.getBean(IStatusService.class)
                .getStatusID(AnalysisStatus.Canceled);

        assertEquals("Sample item status should be Canceled", canceledSampleStatus, freshItem.getStatusId());
        assertEquals("Associated analysis status should be Canceled", canceledAnalysisStatus,
                freshAnalysis.getStatusId());
    }

    @Test
    public void failedActionGuardWithAccessionChangeLeavesPersistedOrderTubeAndAnalysisUnchanged() {
        SampleEditForm form = createBaseForm();
        form.setNewAccessionNumber("24-00002");
        form.getSampleOrderItems().setPriority(OrderPriority.STAT);
        SampleEditItem invalid = new SampleEditItem();
        invalid.setCanceled(true);
        invalid.setSampleItemId("999999");
        invalid.setAnalysisId(EXISTING_ANALYSIS_ID);
        form.getExistingTests().add(invalid);
        MockHttpServletRequest request = authenticatedRequest();

        assertThrows(LIMSRuntimeException.class,
                () -> sampleEditService.editSample(form, request, null, true, SYS_USER_ID));

        TransactionTemplate freshRead = new TransactionTemplate(transactions);
        freshRead.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        freshRead.setReadOnly(true);
        freshRead.execute(status -> {
            entityManager.clear();
            Sample persisted = sampleService.getSampleByAccessionNumber(ACCESSION_NUMBER);
            assertNotNull("The original accession must remain persisted", persisted);
            assertEquals("A rejected save must preserve the persisted priority", OrderPriority.ROUTINE,
                    persisted.getPriority());
            assertNull("The rejected new accession must not exist",
                    sampleService.getSampleByAccessionNumber("24-00002"));
            SampleItem persistedTube = sampleItemService.get(EXISTING_SAMPLE_ITEM_ID);
            Analysis persistedAnalysis = analysisService.get(EXISTING_ANALYSIS_ID);
            IStatusService statuses = SpringContext.getBean(IStatusService.class);
            assertEquals("The tube must remain Entered", statuses.getStatusID(SampleStatus.Entered),
                    persistedTube.getStatusId());
            assertEquals("The analysis must remain NotStarted", statuses.getStatusID(AnalysisStatus.NotStarted),
                    persistedAnalysis.getStatusId());
            return null;
        });
    }

    @Test
    public void userPermissionModeReadsActualMappedGrantsAndRevocationImmediately() {
        OEProperties properties = (OEProperties) ReflectionTestUtils.getField(ConfigurationProperties.getInstance(),
                "finalProperties");
        assertNotNull(properties);
        PropertyHolder previousMode = properties.getPropertyHolder("permissions.agent");
        TransactionTemplate write = new TransactionTemplate(transactions);
        String[] previousAdmin = new String[1];
        String[] grantId = new String[1];
        try {
            properties.setPropertyValue("permissions.agent", "USER");
            write.execute(status -> {
                LoginUser login = entityManager.find(LoginUser.class, Integer.valueOf(SYS_USER_ID));
                assertNotNull(login);
                previousAdmin[0] = login.getIsAdmin();
                login.setIsAdmin("N");
                entityManager.flush();
                entityManager.clear();
                return null;
            });
            MockHttpServletRequest request = authenticatedRequest();
            assertFalse("No user module must deny writes without an ORM property error",
                    editAuthorization.canWrite(request, SYS_USER_ID));
            assertThrows(AccessDeniedException.class, () -> editAuthorization.requireWrite(request, SYS_USER_ID));

            grantId[0] = write.execute(status -> {
                SystemModule module = systemModules.getSystemModuleByName("SampleEdit:readwrite");
                assertNotNull("The existing SampleEdit readwrite module must be seeded", module);
                SystemUser actor = entityManager.find(SystemUser.class, SYS_USER_ID);
                assertNotNull(actor);
                SystemUserModule grant = new SystemUserModule();
                grant.setSystemUser(actor);
                grant.setSystemModule(module);
                grant.setHasSelect("Y");
                grant.setHasUpdate("Y");
                grant.setHasAdd("N");
                grant.setHasDelete("N");
                entityManager.persist(grant);
                entityManager.flush();
                String id = grant.getId();
                entityManager.clear();
                return id;
            });
            assertNotNull(grantId[0]);
            assertTrue("The persisted user grant must authorize writes",
                    editAuthorization.canWrite(request, SYS_USER_ID));
            editAuthorization.requireWrite(request, SYS_USER_ID);

            write.execute(status -> {
                SystemUserModule grant = entityManager.find(SystemUserModule.class, grantId[0]);
                assertNotNull(grant);
                entityManager.remove(grant);
                entityManager.flush();
                entityManager.clear();
                return null;
            });
            assertFalse("The removed user grant must no longer authorize writes",
                    editAuthorization.canWrite(request, SYS_USER_ID));
            assertThrows(AccessDeniedException.class, () -> editAuthorization.requireWrite(request, SYS_USER_ID));
        } finally {
            try {
                write.execute(status -> {
                    if (grantId[0] != null) {
                        SystemUserModule grant = entityManager.find(SystemUserModule.class, grantId[0]);
                        if (grant != null) {
                            entityManager.remove(grant);
                        }
                    }
                    if (previousAdmin[0] != null) {
                        LoginUser login = entityManager.find(LoginUser.class, Integer.valueOf(SYS_USER_ID));
                        login.setIsAdmin(previousAdmin[0]);
                    }
                    entityManager.flush();
                    entityManager.clear();
                    return null;
                });
            } finally {
                restorePermissionMode(properties, previousMode);
            }
        }
    }

    @Test
    public void rolePermissionModeUsesTheExistingIntegerAgentQueryContract() {
        OEProperties properties = (OEProperties) ReflectionTestUtils.getField(ConfigurationProperties.getInstance(),
                "finalProperties");
        assertNotNull(properties);
        PropertyHolder previousMode = properties.getPropertyHolder("permissions.agent");
        try {
            properties.setPropertyValue("permissions.agent", "ROLE");
            List<Role> seededRoles = roleService.getAllRoles();
            assertFalse("Existing role seeds must be available", seededRoles.isEmpty());
            assertNotNull(permissions.getAllPermissionModulesByAgentId(Integer.parseInt(seededRoles.get(0).getId())));
        } finally {
            restorePermissionMode(properties, previousMode);
        }
    }

    private void restorePermissionMode(OEProperties properties, PropertyHolder previousMode) {
        if (previousMode != null) {
            properties.setPropertyHolder("permissions.agent", previousMode);
        } else {
            properties.stringPropertyNames().remove("permissions.agent");
        }
    }

    @Test
    public void getUpdatedAnalysisList_shouldReturnModifiedAnalyses() {
        SampleEditForm form = createBaseForm();

        SampleEditItem addItem = new SampleEditItem();
        addItem.setAdd(true);
        addItem.setTestId(TEST_ID);
        addItem.setSampleItemId(EXISTING_SAMPLE_ITEM_ID);
        form.getPossibleTests().add(addItem);

        SampleEditItem cancelItem = new SampleEditItem();
        cancelItem.setCanceled(true);
        cancelItem.setAnalysisId(EXISTING_ANALYSIS_ID);
        cancelItem.setSampleItemId(EXISTING_SAMPLE_ITEM_ID);
        form.getExistingTests().add(cancelItem);

        MockHttpServletRequest request = authenticatedRequest();
        Sample sample = sampleService.getSampleByAccessionNumber(ACCESSION_NUMBER);

        sampleEditService.editSample(form, request, sample, true, SYS_USER_ID);

        List<String> updatedAnalyses = sampleEditService.getUpdatedAnalysisList();

        assertEquals("List should contain exactly the 2 modified analysis IDs", 2, updatedAnalyses.size());
        assertTrue("List should contain the explicitly canceled analysis ID",
                updatedAnalyses.contains(EXISTING_ANALYSIS_ID));
    }
}

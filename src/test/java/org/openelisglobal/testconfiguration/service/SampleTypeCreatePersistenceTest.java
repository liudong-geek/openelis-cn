package org.openelisglobal.testconfiguration.service;

import static org.junit.Assert.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.AppTestConfig;
import org.openelisglobal.BaseTestConfig;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.audittrail.daoimpl.AuditTrailServiceImpl;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.history.service.HistoryService;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemusermodule.valueholder.RoleModule;
import org.openelisglobal.testconfiguration.controller.rest.SampleTypeCreateRestController;
import org.openelisglobal.testconfiguration.form.SampleTypeCreateForm;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.validation.BeanPropertyBindingResult;

/** Tests only BaseTestConfig's isolated PostgreSQL database. */
@ContextConfiguration(classes = { BaseTestConfig.class, AppTestConfig.class,
        org.openelisglobal.common.management.service.AdminBasicEditPersistenceTest.TestConfig.class })
public class SampleTypeCreatePersistenceTest extends BaseWebContextSensitiveTest {
    @Autowired
    private SampleTypeCreateService creates;
    @Autowired
    private TypeOfSampleService types;
    @Autowired
    private RoleService roles;
    @Autowired
    private PlatformTransactionManager transactions;
    @Autowired
    private DisplayListService lists;
    @Autowired
    private HistoryService histories;
    @Autowired
    private ReferenceTablesService references;
    @PersistenceContext
    private EntityManager entityManager;
    private SampleTypeCreateRestController controller;
    private DisplayListService previousLists;
    private Object typeServiceTarget;
    private AuditTrailService previousAudit;
    private final List<String> ownedNames = new ArrayList<>();
    private final List<String> ownedTypeIds = new ArrayList<>();
    private String typeReferenceId;

    @Before
    public void prepareCreate() throws Exception {
        executeDataSetWithStateManagement("testdata/role.xml");
        ownedNames.clear();
        ownedTypeIds.clear();
        controller = new SampleTypeCreateRestController();
        ReflectionTestUtils.setField(controller, "typeOfSampleService", types);
        ReflectionTestUtils.setField(controller, "roleService", roles);
        ReflectionTestUtils.setField(controller, "sampleTypeCreateService", creates);
        previousLists = DisplayListService.getInstance();
        ReflectionTestUtils.setField(DisplayListService.class, "instance", lists);
        typeReferenceId = references.getReferenceTableByName("TYPE_OF_SAMPLE").getId();
        typeServiceTarget = AopTestUtils.getUltimateTargetObject(types);
        previousAudit = (AuditTrailService) ReflectionTestUtils.getField(typeServiceTarget, "auditTrailService");
        AuditTrailServiceImpl realAudit = new AuditTrailServiceImpl();
        ReflectionTestUtils.setField(realAudit, "historyService", histories);
        ReflectionTestUtils.setField(realAudit, "referenceTablesService", references);
        ReflectionTestUtils.setField(typeServiceTarget, "auditTrailService", realAudit);
    }

    @After
    public void restoreCreate() {
        try {
            if (!ownedNames.isEmpty()) {
                fresh(false).execute(status -> {
                    for (String name : ownedNames) {
                        List<SystemModule> modules = entityManager
                                .createQuery("from SystemModule m where m.systemModuleName in :names",
                                        SystemModule.class)
                                .setParameter("names", List.of("Workplan:" + name, "LogbookResults:" + name,
                                        "ResultValidation:" + name))
                                .getResultList();
                        for (SystemModule module : modules) {
                            entityManager
                                    .createQuery("from RoleModule r where r.systemModule.id = :id", RoleModule.class)
                                    .setParameter("id", module.getId()).getResultList().forEach(entityManager::remove);
                        }
                        entityManager.flush();
                        modules.forEach(entityManager::remove);
                        entityManager.createQuery("from TypeOfSample t where t.description = :name", TypeOfSample.class)
                                .setParameter("name", name).getResultList().forEach(entityManager::remove);
                    }
                    for (String id : ownedTypeIds) {
                        histories.getHistoryByRefIdAndRefTableId(id, typeReferenceId).forEach(entityManager::remove);
                    }
                    entityManager.flush();
                    return null;
                });
            }
        } finally {
            if (typeServiceTarget != null && previousAudit != null) {
                ReflectionTestUtils.setField(typeServiceTarget, "auditTrailService", previousAudit);
            }
            ReflectionTestUtils.setField(DisplayListService.class, "instance", previousLists);
        }
    }

    @Test
    public void chineseCreationCommitsRealIdAllLocalesThreeGrantsAndOriginalAudit() {
        SampleTypeCreateForm form = form();
        String internal = uniqueName() + "X".repeat(31); // 40 characters, actual database limit.
        ownedNames.add(internal);
        form.setIdentifyingName(internal);
        form.setNameZh("血清标本");
        form.setWhonetCode("SERUM");
        ResponseEntity<?> result = post(form);
        assertEquals(200, result.getStatusCode().value());
        String id = ((SampleTypeCreateForm) result.getBody()).getCreatedSampleTypeId();
        assertNotNull(id);
        ownedTypeIds.add(id);
        fresh(true).execute(status -> {
            entityManager.clear();
            TypeOfSample saved = entityManager.find(TypeOfSample.class, id);
            assertNotNull(saved);
            assertEquals(internal, saved.getDescription());
            assertEquals(internal.substring(0, 10), saved.getLocalAbbreviation());
            assertEquals("CLINICAL", saved.getDomain());
            assertEquals("SERUM", saved.getWhonetCode());
            assertFalse(saved.getIsActive());
            assertEquals(Integer.MAX_VALUE, saved.getSortOrder());
            Localization localization = saved.getLocalization();
            assertEquals("Serum English", localization.getEnglish());
            assertEquals("Serum French", localization.getFrench());
            assertEquals("血清标本", localization.getLocalizedValue(Locale.CHINESE));
            assertEquals(3, localization.getValues().size());
            String[] prefixes = { "Workplan", "LogbookResults", "ResultValidation" };
            for (int i = 0; i < 3; i++) {
                SystemModule module = entityManager
                        .createQuery("from SystemModule m where m.systemModuleName = :name", SystemModule.class)
                        .setParameter("name", prefixes[i] + ":" + internal).getSingleResult();
                List<RoleModule> grants = entityManager
                        .createQuery("from RoleModule r where r.systemModule.id = :id", RoleModule.class)
                        .setParameter("id", module.getId()).getResultList();
                assertEquals(1, grants.size());
                RoleModule grant = grants.get(0);
                assertEquals(i == 2 ? "6" : "4", grant.getRole().getId());
                assertEquals(i == 2 ? "Validation" : "Results", grant.getRole().getName().trim());
                assertEquals("Y", grant.getHasAdd());
                assertEquals("Y", grant.getHasDelete());
                assertEquals("Y", grant.getHasSelect());
                assertEquals("Y", grant.getHasUpdate());
            }
            return null;
        });
        // Preserve the seed's existing keep_history setting; creation must not enable
        // auditing by itself.
        int expectedHistoryCount = "Y".equals(references.getReferenceTableByName("TYPE_OF_SAMPLE").getKeepHistory()) ? 1
                : 0;
        assertEquals(expectedHistoryCount, histories.getHistoryByRefIdAndRefTableId(id, typeReferenceId).size());
        if (expectedHistoryCount == 1) {
            assertEquals(TEST_SYS_USER_ID,
                    histories.getHistoryByRefIdAndRefTableId(id, typeReferenceId).get(0).getSysUserId());
        }
    }

    @Test
    public void oldEnglishFrenchFormUsesEnglishIdentityAndDoesNotInventChinese() {
        SampleTypeCreateForm form = form();
        String name = uniqueName() + "Legacy";
        ownedNames.add(name);
        form.setSampleTypeEnglishName(name);
        ResponseEntity<?> result = post(form);
        assertEquals(200, result.getStatusCode().value());
        String id = ((SampleTypeCreateForm) result.getBody()).getCreatedSampleTypeId();
        ownedTypeIds.add(id);
        fresh(true).execute(status -> {
            entityManager.clear();
            TypeOfSample saved = entityManager.find(TypeOfSample.class, id);
            assertEquals(name, saved.getDescription());
            assertEquals(name, saved.getLocalization().getEnglish());
            assertEquals("Serum French", saved.getLocalization().getFrench());
            assertFalse(saved.getLocalization().getValues().containsKey("zh"));
            return null;
        });
    }

    @Test
    public void absentRequiredRolesReturn400WithoutAnyCreatedRows() throws Exception {
        executeDataSetWithStateManagement("testdata/sample-type-create.xml");
        long[] before = counts();
        SampleTypeCreateForm form = form();
        form.setIdentifyingName(uniqueName() + "MissingRole");
        assertEquals(400, post(form).getStatusCode().value());
        assertNull(form.getCreatedSampleTypeId());
        assertArrayEquals(before, counts());
    }

    @Test
    public void duplicateReturns409AndRollsBackNewLocalizationAndValues() {
        SampleTypeCreateForm form = form();
        String name = uniqueName() + "Duplicate";
        ownedNames.add(name);
        form.setIdentifyingName(name);
        assertEquals(200, post(form).getStatusCode().value());
        ownedTypeIds.add(form.getCreatedSampleTypeId());
        long[] before = counts();
        SampleTypeCreateForm duplicate = form();
        duplicate.setIdentifyingName(name);
        duplicate.setNameZh("未提交名称");
        assertEquals(409, post(duplicate).getStatusCode().value());
        assertNull(duplicate.getCreatedSampleTypeId());
        assertArrayEquals(before, counts());
    }

    @Test
    public void realFinalGrantForeignKeyFailureRollsBackTheWholeOriginalTransaction() {
        String name = uniqueName() + "Rollback";
        ownedNames.add(name);
        Localization localization = new Localization();
        localization.setEnglish("Rollback EN");
        localization.setFrench("Rollback FR");
        localization.setLocalizedValue("zh", "未提交标本");
        localization.setDescription("type of sample name");
        localization.setSysUserId(TEST_SYS_USER_ID);
        TypeOfSample type = new TypeOfSample();
        type.setDescription(name);
        type.setLocalAbbreviation(name.substring(0, 10));
        type.setDomain("CLINICAL");
        type.setSysUserId(TEST_SYS_USER_ID);
        SystemModule workplan = module("Workplan:" + name), results = module("LogbookResults:" + name),
                validation = module("ResultValidation:" + name);
        Role missing = new Role();
        missing.setId("999999999");
        long[] before = counts();
        try {
            creates.createAndInsertSampleType(localization, type, workplan, results, validation,
                    grant(workplan, roles.getRoleByName("Results")), grant(results, roles.getRoleByName("Results")),
                    grant(validation, missing));
            fail("Expected a real PostgreSQL foreign-key rejection");
        } catch (RuntimeException expected) {
            Throwable cause = expected;
            org.postgresql.util.PSQLException databaseFailure = null;
            while (cause != null) {
                if (cause instanceof org.postgresql.util.PSQLException) {
                    databaseFailure = (org.postgresql.util.PSQLException) cause;
                    break;
                }
                cause = cause.getCause();
            }
            assertNotNull("Failure must come from the real database", databaseFailure);
            assertEquals("23503", databaseFailure.getSQLState());
        }
        assertArrayEquals(before, counts());
        if (type.getId() != null) {
            assertTrue(histories.getHistoryByRefIdAndRefTableId(type.getId(), typeReferenceId).isEmpty());
        }
    }

    private long[] counts() {
        return fresh(true).execute(status -> {
            entityManager.clear();
            String[] entities = { "Localization", "LocalizationValue", "TypeOfSample", "SystemModule", "RoleModule",
                    "History" };
            long[] counts = new long[entities.length];
            for (int i = 0; i < entities.length; i++) {
                counts[i] = entityManager.createQuery("select count(e) from " + entities[i] + " e", Long.class)
                        .getSingleResult();
            }
            return counts;
        });
    }

    private TransactionTemplate fresh(boolean readOnly) {
        TransactionTemplate template = new TransactionTemplate(transactions);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        template.setReadOnly(readOnly);
        return template;
    }

    private ResponseEntity<?> post(SampleTypeCreateForm form) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(Integer.parseInt(TEST_SYS_USER_ID));
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, actor);
        return controller.postSampleTypeCreate(request, form, new BeanPropertyBindingResult(form, "form"));
    }

    private SampleTypeCreateForm form() {
        SampleTypeCreateForm form = new SampleTypeCreateForm();
        form.setSampleTypeEnglishName("Serum English");
        form.setSampleTypeFrenchName("Serum French");
        form.setDomain("CLINICAL");
        return form;
    }

    private String uniqueName() {
        return UUID.randomUUID().toString().substring(0, 8) + "_";
    }

    private SystemModule module(String name) {
        SystemModule module = new SystemModule();
        module.setSystemModuleName(name);
        module.setDescription(name);
        module.setSysUserId(TEST_SYS_USER_ID);
        return module;
    }

    private RoleModule grant(SystemModule module, Role role) {
        RoleModule grant = new RoleModule();
        grant.setSystemModule(module);
        grant.setRole(role);
        grant.setSysUserId(TEST_SYS_USER_ID);
        grant.setHasSelect("Y");
        grant.setHasUpdate("Y");
        grant.setHasAdd("Y");
        grant.setHasDelete("Y");
        return grant;
    }
}

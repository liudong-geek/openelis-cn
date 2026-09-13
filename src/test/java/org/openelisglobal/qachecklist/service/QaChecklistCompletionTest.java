package org.openelisglobal.qachecklist.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.junit.*;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.qachecklist.dao.SampleQaChecklistDAO;
import org.openelisglobal.qachecklist.valueholder.SampleQaChecklist;
import org.openelisglobal.sample.dao.SpecimenReceiptDAO;
import org.openelisglobal.sample.service.OrderEntryActorGuard;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Real service, actor and Spring transactions; SIM memory only, no database.
 */
public class QaChecklistCompletionTest {
    private final SpecimenReceiptDAO specimens = mock(SpecimenReceiptDAO.class);
    private final SampleQaChecklistDAO checklists = mock(SampleQaChecklistDAO.class);
    private final DictionaryService dictionaries = mock(DictionaryService.class);
    private final UserService users = mock(UserService.class);
    private final DefaultConfigurationProperties configuration = mock(DefaultConfigurationProperties.class);
    private final List<SampleTypeRequest> requests = new ArrayList<>();
    private final List<SampleItem> items = new ArrayList<>();
    private final List<Analysis> analyses = new ArrayList<>();
    private final List<Dictionary> configured = new ArrayList<>();
    private final MemoryTransactions transactions = new MemoryTransactions();
    private final CapturingService target = new CapturingService();
    private SampleQaChecklistService service;
    private Sample sample;
    private SystemUser operator;
    private MockHttpSession session;
    private boolean permitted = true;
    private SampleQaChecklist persisted;
    private Runnable afterSave = () -> {
    };

    @Before
    public void setup() {
        var actor = new OrderEntryActorGuard();
        var accounts = mock(SystemUserService.class);
        var logins = mock(LoginUserService.class);
        var roles = mock(UserRoleService.class);
        ReflectionTestUtils.setField(actor, "systemUserService", accounts);
        ReflectionTestUtils.setField(actor, "loginUserService", logins);
        ReflectionTestUtils.setField(actor, "userRoleService", roles);
        operator = new SystemUser();
        operator.setId("7");
        operator.setLoginName("SIM-qa");
        operator.setIsActive("Y");
        var login = new LoginUser();
        login.setSystemUserId(7);
        login.setLoginName("SIM-qa");
        login.setAccountLocked("N");
        login.setAccountDisabled("N");
        login.setPasswordExpiredDayNo(90);
        when(accounts.getMatch("loginName", "SIM-qa")).thenReturn(Optional.of(operator));
        when(logins.getMatch("loginName", "SIM-qa")).thenReturn(Optional.of(login));
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(true);
        var principal = User.withUsername("SIM-qa").password("unused").authorities("ROLE_RECEPTION").build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
        session = new MockHttpSession();
        var legacy = new UserSessionData();
        legacy.setSytemUserId(7);
        legacy.setLoginName("SIM-qa");
        session.setAttribute(IActionConstants.USER_SESSION_DATA, legacy);
        session.setAttribute("SPRING_SECURITY_CONTEXT", SecurityContextHolder.getContext());
        var http = new MockHttpServletRequest();
        http.setSession(session);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(http));
        sample = new Sample();
        sample.setId("701");
        sample.setAccessionNumber("SIM-QA-701");
        sample.setDomain("H");
        sample.setStatusId("1");
        sample.setStorageSkipped(true);
        ReflectionTestUtils.setField(sample, "receivedTimestamp", time("2026-09-01T00:00:00Z"));
        when(configuration.getPropertyValue("domain.human")).thenReturn("H");
        when(specimens.lockOrder("701")).thenReturn(sample);
        when(specimens.clinicalPatientIds("701")).thenReturn(List.of("801"));
        when(specimens.statusName("1", "ORDER")).thenReturn("Test Entered");
        when(specimens.statusName("2", "SAMPLE")).thenReturn("SampleEntered");
        when(specimens.statusName("3", "ANALYSIS")).thenReturn("Not Tested");
        when(specimens.lockRequests("701")).thenReturn(requests);
        when(specimens.lockItems("701")).thenReturn(items);
        when(specimens.lockAnalyses("701")).thenReturn(analyses);
        when(specimens.currentMembership("701")).thenAnswer(call -> new SpecimenReceiptDAO.Membership(
                requests.stream().map(SampleTypeRequest::getId).toList(),
                items.stream().map(SampleItem::getId).toList(), analyses.stream().map(Analysis::getId).toList()));
        when(users.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION)).thenAnswer(
                call -> permitted ? List.of(new org.openelisglobal.common.util.IdValuePair("31", "SIM-test"))
                        : List.of());
        for (int i = 1; i <= 2; i++) {
            var type = new TypeOfSample();
            type.setId("11");
            type.setIsActive(true);
            var test = new org.openelisglobal.test.valueholder.Test();
            test.setId("31");
            test.setIsActive("Y");
            var item = new SampleItem();
            item.setId("100" + i);
            item.setSample(sample);
            item.setTypeOfSample(type);
            item.setStatusId("2");
            item.setCollectionDate(time("2026-09-01T01:00:00.123456Z"));
            item.setReceivedDate(time("2026-09-01T02:00:00.123456Z"));
            item.setLastupdated(time("2026-09-01T02:00:01.123456Z"));
            items.add(item);
            var planned = new SampleTypeRequest();
            planned.setId(900 + i);
            planned.setSample(sample);
            planned.setSampleItem(item);
            planned.setTypeOfSample(type);
            planned.setStatus(SampleTypeRequest.Status.COLLECTED);
            planned.setRequestedTests("31");
            requests.add(planned);
            var analysis = new Analysis();
            analysis.setId("110" + i);
            analysis.setSampleItem(item);
            analysis.setTest(test);
            analysis.setStatusId("3");
            analyses.add(analysis);
        }
        configured.add(item("patient"));
        configured.add(item("specimen"));
        when(dictionaries.getDictionaryEntrysByCategoryNameLocalizedSort("QAChecklistItem")).thenReturn(configured);
        ReflectionTestUtils.setField(target, "sampleQaChecklistDAO", checklists);
        ReflectionTestUtils.setField(target, "dictionaryService", dictionaries);
        if (org.springframework.util.ReflectionUtils.findField(target.getClass(),
                "qaChecklistPrerequisiteDAO") != null) {
            var prerequisites = mock(org.openelisglobal.qachecklist.dao.QaChecklistPrerequisiteDAO.class);
            when(prerequisites.findPrerequisites(701)).thenAnswer(
                    call -> new org.openelisglobal.qachecklist.dao.QaChecklistPrerequisiteDAO.Prerequisites(true, true,
                            Boolean.TRUE.equals(sample.getStorageSkipped()), false, false, false, false));
            ReflectionTestUtils.setField(target, "qaChecklistPrerequisiteDAO", prerequisites);
        }
        // The red baseline intentionally has no guard field.
        if (org.springframework.util.ReflectionUtils.findField(target.getClass(), "writeGuard") != null) {
            ReflectionTestUtils.setField(target, "writeGuard",
                    new QaChecklistWriteGuard(specimens, actor, users, configuration));
        }
        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        transactions.setRollbackOnCommitFailure(true);
        proxy.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        service = (SampleQaChecklistService) proxy.getProxy();
    }

    @After
    public void cleanup() {
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    private static Timestamp time(String value) {
        return Timestamp.from(Instant.parse(value));
    }

    private static Dictionary item(String key) {
        var row = new Dictionary();
        row.setIsActive("Y");
        row.setDictEntry(key);
        return row;
    }

    private Map<String, Boolean> ticks() {
        return Map.of("patient", true, "specimen", true);
    }

    private SampleQaChecklist save() {
        return service.saveOrUpdateChecklist(701, ticks(), 7);
    }

    private void rejects(Runnable action) {
        assertThrows(RuntimeException.class, action::run);
        assertNull(persisted);
    }

    @Test
    public void allReceivedWritesOnlyChecklist() {
        var result = save();
        assertTrue(result.getAllRequiredVerified());
        assertEquals(Integer.valueOf(7), result.getVerifiedByUserId());
        assertNotNull(result.getVerifiedDate());
        assertEquals(1, transactions.commits);
        assertEquals("2", items.get(0).getStatusId());
        assertEquals("3", analyses.get(0).getStatusId());
        assertEquals("1", sample.getStatusId());
    }

    @Test
    public void missingOneReceiptCannotComplete() {
        items.get(1).setReceivedDate(null);
        rejects(this::save);
    }

    @Test
    public void registrationDateIsNotTubeReceipt() {
        items.forEach(row -> row.setReceivedDate(null));
        rejects(this::save);
    }

    @Test
    public void missingReceiptMaySaveOnlyIncompleteChecklist() {
        items.get(1).setReceivedDate(null);
        var result = service.saveOrUpdateChecklist(701, Map.of("patient", true), 7);
        assertFalse(result.getAllRequiredVerified());
        assertNull(result.getVerifiedDate());
        assertNull(result.getVerifiedByUserId());
    }

    @Test
    public void receiptBeforeCollectionCannotComplete() {
        items.get(1).setReceivedDate(time("2026-09-01T01:00:00.123455Z"));
        rejects(this::save);
    }

    @Test
    public void futureReceiptCannotComplete() {
        items.get(1).setReceivedDate(time("2099-09-01T02:00:00Z"));
        rejects(this::save);
    }

    @Test
    public void noCollectionCannotComplete() {
        items.get(1).setCollectionDate(null);
        rejects(this::save);
    }

    @Test
    public void futureCollectionCannotComplete() {
        items.get(1).setCollectionDate(time("2099-09-01T00:00:00Z"));
        rejects(this::save);
    }

    @Test
    public void pendingTubeCannotComplete() {
        requests.get(1).setStatus(SampleTypeRequest.Status.REQUESTED);
        rejects(this::save);
    }

    @Test
    public void canceledLinkedTubeCannotComplete() {
        requests.get(1).setStatus(SampleTypeRequest.Status.CANCELLED);
        rejects(this::save);
    }

    @Test
    public void properlyCanceledUncollectedRequestDoesNotBlock() {
        requests.get(1).setStatus(SampleTypeRequest.Status.CANCELLED);
        requests.get(1).setSampleItem(null);
        items.remove(1);
        analyses.remove(1);
        assertTrue(save().getAllRequiredVerified());
    }

    @Test
    public void allCanceledCannotComplete() {
        requests.forEach(row -> {
            row.setStatus(SampleTypeRequest.Status.CANCELLED);
            row.setSampleItem(null);
        });
        items.clear();
        analyses.clear();
        rejects(this::save);
    }

    @Test
    public void duplicateRequestCannotComplete() {
        requests.add(requests.get(0));
        rejects(this::save);
    }

    @Test
    public void duplicatePhysicalLinkCannotComplete() {
        requests.get(1).setSampleItem(items.get(0));
        rejects(this::save);
    }

    @Test
    public void orphanPhysicalTubeCannotComplete() {
        requests.remove(1);
        rejects(this::save);
    }

    @Test
    public void wrongSampleCannotComplete() {
        items.get(1).setSample(new Sample());
        rejects(this::save);
    }

    @Test
    public void wrongTypeCannotComplete() {
        var type = new TypeOfSample();
        type.setId("12");
        type.setIsActive(true);
        requests.get(1).setTypeOfSample(type);
        rejects(this::save);
    }

    @Test
    public void rejectedTubeCannotComplete() {
        items.get(1).setRejected(true);
        rejects(this::save);
    }

    @Test
    public void voidedTubeCannotComplete() {
        items.get(1).setVoided(true);
        rejects(this::save);
    }

    @Test
    public void aliquotRequiresExplicitContract() {
        items.get(1).setParentSampleItem(items.get(0));
        rejects(this::save);
    }

    @Test
    public void missingVersionCannotComplete() {
        items.get(1).setLastupdated(null);
        rejects(this::save);
    }

    @Test
    public void inactiveTypeCannotComplete() {
        items.get(1).getTypeOfSample().setIsActive(false);
        rejects(this::save);
    }

    @Test
    public void inactiveTestCannotComplete() {
        analyses.get(1).getTest().setIsActive("N");
        rejects(this::save);
    }

    @Test
    public void noAnalysisCannotComplete() {
        analyses.clear();
        rejects(this::save);
    }

    @Test
    public void missingRequestedTestCannotComplete() {
        requests.get(1).setRequestedTests("31,32");
        rejects(this::save);
    }

    @Test
    public void invalidTestIdentifierCannotComplete() {
        requests.get(1).setRequestedTests("31,invalid");
        rejects(this::save);
    }

    @Test
    public void duplicateAnalysisCannotComplete() {
        analyses.add(analyses.get(0));
        rejects(this::save);
    }

    @Test public void progressedAnalysisCannotComplete() { when(specimens.statusName("3", "ANALYSIS")).thenReturn("Finalized"); rejects(this::save); }

    @Test public void progressedOrderCannotModifyDraftEither() { when(specimens.statusName("1", "ORDER")).thenReturn("Testing finished"); rejects(() -> service.saveOrUpdateChecklist(701, Map.of(), 7)); }

    @Test public void ambiguousPatientCannotComplete() { when(specimens.clinicalPatientIds("701")).thenReturn(List.of("801", "802")); rejects(this::save); }

    @Test public void missingPatientCannotComplete() { when(specimens.clinicalPatientIds("701")).thenReturn(List.of()); rejects(this::save); }

    @Test
    public void environmentalOrderRequiresExplicitContract() {
        sample.setDomain("E");
        rejects(this::save);
    }

    @Test
    public void absentRegistrationCannotComplete() {
        ReflectionTestUtils.setField(sample, "receivedTimestamp", null);
        rejects(this::save);
    }

    @Test
    public void deniedPermissionCannotComplete() {
        permitted = false;
        rejects(this::save);
    }

    @Test
    public void inactiveActorCannotReadOrder() {
        operator.setIsActive("N");
        rejects(this::save);
        verify(specimens, never()).lockOrder(anyString());
    }

    @Test
    public void impersonatedActorCannotComplete() {
        rejects(() -> service.saveOrUpdateChecklist(701, ticks(), 8));
    }

    @Test
    public void anonymousCannotComplete() {
        SecurityContextHolder.clearContext();
        rejects(this::save);
    }

    @Test
    public void invalidatedSessionCannotComplete() {
        session.invalidate();
        rejects(this::save);
    }

    @Test
    public void noWebContextCannotComplete() {
        RequestContextHolder.resetRequestAttributes();
        rejects(this::save);
    }

    @Test
    public void nonTransactionalEntryCannotWrite() {
        rejects(() -> target.saveOrUpdateChecklist(701, ticks(), 7));
    }

    @Test
    public void readonlyTransactionCannotWrite() {
        var template = new TransactionTemplate(transactions);
        template.setReadOnly(true);
        rejects(() -> template.execute(status -> save()));
    }

    @Test
    public void dirtyContextCannotWrite() {
        doThrow(new IllegalStateException("SIM-dirty")).when(specimens).requireCleanContext();
        rejects(this::save);
        verifyZeroInteractions(dictionaries);
    }

    @Test
    public void lateRevocationRollsBack() {
        afterSave = () -> permitted = false;
        rejects(this::save);
        assertEquals(1, transactions.rollbacks);
    }

    @Test
    public void lateAccountDisableRollsBack() {
        afterSave = () -> operator.setIsActive("N");
        rejects(this::save);
    }

    @Test
    public void lateReceiptChangeRollsBack() {
        afterSave = () -> items.get(1).setReceivedDate(null);
        rejects(this::save);
    }

    @Test
    public void outerTransactionRevocationRollsBack() {
        rejects(() -> new TransactionTemplate(transactions).execute(status -> {
            save();
            permitted = false;
            return null;
        }));
    }

    @Test
    public void commitFailureNeverLooksSuccessful() {
        transactions.failCommit = true;
        rejects(this::save);
    }

    @Test
    public void saveFailurePropagates() {
        afterSave = () -> {
            throw new IllegalStateException("SIM-save");
        };
        rejects(this::save);
    }

    @Test
    public void sameTicksAreNewReviewNotOldActorProof() {
        var old = new SampleQaChecklist();
        old.setId(81);
        old.setSampleId(701);
        old.setVerifiedItems(ticks());
        old.setAllRequiredVerified(true);
        old.setVerifiedByUserId(2);
        old.setVerifiedDate(time("2026-09-01T03:00:00Z"));
        when(checklists.findBySampleId(701)).thenReturn(old);
        var saved = save();
        assertEquals(Integer.valueOf(7), saved.getVerifiedByUserId());
        assertTrue(saved.getVerifiedDate().after(time("2026-09-01T03:00:00Z")));
    }

    @Test
    public void invalidConfigurationCannotComplete() {
        configured.clear();
        rejects(this::save);
    }

    @Test
    public void unknownChecklistItemCannotComplete() {
        rejects(() -> service.saveOrUpdateChecklist(701, Map.of("foreign", true), 7));
    }

    @Test
    public void duplicateConfigurationCannotComplete() {
        configured.add(item("patient"));
        rejects(this::save);
    }

    @Test
    public void addedRequiredItemProducesDraft() {
        configured.add(item("new-check"));
        assertFalse(save().getAllRequiredVerified());
    }

    @Test
    public void lateConfigurationAdditionRollsBack() {
        afterSave = () -> configured.add(item("new-check"));
        rejects(this::save);
    }

    @Test
    public void lateConfigurationMeaningChangeRollsBack() {
        afterSave = () -> configured.get(0).setLocalAbbreviation("SIM-changed-check");
        rejects(this::save);
    }

    @Test
    public void outerConfigurationChangeRollsBack() {
        rejects(() -> new TransactionTemplate(transactions).execute(status -> {
            save();
            configured.add(item("new-check"));
            return null;
        }));
    }

    @Test
    public void storageObligationCannotBeSkippedByCompletion() {
        sample.setStorageSkipped(false);
        rejects(this::save);
    }

    @Test
    public void lateStorageObligationChangeRollsBack() {
        afterSave = () -> sample.setStorageSkipped(false);
        rejects(this::save);
    }

    @Test
    public void latePatientChangeRollsBack() {
        afterSave = () -> when(specimens.clinicalPatientIds("701")).thenReturn(List.of("802"));
        rejects(this::save);
    }

    @Test
    public void lateLabChangeRollsBack() {
        afterSave = () -> sample.setAccessionNumber("SIM-other");
        rejects(this::save);
    }

    @Test
    public void outerDomainChangeRollsBack() {
        rejects(() -> new TransactionTemplate(transactions).execute(status -> {
            save();
            sample.setDomain("E");
            return null;
        }));
    }

    @Test
    public void lateMembershipChangeRollsBack() {
        afterSave = () -> when(specimens.currentMembership("701")).thenReturn(new SpecimenReceiptDAO.Membership(
                List.of(901, 902, 903), List.of("1001", "1002"), List.of("1101", "1102")));
        rejects(this::save);
    }

    @Test
    public void sameTicksMustNotMutateManagedBaselineOnFailure() {
        var old = new SampleQaChecklist();
        old.setId(81);
        old.setSampleId(701);
        old.setVerifiedItems(ticks());
        old.setAllRequiredVerified(true);
        old.setVerifiedByUserId(2);
        old.setVerifiedDate(time("2026-09-01T03:00:00Z"));
        when(checklists.findBySampleId(701)).thenReturn(old);
        afterSave = () -> permitted = false;
        rejects(this::save);
        assertEquals(Integer.valueOf(2), old.getVerifiedByUserId());
    }

    @Test
    public void wrongStoredChecklistIdentityCannotBeOverwritten() {
        var old = new SampleQaChecklist();
        old.setId(81);
        old.setSampleId(702);
        when(checklists.findBySampleId(701)).thenReturn(old);
        rejects(this::save);
        assertEquals(Integer.valueOf(702), old.getSampleId());
    }

    @Test
    public void mismatchedSavedIdentityRollsBack() {
        afterSave = () -> persisted.setSampleId(702);
        rejects(this::save);
    }

    public class CapturingService extends SampleQaChecklistServiceImpl {
        @Override
        public SampleQaChecklist save(SampleQaChecklist row) {
            persisted = row;
            afterSave.run();
            return row;
        }
    }

    private class MemoryTransactions extends AbstractPlatformTransactionManager {
        private boolean active, failCommit;
        private int commits, rollbacks;

        @Override
        protected Object doGetTransaction() {
            return this;
        }

        @Override
        protected boolean isExistingTransaction(Object tx) {
            return active;
        }

        @Override
        protected void doBegin(Object tx, TransactionDefinition definition) {
            active = true;
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            if (failCommit)
                throw new IllegalStateException("SIM-commit");
            commits++;
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            persisted = null;
            rollbacks++;
        }

        @Override
        protected void doSetRollbackOnly(DefaultTransactionStatus status) {
        }

        @Override
        protected void doCleanupAfterCompletion(Object tx) {
            active = false;
        }
    }
}

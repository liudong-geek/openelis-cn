package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.util.*;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.SampleAddService;
import org.openelisglobal.common.services.StatusService;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.panel.valueholder.Panel;
import org.openelisglobal.panelitem.service.PanelItemService;
import org.openelisglobal.panelitem.valueholder.PanelItem;
import org.openelisglobal.sample.exception.SampleCollectionValidationException;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.dao.SampleItemDAO;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.dao.SampleTypeRequestDAO;
import org.openelisglobal.sampletyperequest.service.SampleTypeRequestServiceImpl;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.service.TypeOfSampleTestService;
import org.openelisglobal.typeofsample.service.TypeOfSamplePanelService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.typeofsample.valueholder.TypeOfSampleTest;
import org.openelisglobal.typeofsample.valueholder.TypeOfSamplePanel;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
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

/** Real collection service, matcher and actor guard; SIM transactional memory, no SQL or network. */
public class SampleCollectionTransactionTest {
    private Object oldFactory, oldFields;
    private final Map<String, Object> oldStatics = new HashMap<>();
    private final Map<String, SampleItem> tubes = new LinkedHashMap<>();
    private final List<Analysis> analyses = new ArrayList<>();
    private final List<SampleTypeRequest> requests = new ArrayList<>();
    private SamplePatientEntryServiceImpl target;
    private SamplePatientEntryService service;
    private SampleTypeRequestServiceImpl matcher;
    private SampleTypeRequestDAO requestDao;
    private SampleItemService items;
    private SampleItemDAO itemDao;
    private SampleService samples;
    private AnalysisService analysisService;
    private UserService permissions;
    private TestService tests;
    private PanelService panels;
    private PanelItemService members;
    private Sample sample;
    private TypeOfSample type;
    private org.openelisglobal.test.valueholder.Test test;
    private MemoryTransactions tx;
    private MockHttpServletRequest httpRequest;
    private Runnable duringAnalysis = () -> {};

    @Before public void setup() {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        oldFields = ReflectionTestUtils.getField(FormFields.class, "instance");
        var factory = mock(AutowireCapableBeanFactory.class);
        var fields = mock(FormFields.class);
        when(fields.useField(FormFields.Field.CollectionDate)).thenReturn(true);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        ReflectionTestUtils.setField(FormFields.class, "instance", fields);
        var config = mock(DefaultConfigurationProperties.class);
        when(config.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("zh-CN");
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(config);
        type = new TypeOfSample(); type.setId("1"); type.setIsActive(true);
        var types = mock(TypeOfSampleService.class);
        when(types.getTypeOfSampleById("1")).thenReturn(type);
        when(types.get("1")).thenReturn(type);
        when(factory.getBean(TypeOfSampleService.class)).thenReturn(types);
        var statuses = mock(IStatusService.class);
        when(statuses.getStatusID(StatusService.SampleStatus.Entered)).thenReturn("3");
        when(statuses.matches("3", StatusService.SampleStatus.Entered)).thenReturn(true);
        when(statuses.matches("active", StatusService.OrderStatus.Entered)).thenReturn(true);
        when(statuses.getStatusID(StatusService.AnalysisStatus.NotStarted)).thenReturn("not-started");
        when(factory.getBean(IStatusService.class)).thenReturn(statuses);
        for (String name : List.of("typeOfSampleService", "panelService", "panelItemService", "ohtService", "unitOfMeasureService")) {
            oldStatics.put(name, ReflectionTestUtils.getField(SampleAddService.class, name));
        }
        ReflectionTestUtils.setField(SampleAddService.class, "typeOfSampleService", types);
        sample = new Sample(); sample.setId("1"); sample.setAccessionNumber("SIM-COLLECTION");
        sample.setStatusId("active"); sample.setReferringId("SIM-UNCHANGED"); sample.setSysUserId("99");
        for (int id : List.of(101, 102)) {
            var request = new SampleTypeRequest(); request.setId(id); request.setSample(sample);
            request.setTypeOfSample(type); request.setSortOrder(id - 101); request.setRequestedTests("10");
            request.setRequestedQuantity(1.0);
            request.setStatus(SampleTypeRequest.Status.REQUESTED); request.setSysUserId("99"); requests.add(request);
        }
        samples = mock(SampleService.class); when(samples.get("1")).thenReturn(sample);
        items = mock(SampleItemService.class); itemDao = mock(SampleItemDAO.class);
        requestDao = mock(SampleTypeRequestDAO.class); analysisService = mock(AnalysisService.class);
        // Any here captures the variable-sized SIM write set; assertions inspect its real contents below.
        when(items.insert(any(SampleItem.class))).thenAnswer(call -> {
            var item = (SampleItem) call.getArgument(0); item.setId(Integer.toString(31 + tubes.size()));
            tx.write("tube:" + item.getId()); tubes.put(item.getId(), item); return item.getId();
        });
        when(items.get(anyString())).thenAnswer(call -> tubes.get(call.getArgument(0)));
        when(items.update(any(SampleItem.class))).thenAnswer(call -> {
            var item = (SampleItem) call.getArgument(0); tx.write("update:" + item.getId()); tubes.put(item.getId(), item); return item;
        });
        when(itemDao.getSampleItemsBySampleId("1")).thenAnswer(call -> new ArrayList<>(tubes.values()));
        when(items.getSampleItemsBySampleId("1")).thenAnswer(call -> tubes.values().stream().filter(t -> !t.isVoided()).toList());
        when(requestDao.getRequestsBySampleIdForUpdate("1")).thenReturn(requests);
        when(requestDao.get(anyInt())).thenAnswer(call -> requests.stream().filter(r -> r.getId().equals(call.getArgument(0))).findFirst());
        when(analysisService.insert(any(Analysis.class))).thenAnswer(call -> {
            var analysis = (Analysis) call.getArgument(0); analysis.setId(Integer.toString(51 + analyses.size()));
            tx.write("analysis:" + analysis.getId()); analyses.add(analysis); duringAnalysis.run(); return analysis.getId();
        });
        when(analysisService.getAnalysesBySampleItem(any(SampleItem.class))).thenAnswer(call -> {
            var item = (SampleItem) call.getArgument(0); return analyses.stream().filter(a -> a.getSampleItem() == item).toList();
        });
        matcher = spy(new SampleTypeRequestServiceImpl());
        set(matcher, "sampleTypeRequestDAO", requestDao); set(matcher, "sampleItemService", items); set(matcher, "statusService", statuses);
        set(matcher, "sampleItemDAO", itemDao);
        // Audit persistence is a SIM collaborator; matching/validation methods themselves are never stubbed.
        doAnswer(call -> { var r = (SampleTypeRequest) call.getArgument(0); tx.write("bind:" + r.getId()); return r; })
                .when(matcher).update(any(SampleTypeRequest.class));
        permissions = mock(UserService.class); when(permissions.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION))
                .thenReturn(List.of(new IdValuePair("10", "SIM-test")));
        tests = mock(TestService.class); test = new org.openelisglobal.test.valueholder.Test();
        test.setId("10"); test.setIsActive("Y"); test.setOrderable(true);
        var section = new TestSection(); section.setId("20"); test.setTestSection(section);
        when(tests.get("10")).thenReturn(test);
        var typeTests = mock(TypeOfSampleTestService.class);
        var link = new TypeOfSampleTest(); link.setTypeOfSampleId("1"); link.setTestId("10");
        when(typeTests.getTypeOfSampleTestsForSampleType("1")).thenReturn(List.of(link));
        panels = mock(PanelService.class); members = mock(PanelItemService.class);
        var typePanels = mock(TypeOfSamplePanelService.class);
        var panelLink = new TypeOfSamplePanel(); panelLink.setTypeOfSampleId("1"); panelLink.setPanelId("5");
        when(typePanels.getTypeOfSamplePanelsForSampleType("1")).thenReturn(List.of(panelLink));
        target = new SamplePatientEntryServiceImpl();
        set(target, "sampleService", samples); set(target, "sampleItemService", items); set(target, "sampleItemDAO", itemDao);
        set(target, "sampleTypeRequestService", matcher); set(target, "analysisService", analysisService);
        set(target, "testService", tests); set(target, "panelService", panels); set(target, "panelItemService", members);
        set(target, "statusService", statuses); set(target, "orderEntryActorGuard", actor());
        for (var entry : Map.of("userService", permissions, "typeOfSampleService", types,
                "typeOfSampleTestService", typeTests, "typeOfSamplePanelService", typePanels).entrySet()) {
            set(target, entry.getKey(), entry.getValue());
        }
        tx = new MemoryTransactions();
        var proxy = new ProxyFactory(target); proxy.addAdvice(new TransactionInterceptor(tx, new AnnotationTransactionAttributeSource()));
        service = (SamplePatientEntryService) proxy.getProxy();
    }

    @After public void cleanup() {
        oldStatics.forEach((name, value) -> ReflectionTestUtils.setField(SampleAddService.class, name, value));
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldFields);
        SecurityContextHolder.clearContext(); RequestContextHolder.resetRequestAttributes();
    }

    @Test public void collectsOnlyExplicitSecondTubeAndPreservesOrder() {
        save(xml(102));
        assertEquals(SampleTypeRequest.Status.REQUESTED, requests.get(0).getStatus());
        assertEquals("31", requests.get(1).getSampleItem().getId()); assertEquals(1, analyses.size());
        assertEquals("10", analyses.getFirst().getTest().getId());
        assertEquals("SIM-UNCHANGED", sample.getReferringId()); assertEquals("99", sample.getSysUserId());
        verify(samples, never()).update(any(Sample.class)); assertEquals(3, tx.committed.size());
    }

    @Test public void actualRollbackBeforeWriteProducesBoundRejection() throws Exception {
        var response = invokeWithProof(xml(102).replace("quantity='1'", "quantity='0'"), service);
        assertEquals(400, response.getStatusCode().value()); assertNoWrites();
        assertEquals("COLLECTION_NOT_SAVED", ((Map<?, ?>) response.getBody()).get("code"));
        assertEquals("a".repeat(64), ((Map<?, ?>) response.getBody()).get("fingerprint"));
        assertEquals("11111111-2222-4333-8444-555555555555", ((Map<?, ?>) response.getBody()).get("attemptId"));
    }

    @Test public void secondTubeValidationMustRollbackAllWritesBeforeRejection() throws Exception {
        duringAnalysis = () -> { if (analyses.size() == 2) throw new SampleCollectionValidationException(409, "collection.requestChanged"); };
        var response = invokeWithProof(xml(101) + xml(102), service);
        assertEquals(409, response.getStatusCode().value()); assertRolledBack();
        assertEquals("COLLECTION_NOT_SAVED", ((Map<?, ?>) response.getBody()).get("code"));
    }

    @Test public void outerTransactionStillPendingCannotProduceRejectionProof() {
        new TransactionTemplate(tx).execute(status -> {
            try {
                var response = invokeWithProof(xml(102).replace("quantity='1'", "quantity='0'"), service);
                assertEquals(400, response.getStatusCode().value());
                assertNotEquals("COLLECTION_NOT_SAVED", ((Map<?, ?>) response.getBody()).get("code"));
            } catch (Exception unexpected) { throw new AssertionError(unexpected); }
            status.setRollbackOnly(); return null;
        });
        assertRolledBack();
    }

    @Test public void rollbackFailureCommitFailureAndMissingProxyNeverProveRejection() throws Exception {
        tx.failRollback = true;
        var rollback = invokeWithProof(xml(102).replace("quantity='1'", "quantity='0'"), service);
        assertEquals(503, rollback.getStatusCode().value());
        assertFalse(((Map<?, ?>) rollback.getBody()).containsKey("attemptId"));
        tx.failRollback = false; tx.failCommit = true;
        var commit = invokeWithProof(xml(102), service);
        assertEquals(503, commit.getStatusCode().value());
        assertFalse(((Map<?, ?>) commit.getBody()).containsKey("attemptId"));
        tx.failCommit = false;
        var noProxy = invokeWithProof(xml(102), target);
        assertEquals(503, noProxy.getStatusCode().value());
        assertFalse(((Map<?, ?>) noProxy.getBody()).containsKey("attemptId"));
    }

    private org.springframework.http.ResponseEntity<?> invokeWithProof(String xml, SamplePatientEntryService writer) throws Exception {
        var form = new org.openelisglobal.sample.form.SamplePatientEntryForm(); form.setCollectionOnly(true);
        var identity = new org.openelisglobal.sample.bean.SampleOrderItem(); identity.setSampleId("1"); identity.setLabNo("SIM-COLLECTION");
        form.setSampleOrderItems(identity); form.setSampleXML("<samples>" + xml + "</samples>");
        httpRequest.removeHeader(CollectionSaveAttempt.HEADER);
        httpRequest.addHeader(CollectionSaveAttempt.HEADER, "11111111-2222-4333-8444-555555555555");
        // Wire capture is exercised by the MVC/body-advice suite. This suite exercises actual transaction completion.
        httpRequest.setAttribute(CollectionSaveAttempt.ATTRIBUTE, new CollectionSaveAttempt(
                httpRequest.getHeader(CollectionSaveAttempt.HEADER), "a".repeat(64), form));
        var controller = new org.openelisglobal.sample.controller.rest.SamplePatientEntryRestController();
        set(controller, "samplePatientService", writer);
        return controller.samplePatientEntrySave(httpRequest, form,
                new org.springframework.validation.BeanPropertyBindingResult(form, "form"),
                new org.springframework.web.servlet.mvc.support.RedirectAttributesModelMap());
    }

    @Test public void emptyOrPanelOnlySavedPlanCannotBeReconstructed() {
        panel(test); requests.get(1).setRequestedTests(""); requests.get(1).setRequestedPanels("5");
        assertThrows(SampleCollectionValidationException.class, () -> save(xml(102))); assertNoWrites();
    }

    @Test public void panelOfOtherSpecimenTypeDoesNotAddUnorderedAnalysis() {
        var foreign = new org.openelisglobal.test.valueholder.Test(); foreign.setId("11"); foreign.setIsActive("Y"); foreign.setTestSection(test.getTestSection());
        when(tests.get("11")).thenReturn(foreign); panel(test, foreign); requests.get(1).setRequestedPanels("5");
        save(xml(102)); assertEquals(1, analyses.size()); assertEquals("10", analyses.getFirst().getTest().getId());
    }

    @Test public void savedTestPermissionIsRequiredBeforeAnyWrite() {
        when(permissions.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION)).thenReturn(List.of());
        assertThrows(AccessDeniedException.class, () -> save(xml(102))); assertNoWrites();
    }

    @Test public void missingAuthenticationCannotUseNumericSessionActor() {
        SecurityContextHolder.clearContext(); assertThrows(AccessDeniedException.class, () -> save(xml(102))); assertNoWrites();
    }

    @Test public void secondAnalysisFailureRollsBackAllTubesAnalysesAndBindings() {
        duringAnalysis = () -> { if (analyses.size() == 2) throw new IllegalStateException("SIM downstream failure"); };
        assertThrows(IllegalStateException.class, () -> save(xml(101) + xml(102))); assertRolledBack();
    }

    @Test public void bindingFailureRollsBackEveryPhysicalWrite() {
        doThrow(new IllegalStateException("SIM binding failure")).when(matcher).update(requests.get(1));
        assertThrows(IllegalStateException.class, () -> save(xml(101) + xml(102))); assertRolledBack();
    }

    @Test public void permissionRevokedAfterMethodReturnRollsBackAtCommit() {
        assertThrows(AccessDeniedException.class, () -> new TransactionTemplate(tx).execute(status -> {
            save(xml(102)); when(permissions.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION)).thenReturn(List.of()); return null;
        })); assertRolledBack();
    }

    @Test public void sameRequestReplayDoesNotInsertOrRewriteCommittedFacts() {
        save(xml(102)); var original = requests.get(1).getSampleItem();
        original.setQuantity(2.5); original.setCollector("SIM-original"); int writes = tx.committed.size();
        save(xml(102)); assertEquals(writes, tx.committed.size()); assertEquals(1, tubes.size()); assertEquals(1, analyses.size());
        assertSame(original, requests.get(1).getSampleItem()); assertEquals(Double.valueOf(2.5), original.getQuantity());
        assertEquals("SIM-original", original.getCollector());
    }

    @Test public void duplicateRequestInBatchFailsBeforeFirstInsert() {
        assertThrows(SampleCollectionValidationException.class, () -> save(xml(102) + xml(102))); assertNoWrites();
    }

    @Test public void cancelledRequestCannotCreateTube() {
        requests.get(1).setStatus(SampleTypeRequest.Status.CANCELLED);
        assertThrows(SampleCollectionValidationException.class, () -> save(xml(102))); assertNoWrites();
    }

    @Test public void newTubeRequiresActualPositiveQuantity() {
        for (String quantity : List.of("", "0", "-1", "NaN", "Infinity")) {
            assertThrows(SampleCollectionValidationException.class, () -> save(xml(102).replace("quantity='1'", "quantity='" + quantity + "'")));
            assertNoWrites();
        }
        assertThrows(SampleCollectionValidationException.class, () -> save(xml(102).replace("quantity='1'", ""))); assertNoWrites();
    }

    @Test public void replayCannotHideMissingPlannedAnalysis() {
        save(xml(102)); requests.get(1).setRequestedTests("10,11");
        when(permissions.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION))
                .thenReturn(List.of(new IdValuePair("10", "SIM-one"), new IdValuePair("11", "SIM-two")));
        int writes = tx.committed.size();
        assertThrows(SampleCollectionValidationException.class, () -> save(xml(102))); assertEquals(writes, tx.committed.size());
    }

    @Test public void completeReplayDoesNotRequireHistoricalTestsToRemainOrderable() {
        save(xml(102)); test.setIsActive("N"); test.setOrderable(false); type.setIsActive(false);
        int writes = tx.committed.size(); save(xml(102)); assertEquals(writes, tx.committed.size());
    }

    @Test public void replayAndRemainingSameTypeTubeKeepSeparateIdentities() {
        save(xml(102)); var previous = requests.get(1).getSampleItem();
        save(xml(102) + xml(101)); assertEquals(2, tubes.size()); assertEquals(2, analyses.size());
        assertSame(previous, requests.get(1).getSampleItem()); assertNotSame(previous, requests.get(0).getSampleItem());
        assertEquals("2", previous.getSortOrder()); assertEquals("1", requests.get(0).getSampleItem().getSortOrder());
    }

    @Test public void duplicateDisplayOrderDoesNotConfuseTubeIdentity() {
        requests.get(1).setSortOrder(0); save(xml(102) + xml(101));
        assertEquals("2", requests.get(1).getSampleItem().getSortOrder());
        assertEquals("1", requests.get(0).getSampleItem().getSortOrder()); assertEquals(2, analyses.size());
    }

    @Test public void voidedPhysicalBarcodeIsNotReused() {
        var old = new SampleItem(); old.setId("30"); old.setSample(sample); old.setSortOrder("2"); old.setVoided(true); tubes.put("30", old);
        save(xml(102)); assertEquals("3", requests.get(1).getSampleItem().getSortOrder()); assertEquals("2", old.getSortOrder());
    }

    @Test public void replayRejectsChangedDateAndAbnormalPhysicalStatus() {
        save(xml(102)); int writes = tx.committed.size();
        assertThrows(SampleCollectionValidationException.class, () -> save(xml(102).replace("09:30", "09:31")));
        var item = requests.get(1).getSampleItem(); item.setRejected(true);
        assertThrows(SampleCollectionValidationException.class, () -> save(xml(102)));
        item.setRejected(false); item.setVoided(true);
        assertThrows(SampleCollectionValidationException.class, () -> save(xml(102)));
        assertEquals(writes, tx.committed.size());
    }

    @Test public void invalidReceiveTimestampCannotBeSilentlyDropped() {
        for (String received : List.of("receivedDate='2026/01/02'", "receivedTime='09:31'",
                "receivedDate='2026/01/02' receivedTime='09:29'", "receivedDate='2026/02/30' receivedTime='09:31'")) {
            assertThrows(SampleCollectionValidationException.class, () -> save(xml(102).replace("/>", " " + received + "/>"))); assertNoWrites();
        }
    }

    @Test public void originalSessionMustMatchPermissionRequestEvenForSameActor() {
        var other = new MockHttpServletRequest();
        java.util.Collections.list(httpRequest.getSession().getAttributeNames())
                .forEach(name -> other.getSession().setAttribute(name, httpRequest.getSession().getAttribute(name)));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(other));
        assertThrows(AccessDeniedException.class, () -> save(xml(102))); assertNoWrites();
    }

    @Test public void deactivatedOriginalUnitAllowsReplayButNotNewCollection() {
        var units = mock(org.openelisglobal.unitofmeasure.service.UnitOfMeasureService.class);
        var unit = new org.openelisglobal.unitofmeasure.valueholder.UnitOfMeasure(); unit.setId("8"); unit.setIsActive("Y");
        when(units.getUnitOfMeasureById("8")).thenReturn(unit);
        ReflectionTestUtils.setField(SampleAddService.class, "unitOfMeasureService", units);
        save(xml(102).replace("/>", " uom='8'/>")); unit.setIsActive("N"); int writes = tx.committed.size();
        save(xml(102).replace("/>", " uom='8'/>")); assertEquals(writes, tx.committed.size());
        assertSame(unit, requests.get(1).getSampleItem().getUnitOfMeasure());
        assertThrows(SampleCollectionValidationException.class, () -> save(xml(101).replace("/>", " uom='8'/>")));
        assertEquals(writes, tx.committed.size()); assertEquals(1, tubes.size());
    }

    @Test public void invalidPhysicalAndAnalysisInsertReceiptsRollback() {
        when(items.insert(any(SampleItem.class))).thenReturn(null);
        assertThrows(SampleCollectionValidationException.class, () -> save(xml(102))); assertNoWrites();
    }

    @Test public void duplicateAnalysisReceiptCannotCommitTwoLogicalTestsAsOne() {
        when(analysisService.insert(any(Analysis.class))).thenReturn("51");
        assertThrows(SampleCollectionValidationException.class, () -> save(xml(101) + xml(102))); assertRolledBack();
    }

    @Test public void nullEmptyAndForeignRequestPayloadsNeverWrite() {
        assertThrows(SampleCollectionValidationException.class, () -> service.persistCollection("1", "SIM-COLLECTION", null, httpRequest));
        assertThrows(SampleCollectionValidationException.class, () -> save(""));
        assertThrows(SampleCollectionValidationException.class, () -> save(xml(999))); assertNoWrites();
    }

    @Test public void collectorSessionChangesDuringWriteRollBack() {
        duringAnalysis = () -> SecurityContextHolder.clearContext();
        assertThrows(AccessDeniedException.class, () -> save(xml(102))); assertRolledBack();
    }

    @Test public void existingUncollectedTubeRequiresRealCollectionValidation() {
        var old = existingUncollected();
        assertThrows(SampleCollectionValidationException.class,
                () -> save(xml(102).replace("quantity='1'", "sampleItemId='30'")));
        assertNull(old.getCollectionDate()); assertTrue(tx.committed.isEmpty());
        test.setIsActive("N");
        assertThrows(SampleCollectionValidationException.class,
                () -> save(xml(102).replace("/>", " sampleItemId='30'/>")));
        assertNull(old.getCollectionDate()); assertEquals(1, analyses.size()); assertTrue(tx.committed.isEmpty());
    }

    @Test public void existingUncollectedTubeUsesAuditedDetachedUpdateWithoutAddingTests() {
        var old = existingUncollected();
        save(xml(102).replace("/>", " sampleItemId='30'/>"));
        assertNull("The old audit baseline must not be changed in place", old.getCollectionDate());
        assertEquals(Timestamp.valueOf("2026-01-02 09:30:00"), tubes.get("30").getCollectionDate());
        assertEquals(Double.valueOf(1), tubes.get("30").getQuantity()); assertEquals(1, analyses.size());
        assertEquals(SampleTypeRequest.Status.COLLECTED, requests.get(1).getStatus());
        assertSame(tubes.get("30"), requests.get(1).getSampleItem());
        verify(items, never()).insert(any(SampleItem.class)); verify(analysisService, never()).insert(any(Analysis.class));
        verify(itemDao, never()).update(any(SampleItem.class));
    }

    private SampleItem existingUncollected() {
        var old = new SampleItem(); old.setId("30"); old.setSample(sample); old.setTypeOfSample(type);
        old.setStatusId("3"); old.setSortOrder("2"); tubes.put("30", old);
        var analysis = new Analysis(); analysis.setId("50"); analysis.setSampleItem(old); analysis.setTest(test); analyses.add(analysis);
        return old;
    }

    private void panel(org.openelisglobal.test.valueholder.Test... values) {
        var p = new Panel(); p.setId("5"); p.setIsActive("Y"); when(panels.getPanelById("5")).thenReturn(p);
        when(panels.get("5")).thenReturn(p); var list = new ArrayList<PanelItem>();
        for (var value : values) { var member = new PanelItem(); member.setTest(value); member.setPanel(p); list.add(member); }
        when(members.getPanelItemsForPanel("5")).thenReturn(list);
    }
    private String xml(int id) { return "<sample sampleID='1' sampleTypeRequestId='" + id + "' quantity='1' date='2026/01/02' time='09:30' tests='999' panels='999'/>"; }
    private void save(String xml) { service.persistCollection("1", "SIM-COLLECTION", "<samples>" + xml + "</samples>", httpRequest); }
    private void assertNoWrites() { assertTrue(tubes.isEmpty()); assertTrue(analyses.isEmpty()); assertTrue(tx.committed.isEmpty()); }
    private void assertRolledBack() { assertNoWrites(); assertEquals(SampleTypeRequest.Status.REQUESTED, requests.get(0).getStatus()); assertNull(requests.get(0).getSampleItem()); assertEquals(1, tx.rollbacks); }
    private static void set(Object object, String field, Object value) { ReflectionTestUtils.setField(object, field, value); }
    private OrderEntryActorGuard actor() {
        var guard = new OrderEntryActorGuard(); var users = mock(SystemUserService.class); var logins = mock(LoginUserService.class); var roles = mock(UserRoleService.class);
        var user = new SystemUser(); user.setId("7"); user.setLoginName("SIM-collector"); user.setIsActive("Y");
        var login = new LoginUser(); login.setLoginName("SIM-collector"); login.setSystemUserId(7); login.setAccountDisabled("N"); login.setAccountLocked("N"); login.setPasswordExpiredDayNo(1);
        when(users.getMatch("loginName", "SIM-collector")).thenReturn(Optional.of(user)); when(logins.getMatch("loginName", "SIM-collector")).thenReturn(Optional.of(login));
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(true);
        set(guard, "systemUserService", users); set(guard, "loginUserService", logins); set(guard, "userRoleService", roles);
        var request = new MockHttpServletRequest(); httpRequest = request; var session = new UserSessionData(); session.setSytemUserId(7); session.setLoginName("SIM-collector");
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, session);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        var principal = User.withUsername("SIM-collector").password("SIM-unused").roles("RECEPTION").build();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", SecurityContextHolder.getContext()); return guard;
    }

    private class MemoryTransactions extends AbstractPlatformTransactionManager
            implements org.springframework.transaction.support.SmartTransactionObject {
        private final List<String> committed = new ArrayList<>(), pending = new ArrayList<>();
        private final Map<String, SampleItem> oldTubes = new LinkedHashMap<>();
        private final List<Analysis> oldAnalyses = new ArrayList<>();
        private final Map<SampleTypeRequest, SampleTypeRequest.Status> oldStatus = new IdentityHashMap<>();
        private final Map<SampleTypeRequest, SampleItem> oldBindings = new IdentityHashMap<>();
        private boolean active, rollbackOnly, failRollback, failCommit; private int rollbacks;
        protected void doSetRollbackOnly(DefaultTransactionStatus status) { rollbackOnly = true; }
        public boolean isRollbackOnly() { return rollbackOnly; }
        protected Object doGetTransaction() { return this; }
        protected boolean isExistingTransaction(Object ignored) { return active; }
        protected void doBegin(Object ignored, TransactionDefinition definition) {
            active = true; rollbackOnly = false; pending.clear(); oldTubes.clear(); oldTubes.putAll(tubes); oldAnalyses.clear(); oldAnalyses.addAll(analyses);
            requests.forEach(r -> { oldStatus.put(r, r.getStatus()); oldBindings.put(r, r.getSampleItem()); });
        }
        void write(String event) { assertTrue("SIM write outside transaction", active); pending.add(event); }
        protected void doCommit(DefaultTransactionStatus status) {
            if (failCommit) throw new org.springframework.transaction.TransactionSystemException("SIM commit unknown");
            committed.addAll(pending);
        }
        protected void doRollback(DefaultTransactionStatus status) {
            rollbacks++; tubes.clear(); tubes.putAll(oldTubes); analyses.clear(); analyses.addAll(oldAnalyses);
            requests.forEach(r -> { r.setStatus(oldStatus.get(r)); r.setSampleItem(oldBindings.get(r)); }); pending.clear();
            if (failRollback) throw new org.springframework.transaction.TransactionSystemException("SIM rollback unknown");
        }
        protected void doCleanupAfterCompletion(Object ignored) { active = false; }
    }
}

package org.openelisglobal.sampletyperequest.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.panel.valueholder.Panel;
import org.openelisglobal.panelitem.service.PanelItemService;
import org.openelisglobal.panelitem.valueholder.PanelItem;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampletyperequest.dto.SampleTypeRequestDTO;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.typeofsample.service.TypeOfSamplePanelService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.service.TypeOfSampleTestService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.typeofsample.valueholder.TypeOfSamplePanel;
import org.openelisglobal.typeofsample.valueholder.TypeOfSampleTest;
import org.openelisglobal.unitofmeasure.service.UnitOfMeasureService;
import org.openelisglobal.unitofmeasure.valueholder.UnitOfMeasure;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.SmartTransactionObject;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.BindException;
import org.springframework.validation.BindingResult;

/** SIM master-data fixtures; actual batch service, no database or production data. */
public class SampleTypeRequestEntryBatchTest {
    private SampleTypeRequestServiceImpl service;
    private TypeOfSampleService types;
    private TypeOfSampleTestService typeTests;
    private TypeOfSamplePanelService typePanels;
    private TestService tests;
    private PanelService panels;
    private PanelItemService panelItems;
    private UnitOfMeasureService units;
    private UserService users;
    private Sample sample;
    private TypeOfSample type;
    private org.openelisglobal.test.valueholder.Test test;
    private final List<SampleTypeRequest> inserted = new ArrayList<>();

    @Before
    public void setUp() {
        service = spy(new SampleTypeRequestServiceImpl());
        types = mock(TypeOfSampleService.class);
        typeTests = mock(TypeOfSampleTestService.class);
        typePanels = mock(TypeOfSamplePanelService.class);
        tests = mock(TestService.class);
        panels = mock(PanelService.class);
        panelItems = mock(PanelItemService.class);
        units = mock(UnitOfMeasureService.class);
        users = mock(UserService.class);
        ReflectionTestUtils.setField(service, "typeOfSampleService", types);
        ReflectionTestUtils.setField(service, "typeOfSampleTestService", typeTests);
        ReflectionTestUtils.setField(service, "typeOfSamplePanelService", typePanels);
        ReflectionTestUtils.setField(service, "testService", tests);
        ReflectionTestUtils.setField(service, "panelService", panels);
        ReflectionTestUtils.setField(service, "panelItemService", panelItems);
        ReflectionTestUtils.setField(service, "unitOfMeasureService", units);
        ReflectionTestUtils.setField(service, "userService", users);
        sample = new Sample();
        sample.setId("301");
        type = mock(TypeOfSample.class);
        when(type.getId()).thenReturn("31");
        when(type.isActive()).thenReturn(true);
        when(type.getLocalizedName()).thenReturn("SIM 标本类型");
        when(types.get("31")).thenReturn(type);
        test = new org.openelisglobal.test.valueholder.Test();
        test.setId("41");
        test.setIsActive("Y");
        test.setOrderable(true);
        when(tests.get("41")).thenReturn(test);
        TypeOfSampleTest link = new TypeOfSampleTest();
        link.setTypeOfSampleId("31");
        link.setTestId("41");
        when(typeTests.getTypeOfSampleTestsForSampleType("31")).thenReturn(List.of(link));
        IdValuePair allowed = new IdValuePair("41", "SIM 项目");
        when(users.getAllDisplayUserTestsByLabUnit(eq("7"), anyString())).thenReturn(List.of(allowed));
        doAnswer(call -> {
            inserted.add(call.getArgument(0));
            return 700 + inserted.size();
        }).when(service).insert(any(SampleTypeRequest.class));
    }

    @Test
    public void testBatch_SameTypeTubesStayDistinctAndUseServerIdentity() throws Exception {
        var first = tube();
        var second = tube();
        second.setRequestedQuantity(2.5);
        var result = save(List.of(first, second));
        assertEquals(2, result.size());
        assertEquals("701", result.get(0).getId());
        assertEquals("702", result.get(1).getId());
        assertNotSame(inserted.get(0), inserted.get(1));
        assertSame(sample, inserted.get(0).getSample());
        assertEquals("7", inserted.get(1).getSysUserId());
        assertEquals(SampleTypeRequest.Status.REQUESTED, inserted.get(0).getStatus());
        assertNull(inserted.get(0).getSampleItem());
        assertEquals(Integer.valueOf(1), inserted.get(1).getSortOrder());
        assertEquals(Double.valueOf(2.5), inserted.get(1).getRequestedQuantity());
        assertNull(first.getId());
        assertNotSame(first, result.get(0));
    }

    @Test
    public void testBatch_JsonFormBindsExplicitTubesWithoutLosingTheirIdentity() throws Exception {
        String json = """
                {"orderEntryOnly":true,"requestedSpecimens":[
                  {"typeOfSampleId":"31","requestedQuantity":1,"requestedTests":"41"},
                  {"typeOfSampleId":"31","requestedQuantity":2,"requestedTests":"41"}
                ]}
                """;
        // Match AppConfig's existing FHIR deserializers. This fixture exercises the
        // entry JSON fields, not the whole MVC configuration or FHIR questionnaire IO.
        var module = new com.fasterxml.jackson.databind.module.SimpleModule();
        module.addDeserializer(org.hl7.fhir.r4.model.QuestionnaireResponse.class,
                new org.openelisglobal.fhir.springserialization.QuestionnaireResponseDeserializer());
        module.addDeserializer(org.hl7.fhir.r4.model.Questionnaire.class,
                new org.openelisglobal.fhir.springserialization.QuestionnaireDeserializer());
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper().registerModule(module);
        var form = mapper.readValue(json, SamplePatientEntryForm.class);
        assertTrue(form.isOrderEntryOnly());
        assertEquals(2, form.getRequestedSpecimens().size());
        assertEquals("31", form.getRequestedSpecimens().get(0).getTypeOfSampleId());
        assertEquals(Double.valueOf(2), form.getRequestedSpecimens().get(1).getRequestedQuantity());
    }

    @Test
    public void testBatch_InvalidLastTubePreventsEveryInsert() {
        var invalid = tube();
        invalid.setRequestedQuantity(0.0);
        var failure = assertThrows(BindException.class, () -> save(List.of(tube(), invalid)));
        assertTrue(failure.hasFieldErrors("requestedSpecimens[1].requestedQuantity"));
        assertTrue(inserted.isEmpty());
    }

    @Test
    public void testBatch_RejectsNonFiniteNegativeAndAbsentQuantity() {
        for (Double value : new Double[] { null, 0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY,
                Double.NEGATIVE_INFINITY }) {
            reject(dto -> dto.setRequestedQuantity(value));
        }
    }

    @Test
    public void testBatch_RejectsClientIdentityAndFulfillmentFields() {
        reject(dto -> dto.setSampleId("999"));
        reject(dto -> dto.setId("701"));
        reject(dto -> dto.setSampleItemId("801"));
        reject(dto -> dto.setStatus("COLLECTED"));
        reject(dto -> dto.setCreatedDate("SIM-date"));
    }

    @Test
    public void testBatch_RejectsUntrustedDisplayFields() {
        reject(dto -> dto.setTypeOfSampleName("SIM fake type"));
        reject(dto -> dto.setUnitOfMeasureName("SIM fake unit"));
        reject(dto -> dto.setRequestedTestNames("SIM fake tests"));
        reject(dto -> dto.setRequestedPanelNames("SIM fake panels"));
    }

    @Test
    public void testBatch_RejectsInvalidOrConflictingOrder() {
        reject(dto -> dto.setSortOrder(-1));
        reject(dto -> dto.setSortOrder(3));
        var duplicate = tube();
        duplicate.setSortOrder(0);
        assertThrows(BindException.class, () -> save(List.of(tube(), duplicate)));
        assertTrue(inserted.isEmpty());
    }

    @Test
    public void testBatch_RejectsMalformedDuplicateAndEmptyTestIds() {
        for (String ids : new String[] { null, "", " ", "41,", ",41", "41,41", "41,abc", "0", "-1" }) {
            reject(dto -> dto.setRequestedTests(ids));
        }
    }

    @Test
    public void testBatch_RejectsMalformedAndDuplicatePanelIds() {
        reject(dto -> dto.setRequestedPanels("51,"));
        reject(dto -> dto.setRequestedPanels("51,51"));
        reject(dto -> dto.setRequestedPanels("51,abc"));
    }

    @Test
    public void testBatch_RejectsUnknownOrInactiveType() {
        reject(dto -> dto.setTypeOfSampleId("99"));
        reject(dto -> dto.setTypeOfSampleId("x"));
        when(type.isActive()).thenReturn(false);
        reject(dto -> {});
    }

    @Test
    public void testBatch_RejectsUnknownInactiveOrUnorderableTest() {
        reject(dto -> dto.setRequestedTests("99"));
        test.setIsActive("N");
        reject(dto -> {});
        test.setIsActive("Y");
        test.setOrderable(false);
        reject(dto -> {});
    }

    @Test
    public void testBatch_RejectsTestOfDifferentType() {
        when(typeTests.getTypeOfSampleTestsForSampleType("31")).thenReturn(List.of());
        reject(dto -> {});
    }

    @Test
    public void testBatch_RejectsUnauthorizedTestAndMissingActor() {
        when(users.getAllDisplayUserTestsByLabUnit(eq("7"), anyString())).thenReturn(List.of());
        reject(dto -> {});
        assertThrows(BindException.class, () -> save(List.of(tube()), null));
        assertTrue(inserted.isEmpty());
    }

    @Test
    public void testBatch_UnitMustExistAndBeActiveWhenSpecified() {
        reject(dto -> dto.setUnitOfMeasureId("61"));
        UnitOfMeasure unit = new UnitOfMeasure();
        unit.setId("61");
        unit.setIsActive("N");
        when(units.get("61")).thenReturn(unit);
        reject(dto -> dto.setUnitOfMeasureId("61"));
    }

    @Test
    public void testBatch_PreservesValidOptionalUnit() throws Exception {
        UnitOfMeasure unit = new UnitOfMeasure();
        unit.setId("61");
        unit.setUnitOfMeasureName("SIM 单位");
        when(units.get("61")).thenReturn(unit);
        var dto = tube();
        dto.setUnitOfMeasureId("61");
        var result = save(List.of(dto));
        assertSame(unit, inserted.get(0).getUnitOfMeasure());
        assertEquals("61", result.get(0).getUnitOfMeasureId());
    }

    @Test
    public void testBatch_PanelKeepsOnlyCurrentTypeMembership() throws Exception {
        configurePanel();
        var outside = new PanelItem();
        var otherTest = new org.openelisglobal.test.valueholder.Test();
        otherTest.setId("42");
        outside.setTest(otherTest);
        var inside = new PanelItem();
        inside.setTest(test);
        when(panelItems.getPanelItemsForPanel("51")).thenReturn(List.of(inside, outside));
        var dto = tube();
        dto.setRequestedPanels("51");
        var result = save(List.of(dto));
        assertEquals("41", result.get(0).getRequestedTests());
        assertEquals("51", result.get(0).getRequestedPanels());
    }

    @Test
    public void testBatch_RejectsUnknownInactiveOrUnlinkedPanel() {
        reject(dto -> dto.setRequestedPanels("51"));
        configurePanel();
        when(typePanels.getTypeOfSamplePanelsForSampleType("31")).thenReturn(List.of());
        reject(dto -> dto.setRequestedPanels("51"));
        configurePanel();
        panels.get("51").setIsActive("N");
        reject(dto -> dto.setRequestedPanels("51"));
    }

    @Test
    public void testBatch_RejectsPanelWithNoCurrentTypeMembers() {
        configurePanel();
        when(panelItems.getPanelItemsForPanel("51")).thenReturn(List.of());
        reject(dto -> dto.setRequestedPanels("51"));
    }

    @Test
    public void testBatch_RejectsMissingSelectedPanelMember() {
        configurePanel();
        var secondTest = new org.openelisglobal.test.valueholder.Test();
        secondTest.setId("42");
        secondTest.setIsActive("Y");
        secondTest.setOrderable(true);
        when(tests.get("42")).thenReturn(secondTest);
        var link = new TypeOfSampleTest();
        link.setTypeOfSampleId("31");
        link.setTestId("42");
        var first = typeTests.getTypeOfSampleTestsForSampleType("31").get(0);
        when(typeTests.getTypeOfSampleTestsForSampleType("31")).thenReturn(List.of(first, link));
        var member = new PanelItem();
        member.setTest(secondTest);
        var firstMember = panelItems.getPanelItemsForPanel("51").get(0);
        when(panelItems.getPanelItemsForPanel("51")).thenReturn(List.of(firstMember, member));
        reject(dto -> dto.setRequestedPanels("51"));
    }

    @Test
    public void testBatch_RejectsEmptyNullOrNullMemberBatch() {
        assertThrows(BindException.class, () -> save(List.of()));
        assertThrows(BindException.class, () -> save(null));
        assertThrows(BindException.class, () -> save(java.util.Arrays.asList(tube(), null)));
        assertTrue(inserted.isEmpty());
    }

    @Test
    public void testBatch_RejectsMissingSavedSampleIdentity() {
        sample.setId(null);
        assertThrows(BindException.class, () -> save(List.of(tube())));
        assertTrue(inserted.isEmpty());
    }

    @Test
    public void testBatch_InvalidInsertedIdStopsLaterTubes() {
        doReturn(null).when(service).insert(any(SampleTypeRequest.class));
        assertThrows(IllegalStateException.class, () -> save(List.of(tube(), tube())));
        verify(service, times(1)).insert(any(SampleTypeRequest.class));
    }

    @Test
    public void testBatch_ZeroOrNegativeInsertedIdIsNotSuccess() {
        doReturn(0).when(service).insert(any(SampleTypeRequest.class));
        assertThrows(IllegalStateException.class, () -> save(List.of(tube())));
        doReturn(-1).when(service).insert(any(SampleTypeRequest.class));
        assertThrows(IllegalStateException.class, () -> save(List.of(tube())));
    }

    @Test
    public void testBatch_DuplicateInsertedIdIsNotSuccess() {
        doReturn(701).when(service).insert(any(SampleTypeRequest.class));
        assertThrows(IllegalStateException.class, () -> save(List.of(tube(), tube(), tube())));
        verify(service, times(2)).insert(any(SampleTypeRequest.class));
    }

    @Test
    public void testBatch_PersistenceFailurePropagates() {
        doReturn(701).doThrow(new IllegalStateException("SIM second tube failure"))
                .when(service).insert(any(SampleTypeRequest.class));
        assertThrows(IllegalStateException.class, () -> save(List.of(tube(), tube(), tube())));
        verify(service, times(2)).insert(any(SampleTypeRequest.class));
    }

    @Test
    public void testBatch_ActualProxyRequiresOuterTransactionBeforeAnyReadOrWrite() {
        var proxy = transactionProxy(new MemoryManager());
        var form = new SamplePatientEntryForm();
        form.setRequestedSpecimens(List.of(tube()));
        var errors = new BeanPropertyBindingResult(form, "form");
        assertThrows(IllegalTransactionStateException.class,
                () -> proxy.createRequestsForEntry(sample, form.getRequestedSpecimens(), "7", errors));
        verifyZeroInteractions(types, typeTests, typePanels, tests, panels, panelItems, units, users);
        verify(service, never()).insert(any(SampleTypeRequest.class));
    }

    @Test
    public void testBatch_ActualProxyJoinsOuterOrderCommit() {
        var manager = new MemoryManager();
        var proxy = transactionProxy(manager);
        doAnswer(call -> {
            manager.write("SIM-tube");
            return 700 + manager.pending.size();
        }).when(service).insert(any(SampleTypeRequest.class));
        runTransaction(manager, proxy, List.of(tube(), tube()));
        assertEquals(List.of("SIM-order", "SIM-tube", "SIM-tube"), manager.committed);
        assertEquals(1, manager.commits);
        assertEquals(0, manager.rollbacks);
    }

    @Test
    public void testBatch_ActualProxySecondInsertFailureRollsBackOuterOrderAndFirstTube() {
        var manager = new MemoryManager();
        var proxy = transactionProxy(manager);
        doAnswer(call -> {
            manager.write("SIM-tube");
            if (manager.pending.size() == 3) {
                throw new IllegalStateException("SIM second insert failure");
            }
            return 701;
        }).when(service).insert(any(SampleTypeRequest.class));
        assertThrows(IllegalStateException.class,
                () -> runTransaction(manager, proxy, List.of(tube(), tube(), tube())));
        assertEquals(List.of(), manager.committed);
        assertEquals(0, manager.commits);
        assertEquals(1, manager.rollbacks);
        verify(service, times(2)).insert(any(SampleTypeRequest.class));
    }

    @Test
    public void testBatch_PanelCannotHideUnauthorizedMemberOfSameType() {
        configurePanel();
        var secondTest = new org.openelisglobal.test.valueholder.Test();
        secondTest.setId("42");
        secondTest.setIsActive("Y");
        secondTest.setOrderable(true);
        when(tests.get("42")).thenReturn(secondTest);
        var link = new TypeOfSampleTest();
        link.setTypeOfSampleId("31");
        link.setTestId("42");
        var firstLink = typeTests.getTypeOfSampleTestsForSampleType("31").get(0);
        when(typeTests.getTypeOfSampleTestsForSampleType("31")).thenReturn(List.of(firstLink, link));
        var member = new PanelItem();
        member.setTest(secondTest);
        var firstMember = panelItems.getPanelItemsForPanel("51").get(0);
        when(panelItems.getPanelItemsForPanel("51")).thenReturn(List.of(firstMember, member));
        reject(dto -> {
            dto.setRequestedPanels("51");
            dto.setRequestedTests("41,42");
        });
    }

    private SampleTypeRequestService transactionProxy(MemoryManager manager) {
        var factory = new ProxyFactory(service);
        factory.setInterfaces(SampleTypeRequestService.class);
        factory.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        return (SampleTypeRequestService) factory.getProxy();
    }

    private void runTransaction(MemoryManager manager, SampleTypeRequestService proxy,
            List<SampleTypeRequestDTO> rows) {
        var form = new SamplePatientEntryForm();
        form.setRequestedSpecimens(rows);
        var errors = new BeanPropertyBindingResult(form, "form");
        new TransactionTemplate(manager).execute(status -> {
            manager.write("SIM-order");
            try {
                return proxy.createRequestsForEntry(sample, rows, "7", errors);
            } catch (BindException error) {
                throw new IllegalStateException(error);
            }
        });
    }

    private static class MemoryManager extends AbstractPlatformTransactionManager implements SmartTransactionObject {
        private final List<String> pending = new ArrayList<>();
        private final List<String> committed = new ArrayList<>();
        private boolean active;
        private boolean rollbackOnly;
        private int commits;
        private int rollbacks;

        void write(String value) {
            assertTrue("SIM resource must participate in an active transaction", active);
            pending.add(value);
        }

        @Override
        protected Object doGetTransaction() {
            return this;
        }

        @Override
        protected boolean isExistingTransaction(Object transaction) {
            return active;
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
            active = true;
            rollbackOnly = false;
            pending.clear();
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            committed.addAll(pending);
            commits++;
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            rollbacks++;
        }

        @Override
        protected void doSetRollbackOnly(DefaultTransactionStatus status) {
            rollbackOnly = true;
        }

        @Override
        public boolean isRollbackOnly() {
            return rollbackOnly;
        }

        @Override
        protected void doCleanupAfterCompletion(Object transaction) {
            active = false;
            pending.clear();
        }
    }

    private void configurePanel() {
        var panel = new Panel();
        panel.setId("51");
        when(panels.get("51")).thenReturn(panel);
        var link = new TypeOfSamplePanel();
        link.setPanelId("51");
        link.setTypeOfSampleId("31");
        when(typePanels.getTypeOfSamplePanelsForSampleType("31")).thenReturn(List.of(link));
        var member = new PanelItem();
        member.setTest(test);
        when(panelItems.getPanelItemsForPanel("51")).thenReturn(List.of(member));
    }

    private void reject(Consumer<SampleTypeRequestDTO> mutation) {
        var dto = tube();
        mutation.accept(dto);
        assertThrows(BindException.class, () -> save(List.of(dto)));
        assertTrue("invalid batch must not insert any tube", inserted.isEmpty());
    }

    private List<SampleTypeRequestDTO> save(List<SampleTypeRequestDTO> rows) throws Exception {
        return save(rows, "7");
    }

    private List<SampleTypeRequestDTO> save(List<SampleTypeRequestDTO> rows, String actor) throws Exception {
        var form = new SamplePatientEntryForm();
        form.setRequestedSpecimens(rows);
        BindingResult errors = new BeanPropertyBindingResult(form, "form");
        return service.createRequestsForEntry(sample, rows, actor, errors);
    }

    private static SampleTypeRequestDTO tube() {
        var dto = new SampleTypeRequestDTO();
        dto.setTypeOfSampleId("31");
        dto.setRequestedQuantity(1.0);
        dto.setRequestedTests("41");
        dto.setRequestedPanels("");
        return dto;
    }
}

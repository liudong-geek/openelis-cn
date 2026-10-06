package org.openelisglobal.qaevent;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.qaevent.dao.NceWorkspaceDAO;
import org.openelisglobal.qaevent.form.NceActionCommand;
import org.openelisglobal.qaevent.form.NceRegistrationCommand;
import org.openelisglobal.qaevent.form.NceRegistrationCommand.LinkedSpecimen;
import org.openelisglobal.qaevent.form.NceWorkspaceQuery;
import org.openelisglobal.qaevent.service.*;
import org.openelisglobal.qaevent.service.NceWorkspaceAccess.Action;
import org.openelisglobal.qaevent.service.NceWorkspaceAccess.Scope;
import org.openelisglobal.qaevent.service.impl.NceWorkspaceServiceImpl;
import org.openelisglobal.qaevent.valueholder.*;
import org.openelisglobal.sample.dao.SavedOrderReadDAO;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;

public class NceWorkspaceServiceTest {
    private NceWorkspaceDAO dao;
    private SavedOrderReadDAO orders;
    private NceWorkspaceAccess access;
    private NceRegistrationFileStore files;
    private NCEventService events;
    private NceSpecimenService specimens;
    private NceHistoryService history;
    private NceAttachmentService attachments;
    private NceCategoryService categories;
    private NceTypeService types;
    private SampleItemService items;
    private TestSectionService sections;
    private NceWorkspaceServiceImpl service;
    private MockHttpServletRequest request;
    private Scope scope;
    private Sample sample;
    private SampleItem item;
    private Analysis analysis;
    private NcEvent event;
    private List<NceSpecimen> savedLinks;
    private AtomicReference<NceRegistrationReceipt> stored;

    @Before
    public void setup() {
        dao = mock(NceWorkspaceDAO.class);
        orders = mock(SavedOrderReadDAO.class);
        access = mock(NceWorkspaceAccess.class);
        files = mock(NceRegistrationFileStore.class);
        events = mock(NCEventService.class);
        specimens = mock(NceSpecimenService.class);
        history = mock(NceHistoryService.class);
        attachments = mock(NceAttachmentService.class);
        categories = mock(NceCategoryService.class);
        types = mock(NceTypeService.class);
        var users = mock(SystemUserService.class);
        sections = mock(TestSectionService.class);
        var tests = mock(TestService.class);
        items = mock(SampleItemService.class);
        service = new NceWorkspaceServiceImpl(dao, orders, access, files, events, specimens, history, attachments,
                categories, types, users, sections, tests, items);
        request = new MockHttpServletRequest();
        var module = new SystemModule();
        module.setId("107");
        scope = new Scope(NceWorkspaceTestSupport.actor(request), module, Action.SELECT, List.of("5"), Set.of("1"),
                false);
        when(access.bind(eq(request), any())).thenReturn(scope);
        when(access.allowed(eq(request), eq(scope), any())).thenReturn(true);
        when(access.forAction(eq(request), eq(scope), any())).thenReturn(scope);
        var actor = new SystemUser();
        actor.setId("7");
        actor.setFirstName("明");
        actor.setLastName("王");
        actor.setLoginName("operator7");
        actor.setIsActive("Y");
        when(users.get("7")).thenReturn(actor);
        var category = new NceCategory();
        category.setId(1);
        category.setName("Configured General");
        category.setDisplayKey("nce.category.general");
        category.setActive(true);
        when(categories.get(1)).thenReturn(category);
        when(categories.getAll()).thenReturn(List.of(category));
        when(types.getAll()).thenReturn(List.of());
        when(files.prepare(any())).thenReturn(List.of());
        when(files.store(anyInt(), anyList())).thenReturn(List.of());
        when(attachments.findByNceId(anyInt())).thenReturn(List.of());
        when(history.findByNceId(anyInt())).thenReturn(List.of());
        when(dao.allocateNumber(eq(module), anyInt())).thenReturn("NCE-2026-00001");
        savedLinks = new ArrayList<>();
        stored = new AtomicReference<>();
        when(dao.receipt(anyString())).thenAnswer(
                c -> stored.get() != null && stored.get().getId().equals(c.getArgument(0)) ? Optional.of(stored.get())
                        : Optional.empty());
        doAnswer(c -> {
            stored.set(c.getArgument(0));
            return null;
        }).when(dao).claim(any());
        doAnswer(c -> {
            var r = (NceRegistrationReceipt) c.getArgument(0);
            r.complete(c.getArgument(1), c.getArgument(2));
            return null;
        }).when(dao).complete(any(), anyInt(), anyString());
        when(events.save(any())).thenAnswer(c -> {
            event = c.getArgument(0);
            event.setId(21);
            event.setLastupdated(Timestamp.valueOf(NceWorkspaceTestSupport.VERSION));
            return event;
        });
        when(events.update(any())).thenAnswer(c -> c.getArgument(0));
        when(specimens.save(any())).thenAnswer(c -> {
            var s = (NceSpecimen) c.getArgument(0);
            savedLinks.add(s);
            return s;
        });
        when(dao.links(21)).thenReturn(savedLinks);
        when(dao.event(eq(21), anyBoolean())).thenAnswer(c -> Optional.ofNullable(event));
        sample = new Sample();
        sample.setId("1");
        sample.setAccessionNumber("24-00001");
        sample.setLastupdated(Timestamp.valueOf(NceWorkspaceTestSupport.VERSION));
        item = new SampleItem();
        item.setId("1");
        item.setSample(sample);
        item.setLastupdated(Timestamp.valueOf(NceWorkspaceTestSupport.VERSION));
        var type = mock(TypeOfSample.class);
        when(type.getLocalizedName()).thenReturn("Whole blood");
        item.setTypeOfSample(type);
        when(items.get("1")).thenReturn(item);
        var section = new TestSection();
        section.setId("1");
        var test = mock(org.openelisglobal.test.valueholder.Test.class);
        when(test.getId()).thenReturn("1");
        when(test.getTestSection()).thenReturn(section);
        when(test.getLocalizedName()).thenReturn("CBC");
        analysis = new Analysis();
        analysis.setId("1");
        analysis.setSampleItem(item);
        analysis.setTest(test);
        analysis.setTestSection(section);
        analysis.setLastupdated(Timestamp.valueOf(NceWorkspaceTestSupport.VERSION));
        when(orders.loadExact("24-00001")).thenReturn(Optional.of(new SavedOrderReadDAO.Graph(sample, List.of(item),
                List.of(analysis), List.of(), List.of(), List.of())));
    }

    private LinkedSpecimen link() {
        return new LinkedSpecimen("1", "24-00001", NceWorkspaceTestSupport.VERSION, "1",
                NceWorkspaceTestSupport.VERSION, "1", NceWorkspaceTestSupport.VERSION);
    }

    @Test
    public void completeRegistrationPreservesActualDateRelationsServerNumberAndReceipt() {
        var response = service.create(NceWorkspaceTestSupport.command("2026-10-06", List.of(link())), List.of(),
                request);
        assertEquals("APPLIED", response.outcome());
        assertEquals("CREATE", response.operation());
        assertEquals("NCE-2026-00001", response.nceNumber());
        assertEquals("21", response.eventId());
        assertEquals("2026-10-06", event.getDateOfEvent().toString());
        assertEquals("王明", event.getNameOfReporter());
        assertEquals("7", request.getAttribute("nceCurrentUserId"));
        assertEquals(1, savedLinks.size());
        assertEquals(Integer.valueOf(1), savedLinks.get(0).getAnalysisId());
        assertEquals("24-00001", response.linkedSpecimens().get(0).get("labNumber"));
        assertNotNull(stored.get().getResponseJson());
        verify(history).logActivity(eq(21), eq("CREATED"), anyString(), isNull(), eq("Pending"), eq(7));
    }

    @Test
    public void sameReceiptReplaysExactlyWithoutOldVersionRevalidationOrNewWrites() {
        var command = NceWorkspaceTestSupport.command("2026-10-06", List.of(link()));
        var first = service.create(command, List.of(), request);
        sample.setLastupdated(Timestamp.valueOf("2026-10-06 10:00:00.0"));
        analysis.setLastupdated(Timestamp.valueOf("2026-10-06 10:01:00.0"));
        var replay = service.create(command, List.of(), request);
        assertEquals(first, replay);
        verify(events, times(1)).save(any());
        verify(specimens, times(1)).save(any());
    }

    @Test
    public void changedSameKeyCommandCannotCreateOrReturnOtherOperation() {
        service.create(NceWorkspaceTestSupport.command("2026-10-06", List.of()), List.of(), request);
        assertThrows(NceWorkspaceException.class,
                () -> service.create(NceWorkspaceTestSupport.command("2026-10-07", List.of()), List.of(), request));
        assertThrows(NceWorkspaceException.class,
                () -> service.receipt(NceWorkspaceTestSupport.KEY, "ASSIGN", request));
        verify(events, times(1)).save(any());
    }

    @Test
    public void incorrectOwnerAnalysisOrChangedSpecimenIsRejectedBeforeReceiptClaim() {
        var changed = new LinkedSpecimen("1", "24-00001", NceWorkspaceTestSupport.VERSION, "1", "2026-10-06 10:00:00.0",
                "1", NceWorkspaceTestSupport.VERSION);
        assertThrows(NceWorkspaceException.class, () -> service
                .create(NceWorkspaceTestSupport.command("2026-10-06", List.of(changed)), List.of(), request));
        var other = new SampleItem();
        other.setId("2");
        other.setSample(sample);
        analysis.setSampleItem(other);
        assertThrows(NceWorkspaceException.class, () -> service
                .create(NceWorkspaceTestSupport.command("2026-10-06", List.of(link())), List.of(), request));
        verify(dao, never()).claim(any());
        verifyZeroInteractions(events, specimens, history);
    }

    @Test
    public void fullOwnerIncludesUnselectedAnalysisAndCannotBorrowOnlySelectedScope() {
        var outside = new TestSection();
        outside.setId("2");
        var other = new Analysis();
        other.setId("2");
        other.setSampleItem(item);
        other.setTest(analysis.getTest());
        other.setTestSection(outside);
        when(orders.loadExact("24-00001")).thenReturn(Optional.of(new SavedOrderReadDAO.Graph(sample, List.of(item),
                List.of(analysis, other), List.of(), List.of(), List.of())));
        assertThrows(AccessDeniedException.class, () -> service
                .create(NceWorkspaceTestSupport.command("2026-10-06", List.of(link())), List.of(), request));
        verify(dao, never()).claim(any());
    }

    @Test
    public void ownerMismatchAndUnavailableCategoryCannotMutate() {
        var wrong = new NceRegistrationCommand(NceWorkspaceTestSupport.KEY, "8", "2026-10-06", "1", null, "Description",
                null, null, null, "MAJOR", "1", null, List.of());
        assertThrows(AccessDeniedException.class, () -> service.create(wrong, List.of(), request));
        assertNull(request.getAttribute("nceCurrentUserId"));
        when(categories.get(1)).thenReturn(null);
        assertThrows(NceWorkspaceException.class,
                () -> service.create(NceWorkspaceTestSupport.command("2026-10-06", List.of()), List.of(), request));
        verify(dao, never()).claim(any());
    }

    @Test
    public void readbackIsTypedAndNotFoundNeverClaimsNoInflight() {
        var receipt = service.receipt(NceWorkspaceTestSupport.KEY, "CREATE", request);
        assertEquals("NOT_FOUND", receipt.outcome());
        assertEquals("CREATE", receipt.operation());
        assertNull(receipt.eventId());
        verifyZeroInteractions(events, specimens, history);
    }

    @Test
    public void notesForceCurrentEventVersionEvenWhenStatusUnchanged() {
        service.create(NceWorkspaceTestSupport.command("2026-10-06", List.of()), List.of(), request);
        stored.set(null);
        doAnswer(c -> {
            ((NcEvent) c.getArgument(0)).setLastupdated(Timestamp.valueOf("2026-10-06 10:00:00.0"));
            return null;
        }).when(dao).advanceVersion(any());
        var note = new NceActionCommand(NceWorkspaceTestSupport.KEY, "7", NceWorkspaceTestSupport.VERSION, "ADD_NOTE",
                "A note", null);
        var receipt = service.action("21", note, request);
        assertEquals("ADD_NOTE", receipt.operation());
        assertEquals("7", request.getAttribute("nceCurrentUserId"));
        assertEquals("Pending", receipt.statusCode());
        assertEquals("2026-10-06 10:00:00.0", receipt.lastupdated());
        verify(dao).advanceVersion(event);
        assertThrows(NceWorkspaceException.class,
                () -> service.action("21", new NceActionCommand(java.util.UUID.randomUUID().toString(), "7",
                        NceWorkspaceTestSupport.VERSION, "ADD_NOTE", "Late note", null), request));
    }

    @Test
    public void pagingUsesCurrentQueryAndPreservesRawCapaCompletedAndConfiguredKeys() {
        event = new NcEvent();
        event.setId(21);
        event.setStatus("CAPA");
        event.setReportingUnitId(1);
        event.setNceCategoryId(1);
        event.setLastupdated(Timestamp.valueOf(NceWorkspaceTestSupport.VERSION));
        when(dao.candidates(Set.of("1"))).thenReturn(List.of(event));
        var response = service.workspace(new NceWorkspaceQuery("", "CAPA", "1", "", 1, 25), request);
        assertEquals(1, response.paging().totalResults());
        assertEquals("CAPA", response.nceList().get(0).get("statusCode"));
        assertEquals("1", response.nceList().get(0).get("nceCategoryId"));
        assertFalse((Boolean) response.nceList().get(0).get("canAcknowledge"));
        assertEquals("nce.category.general", response.categories().get(0).displayKey());
        assertThrows(NceWorkspaceException.class,
                () -> service.workspace(new NceWorkspaceQuery("", "", "", "", 2, 25), request));
    }

    @Test
    public void lateScopeRevocationNeverCompletesReceipt() {
        doThrow(new AccessDeniedException("changed")).when(access).requireUnchanged(request, scope);
        assertThrows(AccessDeniedException.class,
                () -> service.create(NceWorkspaceTestSupport.command("2026-10-06", List.of()), List.of(), request));
        verify(dao, never()).complete(any(), anyInt(), anyString());
    }

    @Test
    public void registrationUnitsUseActualAddScopeWhileEffectiveReadScopeRemainsExplicit() {
        var read = new Scope(scope.actor(), scope.module(), Action.SELECT, List.of("5", "10"), Set.of("1", "2"), false);
        var add = new Scope(scope.actor(), scope.module(), Action.ADD, List.of("10"), Set.of("2"), false);
        when(access.bind(request, Action.SELECT)).thenReturn(read);
        when(access.forAction(request, read, Action.ADD)).thenReturn(add);
        var section = new TestSection();
        section.setId("2");
        when(sections.get("2")).thenReturn(section);
        when(sections.getUserLocalizedTesSectionName(section)).thenReturn("Authorized registration unit");
        var meta = service.meta(request);
        assertTrue(meta.canCreate());
        assertEquals(List.of("1", "2"), meta.effectiveScope().sectionIds());
        assertEquals(1, meta.reportingUnits().size());
        assertEquals("2", meta.reportingUnits().get(0).id());
        verify(sections, never()).get("1");
        verify(access).requireUnchanged(request, add);
        doThrow(new AccessDeniedException("no current add")).when(access).forAction(request, read, Action.ADD);
        var noAdd = service.meta(request);
        assertFalse(noAdd.canCreate());
        assertTrue(noAdd.reportingUnits().isEmpty());
        assertEquals("NCE_ADD_PERMISSION_DENIED", noAdd.createUnavailableReason());
    }
}

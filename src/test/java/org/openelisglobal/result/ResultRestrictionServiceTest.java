package org.openelisglobal.result;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.result.dao.*;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.*;
import org.openelisglobal.result.dao.ResultRestrictionDAO.AnalysisFacts;
import org.openelisglobal.result.dao.ResultRestrictionDAO.StatusFacts;
import org.openelisglobal.result.form.*;
import org.openelisglobal.result.form.ResultRestrictionResponse.FactState;
import org.openelisglobal.result.service.*;
import org.openelisglobal.result.service.ResultRestrictionAccess.*;
import org.openelisglobal.result.service.impl.ResultRestrictionServiceImpl;
import org.openelisglobal.sample.service.SpecimenLookupService;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public class ResultRestrictionServiceTest {
    private ResultRestrictionDAO dao;
    private OrdinaryResultSaveStateDAO states;
    private ResultRestrictionAccess access;
    private SpecimenLookupService lookups;
    private ResultRestrictionServiceImpl service;
    private IStatusService statuses;
    private MockHttpServletRequest request;
    private AnalysisFacts source;
    private IntakeState intake;
    private Scope results, reception;
    private ResultRestrictionRequest query;
    private Object factoryBefore;

 @Before public void setup() throws Exception {
  // Real Analysis date setters use the existing configuration lookup. Supply only
  // that date harness, preserving the production setters and every clinical case.
  factoryBefore = ReflectionTestUtils.getField(SpringContext.class, "factory");
  var factory = mock(AutowireCapableBeanFactory.class);
  var dates = mock(DefaultConfigurationProperties.class);
  when(dates.getPropertyValue(Property.DEFAULT_LANG_LOCALE)).thenReturn("zh-CN");
  when(dates.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("zh-CN");
  when(dates.getPropertyValue(Property.AmbiguousDateHolder)).thenReturn("X");
  when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(dates);
  ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
  dao=mock(ResultRestrictionDAO.class);states=mock(OrdinaryResultSaveStateDAO.class);access=mock(ResultRestrictionAccess.class);lookups=mock(SpecimenLookupService.class);statuses=mock(IStatusService.class);request=new MockHttpServletRequest();
  var ctor=ResultRestrictionActorGuard.BoundActor.class.getDeclaredConstructors()[0];ctor.setAccessible(true);
  var actor=(ResultRestrictionActorGuard.BoundActor)ctor.newInstance(null,null,"operator7","7",request.getSession(),0,Set.of());
  results=new Scope(actor,Phase.RESULTS,Action.SELECT,"5","actual-result-module",Set.of("8"),false);
  reception=new Scope(actor,Phase.RECEPTION,Action.SELECT,"4","actual-reception-module",Set.of("8"),false);
  when(access.forPhase(request,results,Phase.RECEPTION,Action.UPDATE)).thenReturn(new Scope(actor,Phase.RECEPTION,Action.UPDATE,"4","actual-reception-module",Set.of("8"),false));when(access.bind(request,Phase.RESULTS,Action.SELECT)).thenReturn(results);when(access.forPhase(request,results,Phase.RECEPTION,Action.SELECT)).thenReturn(reception);
  var ts=Timestamp.valueOf("2026-10-06 12:00:00.123");source=new AnalysisFacts("1","3","8","2","4","RAW-4",ts,ts,ts,"4","12",false,false,null,null,"9");
  query=new ResultRestrictionRequest("1","2","3","RAW-4",Long.toString(ts.getTime()));when(dao.findAnalysis("1")).thenReturn(Optional.of(source));
  when(dao.findStatus("12")).thenReturn(Optional.of(new StatusFacts("12","SAMPLE","12","SampleEntered","Y")));when(dao.findStatus("4")).thenReturn(Optional.of(new StatusFacts("4","ANALYSIS","4","Not Tested","Y")));
  when(statuses.getSampleStatusForID("12")).thenReturn(SampleStatus.Entered);when(statuses.getAnalysisStatusForID("4")).thenReturn(AnalysisStatus.NotStarted);
  int next=100;for(var s:SampleStatus.values())when(statuses.getStatusID(s)).thenReturn(s==SampleStatus.Entered?"12":Integer.toString(next++));
  for(var a:AnalysisStatus.values())when(statuses.getStatusID(a)).thenReturn(a==AnalysisStatus.NotStarted?"4":Integer.toString(next++));
  when(states.findSpecimenState("1")).thenReturn(new SpecimenState("1","3","2","4","12",false,false));when(states.findState("1")).thenReturn(new State("1","4",null,null));
  var tube=new IntakeTube("2","4","RAW-4","2026-10-06T00:00:00Z","6",true,null,null,"2026-10-06 12:00:00.123",null,null,"H","H");
  var req=new IntakeRequest("5","4","2","6",SampleTypeRequest.Status.COLLECTED,"3","2026-10-06 12:00:00.123");
  intake=new IntakeState(tube,List.of("7"),List.of(req),List.of(new IntakeTest("1","3","Y")),List.of());when(states.findIntakeState("2")).thenReturn(intake);
  when(lookups.lookup("RAW-4.9",request)).thenReturn(lookup("2","5"));
  service=new ResultRestrictionServiceImpl(dao,states,access,statuses,new ResultSpecimenAvailabilityService(states,statuses),lookups);
  TransactionSynchronizationManager.setActualTransactionActive(true);TransactionSynchronizationManager.initSynchronization();
 }

    @After
    public void close() {
        TransactionSynchronizationManager.clear();
        ReflectionTestUtils.setField(SpringContext.class, "factory", factoryBefore);
    }

    private SpecimenLookupService.Result lookup(String item, String rid) {
        var p = new SpecimenLookupService.PhysicalSpecimen(item, rid, "9", "6", "12", false, false, null, null,
                "MISSING", null, null, null, null, null);
        var r = new SpecimenLookupService.RequestedSpecimen(rid, "6", "Actual type", "COLLECTED", item);
        var current = new SpecimenLookupService.Current("4", "RAW-4", "1", false, null, List.of(r), List.of(p), null);
        return new SpecimenLookupService.Result(1, "specimen_lookup", true, "specimen",
                new SpecimenLookupService.Selection("4", item, rid), current, "2026-10-06T00:00:00Z");
    }

    @Test
    public void missingFactsRetainExistingRestrictionAndRealRoundtripIdentity() {
        var dto = service.inspect(query, request);
        assertEquals("error.results.specimenIntakeMissing", dto.blockedReason());
        assertEquals(FactState.MISSING, dto.facts().collection().state());
        assertEquals(FactState.MISSING, dto.facts().receipt().state());
        assertEquals(FactState.MISSING, dto.facts().acceptance().state());
        assertTrue(dto.canOpenIntake());
        assertTrue(dto.canEditIntake());
        assertNull(dto.intakeEditUnavailableReason());
        assertEquals("RAW-4.9", dto.target().lookupCode());
        assertEquals("5", dto.target().requestId());
        assertTrue(dto.readOnly());
        assertEquals("7", request.getAttribute("resultRestrictionCurrentUserId"));
        verify(states, never()).flush();
    }

    @Test
    public void wrongRawNumberItemAndTestFailBeforeIntakeRead() {
        for (var q : List.of(new ResultRestrictionRequest("1", "2", "3", "raw-4", query.analysisLastupdated()),
                new ResultRestrictionRequest("1", "9", "3", "RAW-4", query.analysisLastupdated()),
                new ResultRestrictionRequest("1", "2", "9", "RAW-4", query.analysisLastupdated()))) {
            assertEquals(409,
                    assertThrows(ResultRestrictionException.class, () -> service.inspect(q, request)).status());
        }
        verify(states, never()).findIntakeState(anyString());
        verifyZeroInteractions(lookups);
    }

    @Test
    public void staleVersionAndMissingAnalysisHaveExactErrors() {
        assertEquals("RESULT_RESTRICTION_VERSION_CHANGED",
                assertThrows(ResultRestrictionException.class,
                        () -> service.inspect(new ResultRestrictionRequest("1", "2", "3", "RAW-4", "0"), request))
                        .code());
        when(dao.findAnalysis("1")).thenReturn(Optional.empty());
        assertEquals(404,
                assertThrows(ResultRestrictionException.class, () -> service.inspect(query, request)).status());
    }

    @Test
    public void receptionLossKeepsAuthorizedResultFactsWithoutTarget() {
        doThrow(new AccessDeniedException("revoked")).when(access).forPhase(request, results, Phase.RECEPTION,
                Action.SELECT);
        var d = service.inspect(query, request);
        assertFalse(d.canOpenIntake());
        assertFalse(d.canEditIntake());
        assertEquals("RECEPTION_PERMISSION_REQUIRED", d.intakeEditUnavailableReason());
        assertEquals("RECEPTION_PERMISSION_REQUIRED", d.actionUnavailableReason());
        assertNull(d.intakeLookup());
        verifyZeroInteractions(lookups);
    }

    @Test
    public void wholeOrderScopeLossDoesNotLeakLookupPatient() {
        doThrow(new AccessDeniedException("outside whole order")).when(lookups).lookup("RAW-4.9", request);
        var d = service.inspect(query, request);
        assertEquals("ORDER_SCOPE_DENIED", d.actionUnavailableReason());
        assertNull(d.target());
        assertNull(d.intakeLookup());
        assertEquals("4", d.identity().sampleId());
    }

 @Test public void neighbouringTubeAndRequestCannotBecomeTarget(){when(lookups.lookup("RAW-4.9",request)).thenReturn(lookup("99","5"));assertFalse(service.inspect(query,request).canOpenIntake());when(lookups.lookup("RAW-4.9",request)).thenReturn(lookup("2","99"));assertEquals("TARGET_STATE_CONFLICT",service.inspect(query,request).actionUnavailableReason());var valid=lookup("2","5");var good=valid.current().physicalSpecimens().get(0);var duplicate=lookup("2","99").current().physicalSpecimens().get(0);var c=valid.current();var current=new SpecimenLookupService.Current(c.sampleId(),c.labNo(),c.orderStatusId(),c.patientMasked(),c.patient(),c.requestedSpecimens(),List.of(good,duplicate),c.intakeReasons());when(lookups.lookup("RAW-4.9",request)).thenReturn(new SpecimenLookupService.Result(valid.version(),valid.source(),true,"specimen",valid.selection(),current,valid.generatedAt()));assertEquals("TARGET_STATE_CONFLICT",service.inspect(query,request).actionUnavailableReason());}

    @Test
    public void ambiguousRequestNeverChoosesFirstOrOpensIntake() {
        var r = intake.requests().get(0);
        when(states.findIntakeState("2")).thenReturn(
                new IntakeState(intake.tube(), intake.patients(), List.of(r, r), intake.tests(), List.of()));
        var d = service.inspect(query, request);
        assertEquals(FactState.INCONSISTENT, d.facts().request().state());
        assertNull(d.facts().request().id());
        assertTrue(d.diagnosticCodes().contains("REQUEST_LINK_AMBIGUOUS"));
        assertFalse(d.canOpenIntake());
        verifyZeroInteractions(lookups);
    }

 @Test public void wrongStatusCategoryNeverUsesCachedSampleSemantic(){when(dao.findStatus("12")).thenReturn(Optional.of(new StatusFacts("12","ORDER","12","Test Entered","Y")));var d=service.inspect(query,request);assertFalse(d.specimenStatus().known());assertNull(d.specimenStatus().statusCode());assertEquals("ORDER",d.specimenStatus().actualStatusType());assertTrue(d.diagnosticCodes().contains("SPECIMEN_STATUS_CATEGORY_MISMATCH"));}

    @Test
    public void maskedClinicalScopeCannotExposeIntakePayload() {
        var masked = new Scope(results.actor(), Phase.RESULTS, Action.SELECT, "5", "actual-result-module", Set.of("8"),
                true);
        when(access.bind(request, Phase.RESULTS, Action.SELECT)).thenReturn(masked);
        var d = service.inspect(query, request);
        assertEquals("CLINICAL_DATA_MASKED", d.actionUnavailableReason());
        assertNull(d.target());
        verifyZeroInteractions(lookups);
    }

    @Test
    public void lateAnalysisChangeAndLateAuthorizationLossAreRejected() {
        var changed = new AnalysisFacts("1", "3", "8", "99", "4", "RAW-4", source.analysisVersion(),
                source.sampleVersion(), source.itemVersion(), "4", "12", false, false, null, null, "9");
        when(dao.findAnalysis("1")).thenReturn(Optional.of(source), Optional.of(changed));
        assertEquals(409,
                assertThrows(ResultRestrictionException.class, () -> service.inspect(query, request)).status());
        when(dao.findAnalysis("1")).thenReturn(Optional.of(source));
        doThrow(new AccessDeniedException("same session revoked grant")).when(access).requireUnchanged(request,
                results);
        assertThrows(AccessDeniedException.class, () -> service.inspect(query, request));
    }

    @Test
    public void realLookupUnavailableDoesNotPretendNoRecords() {
        doThrow(new SpecimenLookupService.Failure(503, "SPECIMEN_LOOKUP_UNAVAILABLE", "private DB detail"))
                .when(lookups).lookup("RAW-4.9", request);
        assertEquals(503,
                assertThrows(ResultRestrictionException.class, () -> service.inspect(query, request)).status());
    }

    @Test
    public void selectOnlyIntakeKeepsReadTargetButCannotEdit() {
        doThrow(new AccessDeniedException("UPDATE revoked")).when(access).forPhase(request, results, Phase.RECEPTION,
                Action.UPDATE);
        var d = service.inspect(query, request);
        assertTrue(d.canOpenIntake());
        assertFalse(d.canEditIntake());
        assertEquals("RECEPTION_UPDATE_PERMISSION_REQUIRED", d.intakeEditUnavailableReason());
        assertNotNull(d.target());
        assertNotNull(d.intakeLookup());
    }

    @Test
    public void persistedStatusNameActiveAndCategoryMustAgreeWithCachedSemantic() {
        for (var actual : List.of(new StatusFacts("12", "SAMPLE", "12", "Unknown current name", "Y"),
                new StatusFacts("12", "SAMPLE", "12", "Sample Rejected", "Y"),
                new StatusFacts("12", "SAMPLE", "12", "SampleEntered", "N"))) {
            when(dao.findStatus("12")).thenReturn(Optional.of(actual));
            var d = service.inspect(query, request);
            assertFalse(d.specimenStatus().known());
            assertNull(d.specimenStatus().statusCode());
            assertEquals(actual.name(), d.specimenStatus().statusName());
            assertTrue(d.diagnosticCodes().contains("SPECIMEN_STATUS_UNKNOWN"));
        }
    }

 @Test public void numericStatusCodeIsNeverUsedAsSemanticAlias(){when(dao.findStatus("12")).thenReturn(Optional.of(new StatusFacts("12","SAMPLE","999","SampleEntered","Y")));assertEquals("Entered",service.inspect(query,request).specimenStatus().statusCode());when(dao.findStatus("4")).thenReturn(Optional.of(new StatusFacts("4","ANALYSIS","4","Technical Acceptance","Y")));assertFalse(service.inspect(query,request).analysisStatus().known());}
}

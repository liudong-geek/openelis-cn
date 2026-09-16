package org.openelisglobal.resultvalidation.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.service.ResultIntakeAdmissionTest;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.resultvalidation.dao.ReviewSaveStateDAO;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

/**
 * SIM locked-state boundary tests; database lock behaviour is covered
 * separately.
 */
public class ReviewWriteGuardTest {
    private Object oldFactory;
    OrdinaryResultSaveStateDAO specimens;
    ReviewSaveStateDAO states;
    UserService users;
    ReviewWriteGuard guard;
    Analysis analysis;
    AnalysisItem row;
    Result result;
    IStatusService statuses;
    DefaultConfigurationProperties configuration;
    static final Timestamp TIME = Timestamp.valueOf("2026-09-01 01:02:03.123456");

    @Before
    public void setup() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager
                .setCurrentTransactionIsolationLevel(java.sql.Connection.TRANSACTION_SERIALIZABLE);
        specimens = mock(OrdinaryResultSaveStateDAO.class);
        states = mock(ReviewSaveStateDAO.class);
        users = mock(UserService.class);
        statuses = mock(IStatusService.class);
        configuration = mock(DefaultConfigurationProperties.class);
        oldFactory = org.springframework.test.util.ReflectionTestUtils
                .getField(org.openelisglobal.spring.util.SpringContext.class, "factory");
        var factory = mock(org.springframework.beans.factory.config.AutowireCapableBeanFactory.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(configuration);
        when(configuration
                .getPropertyValue(org.openelisglobal.common.util.ConfigurationProperties.Property.AmbiguousDateHolder))
                .thenReturn("X");
        when(configuration
                .getPropertyValue(org.openelisglobal.common.util.ConfigurationProperties.Property.DEFAULT_LANG_LOCALE))
                .thenReturn("en");
        org.springframework.test.util.ReflectionTestUtils.setField(org.openelisglobal.spring.util.SpringContext.class,
                "factory", factory);
        when(statuses.getStatusID(AnalysisStatus.TechnicalAcceptance)).thenReturn("15");
        when(statuses.getStatusID(AnalysisStatus.TechnicalRejected)).thenReturn("16");
        when(statuses.getStatusID(AnalysisStatus.Finalized)).thenReturn("20");
        when(statuses.getStatusID(AnalysisStatus.BiologistRejected)).thenReturn("21");
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("10");
        guard = new ReviewWriteGuard(specimens, states, users, statuses, configuration,
                mock(TestResultComponentService.class));
        Sample sample = new Sample();
        sample.setId("301");
        sample.setAccessionNumber("SIM-RESULT-301");
        SampleItem item = new SampleItem();
        item.setId("201");
        item.setSample(sample);
        item.setStatusId("10");
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        TestSection section = new TestSection();
        section.setId("501");
        analysis = new Analysis();
        analysis.setId("101");
        analysis.setTest(test);
        analysis.setSampleItem(item);
        analysis.setTestSection(section);
        analysis.setStatusId("15");
        analysis.setLastupdated(TIME);
        result = new Result();
        result.setId("601");
        result.setAnalysis(analysis);
        result.setResultType("N");
        result.setValue("5.2000");
        result.setLastupdated(TIME);
        when(states.analysis("101")).thenReturn(state("15", false, false));
        when(states.lockResults("101")).thenReturn(List.of(result));
        when(states.members("101")).thenReturn(List.of(member("601", "5.2000")));
        when(specimens.lockSpecimen("201")).thenReturn(item);
        when(specimens.lockAnalysis("101")).thenReturn(analysis);
        when(specimens.findSpecimenState("101")).thenReturn(
                new OrdinaryResultSaveStateDAO.SpecimenState("101", "401", "201", "301", "10", false, false));
        ResultIntakeAdmissionTest.allow(specimens, "201", "101");
        when(users.filterAnalysesByLabUnitRoles(anyString(), anyList(), anyString())).thenReturn(List.of(analysis));
        row = new AnalysisItem();
        row.setAnalysisId("101");
        row.setSampleId("301");
        row.setSampleItemId("201");
        row.setTestId("401");
        row.setAccessionNumber("SIM-RESULT-301");
        row.setStatusId("15");
        row.setAnalysisLastupdated(String.valueOf(TIME.getTime()));
        row.setShowAcceptReject(true);
        row.setIsAccepted(true);
        row.setResultMembers(List
                .of(new AnalysisItem.ResultMember("601", "5.2000", "N", null, null, 0, TIME.toInstant().toString())));
    }

    @After
    public void cleanup() {
        org.springframework.test.util.ReflectionTestUtils.setField(org.openelisglobal.spring.util.SpringContext.class,
                "factory", oldFactory);
        TransactionSynchronizationManager.clear();
        if (TransactionSynchronizationManager.isSynchronizationActive())
            TransactionSynchronizationManager.clearSynchronization();
    }

    private ReviewSaveStateDAO.AnalysisState state(String status, boolean released, boolean printed) {
        return new ReviewSaveStateDAO.AnalysisState("101", "401", "201", "301", "SIM-RESULT-301", "501", status,
                String.valueOf(TIME.getTime()), released, printed);
    }

    private ReviewSaveStateDAO.Member member(String id, String value) {
        return new ReviewSaveStateDAO.Member(id, value, "N", null, null, 0, TIME.toInstant().toString());
    }

    private void denied(int status) {
        assertEquals(status, assertThrows(ResponseStatusException.class, () -> guard.begin("801", List.of(row)))
                .getStatusCode().value());
    }

    @Test
    public void currentAcceptedTubeLocksBeforeReadingCompleteResultSet() {
        var locked = guard.begin("801", List.of(row));
        assertSame(analysis, locked.analyses().get("101"));
        var order = inOrder(specimens, states);
        order.verify(specimens).lockSpecimen("201");
        order.verify(specimens).lockAnalysis("101");
        order.verify(states).lockResults("101");
        assertEquals("15", analysis.getStatusId());
        assertEquals("5.2000", result.getValue());
    }

    @Test
    public void missingTransactionOrWeakerIsolationIsRejected() {
        TransactionSynchronizationManager.setActualTransactionActive(false);
        denied(409);
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager
                .setCurrentTransactionIsolationLevel(java.sql.Connection.TRANSACTION_READ_COMMITTED);
        denied(409);
    }

    @Test
    public void reviewedReleasedOrPrintedSourcesCannotBeReopened() {
        for (var source : List.of(state("20", false, false), state("15", true, false), state("15", false, true))) {
            when(states.analysis("101")).thenReturn(source);
            denied(409);
        }
    }

    @Test public void sourceChangedWhileAcquiringLockIsRejected() {
        when(states.analysis("101")).thenReturn(state("15", false, false), state("20", true, false)); denied(409);
    }

    @Test public void resultChangedWithoutAnalysisVersionChangeIsRejected() {
        when(states.members("101")).thenReturn(List.of(member("601", "7.6000"))); denied(409);
    }

    @Test public void newDeletedOrReparentedMemberIsRejected() {
        when(states.members("101")).thenReturn(List.of(member("601", "5.2000"), member("602", "new"))); denied(409);
        when(states.members("101")).thenReturn(List.of()); denied(409);
        when(states.members("101")).thenReturn(List.of(new ReviewSaveStateDAO.Member("601", "5.2000", "N", null,
                "999", 0, TIME.toInstant().toString()))); denied(409);
    }

    @Test public void unseenResultVersionEvenWithSameValueIsRejected() {
        when(states.members("101")).thenReturn(List.of(new ReviewSaveStateDAO.Member("601", "5.2000", "N", null,
                null, 0, "2026-09-02T01:00:00Z"))); denied(409);
    }

    @Test public void missingReceiptAndRevokedRoleAreRejected() {
        when(specimens.findIntakeState("201")).thenReturn(null); denied(409);
        ResultIntakeAdmissionTest.allow(specimens, "201", "101");
        when(users.filterAnalysesByLabUnitRoles(anyString(), anyList(), anyString())).thenReturn(List.of()); denied(403);
    }

    @Test
    public void returnReasonAndConsistentComponentDecisionAreRequired() {
        row.setIsAccepted(false);
        row.setIsRejected(true);
        row.setNote("  ");
        denied(400);
        row.setNote("模拟溶血，退回复检");
        guard.begin("801", List.of(row));
        AnalysisItem other = org.apache.commons.lang3.SerializationUtils.clone(row);
        other.setIsAccepted(true);
        other.setIsRejected(false);
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> guard.begin("801", List.of(row, other)))
                .getStatusCode().value());
    }

    @Test
    public void partialComponentAndReadOnlySelectionAreRejected() {
        AnalysisItem other = org.apache.commons.lang3.SerializationUtils.clone(row);
        other.setIsAccepted(false);
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> guard.begin("801", List.of(row, other)))
                .getStatusCode().value());
        row.setReadOnly(true);
        denied(400);
    }

    @Test
    public void actualSectionCannotBeSubstitutedByTestCatalogSection() {
        analysis.setTestSection(new TestSection());
        denied(409);
    }

    @Test
    public void beforeCommitClosureRechecksPermissionAndExactEvidence() {
        var locked = guard.begin("801", List.of(row));
        when(users.filterAnalysesByLabUnitRoles(anyString(), anyList(), anyString())).thenReturn(List.of());
        assertEquals(403, assertThrows(ResponseStatusException.class, locked.verifyResultsAndAccess()::run)
                .getStatusCode().value());
        when(users.filterAnalysesByLabUnitRoles(anyString(), anyList(), anyString())).thenReturn(List.of(analysis));
        result.setValue("wrong");
        assertEquals(409, assertThrows(ResponseStatusException.class, locked.verifyResultsAndAccess()::run)
                .getStatusCode().value());
    }

    @Test
    public void technicalRejectionsRequireExistingSiteConfiguration() {
        analysis.setStatusId("16");
        row.setStatusId("16");
        when(states.analysis("101")).thenReturn(state("16", false, false));
        denied(409);
        when(configuration.getPropertyValue(
                org.openelisglobal.common.util.ConfigurationProperties.Property.VALIDATE_REJECTED_TESTS))
                .thenReturn("true");
        guard.begin("801", List.of(row));
    }
}

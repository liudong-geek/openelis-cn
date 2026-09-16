package org.openelisglobal.report.service.impl;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.report.dao.ReportDocumentDAO;
import org.openelisglobal.report.form.ReportGroupingRules;
import org.openelisglobal.report.service.ReportGroupingConfigurationService;
import org.openelisglobal.report.valueholder.ReportDocument;
import org.openelisglobal.report.valueholder.ReportDocumentMember;
import org.openelisglobal.reports.service.ReportAnalysisAuthorizationService;
import org.openelisglobal.reports.service.ReportScopeDefinition;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.springframework.security.access.AccessDeniedException;

@RunWith(MockitoJUnitRunner.Silent.class)
public class ReportDocumentServiceImplTest {
    @Mock
    private ReportDocumentDAO documents;
    @Mock
    private ReportGroupingConfigurationService configuration;
    @Mock
    private SampleService samples;
    @Mock
    private SampleHumanService sampleHumans;
    @Mock
    private AnalysisService analyses;
    @Mock
    private ReportAnalysisAuthorizationService authorization;
    @InjectMocks
    private ReportDocumentServiceImpl service;

    @Before
    public void setup() {
        var sample = new Sample();
        sample.setId("301");
        var patient = new Patient();
        patient.setId("101");
        when(samples.get("301")).thenReturn(sample);
        when(sampleHumans.getPatientForSample(sample)).thenReturn(patient);
        when(configuration.getRules()).thenReturn(new ReportGroupingRules("SIM-1",
                List.of(new ReportGroupingRules.Group("SIM-CHEM", "SIM chemistry", List.of("11", "12")),
                        new ReportGroupingRules.Group("SIM-HEM", "SIM hematology", List.of("20")))));
        when(analyses.getAnalysesBySampleId("301"))
                .thenReturn(List.of(analysis("402", "12"), analysis("401", "11"), analysis("403", "20")));
        when(documents.insert(any())).thenAnswer(invocation -> {
            ReportDocument value = invocation.getArgument(0);
            value.setId("201");
            return "201";
        });
    }

    @Test
    public void configuredGroupSelectsAllMatchingAnalysesAndNeverOtherGroup() {
        var created = service.prepare("301", "SIM-CHEM", "7");
        assertEquals(List.of("401", "402"), created.analysisIds());
        assertEquals("301", created.sampleId());
        assertEquals("101", created.patientId());
        assertEquals("SIM-CHEM", created.groupKey());
        assertEquals("SIM-1", created.ruleVersion());
        verify(authorization, times(2)).authorizeExplicitScope(
                new ReportScopeDefinition("101", "301", "SIM-CHEM", "SIM-1", List.of("401", "402")), "7");
        verify(documents, times(2)).insertMember(any());
    }

    @Test
    public void accessionTextCannotChooseAnotherApplication() {
        assertThrows(IllegalArgumentException.class, () -> service.prepare("SIM-301", "SIM-CHEM", "7"));
        verify(documents, never()).insert(any());
    }

    @Test
    public void unknownOrEmptyConfiguredGroupCannotCreateDocument() {
        assertThrows(IllegalArgumentException.class, () -> service.prepare("301", "CLIENT-SELECTED", "7"));
        when(analyses.getAnalysesBySampleId("301")).thenReturn(List.of(analysis("403", "20")));
        assertThrows(IllegalArgumentException.class, () -> service.prepare("301", "SIM-CHEM", "7"));
        verify(documents, never()).insert(any());
    }

    @Test
    public void unauthorizedMemberRejectsWholeDocumentBeforeTakingWriteLock() {
        doThrow(new AccessDeniedException("member denied")).when(authorization).authorizeExplicitScope(any(),
                anyString());
        assertThrows(AccessDeniedException.class, () -> service.prepare("301", "SIM-CHEM", "7"));
        verify(documents, never()).lockSample(any());
        verify(documents, never()).insert(any());
    }

    @Test
    public void authorizationIsRepeatedAfterApplicationLockBeforeAnyWrite() {
        doNothing().doThrow(new AccessDeniedException("revoked")).when(authorization).authorizeExplicitScope(any(),
                anyString());
        assertThrows(AccessDeniedException.class, () -> service.prepare("301", "SIM-CHEM", "7"));
        verify(documents).lockSample("301");
        verify(documents, never()).insert(any());
    }

    @Test
    public void repeatedPreparePreservesStableNumberAndMembers() {
        var persisted = document("SIM-1", List.of("401", "402"));
        when(documents.findBySampleAndGroup("301", "SIM-CHEM")).thenReturn(persisted);
        var result = service.prepare("301", "SIM-CHEM", "7");
        assertEquals("BG-PERSISTED", result.reportNumber());
        assertEquals("201", result.id());
        verify(documents, never()).insert(any());
        verify(documents, never()).insertMember(any());
    }

    @Test
    public void laterAddedTestDoesNotSilentlyChangeExistingMembership() {
        var persisted = document("SIM-1", List.of("401"));
        when(documents.findBySampleAndGroup("301", "SIM-CHEM")).thenReturn(persisted);
        assertThrows(IllegalStateException.class, () -> service.prepare("301", "SIM-CHEM", "7"));
        assertEquals(1, persisted.getMembers().size());
        verify(documents, never()).insertMember(any());
    }

    @Test public void newRuleVersionDoesNotOverwriteOldDocumentEvenWithSameMembers() {
        when(documents.findBySampleAndGroup("301", "SIM-CHEM")).thenReturn(document("SIM-OLD", List.of("401", "402")));
        assertThrows(IllegalStateException.class, () -> service.prepare("301", "SIM-CHEM", "7"));
        verify(documents, never()).update(any());
    }

    @Test public void draftPreparationLocksAndRevalidatesMembership() {
        when(documents.getWithMembers("201", true)).thenReturn(document("SIM-1", List.of("401", "402")));
        var result = service.lockCurrent("201", "7");
        assertEquals(List.of("401", "402"), result.analysisIds());
        verify(documents).getWithMembers("201", true);
        verify(authorization, times(2)).authorizeExplicitScope(any(), anyString());
    }

    @Test public void historyAuthorizationUsesPersistedFullMembersWithoutCurrentConfig() {
        when(documents.getWithMembers("201", false)).thenReturn(document("SIM-OLD", List.of("401", "402")));
        assertEquals("SIM-OLD", service.authorizedScope("201", "7").ruleVersion());
        verify(configuration, never()).getRules();
        verify(authorization).authorizeExplicitScope(new ReportScopeDefinition("101", "301", "SIM-CHEM", "SIM-OLD", List.of("401", "402")), "7");
    }

    @Test public void duplicateAnalysisProjectionCannotCreateIncompleteMemberSet() {
        when(analyses.getAnalysesBySampleId("301")).thenReturn(List.of(analysis("401", "11"), analysis("401", "11")));
        assertThrows(IllegalStateException.class, () -> service.prepare("301", "SIM-CHEM", "7"));
        verify(documents, never()).insert(any());
    }

    @Test
    public void historicalMembershipAuthorizesFrozenMembersRatherThanLaterCurrentMembers() {
        var changedCurrent = document("SIM-1", List.of("999"));
        when(documents.getWithMembers("201", false)).thenReturn(changedCurrent);
        var frozen = new ReportScopeDefinition("101", "301", "SIM-CHEM", "SIM-1", List.of("401", "402"));
        var result = service.authorizePersistedScope("201", frozen, "7", false);
        assertEquals(List.of("401", "402"), result.analysisIds());
        verify(authorization).authorizeExplicitScope(frozen, "7");
        verify(configuration, never()).getRules();
    }

    @Test
    public void frozenMembershipCannotBorrowAnotherApplicationDocument() {
        when(documents.getWithMembers("201", false)).thenReturn(document("SIM-1", List.of("401", "402")));
        var foreign = new ReportScopeDefinition("101", "302", "SIM-CHEM", "SIM-1", List.of("401", "402"));
        assertThrows(IllegalStateException.class, () -> service.authorizePersistedScope("201", foreign, "7", false));
        verify(authorization, never()).authorizeExplicitScope(any(), anyString());
    }

    private Analysis analysis(String id, String testId) {
        Analysis analysis = new Analysis();
        analysis.setId(id);
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId(testId);
        analysis.setTest(test);
        return analysis;
    }

    private ReportDocument document(String version, List<String> ids) {
        var document = new ReportDocument();
        document.setId("201");
        document.setPatientId("101");
        document.setSampleId("301");
        document.setReportGroupKey("SIM-CHEM");
        document.setGroupRuleVersion(version);
        document.setReportNumber("BG-PERSISTED");
        document.setMembers(ids.stream().map(id -> {
            var member = new ReportDocumentMember();
            member.setDocument(document);
            member.setAnalysisId(id);
            return member;
        }).toList());
        return document;
    }
}

package org.openelisglobal.analyzerresults.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import org.hibernate.ObjectNotFoundException;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.analyzerresults.action.beanitems.AnalyzerResultItem;
import org.openelisglobal.analyzerresults.valueholder.AnalyzerResults;
import org.openelisglobal.analyzerresults.valueholder.SampleGrouping;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Exercises the real acceptance entry point. Entity construction is recorded at
 * the existing grouping seam; the database boundary supplies original
 * identities. No QC identity may reach clinical construction or staging
 * cleanup.
 */
public class AnalyzerResultsAcceptQCBoundaryTest {
    private static final String USER = "42";
    private Object oldFactory;
    private AnalyzerResultsService originals;
    private AnalyzerResultsAcceptServiceImpl service;
    private List<AnalyzerResultItem> clinicalCandidates;

    @Before
    public void setup() {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class);
        when(factory.getBean(DefaultConfigurationProperties.class))
                .thenReturn(mock(DefaultConfigurationProperties.class));
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        originals = mock(AnalyzerResultsService.class);
        service = spy(new AnalyzerResultsAcceptServiceImpl(mock(TypeOfSampleService.class)));
        ReflectionTestUtils.setField(service, "analyzerResultsService", originals);
        clinicalCandidates = new ArrayList<>();
        doAnswer(call -> {
            List<AnalyzerResultItem> items = call.getArgument(0);
            clinicalCandidates.addAll(items);
            List<SampleGrouping> groups = call.getArgument(1);
            groups.add(new SampleGrouping());
            return null;
        }).when(service).buildSampleGroupings(anyList(), anyList(), eq(USER));
    }

    @After
    public void restoreFactory() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
    }

    @Test
    public void forgedControlFlagsCannotEnterClinicalAcceptanceAlongsidePatient() {
        AnalyzerResultItem qc = accepted("700", 1);
        qc.setIsControl(false);
        qc.setReadOnly(false);
        AnalyzerResultItem patient = accepted("701", 2);
        stored("700", true);
        stored("701", false);

        service.acceptAndPersist(List.of(qc, patient), USER);

        assertEquals(List.of(patient), clinicalCandidates);
        assertCleanupIds("701");
        verify(originals).get("700");
        verify(originals).get("701");
    }

    @Test
    public void acceptedControlIsExcludedBeforeSpecimenHoldOrAnyClinicalWrite() {
        AnalyzerResultItem qc = accepted("700", 1);
        qc.setTypeOfSampleId(null);
        stored("700", true);

        service.acceptAndPersist(List.of(qc), USER);

        assertNoClinicalWrite();
        verify(originals).get("700");
        verify(originals, never()).update(org.mockito.ArgumentMatchers.any(AnalyzerResults.class));
    }

    @Test
    public void rejectedControlCannotCreateRejectedPatientResult() {
        AnalyzerResultItem qc = accepted("700", 1);
        qc.setIsAccepted(false);
        qc.setIsRejected(true);
        stored("700", true);

        service.acceptAndPersist(List.of(qc), USER);

        assertNoClinicalWrite();
    }

    @Test
    public void controlMarkedForDeletionIsExcludedWithoutBlockingPatient() {
        AnalyzerResultItem qc = accepted("700", 1);
        qc.setIsAccepted(false);
        qc.setIsDeleted(true);
        AnalyzerResultItem patient = accepted("701", 2);
        stored("700", true);
        stored("701", false);

        service.acceptAndPersist(List.of(qc, patient), USER);

        assertEquals(List.of(patient), clinicalCandidates);
        assertCleanupIds("701");
    }

    @Test
    public void adjacentUnselectedControlsAreNotPassedToPatientCleanup() {
        AnalyzerResultItem first = accepted("700", 1);
        first.setIsControl(true);
        first.setIsAccepted(false);
        AnalyzerResultItem patient = accepted("701", 2);
        AnalyzerResultItem last = accepted("702", 3);
        last.setIsControl(true);
        last.setIsAccepted(false);
        stored("700", true);
        stored("701", false);
        stored("702", true);

        service.acceptAndPersist(List.of(first, patient, last), USER);

        assertEquals(List.of(patient), clinicalCandidates);
        assertCleanupIds("701");
    }

    @Test
    public void manualFlagCannotBypassStoredControlIdentityButPatientStillWorks() {
        AnalyzerResultItem qc = accepted("700", 1);
        qc.setManual(true);
        AnalyzerResultItem patient = accepted("701", 2);
        patient.setManual(true);
        stored("700", true);
        stored("701", false);

        service.acceptAndPersist(List.of(qc, patient), USER);

        assertEquals(List.of(patient), clinicalCandidates);
        assertCleanupIds("701");
        assertTrue(patient.getManual());
    }

    @Test
    public void unavailableOriginalIdentityStopsBeforeAnyClinicalWrite() {
        AnalyzerResultItem item = accepted("700", 1);
        when(originals.get("700")).thenThrow(new ObjectNotFoundException("700", "AnalyzerResults"));

        assertThrows(ObjectNotFoundException.class, () -> service.acceptAndPersist(List.of(item), USER));

        assertNoClinicalWrite();
    }

    @Test
    public void existingManualRowWithoutStagingIdKeepsItsAcceptancePath() {
        AnalyzerResultItem manual = accepted(null, 1);
        manual.setManual(true);

        service.acceptAndPersist(List.of(manual), USER);

        assertEquals(List.of(manual), clinicalCandidates);
        verify(originals, never()).get(org.mockito.ArgumentMatchers.any());
        verify(originals).persistAnalyzerResults(anyList(), anyList(), eq(USER));
    }

    private void assertNoClinicalWrite() {
        assertTrue(clinicalCandidates.isEmpty());
        verify(service, never()).buildSampleGroupings(anyList(), anyList(), eq(USER));
        verify(originals, never()).persistAnalyzerResults(anyList(), anyList(), eq(USER));
    }

    private AnalyzerResultItem accepted(String id, int group) {
        AnalyzerResultItem item = new AnalyzerResultItem();
        item.setId(id);
        item.setSampleGroupingNumber(group);
        item.setAccessionNumber("PATIENT" + group);
        item.setTestId("123");
        item.setTypeOfSampleId("456");
        item.setResult("7.20");
        item.setIsAccepted(true);
        return item;
    }

    private void stored(String id, boolean control) {
        AnalyzerResults row = new AnalyzerResults();
        row.setId(id);
        row.setIsControl(control);
        when(originals.get(id)).thenReturn(row);
    }

    @SuppressWarnings({ "unchecked", "rawtypes" })
    private void assertCleanupIds(String... expected) {
        ArgumentCaptor<List<AnalyzerResults>> cleanup = ArgumentCaptor.forClass((Class) List.class);
        verify(originals).persistAnalyzerResults(cleanup.capture(), anyList(), eq(USER));
        assertEquals(List.of(expected), cleanup.getValue().stream().map(AnalyzerResults::getId).sorted().toList());
    }
}

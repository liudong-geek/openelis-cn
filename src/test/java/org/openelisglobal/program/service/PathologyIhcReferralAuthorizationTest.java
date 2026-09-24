package org.openelisglobal.program.service;

import static org.junit.Assert.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.program.controller.pathology.PathologySampleForm;
import org.openelisglobal.program.valueholder.Program;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample;
import org.openelisglobal.program.valueholder.pathology.PathologySample;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

public class PathologyIhcReferralAuthorizationTest {

    private PathologySampleServiceImpl service;
    private TestService tests;
    private TestSectionService sections;
    private ImmunohistochemistrySampleService ihcCases;
    private AnalysisService analyses;
    private TestSection ihcSection;
    private PathologySample pathologyCase;
    private Analysis pathologyAnalysis;
    private PathologySampleForm form;

    @Before
    public void setUp() {
        service = org.mockito.Mockito.spy(new PathologySampleServiceImpl());
        tests = mock(TestService.class);
        sections = mock(TestSectionService.class);
        ihcCases = mock(ImmunohistochemistrySampleService.class);
        analyses = mock(AnalysisService.class);
        ReflectionTestUtils.setField(service, "testService", tests);
        ReflectionTestUtils.setField(service, "testSectionService", sections);
        ReflectionTestUtils.setField(service, "immunohistochemistrySampleService", ihcCases);
        ReflectionTestUtils.setField(service, "analysisService", analyses);

        ihcSection = section("402");
        when(sections.getTestSectionByName(SpecialtyCaseWriteGuard.IMMUNOHISTOCHEMISTRY_SECTION))
                .thenReturn(ihcSection);
        Sample sample = new Sample();
        sample.setId("301");
        Program program = new Program();
        program.setProgramName("Pathology");
        pathologyCase = new PathologySample();
        pathologyCase.setId(51);
        pathologyCase.setSample(sample);
        pathologyCase.setProgram(program);
        SampleItem item = new SampleItem();
        item.setId("201");
        item.setSample(sample);
        pathologyAnalysis = new Analysis();
        pathologyAnalysis.setId("101");
        pathologyAnalysis.setSampleItem(item);
        form = new PathologySampleForm();
        form.setSystemUserId("11");
    }

    @Test
    public void referralRejectsTestFromAnotherSectionBeforeAnyMutation() {
        org.openelisglobal.test.valueholder.Test foreign = test("501", true, section("499"));
        when(tests.get("501")).thenReturn(foreign);
        form.setImmunoHistoChemistryTestIds(List.of("501"));

        assertThrows(AccessDeniedException.class, () -> invokeReferral());

        verifyZeroInteractions(ihcCases, analyses);
        verify(service, never()).createNewAnalysis(eq(foreign), eq(pathologyAnalysis), eq("Pathology"), eq("11"),
                eq(ihcSection));
    }

    @Test
    public void referralRejectsInactiveIhcTestBeforeAnyMutation() {
        org.openelisglobal.test.valueholder.Test inactive = test("502", false, ihcSection);
        when(tests.get("502")).thenReturn(inactive);
        form.setImmunoHistoChemistryTestIds(List.of("502"));

        assertThrows(AccessDeniedException.class, () -> invokeReferral());

        verifyZeroInteractions(ihcCases, analyses);
    }

    @Test
    public void repeatedReferralAndDuplicateIdsCreateTheAnalysisOnlyOnce() {
        org.openelisglobal.test.valueholder.Test marker = test("503", true, ihcSection);
        when(tests.get("503")).thenReturn(marker);
        form.setImmunoHistoChemistryTestIds(List.of("503", "503"));
        ImmunohistochemistrySample ihcCase = new ImmunohistochemistrySample();
        ihcCase.setId(61);
        when(ihcCases.getByPathologySampleId(51)).thenReturn(ihcCase);
        Analysis existing = existing(marker);
        when(analyses.getAnalysisBySampleItemAndTest("201", "503")).thenReturn(null, existing);
        doNothing().when(service).createNewAnalysis(marker, pathologyAnalysis, "Pathology", "11", ihcSection);

        invokeReferral();
        invokeReferral();

        verify(service).createNewAnalysis(marker, pathologyAnalysis, "Pathology", "11", ihcSection);
        verify(ihcCases, org.mockito.Mockito.times(2)).save(ihcCase);
    }

    @Test
    public void completedIhcCaseCannotReceiveANewMarker() {
        org.openelisglobal.test.valueholder.Test marker = test("504", true, ihcSection);
        when(tests.get("504")).thenReturn(marker);
        form.setImmunoHistoChemistryTestIds(List.of("504"));
        ImmunohistochemistrySample ihcCase = new ImmunohistochemistrySample();
        ihcCase.setId(61);
        ihcCase.setStatus(ImmunohistochemistrySample.ImmunohistochemistryStatus.COMPLETED);
        when(ihcCases.getByPathologySampleId(51)).thenReturn(ihcCase);
        when(analyses.getAnalysisBySampleItemAndTest("201", "504")).thenReturn(null);

        assertThrows(AccessDeniedException.class, () -> invokeReferral());

        verify(ihcCases, never()).save(any(ImmunohistochemistrySample.class));
        verify(service, never()).createNewAnalysis(eq(marker), eq(pathologyAnalysis), eq("Pathology"), eq("11"),
                eq(ihcSection));
        verify(analyses, never()).insert(any(Analysis.class));
    }

    private void invokeReferral() {
        ReflectionTestUtils.invokeMethod(service, "referToImmunoHistoChemistry", pathologyCase, form,
                List.of(pathologyAnalysis));
    }

    private Analysis existing(org.openelisglobal.test.valueholder.Test test) {
        Analysis existing = new Analysis();
        existing.setId("102");
        existing.setTest(test);
        existing.setSampleItem(pathologyAnalysis.getSampleItem());
        existing.setTestSection(ihcSection);
        return existing;
    }

    private org.openelisglobal.test.valueholder.Test test(String id, boolean active, TestSection section) {
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId(id);
        test.setIsActive(active ? "Y" : "N");
        test.setTestSection(section);
        return test;
    }

    private TestSection section(String id) {
        TestSection section = new TestSection();
        section.setId(id);
        return section;
    }
}

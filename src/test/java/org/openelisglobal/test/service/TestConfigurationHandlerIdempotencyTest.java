package org.openelisglobal.test.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.localization.service.LocalizationService;
import org.openelisglobal.localization.service.LocalizationValueService;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.openelisglobal.testterminology.service.TestTerminologyMappingService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.service.TypeOfSampleTestService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.unitofmeasure.service.UnitOfMeasureService;

@RunWith(MockitoJUnitRunner.class)
public class TestConfigurationHandlerIdempotencyTest {

    @Mock
    private TestService testService;

    @Mock
    private TestSectionService testSectionService;

    @Mock
    private LocalizationService localizationService;

    @Mock
    private LocalizationValueService localizationValueService;

    @Mock
    private TypeOfSampleService typeOfSampleService;

    @Mock
    private TypeOfSampleTestService typeOfSampleTestService;

    @Mock
    private UnitOfMeasureService unitOfMeasureService;

    @Mock
    private TestResultComponentService testResultComponentService;

    @Mock
    private TestTerminologyMappingService terminologyMappingService;

    @Mock
    private org.openelisglobal.test.valueholder.Test exactTest;

    @Mock
    private org.openelisglobal.test.valueholder.Test normalizedTest;

    @Mock
    private TestSection testSection;

    @Mock
    private TypeOfSample sampleType;

    @InjectMocks
    private TestConfigurationHandler handler;

    @Test
    public void findExistingTest_repeatImportUsesExactDescriptionBeforeAmbiguousNormalizedKey() {
        when(testService.getTestByDescription("LYM#(Whole Blood)")).thenReturn(exactTest);

        org.openelisglobal.test.valueholder.Test found = handler.findExistingTest("LYM#(Whole Blood)", new String[0],
                Collections.emptyMap());

        assertSame(exactTest, found);
        verify(testService, never()).getTestByNormalizedDescription(anyString());
    }

    @Test
    public void findExistingTest_distinctPercentAndAbsoluteAnalyzerCodesAreNotMerged() {
        when(testService.getTestByNormalizedDescription("LYM#(Whole Blood)")).thenReturn(normalizedTest);
        when(normalizedTest.getDescription()).thenReturn("LYM%(Whole Blood)");
        when(testService.getTestByNormalizedDescription("LYM%(Whole Blood)")).thenReturn(exactTest);
        when(exactTest.getDescription()).thenReturn("LYM#(Whole Blood)");

        org.openelisglobal.test.valueholder.Test absoluteFound = handler.findExistingTest("LYM#(Whole Blood)",
                new String[0], Collections.emptyMap());
        org.openelisglobal.test.valueholder.Test percentFound = handler.findExistingTest("LYM%(Whole Blood)",
                new String[0], Collections.emptyMap());

        assertNull(absoluteFound);
        assertNull(percentFound);
    }

    @Test
    public void findExistingTest_safeFormattingVariantStillSupportsExistingDataUpgrade() {
        when(testService.getTestByNormalizedDescription("Stat-Pak(Whole Blood)")).thenReturn(normalizedTest);
        when(normalizedTest.getDescription()).thenReturn("Stat PaK(Whole Blood)");

        org.openelisglobal.test.valueholder.Test found = handler.findExistingTest("Stat-Pak(Whole Blood)",
                new String[0], Map.of());

        assertSame(normalizedTest, found);
    }

    @Test
    public void processCsvLine_freshImportKeepsPercentAndAbsoluteTestsDistinctInEitherFileOrder() {
        Map<String, org.openelisglobal.test.valueholder.Test> storedTests = new LinkedHashMap<>();
        AtomicInteger nextId = new AtomicInteger(1);
        when(testSectionService.getTestSectionByName("Hematology")).thenReturn(testSection);
        when(typeOfSampleService.getAllTypeOfSamples()).thenReturn(List.of(sampleType));
        when(sampleType.getLocalizedName()).thenReturn("Whole Blood");
        when(sampleType.getId()).thenReturn("9");
        when(testService.getTestByDescription(anyString()))
                .thenAnswer(invocation -> storedTests.get(invocation.getArgument(0)));
        when(testService.getTestByNormalizedDescription(anyString()))
                .thenAnswer(invocation -> storedTests.values().stream().findFirst().orElse(null));
        when(localizationService.insert(any(Localization.class))).thenReturn("localization-id");
        when(testService.insert(any(org.openelisglobal.test.valueholder.Test.class))).thenAnswer(invocation -> {
            org.openelisglobal.test.valueholder.Test inserted = invocation.getArgument(0);
            storedTests.put(inserted.getDescription(), inserted);
            return String.valueOf(nextId.getAndIncrement());
        });
        when(typeOfSampleTestService.getTypeOfSampleTestsForTest(anyString())).thenReturn(Collections.emptyList());

        importAnalyzerPair(storedTests, "LYM%", "LYM#");
        importAnalyzerPair(storedTests, "LYM#", "LYM%");
    }

    @Test
    public void processConfiguration_rowPersistenceFailureAbortsFileBeforeBridgeWork() throws Exception {
        RuntimeException databaseFailure = new RuntimeException("database failure");
        when(testSectionService.getTestSectionByName("Hematology")).thenThrow(databaseFailure);

        String csv = "testName,testSection\nLYM#,Hematology\n";
        try {
            handler.processConfiguration(new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8)), "cbc.csv");
            fail("Expected the file import to fail atomically");
        } catch (IllegalStateException e) {
            assertSame(databaseFailure, e.getCause());
            assertTrue(e.getMessage().contains("line 2"));
        }

        verify(testResultComponentService, never()).syncPrimaryComponentFromLegacy(anyString(), anyString());
    }

    @Test
    public void processConfiguration_bridgePersistenceFailureIsPropagatedInsteadOfContinuingAbortedTransaction()
            throws Exception {
        RuntimeException databaseFailure = new RuntimeException("bridge database failure");
        when(testSectionService.getTestSectionByName("Hematology")).thenReturn(testSection);
        when(testService.getTestByDescription("Existing")).thenReturn(exactTest);
        when(exactTest.getId()).thenReturn("17");
        doThrow(databaseFailure).when(testResultComponentService).syncPrimaryComponentFromLegacy("17", "1");

        String csv = "testName,testSection\nExisting,Hematology\n";
        try {
            handler.processConfiguration(new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8)),
                    "existing.csv");
            fail("Expected bridge failure to roll back the file import");
        } catch (IllegalStateException e) {
            assertSame(databaseFailure, e.getCause());
            assertTrue(e.getMessage().contains("Failed to bridge test 17"));
        }

        verify(terminologyMappingService, never()).syncLegacyLoinc(anyString(), anyString(), anyString());
        verify(testService, never()).refreshTestNames();
    }

    private void importAnalyzerPair(Map<String, org.openelisglobal.test.valueholder.Test> storedTests,
            String firstCode, String secondCode) {
        storedTests.clear();

        processAnalyzerTest(firstCode);
        processAnalyzerTest(secondCode);

        org.openelisglobal.test.valueholder.Test percent = storedTests.get("LYM%(Whole Blood)");
        org.openelisglobal.test.valueholder.Test absolute = storedTests.get("LYM#(Whole Blood)");
        assertEquals(2, storedTests.size());
        assertTrue(percent != null);
        assertTrue(absolute != null);
        assertTrue(percent != absolute);
        assertTrue(!percent.getId().equals(absolute.getId()));
    }

    private void processAnalyzerTest(String code) {
        handler.processCsvLine(new String[] { code, "Hematology", "Whole Blood" }, 0, 1, 2, -1, -1, -1, -1,
                -1, Collections.emptyMap(), 2, "horiba.csv", 1);
    }
}

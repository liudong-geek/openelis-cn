package org.openelisglobal.audittrail.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Predicate;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.audittrail.service.AuditEntitySnapshotService;
import org.openelisglobal.audittrail.valueholder.History;
import org.openelisglobal.history.service.HistoryService;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.owasp.encoder.Encode;
import org.springframework.context.support.StaticMessageSource;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Tests final API/export contracts, rather than only parsing the stored XML.
 */
public class ConfigurationNameAuditReadContractTest {
    private static final String LOCALIZATION_TABLE_ID = "216";
    private static final String SAMPLE_TYPE_TABLE_ID = "34";
    private static final String TEST_TABLE_ID = "4";
    private SystemAuditEventRestController controller;
    private HistoryService histories;
    private AuditEntitySnapshotService snapshots;
    private Object originalMessages;
    private List<History> candidates = List.of();
    private PatientService patients;

    @Before
    public void setUp() {
        controller = new SystemAuditEventRestController();
        histories = mock(HistoryService.class);
        snapshots = mock(AuditEntitySnapshotService.class);
        ReferenceTablesService references = mock(ReferenceTablesService.class);
        when(references.getReferenceTableByName("LOCALIZATION")).thenReturn(reference(LOCALIZATION_TABLE_ID));
        when(references.getReferenceTableByName("TEST")).thenReturn(reference(TEST_TABLE_ID));
        when(references.getReferenceTableByName("TYPE_OF_SAMPLE")).thenReturn(reference(SAMPLE_TYPE_TABLE_ID));
        ReflectionTestUtils.setField(controller, "historyService", histories);
        ReflectionTestUtils.setField(controller, "snapshotService", snapshots);
        ReflectionTestUtils.setField(controller, "referenceTablesService", references);
        ReflectionTestUtils.setField(controller, "systemUserService", mock(SystemUserService.class));
        patients = mock(PatientService.class);
        ReflectionTestUtils.setField(controller, "patientService", patients);
        for (String name : List.of("PANEL", "TEST_SECTION", "PATIENT", "PERSON"))
            when(references.getReferenceTableByName(name)).thenReturn(reference(Map.of("PANEL", "14", "TEST_SECTION", "13", "PATIENT", "15", "PERSON", "16").get(name)));
        ReflectionTestUtils.invokeMethod(controller, "initRefTableCache");
        when(histories.scanSystemEventHistory(any(), any(), any(), anyList(), any(), any(), anyLong(), anyInt(), anyBoolean()))
                .thenAnswer(call -> {
                    Predicate<History> matches = call.getArgument(5);
                    long offset = call.getArgument(6);
                    int limit = call.getArgument(7);
                    boolean countAll = call.getArgument(8);
                    List<History> matched = candidates.stream().filter(matches).toList();
                    int from = (int) Math.min(offset, matched.size());
                    int to = Math.min(from + limit, matched.size());
                    return new HistoryService.HistorySelection(matched.subList(from, to), countAll ? matched.size() : to);
                });
        originalMessages = ReflectionTestUtils.getField(MessageUtil.class, "instance");
        StaticMessageSource messages = new StaticMessageSource();
        messages.addMessage("auditTrail.activity.update", Locale.ENGLISH, "Updated");
        MessageUtil.setMessageSource(messages);
        when(snapshots.loadFieldValues(anyString(), anyString(), anySet())).thenReturn(Collections.emptyMap());
    }

    @After
    public void restoreMessages() {
        ReflectionTestUtils.setField(MessageUtil.class, "instance", originalMessages);
    }

    @Test
    @SuppressWarnings("unchecked")
    public void finalEventsExposeExactPairsAndBusinessContextWithoutChangingReferenceIdentity() {
        History history = named("1", "panel", "41", "原中文", "新中文");
        Map<String, String> values = values("panel", "41", "原中文", "新中文");
        values.put("enBefore", "Old English");
        values.put("enAfter", "New English");
        values.put("frBefore", "Ancien nom");
        values.put("frAfter", "Nouveau nom");
        history.setChanges(xml(values));
        rows(List.of(history));

        Map<String, Object> event = fetch(null, 1, 30).get(0);
        assertEquals("LOCALIZATION", event.get("entityType"));
        assertEquals("987", event.get("entityId"));
        assertEquals("panel", event.get("configurationType"));
        assertEquals("41", event.get("businessId"));
        Map<String, Map<String, String>> changes = (Map<String, Map<String, String>>) event.get("changes");
        assertEquals(Map.of("old", "原中文", "new", "新中文"), changes.get("zh"));
        assertEquals(Map.of("old", "Old English", "new", "New English"), changes.get("en"));
        assertEquals(Map.of("old", "Ancien nom", "new", "Nouveau nom"), changes.get("fr"));
        assertEquals(3, changes.size());
        verifyZeroInteractions(snapshots);
    }

    @Test
    @SuppressWarnings({ "unchecked", "rawtypes" })
    public void defaultQueryAndEntityTypesIncludeLocalizationHistory() {
        rows(List.of(named("1", "panel", "41", "旧名称", "新名称")));
        assertEquals(1, fetch(null, 1, 30).size());
        ArgumentCaptor<List> ids = ArgumentCaptor.forClass(List.class);
        verify(histories).getSystemEventHistory(isNull(), isNull(), isNull(), ids.capture(), isNull(), isNull(),
                isNull(), eq(1), eq(30));
        assertTrue(ids.getValue().contains(LOCALIZATION_TABLE_ID));
        assertTrue(controller.getEntityTypes().getBody().stream().anyMatch(
                type -> "LOCALIZATION".equals(type.get("name")) && LOCALIZATION_TABLE_ID.equals(type.get("id"))));
    }

    @Test
    public void localizationFilterUsesFinalDisplayTypeAndKeepsLegacyRows() {
        rows(List.of(named("2", "testSection", "73", "原专业组", "新专业组"),
                history("1", LOCALIZATION_TABLE_ID, "987", Map.of("description", "legacy"))));
        Map<String, Object> event = fetch("LOCALIZATION", 1, 30).get(0);
        assertEquals("1", event.get("id"));
        assertFalse(event.containsKey("businessId"));
        verify(histories, never()).getSystemEventHistoryCount(any(), any(), any(), anyList(), any(), any(), any());
    }

    @Test
    public void consecutiveRenamesUseTheirOwnSnapshotsWithoutReverseChaining() {
        rows(List.of(named("2", "panel", "41", "中间名称", "最新名称"), named("1", "panel", "41", "最初名称", "中间名称")));
        List<Map<String, Object>> events = fetch(null, 1, 30);
        assertPair(events.get(0), "zh", "中间名称", "最新名称");
        assertPair(events.get(1), "zh", "最初名称", "中间名称");
        verifyZeroInteractions(snapshots);
    }

    @Test
    public void separatePagesPreserveHistoricalAfterValueWithoutTheNewerRowOrCurrentEntity() {
        rows(List.of(named("2", "testSection", "73", "中间名称", "最新名称")));
        when(histories.getSystemEventHistory(isNull(), isNull(), isNull(), anyList(), isNull(), isNull(), isNull(),
                eq(2), eq(1))).thenReturn(List.of(named("1", "testSection", "73", "最初名称", "中间名称")));
        assertPair(fetch(null, 1, 1).get(0), "zh", "中间名称", "最新名称");
        assertPair(fetch(null, 2, 1).get(0), "zh", "最初名称", "中间名称");
        verifyZeroInteractions(snapshots);
    }

    @Test
    public void firstChineseTranslationAndXmlEscapesReturnExactStoredText() {
        rows(List.of(named("1", "panel", "41", "", "中文 & <名称> \"甲\"")));
        assertPair(fetch(null, 1, 30).get(0), "zh", "", "中文 & <名称> \"甲\"");
        verifyZeroInteractions(snapshots);
    }

    @Test
    public void csvExportsPanelBusinessIdentityAndSeparateOldAndNewColumns() throws Exception {
        rows(List.of(named("1", "panel", "41", "旧中文名称", "新中文名称")));
        String[] columns = csvRow(null);
        assertEquals(7, columns.length);
        assertEquals("PANEL", columns[2]);
        assertEquals("41", columns[3]);
        assertEquals("zh: 旧中文名称", columns[5]);
        assertEquals("zh: 新中文名称", columns[6]);
        verifyZeroInteractions(snapshots);
    }

    @Test
    public void csvExportsProfessionalGroupBusinessIdentityUsingDisplayTypeFilter() throws Exception {
        rows(List.of(named("1", "testSection", "73", "旧专业组", "新专业组")));
        String[] columns = csvRow("TEST_SECTION");
        assertEquals("TEST_SECTION", columns[2]);
        assertEquals("73", columns[3]);
        assertEquals("zh: 旧专业组", columns[5]);
        assertEquals("zh: 新专业组", columns[6]);
        verify(histories).scanSystemEventHistory(isNull(), isNull(), isNull(), anyList(), isNull(), any(), eq(0L),
                eq(10000), eq(false));
    }

    @Test
    public void legacyXmlKeepsCurrentValueLookupAndReverseChaining() {
        History latest = history("2", TEST_TABLE_ID, "42", Map.of("description", "中间名称"));
        History earlier = history("1", TEST_TABLE_ID, "42", Map.of("description", "最初名称"));
        rows(List.of(latest, earlier));
        when(snapshots.loadFieldValues("TEST", "42", java.util.Set.of("description")))
                .thenReturn(new java.util.HashMap<>(Map.of("description", "当前名称")));
        List<Map<String, Object>> events = fetch(null, 1, 30);
        assertPair(events.get(0), "description", "中间名称", "当前名称");
        assertPair(events.get(1), "description", "最初名称", "中间名称");
        assertFalse(events.get(0).containsKey("businessId"));
        verify(snapshots).loadFieldValues("TEST", "42", java.util.Set.of("description"));
    }

    @Test
    public void legacyCsvKeepsOriginalEntityIdentityAndOldNewColumns() throws Exception {
        rows(List.of(history("1", TEST_TABLE_ID, "42", Map.of("description", "原项目名称"))));
        when(snapshots.loadFieldValues("TEST", "42", java.util.Set.of("description")))
                .thenReturn(new java.util.HashMap<>(Map.of("description", "新项目名称")));
        String[] columns = csvRow(null);
        assertEquals("TEST", columns[2]);
        assertEquals("42", columns[3]);
        assertEquals("description: 原项目名称", columns[5]);
        assertEquals("description: 新项目名称", columns[6]);
    }

    @Test
    public void invalidOrMissingMetadataCannotTurnLegacyTagsIntoANameSnapshot() {
        for (Map<String, String> invalid : List.of(values("other", "41", "原名称", "新名称"),
                values("panel", "bad-id", "原名称", "新名称"), values("panel", "", "原名称", "新名称"),
                Map.of("zhBefore", "原名称", "zhAfter", "新名称"))) {
            rows(List.of(history("1", LOCALIZATION_TABLE_ID, "987", invalid)));
            Map<String, Object> event = fetch(null, 1, 30).get(0);
            assertFalse(event.containsKey("businessId"));
            assertFalse(event.containsKey("configurationType"));
            assertPair(event, "zhAfter", "新名称", "");
        }
    }

    @Test
    public void incompletePairOrWrongReferenceTableKeepsLegacyReadContract() {
        Map<String, String> incomplete = values("panel", "41", "原名称", "新名称");
        incomplete.remove("zhAfter");
        rows(List.of(history("1", LOCALIZATION_TABLE_ID, "987", incomplete)));
        Map<String, Object> partial = fetch(null, 1, 30).get(0);
        assertFalse(partial.containsKey("configurationType"));
        assertPair(partial, "zhBefore", "原名称", "");

        rows(List.of(history("2", TEST_TABLE_ID, "42", values("panel", "41", "原名称", "新名称"))));
        Map<String, Object> unrelated = fetch(null, 1, 30).get(0);
        assertFalse(unrelated.containsKey("businessId"));
        assertPair(unrelated, "zhAfter", "新名称", "");
    }

    @Test
    public void sampleChineseSnapshotReturnsIndependentPairsAndSampleBusinessId() {
        rows(List.of(named("1", "sampleType", "985001", "原标本", "新标本")));
        Map<String, Object> event = fetch(null, 1, 30).get(0);
        assertPair(event, "zh", "原标本", "新标本");
        assertEquals("LOCALIZATION", event.get("entityType"));
        assertEquals("985001", event.get("businessId"));
        verifyZeroInteractions(snapshots);
    }

    @Test
    public void sampleMetadataSnapshotReturnsExactAllChangedFieldsAndNoContextAsChange() {
        rows(List.of(history("1", SAMPLE_TYPE_TABLE_ID, "985001",
                Map.of("configurationType", "sampleType", "businessId", "985001", "abbreviationBefore", "BAS1",
                        "abbreviationAfter", "AFTER", "isActiveBefore", "true", "isActiveAfter", "false"))));
        Map<String, Object> event = fetch(null, 1, 30).get(0);
        assertPair(event, "abbreviation", "BAS1", "AFTER");
        assertPair(event, "isActive", "true", "false");
        assertEquals(2, ((Map<?, ?>) event.get("changes")).size());
        verifyZeroInteractions(snapshots);
    }

    @Test
    public void catalogBasicSnapshotDoesNotGuessNewValuesFromCurrentEntity() {
        rows(List.of(history("1", TEST_TABLE_ID, "985201",
                Map.of("configurationType", "testCatalog", "businessId", "985201", "codeBefore", "BEFORE", "codeAfter",
                        "AFTER", "sampleTypeIdsBefore", "985001", "sampleTypeIdsAfter", "985002"))));
        Map<String, Object> event = fetch(null, 1, 30).get(0);
        assertPair(event, "code", "BEFORE", "AFTER");
        assertPair(event, "sampleTypeIds", "985001", "985002");
        assertEquals("testCatalog", event.get("configurationType"));
        verifyZeroInteractions(snapshots);
    }

    @Test
    public void csvSampleChineseUsesSampleIdentityAndUtf8OldNewValues() throws Exception {
        rows(List.of(named("1", "sampleType", "985001", "原中文 & 名称", "新中文 & 名称")));
        String[] columns = csvRow("TYPE_OF_SAMPLE");
        assertEquals("TYPE_OF_SAMPLE", columns[2]);
        assertEquals("985001", columns[3]);
        assertEquals("zh: 原中文 & 名称", columns[5]);
        assertEquals("zh: 新中文 & 名称", columns[6]);
        verifyZeroInteractions(snapshots);
    }

    @Test
    public void csvSampleMetadataKeepsOriginalTypeIdentityAndIndependentPairs() throws Exception {
        rows(List.of(history("1", SAMPLE_TYPE_TABLE_ID, "985001", Map.of("configurationType", "sampleType",
                "businessId", "985001", "abbreviationBefore", "BAS1", "abbreviationAfter", "AFTER"))));
        String[] columns = csvRow(null);
        assertEquals("TYPE_OF_SAMPLE", columns[2]);
        assertEquals("985001", columns[3]);
        assertEquals("abbreviation: BAS1", columns[5]);
        assertEquals("abbreviation: AFTER", columns[6]);
    }

    @Test
    public void csvCatalogMetadataKeepsTestIdentityAndIndependentPairs() throws Exception {
        rows(List.of(history("1", TEST_TABLE_ID, "985201", Map.of("configurationType", "testCatalog", "businessId",
                "985201", "descriptionBefore", "原检验项目", "descriptionAfter", "新检验项目"))));
        String[] columns = csvRow(null);
        assertEquals("TEST", columns[2]);
        assertEquals("985201", columns[3]);
        assertEquals("description: 原检验项目", columns[5]);
        assertEquals("description: 新检验项目", columns[6]);
    }

    @Test
    public void unsupportedMetadataFieldOrIncompletePairKeepsLegacyBehavior() {
        for (Map<String, String> bad : List.of(
                Map.of("configurationType", "sampleType", "businessId", "985001", "abbreviationBefore", "BAS1"),
                Map.of("configurationType", "sampleType", "businessId", "985001", "otherBefore", "OLD", "otherAfter",
                        "NEW"))) {
            rows(List.of(history("1", SAMPLE_TYPE_TABLE_ID, "985001", bad)));
            assertFalse(fetch(null, 1, 30).get(0).containsKey("businessId"));
        }
    }

    @Test
    public void mismatchedTableTypeOrBusinessIdentityCannotMasqueradeAsSnapshot() {
        rows(List.of(history("1", TEST_TABLE_ID, "985001", Map.of("configurationType", "sampleType", "businessId",
                "985001", "abbreviationBefore", "BAS1", "abbreviationAfter", "AFTER"))));
        assertFalse(fetch(null, 1, 30).get(0).containsKey("businessId"));
        rows(List.of(history("1", SAMPLE_TYPE_TABLE_ID, "985001", Map.of("configurationType", "sampleType",
                "businessId", "985002", "abbreviationBefore", "BAS1", "abbreviationAfter", "AFTER"))));
        assertFalse(fetch(null, 1, 30).get(0).containsKey("businessId"));
    }

    @Test
    public void successiveCatalogSnapshotsKeepExactHistoricalValuesAcrossPages() {
        rows(List.of(
                history("2", TEST_TABLE_ID, "985201",
                        Map.of("configurationType", "testCatalog", "businessId", "985201", "codeBefore", "MIDDLE",
                                "codeAfter", "NEW")),
                history("1", TEST_TABLE_ID, "985201", Map.of("configurationType", "testCatalog", "businessId", "985201",
                        "codeBefore", "OLD", "codeAfter", "MIDDLE"))));
        var events = fetch(null, 1, 30);
        assertPair(events.get(0), "code", "MIDDLE", "NEW");
        assertPair(events.get(1), "code", "OLD", "MIDDLE");
        verifyZeroInteractions(snapshots);
    }

    @Test
    public void sampleIdSearchMatchesBothNamedLocalizationAndMetadataAndNotRawLocalizationId() {
        History translated = named("3", "sampleType", "25", "old", "new");
        translated.setReferenceId("142");
        rows(List.of(translated,
                history("2", SAMPLE_TYPE_TABLE_ID, "25", Map.of("configurationType", "sampleType", "businessId", "25",
                        "abbreviationBefore", "OLD", "abbreviationAfter", "NEW")),
                named("1", "panel", "25", "old", "new")));
        Map<String, Object> body = query("TYPE_OF_SAMPLE", "25", 1, 30);
        assertEquals(2L, body.get("totalItems"));
        assertEquals(List.of("3", "2"), eventIds(body));
        assertEquals(0L, query("TYPE_OF_SAMPLE", "142", 1, 30).get("totalItems"));
        verifyZeroInteractions(snapshots);
    }

    @Test
    public void filteredPaginationCountsAllMatchesAndKeepsExactHistoricalSnapshots() {
        rows(List.of(named("4", "panel", "25", "old", "new"), named("3", "sampleType", "25", "middle", "new"),
                named("2", "sampleType", "26", "old", "new"), named("1", "sampleType", "25", "old", "middle")));
        Map<String, Object> body = query("TYPE_OF_SAMPLE", "25", 2, 1);
        assertEquals(2L, body.get("totalItems"));
        assertEquals(2, body.get("totalPages"));
        assertEquals(List.of("1"), eventIds(body));
        assertPair(((List<Map<String, Object>>) body.get("events")).get(0), "zh", "old", "middle");
        verifyZeroInteractions(snapshots);
    }

    @Test
    public void unknownTypesReturnEmptyWithoutInvokingAnyHistoryQuery() {
        rows(List.of(named("1", "sampleType", "25", "old", "new")));
        clearInvocations(histories);
        assertEquals(0L, query("UNKNOWN", "25", 1, 30).get("totalItems"));
        assertEquals(List.of(), eventIds(query(",UNKNOWN,", null, 1, 30)));
        verifyZeroInteractions(histories);
        assertEquals(1L, query("UNKNOWN, TYPE_OF_SAMPLE", "25", 1, 30).get("totalItems"));
    }

    @Test
    public void noncanonicalBusinessOrSourceIdCannotChangeDisplayedIdentityOrFiltering() {
        for (String businessId : List.of("0", "025", "-25")) {
            rows(List.of(named("1", "sampleType", businessId, "old", "new")));
            assertEquals(0L, query("TYPE_OF_SAMPLE", businessId, 1, 30).get("totalItems"));
            var legacy = query("LOCALIZATION", "987", 1, 30);
            assertEquals(1L, legacy.get("totalItems"));
            assertFalse(((List<Map<String, Object>>) legacy.get("events")).get(0).containsKey("businessId"));
        }
        for (String sourceId : List.of("0", "0142", "bad")) {
            History h = named("1", "sampleType", "25", "old", "new");
            h.setReferenceId(sourceId);
            rows(List.of(h));
            assertEquals(0L, query("TYPE_OF_SAMPLE", "25", 1, 30).get("totalItems"));
            assertEquals(1L, query("LOCALIZATION", sourceId, 1, 30).get("totalItems"));
        }
    }

    @Test
    public void mismatchedOrIncompleteSnapshotUsesRawIdentityForSearchAndClassification() {
        rows(List.of(
                history("2", SAMPLE_TYPE_TABLE_ID, "26",
                        Map.of("configurationType", "sampleType", "businessId", "25", "abbreviationBefore", "old",
                                "abbreviationAfter", "new")),
                history("1", LOCALIZATION_TABLE_ID, "142",
                        Map.of("configurationType", "sampleType", "businessId", "25", "zhBefore", "old"))));
        assertEquals(0L, query("TYPE_OF_SAMPLE", "25", 1, 30).get("totalItems"));
        assertEquals(1L, query("TYPE_OF_SAMPLE", "26", 1, 30).get("totalItems"));
        assertEquals(1L, query("LOCALIZATION", "142", 1, 30).get("totalItems"));
    }

    @Test
    public void searchRetainsSqlLikeWildcardsAndBackslashEscapesWithoutRawIdFallback() {
        rows(List.of(named("3", "sampleType", "25", "old", "new"), named("2", "sampleType", "205", "old", "new"),
                named("1", "sampleType", "31", "old", "new")));
        assertEquals(2L, query("TYPE_OF_SAMPLE", "2%5", 1, 30).get("totalItems"));
        assertEquals(1L, query("TYPE_OF_SAMPLE", "2_5", 1, 30).get("totalItems"));
        assertEquals(0L, query("TYPE_OF_SAMPLE", "2\\%5", 1, 30).get("totalItems"));
        assertEquals(0L, query("TYPE_OF_SAMPLE", "2\\_5", 1, 30).get("totalItems"));
        assertEquals(2L, query("TYPE_OF_SAMPLE", "2" + "%".repeat(2000) + "5", 1, 30).get("totalItems"));
        assertEquals(0L, query("TYPE_OF_SAMPLE", "%_".repeat(2000) + "x", 1, 30).get("totalItems"));
    }

    @Test
    public void csvAndPdfUseTheSameFilteredBusinessIdentityAndExcludeOtherRows() throws Exception {
        rows(List.of(named("2", "sampleType", "25", "old25", "new25"),
                named("1", "sampleType", "26", "old26", "new26")));
        var csv = new MockHttpServletResponse();
        controller.exportCsv(null, null, null, "TYPE_OF_SAMPLE", null, "25", null, csv);
        assertTrue(csv.getContentAsString().contains("TYPE_OF_SAMPLE,25,"));
        assertFalse(csv.getContentAsString().contains("old26"));
        var pdf = new MockHttpServletResponse();
        controller.exportPdf(null, null, null, "TYPE_OF_SAMPLE", null, "25", null, pdf);
        var reader = new com.itextpdf.text.pdf.PdfReader(pdf.getContentAsByteArray());
        String text = com.itextpdf.text.pdf.parser.PdfTextExtractor.getTextFromPage(reader, 1);
        reader.close();
        assertTrue(text.contains("TYPE_OF_SAMPLE"));
        assertTrue(text.contains("old25"));
        assertFalse(text.contains("old26"));
        verify(histories, times(2)).scanSystemEventHistory(isNull(), isNull(), isNull(), anyList(), isNull(), any(),
                eq(0L), eq(10000), eq(false));
    }

    @Test
    public void exportCapsSelectedRowsButFilteredListCountRemainsUntruncated() throws Exception {
        List<History> many = new ArrayList<>();
        for (int i = 10005; i > 0; i--)
            many.add(named(String.valueOf(i), "sampleType", "25", "old", "new"));
        rows(many);
        var body = query("TYPE_OF_SAMPLE", "25", 101, 100);
        assertEquals(10005L, body.get("totalItems"));
        assertEquals(5, eventIds(body).size());
        var csv = new MockHttpServletResponse();
        controller.exportCsv(null, null, null, "TYPE_OF_SAMPLE", null, "25", null, csv);
        assertEquals(10001, csv.getContentAsString().split("\\R").length);
    }

    @Test
    public void filteredQueriesForwardDatabaseDateUserActionAndOnlyRegisteredScope() {
        rows(List.of());
        controller.getSystemAuditEvents("2026-10-04", "2026-10-04", "7", "TYPE_OF_SAMPLE", "U", "25", null, 1, 30);
        verify(histories).scanSystemEventHistory(notNull(), notNull(), eq("7"), argThat(
                ids -> ids.contains(LOCALIZATION_TABLE_ID) && ids.contains(SAMPLE_TYPE_TABLE_ID) && ids.size() == 7),
                eq("U"), any(), eq(0L), eq(30), eq(true));
    }

    @Test
    public void maximumPageUsesLongOffsetAndNeverWrapsToAnEarlierPage() {
        rows(List.of(named("1", "sampleType", "25", "old", "new")));
        assertEquals(List.of(), eventIds(query("TYPE_OF_SAMPLE", "25", Integer.MAX_VALUE, 100)));
        verify(histories).scanSystemEventHistory(isNull(), isNull(), isNull(), anyList(), isNull(), any(),
                eq((Integer.MAX_VALUE - 1L) * 100), eq(100), eq(true));
        clearInvocations(histories);
        assertEquals(List.of(), fetch(null, Integer.MAX_VALUE, 100));
        verify(histories, never()).getSystemEventHistory(any(), any(), any(), anyList(), any(), any(), any(), anyInt(),
                anyInt());
    }

    @Test
    public void patientScopeStillQueriesOnlyPatientAndLinkedPersonUsingOriginalFilters() {
        var patient = new org.openelisglobal.patient.valueholder.Patient();
        patient.setId("25");
        var person = new org.openelisglobal.person.valueholder.Person();
        person.setId("75");
        patient.setPerson(person);
        when(patients.get("25")).thenReturn(patient);
        when(histories.getSystemEventHistory(isNull(), isNull(), eq("7"), eq(List.of("15")), eq("U"), eq("25"),
                eq("25"), eq(1), eq(10000))).thenReturn(List.of(history("2", "15", "25", Map.of("gender", "M"))));
        when(histories.getSystemEventHistory(isNull(), isNull(), eq("7"), eq(List.of("16")), eq("U"), eq("25"),
                eq("75"), eq(1), eq(10000))).thenReturn(List.of(history("1", "16", "75", Map.of("firstName", "old"))));
        var body = controller.getSystemAuditEvents(null, null, "7", "TYPE_OF_SAMPLE", "U", "25", "25", 1, 30).getBody();
        assertEquals(2L, body.get("totalItems"));
        assertEquals(List.of("2", "1"), eventIds(body));
        verify(histories, never()).scanSystemEventHistory(any(), any(), any(), anyList(), any(), any(), anyLong(),
                anyInt(), anyBoolean());
    }

    private Map<String, Object> query(String type, String search, int page, int size) {
        return controller.getSystemAuditEvents(null, null, null, type, null, search, null, page, size).getBody();
    }

    @SuppressWarnings("unchecked")
    private List<String> eventIds(Map<String, Object> body) {
        return ((List<Map<String, Object>>) body.get("events")).stream().map(event -> (String) event.get("id"))
                .toList();
    }

    private ReferenceTables reference(String id) {
        ReferenceTables reference = new ReferenceTables();
        reference.setId(id);
        return reference;
    }

    private Map<String, String> values(String type, String id, String before, String after) {
        Map<String, String> values = new LinkedHashMap<>();
        values.put("configurationType", type);
        values.put("businessId", id);
        values.put("zhBefore", before);
        values.put("zhAfter", after);
        return values;
    }

    private History named(String id, String type, String businessId, String before, String after) {
        return history(id, LOCALIZATION_TABLE_ID, "987", values(type, businessId, before, after));
    }

    private History history(String id, String tableId, String referenceId, Map<String, String> values) {
        History history = new History();
        history.setId(id);
        history.setReferenceTable(tableId);
        history.setReferenceId(referenceId);
        history.setActivity("U");
        history.setTimestamp(Timestamp.valueOf("2026-10-03 10:00:00"));
        history.setChanges(xml(values));
        return history;
    }

    private byte[] xml(Map<String, String> values) {
        StringBuilder xml = new StringBuilder();
        for (Map.Entry<String, String> value : values.entrySet()) {
            xml.append('<').append(value.getKey()).append('>').append(Encode.forXmlContent(value.getValue()))
                    .append("</").append(value.getKey()).append(">\n");
        }
        return xml.toString().getBytes(StandardCharsets.UTF_8);
    }

    private void rows(List<History> rows) {
        candidates = rows;
        when(histories.getSystemEventHistory(isNull(), isNull(), isNull(), anyList(), isNull(), isNull(), isNull(),
                anyInt(), anyInt())).thenReturn(rows);
        when(histories.getSystemEventHistoryCount(isNull(), isNull(), isNull(), anyList(), isNull(), isNull(),
                isNull())).thenReturn((long) rows.size());
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetch(String entityType, int page, int pageSize) {
        return (List<Map<String, Object>>) controller
                .getSystemAuditEvents(null, null, null, entityType, null, null, null, page, pageSize).getBody()
                .get("events");
    }

    private String[] csvRow(String entityType) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        controller.exportCsv(null, null, null, entityType, null, null, null, response);
        assertEquals("text/csv;charset=UTF-8", response.getContentType());
        assertEquals(StandardCharsets.UTF_8.name(), response.getCharacterEncoding());
        assertTrue(response.getHeader("Content-Disposition").contains("system-audit-events.csv"));
        String csv = new String(response.getContentAsByteArray(), StandardCharsets.UTF_8);
        assertEquals(csv, response.getContentAsString());
        String[] lines = csv.split("\\R");
        assertEquals(2, lines.length);
        return lines[1].split(",", -1);
    }

    @SuppressWarnings("unchecked")
    private void assertPair(Map<String, Object> event, String field, String before, String after) {
        Map<String, Map<String, String>> changes = (Map<String, Map<String, String>>) event.get("changes");
        assertEquals(Map.of("old", before, "new", after), changes.get(field));
    }
}

package org.openelisglobal.audittrail;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.audittrail.controller.rest.SystemAuditEventRestController;
import org.openelisglobal.audittrail.daoimpl.AuditTrailServiceImpl;
import org.openelisglobal.audittrail.valueholder.History;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.history.service.HistoryService;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.springframework.test.util.ReflectionTestUtils;

public class ConfigurationNameAuditSnapshotTest {
    private AuditTrailServiceImpl audit;
    private ReferenceTablesService references;
    private HistoryService histories;
    private ReferenceTables reference;

    @Before
    public void setup() {
        audit = new AuditTrailServiceImpl();
        references = mock(ReferenceTablesService.class);
        histories = mock(HistoryService.class);
        ReflectionTestUtils.setField(audit, "referenceTablesService", references);
        ReflectionTestUtils.setField(audit, "historyService", histories);
        reference = new ReferenceTables();
        reference.setId("216");
        reference.setKeepHistory("Y");
        when(references.getReferenceTableByName("LOCALIZATION")).thenReturn(reference);
    }

    @Test
    public void snapshotStoresChineseOldAndNewBusinessIdAndActorInExistingReadableXml() {
        Map<String, String> changes = new LinkedHashMap<>();
        changes.put("zhBefore", " 原中文名称 ");
        changes.put("zhAfter", "新中文名称");
        changes.put("enBefore", "Old & Name");
        changes.put("enAfter", "New < Name");
        changes.put("businessId", "41");
        changes.put("configurationType", "panel");
        audit.saveNamedChanges("987", "LOCALIZATION", "12", changes);
        ArgumentCaptor<History> saved = ArgumentCaptor.forClass(History.class);
        verify(histories).insert(saved.capture());
        History history = saved.getValue();
        assertEquals("987", history.getReferenceId());
        assertEquals("216", history.getReferenceTable());
        assertEquals("12", history.getSysUserId());
        assertEquals("U", history.getActivity());
        assertNotNull(history.getTimestamp());
        String xml = new String(history.getChanges(), StandardCharsets.UTF_8);
        assertTrue(xml.contains("<enBefore>Old &amp; Name</enBefore>"));
        assertTrue(xml.contains("<enAfter>New &lt; Name</enAfter>"));
        Map<?, ?> read = ReflectionTestUtils.invokeMethod(new SystemAuditEventRestController(), "parseChanges",
                history);
        assertEquals(" 原中文名称 ", read.get("zhBefore"));
        assertEquals("新中文名称", read.get("zhAfter"));
        assertEquals("41", read.get("businessId"));
        assertEquals("panel", read.get("configurationType"));
    }

    @Test
    public void nullOldNameStillEmitsEmptyTagForFirstChineseTranslation() {
        Map<String, String> changes = new LinkedHashMap<>();
        changes.put("zhBefore", null);
        changes.put("zhAfter", "首次中文名称");
        audit.saveNamedChanges("987", "LOCALIZATION", "12", changes);
        ArgumentCaptor<History> saved = ArgumentCaptor.forClass(History.class);
        verify(histories).insert(saved.capture());
        String xml = new String(saved.getValue().getChanges(), StandardCharsets.UTF_8);
        assertTrue(xml.contains("<zhBefore></zhBefore>"));
        assertTrue(xml.contains("<zhAfter>首次中文名称</zhAfter>"));
    }

    @Test
    public void historyPersistenceFailurePropagates() {
        doThrow(new LIMSRuntimeException("unavailable")).when(histories).insert(any(History.class));
        try {
            audit.saveNamedChanges("987", "LOCALIZATION", "12", Map.of("zhAfter", "中文"));
            fail("Expected failure");
        } catch (LIMSRuntimeException expected) {
            assertEquals("unavailable", expected.getMessage());
        }
    }

    @Test public void missingReferenceAndMalformedXmlFieldCannotCreateHistory() {
        when(references.getReferenceTableByName("LOCALIZATION")).thenReturn(null);
        try {
            audit.saveNamedChanges("987", "LOCALIZATION", "12", Map.of("zhAfter", "中文"));
            fail("Expected missing reference failure");
        } catch (LIMSRuntimeException expected) { }
        when(references.getReferenceTableByName("LOCALIZATION")).thenReturn(reference);
        try {
            audit.saveNamedChanges("987", "LOCALIZATION", "12", Map.of("bad<tag>", "中文"));
            fail("Expected malformed XML field failure");
        } catch (LIMSRuntimeException expected) { }
        verifyZeroInteractions(histories);
    }
}

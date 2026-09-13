package org.openelisglobal.qachecklist.service;

import static org.junit.Assert.*;

import java.sql.Timestamp;
import java.util.*;
import org.junit.Test;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.qachecklist.valueholder.SampleQaChecklist;

public class QaChecklistSnapshotTest {
    private Dictionary item(String key) {
        var item = new Dictionary();
        item.setDictEntry(key);
        item.setIsActive("Y");
        return item;
    }

    private SampleQaChecklist old() {
        var old = new SampleQaChecklist();
        old.setAllRequiredVerified(true);
        old.setVerifiedByUserId(7);
        old.setVerifiedDate(Timestamp.valueOf("2026-09-01 10:00:00"));
        old.setVerifiedItems(Map.of("patient", true));
        return old;
    }

    @Test
    public void addedRequiredCheckDoesNotReturnContradictoryCompletion() {
        var projection = QaChecklistSnapshot.project(old(), List.of(item("patient"), item("new-check")));
        assertEquals(false, projection.get("allRequiredVerified"));
        assertEquals(true, projection.get("storedChecklistComplete"));
        assertEquals(Map.of("patient", true, "new-check", false), projection.get("verifiedItems"));
    }

    @Test
    public void storedCompletionIsNeverPerTubeProof() {
        var projection = QaChecklistSnapshot.project(old(), List.of(item("patient")));
        assertEquals(true, projection.get("allRequiredVerified"));
        assertEquals(false, projection.get("currentAcceptanceVerified"));
        assertEquals("stored_checklist_snapshot", projection.get("completionScope"));
    }

    @Test
    public void draftCannotBecomeCompleteJustByReading() {
        var old = old();
        old.setAllRequiredVerified(false);
        assertEquals(false, QaChecklistSnapshot.project(old, List.of(item("patient"))).get("allRequiredVerified"));
    }

    @Test
    public void noRowRemainsIncomplete() {
        assertEquals(false, QaChecklistSnapshot.project(null, List.of(item("patient"))).get("allRequiredVerified"));
    }

    @Test
    public void noReviewerCannotBeComplete() {
        var old = old();
        old.setVerifiedByUserId(null);
        assertEquals(false, QaChecklistSnapshot.project(old, List.of(item("patient"))).get("allRequiredVerified"));
    }

    @Test
    public void noDateCannotBeComplete() {
        var old = old();
        old.setVerifiedDate(null);
        assertEquals(false, QaChecklistSnapshot.project(old, List.of(item("patient"))).get("allRequiredVerified"));
    }

    @Test
    public void emptyConfigIsNotVacuouslyComplete() {
        assertThrows(RuntimeException.class, () -> QaChecklistSnapshot.project(old(), List.of()));
    }

    @Test
    public void duplicateConfigIsNotComplete() {
        assertThrows(RuntimeException.class,
                () -> QaChecklistSnapshot.project(old(), List.of(item("patient"), item("patient"))));
    }

    @Test
    public void inactiveConfigIsNotComplete() {
        var item = item("patient");
        item.setIsActive("N");
        assertThrows(RuntimeException.class, () -> QaChecklistSnapshot.project(old(), List.of(item)));
    }

    @Test
    public void projectionDoesNotMutateHistoricalRow() {
        var old = old();
        QaChecklistSnapshot.project(old, List.of(item("new-check")));
        assertEquals(Map.of("patient", true), old.getVerifiedItems());
        assertTrue(old.getAllRequiredVerified());
    }

    @Test
    public void missingInputKeyNormalizesFalse() {
        assertEquals(Map.of("patient", false), QaChecklistSnapshot.normalize(List.of(item("patient")), Map.of()));
    }

    @Test
    public void normalizedMapCannotAliasInput() {
        var source = new HashMap<>(Map.of("patient", true));
        var result = QaChecklistSnapshot.normalize(List.of(item("patient")), source);
        source.put("patient", false);
        assertEquals(true, result.get("patient"));
    }

    @Test
    public void unknownInputCannotBeSilentlyAccepted() {
        assertThrows(RuntimeException.class,
                () -> QaChecklistSnapshot.normalize(List.of(item("patient")), Map.of("other", true)));
    }
}

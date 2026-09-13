package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import org.junit.Test;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.sampleitem.dao.SampleItemDAO;
import org.openelisglobal.sampleitem.service.SampleItemServiceImpl;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.springframework.beans.BeanUtils;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Actual audited service with SIM DAO; verifies audit baseline, not SQL
 * persistence.
 */
public class SpecimenReceiptAuditTest {
    @Test
    public void actualAuditSeesOldReceiptNullAndNewReceiptWithExactVersion() throws Exception {
        var constructor = SampleItemServiceImpl.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        var service = constructor.newInstance();
        var dao = mock(SampleItemDAO.class);
        var audit = mock(AuditTrailService.class);
        ReflectionTestUtils.setField(service, "baseObjectDAO", dao);
        ReflectionTestUtils.setField(service, "auditTrailService", audit);
        var original = new SampleItem();
        original.setId("1001");
        original.setCollector("SIM-collector");
        original.setLastupdated(Timestamp.from(Instant.parse("2026-09-01T01:00:00.123456Z")));
        var update = new SampleItem();
        BeanUtils.copyProperties(original, update);
        update.setReceivedDate(Timestamp.from(Instant.parse("2026-09-01T02:00:00.123Z")));
        update.setSysUserId("7");
        when(dao.get("1001")).thenReturn(Optional.of(original));
        when(dao.getTableName()).thenReturn("SAMPLE_ITEM");
        when(dao.update(update)).thenReturn(update);
        assertSame(update, service.update(update));
        var order = inOrder(dao, audit);
        order.verify(dao).get("1001");
        order.verify(dao).evict(original);
        order.verify(audit).saveHistory(eq(update), eq(original), eq("7"), anyString(), eq("SAMPLE_ITEM"));
        order.verify(dao).update(update);
        assertNull(original.getReceivedDate());
        assertEquals(123456000, update.getLastupdated().getNanos());
        assertEquals("SIM-collector", update.getCollector());
    }

    @Test
    public void actualAuditFailureNeverMergesSpecimen() throws Exception {
        var constructor = SampleItemServiceImpl.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        var service = constructor.newInstance();
        var dao = mock(SampleItemDAO.class);
        var audit = mock(AuditTrailService.class);
        ReflectionTestUtils.setField(service, "baseObjectDAO", dao);
        ReflectionTestUtils.setField(service, "auditTrailService", audit);
        var original = new SampleItem();
        original.setId("1001");
        original.setLastupdated(Timestamp.from(Instant.parse("2026-09-01T01:00:00Z")));
        var update = new SampleItem();
        BeanUtils.copyProperties(original, update);
        update.setSysUserId("7");
        update.setReceivedDate(Timestamp.from(Instant.parse("2026-09-01T02:00:00Z")));
        when(dao.get("1001")).thenReturn(Optional.of(original));
        when(dao.getTableName()).thenReturn("SAMPLE_ITEM");
        doThrow(new IllegalStateException("SIM-audit-failure")).when(audit).saveHistory(any(), any(), anyString(),
                anyString(), anyString());
        try {
            service.update(update);
            fail("audit failed");
        } catch (IllegalStateException expected) {
            verify(dao, never()).update(any());
            assertNull(original.getReceivedDate());
        }
    }
}

package org.openelisglobal.patient.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.patient.action.bean.PatientIdDocumentInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Existing immediate document writes use real disposable PostgreSQL and the
 * real audit service.
 */
public class PatientDocumentMaintenancePersistenceTest extends BaseWebContextSensitiveTest {
    @Autowired
    PatientDocumentMaintenanceService maintenance;
    @Autowired
    PatientIdDocumentService documents;
    @Autowired
    PatientPhotoService photos;
    private Object photoTarget;
    private Object previousPhotoAudit;
    private Object maintenanceTarget;
    private Object documentTarget;
    private Object previousAuthorization;
    private Object previousDocuments;
    private Object previousAudit;
    private PatientManagementAuthorizationService authorization;
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    @Before
    public void prepareDocuments() throws Exception {
        executeDataSetWithStateManagement("testdata/patient-maintenance-contract.xml");
        jdbcTemplate.update("delete from clinlims.patient_id_document where id=7201");
        jdbcTemplate.update(
                "insert into clinlims.patient_id_document (id, patient_id, document_data, thumbnail_data, document_type, document_category, description, deleted, last_updated) values (7201, '7101', 'b2xk', 'b2xk', 'image/png', 'OTHER', 'Old description', false, '2023-01-01 00:00:00')");
        maintenanceTarget = AopTestUtils.getTargetObject(maintenance);
        documentTarget = AopTestUtils.getTargetObject(documents);
        previousAuthorization = ReflectionTestUtils.getField(maintenanceTarget, "authorization");
        previousDocuments = ReflectionTestUtils.getField(maintenanceTarget, "documents");
        previousAudit = ReflectionTestUtils.getField(documentTarget, "auditTrailService");
        authorization = mock(PatientManagementAuthorizationService.class);
        ReflectionTestUtils.setField(maintenanceTarget, "authorization", authorization);
        AuditTrailService audit = webApplicationContext.getBean("auditTrailServiceImpl", AuditTrailService.class);
        assertFalse(mockingDetails(audit).isMock());
        ReflectionTestUtils.setField(documentTarget, "auditTrailService", audit);
        photoTarget = AopTestUtils.getTargetObject(photos);
        previousPhotoAudit = ReflectionTestUtils.getField(photoTarget, "auditTrailService");
        ReflectionTestUtils.setField(photoTarget, "auditTrailService", audit);
    }

    @After
    public void restoreDocuments() {
        if (maintenanceTarget != null) {
            ReflectionTestUtils.setField(maintenanceTarget, "authorization", previousAuthorization);
            ReflectionTestUtils.setField(maintenanceTarget, "documents", previousDocuments);
        }
        if (documentTarget != null)
            ReflectionTestUtils.setField(documentTarget, "auditTrailService", previousAudit);
        if (photoTarget != null)
            ReflectionTestUtils.setField(photoTarget, "auditTrailService", previousPhotoAudit);
    }

    private PatientIdDocumentInfo changed() {
        var info = new PatientIdDocumentInfo();
        info.setId(7201);
        info.setCategory("PASSPORT");
        info.setDescription("New description");
        return info;
    }

    private String version() {
        return jdbcTemplate
                .queryForObject("select last_updated from clinlims.patient_id_document where id=7201", Timestamp.class)
                .toString();
    }

    private String description() {
        return jdbcTemplate.queryForObject("select description from clinlims.patient_id_document where id=7201",
                String.class);
    }

    private boolean deleted() {
        return jdbcTemplate.queryForObject("select deleted from clinlims.patient_id_document where id=7201",
                Boolean.class);
    }

    private long histories() {
        return jdbcTemplate.queryForObject("select count(*) from clinlims.history", Long.class);
    }

    private void assertAuditContains(String oldValue) {
        var rows = jdbcTemplate.queryForList(
                "select h.sys_user_id,h.changes from clinlims.history h join clinlims.reference_tables r on r.id=h.reference_table where lower(r.name)='patient_id_document' and h.reference_id=7201 and h.activity='U'");
        assertFalse("An actual document audit is required", rows.isEmpty());
        assertTrue(rows.stream().allMatch(row -> "1".equals(row.get("sys_user_id").toString())));
        assertTrue("The stored before value must remain in the audit", rows.stream()
                .anyMatch(row -> new String((byte[]) row.get("changes"), StandardCharsets.UTF_8).contains(oldValue)));
    }

    @Test
    public void existingPhotoReplacementRetainsRealOldValueActorReadbackAndNoPhotoMeansNoDeletion() throws Exception {
        String oldImage = syntheticPhoto(java.awt.Color.WHITE, "jpg");
        String newImage = syntheticPhoto(java.awt.Color.BLACK, "png");
        jdbcTemplate.update("delete from clinlims.patient_photo where patient_id='7101'");
        jdbcTemplate.update(
                "insert into clinlims.patient_photo (id,patient_id,photo_data,thumbnail_data,photo_type,last_updated) values (7301,'7101',?,?,'image/jpeg','2023-01-01 00:00:00')",
                oldImage, oldImage);
        String oldVersion = jdbcTemplate
                .queryForObject("select last_updated from clinlims.patient_photo where id=7301", Timestamp.class)
                .toString();
        photos.savePhoto("7101", "data:image/png;base64," + newImage, "1");
        assertTrue("Full-photo readback must match the saved replacement",
                ("data:image/png;base64," + newImage).equals(photos.getPhotoByPatientId("7101", false)));
        String savedVersion = jdbcTemplate
                .queryForObject("select last_updated from clinlims.patient_photo where id=7301", Timestamp.class)
                .toString();
        assertNotEquals(oldVersion, savedVersion);
        var rows = jdbcTemplate.queryForList(
                "select h.sys_user_id,h.changes from clinlims.history h join clinlims.reference_tables r on r.id=h.reference_table where lower(r.name)='patient_photo' and h.reference_id=7301 and h.activity='U'");
        assertFalse("An actual photo update audit is required", rows.isEmpty());
        assertTrue("Photo audit actor is authoritative",
                rows.stream().allMatch(row -> "1".equals(row.get("sys_user_id").toString())));
        assertTrue("Photo audit retains the independent stored before type",
                rows.stream().anyMatch(row -> new String((byte[]) row.get("changes"), StandardCharsets.UTF_8)
                        .contains("<photoType>image/jpeg</photoType>")));
        assertTrue("The common sensitive-image audit exclusion remains intact", rows.stream().allMatch(row -> {
            String changes = new String((byte[]) row.get("changes"), StandardCharsets.UTF_8);
            return !changes.contains("<photoData>") && !changes.contains("<thumbnailData>")
                    && !changes.contains(oldImage) && !changes.contains(newImage);
        }));
        long history = histories();
        String sameTypeImage = syntheticPhoto(java.awt.Color.WHITE, "png");
        photos.savePhoto("7101", "data:image/png;base64," + sameTypeImage, "1");
        assertTrue("A same-format replacement is still persisted and read back",
                ("data:image/png;base64," + sameTypeImage).equals(photos.getPhotoByPatientId("7101", false)));
        assertEquals("Payload-only changes intentionally add no image audit", history, histories());
        savedVersion = jdbcTemplate
                .queryForObject("select last_updated from clinlims.patient_photo where id=7301", Timestamp.class)
                .toString();
        assertNull(photos.savePhoto("7101", null, "1"));
        assertNull(photos.savePhoto("7101", "", "1"));
        assertTrue("Absent photo retains the replacement",
                ("data:image/png;base64," + sameTypeImage).equals(photos.getPhotoByPatientId("7101", false)));
        assertEquals(savedVersion, jdbcTemplate
                .queryForObject("select last_updated from clinlims.patient_photo where id=7301", Timestamp.class)
                .toString());
        assertEquals(history, histories());
    }

    private String syntheticPhoto(java.awt.Color color, String format) throws java.io.IOException {
        var image = new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB);
        var graphics = image.createGraphics();
        graphics.setColor(color);
        graphics.fillRect(0, 0, 2, 2);
        graphics.dispose();
        var bytes = new java.io.ByteArrayOutputStream();
        assertTrue("A valid synthetic image encoder is required", javax.imageio.ImageIO.write(image, format, bytes));
        return java.util.Base64.getEncoder().encodeToString(bytes.toByteArray());
    }

    @Test
    public void metadataUpdateAndSoftDeletionKeepBeforeValuesAndAdvanceExactVersion() {
        String before = version();
        maintenance.update(request, "1", 7201, "7101", before, changed());
        assertEquals("New description", description());
        assertFalse(deleted());
        assertNotEquals(before, version());
        assertEquals("b2xk", jdbcTemplate
                .queryForObject("select document_data from clinlims.patient_id_document where id=7201", String.class));
        assertAuditContains("<description>Old description</description>");
        String edited = version();
        maintenance.delete(request, "1", 7201, "7101", edited);
        assertTrue(deleted());
        assertNotEquals(edited, version());
        assertAuditContains("<deleted>false</deleted>");
    }

    @Test
    public void emptyMetadataChangeRetainsActualVersionAndDoesNotInventAuditDifferences() {
        var info = new PatientIdDocumentInfo();
        info.setId(7201);
        info.setCategory("OTHER");
        info.setDescription("Old description");
        String before = version();
        long history = histories();
        maintenance.update(request, "1", 7201, "7101", before, info);
        assertEquals("Old description", description());
        assertFalse(deleted());
        assertEquals(before, version());
        assertEquals(history, histories());
    }

    @Test
    public void mismatchedScopeStaleVersionAndLatePermissionRefusalRollBackBusinessAndAudit() {
        String before = version();
        long history = histories();
        assertThrows(PatientMaintenanceConflictException.class,
                () -> maintenance.update(request, "1", 7201, "7102", before, changed()));
        assertThrows(PatientMaintenanceConflictException.class,
                () -> maintenance.delete(request, "1", 7201, "7101", "2000-01-01 00:00:00"));
        for (boolean deletion : new boolean[] { false, true }) {
            reset(authorization);
            doNothing().doThrow(new AccessDeniedException("withdrawn before completion")).when(authorization)
                    .requireEdit(request, "1");
            assertThrows(AccessDeniedException.class, () -> {
                if (deletion)
                    maintenance.delete(request, "1", 7201, "7101", before);
                else
                    maintenance.update(request, "1", 7201, "7101", before, changed());
            });
            assertEquals("Old description", description());
            assertFalse(deleted());
            assertEquals(before, version());
            assertEquals(history, histories());
        }
    }

    @Test
    public void independentlyCommittedDocumentVersionRejectsOurWriteAndRollsBackAudit() throws Exception {
        String before = version();
        long history = histories();
        CountDownLatch loaded = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        PatientIdDocumentService delayed = mock(PatientIdDocumentService.class,
                org.mockito.AdditionalAnswers.delegatesTo(documents));
        doAnswer(call -> {
            var row = documents.getMatch("id", 7201);
            loaded.countDown();
            if (!release.await(30, TimeUnit.SECONDS))
                throw new IllegalStateException("Competing document commit was not released");
            return row;
        }).when(delayed).getMatch("id", 7201);
        ReflectionTestUtils.setField(maintenanceTarget, "documents", delayed);
        var executor = Executors.newSingleThreadExecutor();
        try {
            var attempt = executor.submit(() -> {
                try {
                    maintenance.update(request, "1", 7201, "7101", before, changed());
                    return (Throwable) null;
                } catch (Throwable failure) {
                    return failure;
                }
            });
            assertTrue(loaded.await(30, TimeUnit.SECONDS));
            jdbcTemplate.update(
                    "update clinlims.patient_id_document set last_updated=last_updated+interval '1 second' where id=7201");
            release.countDown();
            Throwable failure = attempt.get(30, TimeUnit.SECONDS);
            assertNotNull(failure);
            boolean optimistic = false;
            for (Throwable cause = failure; cause != null; cause = cause.getCause())
                if (cause.getClass().getSimpleName().contains("OptimisticLock")
                        || cause.getClass().getSimpleName().contains("StaleObjectState"))
                    optimistic = true;
            assertTrue("A real ORM version conflict is required: " + failure, optimistic);
            assertEquals("Old description", description());
            assertFalse(deleted());
            assertEquals(history, histories());
            assertEquals("2023-01-01 00:00:01.0", version());
        } finally {
            release.countDown();
            executor.shutdownNow();
            ReflectionTestUtils.setField(maintenanceTarget, "documents", previousDocuments);
        }
    }
}

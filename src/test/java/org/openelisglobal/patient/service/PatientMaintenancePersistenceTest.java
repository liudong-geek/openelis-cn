package org.openelisglobal.patient.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.patient.action.IPatientUpdate.PatientUpdateStatus;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.patient.valueholder.PatientContact;
import org.openelisglobal.patientidentity.service.PatientIdentityService;
import org.openelisglobal.person.service.PersonService;
import org.openelisglobal.person.valueholder.Person;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Real persistence, audits and competing commits use the disposable
 * BaseTestConfig PostgreSQL only.
 */
public class PatientMaintenancePersistenceTest extends BaseWebContextSensitiveTest {
    @Autowired
    PatientService patients;
    @Autowired
    PersonService persons;
    @Autowired
    PatientContactService contacts;
    @Autowired
    PatientIdentityService identities;
    @Autowired
    PlatformTransactionManager transactions;
    final Map<Object, Object> oldAudits = new LinkedHashMap<>();

    @Before
    public void prepare() throws Exception {
        executeDataSetWithStateManagement("testdata/patient-maintenance-contract.xml");
        org.openelisglobal.patientidentitytype.util.PatientIdentityTypeMap.reset();
        var real = webApplicationContext.getBean("auditTrailServiceImpl", AuditTrailService.class);
        assertFalse(mockingDetails(real).isMock());
        for (var bean : new Object[] { patients, persons, contacts, identities }) {
            var target = AopTestUtils.getTargetObject(bean);
            oldAudits.put(target, ReflectionTestUtils.getField(target, "auditTrailService"));
            ReflectionTestUtils.setField(target, "auditTrailService", real);
        }
    }

    @After
    public void restore() {
        oldAudits.forEach((bean, audit) -> ReflectionTestUtils.setField(bean, "auditTrailService", audit));
        org.openelisglobal.patientidentitytype.util.PatientIdentityTypeMap.reset();
    }

    @Test
    public void editsHaveIndependentRealOldValueAuditsAndVersionsAdvance() {
        var info = draft();
        String parentVersion = info.getPatientLastUpdated();
        String contactVersion = info.getPatientContactLastUpdated();
        info.setSTnumber("NEW-ST");
        Patient saved = save(info);
        assertEquals("7101", saved.getId());
        assertEquals("PatientNew", value("person", "last_name", 7101));
        assertEquals("ContactNew", value("person", "last_name", 7103));
        assertEquals("NEW-ST", value("patient_identity", "identity_data", 7101));
        assertAudit("PERSON", "7101", "<lastName>PatientOld</lastName>");
        assertAudit("PERSON", "7103", "<lastName>ContactOld</lastName>");
        assertAudit("PATIENT_IDENTITY", "7101", "<identityData>OLD-ST</identityData>");
        assertNotEquals(parentVersion, value("patient", "lastupdated", 7101));
        assertNotEquals(contactVersion, value("patient_contact", "lastupdated", 7101));
        assertEquals("OtherPatient", value("person", "last_name", 7102));
        assertEquals("OtherContact", value("person", "last_name", 7104));
    }

    @Test
    public void clearedAddressHierarchyChildPersistsBlankAndNullWithRealOldValueAudit() throws Exception {
        for (String cleared : new String[] { "", null }) {
            executeDataSetWithStateManagement("testdata/patient-maintenance-contract.xml");
            org.openelisglobal.patientidentitytype.util.PatientIdentityTypeMap.reset();
            long oldAuditCount = jdbcTemplate.queryForObject(
                    "select count(*) from clinlims.history h join clinlims.reference_tables r on r.id=h.reference_table where upper(r.name)='PATIENT_IDENTITY' and h.reference_id=7102 and h.activity='U'",
                    Long.class);
            var info = draft();
            var values = new LinkedHashMap<String, String>();
            values.put("addressHierarchy_1", cleared);
            info.setAddressHierarchy(values);
            save(info);
            assertEquals(cleared, value("patient_identity", "identity_data", 7102));
            assertAudit("PATIENT_IDENTITY", "7102", "<identityData>OLD-ADDRESS-CHILD</identityData>");
            assertEquals(oldAuditCount + 1, jdbcTemplate.queryForObject(
                    "select count(*) from clinlims.history h join clinlims.reference_tables r on r.id=h.reference_table where upper(r.name)='PATIENT_IDENTITY' and h.reference_id=7102 and h.activity='U'",
                    Long.class).longValue());
        }
    }

    @Test
    public void contactMigrationPreservesOldDatesIsRepeatableAndTwoSameDaySavesAdvance() throws Exception {
        assertEquals("timestamp without time zone", jdbcTemplate.queryForObject(
                "select data_type from information_schema.columns where table_schema='clinlims' and table_name='patient_contact' and column_name='lastupdated'",
                String.class));
        assertEquals("2023-01-01 00:00:00.0", value("patient_contact", "lastupdated", 7101));
        String migrationDb = "chg070_contact_version";
        jdbcTemplate.execute("create database " + migrationDb);
        String migrationUrl = System.getProperty("db.url").replaceFirst("/clinlims(\\?|$)", "/" + migrationDb + "$1");
        try (var connection = java.sql.DriverManager.getConnection(migrationUrl, System.getProperty("db.user"),
                System.getProperty("db.pass"))) {
            try (var setup = connection.createStatement()) {
                setup.execute("create schema clinlims");
                setup.execute("create table clinlims.patient_contact (id integer primary key,lastupdated date)");
                setup.execute("insert into clinlims.patient_contact values(1,date '2023-01-01')");
            }
            var database = liquibase.database.DatabaseFactory.getInstance()
                    .findCorrectDatabaseImplementation(new liquibase.database.jvm.JdbcConnection(connection));
            try (var migration = new liquibase.Liquibase("liquibase/patient/001-contact-version-timestamp.xml",
                    new liquibase.resource.ClassLoaderResourceAccessor(), database)) {
                migration.update(new liquibase.Contexts(), new liquibase.LabelExpression());
                assertMigrationMidnight(connection);
                migration.update(new liquibase.Contexts(), new liquibase.LabelExpression());
                assertMigrationMidnight(connection);
                try (var check = connection.createStatement();
                        var rows = check.executeQuery("select count(*) from databasechangelog")) {
                    assertTrue(rows.next());
                    assertEquals(1, rows.getInt(1));
                }
            }
        }
        try (var connection = java.sql.DriverManager.getConnection(migrationUrl, System.getProperty("db.user"),
                System.getProperty("db.pass"))) {
            // A timestamp installation without an existing migration record must preserve
            // all data.
            try (var clear = connection.createStatement()) {
                clear.executeUpdate("delete from databasechangelog");
            }
            var database = liquibase.database.DatabaseFactory.getInstance()
                    .findCorrectDatabaseImplementation(new liquibase.database.jvm.JdbcConnection(connection));
            try (var migration = new liquibase.Liquibase("liquibase/patient/001-contact-version-timestamp.xml",
                    new liquibase.resource.ClassLoaderResourceAccessor(), database)) {
                migration.update(new liquibase.Contexts(), new liquibase.LabelExpression());
                assertMigrationMidnight(connection);
                try (var check = connection.createStatement();
                        var rows = check.executeQuery("select exectype from databasechangelog")) {
                    assertTrue(rows.next());
                    assertEquals("EXECUTED", rows.getString(1));
                    assertFalse(rows.next());
                }
            }
        } finally {
            jdbcTemplate.execute("drop database " + migrationDb);
        }
        save(draft());
        String first = value("patient_contact", "lastupdated", 7101);
        save(draft());
        String second = value("patient_contact", "lastupdated", 7101);
        assertNotEquals("Every maintenance save must advance the contact version", first, second);
        assertEquals(Timestamp.valueOf(first).toLocalDateTime().toLocalDate(),
                Timestamp.valueOf(second).toLocalDateTime().toLocalDate());
    }

    private void assertMigrationMidnight(java.sql.Connection connection) throws java.sql.SQLException {
        try (var check = connection.createStatement();
                var rows = check.executeQuery("select lastupdated from clinlims.patient_contact where id=1")) {
            assertTrue(rows.next());
            assertEquals("2023-01-01 00:00:00.0", rows.getTimestamp(1).toString());
        }
        try (var check = connection.createStatement();
                var rows = check.executeQuery(
                        "select data_type from information_schema.columns where table_schema='clinlims' and table_name='patient_contact' and column_name='lastupdated'")) {
            assertTrue(rows.next());
            assertEquals("timestamp without time zone", rows.getString(1));
        }
    }

    @Test
    public void creationUsesNewIdentitiesAndExistingContactReferencesAreRejected() {
        var info = new PatientManagementInfo();
        info.setLastName("Created");
        info.setFirstName("First");
        info.setGender("F");
        info.setNationalId("CREATED-7101");
        Patient created = save(info);
        assertNotNull(created.getId());
        assertNotEquals("7101", created.getId());
        assertNotNull(created.getFhirUuid());
        assertEquals(created.getId(), info.getPatientPK());
        assertEquals("Created", value("person", "last_name", Integer.parseInt(created.getPerson().getId())));
        long history = histories();
        var invalid = draft();
        invalid.setPatientPK(null);
        assertThrows(IllegalArgumentException.class, () -> save(invalid));
        assertEquals(history, histories());
    }

    @Test
    public void allContactIdentityAndOwnershipMismatchesRollBackEverything() {
        for (int kind = 0; kind < 5; kind++) {
            var info = draft();
            if (kind == 0)
                info.getPatientContact().setId("7102");
            if (kind == 1)
                info.getPatientContact().getPerson().setId("7104");
            if (kind == 2)
                info.getPatientContact().setPatientId("7102");
            if (kind == 3)
                info.getPatientContact().setId(null);
            if (kind == 4)
                info.getPatientContact().getPerson().setId(null);
            expectDenied(info);
        }
        assertEquals("OtherContact", value("person", "last_name", 7104));
    }

    @Test
    public void allMissingAndStaleVersionsAreRefusedBeforeAnyWrite() {
        for (int kind = 0; kind < 8; kind++) {
            var info = draft();
            String version = kind % 2 == 0 ? null : "2000-01-01 00:00:00";
            if (kind < 2)
                info.setPatientLastUpdated(version);
            else if (kind < 4)
                info.setPersonLastUpdated(version);
            else if (kind < 6)
                info.setPatientContactLastUpdated(version);
            else
                info.setPatientContactPersonLastUpdated(version);
            expectDenied(info);
        }
        var malformed = draft();
        malformed.setPatientLastUpdated("not a timestamp");
        assertThrows(IllegalArgumentException.class, () -> save(malformed));
        assertEquals("PatientOld", value("person", "last_name", 7101));
    }

    @Test
    public void mergedOutPatientCannotBeEdited() {
        jdbcTemplate.update(
                "update clinlims.patient set is_merged=true, merged_into_patient_id=7102, merge_date=current_timestamp where id=7101");
        expectDenied(draft());
    }

    @Test
    public void competingPatientPersonContactAndIdentityCommitsRollBackOurBusinessAndAudits() throws Exception {
        for (String table : java.util.List.of("patient", "person", "contact_person", "patient_contact",
                "patient_identity"))
            compete(table);
    }

    private void compete(String table) throws Exception {
        executeDataSetWithStateManagement("testdata/patient-maintenance-contract.xml");
        org.openelisglobal.patientidentitytype.util.PatientIdentityTypeMap.reset();
        var info = draft();
        info.setSTnumber("NEW-ST");
        long history = histories();
        var loaded = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        var delayed = mock(PatientIdentityService.class, org.mockito.AdditionalAnswers.delegatesTo(identities));
        doAnswer(call -> {
            var snapshot = identities.getPatientIdentitiesForPatient("7101");
            loaded.countDown();
            if (!release.await(30, java.util.concurrent.TimeUnit.SECONDS))
                throw new IllegalStateException("Competing update was not released");
            return snapshot;
        }).when(delayed).getPatientIdentitiesForPatient("7101");
        var target = AopTestUtils.getTargetObject(patients);
        ReflectionTestUtils.setField(target, "patientIdentityService", delayed);
        var executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        try {
            var attempt = executor.submit(() -> {
                try {
                    save(info);
                    return (Throwable) null;
                } catch (Throwable failure) {
                    return failure;
                }
            });
            assertTrue("The service must read real row versions before the competing commit",
                    loaded.await(30, java.util.concurrent.TimeUnit.SECONDS));
            int id = "contact_person".equals(table) ? 7103 : 7101;
            String rowTable = "contact_person".equals(table) ? "person" : table;
            String rivalVersion = "2023-01-01 00:00:01.0";
            String rivalInterval = "1 second";
            assertEquals(1, jdbcTemplate.update("update clinlims." + rowTable
                    + " set lastupdated=lastupdated+interval '" + rivalInterval + "' where id=?", id));
            assertEquals("The competing commit must actually advance the stored version", rivalVersion,
                    value(rowTable, "lastupdated", id));
            release.countDown();
            Throwable failure = attempt.get(30, java.util.concurrent.TimeUnit.SECONDS);
            assertNotNull("Competing " + table + " commit must cause a conflict", failure);
            boolean optimistic = false;
            for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
                String type = cause.getClass().getSimpleName();
                if (type.contains("OptimisticLock") || type.contains("StaleObjectState")
                        || type.equals("PatientMaintenanceConflictException"))
                    optimistic = true;
            }
            assertTrue("Expected an actual PostgreSQL version conflict, got " + failure, optimistic);
            assertEquals("PatientOld", value("person", "last_name", 7101));
            assertEquals("ContactOld", value("person", "last_name", 7103));
            assertEquals("OLD-ST", value("patient_identity", "identity_data", 7101));
            assertEquals(history, histories());
            assertEquals(rivalVersion, value(rowTable, "lastupdated", id));
        } finally {
            release.countDown();
            executor.shutdownNow();
            ReflectionTestUtils.setField(target, "patientIdentityService", identities);
        }
    }

    protected PatientManagementInfo draft() {
        var info = new PatientManagementInfo();
        info.setPatientPK("7101");
        info.setPatientUpdateStatus(PatientUpdateStatus.UPDATE);
        info.setPatientLastUpdated(value("patient", "lastupdated", 7101));
        info.setPersonLastUpdated(value("person", "lastupdated", 7101));
        info.setNationalId("PAT-7101");
        info.setLastName("PatientNew");
        info.setFirstName("First");
        info.setGender("F");
        info.setSTnumber("OLD-ST");
        var contact = new PatientContact();
        contact.setId("7101");
        contact.setPatientId("7101");
        contact.setLastupdated(Timestamp.valueOf(value("patient_contact", "lastupdated", 7101)));
        var person = new Person();
        person.setId("7103");
        person.setLastupdated(Timestamp.valueOf(value("person", "lastupdated", 7103)));
        person.setLastName("ContactNew");
        person.setFirstName("First");
        person.setEmail("new@example.test");
        person.setPrimaryPhone("123");
        contact.setPerson(person);
        info.setPatientContact(contact);
        info.setPatientContactLastUpdated(value("patient_contact", "lastupdated", 7101));
        info.setPatientContactPersonLastUpdated(value("person", "lastupdated", 7103));
        return info;
    }

    protected Patient save(PatientManagementInfo info) {
        return patients.persistPatientMaintenanceData(info, "1");
    }

    protected void expectDenied(PatientManagementInfo info) {
        long before = histories();
        assertThrows(PatientMaintenanceConflictException.class, () -> save(info));
        assertEquals("PatientOld", value("person", "last_name", 7101));
        assertEquals("ContactOld", value("person", "last_name", 7103));
        assertEquals(before, histories());
    }

    protected String value(String table, String column, int id) {
        if ("lastupdated".equals(column))
            return jdbcTemplate
                    .queryForObject("select lastupdated from clinlims." + table + " where id=?", Timestamp.class, id)
                    .toString();
        return jdbcTemplate.queryForObject("select " + column + "::text from clinlims." + table + " where id=?",
                String.class, id);
    }

    protected long histories() {
        return jdbcTemplate.queryForObject("select count(*) from clinlims.history", Long.class);
    }

    protected void assertAudit(String table, String id, String expected) {
        var audits = jdbcTemplate.queryForList(
                "select h.sys_user_id,h.changes from clinlims.history h join clinlims.reference_tables r on r.id=h.reference_table where upper(r.name)=? and h.reference_id=? and h.activity='U'",
                table, Integer.parseInt(id));
        assertTrue("Audit actor must be authoritative",
                audits.stream().allMatch(row -> "1".equals(row.get("sys_user_id").toString())));
        assertTrue("Missing correct old-value audit for " + table + "/" + id + ": " + expected, audits.stream()
                .anyMatch(row -> new String((byte[]) row.get("changes"), StandardCharsets.UTF_8).contains(expected)));
    }
}

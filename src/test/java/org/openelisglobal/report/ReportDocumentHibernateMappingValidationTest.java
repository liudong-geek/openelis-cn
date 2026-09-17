package org.openelisglobal.report;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.hibernate.boot.Metadata;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.hibernate.dialect.PostgreSQLDialect;
import org.hibernate.engine.jdbc.connections.spi.ConnectionProvider;
import org.hibernate.engine.spi.CascadingActions;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.id.enhanced.DatabaseStructure;
import org.hibernate.jpa.event.spi.CallbackRegistry;
import org.hibernate.jpa.event.spi.CallbackType;
import org.hibernate.mapping.Column;
import org.hibernate.mapping.ForeignKey;
import org.hibernate.mapping.ManyToOne;
import org.hibernate.mapping.OneToMany;
import org.hibernate.mapping.PersistentClass;
import org.hibernate.mapping.Property;
import org.hibernate.mapping.SimpleValue;
import org.hibernate.mapping.Table;
import org.hibernate.mapping.UniqueKey;
import org.hibernate.mapping.Value;
import org.hibernate.persister.collection.CollectionPersister;
import org.hibernate.persister.entity.EntityPersister;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.openelisglobal.common.valueholder.BaseObject;
import org.openelisglobal.hibernate.resources.StringSequenceGenerator;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.ReportDocument;
import org.openelisglobal.report.valueholder.ReportDocumentMember;

/**
 * Real Hibernate bootstrap and metadata checks for the persisted report identity
 * foundation. No session, transaction, schema action, or database is permitted.
 * This does not establish resolver, release, migration, or business acceptance.
 */
public class ReportDocumentHibernateMappingValidationTest {

    private static final RefusingConnectionProvider CONNECTIONS = new RefusingConnectionProvider();
    private static StandardServiceRegistry registry;
    private static Metadata metadata;
    private static SessionFactoryImplementor sessionFactory;

    @BeforeClass
    public static void buildRealSessionFactoryWithoutDatabase() {
        registry = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.dialect", PostgreSQLDialect.class.getName())
                .applySetting("hibernate.temp.use_jdbc_metadata_defaults", "false")
                .applySetting("hibernate.hbm2ddl.auto", "none")
                .applySetting("jakarta.persistence.schema-generation.database.action", "none")
                .applySetting("javax.persistence.schema-generation.database.action", "none")
                .applySetting("hibernate.cache.use_second_level_cache", "false")
                .applySetting("hibernate.cache.use_query_cache", "false")
                .applySetting("hibernate.search.enabled", "false")
                .addService(ConnectionProvider.class, CONNECTIONS).build();
        metadata = new MetadataSources(registry).addAnnotatedClass(ReportDocument.class)
                .addAnnotatedClass(ReportDocumentMember.class).addAnnotatedClass(PatientReportRelease.class)
                .buildMetadata();
        sessionFactory = (SessionFactoryImplementor) metadata.buildSessionFactory();
        assertNoConnectionAttempts();
    }

    @After
    public void noTestMayRequestAConnection() {
        assertNoConnectionAttempts();
    }

    @AfterClass
    public static void closeWithoutDatabase() {
        try {
            if (sessionFactory != null) {
                sessionFactory.close();
            }
        } finally {
            try {
                if (registry != null) {
                    StandardServiceRegistryBuilder.destroy(registry);
                }
            } finally {
                assertNoConnectionAttempts();
            }
        }
    }

    @Test
    public void bootstrapsAllThreeEntitiesTogetherWithNoDatabaseOrCache() {
        assertFalse(sessionFactory.isClosed());
        assertSame(CONNECTIONS, registry.getService(ConnectionProvider.class));
        assertEquals(3, metadata.getEntityBindings().size());
        assertEquals(3, sessionFactory.getMetamodel().getEntities().size());
        assertTable(ReportDocument.class, "report_document");
        assertTable(ReportDocumentMember.class, "report_document_member");
        assertTable(PatientReportRelease.class, "patient_report_release");
        for (Class<?> entity : Arrays.asList(ReportDocument.class, ReportDocumentMember.class,
                PatientReportRelease.class)) {
            assertFalse(persister(entity).hasCache());
        }
    }

    @Test
    public void bothNewIdsUseNumericStringMappingAndTheRealStringSequenceGenerator() {
        for (Class<?> entity : Arrays.asList(ReportDocument.class, ReportDocumentMember.class)) {
            PersistentClass mapping = entity(entity);
            assertEquals("id", mapping.getIdentifierProperty().getName());
            assertEquals(String.class, mapping.getIdentifier().getType().getReturnedClass());
            assertNumeric10(column(mapping.getIdentifier()), "id");
            assertTrue(entity.getSimpleName(), persister(entity).getIdentifierGenerator() instanceof StringSequenceGenerator);
            DatabaseStructure sequence = ((StringSequenceGenerator) persister(entity).getIdentifierGenerator())
                    .getDatabaseStructure();
            assertTrue(sequence.isPhysicalSequence());
            assertEquals("clinlims", sequence.getPhysicalName().getSchemaName().getText());
            assertEquals(entity == ReportDocument.class ? "report_document_seq" : "report_document_member_seq",
                    sequence.getPhysicalName().getObjectName().getText());
            assertEquals(1, sequence.getIncrementSize());
            assertEquals("Reading generator metadata must not consume a sequence value", 0, sequence.getTimesAccessed());
        }
    }

    @Test
    public void documentOwnershipAndCreatorAreRequiredNumericStringIds() {
        assertNumericStringProperty(ReportDocument.class, "patientId", "patient_id");
        assertNumericStringProperty(ReportDocument.class, "sampleId", "sample_id");
        assertNumericStringProperty(ReportDocument.class, "createdBy", "created_by");
    }

    @Test
    public void documentGroupRuleAndNumberHaveTheContractedStringWidths() {
        assertVarcharProperty("reportGroupKey", "report_group_key", 128);
        assertVarcharProperty("groupRuleVersion", "group_rule_version", 64);
        assertVarcharProperty("reportNumber", "report_number", 50);
    }

    @Test
    public void documentUuidAndCreationTimeHaveNativeRequiredTypes() {
        Property uuid = property(ReportDocument.class, "fhirUuid");
        assertEquals(UUID.class, uuid.getType().getReturnedClass());
        assertColumn(column(uuid.getValue()), "fhir_uuid", Types.OTHER);
        assertEquals("uuid", column(uuid.getValue()).getSqlType(new PostgreSQLDialect(), metadata));
        Property created = property(ReportDocument.class, "createdAt");
        assertEquals(Timestamp.class, sessionFactory.getMetamodel().entity(ReportDocument.class)
                .getSingularAttribute("createdAt").getJavaType());
        assertColumn(column(created.getValue()), "created_at", Types.TIMESTAMP);
    }

    @Test
    public void documentIdentityAndCreationProvenanceCannotBeUpdatedByHibernate() {
        for (String name : Arrays.asList("patientId", "sampleId", "reportGroupKey", "groupRuleVersion", "reportNumber",
                "fhirUuid", "createdBy", "createdAt")) {
            assertImmutableInsertableProperty(ReportDocument.class, name);
        }
    }

    @Test
    public void documentUniquenessUsesStableSampleAndGroupNotRuleVersion() {
        Set<Set<String>> expected = new HashSet<>();
        expected.add(names("sample_id", "report_group_key"));
        expected.add(names("report_number"));
        expected.add(names("fhir_uuid"));
        assertEquals(expected, uniqueColumnSets(entity(ReportDocument.class).getTable()));
    }

    @Test
    public void memberAnalysisAndPositionHaveRequiredContractedTypes() {
        assertNumericStringProperty(ReportDocumentMember.class, "analysisId", "analysis_id");
        Property position = property(ReportDocumentMember.class, "memberPosition");
        assertEquals(Integer.class, position.getType().getReturnedClass());
        assertColumn(column(position.getValue()), "member_position", Types.INTEGER);
        Set<String> checks = new HashSet<>();
        Iterator<String> constraints = entity(ReportDocumentMember.class).getTable().getCheckConstraintsIterator();
        while (constraints.hasNext()) {
            checks.add(constraints.next().replaceAll("\\s+", "").toLowerCase(Locale.ROOT));
        }
        assertTrue("Hibernate must carry the non-negative member position CHECK", checks.contains("member_position>=0"));
    }

    @Test
    public void memberDocumentIsMandatoryLazyAndOwnsTheNumericForeignKey() {
        Property document = property(ReportDocumentMember.class, "document");
        assertTrue(document.getValue() instanceof ManyToOne);
        ManyToOne relation = (ManyToOne) document.getValue();
        assertEquals(ReportDocument.class.getName(), relation.getReferencedEntityName());
        assertTrue(relation.isLazy());
        assertTrue(relation.isReferenceToPrimaryKey());
        assertFalse(document.isOptional());
        assertNumeric10(column(relation), "report_document_id");
        assertFalse(relation.isCascadeDeleteEnabled());
        assertFalse(document.getCascadeStyle().doCascade(CascadingActions.DELETE));

        int documentForeignKeys = 0;
        Iterator<ForeignKey> foreignKeys = entity(ReportDocumentMember.class).getTable().getForeignKeyIterator();
        while (foreignKeys.hasNext()) {
            ForeignKey key = foreignKeys.next();
            if (columnNames(key.getColumnIterator()).equals(names("report_document_id"))) {
                documentForeignKeys++;
                assertSame(entity(ReportDocument.class).getTable(), key.getReferencedTable());
                assertFalse(key.isCascadeDeleteEnabled());
            }
        }
        assertEquals("The owning member column must produce one real document FK", 1, documentForeignKeys);
    }

    @Test
    public void memberDocumentAndAnalysisCannotBeReassignedByHibernate() {
        assertImmutableInsertableProperty(ReportDocumentMember.class, "document");
        assertImmutableInsertableProperty(ReportDocumentMember.class, "analysisId");
    }

    @Test
    public void memberUniquenessIsPerDocumentAndDoesNotGloballyReserveAnAnalysis() {
        Set<Set<String>> expected = new HashSet<>();
        expected.add(names("report_document_id", "analysis_id"));
        expected.add(names("report_document_id", "member_position"));
        assertEquals(expected, uniqueColumnSets(entity(ReportDocumentMember.class).getTable()));
    }

    @Test
    public void documentMembersAreAnInverseLazyOrderedListUsingTheExistingMemberForeignKey() {
        org.hibernate.mapping.Collection members = members();
        assertTrue(members.isInverse());
        assertTrue(members.isLazy());
        assertTrue(members.isOneToMany());
        assertEquals("document", members.getMappedByProperty());
        assertEquals(ReportDocument.class.getName(), members.getOwnerEntityName());
        assertSame(entity(ReportDocumentMember.class).getTable(), members.getCollectionTable());
        assertEquals(names("report_document_id"), columnNames(members.getKey().getColumnIterator()));
        assertTrue(members.getElement() instanceof OneToMany);
        assertEquals(ReportDocumentMember.class.getName(), ((OneToMany) members.getElement()).getReferencedEntityName());
        assertEquals(ReportDocumentMember.class, sessionFactory.getMetamodel().entity(ReportDocument.class)
                .getList("members", ReportDocumentMember.class).getElementType().getJavaType());

        // Hibernate may retain the HQL property or its resolved physical column here.
        assertNotNull(members.getOrderBy());
        String order = members.getOrderBy().trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
        assertTrue("Only memberPosition ASC is permitted: " + order,
                order.equals("memberposition asc") || order.equals("member_position asc"));
        CollectionPersister runtime = sessionFactory.getMetamodel().collectionPersister(members.getRole());
        assertTrue(runtime.hasOrdering());
        assertTrue(runtime.isInverse());
        assertTrue(runtime.isLazy());
    }

    @Test
    public void documentMembersNeverCascadeRemovalOrOrphanDeletion() {
        org.hibernate.mapping.Collection members = members();
        assertFalse(property(ReportDocument.class, "members").getCascadeStyle().doCascade(CascadingActions.DELETE));
        assertFalse(members.hasOrphanDelete());
        assertFalse(members.getKey().isCascadeDeleteEnabled());
        CollectionPersister runtime = sessionFactory.getMetamodel().collectionPersister(members.getRole());
        assertFalse(runtime.hasOrphanDelete());
        assertFalse(runtime.isCascadeDeleteEnabled());
        assertFalse(runtime.hasCache());
    }

    @Test
    public void allThreeEntitiesRetainOnlyTheInheritedLastUpdatedVersion() {
        for (Class<?> type : Arrays.asList(ReportDocument.class, ReportDocumentMember.class, PatientReportRelease.class)) {
            PersistentClass mapping = entity(type);
            assertTrue(mapping.isVersioned());
            assertEquals("lastupdated", mapping.getVersion().getName());
            assertEquals("last_updated", column(mapping.getVersion().getValue()).getName());
            // Hibernate 5.6 TimestampType reports Date; JDBC and mapped Java types
            // together verify the existing BaseObject Timestamp contract.
            assertEquals(Types.TIMESTAMP, column(mapping.getVersion().getValue()).getSqlTypeCode(metadata));
            assertEquals(Timestamp.class, sessionFactory.getMetamodel().entity(type)
                    .getSingularAttribute("lastupdated").getJavaType());
            assertEquals(BaseObject.class, mapping.getSuperMappedSuperclass().getMappedClass());
            assertEquals(BaseObject.class, sessionFactory.getMetamodel().entity(type).getVersion(Timestamp.class)
                    .getDeclaringType().getJavaType());
            int versionProperties = 0;
            Iterator<?> properties = mapping.getPropertyClosureIterator();
            while (properties.hasNext()) {
                Property property = (Property) properties.next();
                if (property.getValue() instanceof SimpleValue && ((SimpleValue) property.getValue()).isVersion()) {
                    versionProperties++;
                }
            }
            assertEquals(type.getSimpleName(), 1, versionProperties);
            EntityPersister runtime = persister(type);
            assertTrue(runtime.isVersioned());
            assertEquals("lastupdated", runtime.getPropertyNames()[runtime.getVersionProperty()]);
        }
    }

    @Test
    public void foundationTablesDoNotIntroduceResultSnapshotsOrAParallelReleaseLifecycle() {
        assertEquals(names("id", "patient_id", "sample_id", "report_group_key", "group_rule_version", "report_number",
                "fhir_uuid", "created_by", "created_at", "group_rules_json", "group_rules_sha256", "last_updated"),
                columnNames(entity(ReportDocument.class).getTable().getColumnIterator()));
        assertEquals(names("id", "report_document_id", "analysis_id", "member_position", "last_updated"),
                columnNames(entity(ReportDocumentMember.class).getTable().getColumnIterator()));
        assertTrue("The existing release mapping still owns issuance lifecycle", entity(PatientReportRelease.class)
                .hasProperty("issuedAt"));
        assertTrue("The existing release mapping still owns PDF content", entity(PatientReportRelease.class)
                .hasProperty("pdfContent"));
    }

    @Test
    public void registeredPrePersistCreatesAMissingUuidAndRepeatedCallbacksKeepTheIdentity() {
        ReportDocument document = simCallbackDocument();
        document.setFhirUuid(null);
        assertNull(document.getFhirUuid());
        Map<String, Object> expected = persistentValues(ReportDocument.class, document);
        String expectedId = document.getId();

        prePersistCallbacks().preCreate(document);

        UUID generated = document.getFhirUuid();
        assertNotNull("The registered Hibernate callback must create the missing UUID", generated);
        expected.put("fhirUuid", generated);
        assertEquals(expected, persistentValues(ReportDocument.class, document));
        assertEquals(expectedId, document.getId());

        prePersistCallbacks().preCreate(document);

        assertEquals("A repeated callback must retain the same generated identity", generated, document.getFhirUuid());
        assertEquals(expected, persistentValues(ReportDocument.class, document));
        assertEquals(expectedId, document.getId());
    }

    @Test
    public void registeredPrePersistPreservesAnExplicitUuidAndAllOtherPersistentFields() {
        ReportDocument document = simCallbackDocument();
        UUID supplied = UUID.fromString("bcb1a3fe-14b7-4b02-8177-ef21f4c0a831");
        document.setFhirUuid(supplied);
        Map<String, Object> expected = persistentValues(ReportDocument.class, document);
        String expectedId = document.getId();

        prePersistCallbacks().preCreate(document);
        prePersistCallbacks().preCreate(document);

        assertEquals(supplied, document.getFhirUuid());
        assertEquals(expected, persistentValues(ReportDocument.class, document));
        assertEquals(expectedId, document.getId());
    }

    @Test
    public void simDocumentAccessorsAndHibernateFieldProjectionKeepDistinctOwnershipAndProvenance() {
        List<ReportDocumentMember> firstMembers = List.of(simMember("5101", new ReportDocument(), "6101", 0,
                Timestamp.valueOf("2026-09-10 09:01:01")));
        List<ReportDocumentMember> secondMembers = List.of(simMember("5102", new ReportDocument(), "6102", 4,
                Timestamp.valueOf("2026-09-10 10:02:02")));
        Map<String, Object> firstValues = new LinkedHashMap<>(Map.of("patientId", "2101", "sampleId", "3101", "reportGroupKey", "SIM_HEM",
                "groupRuleVersion", "SIM_RULE_A", "reportNumber", "SIM-RPT-A", "fhirUuid",
                UUID.fromString("ddf79c96-7b0e-434f-94a8-3d8d62c7c080"), "createdBy", "4101", "createdAt",
                Timestamp.valueOf("2026-09-10 09:00:00"), "members", firstMembers, "lastupdated",
                Timestamp.valueOf("2026-09-10 09:01:00")));
        firstValues.put("groupRulesJson", "{\"ruleVersion\":\"SIM_RULE_A\"}");
        firstValues.put("groupRulesSha256", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        Map<String, Object> secondValues = new LinkedHashMap<>(Map.of("patientId", "2102", "sampleId", "3102", "reportGroupKey", "SIM_CHEM",
                "groupRuleVersion", "SIM_RULE_B", "reportNumber", "SIM-RPT-B", "fhirUuid",
                UUID.fromString("4025d4e5-7d6c-4a2b-8876-454a7fa192d9"), "createdBy", "4102", "createdAt",
                Timestamp.valueOf("2026-09-10 10:00:00"), "members", secondMembers, "lastupdated",
                Timestamp.valueOf("2026-09-10 10:02:00")));
        secondValues.put("groupRulesJson", "{\"ruleVersion\":\"SIM_RULE_B\"}");
        secondValues.put("groupRulesSha256", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

        ReportDocument first = simDocument("1101", firstValues);
        ReportDocument second = simDocument("1102", secondValues);
        firstMembers.get(0).setDocument(first);
        secondMembers.get(0).setDocument(second);

        assertDocumentProjection("1101", firstValues, first);
        assertDocumentProjection("1102", secondValues, second);
    }

    @Test
    public void simMemberAccessorsAndHibernateFieldProjectionKeepDistinctDocumentsAndAnalyses() {
        ReportDocument firstDocument = simCallbackDocument();
        ReportDocument secondDocument = simCallbackDocument();
        secondDocument.setId("1102");
        secondDocument.setPatientId("2102");
        secondDocument.setSampleId("3102");
        Timestamp firstUpdated = Timestamp.valueOf("2026-09-10 09:01:01");
        Timestamp secondUpdated = Timestamp.valueOf("2026-09-10 10:02:02");
        ReportDocumentMember first = simMember("5101", firstDocument, "6101", 0, firstUpdated);
        ReportDocumentMember second = simMember("5102", secondDocument, "6102", 4, secondUpdated);

        assertMemberProjection("5101", Map.of("document", firstDocument, "analysisId", "6101", "memberPosition", 0,
                "lastupdated", firstUpdated), first);
        assertMemberProjection("5102", Map.of("document", secondDocument, "analysisId", "6102", "memberPosition", 4,
                "lastupdated", secondUpdated), second);
        assertSame(firstDocument, first.getDocument());
        assertSame(secondDocument, second.getDocument());
    }

    private static CallbackRegistry prePersistCallbacks() {
        CallbackRegistry callbacks = sessionFactory.getEventEngine().getCallbackRegistry();
        assertTrue("The entity annotation must register a real Hibernate pre-persist callback",
                callbacks.hasRegisteredCallbacks(ReportDocument.class, CallbackType.PRE_PERSIST));
        return callbacks;
    }

    private static ReportDocument simCallbackDocument() {
        Map<String, Object> values = new LinkedHashMap<>(Map.of("patientId", "2101", "sampleId", "3101", "reportGroupKey", "SIM_HEM",
                "groupRuleVersion", "SIM_RULE_A", "reportNumber", "SIM-CALLBACK-001", "fhirUuid",
                UUID.fromString("caf2536b-c991-4281-92e3-654f976be07a"), "createdBy", "4101", "createdAt",
                Timestamp.valueOf("2026-09-10 09:00:00"), "members", List.of(), "lastupdated",
                Timestamp.valueOf("2026-09-10 09:01:00")));
        values.put("groupRulesJson", "{\"ruleVersion\":\"SIM_RULE_A\"}");
        values.put("groupRulesSha256", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        return simDocument("1101", values);
    }

    private static ReportDocument simDocument(String id, Map<String, Object> values) {
        ReportDocument document = new ReportDocument();
        document.setId(id);
        document.setPatientId((String) values.get("patientId"));
        document.setSampleId((String) values.get("sampleId"));
        document.setReportGroupKey((String) values.get("reportGroupKey"));
        document.setGroupRuleVersion((String) values.get("groupRuleVersion"));
        document.setGroupRulesJson((String) values.get("groupRulesJson"));
        document.setGroupRulesSha256((String) values.get("groupRulesSha256"));
        document.setReportNumber((String) values.get("reportNumber"));
        document.setFhirUuid((UUID) values.get("fhirUuid"));
        document.setCreatedBy((String) values.get("createdBy"));
        document.setCreatedAt((Timestamp) values.get("createdAt"));
        List<?> suppliedMembers = (List<?>) values.get("members");
        List<ReportDocumentMember> members = new java.util.ArrayList<>();
        for (Object member : suppliedMembers) {
            members.add((ReportDocumentMember) member);
        }
        document.setMembers(members);
        document.setLastupdated((Timestamp) values.get("lastupdated"));
        return document;
    }

    private static ReportDocumentMember simMember(String id, ReportDocument document, String analysisId, int position,
            Timestamp updated) {
        ReportDocumentMember member = new ReportDocumentMember();
        member.setId(id);
        member.setDocument(document);
        member.setAnalysisId(analysisId);
        member.setMemberPosition(position);
        member.setLastupdated(updated);
        return member;
    }

    private static void assertDocumentProjection(String id, Map<String, Object> expected, ReportDocument document) {
        Map<String, Object> accessors = new LinkedHashMap<>();
        accessors.put("patientId", document.getPatientId());
        accessors.put("sampleId", document.getSampleId());
        accessors.put("reportGroupKey", document.getReportGroupKey());
        accessors.put("groupRuleVersion", document.getGroupRuleVersion());
        accessors.put("groupRulesJson", document.getGroupRulesJson());
        accessors.put("groupRulesSha256", document.getGroupRulesSha256());
        accessors.put("reportNumber", document.getReportNumber());
        accessors.put("fhirUuid", document.getFhirUuid());
        accessors.put("createdBy", document.getCreatedBy());
        accessors.put("createdAt", document.getCreatedAt());
        accessors.put("members", document.getMembers());
        accessors.put("lastupdated", document.getLastupdated());
        assertEquals(id, document.getId());
        assertEquals(id, persister(ReportDocument.class).getIdentifier(document, null));
        assertEquals("Public accessors must retain each independently supplied SIM field", expected, accessors);
        assertEquals("Hibernate must project those same fields to the correct persistent properties", expected,
                persistentValues(ReportDocument.class, document));
    }

    private static void assertMemberProjection(String id, Map<String, Object> expected, ReportDocumentMember member) {
        Map<String, Object> accessors = new LinkedHashMap<>();
        accessors.put("document", member.getDocument());
        accessors.put("analysisId", member.getAnalysisId());
        accessors.put("memberPosition", member.getMemberPosition());
        accessors.put("lastupdated", member.getLastupdated());
        assertEquals(id, member.getId());
        assertEquals(id, persister(ReportDocumentMember.class).getIdentifier(member, null));
        assertEquals("Public accessors must retain each independently supplied SIM field", expected, accessors);
        assertEquals("Hibernate must project those same fields to the correct persistent properties", expected,
                persistentValues(ReportDocumentMember.class, member));
    }

    private static Map<String, Object> persistentValues(Class<?> type, Object value) {
        EntityPersister runtime = persister(type);
        String[] names = runtime.getPropertyNames();
        Object[] values = runtime.getPropertyValues(value);
        assertEquals(names.length, values.length);
        Map<String, Object> result = new LinkedHashMap<>();
        for (int index = 0; index < names.length; index++) {
            result.put(names[index], values[index]);
        }
        return result;
    }

    private static PersistentClass entity(Class<?> type) {
        PersistentClass result = metadata.getEntityBinding(type.getName());
        assertNotNull(type.getName(), result);
        return result;
    }

    private static EntityPersister persister(Class<?> type) {
        return sessionFactory.getMetamodel().entityPersister(type);
    }

    private static Property property(Class<?> type, String name) {
        return entity(type).getProperty(name);
    }

    private static org.hibernate.mapping.Collection members() {
        Property property = property(ReportDocument.class, "members");
        assertTrue(property.getValue() instanceof org.hibernate.mapping.Collection);
        return (org.hibernate.mapping.Collection) property.getValue();
    }

    private static void assertTable(Class<?> type, String name) {
        Table table = entity(type).getTable();
        assertEquals(name, table.getName());
        assertEquals("clinlims", table.getSchema());
    }

    private static Column column(Value value) {
        assertEquals("A scalar or owning relation must map exactly one column", 1, value.getColumnSpan());
        Object selectable = value.getColumnIterator().next();
        assertTrue("A formula cannot substitute for a persisted column", selectable instanceof Column);
        return (Column) selectable;
    }

    private static void assertColumn(Column column, String name, int jdbcType) {
        assertEquals(name, column.getName());
        assertEquals(name, jdbcType, column.getSqlTypeCode(metadata));
        assertFalse(name + " must be required", column.isNullable());
    }

    private static void assertNumeric10(Column column, String name) {
        assertColumn(column, name, Types.NUMERIC);
        assertEquals(name, 10, column.getPrecision());
        assertEquals(name, 0, column.getScale());
    }

    private static void assertNumericStringProperty(Class<?> type, String name, String columnName) {
        Property property = property(type, name);
        assertEquals(name, String.class, property.getType().getReturnedClass());
        assertNumeric10(column(property.getValue()), columnName);
    }

    private static void assertVarcharProperty(String name, String columnName, int length) {
        Property property = property(ReportDocument.class, name);
        assertEquals(name, String.class, property.getType().getReturnedClass());
        Column column = column(property.getValue());
        assertColumn(column, columnName, Types.VARCHAR);
        assertEquals(name, length, column.getLength());
    }

    private static void assertImmutableInsertableProperty(Class<?> type, String name) {
        Property property = property(type, name);
        assertTrue(name + " must be persisted on creation", property.isInsertable());
        assertFalse(name + " must not be changed by an ORM update", property.isUpdateable());
        EntityPersister runtime = persister(type);
        int index = Arrays.asList(runtime.getPropertyNames()).indexOf(name);
        assertTrue(name + " must be in the runtime persister", index >= 0);
        assertTrue(name, runtime.getPropertyInsertability()[index]);
        assertFalse(name, runtime.getPropertyUpdateability()[index]);
    }

    private static Set<Set<String>> uniqueColumnSets(Table table) {
        Set<Set<String>> result = new HashSet<>();
        Iterator<UniqueKey> keys = table.getUniqueKeyIterator();
        while (keys.hasNext()) {
            result.add(columnNames(keys.next().getColumnIterator()));
        }
        // @Column(unique=true) is also a uniqueness contract in Hibernate metadata.
        Iterator<Column> columns = table.getColumnIterator();
        while (columns.hasNext()) {
            Column column = columns.next();
            if (column.isUnique()) {
                result.add(names(column.getName()));
            }
        }
        return result;
    }

    private static Set<String> columnNames(Iterator<?> columns) {
        Set<String> result = new HashSet<>();
        while (columns.hasNext()) {
            Object column = columns.next();
            assertTrue(column instanceof Column);
            result.add(((Column) column).getName());
        }
        return result;
    }

    private static Set<String> names(String... names) {
        return new HashSet<>(Arrays.asList(names));
    }

    private static void assertNoConnectionAttempts() {
        assertEquals("ORM mapping validation must never ask for a database connection", 0,
                CONNECTIONS.openAttempts.get());
        assertEquals("No real connection may reach this provider", 0, CONNECTIONS.closeAttempts.get());
    }

    public static final class RefusingConnectionProvider implements ConnectionProvider {
        private static final long serialVersionUID = 1L;
        private final AtomicInteger openAttempts = new AtomicInteger();
        private final AtomicInteger closeAttempts = new AtomicInteger();

        @Override
        public Connection getConnection() throws SQLException {
            openAttempts.incrementAndGet();
            throw new SQLException("Database connections are forbidden in this ORM metadata test");
        }

        @Override
        public void closeConnection(Connection connection) throws SQLException {
            closeAttempts.incrementAndGet();
            throw new SQLException("No connection can be supplied to this ORM metadata test");
        }

        @Override
        public boolean supportsAggressiveRelease() {
            return false;
        }

        @Override
        public boolean isUnwrappableAs(Class unwrapType) {
            return unwrapType.isInstance(this);
        }

        @Override
        public <T> T unwrap(Class<T> unwrapType) {
            if (isUnwrappableAs(unwrapType)) {
                return unwrapType.cast(this);
            }
            throw new IllegalArgumentException("No other connection provider is available");
        }
    }
}

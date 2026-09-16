package org.openelisglobal.report;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import jakarta.persistence.Column;
import jakarta.persistence.JoinColumn;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.SchemaFactory;
import org.junit.BeforeClass;
import org.junit.Test;
import org.openelisglobal.report.valueholder.ReportDocument;
import org.openelisglobal.report.valueholder.ReportDocumentMember;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;

/**
 * Offline draft structure checks, NOT executed migration or constraint tests.
 */
public class ReportDocumentMigrationDraftTest {
    private static final Path DRAFT = Path
            .of("src/main/resources/liquibase/3.5.x.x/081-report-document-foundation.xml");
    private static final String NS = "http://www.liquibase.org/xml/ns/dbchangelog";
    private static Document document;

    @BeforeClass
    public static void parseWithoutExternalResources() throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        document = factory.newDocumentBuilder().parse(DRAFT.toFile());
    }

    @Test
    public void draftConformsToBundledLiquibaseSchemaWithoutNetwork() throws Exception {
        SchemaFactory factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        try (InputStream xsd = getClass().getClassLoader()
                .getResourceAsStream("www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.8.xsd")) {
            assertNotNull("Use the exact locally bundled Liquibase schema", xsd);
            factory.newSchema(new StreamSource(xsd)).newValidator().validate(new StreamSource(DRAFT.toFile()));
        }
    }

    @Test
    public void onlyNewDocumentAndCurrentMemberTablesAreIntroduced() {
        assertEquals(Set.of("report_document", "report_document_member"), tableNames());
        assertEquals(1, elements("changeSet").size());
        assertEquals("lis-cn-081-report-document-foundation", elements("changeSet").get(0).getAttribute("id"));
        for (String operation : List.of("addColumn", "modifyDataType", "dropUniqueConstraint", "insert", "update",
                "delete", "dropTable")) {
            assertTrue("No old-table mutations or unconditional drop: " + operation, elements(operation).isEmpty());
        }
    }

    @Test
    public void draftTablesAgreeWithAllMappedScalarAndRelationshipColumns() {
        assertEquals(mappedColumns(ReportDocument.class), columns("report_document").keySet());
        assertEquals(mappedColumns(ReportDocumentMember.class), columns("report_document_member").keySet());
    }

    @Test
    public void stableGroupIdentityDoesNotIncludeRuleVersionOrPatientAlone() {
        assertEquals(Set.of("sample_id,report_group_key", "report_number", "fhir_uuid"), uniqueKeys("report_document"));
        assertEquals(Set.of("report_document_id,analysis_id", "report_document_id,member_position"),
                uniqueKeys("report_document_member"));
    }

    @Test
    public void numericRelationsAndImmutableProvenanceHaveRequiredColumns() {
        Map<String, Element> doc = columns("report_document");
        for (String column : List.of("id", "patient_id", "sample_id", "created_by")) {
            assertColumn(doc, column, "NUMERIC(10)", false);
        }
        assertColumn(doc, "report_group_key", "VARCHAR(128)", false);
        assertColumn(doc, "group_rule_version", "VARCHAR(64)", false);
        assertColumn(doc, "report_number", "VARCHAR(50)", false);
        assertColumn(doc, "fhir_uuid", "UUID", false);
        assertColumn(doc, "created_at", "TIMESTAMP", false);
        assertColumn(doc, "last_updated", "TIMESTAMP", false);
        Map<String, Element> member = columns("report_document_member");
        for (String column : List.of("id", "report_document_id", "analysis_id")) {
            assertColumn(member, column, "NUMERIC(10)", false);
        }
        assertColumn(member, "member_position", "INTEGER", false);
        assertColumn(member, "last_updated", "TIMESTAMP", false);
    }

    @Test
    public void foreignKeyDraftsReferenceRealIdentityTablesWithoutCascadeDelete() {
        Set<String> actual = new HashSet<>();
        for (Element fk : elements("addForeignKeyConstraint")) {
            assertEquals("clinlims", fk.getAttribute("baseTableSchemaName"));
            assertEquals("clinlims", fk.getAttribute("referencedTableSchemaName"));
            assertEquals("RESTRICT", fk.getAttribute("onDelete"));
            actual.add(fk.getAttribute("baseTableName") + "." + fk.getAttribute("baseColumnNames") + "->"
                    + fk.getAttribute("referencedTableName") + "." + fk.getAttribute("referencedColumnNames"));
        }
        assertEquals(Set.of("report_document.patient_id->patient.id", "report_document.sample_id->sample.id",
                "report_document.created_by->system_user.id",
                "report_document_member.report_document_id->report_document.id",
                "report_document_member.analysis_id->analysis.id"), actual);
    }

    @Test
    public void unverifiedSchemaCannotBeSilentlyMarkedRanOrChangeExistingRelease() {
        List<Element> conditions = elements("preConditions");
        assertEquals(1, conditions.size());
        assertEquals("HALT", conditions.get(0).getAttribute("onFail"));
        assertEquals("HALT", conditions.get(0).getAttribute("onError"));
        assertEquals("postgresql", elements("dbms").get(0).getAttribute("type"));
        assertEquals(2, elements("sequenceExists").size());
        assertEquals(2, elements("tableExists").size());
        for (Element check : elements("tableExists")) {
            assertEquals("not", check.getParentNode().getLocalName());
        }
    }

    @Test
    public void rollbackDraftRefusesNonemptyTablesAndDoesNotTouchLegacyRows() {
        List<Element> rollbacks = elements("rollback");
        assertEquals(1, rollbacks.size());
        String sql = rollbacks.get(0).getTextContent();
        // These inspect safety intent only; PostgreSQL must still execute the
        // empty/nonempty/concurrent rollback scenarios before registration.
        assertTrue(sql.contains("ACCESS EXCLUSIVE MODE"));
        assertTrue(sql.contains("EXISTS (SELECT 1 FROM clinlims.report_document)"));
        assertTrue(sql.contains("EXISTS (SELECT 1 FROM clinlims.report_document_member)"));
        assertTrue(sql.contains("RAISE EXCEPTION"));
        assertTrue(sql.indexOf("RAISE EXCEPTION") < sql.indexOf("DROP TABLE"));
        assertFalse(sql.contains("CASCADE"));
        assertFalse(sql.contains("patient_report_release"));
    }

    @Test
    public void foundationPrecedesDocumentReleaseMigrationInStartupChangelog() throws Exception {
        String startup = Files.readString(Path.of("src/main/resources/liquibase/3.5.x.x/base.xml"));
        assertTrue(startup.contains("081-report-document-foundation.xml"));
        assertTrue(startup.indexOf("081-report-document-foundation.xml") < startup
                .indexOf("085-report-document-release-scope.xml"));
        assertFalse(startup.contains("includeAll"));
    }

    @Test
    public void draftSequencesMatchStringNumericGeneratorCapacityAndStep() {
        Map<String, String> sequences = new LinkedHashMap<>();
        for (Element sequence : elements("createSequence")) {
            assertEquals("clinlims", sequence.getAttribute("schemaName"));
            assertEquals("1", sequence.getAttribute("startValue"));
            assertEquals("1", sequence.getAttribute("incrementBy"));
            assertEquals("2147483647", sequence.getAttribute("maxValue"));
            sequences.put(sequence.getAttribute("sequenceName"), sequence.getAttribute("maxValue"));
        }
        assertEquals(Set.of("report_document_seq", "report_document_member_seq"), sequences.keySet());
    }

    @Test
    public void draftAndMappingBothDeclareNonnegativeMemberPositions() {
        var check = ReportDocumentMember.class.getAnnotation(org.hibernate.annotations.Check.class);
        assertNotNull(check);
        assertEquals("member_position >= 0", check.constraints());
        List<String> forwardSql = new ArrayList<>();
        for (Element sql : elements("sql")) {
            if ("changeSet".equals(sql.getParentNode().getLocalName())) {
                forwardSql.add(sql.getTextContent().trim().replaceAll("\\s+", " "));
            }
        }
        assertEquals(List.of(
                "ALTER TABLE clinlims.report_document_member ADD CONSTRAINT ck_report_document_member_position CHECK (member_position >= 0)"),
                forwardSql);
    }

    private static void assertColumn(Map<String, Element> columns, String name, String type, boolean nullable) {
        Element element = columns.get(name);
        assertNotNull(name, element);
        assertEquals(name, type, element.getAttribute("type"));
        Element constraints = (Element) element.getElementsByTagNameNS(NS, "constraints").item(0);
        assertNotNull(name, constraints);
        assertEquals(name, Boolean.toString(nullable), constraints.getAttribute("nullable"));
    }

    private static Set<String> mappedColumns(Class<?> entity) {
        Set<String> result = new HashSet<>();
        for (Class<?> type = entity; type != Object.class; type = type.getSuperclass()) {
            for (Field field : type.getDeclaredFields()) {
                Column column = field.getAnnotation(Column.class);
                JoinColumn join = field.getAnnotation(JoinColumn.class);
                if (column != null)
                    result.add(column.name());
                if (join != null)
                    result.add(join.name());
            }
        }
        return result;
    }

    private static Set<String> tableNames() {
        Set<String> names = new HashSet<>();
        for (Element table : elements("createTable"))
            names.add(table.getAttribute("tableName"));
        return names;
    }

    private static Map<String, Element> columns(String name) {
        Map<String, Element> columns = new LinkedHashMap<>();
        for (Element table : elements("createTable")) {
            if (!name.equals(table.getAttribute("tableName")))
                continue;
            for (Node node = table.getFirstChild(); node != null; node = node.getNextSibling()) {
                if (node instanceof Element element && "column".equals(element.getLocalName())) {
                    assertEquals("No duplicate columns", null, columns.put(element.getAttribute("name"), element));
                }
            }
        }
        return columns;
    }

    private static Set<String> uniqueKeys(String table) {
        Set<String> keys = new HashSet<>();
        for (Element key : elements("addUniqueConstraint")) {
            if (table.equals(key.getAttribute("tableName")))
                keys.add(key.getAttribute("columnNames"));
        }
        return keys;
    }

    private static List<Element> elements(String name) {
        List<Element> elements = new ArrayList<>();
        var nodes = document.getElementsByTagNameNS(NS, name);
        for (int i = 0; i < nodes.getLength(); i++)
            elements.add((Element) nodes.item(i));
        return elements;
    }
}

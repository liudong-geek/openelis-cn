package org.openelisglobal.qachecklist.service;

import static org.junit.Assert.*;

import jakarta.persistence.Column;
import jakarta.persistence.Version;
import java.nio.file.Path;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.Test;
import org.openelisglobal.common.valueholder.BaseObject;
import org.openelisglobal.qachecklist.valueholder.SampleQaChecklist;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

/**
 * XML/mapping contract only. Does not run SQL or claim migration/rollback
 * acceptance.
 */
public class QaChecklistConfirmationSchemaTest {
    private static final String ROOT = "src/main/resources/liquibase/3.5.x.x/";

    private Document read(String file) throws Exception {
        var factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        return factory.newDocumentBuilder()
                .parse(Path.of(System.getProperty("qa.confirmation.sourceRoot", "."), ROOT + file).toFile());
    }

    @Test
    public void onlyNullableConfirmationColumnsAreAddedWithoutHistoricalPromotion() throws Exception {
        var migration = read("082-qa-checklist-confirmed-context.xml");
        assertEquals(1, migration.getElementsByTagName("addColumn").getLength());
        var add = (Element) migration.getElementsByTagName("addColumn").item(0);
        assertEquals("clinlims", add.getAttribute("schemaName"));
        assertEquals("sample_qa_checklist", add.getAttribute("tableName"));
        var columns = add.getElementsByTagName("column");
        assertEquals(2, columns.getLength());
        assertEquals("confirmation_id", ((Element) columns.item(0)).getAttribute("name"));
        assertEquals("confirmed_context_json", ((Element) columns.item(1)).getAttribute("name"));
        assertEquals(0, add.getElementsByTagName("constraints").getLength());
        for (String forbidden : new String[] { "update", "delete", "dropColumn", "dropTable", "modifyDataType" }) {
            assertEquals(0, migration.getElementsByTagName(forbidden).getLength());
        }
    }

    @Test
    public void confirmationUniquenessAndEvidencePreservingDowngradeAreExplicit() throws Exception {
        var migration = read("082-qa-checklist-confirmed-context.xml");
        var unique = (Element) migration.getElementsByTagName("addUniqueConstraint").item(0);
        assertEquals("confirmation_id", unique.getAttribute("columnNames"));
        assertTrue(migration.getElementsByTagName("rollback").item(0).getTextContent().contains("RAISE EXCEPTION"));
    }

    @Test
    public void migrationIsRegisteredExactlyOnce() throws Exception {
        var includes = read("base.xml").getElementsByTagName("include");
        int count = 0;
        for (int i = 0; i < includes.getLength(); i++) {
            if ("082-qa-checklist-confirmed-context.xml".equals(((Element) includes.item(i)).getAttribute("file"))) {
                count++;
            }
        }
        assertEquals(1, count);
    }

    @Test
    public void existingJpaVersionIsPreservedAndNewFieldsAreNullable() throws Exception {
        assertNotNull(BaseObject.class.getDeclaredField("lastupdated").getAnnotation(Version.class));
        assertTrue(SampleQaChecklist.class.getDeclaredField("confirmationId").getAnnotation(Column.class).nullable());
        assertTrue(SampleQaChecklist.class.getDeclaredField("confirmedContextJson").getAnnotation(Column.class)
                .nullable());
        for (var field : SampleQaChecklist.class.getDeclaredFields()) {
            assertNull(field.getAnnotation(Version.class));
        }
    }
}

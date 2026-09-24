package org.openelisglobal.common.externalLinks;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.util.List;
import org.dom4j.DocumentException;
import org.junit.Test;
import org.openelisglobal.common.provider.query.ExtendedPatientSearchResults;

public class ExternalPatientSearchResultsXMLConverterSizeTest {

    @Test
    public void converterRejectsOversizedXmlBeforeDomParsing() {
        ExternalPatientSearchResultsXMLConverter converter = new ExternalPatientSearchResultsXMLConverter(32);
        String oversizedMalformedXml = "<".repeat(33);

        assertThrows(ExternalPatientResponseTooLargeException.class,
                () -> converter.convertXMLToSearchResults(oversizedMalformedXml));
    }

    @Test
    public void defaultConverterStillAcceptsOrdinaryResponse() throws Exception {
        String xml = "<ExternalSearch><Patients>" + patientXml("Li") + "</Patients></ExternalSearch>";

        List<ExtendedPatientSearchResults> results = new ExternalPatientSearchResultsXMLConverter()
                .convertXMLToSearchResults(xml);

        assertEquals(1, results.size());
        assertEquals("Li", results.get(0).getFirstName());
    }

    @Test
    public void resultLimitRemainsIndependentFromResponseByteLimit() throws Exception {
        String xml = "<ExternalSearch><Patients>" + patientXml("One") + patientXml("Two")
                + "</Patients></ExternalSearch>";
        ExternalPatientSearchResultsXMLConverter converter = new ExternalPatientSearchResultsXMLConverter(4096);

        List<ExtendedPatientSearchResults> results = converter.convertXMLToSearchResults(xml, 1);

        assertEquals(1, results.size());
        assertEquals("One", results.get(0).getFirstName());
    }

    @Test
    public void missingPatientsContainerIsMalformedInsteadOfAnEmptySuccess() {
        ExternalPatientSearchResultsXMLConverter converter = new ExternalPatientSearchResultsXMLConverter();

        assertThrows(DocumentException.class, () -> converter.convertXMLToSearchResults("<ExternalSearch/>"));
    }

    @Test
    public void invalidDobIsMalformedInsteadOfEscapingAsRuntimeFailure() {
        ExternalPatientSearchResultsXMLConverter converter = new ExternalPatientSearchResultsXMLConverter();
        String xml = "<ExternalSearch><Patients><Patient><DOB year=\"2025\" month=\"2\" day=\"31\"/>"
                + "</Patient></Patients></ExternalSearch>";

        assertThrows(DocumentException.class, () -> converter.convertXMLToSearchResults(xml));
    }

    @Test
    public void doctypeAndInternalEntityExpansionAreRejected() {
        ExternalPatientSearchResultsXMLConverter converter = new ExternalPatientSearchResultsXMLConverter();
        String xml = "<!DOCTYPE ExternalSearch [<!ENTITY repeated \"1234567890\">]>"
                + "<ExternalSearch><Patients><Patient><firstName>&repeated;&repeated;</firstName>"
                + "</Patient></Patients></ExternalSearch>";

        assertThrows(DocumentException.class, () -> converter.convertXMLToSearchResults(xml));
    }

    @Test
    public void externalEntityIsRejectedWithoutResolution() {
        ExternalPatientSearchResultsXMLConverter converter = new ExternalPatientSearchResultsXMLConverter();
        String xml = "<!DOCTYPE ExternalSearch [<!ENTITY xxe SYSTEM \"file:///definitely-not-readable\">]>"
                + "<ExternalSearch><Patients><Patient><firstName>&xxe;</firstName>"
                + "</Patient></Patients></ExternalSearch>";

        assertThrows(DocumentException.class, () -> converter.convertXMLToSearchResults(xml));
    }

    private String patientXml(String firstName) {
        return "<Patient><firstName>" + firstName + "</firstName></Patient>";
    }
}

package org.openelisglobal.common.externalLinks;

import jakarta.xml.soap.SOAPException;
import java.io.ByteArrayInputStream;
import java.io.StringReader;
import javax.xml.XMLConstants;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import org.dom4j.Document;
import org.dom4j.DocumentException;
import org.dom4j.io.SAXReader;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;

/** Secure parsers for untrusted external-patient XML envelopes. */
final class ExternalPatientXmlSecurity {

    private static final String DISALLOW_DOCTYPE = "http://apache.org/xml/features/disallow-doctype-decl";
    private static final String EXTERNAL_GENERAL_ENTITIES = "http://xml.org/sax/features/external-general-entities";
    private static final String EXTERNAL_PARAMETER_ENTITIES = "http://xml.org/sax/features/external-parameter-entities";
    private static final String LOAD_EXTERNAL_DTD = "http://apache.org/xml/features/nonvalidating/load-external-dtd";

    private ExternalPatientXmlSecurity() {
    }

    static Document parseDom4j(String xml) throws DocumentException {
        SAXReader reader = new SAXReader(false);
        try {
            reader.setFeature(DISALLOW_DOCTYPE, true);
            reader.setFeature(EXTERNAL_GENERAL_ENTITIES, false);
            reader.setFeature(EXTERNAL_PARAMETER_ENTITIES, false);
            reader.setFeature(LOAD_EXTERNAL_DTD, false);
            reader.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            reader.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        } catch (SAXException e) {
            throw new DocumentException("Unable to configure secure external patient XML parser", e);
        }
        reader.setEntityResolver((publicId, systemId) -> new InputSource(new StringReader("")));
        return reader.read(new StringReader(xml));
    }

    /**
     * Preflights a bounded SOAP envelope before SAAJ sees it. DTD processing and
     * external entities are disabled, and any DTD declaration is rejected even if
     * the StAX provider elects to report rather than fail it.
     */
    static void requireSoapWithoutDoctype(byte[] xml) throws SOAPException {
        XMLInputFactory factory = XMLInputFactory.newFactory();
        try {
            factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
            factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
            factory.setProperty(XMLInputFactory.IS_REPLACING_ENTITY_REFERENCES, false);
        } catch (IllegalArgumentException e) {
            throw new SOAPException("Unable to configure secure SOAP XML parser", e);
        }

        XMLStreamReader reader = null;
        try {
            reader = factory.createXMLStreamReader(new ByteArrayInputStream(xml));
            while (reader.hasNext()) {
                if (reader.next() == XMLStreamConstants.DTD) {
                    throw new SOAPException("DOCTYPE is not allowed in an external patient SOAP response");
                }
            }
        } catch (XMLStreamException e) {
            throw new SOAPException("Malformed or unsafe external patient SOAP response", e);
        } finally {
            if (reader != null) {
                try {
                    reader.close();
                } catch (XMLStreamException ignored) {
                    // The bounded byte array has no open transport resource.
                }
            }
        }
    }
}

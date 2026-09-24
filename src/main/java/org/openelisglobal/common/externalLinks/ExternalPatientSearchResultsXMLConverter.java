/**
 * The contents of this file are subject to the Mozilla Public License Version 1.1 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy of the
 * License at http://www.mozilla.org/MPL/
 *
 * <p>Software distributed under the License is distributed on an "AS IS" basis, WITHOUT WARRANTY OF
 * ANY KIND, either express or implied. See the License for the specific language governing rights
 * and limitations under the License.
 *
 * <p>The Original Code is OpenELIS code.
 *
 * <p>Copyright (C) The Minnesota Department of Health. All Rights Reserved.
 *
 * <p>Contributor(s): CIRG, University of Washington, Seattle WA.
 */
package org.openelisglobal.common.externalLinks;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.List;
import org.dom4j.Document;
import org.dom4j.DocumentException;
import org.dom4j.Element;
import org.openelisglobal.common.provider.query.ExtendedPatientSearchResults;
import org.openelisglobal.common.util.DateUtil;

public class ExternalPatientSearchResultsXMLConverter {

    private final int maxResponseBytes;

    private static final String ELEMENT_MOTHERS_FIRST_NAME = "mothersFirstName";
    private static final String ATTRIBUTE_YEAR = "year";
    private static final String ATTRIBUTE_MONTH = "month";
    private static final String ATTRIBUTE_DAY = "day";
    private static final String ELEMENT_GUID = "GUID";
    private static final String ELEMENT_DOB = "DOB";
    private static final String ELEMENT_STNUMBER = "STNumber";
    private static final String ELEMENT_NATIONAL_ID = "nationalId";
    private static final String ELEMENT_GENDER = "gender";
    private static final String ELEMENT_LAST_NAME = "lastName";
    private static final String ELEMENT_FIRST_NAME = "firstName";
    private static final String ELEMENT_PATIENT = "Patient";
    private static final String ELEMENT_PATIENTS = "Patients";

    public ExternalPatientSearchResultsXMLConverter() {
        this(ExternalPatientResponseSizeLimiter.DEFAULT_MAX_RESPONSE_BYTES);
    }

    public ExternalPatientSearchResultsXMLConverter(int maxResponseBytes) {
        if (maxResponseBytes < 1) {
            throw new IllegalArgumentException("External patient response byte limit must be positive");
        }
        this.maxResponseBytes = maxResponseBytes;
    }

    @SuppressWarnings("unchecked")
    public List<ExtendedPatientSearchResults> convertXMLToSearchResults(String resultXML) throws DocumentException {
        return convertXMLToSearchResults(resultXML, null);
    }

    public List<ExtendedPatientSearchResults> convertXMLToSearchResults(String resultXML, int maxResults)
            throws DocumentException {
        if (maxResults < 1) {
            throw new IllegalArgumentException("External patient search result limit must be positive");
        }
        return convertXMLToSearchResults(resultXML, Integer.valueOf(maxResults));
    }

    @SuppressWarnings("unchecked")
    private List<ExtendedPatientSearchResults> convertXMLToSearchResults(String resultXML, Integer maxResults)
            throws DocumentException {
        List<ExtendedPatientSearchResults> searchResults = new ArrayList<ExtendedPatientSearchResults>();

        ExternalPatientResponseSizeLimiter.requireUtf8WithinLimit(resultXML, maxResponseBytes);
        Document replyDoc = ExternalPatientXmlSecurity.parseDom4j(resultXML);
        Element root = replyDoc.getRootElement();

        Element patients = root.element(ELEMENT_PATIENTS);
        if (patients == null) {
            throw new DocumentException("External patient response is missing Patients");
        }
        List<Element> patientList = patients.elements(ELEMENT_PATIENT);

        for (Element patientElement : patientList) {
            if (maxResults != null && searchResults.size() >= maxResults) {
                break;
            }
            ExtendedPatientSearchResults result = createSearchResult(patientElement);
            searchResults.add(result);
        }

        return searchResults;
    }

    private ExtendedPatientSearchResults createSearchResult(Element patientElement) throws DocumentException {

        ExtendedPatientSearchResults result = new ExtendedPatientSearchResults();

        result.setFirstName(getValueFor(patientElement, ELEMENT_FIRST_NAME));
        result.setLastName(getValueFor(patientElement, ELEMENT_LAST_NAME));
        result.setGender(getValueFor(patientElement, ELEMENT_GENDER));
        result.setBirthdate(getDOBFromXML(patientElement));
        result.setNationalId(getValueFor(patientElement, ELEMENT_NATIONAL_ID));
        result.setStNumber(getValueFor(patientElement, ELEMENT_STNUMBER));
        result.setGUID(getValueFor(patientElement, ELEMENT_GUID));
        result.setMothersName(getValueFor(patientElement, ELEMENT_MOTHERS_FIRST_NAME));

        return result;
    }

    private String getDOBFromXML(Element patientElement) throws DocumentException {
        Element DOBElement = patientElement.element(ELEMENT_DOB);

        if (DOBElement != null) {
            String day = DOBElement.attributeValue(ATTRIBUTE_DAY);
            String month = DOBElement.attributeValue(ATTRIBUTE_MONTH);
            String year = DOBElement.attributeValue(ATTRIBUTE_YEAR);

            if (year != null) {
                try {
                    Calendar date = new GregorianCalendar();
                    date.clear();
                    date.setLenient(false);
                    date.set(Calendar.DATE, day == null ? 1 : Integer.parseInt(day));
                    date.set(Calendar.MONTH, month == null ? 0 : Integer.parseInt(month) - 1);
                    date.set(Calendar.YEAR, Integer.parseInt(year));

                    return DateUtil.formatDateAsText(date.getTime());
                } catch (IllegalArgumentException e) {
                    throw new DocumentException("External patient response contains an invalid DOB", e);
                }
            }
        }

        return null;
    }

    private String getValueFor(Element patientElement, String elementName) {
        Element namedElement = patientElement.element(elementName);
        return namedElement == null ? null : namedElement.getTextTrim();
    }
}

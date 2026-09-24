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
package org.openelisglobal.common.provider.query.workerObjects;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.apache.commons.validator.GenericValidator;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.provider.query.PatientSearchResults;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.observationhistory.service.ObservationHistoryService;
import org.openelisglobal.observationhistory.service.ObservationHistoryServiceImpl.ObservationType;
import org.openelisglobal.observationhistory.valueholder.ObservationHistory;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.person.service.PersonService;
import org.openelisglobal.search.service.SearchResultsService;
import org.openelisglobal.spring.util.SpringContext;

public class PatientSearchLocalWorker extends PatientSearchWorker {

    protected PatientService patientService = SpringContext.getBean(PatientService.class);
    protected SearchResultsService searchResultsService = SpringContext.getBean(SearchResultsService.class);

    @Override
    public String createSearchResultXML(String lastName, String firstName, String STNumber, String subjectNumber,
            String nationalID, String patientID, String guid, String dateOfBirth, String gender, StringBuilder xml) {

        if (GenericValidator.isBlankOrNull(lastName) && GenericValidator.isBlankOrNull(firstName)
                && GenericValidator.isBlankOrNull(STNumber) && GenericValidator.isBlankOrNull(subjectNumber)
                && GenericValidator.isBlankOrNull(nationalID) && GenericValidator.isBlankOrNull(patientID)
                && GenericValidator.isBlankOrNull(guid) && GenericValidator.isBlankOrNull(dateOfBirth)
                && GenericValidator.isBlankOrNull(gender)) {

            xml.append("No search terms were entered");
            return IActionConstants.INVALID;
        }

        return appendBoundedSearchResults(getPatientSearchResults(lastName, firstName, STNumber, subjectNumber,
                nationalID, patientID, guid, dateOfBirth, gender, AJAX_QUERY_RESULT_PROBE_LIMIT), xml);
    }

    @Override
    public List<PatientSearchResults> getPatientSearchResults(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String patientID, String guid, String dateOfBirth, String gender) {
        return getPatientSearchResults(lastName, firstName, STNumber, subjectNumber, nationalID, patientID, guid,
                dateOfBirth, gender, null).results();
    }

    @Override
    public BoundedPatientSearchResults getPatientSearchResults(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String patientID, String guid, String dateOfBirth, String gender,
            int maxLocalResults) {
        if (maxLocalResults < 1) {
            throw new IllegalArgumentException("Patient search result limit must be positive");
        }
        return getPatientSearchResults(lastName, firstName, STNumber, subjectNumber, nationalID, patientID, guid,
                dateOfBirth, gender, Integer.valueOf(maxLocalResults));
    }

    private BoundedPatientSearchResults getPatientSearchResults(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String patientID, String guid, String dateOfBirth, String gender,
            Integer maxLocalResults) {

        if (GenericValidator.isBlankOrNull(lastName) && GenericValidator.isBlankOrNull(firstName)
                && GenericValidator.isBlankOrNull(STNumber) && GenericValidator.isBlankOrNull(subjectNumber)
                && GenericValidator.isBlankOrNull(nationalID) && GenericValidator.isBlankOrNull(patientID)
                && GenericValidator.isBlankOrNull(guid) && GenericValidator.isBlankOrNull(dateOfBirth)
                && GenericValidator.isBlankOrNull(gender)) {

            return new BoundedPatientSearchResults(List.of(), false);
        }

        // N.B. results do not have the referrinngPatientId information but it is not
        // displayed so for now it will be left as null
        List<PatientSearchResults> results = new ArrayList<>(maxLocalResults == null
                ? searchResultsService.getSearchResults(lastName, firstName, STNumber, subjectNumber, nationalID,
                        nationalID, patientID, guid, dateOfBirth, gender)
                : searchResultsService.getSearchResults(lastName, firstName, STNumber, subjectNumber, nationalID,
                        nationalID, patientID, guid, dateOfBirth, gender, maxLocalResults));
        if (maxLocalResults != null && results.size() >= maxLocalResults) {
            return new BoundedPatientSearchResults(List.of(), true);
        }
        if (!GenericValidator.isBlankOrNull(nationalID)) {
            BoundedPatientSearchResults observationResults = getObservationsByReferringPatientId(nationalID,
                    maxLocalResults == null ? null : maxLocalResults - results.size());
            if (observationResults.limitReached()) {
                return observationResults;
            }
            results.addAll(observationResults.results());
        }
        sortPatients(results);

        if (!results.isEmpty()) {
            for (PatientSearchResults singleResult : results) {
                singleResult.setDataSourceName(MessageUtil.getMessage("patient.local.source"));
            }
        }

        return new BoundedPatientSearchResults(results, false);
    }

    private List<PatientSearchResults> getObservationsByReferringPatientId(String referringId) {
        return getObservationsByReferringPatientId(referringId, null).results();
    }

    private BoundedPatientSearchResults getObservationsByReferringPatientId(String referringId, Integer maxResults) {
        List<PatientSearchResults> resultList = new ArrayList<>();
        ObservationHistoryService observationHistoryService = SpringContext.getBean(ObservationHistoryService.class);
        List<ObservationHistory> observationList = maxResults == null
                ? observationHistoryService.getObservationsByTypeAndValue(ObservationType.REFERRERS_PATIENT_ID,
                        referringId)
                : observationHistoryService.getObservationsByTypeAndValue(ObservationType.REFERRERS_PATIENT_ID,
                        referringId, maxResults);

        if (maxResults != null && observationList != null && observationList.size() >= maxResults) {
            return new BoundedPatientSearchResults(List.of(), true);
        }

        if (observationList != null) {
            for (ObservationHistory observation : observationList) {
                Patient patient = patientService.getData(observation.getPatientId());
                if (patient != null) {
                    resultList.add(getSearchResultsForPatient(patient, referringId));
                }
            }
        }

        return new BoundedPatientSearchResults(resultList, false);
    }

    private PatientSearchResults getSearchResultsForPatient(Patient patient, String referringId) {
        PatientService patientPatientService = SpringContext.getBean(PatientService.class);
        PersonService personService = SpringContext.getBean(PersonService.class);
        personService.getData(patient.getPerson());
        return new PatientSearchResults(BigDecimal.valueOf(Long.parseLong(patient.getId())),
                patientPatientService.getFirstName(patient), patientPatientService.getLastName(patient),
                patientPatientService.getGender(patient), patientPatientService.getEnteredDOB(patient),
                patientPatientService.getNationalId(patient), patient.getExternalId(),
                patientPatientService.getSTNumber(patient), patientPatientService.getSubjectNumber(patient),
                patientPatientService.getGUID(patient), referringId);
    }
}

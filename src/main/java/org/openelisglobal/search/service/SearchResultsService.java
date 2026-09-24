package org.openelisglobal.search.service;

import java.util.List;
import org.openelisglobal.common.provider.query.PatientSearchResults;

public interface SearchResultsService {

    List<PatientSearchResults> getSearchResults(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String externalID, String patientID, String guid,
            String dateOfBirth, String gender);

    default List<PatientSearchResults> getSearchResults(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String externalID, String patientID, String guid,
            String dateOfBirth, String gender, int maxResults) {
        if (maxResults < 1) {
            throw new IllegalArgumentException("Patient search result limit must be positive");
        }
        return getSearchResults(lastName, firstName, STNumber, subjectNumber, nationalID, externalID, patientID, guid,
                dateOfBirth, gender);
    }

    List<PatientSearchResults> getSearchResultsExact(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String externalID, String patientID, String guid,
            String dateOfBirth, String gender);

    List<PatientSearchResults> getQuickSearchResults(String query);

    default List<PatientSearchResults> getQuickSearchResults(String query, int maxResults) {
        if (maxResults < 1) {
            throw new IllegalArgumentException("Patient quick-search result limit must be positive");
        }
        return getQuickSearchResults(query);
    }
}

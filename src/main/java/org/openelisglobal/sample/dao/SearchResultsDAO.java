package org.openelisglobal.sample.dao;

import java.util.List;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.provider.query.PatientSearchResults;

public interface SearchResultsDAO {

    String FIRST_NAME_PARAM = "firstName";
    String LAST_NAME_PARAM = "lastName";
    String NATIONAL_ID_PARAM = "nationalID";
    String EXTERNAL_ID_PARAM = "externalID";
    String ST_NUMBER_PARAM = "stNumber";
    String SUBJECT_NUMBER_PARAM = "subjectNumber";
    String ID_PARAM = "id";
    String GUID = "guid";
    String DATE_OF_BIRTH = "dateOfBirth";
    String DATE_OF_BIRTH_FORMATED = "dateOfBirthFormatted";
    String DATE_OF_BIRTH_ISO = "dateOfBirthIso";
    String GENDER = "gender";

    String ID_TYPE_FOR_ST = "stNumberId";
    String ID_TYPE_FOR_SUBJECT_NUMBER = "subjectNumberId";
    String ID_TYPE_FOR_GUID = "guidId";

    public List<PatientSearchResults> getSearchResults(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String externalID, String patientID, String guid,
            String dateOfBirth, String gender) throws LIMSRuntimeException;

    default List<PatientSearchResults> getSearchResults(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String externalID, String patientID, String guid,
            String dateOfBirth, String gender, int maxResults) throws LIMSRuntimeException {
        if (maxResults < 1) {
            throw new IllegalArgumentException("Patient search result limit must be positive");
        }
        return getSearchResults(lastName, firstName, STNumber, subjectNumber, nationalID, externalID, patientID, guid,
                dateOfBirth, gender);
    }

    List<PatientSearchResults> getSearchResultsByGUID(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String externalID, String patientID, String guid,
            String dateOfBirth, String gender) throws LIMSRuntimeException;

    List<PatientSearchResults> getSearchResultsExact(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String externalID, String patientID, String guid,
            String dateOfBirth, String gender) throws LIMSRuntimeException;

    /**
     * Searches the local patient master with one user-facing term. The term may be
     * a patient name, patient identifier, phone number or previous laboratory
     * number. This is the compact selector used inside order entry; the full
     * multi-field search remains available in patient management.
     */
    List<PatientSearchResults> getQuickSearchResults(String query) throws LIMSRuntimeException;

    /**
     * Bounded variant used by interactive patient search. Implementations must
     * apply the limit before materializing database or index hits so callers can
     * request one probe row above their display/cache boundary.
     */
    default List<PatientSearchResults> getQuickSearchResults(String query, int maxResults) throws LIMSRuntimeException {
        if (maxResults < 1) {
            throw new IllegalArgumentException("Patient quick-search result limit must be positive");
        }
        return getQuickSearchResults(query);
    }
}

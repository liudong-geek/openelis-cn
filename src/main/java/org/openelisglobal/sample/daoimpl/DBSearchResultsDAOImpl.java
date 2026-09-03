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
package org.openelisglobal.sample.daoimpl;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.apache.commons.validator.GenericValidator;
import org.hibernate.Session;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.provider.query.PatientSearchResults;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.patientidentitytype.util.PatientIdentityTypeMap;
import org.openelisglobal.sample.dao.SearchResultsDAO;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Primary
public class DBSearchResultsDAOImpl implements SearchResultsDAO {

    private static final String QUICK_QUERY_PARAM = "quickQuery";

    @PersistenceContext
    EntityManager entityManager;

    @Override
    @SuppressWarnings("rawtypes")
    @Transactional
    public List<PatientSearchResults> getSearchResultsByGUID(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String externalID, String patientID, String guid,
            String dateOfBirth, String gender) throws LIMSRuntimeException {

        List queryResults;

        try {
            boolean queryFirstName = !GenericValidator.isBlankOrNull(firstName);
            boolean queryLastName = !GenericValidator.isBlankOrNull(lastName);
            boolean queryNationalId = !GenericValidator.isBlankOrNull(nationalID);
            boolean querySTNumber = !GenericValidator.isBlankOrNull(STNumber);
            boolean querySubjectNumber = !GenericValidator.isBlankOrNull(subjectNumber);
            boolean queryExternalId = !GenericValidator.isBlankOrNull(externalID);
            boolean queryAnyID = queryExternalId && queryNationalId;
            boolean queryPatientID = !GenericValidator.isBlankOrNull(patientID);
            boolean queryGuid = !GenericValidator.isBlankOrNull(guid);
            boolean queryDateOfBirth = !GenericValidator.isBlankOrNull(dateOfBirth);
            boolean queryGender = !GenericValidator.isBlankOrNull(gender);
            if (queryDateOfBirth
                    && (getFormatedDOB(dateOfBirth) == null || getIsoDOB(dateOfBirth) == null)) {
                return List.of();
            }

            String sql = buildQueryString(queryLastName, queryFirstName, querySTNumber, querySubjectNumber,
                    queryNationalId, queryExternalId, queryAnyID, queryPatientID, queryGuid, queryDateOfBirth,
                    queryGender);

            org.hibernate.query.Query query = entityManager.unwrap(Session.class).createNativeQuery(sql);

            queryResults = query.list();
        } catch (RuntimeException e) {
            LogEvent.logError(e);
            throw new LIMSRuntimeException("Error in SearchResultsDAOImpl getSearchResults()", e);
        }

        List<PatientSearchResults> results = new ArrayList<>();

        for (Object resultLine : queryResults) {

            Object[] line = (Object[]) resultLine;

            results.add(new PatientSearchResults((BigDecimal) line[0], (String) line[1], (String) line[2],
                    (String) line[3], (String) line[4], (String) line[5], (String) line[6], (String) line[7],
                    (String) line[8], (String) line[9], null));
        }

        return results;
    }

    @Override
    @SuppressWarnings("rawtypes")
    @Transactional
    public List<PatientSearchResults> getSearchResults(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String externalID, String patientID, String guid,
            String dateOfBirth, String gender) throws LIMSRuntimeException {

        List queryResults;

        try {
            boolean queryFirstName = !GenericValidator.isBlankOrNull(firstName);
            boolean queryLastName = !GenericValidator.isBlankOrNull(lastName);
            boolean queryNationalId = !GenericValidator.isBlankOrNull(nationalID);
            boolean querySTNumber = !GenericValidator.isBlankOrNull(STNumber);
            boolean querySubjectNumber = !GenericValidator.isBlankOrNull(subjectNumber);
            boolean queryExternalId = !GenericValidator.isBlankOrNull(externalID);
            boolean queryAnyID = queryExternalId && queryNationalId;
            boolean queryPatientID = !GenericValidator.isBlankOrNull(patientID);
            boolean queryGuid = !GenericValidator.isBlankOrNull(guid);
            boolean queryDateOfBirth = !GenericValidator.isBlankOrNull(dateOfBirth);
            boolean queryGender = !GenericValidator.isBlankOrNull(gender);
            String dobFormatted = null;
            String dobIso = null;
            if (queryDateOfBirth) {
                dobFormatted = getFormatedDOB(dateOfBirth);
                dobIso = getIsoDOB(dateOfBirth);
                if (dobFormatted == null || dobIso == null) {
                    return List.of();
                }
            }

            String sql = buildQueryString(queryLastName, queryFirstName, querySTNumber, querySubjectNumber,
                    queryNationalId, queryExternalId, queryAnyID, queryPatientID, queryGuid, queryDateOfBirth,
                    queryGender);

            org.hibernate.query.Query query = entityManager.unwrap(Session.class).createNativeQuery(sql);

            query.setParameter(ID_TYPE_FOR_ST,
                    Integer.valueOf(PatientIdentityTypeMap.getInstance().getIDForType("ST")));
            query.setParameter(ID_TYPE_FOR_SUBJECT_NUMBER,
                    Integer.valueOf(PatientIdentityTypeMap.getInstance().getIDForType("SUBJECT")));
            query.setParameter(ID_TYPE_FOR_GUID,
                    Integer.valueOf(PatientIdentityTypeMap.getInstance().getIDForType("GUID")));

            lastName = '%' + lastName + '%';
            firstName = '%' + firstName + '%';
            STNumber = '%' + STNumber + '%';
            subjectNumber = '%' + subjectNumber + '%';
            nationalID = '%' + nationalID + '%';
            externalID = '%' + externalID + '%';
            // patientID = '%' + patientID + '%';
            // guid = '%' + guid + '%';
            if (queryDateOfBirth) {
                dobFormatted = '%' + dobFormatted + '%';
                dobIso = '%' + dobIso + '%';
                dateOfBirth = '%' + dateOfBirth + '%';
            }
            // gender = '%' + gender + '%';

            if (queryFirstName) {
                query.setParameter(FIRST_NAME_PARAM, firstName);
            }
            if (queryLastName) {
                query.setParameter(LAST_NAME_PARAM, lastName);
            }
            if (queryNationalId) {
                query.setParameter(NATIONAL_ID_PARAM, nationalID);
            }
            if (queryExternalId) {
                query.setParameter(EXTERNAL_ID_PARAM, nationalID);
            }
            if (querySTNumber) {
                query.setParameter(ST_NUMBER_PARAM, STNumber);
            }
            if (querySubjectNumber) {
                query.setParameter(SUBJECT_NUMBER_PARAM, subjectNumber);
            }
            if (queryPatientID) {
                query.setParameter(ID_PARAM, Integer.valueOf(patientID));
            }
            if (queryGuid) {
                query.setParameter(GUID, guid);
            }
            if (queryDateOfBirth) {
                query.setParameter(DATE_OF_BIRTH, dateOfBirth);
                query.setParameter(DATE_OF_BIRTH_FORMATED, dobFormatted);
                query.setParameter(DATE_OF_BIRTH_ISO, dobIso);
            }
            if (queryGender) {
                query.setParameter(GENDER, gender);
            }
            LogEvent.logTrace(this.getClass().getSimpleName(), "getSearchResults",
                    "SearchResultsDAOImp:getSearchResults:query:guid: " + guid);
            LogEvent.logTrace(this.getClass().getSimpleName(), "getSearchResults",
                    "SearchResultsDAOImp:getSearchResults:query: " + query.getQueryString());

            queryResults = query.list();
        } catch (RuntimeException e) {
            LogEvent.logError(e);
            throw new LIMSRuntimeException("Error in SearchResultsDAOImpl getSearchResults()", e);
        }

        List<PatientSearchResults> results = new ArrayList<>();

        for (Object resultLine : queryResults) {

            Object[] line = (Object[]) resultLine;

            results.add(new PatientSearchResults((BigDecimal) line[0], (String) line[1], (String) line[2],
                    (String) line[3], (String) line[4], (String) line[5], (String) line[6], (String) line[7],
                    (String) line[8], (String) line[9], null));
        }

        return results;
    }

    @Override
    @SuppressWarnings("rawtypes")
    @Transactional
    public List<PatientSearchResults> getSearchResultsExact(String lastName, String firstName, String STNumber,
            String subjectNumber, String nationalID, String externalID, String patientID, String guid,
            String dateOfBirth, String gender) throws LIMSRuntimeException {

        List queryResults;

        try {
            boolean queryFirstName = !GenericValidator.isBlankOrNull(firstName);
            boolean queryLastName = !GenericValidator.isBlankOrNull(lastName);
            boolean queryNationalId = !GenericValidator.isBlankOrNull(nationalID);
            boolean querySTNumber = !GenericValidator.isBlankOrNull(STNumber);
            boolean querySubjectNumber = !GenericValidator.isBlankOrNull(subjectNumber);
            boolean queryExternalId = !GenericValidator.isBlankOrNull(externalID);
            boolean queryAnyID = queryExternalId && queryNationalId;
            boolean queryPatientID = !GenericValidator.isBlankOrNull(patientID);
            boolean queryGuid = !GenericValidator.isBlankOrNull(guid);
            boolean queryDateOfBirth = !GenericValidator.isBlankOrNull(dateOfBirth);
            boolean queryGender = !GenericValidator.isBlankOrNull(gender);
            String dobFormatted = null;
            String dobIso = null;
            if (queryDateOfBirth) {
                dobFormatted = getFormatedDOB(dateOfBirth);
                dobIso = getIsoDOB(dateOfBirth);
                if (dobFormatted == null || dobIso == null) {
                    return List.of();
                }
            }

            String sql = buildQueryString(queryLastName, queryFirstName, querySTNumber, querySubjectNumber,
                    queryNationalId, queryExternalId, queryAnyID, queryPatientID, queryGuid, queryDateOfBirth,
                    queryGender);

            org.hibernate.query.Query query = entityManager.unwrap(Session.class).createNativeQuery(sql);

            query.setParameter(ID_TYPE_FOR_ST,
                    Integer.valueOf(PatientIdentityTypeMap.getInstance().getIDForType("ST")));
            query.setParameter(ID_TYPE_FOR_SUBJECT_NUMBER,
                    Integer.valueOf(PatientIdentityTypeMap.getInstance().getIDForType("SUBJECT")));
            query.setParameter(ID_TYPE_FOR_GUID,
                    Integer.valueOf(PatientIdentityTypeMap.getInstance().getIDForType("GUID")));

            if (queryFirstName) {
                query.setParameter(FIRST_NAME_PARAM, firstName);
            }
            if (queryLastName) {
                query.setParameter(LAST_NAME_PARAM, lastName);
            }
            if (queryNationalId) {
                query.setParameter(NATIONAL_ID_PARAM, nationalID);
            }
            if (queryExternalId) {
                query.setParameter(EXTERNAL_ID_PARAM, nationalID);
            }
            if (querySTNumber) {
                query.setParameter(ST_NUMBER_PARAM, STNumber);
            }
            if (querySubjectNumber) {
                query.setParameter(SUBJECT_NUMBER_PARAM, subjectNumber);
            }
            if (queryPatientID) {
                query.setParameter(ID_PARAM, Integer.valueOf(patientID));
            }
            if (queryGuid) {
                query.setParameter(GUID, guid);
            }
            if (queryDateOfBirth) {
                query.setParameter(DATE_OF_BIRTH, dateOfBirth);
                query.setParameter(DATE_OF_BIRTH_FORMATED, dobFormatted);
                query.setParameter(DATE_OF_BIRTH_ISO, dobIso);
            }
            if (queryGender) {
                query.setParameter(GENDER, gender);
            }
            queryResults = query.list();
        } catch (RuntimeException e) {
            LogEvent.logError(e);
            throw new LIMSRuntimeException("Error in SearchResultsDAOImpl getSearchResultsExact()", e);
        }

        List<PatientSearchResults> results = new ArrayList<>();

        for (Object resultLine : queryResults) {

            Object[] line = (Object[]) resultLine;

            results.add(new PatientSearchResults((BigDecimal) line[0], (String) line[1], (String) line[2],
                    (String) line[3], (String) line[4], (String) line[5], (String) line[6], (String) line[7],
                    (String) line[8], (String) line[9], null));
        }

        return results;
    }

    @Override
    @SuppressWarnings("rawtypes")
    @Transactional
    public List<PatientSearchResults> getQuickSearchResults(String queryText) throws LIMSRuntimeException {
        if (GenericValidator.isBlankOrNull(queryText)) {
            return Collections.emptyList();
        }

        String normalizedQuery = queryText.trim();
        if (normalizedQuery.length() > 100) {
            return Collections.emptyList();
        }

        try {
            org.hibernate.query.Query query = entityManager.unwrap(Session.class)
                    .createNativeQuery(buildQuickSearchQueryString());
            query.setParameter(ID_TYPE_FOR_ST,
                    Integer.valueOf(PatientIdentityTypeMap.getInstance().getIDForType("ST")));
            query.setParameter(ID_TYPE_FOR_SUBJECT_NUMBER,
                    Integer.valueOf(PatientIdentityTypeMap.getInstance().getIDForType("SUBJECT")));
            query.setParameter(ID_TYPE_FOR_GUID,
                    Integer.valueOf(PatientIdentityTypeMap.getInstance().getIDForType("GUID")));
            query.setParameter(QUICK_QUERY_PARAM, "%" + escapeLikeValue(normalizedQuery) + "%");

            List queryResults = query.list();
            List<PatientSearchResults> results = new ArrayList<>();
            for (Object resultLine : queryResults) {
                Object[] line = (Object[]) resultLine;
                results.add(new PatientSearchResults((BigDecimal) line[0], (String) line[1], (String) line[2],
                        (String) line[3], (String) line[4], (String) line[5], (String) line[6], (String) line[7],
                        (String) line[8], (String) line[9], null));
            }
            return results;
        } catch (RuntimeException e) {
            LogEvent.logError(e);
            throw new LIMSRuntimeException("Error in SearchResultsDAOImpl getQuickSearchResults()", e);
        }
    }

    private String buildQuickSearchQueryString() {
        return "select distinct p.id, pr.first_name, pr.last_name, p.gender, p.entered_birth_date, p.national_id,"
                + " p.external_id, pi.identity_data as st, piSN.identity_data as subject,"
                + " piGUID.identity_data as guid"
                + " from patient p join person pr on p.person_id = pr.id"
                + " left join patient_identity pi on pi.patient_id = p.id and pi.identity_type_id = :"
                + ID_TYPE_FOR_ST
                + " left join patient_identity piSN on piSN.patient_id = p.id and piSN.identity_type_id = :"
                + ID_TYPE_FOR_SUBJECT_NUMBER
                + " left join patient_identity piGUID on piGUID.patient_id = p.id and piGUID.identity_type_id = :"
                + ID_TYPE_FOR_GUID
                + " where pr.last_name ilike :" + QUICK_QUERY_PARAM
                + " or pr.first_name ilike :" + QUICK_QUERY_PARAM
                + " or concat_ws('', pr.last_name, pr.first_name) ilike :" + QUICK_QUERY_PARAM
                + " or concat_ws('', pr.first_name, pr.last_name) ilike :" + QUICK_QUERY_PARAM
                + " or cast(p.id as text) ilike :" + QUICK_QUERY_PARAM
                + " or p.national_id ilike :" + QUICK_QUERY_PARAM
                + " or p.external_id ilike :" + QUICK_QUERY_PARAM
                + " or pi.identity_data ilike :" + QUICK_QUERY_PARAM
                + " or piSN.identity_data ilike :" + QUICK_QUERY_PARAM
                + " or pr.primary_phone ilike :" + QUICK_QUERY_PARAM
                + " or exists (select 1 from sample_human sh join sample s on s.id = sh.samp_id"
                + " where sh.patient_id = p.id and s.accession_number ilike :" + QUICK_QUERY_PARAM + ")"
                + " order by pr.last_name, pr.first_name, p.id limit 100";
    }

    private String escapeLikeValue(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private String getFormatedDOB(String dob) {
        return DateUtil.formatStringDateForLegacySearch(dob);
    }

    private String getIsoDOB(String dob) {
        return DateUtil.formatStringDateAsIsoForConfiguredLocale(dob);
    }

    /**
     * @param lastName
     * @param firstName
     * @param STNumber
     * @param subjectNumber
     * @param nationalID
     * @param externalID
     * @param patientID     - if a previous query has already found a candidate
     *                      patient
     */
    private String buildQueryString(boolean lastName, boolean firstName, boolean STNumber, boolean subjectNumber,
            boolean nationalID, boolean externalID, boolean anyID, boolean patientID, boolean guid, boolean dateOfBirth,
            boolean gender) {

        StringBuilder queryBuilder = new StringBuilder();
        queryBuilder.append("select p.id, pr.first_name, pr.last_name, p.gender, p.entered_birth_date, p.national_id,"
                + " p.external_id, pi.identity_data as st, piSN.identity_data as subject,"
                + " piGUID.identity_data as guid from patient p join person pr on p.person_id = pr.id" + " ");
        queryBuilder.append("left join patient_identity  pi on pi.patient_id = p.id and pi.identity_type_id = :");
        queryBuilder.append(ID_TYPE_FOR_ST);
        queryBuilder.append(" ");

        queryBuilder.append("left join patient_identity  piSN on piSN.patient_id = p.id and piSN.identity_type_id = :");
        queryBuilder.append(ID_TYPE_FOR_SUBJECT_NUMBER);
        queryBuilder.append(" ");

        queryBuilder.append(
                "left join patient_identity  piGUID on piGUID.patient_id = p.id and piGUID.identity_type_id" + " = :");
        queryBuilder.append(ID_TYPE_FOR_GUID);
        queryBuilder.append(" where ");

        queryBuilder.append(" ( false or ");
        if (subjectNumber) {
            queryBuilder.append(" piSN.identity_data ilike :");
            queryBuilder.append(SUBJECT_NUMBER_PARAM);
            queryBuilder.append(" or");
        }

        if (nationalID) {
            queryBuilder.append(" p.national_id ilike :");
            queryBuilder.append(NATIONAL_ID_PARAM);
            queryBuilder.append(" or");
        }

        if (externalID) {
            queryBuilder.append(" p.external_id ilike :");
            queryBuilder.append(EXTERNAL_ID_PARAM);
            queryBuilder.append(" or");
        }

        if (STNumber) {
            queryBuilder.append(" pi.identity_data ilike :");
            queryBuilder.append(ST_NUMBER_PARAM);
            queryBuilder.append(" and");
        }

        // Need to close paren before dangling AND/OR.
        int lastAndIndex = queryBuilder.lastIndexOf("and");
        int lastOrIndex = queryBuilder.lastIndexOf("or");

        if (lastAndIndex > lastOrIndex) {
            queryBuilder.delete(lastAndIndex, queryBuilder.length());
            queryBuilder.append(") and");
        } else if (lastOrIndex > lastAndIndex) {
            queryBuilder.delete(lastOrIndex, queryBuilder.length());
            queryBuilder.append(") or");
        }

        if (patientID) {
            queryBuilder.append(" p.id = :");
            queryBuilder.append(ID_PARAM);
            queryBuilder.append(" and");
        }

        if (guid) {
            queryBuilder.append(" piGUID.identity_data = :");
            queryBuilder.append(GUID);
            queryBuilder.append(" and");
        }

        if (lastName) {
            queryBuilder.append(" pr.last_name ilike :");
            queryBuilder.append(LAST_NAME_PARAM);
            queryBuilder.append(" and");
        }

        if (firstName) {
            queryBuilder.append(" pr.first_name ilike :");
            queryBuilder.append(FIRST_NAME_PARAM);
            queryBuilder.append(" and");
        }

        if (dateOfBirth) {
            queryBuilder.append(" (p.entered_birth_date ilike :");
            queryBuilder.append(DATE_OF_BIRTH);
            queryBuilder.append(" or p.entered_birth_date ilike :");
            queryBuilder.append(DATE_OF_BIRTH_FORMATED);
            queryBuilder.append(" or to_char(p.birth_date, 'YYYY-MM-DD') ilike :");
            queryBuilder.append(DATE_OF_BIRTH_ISO);
            queryBuilder.append(") and");
        }

        if (gender) {
            queryBuilder.append(" p.gender = :");
            queryBuilder.append(GENDER);
            queryBuilder.append(" and");
        }

        // No matter which was added last there is one dangling AND to remove.
        lastAndIndex = queryBuilder.lastIndexOf("and");
        lastOrIndex = queryBuilder.lastIndexOf("or");

        if (lastAndIndex > lastOrIndex) {
            queryBuilder.delete(lastAndIndex, queryBuilder.length());
        } else if (lastOrIndex > lastAndIndex) {
            queryBuilder.delete(lastOrIndex, queryBuilder.length());
        }

        return queryBuilder.toString();
    }

    public List getNextRecord(String id, String table, Class clazz) throws LIMSRuntimeException {
        // TODO Auto-generated method stub
        return null;
    }

    public List getPreviousRecord(String id, String table, Class clazz) throws LIMSRuntimeException {
        // TODO Auto-generated method stub
        return null;
    }

    public Integer getTotalCount(String table, Class clazz) throws LIMSRuntimeException {
        // TODO Auto-generated method stub
        return null;
    }
}

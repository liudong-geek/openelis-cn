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

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.apache.commons.validator.GenericValidator;
import org.apache.http.HttpStatus;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.externalLinks.ExternalPatientSearchException;
import org.openelisglobal.common.externalLinks.IExternalPatientSearch;
import org.openelisglobal.common.provider.query.ExtendedPatientSearchResults;
import org.openelisglobal.common.provider.query.PatientSearchResults;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.search.service.SearchResultsService;
import org.openelisglobal.spring.util.SpringContext;

public class PatientSearchLocalAndExternalWorker extends PatientSearchWorker {

    protected SearchResultsService searchResultsService = SpringContext.getBean(SearchResultsService.class);
    private ExternalPatientImportService externalPatientImportService = SpringContext
            .getBean(ExternalPatientImportService.class);

    private final String sysUserId;

    public PatientSearchLocalAndExternalWorker(String sysUserId) {
        this.sysUserId = sysUserId;
    }

    /**
     * @see org.openelisglobal.common.provider.query.workerObjects.PatientSearchWorker#createSearchResultXML(java.lang.String,
     *      java.lang.String, java.lang.String, java.lang.String, java.lang.String,
     *      java.lang.String, java.lang.StringBuilder)
     */
    @Override
    public String createSearchResultXML(String lastName, String firstName, String STNumber, String subjectNumber,
            String nationalID, String patientID, String guid, String dateOfBirth, String gender, StringBuilder xml) {

        if (GenericValidator.isBlankOrNull(lastName) && GenericValidator.isBlankOrNull(firstName)
                && GenericValidator.isBlankOrNull(STNumber) && GenericValidator.isBlankOrNull(subjectNumber)
                && GenericValidator.isBlankOrNull(nationalID) && GenericValidator.isBlankOrNull(patientID)
                && GenericValidator.isBlankOrNull(guid)) {

            xml.append("No search terms were entered");
            return IActionConstants.INVALID;
        }

        return appendBoundedSearchResults(getPatientSearchResults(lastName, firstName, STNumber, subjectNumber,
                nationalID, patientID, guid, dateOfBirth, gender, AJAX_QUERY_RESULT_PROBE_LIMIT), xml);
    }

    /**
     * @see org.openelisglobal.common.provider.query.workerObjects.PatientSearchWorker#createSearchResultXML(java.lang.String,
     *      java.lang.String, java.lang.String, java.lang.String, java.lang.String,
     *      java.lang.String, java.lang.StringBuilder)
     */
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

        // just to make the name shorter
        ConfigurationProperties config = ConfigurationProperties.getInstance();

        if (GenericValidator.isBlankOrNull(lastName) && GenericValidator.isBlankOrNull(firstName)
                && GenericValidator.isBlankOrNull(STNumber) && GenericValidator.isBlankOrNull(subjectNumber)
                && GenericValidator.isBlankOrNull(nationalID) && GenericValidator.isBlankOrNull(patientID)
                && GenericValidator.isBlankOrNull(guid)) {

            return new BoundedPatientSearchResults(List.of(), false);
        }

        List<PatientSearchResults> allResults = new ArrayList<>();

        List<IExternalPatientSearch> externalSearches = new ArrayList<>();

        List<PatientSearchResults> localResults = maxLocalResults == null
                ? searchResultsService.getSearchResults(lastName, firstName, STNumber, subjectNumber, nationalID, guid,
                        patientID, guid, "", "")
                : searchResultsService.getSearchResults(lastName, firstName, STNumber, subjectNumber, nationalID, guid,
                        patientID, guid, "", "", maxLocalResults);
        if (maxLocalResults != null && localResults.size() >= maxLocalResults) {
            return new BoundedPatientSearchResults(List.of(), true);
        }
        localResults.forEach(e -> e.setDataSourceName(MessageUtil.getMessage("patient.local.source")));
        allResults.addAll(localResults);

        if (config.getPropertyValue(Property.INFO_HIGHWAY_ENABLED).equals("true")) {
            IExternalPatientSearch externalSearch = (IExternalPatientSearch) SpringContext.getBean("InfoHighwaySearch");
            externalSearch.setSearchCriteria(lastName, firstName, STNumber, subjectNumber, nationalID, guid);
            externalSearch.setConnectionCredentials(config.getPropertyValue(Property.INFO_HIGHWAY_ADDRESS),
                    config.getPropertyValue(Property.INFO_HIGHWAY_USERNAME),
                    config.getPropertyValue(Property.INFO_HIGHWAY_PASSWORD));

            externalSearches.add(externalSearch);
        }

        if (config.getPropertyValue(Property.PatientSearchEnabled).equals("true")) {
            IExternalPatientSearch externalSearch = SpringContext.getBean(IExternalPatientSearch.class);
            externalSearch.setSearchCriteria(lastName, firstName, STNumber, subjectNumber, nationalID, guid);
            externalSearch.setConnectionCredentials(config.getPropertyValue(Property.PatientSearchURL),
                    config.getPropertyValue(Property.PatientSearchUserName),
                    config.getPropertyValue(Property.PatientSearchPassword));

            externalSearches.add(externalSearch);
        }

        List<ExtendedPatientSearchResults> boundedPatientsToInsert = new ArrayList<>();

        for (IExternalPatientSearch externalSearch : externalSearches) {
            int remainingResults = maxLocalResults == null ? Integer.MAX_VALUE : maxLocalResults - allResults.size();
            if (maxLocalResults != null) {
                if (remainingResults < 1) {
                    return new BoundedPatientSearchResults(List.of(), true);
                }
                externalSearch.setResultLimit(remainingResults);
            }
            List<ExtendedPatientSearchResults> externalResults = requireSuccessfulExternalSearch(externalSearch);

            if (maxLocalResults != null && externalResults != null && externalResults.size() >= remainingResults) {
                return new BoundedPatientSearchResults(List.of(), true);
            }

            List<ExtendedPatientSearchResults> newPatientsFromExternalSearch = new ArrayList<>();
            findNewPatients(allResults, externalResults, newPatientsFromExternalSearch);
            if (maxLocalResults != null
                    && allResults.size() + newPatientsFromExternalSearch.size() >= maxLocalResults) {
                return new BoundedPatientSearchResults(List.of(), true);
            }
            if (maxLocalResults == null) {
                insertNewPatients(newPatientsFromExternalSearch);
            } else {
                boundedPatientsToInsert.addAll(newPatientsFromExternalSearch);
            }
            newPatientsFromExternalSearch
                    .forEach(e -> e.setDataSourceName(MessageUtil.getMessage("patient.imported.source")));
            allResults.addAll(newPatientsFromExternalSearch);
        }
        if (maxLocalResults != null) {
            // Delay every write until all bounded sources are known to fit. A later
            // source overflow must not leave patients inserted by an earlier source.
            insertNewPatients(boundedPatientsToInsert);
        }
        sortPatients(allResults);

        return new BoundedPatientSearchResults(allResults, false);
    }

    static ExternalSearchOutcome awaitExternalSearch(IExternalPatientSearch externalSearch)
            throws InterruptedException, ExecutionException, TimeoutException {
        Future<Integer> future = externalSearch.runExternalSearch();
        try {
            Integer status = future.get(externalSearch.getTimeout(), TimeUnit.MILLISECONDS);
            return Integer.valueOf(HttpStatus.SC_OK).equals(status)
                    ? new ExternalSearchOutcome(status, externalSearch.getSearchResults())
                    : new ExternalSearchOutcome(status, List.of());
        } catch (TimeoutException e) {
            future.cancel(true);
            throw e;
        } catch (InterruptedException e) {
            future.cancel(true);
            Thread.currentThread().interrupt();
            throw e;
        }
    }

    static List<ExtendedPatientSearchResults> requireSuccessfulExternalSearch(IExternalPatientSearch externalSearch) {
        try {
            ExternalSearchOutcome outcome = awaitExternalSearch(externalSearch);
            if (!outcome.successful()) {
                throw new ExternalPatientSearchException(
                        "External patient search returned unsuccessful status " + outcome.status());
            }
            if (outcome.results() == null) {
                throw new ExternalPatientSearchException("External patient search returned no result collection");
            }
            return outcome.results();
        } catch (ExternalPatientSearchException e) {
            throw e;
        } catch (InterruptedException e) {
            throw new ExternalPatientSearchException("External patient search was interrupted", e);
        } catch (TimeoutException e) {
            throw new ExternalPatientSearchException("External patient search timed out", e);
        } catch (ExecutionException e) {
            Throwable upstreamCause = e.getCause() == null ? e : e.getCause();
            throw new ExternalPatientSearchException("External patient search could not be completed", upstreamCause);
        } catch (RuntimeException e) {
            throw new ExternalPatientSearchException("External patient search could not be completed", e);
        }
    }

    record ExternalSearchOutcome(Integer status, List<ExtendedPatientSearchResults> results) {
        boolean successful() {
            return Integer.valueOf(HttpStatus.SC_OK).equals(status);
        }
    }

    private void insertNewPatients(List<ExtendedPatientSearchResults> newPatientsFromClinic) {
        externalPatientImportService.importPatients(newPatientsFromClinic, sysUserId);
    }

    /*
     * This will check to see if the clinic results are in OpenELIS. If they are not
     * then they will be
     */
    private void findNewPatients(List<PatientSearchResults> results, List<ExtendedPatientSearchResults> externalResults,
            List<ExtendedPatientSearchResults> newPatientsFromExternalSearch) {

        if (externalResults != null) {
            List<String> currentGuids = new ArrayList<>();
            List<String> currentNationalIds = new ArrayList<>();

            for (PatientSearchResults result : results) {
                if (!GenericValidator.isBlankOrNull(result.getGUID())) {
                    currentGuids.add(result.getGUID());
                }
                if (!GenericValidator.isBlankOrNull(result.getNationalId())) {
                    currentNationalIds.add(result.getNationalId());
                }
            }

            for (ExtendedPatientSearchResults externalResult : externalResults) {
                if (!currentGuids.contains(externalResult.getGUID())
                        && !currentNationalIds.contains(externalResult.getNationalId())) {
                    newPatientsFromExternalSearch.add(externalResult);
                }
            }
        }
    }
}

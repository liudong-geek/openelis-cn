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

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Future;
import org.apache.commons.validator.GenericValidator;
import org.apache.http.HttpStatus;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.client.utils.URIBuilder;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClientBuilder;
import org.dom4j.DocumentException;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.provider.query.ExtendedPatientSearchResults;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Scope;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.stereotype.Service;

@Service
@Primary
@Scope("prototype")
public class ExternalPatientSearch implements IExternalPatientSearch {

    @Value("${org.openelisglobal.externalSearch.timeout:5000}")
    private Integer timeout;

    @Value("${org.openelisglobal.externalSearch.maxResponseBytes:2097152}")
    private Integer maxResponseBytes = ExternalPatientResponseSizeLimiter.DEFAULT_MAX_RESPONSE_BYTES;

    @Autowired
    @Qualifier("externalPatientSearchExecutor")
    private AsyncTaskExecutor externalPatientSearchExecutor;

    private static final String GET_PARAM_PWD = "pwd";
    private static final String GET_PARAM_NAME = "name";
    private static final String GET_PARAM_NATIONAL_ID = "nationalId";
    private static final String GET_PARAM_ST = "ST";
    private static final String GET_PARAM_SUBJECT = "subjectNumber";
    private static final String GET_PARAM_LAST = "last";
    private static final String GET_PARAM_FIRST = "first";
    private static final String GET_PARAM_GUID = "guid";

    public static final String MALFORMED_REPLY = "Malformed reply";
    public static final String URI_BUILD_FAILURE = "Failed to build URI";
    public static final String RESPONSE_TOO_LARGE = "External patient search response exceeded the configured limit";

    private boolean started = false;
    private boolean finished = false;

    private String firstName;
    private String lastName;
    private String STNumber;
    private String subjectNumber;
    private String nationalId;
    private String guid;
    private String connectionString;
    private String connectionName;
    private String connectionPassword;
    private Integer resultLimit;

    protected String resultXML;
    protected List<ExtendedPatientSearchResults> searchResults;
    protected List<String> errors;
    protected int returnStatus = HttpStatus.SC_CREATED;

    @Override
    public synchronized void setConnectionCredentials(String connectionString, String name, String password) {
        if (started) {
            throw new IllegalStateException("ServiceCredentials set after ExternalPatientSearch thread was started");
        }

        this.connectionString = connectionString;
        connectionName = name;
        connectionPassword = password;
    }

    @Override
    public synchronized void setSearchCriteria(String lastName, String firstName, String STNumber, String subjectNumber,
            String nationalID, String guid) throws IllegalStateException {

        if (started) {
            throw new IllegalStateException("Search criteria set after ExternalPatientSearch thread was started");
        }

        this.lastName = lastName;
        this.firstName = firstName;
        this.STNumber = STNumber;
        this.subjectNumber = subjectNumber;
        this.nationalId = nationalID;
        this.guid = guid;
    }

    @Override
    public synchronized void setResultLimit(int maxResults) {
        if (started) {
            throw new IllegalStateException("Result limit set after ExternalPatientSearch thread was started");
        }
        if (maxResults < 1) {
            throw new IllegalArgumentException("External patient search result limit must be positive");
        }
        resultLimit = maxResults;
    }

    @Override
    public synchronized List<ExtendedPatientSearchResults> getSearchResults() {

        if (!finished) {
            throw new IllegalStateException("Results requested before ExternalPatientSearch thread was finished");
        }

        return searchResults == null ? List.of() : searchResults;
    }

    public synchronized int getSearchResultStatus() {
        if (!finished) {
            throw new IllegalStateException("Result status requested ExternalPatientSearch before search was finished");
        }

        return returnStatus;
    }

    @Override
    public Future<Integer> runExternalSearch() {
        synchronized (this) {
            if (started) {
                throw new IllegalStateException("External patient search can only be started once");
            }
            started = true;
            try {
                validateConfiguration();
                if (noSearchTerms()) {
                    throw new IllegalStateException("Search requested before without any search terms.");
                }

                if (connectionCredentialsIncomplete()) {
                    throw new IllegalStateException("Search requested before connection credentials set.");
                }
                errors = new ArrayList<>();
                if (externalPatientSearchExecutor == null) {
                    throw new IllegalStateException("External patient search executor is not configured");
                }
                return externalPatientSearchExecutor.submit(this::executeSearch);
            } catch (RuntimeException e) {
                finished = true;
                throw e;
            }
        }
    }

    private Integer executeSearch() {
        try {
            doSearch();
            parseResponseBeforeCompletion();
            return returnStatus;
        } finally {
            synchronized (this) {
                finished = true;
            }
        }
    }

    @PostConstruct
    void validateConfiguration() {
        maxResponseBytes = ExternalPatientResponseSizeLimiter.validateConfiguredLimit(maxResponseBytes);
        if (timeout == null || timeout < 1) {
            throw new IllegalArgumentException("External patient search timeout must be positive");
        }
    }

    private boolean connectionCredentialsIncomplete() {
        return GenericValidator.isBlankOrNull(connectionString) || GenericValidator.isBlankOrNull(connectionName)
                || GenericValidator.isBlankOrNull(connectionPassword);
    }

    private boolean noSearchTerms() {
        return GenericValidator.isBlankOrNull(firstName) && GenericValidator.isBlankOrNull(lastName)
                && GenericValidator.isBlankOrNull(nationalId) && GenericValidator.isBlankOrNull(STNumber);
    }

    // protected for unit testing called from synchronized block
    protected void doSearch() {

        CloseableHttpClient httpclient = createHttpClient();

        HttpGet httpget = new HttpGet(connectionString);
        URI getUri = buildConnectionString(httpget.getURI());
        httpget.setURI(getUri);

        CloseableHttpResponse getResponse = null;
        try {
            getResponse = httpclient.execute(httpget);
            returnStatus = getResponse.getStatusLine().getStatusCode();
            if (getResponse.getEntity() == null) {
                throw new DocumentException("External patient response has no body");
            }
            long declaredLength = getResponse.getEntity().getContentLength();
            if (declaredLength > maxResponseBytes) {
                throw new ExternalPatientResponseTooLargeException(maxResponseBytes);
            }
            setResults(ExternalPatientResponseSizeLimiter.readUtf8(getResponse.getEntity().getContent(),
                    maxResponseBytes));
        } catch (SocketTimeoutException e) {
            returnStatus = HttpStatus.SC_BAD_GATEWAY;
            errors.add("Response from patient information server took too long.");
            LogEvent.logError(e);
            // LogEvent.logInfo(this.getClass().getSimpleName(), "method unkown", "Tinny
            // time out"
            // + e);
        } catch (ConnectException e) {
            returnStatus = HttpStatus.SC_BAD_GATEWAY;
            errors.add("Unable to connect to patient information form service. Service may not be running");
            LogEvent.logError(e);
            // LogEvent.logInfo(this.getClass().getSimpleName(), "method unkown", "you no
            // talks? "
            // + e);
        } catch (ExternalPatientResponseTooLargeException e) {
            returnStatus = HttpStatus.SC_BAD_GATEWAY;
            errors.add(RESPONSE_TOO_LARGE);
            LogEvent.logError(e);
        } catch (DocumentException e) {
            returnStatus = HttpStatus.SC_BAD_GATEWAY;
            errors.add(MALFORMED_REPLY);
            LogEvent.logError(e);
        } catch (IOException e) {
            returnStatus = HttpStatus.SC_BAD_GATEWAY;
            errors.add("IO error trying to read input stream.");
            LogEvent.logError(e);
            // LogEvent.logInfo(this.getClass().getSimpleName(), "method unkown", "all else
            // failed
            // " + e);
        } catch (RuntimeException e) {
            returnStatus = HttpStatus.SC_BAD_GATEWAY;
            errors.add("Runtime error trying to retrieve patient information.");
            LogEvent.logError(e);
            httpget.abort();
        } finally {
            if (getResponse != null) {
                try {
                    getResponse.close();
                } catch (IOException e) {
                    LogEvent.logError(e);
                }
            }
            try {
                httpclient.close();
            } catch (IOException e) {
                LogEvent.logError(e.getMessage(), e);
            }
        }
        setPossibleErrors();
    }

    private void parseResponseBeforeCompletion() {
        if (returnStatus != HttpStatus.SC_OK) {
            return;
        }
        try {
            convertXMLToResults();
        } catch (ExternalPatientResponseTooLargeException e) {
            returnStatus = HttpStatus.SC_BAD_GATEWAY;
            errors.add(RESPONSE_TOO_LARGE);
            LogEvent.logError(e);
        } catch (DocumentException | RuntimeException e) {
            returnStatus = HttpStatus.SC_BAD_GATEWAY;
            errors.add(MALFORMED_REPLY);
            LogEvent.logError(e);
        }
    }

    private void convertXMLToResults() throws DocumentException {
        if (GenericValidator.isBlankOrNull(resultXML)) {
            throw new DocumentException("External patient response is empty");
        }

        ExternalPatientSearchResultsXMLConverter converter = new ExternalPatientSearchResultsXMLConverter(
                maxResponseBytes);
        searchResults = resultLimit == null ? converter.convertXMLToSearchResults(resultXML)
                : converter.convertXMLToSearchResults(resultXML, resultLimit);
    }

    protected void setResults(String resultsAsXml) {
        resultXML = resultsAsXml;
    }

    private void setPossibleErrors() {
        switch (returnStatus) {
        case HttpStatus.SC_UNAUTHORIZED: {
            errors.add("Access denied to patient information service.");
            break;
        }
        case HttpStatus.SC_INTERNAL_SERVER_ERROR: {
            errors.add("Internal error on patient information service.");
            break;
        }
        case HttpStatus.SC_OK: {
            break; // NO-OP
        }
        case HttpStatus.SC_BAD_GATEWAY: {
            if (errors.isEmpty()) {
                errors.add("External patient information service returned an invalid response.");
            }
            break;
        }
        default: {
            errors.add("Unknown error trying to connect to patient information service. Resturn status was "
                    + returnStatus);
        }
        }
    }

    protected CloseableHttpClient createHttpClient() {
        return HttpClientBuilder.create().setDefaultRequestConfig(createRequestConfig()).disableRedirectHandling()
                .disableAutomaticRetries().build();
    }

    RequestConfig createRequestConfig() {
        return RequestConfig.custom().setConnectTimeout(timeout).setConnectionRequestTimeout(timeout)
                .setSocketTimeout(timeout).setRedirectsEnabled(false).build();
    }

    private URI buildConnectionString(URI uriStart) {

        URI uriFinal = null;
        try {
            uriFinal = new URIBuilder(uriStart).addParameter(GET_PARAM_FIRST, firstName)
                    .addParameter(GET_PARAM_LAST, lastName).addParameter(GET_PARAM_ST, STNumber)
                    .addParameter(GET_PARAM_SUBJECT, subjectNumber).addParameter(GET_PARAM_NATIONAL_ID, nationalId)
                    .addParameter(GET_PARAM_GUID, guid).addParameter(GET_PARAM_NAME, connectionName)
                    .addParameter(GET_PARAM_PWD, connectionPassword).build();
        } catch (URISyntaxException e) {
            errors.add(URI_BUILD_FAILURE);
        }

        return uriFinal;
    }

    @Override
    public String getConnectionString() {
        return connectionString;
    }

    @Override
    public int getTimeout() {
        return timeout;
    }
}

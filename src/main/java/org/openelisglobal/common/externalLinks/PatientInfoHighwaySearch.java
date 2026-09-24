package org.openelisglobal.common.externalLinks;

import jakarta.annotation.PostConstruct;
import jakarta.xml.soap.MessageFactory;
import jakarta.xml.soap.MimeHeader;
import jakarta.xml.soap.MimeHeaders;
import jakarta.xml.soap.SOAPBody;
import jakarta.xml.soap.SOAPConstants;
import jakarta.xml.soap.SOAPElement;
import jakarta.xml.soap.SOAPEnvelope;
import jakarta.xml.soap.SOAPException;
import jakarta.xml.soap.SOAPMessage;
import jakarta.xml.soap.SOAPPart;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.Future;
import javax.xml.namespace.QName;
import org.apache.commons.validator.GenericValidator;
import org.apache.http.Header;
import org.apache.http.HttpStatus;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.ByteArrayEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClientBuilder;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.provider.query.ExtendedPatientSearchResults;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.internationalization.MessageUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Scope;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.stereotype.Service;
import org.w3c.dom.DOMException;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

@Service("InfoHighwaySearch")
@Scope("prototype")
public class PatientInfoHighwaySearch implements IExternalPatientSearch {

    @Value("${org.openelisglobal.externalSearch.infohighway.timeout:50000}")
    private Integer timeout;

    @Value("${org.openelisglobal.externalSearch.maxResponseBytes:2097152}")
    private Integer maxResponseBytes = ExternalPatientResponseSizeLimiter.DEFAULT_MAX_RESPONSE_BYTES;

    @Autowired
    @Qualifier("externalPatientSearchExecutor")
    private AsyncTaskExecutor externalPatientSearchExecutor;

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
    protected List<ExtendedPatientSearchResults> searchResults = new ArrayList<>();
    protected List<String> errors;
    protected int returnStatus = HttpStatus.SC_CREATED;

    private enum InfoHighwayField {
        CITIZEN_NIC_NUMBER("CITIZEN.NIC_NUMBER"), CITIZEN_SURNAME("CITIZEN.SURNAME"),
        CITIZEN_FIRST_NAME("CITIZEN.FIRST_NAME");

        private String fieldName;

        private InfoHighwayField(String fieldName) {
            this.fieldName = fieldName;
        }

        public String getFieldName() {
            return fieldName;
        }
    }

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

        if (searchResults == null) {
            searchResults = new ArrayList<>();
        }

        return searchResults;
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
            throw new IllegalArgumentException("InfoHighway timeout must be positive");
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

    protected void doSearch() {
        String soapAction = "query";
        try {
            callSoapWebService(connectionString, soapAction);
        } catch (ExternalPatientResponseTooLargeException e) {
            returnStatus = HttpStatus.SC_BAD_GATEWAY;
            errors.add(RESPONSE_TOO_LARGE);
            LogEvent.logError(e);
        } catch (SOAPException | IOException e) {
            returnStatus = HttpStatus.SC_BAD_GATEWAY;
            errors.add(MALFORMED_REPLY);
            LogEvent.logError(e);
        } catch (RuntimeException e) {
            returnStatus = HttpStatus.SC_BAD_GATEWAY;
            errors.add(MALFORMED_REPLY);
            LogEvent.logError(e);
        }
        setPossibleErrors();
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
                errors.add("Patient information service returned an invalid response.");
            }
            break;
        }
        default: {
            errors.add("Unknown error trying to connect to patient information service. Return status was "
                    + returnStatus);
        }
        }
    }

    private void createSoapEnvelope(SOAPMessage soapMessage) throws SOAPException {
        SOAPPart soapPart = soapMessage.getSOAPPart();

        String soapPrefix = "soapenv";
        String soapNamespaceURI = "http://schemas.xmlsoap.org/soap/envelope/";
        String wsPrefix = "ws";
        String wsNamespaceURI = "http://ws.server.mhaccess.crimsonlogic.com/";

        // SOAP Envelope
        SOAPEnvelope envelope = soapPart.getEnvelope();
        changeDefaultSoapNamespace(envelope, soapPrefix, soapNamespaceURI);

        envelope.addNamespaceDeclaration(wsPrefix, wsNamespaceURI);

        // SOAP Body
        SOAPBody soapBody = envelope.getBody();
        SOAPElement soapQueryElem = soapBody.addChildElement("query", wsPrefix);
        SOAPElement soapQueryInputElem = soapQueryElem.addChildElement("queryInput");
        SOAPElement soapUserIdElem = soapQueryInputElem.addChildElement("userId");
        soapUserIdElem.addTextNode(connectionName);
        SOAPElement soapPassElem = soapQueryInputElem.addChildElement("pass");
        soapPassElem.addTextNode(connectionPassword);
        SOAPElement soapQueryIdElem = soapQueryInputElem.addChildElement("queryId");
        if (!GenericValidator.isBlankOrNull(nationalId)) {
            soapQueryIdElem.addTextNode("MOH003");
            addSearchParamIfNotBlank(nationalId, InfoHighwayField.CITIZEN_NIC_NUMBER, soapQueryInputElem);
        } else {
            soapQueryIdElem.addTextNode("MOH004");
            addSearchParamIfNotBlank(firstName, InfoHighwayField.CITIZEN_FIRST_NAME, soapQueryInputElem);
            addSearchParamIfNotBlank(lastName, InfoHighwayField.CITIZEN_SURNAME, soapQueryInputElem);
        }
    }

    private void addSearchParamIfNotBlank(String fieldValue, InfoHighwayField field, SOAPElement soapQueryInputElem)
            throws SOAPException {
        if (!GenericValidator.isBlankOrNull(fieldValue)) {
            // TODO Auto-generated method stub
            SOAPElement soapQwsInputParamsElem = soapQueryInputElem.addChildElement("qwsInputParams");
            SOAPElement soapFieldElem = soapQwsInputParamsElem.addChildElement("field");
            SOAPElement soapValuesElem = soapQwsInputParamsElem.addChildElement("values");
            soapFieldElem.addTextNode(field.getFieldName());
            soapValuesElem.addTextNode(fieldValue);
        }
    }

    private void changeDefaultSoapNamespace(SOAPEnvelope envelope, String soapPrefix, String soapNamespaceURI)
            throws SOAPException {
        envelope.removeNamespaceDeclaration(envelope.getPrefix());
        envelope.addNamespaceDeclaration(soapPrefix, soapNamespaceURI);
        envelope.setPrefix(soapPrefix);
        envelope.getHeader().setPrefix(soapPrefix);
        envelope.getBody().setPrefix(soapPrefix);
    }

    void callSoapWebService(String soapEndpointUrl, String soapAction) throws SOAPException, IOException {
        SOAPMessage soapRequest = createSOAPRequest(soapAction);
        HttpPost httpPost = createHttpPost(soapEndpointUrl, soapRequest);

        try (CloseableHttpClient httpClient = createHttpClient();
                CloseableHttpResponse httpResponse = httpClient.execute(httpPost)) {
            if (httpResponse.getEntity() == null) {
                throw new SOAPException("InfoHighway response has no body");
            }

            long declaredLength = httpResponse.getEntity().getContentLength();
            if (declaredLength > maxResponseBytes) {
                throw new ExternalPatientResponseTooLargeException(maxResponseBytes);
            }
            byte[] responseBytes = ExternalPatientResponseSizeLimiter.readBytes(httpResponse.getEntity().getContent(),
                    maxResponseBytes);

            int upstreamStatus = httpResponse.getStatusLine().getStatusCode();
            if (upstreamStatus < HttpStatus.SC_OK || upstreamStatus >= HttpStatus.SC_MULTIPLE_CHOICES) {
                returnStatus = upstreamStatus == HttpStatus.SC_UNAUTHORIZED ? HttpStatus.SC_UNAUTHORIZED
                        : HttpStatus.SC_BAD_GATEWAY;
                return;
            }

            SOAPMessage soapResponse = parseSoapResponse(httpResponse, responseBytes);
            if (soapResponse.getSOAPBody().getFault() != null) {
                returnStatus = HttpStatus.SC_BAD_GATEWAY;
                return;
            }

            processResponse(soapResponse);
            returnStatus = HttpStatus.SC_OK;
        }
    }

    protected CloseableHttpClient createHttpClient() {
        return HttpClientBuilder.create().setDefaultRequestConfig(createRequestConfig()).disableRedirectHandling()
                .disableAutomaticRetries().disableContentCompression().build();
    }

    RequestConfig createRequestConfig() {
        return RequestConfig.custom().setConnectTimeout(timeout).setSocketTimeout(timeout)
                .setConnectionRequestTimeout(timeout).setRedirectsEnabled(false).build();
    }

    private HttpPost createHttpPost(String soapEndpointUrl, SOAPMessage soapRequest) throws SOAPException, IOException {
        ByteArrayOutputStream requestBody = new ByteArrayOutputStream();
        soapRequest.writeTo(requestBody);

        HttpPost httpPost = new HttpPost(soapEndpointUrl);
        @SuppressWarnings("unchecked")
        Iterator<MimeHeader> requestHeaders = soapRequest.getMimeHeaders().getAllHeaders();
        while (requestHeaders.hasNext()) {
            MimeHeader header = requestHeaders.next();
            if (!"Content-Length".equalsIgnoreCase(header.getName())) {
                httpPost.addHeader(header.getName(), header.getValue());
            }
        }
        if (!httpPost.containsHeader("Content-Type")) {
            httpPost.setHeader("Content-Type", "text/xml; charset=utf-8");
        }
        httpPost.setHeader("Accept-Encoding", "identity");
        httpPost.setEntity(new ByteArrayEntity(requestBody.toByteArray()));
        return httpPost;
    }

    private SOAPMessage parseSoapResponse(CloseableHttpResponse httpResponse, byte[] responseBytes)
            throws SOAPException, IOException {
        ExternalPatientXmlSecurity.requireSoapWithoutDoctype(responseBytes);
        MimeHeaders responseHeaders = new MimeHeaders();
        for (Header header : httpResponse.getAllHeaders()) {
            if (!"Content-Length".equalsIgnoreCase(header.getName())
                    && !"Content-Encoding".equalsIgnoreCase(header.getName())) {
                responseHeaders.addHeader(header.getName(), header.getValue());
            }
        }
        if (responseHeaders.getHeader("Content-Type") == null) {
            responseHeaders.addHeader("Content-Type", "text/xml; charset=utf-8");
        }
        MessageFactory messageFactory = MessageFactory.newInstance(SOAPConstants.SOAP_1_1_PROTOCOL);
        return messageFactory.createMessage(responseHeaders, new ByteArrayInputStream(responseBytes));
    }

    private void processResponse(SOAPMessage soapResponse) throws SOAPException {
        SOAPBody soapResponseBody = soapResponse.getSOAPBody();
        QName bodyName = new QName("http://ws.server.mhaccess.crimsonlogic.com/", "queryResponse", "ns3");
        Iterator<jakarta.xml.soap.Node> iterator = soapResponseBody.getChildElements(bodyName);
        boolean foundQueryResponse = false;
        while (iterator.hasNext()) {
            foundQueryResponse = true;
            SOAPElement queryResponse = (SOAPElement) iterator.next();

            Node returnNode = queryResponse.getElementsByTagName("return").item(0);
            if (returnNode == null) {
                throw new SOAPException("InfoHighway response is missing return data");
            }
            if (returnNode.getNodeType() == Node.ELEMENT_NODE) {
                Element returnElement = (Element) returnNode;
                NodeList fieldsList = returnElement.getElementsByTagName("fields");
                NodeList valuesList = returnElement.getElementsByTagName("values");
                for (int i = 0; i < valuesList.getLength(); ++i) {
                    if (resultLimit != null && searchResults.size() >= resultLimit) {
                        return;
                    }
                    if (valuesList.item(i).getNodeType() == Node.ELEMENT_NODE) {
                        Element valuesElement = (Element) valuesList.item(i);
                        addPatient(fieldsList, valuesElement.getElementsByTagName("value"));
                    }
                }
            }
        }
        if (!foundQueryResponse) {
            throw new SOAPException("InfoHighway response is missing queryResponse");
        }
    }

    private void addPatient(NodeList fieldsList, NodeList valueList) {
        try {
            ExtendedPatientSearchResults patient = new ExtendedPatientSearchResults();
            patient.setDataSourceName(MessageUtil.getMessage("externalconnections.infohighway"));
            for (int i = 0; i < fieldsList.getLength(); ++i) {
                addField(patient, fieldsList.item(i).getTextContent(), valueList.item(i).getTextContent());
            }
            searchResults.add(patient);
        } catch (DOMException | ParseException e) {
            LogEvent.logError("Could not add patient retrieved from infohighway. Continuing", e);
        }
    }

    private void addField(ExtendedPatientSearchResults patient, String fieldName, String value) throws ParseException {
        switch (fieldName) {
        case "NIC_NUMBER":
            patient.setNationalId(value);
            break;
        case "SURNAME":
            patient.setLastName(value);
            break;
        case "FIRST_NAME":
            patient.setFirstName(value);
            break;
        case "SEX":
            patient.setGender(value);
            break;
        case "BIRTH_DATE":
            setDate(patient, value);
            break;
        case "FLAT_NO_APARTMENT_NAME":
            patient.setFlatNumberApartmentName(value);
            break;
        case "STREET_NAME":
            patient.setStreetName(value);
            break;
        case "POSTAL_CODE":
            patient.setPostalCode(value);
            break;
        case "TOWN_VILLAGE":
            patient.setCampCommune(value);
            break;
        case "LOCALITY":
            patient.setTown(value);
            break;
        case "DISTRICT":
            patient.setCounty(value);
            break;
        default:
            break;
        }
    }

    private void setDate(ExtendedPatientSearchResults patient, String dateString) throws ParseException {

        String dateFormat = "yyyy-MM-dd";
        String dateTimeFormat = "yyyy-MM-dd HH:mm:ss.S";
        SimpleDateFormat dateFormatter = new SimpleDateFormat(dateFormat);
        SimpleDateFormat dateTimeFormatter = new SimpleDateFormat(dateTimeFormat);
        if (!GenericValidator.isBlankOrNull(dateString)) {
            if (dateString.length() == dateFormat.length()) {
                Date date = dateFormatter.parse(dateString);
                patient.setBirthdate(DateUtil.formatDateAsText(date));
            } else if (dateString.length() == dateTimeFormat.length()) {
                Date date = dateTimeFormatter.parse(dateString);
                patient.setBirthdate(DateUtil.formatDateAsText(date));
            } else {
                LogEvent.logWarn(this.getClass().getSimpleName(), "setDate",
                        "Could not parse date received from infohighway search");
            }
        }
    }

    private SOAPMessage createSOAPRequest(String soapAction) throws SOAPException {
        MessageFactory messageFactory = MessageFactory.newInstance(SOAPConstants.SOAP_1_1_PROTOCOL);
        SOAPMessage soapMessage = messageFactory.createMessage();
        createSoapEnvelope(soapMessage);

        MimeHeaders headers = soapMessage.getMimeHeaders();
        headers.addHeader("SOAPAction", soapAction);

        soapMessage.saveChanges();

        return soapMessage;
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

package org.openelisglobal.sample.controller.rest;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Type;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.service.EntrySubmissionCommand;
import org.openelisglobal.sample.service.CollectionSaveAttempt;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;

/** Hash the complete wire command before Jackson, binding, or requester canonicalization. */
@ControllerAdvice(assignableTypes = SamplePatientEntryRestController.class)
public class EntrySubmissionBodyAdvice extends RequestBodyAdviceAdapter {
    private static final String CAPTURE = EntrySubmissionBodyAdvice.class.getName();
    private record Capture(String key, String hash) { }

    @Override
    public boolean supports(MethodParameter parameter, Type targetType,
            Class<? extends HttpMessageConverter<?>> converterType) {
        return parameter.getContainingClass() == SamplePatientEntryRestController.class
                && parameter.getMethod() != null && "samplePatientEntrySave".equals(parameter.getMethod().getName())
                && targetType == SamplePatientEntryForm.class;
    }

    @Override
    public HttpInputMessage beforeBodyRead(HttpInputMessage input, MethodParameter parameter, Type type,
            Class<? extends HttpMessageConverter<?>> converter) throws IOException {
        var request = request();
        String collectionKey = request.getHeader(CollectionSaveAttempt.HEADER);
        if (collectionKey != null && request.getHeader(EntrySubmissionCommand.HEADER) != null) { throw invalid(); }
        String header = collectionKey == null ? EntrySubmissionCommand.HEADER : CollectionSaveAttempt.HEADER;
        String key = request.getHeader(header);
        if (key == null) { return input; }
        var media = input.getHeaders().getContentType();
        if (media == null || !org.springframework.http.MediaType.APPLICATION_JSON.isCompatibleWith(media)
                || (media.getCharset() != null && !java.nio.charset.StandardCharsets.UTF_8.equals(media.getCharset()))) {
            throw invalid();
        }
        var keys = request.getHeaders(header);
        if (keys == null || !keys.hasMoreElements()) { throw invalid(); }
        keys.nextElement();
        if (keys.hasMoreElements()) { throw invalid(); }
        EntrySubmissionCommand.validateKey(key);
        byte[] bytes = input.getBody().readNBytes(EntrySubmissionCommand.MAX_BYTES + 1);
        if (bytes.length > EntrySubmissionCommand.MAX_BYTES) {
            throw new EntrySubmissionException(413, "ENTRY_SUBMISSION_TOO_LARGE", "申请内容过大，请减少附件后重新确认；本次未保存。");
        }
        try {
            var parsed = new com.fasterxml.jackson.databind.ObjectMapper()
                    .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION).readTree(bytes);
            if (parsed == null || !parsed.isObject()) { throw invalid(); }
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
            throw invalid();
        }
        request.setAttribute(CAPTURE, new Capture(key, EntrySubmissionCommand.fingerprint(bytes)));
        return new HttpInputMessage() {
            @Override public InputStream getBody() { return new ByteArrayInputStream(bytes); }
            @Override public HttpHeaders getHeaders() { return input.getHeaders(); }
        };
    }

    @Override
    public Object afterBodyRead(Object body, HttpInputMessage input, MethodParameter parameter, Type type,
            Class<? extends HttpMessageConverter<?>> converter) {
        var request = request();
        if (request.getHeader(EntrySubmissionCommand.HEADER) != null
                || request.getHeader(CollectionSaveAttempt.HEADER) != null) {
            if (!(body instanceof SamplePatientEntryForm form)
                    || !(request.getAttribute(CAPTURE) instanceof Capture capture)) { throw invalid(); }
            if (request.getHeader(CollectionSaveAttempt.HEADER) != null) {
                if (!form.isCollectionOnly() || form.getRequestedSpecimens() != null) { throw invalid(); }
                request.setAttribute(CollectionSaveAttempt.ATTRIBUTE,
                        new CollectionSaveAttempt(capture.key(), capture.hash(), form));
            } else {
                request.setAttribute(EntrySubmissionCommand.ATTRIBUTE,
                        new EntrySubmissionCommand(capture.key(), capture.hash(), form));
            }
            request.removeAttribute(CAPTURE);
        }
        return body;
    }

    @Override
    public Object handleEmptyBody(Object body, HttpInputMessage input, MethodParameter parameter, Type type,
            Class<? extends HttpMessageConverter<?>> converter) {
        if (request().getHeader(EntrySubmissionCommand.HEADER) != null
                || request().getHeader(CollectionSaveAttempt.HEADER) != null) { throw invalid(); }
        return body;
    }

    private jakarta.servlet.http.HttpServletRequest request() {
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)) {
            throw invalid();
        }
        return attributes.getRequest();
    }

    private EntrySubmissionException invalid() {
        return new EntrySubmissionException(400, "ENTRY_SUBMISSION_INVALID", "无法核实本次保存内容，请保留草稿，不要重复提交。");
    }
}

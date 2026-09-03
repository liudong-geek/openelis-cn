package org.openelisglobal.config;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.Logger;
import org.apache.logging.log4j.core.LoggerContext;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.config.LoggerConfig;
import org.apache.logging.log4j.core.config.Property;
import org.apache.logging.log4j.core.layout.PatternLayout;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.log.LogEvent;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;

public class ControllerSetupLoggingTest {

    private final Logger logEventLogger = (Logger) LogManager.getLogger(LogEvent.class);
    private final LoggerContext loggerContext = (LoggerContext) LogManager.getContext(false);
    private final CapturingAppender appender = new CapturingAppender();
    private LoggerConfig loggerConfig;
    private Level originalLevel;

    @Before
    public void captureLogEvents() {
        loggerConfig = loggerContext.getConfiguration().getLoggerConfig(LogEvent.class.getName());
        originalLevel = loggerConfig.getLevel();
        loggerConfig.setLevel(Level.ALL);
        loggerContext.updateLoggers();
        logEventLogger.addAppender(appender);
    }

    @After
    public void restoreLogger() {
        logEventLogger.removeAppender(appender);
        loggerConfig.setLevel(originalLevel);
        loggerContext.updateLoggers();
        appender.close();
    }

    @Test
    public void clientRequestFailuresAreWarningsRatherThanServerErrors() {
        ProbeControllerSetup handler = new ProbeControllerSetup();

        handler.exposeUnreadable(new HttpMessageNotReadableException("qa-log-001 unreadable-json",
                new MockHttpInputMessage(new byte[0])));
        assertOnlyLevel("qa-log-001 unreadable-json", Level.WARN);

        appender.clear();
        handler.exposeMissingParameter(new MissingServletRequestParameterException("qaLog001Required", "String"));
        assertOnlyLevel("qaLog001Required", Level.WARN);

        appender.clear();
        handler.exposeUnsupportedMediaType(new HttpMediaTypeNotSupportedException("qa-log-001 unsupported-media"));
        assertOnlyLevel("qa-log-001 unsupported-media", Level.WARN);
    }

    @Test
    public void unexpectedRuntimeFailuresRemainErrors() {
        ProbeControllerSetup handler = new ProbeControllerSetup();

        handler.exposeRuntime(new RuntimeException("qa-log-001 runtime"));
        assertOnlyLevel("qa-log-001 runtime", Level.ERROR);

        appender.clear();
        handler.exposeLimsRuntime(new LIMSRuntimeException("qa-log-001 lims-runtime"));
        assertOnlyLevel("qa-log-001 lims-runtime", Level.ERROR);
    }

    @Test
    public void accessDeniedIsAForbiddenWarningRatherThanAServerError() {
        ProbeControllerSetup handler = new ProbeControllerSetup();

        ResponseEntity<Object> response =
                handler.exposeAccessDenied(new AccessDeniedException("qa-log-001 access-denied"));

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertOnlyLevel("qa-log-001 access-denied", Level.WARN);
    }

    private void assertOnlyLevel(String marker, Level expectedLevel) {
        List<org.apache.logging.log4j.core.LogEvent> matching = appender.events.stream()
                .filter(event -> event.getMessage().getFormattedMessage().contains(marker)).toList();

        assertFalse("Expected a log event containing marker: " + marker, matching.isEmpty());
        assertEquals("Unexpected log level for marker: " + marker, 1, matching.size());
        assertEquals("Unexpected log level for marker: " + marker, expectedLevel, matching.get(0).getLevel());
    }

    private static WebRequest request() {
        return new ServletWebRequest(new MockHttpServletRequest("POST", "/rest/qa-log-001"));
    }

    private static final class ProbeControllerSetup extends ControllerSetup {

        ResponseEntity<Object> exposeUnreadable(HttpMessageNotReadableException exception) {
            return handleHttpMessageNotReadable(exception, new HttpHeaders(), HttpStatus.BAD_REQUEST, request());
        }

        ResponseEntity<Object> exposeMissingParameter(MissingServletRequestParameterException exception) {
            return handleMissingServletRequestParameter(exception, new HttpHeaders(), HttpStatus.BAD_REQUEST,
                    request());
        }

        ResponseEntity<Object> exposeUnsupportedMediaType(HttpMediaTypeNotSupportedException exception) {
            return handleHttpMediaTypeNotSupported(exception, new HttpHeaders(), HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    request());
        }

        ResponseEntity<Object> exposeRuntime(RuntimeException exception) {
            return handleRuntimeException(exception, request());
        }

        ResponseEntity<Object> exposeLimsRuntime(LIMSRuntimeException exception) {
            return handleLIMSRuntimeException(exception, request());
        }

        ResponseEntity<Object> exposeAccessDenied(AccessDeniedException exception) {
            return handleAccessDeniedException(exception, request());
        }
    }

    private static final class CapturingAppender extends AbstractAppender {

        private final List<org.apache.logging.log4j.core.LogEvent> events = new CopyOnWriteArrayList<>();

        private CapturingAppender() {
            super("ControllerSetupLoggingTest", null, PatternLayout.createDefaultLayout(), false,
                    Property.EMPTY_ARRAY);
            start();
        }

        @Override
        public void append(org.apache.logging.log4j.core.LogEvent event) {
            events.add(event.toImmutable());
        }

        void clear() {
            events.clear();
        }

        public void close() {
            events.clear();
            stop();
        }
    }
}

package org.openelisglobal.resultvalidation.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.reports.service.DocumentTypeService;
import org.openelisglobal.reports.valueholder.DocumentType;
import org.openelisglobal.resultvalidation.form.ReviewPendingSummary;
import org.openelisglobal.resultvalidation.service.ReviewPendingService;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.authorization.method.AuthorizationManagerBeforeMethodInterceptor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

public class ReviewPendingRestContractTest {
    private AccessionValidationRestController controller;
    private ReviewPendingService service;
    private MockHttpServletRequest request;

    @Before
    public void setup() {
        var references = mock(ReferenceTablesService.class);
        var reference = new ReferenceTables();
        reference.setId("1");
        when(references.getReferenceTableByName("RESULT")).thenReturn(reference);
        var documents = mock(DocumentTypeService.class);
        var document = new DocumentType();
        document.setId("2");
        when(documents.getDocumentTypeByName("resultExport")).thenReturn(document);
        var target = new AccessionValidationRestController(null, null, null, null, null, null, references, documents,
                null, null, null);
        service = mock(ReviewPendingService.class);
        ReflectionTestUtils.setField(target, "reviewPendingService", service);
        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvisor(AuthorizationManagerBeforeMethodInterceptor.preAuthorize());
        controller = (AccessionValidationRestController) proxy.getProxy();
        request = new MockHttpServletRequest();
        var user = new UserSessionData();
        user.setSytemUserId(7);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, user);
        request.setParameter("systemUserId", "999");
    }

    @After
    public void cleanup() {
        SecurityContextHolder.clearContext();
    }

    @Test
    public void reviewPermissionIsRequiredForSummaryAndModernQueryEvenWithOtherRoles() {
        for (String role : new String[] { "ROLE_RECEPTION", "ROLE_RESULTS", "ROLE_ADMIN" }) {
            SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("user", "N/A", role));
            assertThrows(AccessDeniedException.class, () -> controller.pendingSummary(request));
            assertThrows(AccessDeniedException.class,
                    () -> controller.showAccessionValidationRange(request, null, null, null, true));
        }
        verifyZeroInteractions(service);
    }

    @Test
    public void summaryUsesSessionActorNeverQueryUser() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("user", "N/A", "ROLE_VALIDATION"));
        var summary = new ReviewPendingSummary("pending", "partial", 8L, 3L, null, null, Instant.now().toString());
        when(service.summary("7")).thenReturn(summary);
        assertSame(summary, controller.pendingSummary(request));
        verify(service).summary("7");
        verifyNoMoreInteractions(service);
    }
}

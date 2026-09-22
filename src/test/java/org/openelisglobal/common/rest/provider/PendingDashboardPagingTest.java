package org.openelisglobal.common.rest.provider;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.paging.PagingProperties;
import org.openelisglobal.common.rest.provider.bean.homedashboard.DashBoardTile.TileType;
import org.openelisglobal.common.rest.provider.bean.homedashboard.OrderDisplayBean;
import org.openelisglobal.common.rest.provider.form.PatientDashBoardForm;
import org.openelisglobal.common.rest.util.PatientDashBoardPaging;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.result.service.ResultEntryWorklistService;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.authorization.method.AuthorizationManagerBeforeMethodInterceptor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

public class PendingDashboardPagingTest {
    private PatientDashBoardProvider controller;
    private ResultEntryWorklistService service;
    private MockHttpServletRequest request;
    private Object previousFactory;

    @Before
    public void setup() {
        PagingProperties properties = new PagingProperties();
        properties.setResultsPageSize(100);
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class);
        when(factory.getBean(PagingProperties.class)).thenReturn(properties);
        DefaultConfigurationProperties configuration = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(configuration);
        when(configuration.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("zh-CN");
        when(configuration.getPropertyValue(Property.AmbiguousDateHolder)).thenReturn("X");
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        service = mock(ResultEntryWorklistService.class);
        PatientDashBoardProvider target = new PatientDashBoardProvider();
        ReflectionTestUtils.setField(target, "resultEntryWorklistService", service);
        ReflectionTestUtils.setField(target, "pagingProperties", properties);
        ProxyFactory proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvisor(AuthorizationManagerBeforeMethodInterceptor.preAuthorize());
        controller = (PatientDashBoardProvider) proxy.getProxy();
        request = new MockHttpServletRequest();
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(7);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, actor);
        request.getSession().setAttribute(IActionConstants.RESULTS_SESSION_CACHE,
                List.of(List.of(item("unauthorized"))));
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("user", "N/A", "ROLE_RESULTS"));
    }

    @After
    public void cleanup() {
        SecurityContextHolder.clearContext();
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
    }

    @Test
    public void resultPageUsesActorAndFreshServiceDataEvenWithForeignCacheAndUserParameter() throws Exception {
        request.setParameter("page", "2");
        PatientDashBoardForm current = new PatientDashBoardForm();
        current.setOrderDisplayBeans(List.of(item("allowed")));
        when(service.getPendingDashboardPageForUser("7", 2, 100)).thenReturn(current);
        assertSame(current, controller.getDashBoardDisplayList(request, TileType.ORDERS_IN_PROGRESS, "999"));
        verify(service).getPendingDashboardPageForUser("7", 2, 100);
        verifyNoMoreInteractions(service);
    }

    @Test
    public void resultsRoleIsRequiredForCachedOrInitialPage() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("user", "N/A", "ROLE_RECEPTION"));
        request.setParameter("page", "1");
        assertThrows(AccessDeniedException.class,
                () -> controller.getDashBoardDisplayList(request, TileType.ORDERS_IN_PROGRESS, "999"));
        verifyZeroInteractions(service);
    }

    @Test
    public void invalidPageNumbersReturnBadRequestBeforeDataAccess() {
        for (String page : List.of("0", "-1", "abc", "1.5", "2147483648")) {
            request.setParameter("page", page);
            ResponseStatusException error = assertThrows(ResponseStatusException.class,
                    () -> controller.getDashBoardDisplayList(request, TileType.ORDERS_IN_PROGRESS, null));
            assertEquals(400, error.getStatusCode().value());
        }
        verifyZeroInteractions(service);
    }

    @Test
    public void differentTileCannotConsumeThePreviousResultCache() throws Exception {
        request.setParameter("page", "1");
        var response = controller.getDashBoardDisplayList(request, TileType.AVERAGE_TURN_AROUND_TIME, null);
        assertTrue(response.getDisplayItems().isEmpty());
        request.setParameter("page", "2");
        assertThrows(ResponseStatusException.class,
                () -> controller.getDashBoardDisplayList(request, TileType.AVERAGE_TURN_AROUND_TIME, null));
        verifyZeroInteractions(service);
    }

    @Test
    public void configuredPageSizeDoesNotAddAnExtraRowAndBoundaryPagesRemainComplete() {
        List<OrderDisplayBean> rows = new ArrayList<>();
        for (int i = 1; i <= 201; i++)
            rows.add(item(String.valueOf(i)));
        PatientDashBoardPaging paging = new PatientDashBoardPaging();
        PatientDashBoardForm response = new PatientDashBoardForm();
        paging.setDatabaseResults(response, rows, 1);
        assertEquals(100, response.getDisplayItems().size());
        assertEquals("100", response.getDisplayItems().get(99).getId());
        paging.setDatabaseResults(response, rows, 2);
        assertEquals(100, response.getDisplayItems().size());
        assertEquals("101", response.getDisplayItems().get(0).getId());
        paging.setDatabaseResults(response, rows, 3);
        assertEquals(1, response.getDisplayItems().size());
        assertEquals("201", response.getDisplayItems().get(0).getId());
        assertEquals("3", response.getPaging().getTotalPages());
    }

    private OrderDisplayBean item(String id) {
        OrderDisplayBean item = new OrderDisplayBean();
        item.setId(id);
        return item;
    }
}

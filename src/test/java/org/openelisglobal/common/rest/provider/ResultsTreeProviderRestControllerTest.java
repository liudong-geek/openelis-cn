package org.openelisglobal.common.rest.provider;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.rest.provider.bean.patientHistory.PanelDisplay;
import org.openelisglobal.common.rest.provider.bean.patientHistory.ResultTree;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.result.service.PatientResultHistoryService;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

@RunWith(MockitoJUnitRunner.class)
public class ResultsTreeProviderRestControllerTest {

    @Mock
    private PatientResultHistoryService historyService;

    @Mock
    private UserRoleService userRoleService;

    @InjectMocks
    private ResultsTreeProviderRestController controller;

    private MockHttpServletRequest request;

    @Before
    public void setUp() {
        request = new MockHttpServletRequest();
    }

    @Test
    public void resultTree_unauthenticatedRequestReturns401BeforeServiceCall() {
        ResponseEntity<List<ResultTree>> response = controller.getResultTreeArray(request, "4");

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        verifyZeroInteractions(historyService);
    }

    @Test
    public void resultTree_userWithoutReceptionRoleReturns403BeforeServiceCall() {
        authenticate("7");
        when(userRoleService.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(false);

        ResponseEntity<List<ResultTree>> response = controller.getResultTreeArray(request, "4");

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        verifyZeroInteractions(historyService);
    }

    @Test
    public void resultTree_blankPatientReturns400AfterAuthorizationWithoutServiceCall() {
        authenticateReceptionUser("7");

        ResponseEntity<List<ResultTree>> response = controller.getResultTreeArray(request, " ");

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verifyZeroInteractions(historyService);
    }

    @Test
    public void resultTree_authorizedRequestDelegatesToCompiledDtoService() {
        authenticateReceptionUser("7");
        ResultTree tree = new ResultTree();
        when(historyService.getResultTree("4")).thenReturn(List.of(tree));

        ResponseEntity<List<ResultTree>> response = controller.getResultTreeArray(request, "4");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(tree, response.getBody().get(0));
        verify(historyService).getResultTree("4");
    }

    @Test
    public void testResultTree_blankTestReturns400WithoutServiceCall() {
        authenticateReceptionUser("7");

        ResponseEntity<PanelDisplay> response = controller.getTestResultTree(request, "4", " ");

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verifyZeroInteractions(historyService);
    }

    @Test
    public void testResultTree_unknownTestReturns404() {
        authenticateReceptionUser("7");
        when(historyService.getTestResultTree("4", "999")).thenReturn(null);

        ResponseEntity<PanelDisplay> response = controller.getTestResultTree(request, "4", "999");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(historyService).getTestResultTree("4", "999");
    }

    private void authenticateReceptionUser(String userId) {
        authenticate(userId);
        when(userRoleService.userInRole(userId, Constants.ROLE_RECEPTION)).thenReturn(true);
    }

    private void authenticate(String userId) {
        UserSessionData userSessionData = new UserSessionData();
        userSessionData.setSytemUserId(Integer.valueOf(userId));
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, userSessionData);
    }
}

package org.openelisglobal.result.controller.rest;

import static org.hamcrest.CoreMatchers.hasItems;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.userrole.valueholder.LabUnitRoleMap;
import org.openelisglobal.userrole.valueholder.UserLabUnitRoles;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

/**
 * OGC-1020 (R1) — unified Results worklist REST surface: per-analysis save
 * scoping (FR-O1), optimistic stale-save rejection (FR-O2), session-bound
 * presence (FR-O3), and lab-unit domain (FR-M1).
 */
public class ResultEntryRestControllerTest extends BaseWebContextSensitiveTest {

    private static final int RESULT_ENTRY_LAB_UNIT_ROLE_MAP_ID = -9101;

    @Autowired
    private AnalysisService analysisService;
    @Autowired
    private ResultService resultService;
    @Autowired
    private TestSectionService testSectionService;
    @Autowired
    private IStatusService statusService;
    @Autowired
    private UserService userService;
    @Autowired
    private RoleService roleService;
    @Autowired
    private DisplayListService displayListService;
    @Autowired
    private javax.sql.DataSource dataSource;

    private JdbcTemplate jdbc;
    private MockHttpSession session;
    private boolean createdUserLabUnitRoleRoot;
    private boolean configuredMockDisplayList;

    @Before
    public void setUp() throws Exception {
        super.setUp();
        executeDataSetWithStateManagement("testdata/result.xml");
        jdbc = new JdbcTemplate(dataSource);
        seedAnalysisStatuses();
        // This controller exercises ordinary result correction, so analysis 1 must
        // be pending technical review rather than already released/finalized.
        jdbc.update("UPDATE clinlims.analysis SET status_id = 9103, released_date = NULL, printed_date = NULL "
                + "WHERE id = 1");
        jdbc.update("UPDATE clinlims.test_section SET domain = 'ENVIRONMENTAL' WHERE id = 2");
        // result.xml's panel rows omit lastupdated; a null @Version makes
        // Hibernate treat the referenced Panel as transient when the analysis
        // update cascades, failing the save.
        jdbc.update("UPDATE clinlims.panel SET lastupdated = NOW() WHERE lastupdated IS NULL");
        seedResultEntryPermission();
        configureActiveTestSectionList();
        statusService.refreshCache();
        session = buildAuthenticatedSession("admin");
        assertResultEntryPermissionGraph();
    }

    @After
    public void tearDownResultEntryPermission() {
        if (jdbc != null) {
            clearResultEntryPermissionGraph();
            if (createdUserLabUnitRoleRoot) {
                jdbc.update(
                        "DELETE FROM clinlims.user_lab_unit_roles root WHERE root.system_user_id = 1 AND NOT EXISTS "
                                + "(SELECT 1 FROM clinlims.lab_unit_roles link WHERE link.system_user_id = root.system_user_id)");
            }
        }
        if (configuredMockDisplayList) {
            org.mockito.Mockito.reset(displayListService);
        }
    }

    /**
     * lab_roles has no database primary key, so DBUnit REFRESH cannot load it. Seed
     * the real production authorization graph after the ordinary fixture is loaded.
     * The map itself is not owned by system_user, so remove this test's complete
     * graph first to keep repeated methods and repeated runs isolated.
     */
    private void seedResultEntryPermission() {
        String resultsRoleId = jdbc.queryForObject(
                "SELECT id::text FROM clinlims.system_role WHERE btrim(name) = 'Results' ORDER BY id LIMIT 1",
                String.class);
        assertNotNull("the Results role must exist in the loaded fixture", resultsRoleId);
        createdUserLabUnitRoleRoot = !Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM clinlims.user_lab_unit_roles WHERE system_user_id = 1)", Boolean.class));
        clearResultEntryPermissionGraph();
        if (createdUserLabUnitRoleRoot) {
            jdbc.update("INSERT INTO clinlims.user_lab_unit_roles (system_user_id, last_updated) VALUES (1, NOW())");
        }
        jdbc.update("INSERT INTO clinlims.lab_unit_role_map (lab_unit_role_map_id, lab_unit) VALUES (?, 'AllLabUnits')",
                RESULT_ENTRY_LAB_UNIT_ROLE_MAP_ID);
        jdbc.update("INSERT INTO clinlims.lab_roles (lab_unit_role_map_id, role) VALUES (?, ?)",
                RESULT_ENTRY_LAB_UNIT_ROLE_MAP_ID, resultsRoleId);
        jdbc.update("INSERT INTO clinlims.lab_unit_roles (system_user_id, lab_unit_role_map_id) VALUES (1, ?)",
                RESULT_ENTRY_LAB_UNIT_ROLE_MAP_ID);
    }

    private void clearResultEntryPermissionGraph() {
        jdbc.update("DELETE FROM clinlims.lab_unit_roles WHERE lab_unit_role_map_id = ?",
                RESULT_ENTRY_LAB_UNIT_ROLE_MAP_ID);
        jdbc.update("DELETE FROM clinlims.lab_roles WHERE lab_unit_role_map_id = ?", RESULT_ENTRY_LAB_UNIT_ROLE_MAP_ID);
        jdbc.update("DELETE FROM clinlims.lab_unit_role_map WHERE lab_unit_role_map_id = ?",
                RESULT_ENTRY_LAB_UNIT_ROLE_MAP_ID);
    }

    private void configureActiveTestSectionList() {
        // AppTestConfig deliberately supplies a DisplayListService mock. Bind only
        // this reference list to the fixture's real TestSectionService result so the
        // production UserService permission path remains under test.
        if (org.mockito.Mockito.mockingDetails(displayListService).isMock()) {
            var activeSections = testSectionService.getAllActiveTestSections().stream()
                    .map(section -> new org.openelisglobal.common.util.IdValuePair(section.getId(),
                            section.getLocalizedName()))
                    .toList();
            when(displayListService.getList(DisplayListService.ListType.TEST_SECTION_ACTIVE))
                    .thenReturn(activeSections);
            configuredMockDisplayList = true;
        } else {
            displayListService.refreshList(DisplayListService.ListType.TEST_SECTION_ACTIVE);
        }
    }

    private void assertResultEntryPermissionGraph() throws Exception {
        String resultsRoleId = jdbc.queryForObject(
                "SELECT id::text FROM clinlims.system_role WHERE btrim(name) = 'Results' ORDER BY id LIMIT 1",
                String.class);
        assertEquals("RoleService must resolve the same Results role that the fixture grants", resultsRoleId,
                roleService.getRoleByName(Constants.ROLE_RESULTS).getId());
        UserLabUnitRoles userLabUnitRoles = userService.getUserLabUnitRoles("1");
        assertNotNull("the persisted user lab-unit role root must be readable through UserService", userLabUnitRoles);
        assertNotNull("the persisted user lab-unit mappings must be readable through UserService",
                userLabUnitRoles.getLabUnitRoleMap());
        LabUnitRoleMap allLabUnits = userLabUnitRoles.getLabUnitRoleMap().stream()
                .filter(roleMap -> RESULT_ENTRY_LAB_UNIT_ROLE_MAP_ID == roleMap.getId()).findFirst().orElse(null);
        assertNotNull("the persisted AllLabUnits mapping must be readable through UserService", allLabUnits);
        assertEquals("AllLabUnits", allLabUnits.getLabUnit());
        assertTrue("the persisted mapping must carry the real Results role",
                allLabUnits.getRoles().contains(resultsRoleId));
        assertTrue("both fixture sections must be present in the active display list",
                DisplayListService.getInstance().getList(DisplayListService.ListType.TEST_SECTION_ACTIVE).stream()
                        .map(section -> section.getId()).collect(java.util.stream.Collectors.toSet())
                        .containsAll(java.util.Set.of("1", "2")));
        mockMvc.perform(get("/rest/results-entry/lab-units").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", hasItems("1", "2")));
    }

    /**
     * result.xml carries only the Finalized ANALYSIS status; the save path's status
     * transition needs the full named set (StatusService.addToAnalysisMap).
     */
    private void seedAnalysisStatuses() {
        String[][] statuses = { { "9101", "Not Tested", "4", "ANALYSIS" }, { "9102", "Test Canceled", "5", "ANALYSIS" },
                { "9103", "Technical Acceptance", "7", "ANALYSIS" }, { "9104", "Technical Rejected", "8", "ANALYSIS" },
                { "9105", "Biologist Rejection", "9", "ANALYSIS" }, { "9106", "Sample Rejected", "10", "ANALYSIS" },
                { "9107", "NonConforming", "11", "ANALYSIS" }, { "9108", "Test Entered", "12", "ORDER" },
                { "9109", "Testing Started", "13", "ORDER" }, { "9110", "Testing finished", "14", "ORDER" } };
        for (String[] status : statuses) {
            jdbc.update(
                    "INSERT INTO clinlims.status_of_sample (id, name, code, status_type, is_active, display_key,"
                            + " description, lastupdated) VALUES (?::numeric, ?, ?::numeric, ?, 'Y', ?, ?, NOW())",
                    status[0], status[1], status[2], status[3], "status." + status[0], status[1]);
        }
    }

    private MockHttpSession buildAuthenticatedSession(String loginName) {
        UserDetails userDetails = User.withUsername(loginName).password("N/A").authorities("ROLE_ADMIN", "ROLE_RESULTS")
                .build();
        SecurityContext sc = new SecurityContextImpl();
        sc.setAuthentication(new UsernamePasswordAuthenticationToken(userDetails, "N/A", userDetails.getAuthorities()));

        UserSessionData usd = new UserSessionData();
        usd.setSytemUserId(1);

        MockHttpSession httpSession = new MockHttpSession();
        httpSession.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, sc);
        httpSession.setAttribute(IActionConstants.USER_SESSION_DATA, usd);
        return httpSession;
    }

    private String currentToken(String analysisId) {
        Timestamp lastupdated = analysisService.get(analysisId).getLastupdated();
        return String.valueOf(lastupdated.getTime());
    }

    private String saveBody(String analysisId, String resultId, String testId, String value, String token) {
        String accessionNumber = "1".equals(analysisId) ? "12345" : "13333";
        String sampleItemId = "1".equals(analysisId) ? "601" : "602";
        // combined "date time" — the format ResultsLoadUtility actually emits;
        // regression for the validateTestDate date-portion fix (OGC-1020)
        String testDate = org.openelisglobal.common.util.DateUtil.formatDateAsText(new java.util.Date()) + " 09:15";
        String specimenIdentity = "\"sampleItemId\":\"" + sampleItemId + "\",";
        return "{\"testResult\":{" + specimenIdentity + "\"analysisId\":\"" + analysisId + "\","
                + "\"accessionNumber\":\"" + accessionNumber + "\"," + "\"resultId\":\"" + resultId + "\","
                + "\"testId\":\"" + testId + "\"," + "\"resultType\":\"N\"," + "\"resultValue\":\"" + value + "\","
                + "\"testDate\":\"" + testDate + "\"," + "\"isModified\":true," + "\"valid\":true,"
                + "\"reportable\":true," + (token == null ? "" : "\"analysisLastupdated\":\"" + token + "\",")
                + "\"note\":\"\"}}";
    }

    @Test
    public void save_withCurrentToken_persistsValue_andNeverTouchesOtherAnalyses() throws Exception {
        String otherValueBefore = resultService.get("4").getValue();
        Timestamp otherLastupdatedBefore = analysisService.get("2").getLastupdated();

        mockMvc.perform(post("/rest/results-entry/analysis/1/result").contentType(MediaType.APPLICATION_JSON)
                .content(saveBody("1", "3", "1", "90.0", currentToken("1"))).session(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.analysisLastupdated").exists());

        assertEquals("the edited result is persisted", "90.0", resultService.get("3").getValue());
        // FR-O1 regression (Lab Unit overwrite incident): the save wrote ONLY
        // the analysis it names — a colleague's row is untouched.
        assertEquals("another analysis' result is untouched", otherValueBefore, resultService.get("4").getValue());
        assertEquals("another analysis' version is untouched", otherLastupdatedBefore,
                analysisService.get("2").getLastupdated());
    }

    @Test
    public void save_withStaleToken_isRejected409_andWritesNothing() throws Exception {
        String staleToken = String.valueOf(analysisService.get("1").getLastupdated().getTime() - 60_000L);
        String valueBefore = resultService.get("3").getValue();

        mockMvc.perform(post("/rest/results-entry/analysis/1/result").contentType(MediaType.APPLICATION_JSON)
                .content(saveBody("1", "3", "1", "90.0", staleToken)).session(session)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("error.results.staleSave"))
                .andExpect(jsonPath("$.modifiedBy").exists()).andExpect(jsonPath("$.analysisLastupdated").exists());

        // FR-O2: the stale editor loses — nothing was merged or overwritten.
        assertEquals(valueBefore, resultService.get("3").getValue());
    }

    @Test
    public void save_whosePayloadNamesAnotherAnalysis_isRejected400() throws Exception {
        mockMvc.perform(post("/rest/results-entry/analysis/1/result").contentType(MediaType.APPLICATION_JSON)
                .content(saveBody("2", "4", "2", "15.0", null)).session(session)).andExpect(status().isBadRequest());
    }

    @Test
    public void presence_isVisibleToOtherSessions_andNeverToOwn() throws Exception {
        MockHttpSession sessionA = buildAuthenticatedSession("admin");
        MockHttpSession sessionB = buildAuthenticatedSession("jdoe");

        // A opens analysis 1 in Edit
        mockMvc.perform(post("/rest/results-entry/presence").contentType(MediaType.APPLICATION_JSON)
                .content("{\"analysisId\":\"1\",\"visibleAnalysisIds\":[\"1\",\"2\"]}").session(sessionA))
                .andExpect(status().isOk());

        // B sees A's claim on analysis 1 (FR-O3 advisory indicator)
        mockMvc.perform(post("/rest/results-entry/presence").contentType(MediaType.APPLICATION_JSON)
                .content("{\"analysisId\":null,\"visibleAnalysisIds\":[\"1\",\"2\"]}").session(sessionB))
                .andExpect(status().isOk()).andExpect(jsonPath("$.1").exists());

        // A never sees their own claim
        mockMvc.perform(post("/rest/results-entry/presence").contentType(MediaType.APPLICATION_JSON)
                .content("{\"analysisId\":\"1\",\"visibleAnalysisIds\":[\"1\",\"2\"]}").session(sessionA))
                .andExpect(status().isOk()).andExpect(jsonPath("$.1").doesNotExist());
    }

    @Test
    public void labUnitDomain_mapsFromTestSectionColumn() {
        // FR-M1 foundation: the OGC-1020 test_section.domain column round-trips
        // through the hbm mapping; unset rows default CLINICAL.
        assertEquals("ENVIRONMENTAL", testSectionService.get("2").getDomain());
        assertEquals("CLINICAL", testSectionService.get("1").getDomain());
    }
}

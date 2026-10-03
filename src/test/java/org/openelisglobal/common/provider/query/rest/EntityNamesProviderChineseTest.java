package org.openelisglobal.common.provider.query.rest;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.Map;
import org.json.simple.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.testconfiguration.service.ConfigurationNameService;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

public class EntityNamesProviderChineseTest {
    private EntityNamesProviderRestController controller;
    private ConfigurationNameService names;

    @Before
    public void setUp() {
        controller = new EntityNamesProviderRestController();
        names = mock(ConfigurationNameService.class);
        ReflectionTestUtils.setField(controller, "configurationNames", names);
    }

    @Test public void panelReadReturnsCanonicalChineseAndExactLocaleMap() {
        when(names.getPanelTranslations("41")).thenReturn(Map.of("en", "English", "fr", "French", "zh", "肝功能", "zh_CN", "旧名称"));
        ResponseEntity<JSONObject> result = controller.processRequest("41", "panel");
        assertEquals(200, result.getStatusCode().value());
        JSONObject name = (JSONObject) result.getBody().get("name");
        assertEquals("肝功能", name.get("chinese"));
        assertEquals("English", name.get("english"));
        assertEquals("French", name.get("french"));
        assertEquals("肝功能", ((Map<?, ?>) result.getBody().get("translations")).get("zh"));
        verify(names).getPanelTranslations("41");
        verifyNoMoreInteractions(names);
    }

    @Test public void groupReadWithNoChineseDoesNotUseEnglishFallbackAsChinese() {
        when(names.getTestSectionTranslations("73")).thenReturn(Map.of("en", "English", "fr", "French"));
        ResponseEntity<JSONObject> result = controller.processRequest("73", "testSection");
        assertEquals(200, result.getStatusCode().value());
        assertFalse(((JSONObject) result.getBody().get("name")).containsKey("chinese"));
        assertFalse(((Map<?, ?>) result.getBody().get("translations")).containsKey("zh"));
        verify(names).getTestSectionTranslations("73");
    }

    @Test
    public void legacyChineseRegionCodeReadsRealChineseWithoutEnglishFallback() {
        for (String code : new String[] { "zh-CN", "zh_CN" }) {
            when(names.getPanelTranslations("41")).thenReturn(Map.of("en", "English", code, "真实中文"));
            ResponseEntity<JSONObject> result = controller.processRequest("41", "panel");
            assertEquals("真实中文", ((JSONObject) result.getBody().get("name")).get("chinese"));
            assertEquals("真实中文", ((Map<?, ?>) result.getBody().get("translations")).get(code));
        }
    }

    @Test
    public void chineseAliasesUseTheSamePriorityAsTheNameEditor() {
        when(names.getPanelTranslations("41")).thenReturn(Map.of("zh-CN", "横线地区值", "zh_CN", "下划线地区值"));
        assertEquals("下划线地区值", ((JSONObject) controller.processRequest("41", "panel").getBody().get("name")).get("chinese"));
        when(names.getPanelTranslations("41")).thenReturn(Map.of("zh", "规范中文值", "zh-CN", "横线地区值", "zh_CN", "下划线地区值"));
        assertEquals("规范中文值", ((JSONObject) controller.processRequest("41", "panel").getBody().get("name")).get("chinese"));
    }

    @Test
    public void canonicalEnglishFrenchCannotBeOverwrittenByRegionalLocalesInEitherOrder() {
        for (boolean regionsFirst : new boolean[] { true, false }) {
            Map<String, String> values = new LinkedHashMap<>();
            if (regionsFirst) {
                values.put("en-US", "Regional English");
                values.put("fr_CA", "Regional French");
            }
            values.put("en", "Canonical English");
            values.put("fr", "Canonical French");
            if (!regionsFirst) {
                values.put("en-US", "Regional English");
                values.put("fr_CA", "Regional French");
            }
            when(names.getPanelTranslations("41")).thenReturn(values);
            ResponseEntity<JSONObject> result = controller.processRequest("41", "panel");
            JSONObject read = (JSONObject) result.getBody().get("name");
            assertEquals("Canonical English", read.get("english"));
            assertEquals("Canonical French", read.get("french"));
            assertEquals(values, result.getBody().get("translations"));
        }
    }

    @Test
    public void regionalNamesDoNotInventMissingCanonicalEnglishOrFrench() {
        Map<String, String> values = Map.of("en-US", "Regional English", "fr-CA", "Regional French");
        when(names.getTestSectionTranslations("73")).thenReturn(values);
        JSONObject read = controller.processRequest("73", "testSection").getBody();
        JSONObject legacy = (JSONObject) read.get("name");
        assertFalse(legacy.containsKey("english"));
        assertFalse(legacy.containsKey("french"));
        assertEquals(values, read.get("translations"));
    }

    @Test
    public void malformedBusinessIdsReturn400BeforeDatabaseForBothHttpReadTypes() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
        for (String entity : new String[] { "panel", "testSection" }) {
            for (String id : new String[] { "bad-id", "-1", "", " " }) {
                mvc.perform(get("/rest/EntityNamesProvider").param("entityName", entity).param("entityId", id))
                        .andExpect(status().isBadRequest());
            }
        }
        verifyZeroInteractions(names);
    }

    @Test public void missingEntityReturns404AndBlankIdReturns400() {
        when(names.getPanelTranslations("999")).thenReturn(null);
        assertEquals(404, controller.processRequest("999", "panel").getStatusCode().value());
        verify(names).getPanelTranslations("999");
        assertEquals(400, controller.processRequest(" ", "panel").getStatusCode().value());
        verifyNoMoreInteractions(names);
    }
}

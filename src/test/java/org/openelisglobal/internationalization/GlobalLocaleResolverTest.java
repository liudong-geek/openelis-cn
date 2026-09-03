package org.openelisglobal.internationalization;

import static org.junit.Assert.assertEquals;

import java.util.Locale;
import org.junit.Before;
import org.junit.Test;
import org.springframework.mock.web.MockHttpServletRequest;

public class GlobalLocaleResolverTest {

    private GlobalLocaleResolver resolver;

    @Before
    public void setUp() {
        resolver = new GlobalLocaleResolver();
        resolver.setDefaultLocale(Locale.US);
    }

    @Test
    public void acceptsLegacySimplifiedChineseUnderscoreAlias() {
        MockHttpServletRequest request = requestWithAcceptLanguage("zh_CN");

        assertEquals(Locale.SIMPLIFIED_CHINESE, resolver.resolveLocale(request));
        assertEquals(Locale.SIMPLIFIED_CHINESE, resolver.resolveLocaleContext(request).getLocale());
    }

    @Test
    public void resolvesEnglishAndFrenchRequestLocales() {
        assertEquals(Locale.ENGLISH, resolver.resolveLocale(requestWithAcceptLanguage("en")));
        assertEquals(Locale.FRENCH, resolver.resolveLocale(requestWithAcceptLanguage("fr")));
    }

    @Test
    public void honorsAcceptLanguageQualityOrder() {
        MockHttpServletRequest request = requestWithAcceptLanguage("en;q=0.5, zh-CN;q=1.0, fr;q=0.8");

        assertEquals(Locale.SIMPLIFIED_CHINESE, resolver.resolveLocale(request));
    }

    @Test
    public void malformedHeaderFallsBackWithoutChangingTheDefaultLocale() {
        MockHttpServletRequest request = requestWithAcceptLanguage("not a locale;q=broken");

        assertEquals(Locale.US, resolver.resolveLocale(request));
        assertEquals(Locale.US, resolver.determineDefaultLocale());
    }

    private MockHttpServletRequest requestWithAcceptLanguage(String language) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Accept-Language", language);
        return request;
    }
}


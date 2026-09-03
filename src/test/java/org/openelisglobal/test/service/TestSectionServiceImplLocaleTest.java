package org.openelisglobal.test.service;

import static org.junit.Assert.assertEquals;

import java.util.Locale;
import org.junit.After;
import org.junit.Test;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.context.i18n.LocaleContextHolder;

public class TestSectionServiceImplLocaleTest {

    private final TestSectionServiceImpl service = new TestSectionServiceImpl();

    @After
    public void resetLocale() {
        LocaleContextHolder.resetLocaleContext();
    }

    @Test
    public void resolvesTheSameSectionPerRequestWithoutUsingStartupLocaleCache() {
        TestSection section = new TestSection();
        section.setId("36");
        Localization localization = new Localization();
        localization.setLocalizedValue("en", "Hematology");
        localization.setLocalizedValue("zh", "血液学");
        localization.setLocalizedValue("fr", "Hématologie");
        section.setLocalization(localization);

        LocaleContextHolder.setLocale(Locale.ENGLISH);
        assertEquals("Hematology", service.getUserLocalizedTesSectionName(section));

        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);
        assertEquals("血液学", service.getUserLocalizedTesSectionName(section));

        LocaleContextHolder.setLocale(Locale.FRENCH);
        assertEquals("Hématologie", service.getUserLocalizedTesSectionName(section));
    }
}

package org.openelisglobal.localization;

import static org.junit.Assert.assertEquals;

import java.util.Locale;
import org.junit.Test;
import org.openelisglobal.localization.valueholder.Localization;

/** Verifies that one zh master-data value serves both zh and zh_CN requests. */
public class LocalizationLocaleResolutionTest {

    @Test
    public void getLocalizedValue_shouldKeepEnglishAndUseZhForSimplifiedChinese() {
        Localization localization = new Localization();
        localization.setLocalizedValue("en", "Hematology");
        localization.setLocalizedValue("zh", "血液学");

        assertEquals("Hematology", localization.getLocalizedValue(Locale.ENGLISH));
        assertEquals("血液学", localization.getLocalizedValue(Locale.CHINESE));
        assertEquals("血液学", localization.getLocalizedValue(Locale.SIMPLIFIED_CHINESE));
    }
}

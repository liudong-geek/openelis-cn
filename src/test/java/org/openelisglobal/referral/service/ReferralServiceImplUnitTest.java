package org.openelisglobal.referral.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.referral.valueholder.Referral;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.systemuser.service.UserService;
import org.springframework.test.util.ReflectionTestUtils;

public class ReferralServiceImplUnitTest {

    private ReferralServiceImpl service;
    private DictionaryService dictionaryService;
    private UserService userService;

    @Before
    public void setUp() {
        service = new ReferralServiceImpl();
        dictionaryService = mock(DictionaryService.class);
        userService = mock(UserService.class);
        ReflectionTestUtils.setField(service, "dictionaryService", dictionaryService);
        ReflectionTestUtils.setField(service, "userService", userService);
    }

    @Test
    public void multiSelectResult_joinsEveryValidDictionaryValueAndSkipsMissingValues() {
        Dictionary firstDictionary = mock(Dictionary.class);
        Dictionary secondDictionary = mock(Dictionary.class);
        when(firstDictionary.getLocalizedName()).thenReturn("阳性");
        when(secondDictionary.getLocalizedName()).thenReturn("需复检");
        when(dictionaryService.get("1")).thenReturn(firstDictionary);
        when(dictionaryService.get("2")).thenReturn(secondDictionary);
        when(dictionaryService.get("999")).thenReturn(null);

        Result first = result("M", "1");
        Result missingDictionary = result("M", "999");
        Result blank = result("M", "");
        Result second = result("M", "2");

        String display = ReflectionTestUtils.invokeMethod(service, "getAppropriateResultValue",
                List.of(first, missingDictionary, blank, second));

        assertEquals("阳性, 需复检", display);
        verify(dictionaryService).get("999");
    }

    @Test
    public void labUnitFilter_returnsOnlyReferralsWhoseAnalysesAreAuthorized() {
        Analysis firstAnalysis = analysis("A-1");
        Analysis secondAnalysis = analysis("A-2");
        Referral firstReferral = referral("R-1", firstAnalysis);
        Referral secondReferral = referral("R-2", secondAnalysis);
        when(userService.filterAnalysesByLabUnitRoles("42", List.of(firstAnalysis, secondAnalysis), "Results"))
                .thenReturn(List.of(secondAnalysis));

        List<Referral> filtered = service.filterReferralsByLabUnitRoles("42", List.of(firstReferral, secondReferral));

        assertEquals(1, filtered.size());
        assertEquals("R-2", filtered.get(0).getId());
    }

    @Test
    public void labUnitFilter_withoutResolvedUserIdReturnsNoPatientData() {
        assertTrue(service.filterReferralsByLabUnitRoles(null, List.of(referral("R-1", analysis("A-1")))).isEmpty());
    }

    private Result result(String type, String value) {
        Result result = new Result();
        result.setResultType(type);
        result.setValue(value);
        return result;
    }

    private Analysis analysis(String id) {
        Analysis analysis = new Analysis();
        analysis.setId(id);
        return analysis;
    }

    private Referral referral(String id, Analysis analysis) {
        Referral referral = new Referral();
        referral.setId(id);
        referral.setAnalysis(analysis);
        return referral;
    }
}

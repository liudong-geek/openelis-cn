package org.openelisglobal.result.action.util;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Explicit SIM values; entry must not act as review even with the old flag off.
 */
public class ResultReviewTransitionTest {
    private Object oldFactory;

    @Before
    public void setup() {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        IStatusService statuses = mock(IStatusService.class);
        configure(statuses);
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class);
        when(factory.getBean(IStatusService.class)).thenReturn(statuses);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
    }

    @After
    public void restore() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
    }

    public static void configure(IStatusService statuses) {
        for (AnalysisStatus status : AnalysisStatus.values())
            when(statuses.getStatusID(status)).thenReturn(String.valueOf(50 + status.ordinal()));
        when(statuses.getStatusID(AnalysisStatus.NotStarted)).thenReturn("1");
        when(statuses.getStatusID(AnalysisStatus.TechnicalAcceptance)).thenReturn("9");
        when(statuses.getStatusID(AnalysisStatus.Finalized)).thenReturn("90");
    }

    @Test
    public void ordinaryValidValueWithOldValidationFlagOffStillNeedsReview() {
        TestResultItem item = new TestResultItem();
        item.setResultType("N");
        item.setResultValue("5");
        item.setShadowResultValue("5");
        item.setValid(true);
        assertEquals("9", ResultUtil.getStatusForTestResult(item, false));
    }

    @Test public void postedCurrentValueWinsOverStaleShadowRegardlessOfJsonFieldOrder() throws Exception {
        when(((AutowireCapableBeanFactory)ReflectionTestUtils.getField(SpringContext.class,"factory"))
                .getBean(ResultsValidation.class)).thenReturn(mock(ResultsValidation.class));
        for(String json : new String[]{
                "{\"resultType\":\"N\",\"resultValue\":\"5\",\"shadowResultValue\":\"\",\"isModified\":true}",
                "{\"resultType\":\"N\",\"shadowResultValue\":\"\",\"resultValue\":\"5\",\"isModified\":true}",
                "{\"resultType\":\"N\",\"resultValue\":\"5\",\"shadowResultValue\":\"8\",\"isModified\":true}",
                "{\"resultType\":\"N\",\"resultValue\":\"0\",\"shadowResultValue\":\"8\",\"isModified\":true}"}) {
            var item = new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, TestResultItem.class);
            var data = new ResultsUpdateDataSet("701"); data.filterModifiedItems(java.util.List.of(item));
            assertEquals(java.util.List.of(item), data.getModifiedItems());
            assertTrue(data.getAnalysisOnlyChangeResults().isEmpty());
            assertEquals(item.getResultValue(), item.getShadowResultValue());
            assertEquals(item.getResultValue(), org.openelisglobal.common.services.beanAdapters.ResultSaveBeanAdapter
                    .fromTestResultItem(item).getResultValue());
            data.validateModifiedItems();
            verify(((AutowireCapableBeanFactory)ReflectionTestUtils.getField(SpringContext.class,"factory"))
                    .getBean(ResultsValidation.class)).validateModifiedItems(java.util.List.of(item));
            assertEquals("9", ResultUtil.getStatusForTestResult(item, false));
        }
    }

    @Test
    public void numericZeroIsAResultAndEmptyValueIsNotEvenWithOldFlagOn() {
        var item = new TestResultItem();
        item.setResultType("N");
        item.setValid(true);
        item.setResultValue("0");
        item.setShadowResultValue("");
        assertTrue(ResultUtil.areResults(item));
        assertEquals("9", ResultUtil.getStatusForTestResult(item, false));
        item.setResultValue("");
        item.setShadowResultValue("8");
        assertFalse(ResultUtil.areResults(item));
        assertEquals("1", ResultUtil.getStatusForTestResult(item, true));
    }

    @Test
    public void actualNumericValidationCannotBeBypassedWithAnOldValidShadow() throws Exception {
        Object oldForms = ReflectionTestUtils.getField(org.openelisglobal.common.formfields.FormFields.class,
                "instance");
        try {
            ReflectionTestUtils.setField(org.openelisglobal.common.formfields.FormFields.class, "instance",
                    mock(org.openelisglobal.common.formfields.FormFields.class));
            for (String value : new String[] { "5", "0", "<5", ">5", "SIM-invalid-number", "NaN", "Infinity",
                    "1e999" }) {
                var item = new com.fasterxml.jackson.databind.ObjectMapper()
                        .readValue("{\"resultType\":\"N\",\"resultValue\":\"" + value
                                + "\",\"shadowResultValue\":\"8\",\"isModified\":true}", TestResultItem.class);
                var data = new ResultsUpdateDataSet("701");
                data.filterModifiedItems(java.util.List.of(item));
                var errors = new org.openelisglobal.common.validator.BaseErrors();
                ReflectionTestUtils.invokeMethod(new ResultsValidation(), "validateResult", item, errors);
                assertEquals(java.util.List.of("SIM-invalid-number", "NaN", "Infinity", "1e999").contains(value),
                        errors.hasErrors());
                assertEquals(value, org.openelisglobal.common.services.beanAdapters.ResultSaveBeanAdapter
                        .fromTestResultItem(item).getResultValue());
            }
        } finally {
            ReflectionTestUtils.setField(org.openelisglobal.common.formfields.FormFields.class, "instance", oldForms);
        }
    }
}

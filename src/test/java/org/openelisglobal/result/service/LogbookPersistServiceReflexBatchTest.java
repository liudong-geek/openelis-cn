package org.openelisglobal.result.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import org.openelisglobal.result.action.util.ResultSet;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.valueholder.Result;

public class LogbookPersistServiceReflexBatchTest {

    @Test
    public void combiningReflexCandidatesDoesNotReclassifyModifiedResultsAsNew() {
        ResultsUpdateDataSet data = mock(ResultsUpdateDataSet.class);
        ResultSet created = resultSet("created");
        ResultSet modified = resultSet("modified");
        List<ResultSet> createdResults = new ArrayList<>(List.of(created));
        List<ResultSet> modifiedResults = new ArrayList<>(List.of(modified));
        when(data.getNewResults()).thenReturn(createdResults);
        when(data.getModifiedResults()).thenReturn(modifiedResults);

        List<ResultSet> combined = LogbookPersistServiceImpl.resultSetsForReflexes(data);

        assertEquals(2, combined.size());
        assertSame(created, combined.get(0));
        assertSame(modified, combined.get(1));
        assertEquals(List.of(created), createdResults);
        assertEquals(List.of(modified), modifiedResults);
    }

    private ResultSet resultSet(String value) {
        Result result = new Result();
        result.setValue(value);
        return new ResultSet(result, null, null, null, null, java.util.Map.of(), false);
    }
}

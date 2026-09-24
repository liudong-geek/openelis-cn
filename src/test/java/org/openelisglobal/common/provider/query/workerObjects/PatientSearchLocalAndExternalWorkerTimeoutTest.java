package org.openelisglobal.common.provider.query.workerObjects;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.apache.http.HttpStatus;
import org.junit.Test;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.externalLinks.ExternalPatientSearchException;
import org.openelisglobal.common.externalLinks.IExternalPatientSearch;

public class PatientSearchLocalAndExternalWorkerTimeoutTest {

    @Test
    public void timeoutCancelsExternalSearchWithInterruption() throws Exception {
        IExternalPatientSearch externalSearch = mock(IExternalPatientSearch.class);
        @SuppressWarnings("unchecked")
        Future<Integer> future = mock(Future.class);
        when(externalSearch.getTimeout()).thenReturn(25);
        when(externalSearch.runExternalSearch()).thenReturn(future);
        when(future.get(anyLong(), eq(TimeUnit.MILLISECONDS))).thenThrow(new TimeoutException("slow registry"));

        assertThrows(TimeoutException.class,
                () -> PatientSearchLocalAndExternalWorker.awaitExternalSearch(externalSearch));

        verify(future).cancel(true);
    }

    @Test
    public void badGatewayIsNotReinterpretedAsSuccessfulEmptyResults() throws Exception {
        IExternalPatientSearch externalSearch = mock(IExternalPatientSearch.class);
        when(externalSearch.getTimeout()).thenReturn(25);
        when(externalSearch.runExternalSearch())
                .thenReturn(CompletableFuture.completedFuture(HttpStatus.SC_BAD_GATEWAY));

        PatientSearchLocalAndExternalWorker.ExternalSearchOutcome outcome = PatientSearchLocalAndExternalWorker
                .awaitExternalSearch(externalSearch);

        assertFalse(outcome.successful());
        assertTrue(outcome.results().isEmpty());
        verify(externalSearch, never()).getSearchResults();
    }

    @Test
    public void unsuccessfulStatusFailsTheCombinedSearch() {
        IExternalPatientSearch externalSearch = mock(IExternalPatientSearch.class);
        when(externalSearch.getTimeout()).thenReturn(25);
        when(externalSearch.runExternalSearch())
                .thenReturn(CompletableFuture.completedFuture(HttpStatus.SC_BAD_GATEWAY));

        ExternalPatientSearchException error = assertThrows(ExternalPatientSearchException.class,
                () -> PatientSearchLocalAndExternalWorker.requireSuccessfulExternalSearch(externalSearch));

        assertTrue(error.getMessage().contains(String.valueOf(HttpStatus.SC_BAD_GATEWAY)));
        verify(externalSearch, never()).getSearchResults();
    }

    @Test
    public void executionFailureFailsTheCombinedSearchWithTheUpstreamCause() throws Exception {
        IExternalPatientSearch externalSearch = mock(IExternalPatientSearch.class);
        @SuppressWarnings("unchecked")
        Future<Integer> future = mock(Future.class);
        LIMSRuntimeException upstream = new LIMSRuntimeException("simulated connector failure");
        when(externalSearch.getTimeout()).thenReturn(25);
        when(externalSearch.runExternalSearch()).thenReturn(future);
        when(future.get(anyLong(), eq(TimeUnit.MILLISECONDS))).thenThrow(new ExecutionException(upstream));

        ExternalPatientSearchException error = assertThrows(ExternalPatientSearchException.class,
                () -> PatientSearchLocalAndExternalWorker.requireSuccessfulExternalSearch(externalSearch));

        assertSame(upstream, error.getCause());
    }

    @Test
    public void runtimeFailureStartingTheConnectorFailsTheCombinedSearch() {
        IExternalPatientSearch externalSearch = mock(IExternalPatientSearch.class);
        IllegalStateException upstream = new IllegalStateException("simulated connector startup failure");
        when(externalSearch.runExternalSearch()).thenThrow(upstream);

        ExternalPatientSearchException error = assertThrows(ExternalPatientSearchException.class,
                () -> PatientSearchLocalAndExternalWorker.requireSuccessfulExternalSearch(externalSearch));

        assertSame(upstream, error.getCause());
    }

    @Test
    public void timeoutFailsTheCombinedSearchAndCancelsTheRequest() throws Exception {
        IExternalPatientSearch externalSearch = mock(IExternalPatientSearch.class);
        @SuppressWarnings("unchecked")
        Future<Integer> future = mock(Future.class);
        when(externalSearch.getTimeout()).thenReturn(25);
        when(externalSearch.runExternalSearch()).thenReturn(future);
        when(future.get(anyLong(), eq(TimeUnit.MILLISECONDS))).thenThrow(new TimeoutException("slow registry"));

        assertThrows(ExternalPatientSearchException.class,
                () -> PatientSearchLocalAndExternalWorker.requireSuccessfulExternalSearch(externalSearch));

        verify(future).cancel(true);
    }
}

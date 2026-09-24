package org.openelisglobal.common.externalLinks;

import java.util.List;
import java.util.concurrent.Future;
import org.openelisglobal.common.provider.query.ExtendedPatientSearchResults;

public interface IExternalPatientSearch {

    Future<Integer> runExternalSearch();

    void setSearchCriteria(String lastName, String firstName, String STNumber, String subjectNumber, String nationalID,
            String guid);

    void setConnectionCredentials(String connectionString, String name, String password);

    /**
     * Optional bounded-search hint. The worker still validates the returned row
     * count, while this default keeps older hospital connector implementations
     * binary compatible until they add upstream limiting.
     */
    default void setResultLimit(int maxResults) {
        // Compatibility no-op for legacy connectors.
    }

    List<ExtendedPatientSearchResults> getSearchResults();

    String getConnectionString();

    int getTimeout();
}

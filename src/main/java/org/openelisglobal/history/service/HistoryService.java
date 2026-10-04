package org.openelisglobal.history.service;

import java.sql.Timestamp;
import java.util.List;
import java.util.function.Predicate;
import org.openelisglobal.audittrail.valueholder.History;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.service.BaseObjectService;

public interface HistoryService extends BaseObjectService<History, String> {

    List<History> getHistoryByRefIdAndRefTableId(String Id, String Table) throws LIMSRuntimeException;

    List<History> getHistoryByRefIdAndRefTableId(History history) throws LIMSRuntimeException;

    List<History> getSystemEventHistory(Timestamp startDate, Timestamp endDate, String sysUserId,
            List<String> referenceTableIds, String activity, String search, String referenceId, int page, int pageSize)
            throws LIMSRuntimeException;

    long getSystemEventHistoryCount(Timestamp startDate, Timestamp endDate, String sysUserId,
            List<String> referenceTableIds, String activity, String search, String referenceId)
            throws LIMSRuntimeException;

    final class HistorySelection {
        public final List<History> events;
        public final long total;

        public HistorySelection(List<History> events, long total) {
            this.events = events;
            this.total = total;
        }
    }

    HistorySelection scanSystemEventHistory(Timestamp startDate, Timestamp endDate, String sysUserId,
            List<String> referenceTableIds, String activity, Predicate<History> matches, long offset, int limit,
            boolean countAll);
}

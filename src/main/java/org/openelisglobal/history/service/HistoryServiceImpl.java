package org.openelisglobal.history.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;
import org.openelisglobal.audittrail.dao.HistoryDAO;
import org.openelisglobal.audittrail.valueholder.History;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.service.AuditableBaseObjectServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HistoryServiceImpl extends AuditableBaseObjectServiceImpl<History, String> implements HistoryService {
    @Autowired
    protected HistoryDAO baseObjectDAO;

    HistoryServiceImpl() {
        super(History.class);
        disableLogging();
    }

    @Override
    protected HistoryDAO getBaseObjectDAO() {
        return baseObjectDAO;
    }

    @Override
    @Transactional(readOnly = true)
    public List<History> getHistoryByRefIdAndRefTableId(History history) throws LIMSRuntimeException {
        return baseObjectDAO.getHistoryByRefIdAndRefTableId(history);
    }

    @Override
    @Transactional(readOnly = true)
    public List<History> getHistoryByRefIdAndRefTableId(String id, String table) throws LIMSRuntimeException {
        return baseObjectDAO.getHistoryByRefIdAndRefTableId(id, table);
    }

    @Override
    public String insert(History history) {
        // These overrides write straight to the DAO (bypassing super), so stamp the
        // audit user here — the base class would otherwise do it in super.insert.
        fillSysUserIdIfMissing(history);
        return baseObjectDAO.insert(history);
    }

    @Override
    public History update(History history) {
        fillSysUserIdIfMissing(history);
        if (history.getLastupdated() == null) {
            LogEvent.logWarn(this.getClass().getSimpleName(), "update",
                    "running update on an object with a missing version field can result in unintended"
                            + " inserts instead of updates");
            LogEvent.logWarn(this.getClass().getSimpleName(), "update", "setting lastUpdated to now for object: "
                    + history.getClass().getSimpleName() + " with id: " + history.getId());
            history.setLastupdated(Timestamp.from(Instant.now()));
        }
        return baseObjectDAO.update(history);
    }

    @Override
    public void delete(History history) {
        fillSysUserIdIfMissing(history);
        baseObjectDAO.delete(history);
    }

    @Override
    @Transactional(readOnly = true)
    public List<History> getSystemEventHistory(Timestamp startDate, Timestamp endDate, String sysUserId,
            List<String> referenceTableIds, String activity, String search, String referenceId, int page, int pageSize)
            throws LIMSRuntimeException {
        return baseObjectDAO.getSystemEventHistory(startDate, endDate, sysUserId, referenceTableIds, activity, search,
                referenceId, page, pageSize);
    }

    @Override
    @Transactional(readOnly = true)
    public long getSystemEventHistoryCount(Timestamp startDate, Timestamp endDate, String sysUserId,
            List<String> referenceTableIds, String activity, String search, String referenceId)
            throws LIMSRuntimeException {
        return baseObjectDAO.getSystemEventHistoryCount(startDate, endDate, sysUserId, referenceTableIds, activity,
                search, referenceId);
    }

    @Override
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public HistorySelection scanSystemEventHistory(Timestamp startDate, Timestamp endDate, String sysUserId,
            List<String> referenceTableIds, String activity, Predicate<History> matches, long offset, int limit,
            boolean countAll) {
        if (referenceTableIds == null || referenceTableIds.isEmpty())
            return new HistorySelection(List.of(), 0);
        if (offset < 0 || limit < 1 || limit > 10000 || matches == null)
            throw new IllegalArgumentException("Invalid audit selection");
        List<History> selected = new ArrayList<>(Math.min(limit, 500));
        long total = 0;
        for (int batchPage = 1;; batchPage++) {
            List<History> candidates = baseObjectDAO.getSystemEventHistoryCandidates(startDate, endDate, sysUserId,
                    referenceTableIds, activity, batchPage, 500);
            for (History history : candidates) {
                if (!matches.test(history))
                    continue;
                if (total >= offset && selected.size() < limit)
                    selected.add(history);
                total++;
                if (!countAll && selected.size() == limit)
                    return new HistorySelection(selected, total);
            }
            if (candidates.size() < 500)
                return new HistorySelection(selected, total);
        }
    }
}

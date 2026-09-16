package org.openelisglobal.sample.form;

import java.sql.Date;
import java.util.List;
import org.openelisglobal.sample.valueholder.OrderPriority;

/** Validated criteria shared by count and page queries. */
public record OrderDashboardCriteria(int offset, int pageSize, String search, List<String> intakeStatuses,
        OrderPriority priority, boolean includeExternal, Date startDate, Date endDate, List<String> testIds,
        List<String> sectionIds, boolean masked) {
    public OrderDashboardCriteria(int offset, int pageSize, String search, List<String> intakeStatuses,
            OrderPriority priority, boolean includeExternal, Date startDate, Date endDate) {
        this(offset, pageSize, search, intakeStatuses, priority, includeExternal, startDate, endDate, List.of(),
                List.of(), true);
    }

    public OrderDashboardCriteria {
        intakeStatuses = List.copyOf(intakeStatuses);
        testIds = List.copyOf(testIds);
        sectionIds = List.copyOf(sectionIds);
    }
}

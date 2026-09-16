package org.openelisglobal.sample.dao;

import java.util.List;
import java.util.Optional;
import org.openelisglobal.sample.form.OrderDashboardCriteria;
import org.openelisglobal.sample.form.OrderDashboardRecord;
import org.openelisglobal.sample.form.SpecimenIntakeFacts;

/**
 * Read-only projection, deliberately separate from legacy sample pagination.
 */
public interface OrderDashboardDAO {
    List<OrderDashboardRecord> findPage(OrderDashboardCriteria criteria);

    java.util.Map<String, List<org.openelisglobal.sample.service.EntryCurrentStateReader.SpecimenView>> tubes(
            List<String> sampleIds, List<String> allowedTests);

    long count(OrderDashboardCriteria criteria);

    Optional<SpecimenIntakeFacts> findIntakeFacts(String sampleId, OrderDashboardCriteria criteria);
}

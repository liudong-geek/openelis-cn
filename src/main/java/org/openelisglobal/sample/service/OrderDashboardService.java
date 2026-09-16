package org.openelisglobal.sample.service;

import java.util.Optional;
import org.openelisglobal.sample.form.OrderDashboardQuery;
import org.openelisglobal.sample.form.OrderDashboardResponse;
import org.openelisglobal.sample.form.SpecimenIntakeState;

public interface OrderDashboardService {
    OrderDashboardResponse getDashboard(OrderDashboardQuery query, jakarta.servlet.http.HttpServletRequest request);

    Optional<SpecimenIntakeState> getSpecimenIntakeState(String sampleId);
}

package org.openelisglobal.dataexchange.order.form;

import org.openelisglobal.common.paging.PagingBean;

/**
 * Version 2 totals; the inherited string page fields preserve the old wire
 * contract.
 */
public class ElectronicOrderQueryPaging extends PagingBean {
    private int totalResults;
    private int pageSize;

    public int getTotalResults() {
        return totalResults;
    }

    public void setTotalResults(int value) {
        totalResults = value;
    }

    public int getPageSize() {
        return pageSize;
    }

    public void setPageSize(int value) {
        pageSize = value;
    }
}

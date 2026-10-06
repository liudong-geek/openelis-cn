package org.openelisglobal.workplan.form;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import java.util.List;

public class WorkplanPrintRequest {
    private String type, filterId, page, pageSize, pageSnapshot;
    private List<AnalysisIdentity> analyses;

    public String getPageSnapshot() {
        return pageSnapshot;
    }

    public void setPageSnapshot(String value) {
        pageSnapshot = value;
    }

    public String getType() {
        return type;
    }

    public void setType(String v) {
        type = v;
    }

    public String getFilterId() {
        return filterId;
    }

    public void setFilterId(String v) {
        filterId = v;
    }

    public String getPage() {
        return page;
    }

    public void setPage(String v) {
        page = v;
    }

    public String getPageSize() {
        return pageSize;
    }

    public void setPageSize(String v) {
        pageSize = v;
    }

    public List<AnalysisIdentity> getAnalyses() {
        return analyses;
    }

    public void setAnalyses(List<AnalysisIdentity> v) {
        analyses = v;
    }

    @JsonAnySetter
    public void rejectUnknown(String name, Object value) {
        throw new IllegalArgumentException("workplan.invalidPrintSelection");
    }

    public WorkplanQueryRequest query() {
        if (page == null || pageSize == null)
            throw new IllegalArgumentException("workplan.invalidPrintSelection");
        return WorkplanQueryRequest.of(type, filterId, page, pageSize);
    }

    public static class AnalysisIdentity {
        private String analysisId, sampleId, sampleItemId, testId, accessionNumber, statusId, lastupdated;

        public String getAnalysisId() {
            return analysisId;
        }

        public void setAnalysisId(String v) {
            analysisId = v;
        }

        public String getSampleId() {
            return sampleId;
        }

        public void setSampleId(String v) {
            sampleId = v;
        }

        public String getSampleItemId() {
            return sampleItemId;
        }

        public void setSampleItemId(String v) {
            sampleItemId = v;
        }

        public String getTestId() {
            return testId;
        }

        public void setTestId(String v) {
            testId = v;
        }

        public String getAccessionNumber() {
            return accessionNumber;
        }

        public void setAccessionNumber(String v) {
            accessionNumber = v;
        }

        public String getStatusId() {
            return statusId;
        }

        public void setStatusId(String v) {
            statusId = v;
        }

        public String getLastupdated() {
            return lastupdated;
        }

        public void setLastupdated(String v) {
            lastupdated = v;
        }

        @JsonAnySetter
        public void rejectUnknown(String name, Object value) {
            throw new IllegalArgumentException("workplan.invalidPrintSelection");
        }
    }
}

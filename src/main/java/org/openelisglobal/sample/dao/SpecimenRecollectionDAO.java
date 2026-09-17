package org.openelisglobal.sample.dao;

import java.util.List;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.openelisglobal.sample.valueholder.SpecimenRecollection;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;

/**
 * Append-only provenance and a distinct uncollected request, in the caller's
 * transaction.
 */
public interface SpecimenRecollectionDAO {
    List<SpecimenRecollection> lockClaims(String operationId, String sourceSampleItemId);

    List<SpecimenRecollection> findForSources(List<String> sourceSampleItemIds);

    SpecimenRecollection findOperation(String operationId);

    SpecimenIntakeDecision lockDecision(String operationId);

    List<ReferenceTables> lockAuditReferences();

    List<ReferenceTables> auditReferences();

    SampleTypeRequest insertRequest(SampleTypeRequest request);

    SpecimenRecollection insert(SpecimenRecollection row);

    void flush();

    void requireManaged(List<?> values);
}

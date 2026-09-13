package org.openelisglobal.sample.dao;

import java.util.LinkedHashMap;
import java.util.Map;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;

/**
 * Shared persisted intake facts for queries whose Sample alias is {@code s}.
 * These fragments describe current facts, not immutable acceptance events or
 * approval against the latest checklist configuration. Keep each predicate
 * parenthesized so projection and negative filters use identical semantics.
 */
public final class SpecimenIntakeQueryFacts {
    private static final String REGISTERED = "(s.receivedTimestamp is not null"
            + " and s.accessionNumber is not null and trim(s.accessionNumber) <> '' and ("
            + " exists (select sh.id from SampleHuman sh, Patient p where sh.sampleId = s.id and p.id = sh.patientId)"
            + " or exists (select oh.id from ObservationHistory oh, ObservationHistoryType ot"
            + " where oh.sampleId = s.id and oh.observationHistoryTypeId = ot.id"
            + " and ot.typeName = :environmentType and oh.value = :environmentValue)"
            + " and exists (select site.id from ObservationHistory site, ObservationHistoryType siteType, Organization o"
            + " where site.sampleId = s.id and site.observationHistoryTypeId = siteType.id"
            + " and siteType.typeName = :samplingSiteType and site.value = cast(o.id as string)"
            + " and o.isActive = 'Y')))";

    private static final String COLLECTED = "(" + activeTestsExist()
            + " and not exists (select si.id from SampleItem si where si.sample.id = s.id and "
            + specimenObligation("si") + " and (si.collectionDate is null or not " + specimenHasActiveTest("si") + "))"
            + " and not exists (select r.id from SampleTypeRequest r where r.sample.id = s.id"
            + " and (r.status is null or r.status <> :cancelledStatus)"
            + " and (r.status is null or r.status <> :collectedStatus or r.sampleItem is null"
            + " or not exists (select si.id from SampleItem si where si.id = r.sampleItem.id"
            + " and si.sample.id = s.id and si.typeOfSample.id = r.typeOfSample.id"
            + " and si.collectionDate is not null and (not " + specimenObligation("si") + " or "
            + specimenHasActiveTest("si") + ")))))";

    private static final String VALID_LOCATION = "(sa.locationType = 'room' and exists (select room.id from StorageRoom room"
            + " where room.id = sa.locationId and room.active = true))"
            + " or (sa.locationType = 'device' and exists (select device.id from StorageDevice device"
            + " where device.id = sa.locationId and device.active = true and device.parentRoom.active = true))"
            + " or (sa.locationType = 'shelf' and exists (select shelf.id from StorageShelf shelf"
            + " where shelf.id = sa.locationId and shelf.active = true and shelf.parentDevice.active = true"
            + " and shelf.parentDevice.parentRoom.active = true))"
            + " or (sa.locationType = 'rack' and exists (select rack.id from StorageRack rack"
            + " where rack.id = sa.locationId and rack.active = true and rack.parentShelf.active = true"
            + " and rack.parentShelf.parentDevice.active = true and rack.parentShelf.parentDevice.parentRoom.active = true))"
            + " or (sa.locationType = 'box' and exists (select box.id from StorageBox box"
            + " where box.id = sa.locationId and box.active = true and box.parentRack.active = true"
            + " and box.parentRack.parentShelf.active = true and box.parentRack.parentShelf.parentDevice.active = true"
            + " and box.parentRack.parentShelf.parentDevice.parentRoom.active = true))";

    private static final String STORED = "(coalesce(s.storageSkipped, false) = true or ("
            + " exists (select si.id from SampleItem si where si.sample.id = s.id and " + specimenObligation("si") + ")"
            + " and not exists (select si.id from SampleItem si where si.sample.id = s.id and "
            + specimenObligation("si") + " and not exists (select sa.id from SampleStorageAssignment sa"
            + " where sa.sampleItemId = cast(si.id as integer) and sa.locationId is not null and (" + VALID_LOCATION
            + ")))))";

    private static final String DISPOSED = "(exists (select si.id from SampleItem si, StatusOfSample ss"
            + " where si.sample.id = s.id and coalesce(si.voided, false) = false"
            + " and si.statusId = ss.id and ss.statusType = 'SAMPLE'"
            + " and ss.statusOfSampleName = :disposedStatus))";

    private static final String REJECTED = "(exists (select si.id from SampleItem si where si.sample.id = s.id"
            + " and coalesce(si.voided, false) = false and (si.rejected = true"
            + " or exists (select ss.id from StatusOfSample ss where ss.id = si.statusId"
            + " and ss.statusType = 'SAMPLE' and ss.statusOfSampleName = :sampleRejectedStatus)"
            + " or exists (select a.id from Analysis a, StatusOfSample ss where a.sampleItem.id = si.id"
            + " and ss.id = a.statusId and ss.statusType = 'ANALYSIS'"
            + " and ss.statusOfSampleName = :analysisRejectedStatus))))";

    private static final String STATUS_CONFLICT = "(exists (select si.id from SampleItem si where si.sample.id = s.id"
            + " and coalesce(si.voided, false) = false and " + sampleCanceled("si") + " and "
            + specimenHasActiveTest("si") + "))";

    private static final String NO_ACTIVE_TESTS = "(not " + activeTestsExist()
            + " and not exists (select r.id from SampleTypeRequest r where r.sample.id = s.id and r.status = :requestedStatus)"
            + " and (exists (select r.id from SampleTypeRequest r where r.sample.id = s.id and r.status = :cancelledStatus)"
            + " or exists (select si.id from SampleItem si where si.sample.id = s.id"
            + " and coalesce(si.voided, false) = false and " + sampleCanceled("si") + ")"
            + " or exists (select a.id from Analysis a, StatusOfSample ast where a.sampleItem.sample.id = s.id"
            + " and coalesce(a.sampleItem.voided, false) = false and ast.id = a.statusId"
            + " and ast.statusType = 'ANALYSIS' and ast.statusOfSampleName = :analysisCanceledStatus)))";

    private static final String SAVED_QA_SNAPSHOT = "(exists (select qa.id from SampleQaChecklist qa"
            + " where qa.sampleId = cast(s.id as integer) and qa.allRequiredVerified = true))";

    private static final Map<String, Object> PARAMETERS = Map.ofEntries(Map.entry("environmentType", "envWorkflowType"),
            Map.entry("environmentValue", "environmental"), Map.entry("samplingSiteType", "envSamplingSiteId"),
            Map.entry("cancelledStatus", SampleTypeRequest.Status.CANCELLED),
            Map.entry("requestedStatus", SampleTypeRequest.Status.REQUESTED),
            Map.entry("collectedStatus", SampleTypeRequest.Status.COLLECTED),
            Map.entry("disposedStatus", "SampleDisposed"), Map.entry("sampleCanceledStatus", "SampleCanceled"),
            Map.entry("analysisCanceledStatus", "Test Canceled"), Map.entry("sampleRejectedStatus", "Sample Rejected"),
            Map.entry("analysisRejectedStatus", "Sample Rejected"));

    private SpecimenIntakeQueryFacts() {
    }

    public static String registered() {
        return REGISTERED;
    }

    public static String collected() {
        return COLLECTED;
    }

    public static String stored() {
        return STORED;
    }

    public static String disposed() {
        return DISPOSED;
    }

    public static String rejected() {
        return REJECTED;
    }

    public static String statusConflict() {
        return STATUS_CONFLICT;
    }

    public static String noActiveTests() {
        return NO_ACTIVE_TESTS;
    }

    public static String actionBlocked() {
        return "(" + DISPOSED + " or " + REJECTED + " or " + STATUS_CONFLICT + " or " + NO_ACTIVE_TESTS + ")";
    }

    public static String savedQaSnapshot() {
        return SAVED_QA_SNAPSHOT;
    }

    public static String flag(String predicate) {
        return "case when " + predicate + " then true else false end";
    }

    /**
     * Bind only parameters occurring in this query, e.g. an unfiltered count has
     * none.
     */
    public static Map<String, Object> parametersFor(String hql) {
        Map<String, Object> result = new LinkedHashMap<>();
        PARAMETERS.forEach((name, value) -> {
            if (java.util.regex.Pattern.compile(":" + java.util.regex.Pattern.quote(name) + "\\b").matcher(hql)
                    .find()) {
                result.put(name, value);
            }
        });
        return result;
    }

    private static String activeAnalysis(String alias) {
        return "not exists (select ast.id from StatusOfSample ast where ast.id = " + alias
                + ".statusId and ast.statusType = 'ANALYSIS'"
                + " and ast.statusOfSampleName in (:analysisCanceledStatus, :analysisRejectedStatus))";
    }

    private static String sampleCanceled(String alias) {
        return "exists (select sst.id from StatusOfSample sst where sst.id = " + alias
                + ".statusId and sst.statusType = 'SAMPLE' and sst.statusOfSampleName = :sampleCanceledStatus)";
    }

    private static String specimenHasActiveTest(String alias) {
        return "exists (select a.id from Analysis a join a.test t where a.sampleItem.id = " + alias + ".id and "
                + activeAnalysis("a") + ")";
    }

    /**
     * A voided aliquot source and a tube containing only cancelled tests have no
     * current storage obligation.
     */
    private static String specimenObligation(String alias) {
        return "(coalesce(" + alias + ".voided, false) = false and not " + sampleCanceled(alias)
                + " and (exists (select pendingAnalysis.id from Analysis pendingAnalysis"
                + " where pendingAnalysis.sampleItem.id = " + alias + ".id and " + activeAnalysis("pendingAnalysis")
                + ")"
                + " or not exists (select anyAnalysis.id from Analysis anyAnalysis where anyAnalysis.sampleItem.id = "
                + alias + ".id)))";
    }

    private static String activeTestsExist() {
        return "exists (select a.id from Analysis a join a.test t where a.sampleItem.sample.id = s.id"
                + " and coalesce(a.sampleItem.voided, false) = false and not " + sampleCanceled("a.sampleItem")
                + " and " + activeAnalysis("a") + ")";
    }
}

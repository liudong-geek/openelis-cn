package org.openelisglobal.result.service;

import org.openelisglobal.program.valueholder.cytology.CytologySample;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample;
import org.openelisglobal.program.valueholder.pathology.PathologySample;
import org.openelisglobal.result.exception.ResultSaveValidationException;

/**
 * Identifies one of the three case-report workflows that is allowed to publish
 * a finalized analysis. The ordinary result-entry API cannot manufacture this
 * value from request data; a completed, persisted specialty case is required.
 */
public final class SpecialtyResultRelease {

    public enum Kind {
        PATHOLOGY, CYTOLOGY, IMMUNOHISTOCHEMISTRY
    }

    private final Kind kind;
    private final Integer ownerId;
    private final String sampleId;

    private SpecialtyResultRelease(Kind kind, Integer ownerId, String sampleId) {
        this.kind = kind;
        this.ownerId = ownerId;
        this.sampleId = sampleId;
    }

    public static SpecialtyResultRelease pathology(PathologySample sample) {
        requireOwner(sample == null ? null : sample.getId(), sample == null ? null : sample.getSample(),
                sample != null && sample.getStatus() == PathologySample.PathologyStatus.COMPLETED);
        return new SpecialtyResultRelease(Kind.PATHOLOGY, sample.getId(), sample.getSample().getId());
    }

    public static SpecialtyResultRelease cytology(CytologySample sample) {
        requireOwner(sample == null ? null : sample.getId(), sample == null ? null : sample.getSample(),
                sample != null && sample.getStatus() == CytologySample.CytologyStatus.COMPLETED);
        return new SpecialtyResultRelease(Kind.CYTOLOGY, sample.getId(), sample.getSample().getId());
    }

    public static SpecialtyResultRelease immunohistochemistry(ImmunohistochemistrySample sample) {
        requireOwner(sample == null ? null : sample.getId(), sample == null ? null : sample.getSample(), sample != null
                && sample.getStatus() == ImmunohistochemistrySample.ImmunohistochemistryStatus.COMPLETED);
        return new SpecialtyResultRelease(Kind.IMMUNOHISTOCHEMISTRY, sample.getId(), sample.getSample().getId());
    }

    private static void requireOwner(Integer ownerId, org.openelisglobal.sample.valueholder.Sample sample,
            boolean completed) {
        if (ownerId == null || ownerId <= 0 || sample == null || !positive(sample.getId()) || !completed) {
            throw new ResultSaveValidationException(ResultSpecimenWriteGuard.BLOCKED);
        }
    }

    private static boolean positive(String value) {
        return value != null && value.matches("[1-9][0-9]{0,9}");
    }

    public Kind kind() {
        return kind;
    }

    public Integer ownerId() {
        return ownerId;
    }

    public String sampleId() {
        return sampleId;
    }
}

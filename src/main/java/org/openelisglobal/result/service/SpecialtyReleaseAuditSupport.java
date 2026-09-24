package org.openelisglobal.result.service;

import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.sample.valueholder.Sample;

/**
 * Creates detached write models so audited services can compare old and new
 * state.
 */
public final class SpecialtyReleaseAuditSupport {

    private SpecialtyReleaseAuditSupport() {
    }

    public static Analysis detachedAnalysis(Analysis persisted, String actor) {
        Analysis detached = cloneEntity(persisted, Analysis.class);
        detached.setSysUserId(actor);
        return detached;
    }

    public static Sample detachedSample(Sample persisted, String actor) {
        Sample detached = cloneEntity(persisted, Sample.class);
        detached.setSysUserId(actor);
        return detached;
    }

    private static <T> T cloneEntity(T persisted, Class<T> type) {
        if (persisted == null) {
            throw new IllegalArgumentException("Missing specialty release entity");
        }
        try {
            return type.cast(((org.openelisglobal.common.valueholder.BaseObject<?>) persisted).clone());
        } catch (CloneNotSupportedException exception) {
            throw new IllegalStateException("Unable to prepare audited specialty release", exception);
        }
    }
}

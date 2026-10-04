package org.openelisglobal.sampleitem.service;

/** A state or configuration change prevents the requested cancellation. */
public class SampleManagementConflictException extends IllegalStateException {
    public SampleManagementConflictException(String message) {
        super(message);
    }
}

/**
 * The contents of this file are subject to the Mozilla Public License Version 1.1 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy of the
 * License at http://www.mozilla.org/MPL/
 */
package org.openelisglobal.common.externalLinks;

/**
 * Raised when an external patient source exceeds the configured response-size
 * safety limit.
 */
public class ExternalPatientResponseTooLargeException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ExternalPatientResponseTooLargeException(int maxResponseBytes) {
        super("External patient search response exceeded the configured limit of " + maxResponseBytes + " bytes");
    }
}

/**
 * The contents of this file are subject to the Mozilla Public License Version 1.1 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy of the
 * License at http://www.mozilla.org/MPL/
 *
 * <p>Software distributed under the License is distributed on an "AS IS" basis, WITHOUT WARRANTY OF
 * ANY KIND, either express or implied. See the License for the specific language governing rights
 * and limitations under the License.
 *
 * <p>The Original Code is OpenELIS code.
 */
package org.openelisglobal.common.externalLinks;

import org.openelisglobal.common.exception.LIMSRuntimeException;

/**
 * Signals that a configured external patient source could not complete a
 * search.
 *
 * <p>
 * The worker throws this instead of returning local-only results so callers can
 * distinguish an authoritative combined search from a partial response.
 */
public class ExternalPatientSearchException extends LIMSRuntimeException {

    public ExternalPatientSearchException(String message) {
        super(message);
    }

    public ExternalPatientSearchException(String message, Throwable cause) {
        super(message, cause);
    }
}

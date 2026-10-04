package org.openelisglobal.common.management.service;

import org.openelisglobal.common.management.form.SampleTypeBasicInfoForm;

public interface SampleTypeManagementService {
    SampleTypeBasicInfoForm read(String id);

    SampleTypeBasicInfoForm save(String id, SampleTypeBasicInfoForm form, String actor);
}

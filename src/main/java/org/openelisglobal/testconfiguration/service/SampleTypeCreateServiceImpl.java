package org.openelisglobal.testconfiguration.service;

import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.localization.service.LocalizationService;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.rolemodule.service.RoleModuleService;
import org.openelisglobal.systemmodule.service.SystemModuleService;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemusermodule.valueholder.RoleModule;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class SampleTypeCreateServiceImpl implements SampleTypeCreateService {

    @Autowired
    private TypeOfSampleService typeOfSampleService;
    @Autowired
    private RoleModuleService roleModuleService;
    @Autowired
    private SystemModuleService systemModuleService;
    @Autowired
    private LocalizationService localizationService;
    @Autowired
    private DisplayListService displayListService;

    @Override
    @Transactional
    public void createAndInsertSampleType(Localization localization, TypeOfSample typeOfSample,
            SystemModule workplanModule, SystemModule resultModule, SystemModule validationModule,
            RoleModule workplanResultModule, RoleModule resultResultModule, RoleModule validationValidationModule) {
        requireRole(workplanResultModule == null ? null : workplanResultModule.getRole());
        requireRole(resultResultModule == null ? null : resultResultModule.getRole());
        requireRole(validationValidationModule == null ? null : validationValidationModule.getRole());
        if (localization.getValues() != null) {
            localization.getValues().values().forEach(value -> value.setSysUserId(localization.getSysUserId()));
        }
        localizationService.insert(localization);
        typeOfSample.setLocalization(localization);
        String createdId = typeOfSampleService.insert(typeOfSample);
        if (createdId == null || !createdId.matches("[1-9][0-9]*")) {
            throw new LIMSRuntimeException("Sample type persistence did not return a valid record ID");
        }
        typeOfSample.setId(createdId);
        systemModuleService.insert(workplanModule);
        systemModuleService.insert(resultModule);
        systemModuleService.insert(validationModule);
        roleModuleService.insert(workplanResultModule);
        roleModuleService.insert(resultResultModule);
        roleModuleService.insert(validationValidationModule);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    typeOfSampleService.invalidateCache();
                    displayListService.invalidateLists(DisplayListService.ListType.SAMPLE_TYPE,
                            DisplayListService.ListType.SAMPLE_TYPE_ACTIVE,
                            DisplayListService.ListType.SAMPLE_TYPE_INACTIVE);
                }
            });
        }
    }

    private void requireRole(Role role) {
        if (role == null || role.getId() == null || !role.getId().matches("[1-9][0-9]*")) {
            throw new IllegalArgumentException(
                    "The Results and Validation roles must be configured before creating a sample type");
        }
    }
}

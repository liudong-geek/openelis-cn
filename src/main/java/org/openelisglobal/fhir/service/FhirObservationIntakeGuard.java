package org.openelisglobal.fhir.service;

import ca.uhn.fhir.rest.server.exceptions.ForbiddenOperationException;
import ca.uhn.fhir.rest.server.exceptions.ResourceVersionConflictException;
import ca.uhn.fhir.rest.server.exceptions.UnprocessableEntityException;
import java.util.List;
import java.util.UUID;
import org.hl7.fhir.r4.model.Observation;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Result arrival is not report approval. Validates every cross-resource
 * reference.
 */
@Service
public class FhirObservationIntakeGuard {
    private final AnalysisService analyses;
    private final SampleHumanService sampleHumans;
    private final ResultService results;
    private final IStatusService statuses;
    private final UserRoleService roles;
    private final UserService users;
    private final FhirConfig config;
    private final FhirClinicalTestReadiness readiness;

    public FhirObservationIntakeGuard(AnalysisService analyses, SampleHumanService sampleHumans, ResultService results,
            IStatusService statuses, UserRoleService roles, UserService users, FhirConfig config,
            FhirClinicalTestReadiness readiness) {
        this.analyses = analyses;
        this.sampleHumans = sampleHumans;
        this.results = results;
        this.statuses = statuses;
        this.roles = roles;
        this.users = users;
        this.config = config;
        this.readiness = readiness;
    }

    @Transactional(readOnly = true)
    public Analysis validate(Observation observation, String userId, Result existing) {
        boolean admin = userId != null && roles.userInRole(userId, Constants.ROLE_GLOBAL_ADMIN);
        if (!admin && (userId == null || !roles.userInRole(userId, Constants.ROLE_RESULTS))) {
            throw new ForbiddenOperationException("仪器结果接收需要检验结果录入权限");
        }
        require(observation != null && observation.getBasedOn().size() == 1 && observation.hasSubject()
                && observation.hasSpecimen(), "结果必须同时关联检验申请、患者和标本");
        require(!observation.hasModifierExtension() && !observation.hasComponent() && !observation.hasPerformer(),
                "当前接收单项目结果，暂不支持组合结果或变更申请医生");
        require(observation.getStatus() == Observation.ObservationStatus.FINAL
                || observation.getStatus() == Observation.ObservationStatus.PRELIMINARY,
                "结果接收只支持 preliminary/final；仍须由 LIS 审核后发布");
        require("ServiceRequest".equals(observation.getBasedOnFirstRep().getReferenceElement().getResourceType()),
                "basedOn 必须引用检验申请");
        UUID uuid;
        try {
            uuid = UUID.fromString(observation.getBasedOnFirstRep().getReferenceElement().getIdPart());
        } catch (RuntimeException e) {
            throw new UnprocessableEntityException("申请标识格式错误");
        }
        var found = analyses.getAllMatching("fhirUuid", uuid);
        require(found.size() == 1, "检验任务尚未建立或标识不唯一，请先完成标本采集签收");
        var analysis = found.getFirst();
        readiness.validate(analysis.getTest());
        if (!admin && users.filterAnalysesByLabUnitRoles(userId, List.of(analysis), Constants.ROLE_RESULTS).isEmpty()) {
            throw new ForbiddenOperationException("当前账号无权录入该检验组结果");
        }
        var item = analysis.getSampleItem();
        require(item != null && item.getCollectionDate() != null && item.getReceivedDate() != null
                && !item.isRejected(), "标本未完成采集签收或已拒收，不能接收结果");
        require("Specimen".equals(observation.getSpecimen().getReferenceElement().getResourceType())
                && item.getFhirUuidAsString().equals(observation.getSpecimen().getReferenceElement().getIdPart()),
                "结果标本与检验申请不一致");
        var patient = sampleHumans.getPatientForSample(item.getSample());
        require(patient != null && "Patient".equals(observation.getSubject().getReferenceElement().getResourceType())
                && patient.getFhirUuidAsString().equals(observation.getSubject().getReferenceElement().getIdPart()),
                "结果患者与检验申请不一致");
        var coding = observation.getCode().getCodingFirstRep();
        boolean matches = coding.hasCode() && (("http://loinc.org".equals(coding.getSystem())
                && coding.getCode().equals(analysis.getTest().getLoinc()))
                || ((config.getOeFhirSystem() + "/test-guid").equals(coding.getSystem())
                        && coding.getCode().equals(analysis.getTest().getGuid())));
        require(observation.getCode().getCoding().size() == 1 && matches, "结果项目编码与申请项目不一致");
        require(observation.hasValueQuantity() && observation.getValueQuantity().hasValue()
                && !observation.getValueQuantity().hasComparator(), "当前接口接收明确的定量结果，不支持隐式换算或比较符");
        var unit = analysis.getTest().getUnitOfMeasure();
        require(unit != null && unit.getName().equals(observation.getValueQuantity().getUnit()),
                "结果单位与 LIS 项目配置不一致，须先完成单位映射");
        require(statuses.getStatusID(AnalysisStatus.NotStarted).equals(analysis.getStatusId())
                || statuses.getStatusID(AnalysisStatus.TechnicalAcceptance).equals(analysis.getStatusId()),
                "该检验已审核、取消或进入其他受控状态，请走结果更正流程");
        if (existing != null && !analysis.getId().equals(existing.getAnalysis().getId())) {
            throw new UnprocessableEntityException("结果标识属于另一项检验，不能修改");
        }
        if (existing == null && !results.getResultsByAnalysis(analysis).isEmpty()) {
            throw new ResourceVersionConflictException("此项目已有结果，不得重复写入；请核对既有结果或走更正流程");
        }
        return analysis;
    }

    private static void require(boolean condition, String message) {
        if (!condition)
            throw new UnprocessableEntityException(message);
    }
}

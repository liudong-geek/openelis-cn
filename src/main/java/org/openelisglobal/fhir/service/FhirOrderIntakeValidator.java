package org.openelisglobal.fhir.service;

import ca.uhn.fhir.rest.server.exceptions.UnprocessableEntityException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.hl7.fhir.r4.model.Reference;
import org.hl7.fhir.r4.model.ServiceRequest;
import org.hl7.fhir.r4.model.Specimen;
import org.openelisglobal.common.domain.Domain;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.validator.RequesterMasterDataValidator;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.Test;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.stereotype.Component;
import org.springframework.validation.BindException;

/**
 * Strict, code-based intake for one clinical test and its requested specimen.
 */
@Component
public class FhirOrderIntakeValidator {
    private final TestService tests;
    private final TypeOfSampleService sampleTypes;
    private final PatientService patients;
    private final OrganizationService organizations;
    private final RequesterMasterDataValidator requester;
    private final FhirConfig config;
    private final FhirClinicalTestReadiness readiness;

    public FhirOrderIntakeValidator(TestService tests, TypeOfSampleService sampleTypes, PatientService patients,
            OrganizationService organizations, RequesterMasterDataValidator requester, FhirConfig config,
            FhirClinicalTestReadiness readiness) {
        this.tests = tests;
        this.sampleTypes = sampleTypes;
        this.patients = patients;
        this.organizations = organizations;
        this.requester = requester;
        this.config = config;
        this.readiness = readiness;
    }

    public record Resolved(UUID requestId, Patient patient, Test test, TypeOfSample sampleType, SampleOrderItem order,
            Specimen specimen) {
    }

    public Resolved validate(ServiceRequest input) {
        require(input != null, "检验申请不能为空");
        require(input.getStatus() == ServiceRequest.ServiceRequestStatus.ACTIVE
                && input.getIntent() == ServiceRequest.ServiceRequestIntent.ORDER && !input.getDoNotPerform(),
                "本接口只接收 active/order 检验申请；撤销与更正不能作为新申请发送");
        require(!input.hasModifierExtension(), "不支持的申请修饰字段，不能忽略后继续处理");
        require(!input.hasAuthoredOn() || !input.getAuthoredOn().after(new java.util.Date()), "申请日期不能晚于当前时间");
        require(input.getIdentifier().size() == 1 && input.getIdentifierFirstRep().hasSystem()
                && input.getIdentifierFirstRep().hasValue(), "必须提供来源系统及唯一申请标识 identifier");
        var identifier = input.getIdentifierFirstRep();
        require(identifier.getSystem().length() <= 255 && identifier.getValue().length() <= 80, "来源系统或申请标识过长");
        UUID requestId = UUID.nameUUIDFromBytes(
                (identifier.getSystem() + "\n" + identifier.getValue()).getBytes(StandardCharsets.UTF_8));
        UUID patientUuid = referenceUuid(input.getSubject(), "Patient");
        var patientMatches = patients.getAllMatching("fhirUuid", patientUuid);
        require(patientMatches.size() == 1, "患者主档不存在或标识不唯一，请先同步患者");

        UUID orgUuid = referenceUuid(input.getRequester(), "Organization");
        var org = organizations.getOrganizationByFhirId(orgUuid.toString());
        require(org != null && "Y".equals(org.getIsActive()), "送检机构不存在或已停用");
        SampleOrderItem order = new SampleOrderItem();
        if (org.getOrganization() == null) {
            order.setReferringSiteId(org.getId());
        } else {
            order.setReferringSiteId(org.getOrganization().getId());
            order.setReferringSiteDepartmentId(org.getId());
        }
        var form = new SamplePatientEntryForm();
        form.setSampleOrderItems(order);
        var errors = new BindException(form, "form");
        requester.validate(order, errors);
        require(!errors.hasErrors(), "送检医院、科室归属或启用状态不正确");
        requester.applyCanonicalValues(order);

        require(input.getSpecimen().size() == 1 && input.getSpecimenFirstRep().getReference() != null
                && input.getSpecimenFirstRep().getReference().startsWith("#"),
                "新申请须携带一个内嵌 Specimen 描述待采标本，不能依赖预先存在的标本");
        String specimenId = input.getSpecimenFirstRep().getReference().substring(1);
        var specimens = input.getContained().stream().filter(
                r -> r instanceof Specimen && specimenId.equals(r.getIdElement().getIdPart().replaceFirst("^#", "")))
                .map(r -> (Specimen) r).toList();
        require(specimens.size() == 1, "标本引用无法唯一解析");
        var specimen = specimens.getFirst();
        require(!specimen.hasModifierExtension(), "不支持的标本修饰字段");
        require(!specimen.hasSubject() || patientUuid.equals(referenceUuid(specimen.getSubject(), "Patient")),
                "标本患者与申请患者不一致");
        require(!specimen.hasCollection() && !specimen.hasReceivedTime(), "此入口接收待采申请；已采标本请先创建申请，再通过采集签收流程确认");
        require(specimen.getType().getCoding().size() == 1, "须提供唯一的标本类型编码");
        var specimenCode = specimen.getType().getCodingFirstRep();
        require((config.getOeFhirSystem() + "/sampleType").equals(specimenCode.getSystem()) && specimenCode.hasCode(),
                "标本类型须映射到已配置的 sampleType 编码");
        var candidates = sampleTypes.getAllMatching("localAbbreviation", specimenCode.getCode()).stream()
                .filter(type -> Domain.fromRaw(type.getDomain()) == Domain.CLINICAL).toList();
        require(candidates.size() == 1 && candidates.getFirst().isActive(), "标本类型不存在、停用或编码不唯一");
        TypeOfSample sampleType = candidates.getFirst();

        require(input.getCode().getCoding().size() == 1, "每个 ServiceRequest 须提供一个明确的检验项目编码");
        var coding = input.getCode().getCodingFirstRep();
        require(coding.hasCode(), "检验项目编码不能为空");
        java.util.List<Test> matches;
        if ("http://loinc.org".equals(coding.getSystem())) {
            matches = tests.getTestsByLoincCode(coding.getCode());
        } else if ((config.getOeFhirSystem() + "/test-guid").equals(coding.getSystem())) {
            matches = tests.getAllMatching("guid", coding.getCode());
        } else {
            throw new UnprocessableEntityException("检验项目编码体系未映射，不能通过名称猜测项目");
        }
        require(matches.size() == 1, "检验项目编码未匹配或对应多个项目，请完成唯一编码映射");
        Test test = matches.getFirst();
        readiness.validate(test);
        var compatibleTypes = sampleTypes.getTypeOfSampleForTest(test.getId());
        require(compatibleTypes != null
                && compatibleTypes.stream().anyMatch(type -> sampleType.getId().equals(type.getId())), "检验项目不适用于该标本类型");
        return new Resolved(requestId, patientMatches.getFirst(), test, sampleType, order, specimen);
    }

    private static UUID referenceUuid(Reference reference, String type) {
        require(type.equals(reference.getReferenceElement().getResourceType()), "必须引用已有的 " + type + " 主数据");
        try {
            return UUID.fromString(reference.getReferenceElement().getIdPart());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new UnprocessableEntityException(type + " 引用必须为有效的 UUID");
        }
    }

    private static void require(boolean valid, String message) {
        if (!valid)
            throw new UnprocessableEntityException(message);
    }
}

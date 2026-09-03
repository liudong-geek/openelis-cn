package org.openelisglobal.fhir.service;

import ca.uhn.fhir.rest.server.exceptions.ForbiddenOperationException;
import ca.uhn.fhir.rest.server.exceptions.InvalidRequestException;
import ca.uhn.fhir.rest.server.exceptions.UnprocessableEntityException;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import org.hl7.fhir.r4.model.Coding;
import org.hl7.fhir.r4.model.Organization;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.fhir.dao.FhirWriteLockDAO;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.organization.service.OrganizationTypeService;
import org.openelisglobal.organization.valueholder.OrganizationType;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Imports canonical organizations; never creates dictionary types from display
 * text.
 */
@Service
public class FhirOrganizationImportService {
    private final OrganizationService organizations;
    private final OrganizationTypeService types;
    private final FhirTransformService transform;
    private final UserRoleService roles;
    private final FhirConfig config;
    private final FhirWriteLockDAO locks;

    public FhirOrganizationImportService(OrganizationService organizations, OrganizationTypeService types,
            FhirTransformService transform, UserRoleService roles, FhirConfig config, FhirWriteLockDAO locks) {
        this.organizations = organizations;
        this.types = types;
        this.transform = transform;
        this.roles = roles;
        this.config = config;
        this.locks = locks;
    }

    public record ImportResult(org.openelisglobal.organization.valueholder.Organization organization, boolean created) {
    }

    @Transactional
    public ImportResult save(String id, Organization resource, String userId) {
        if (userId == null || !roles.userInRole(userId, Constants.ROLE_GLOBAL_ADMIN)) {
            throw new ForbiddenOperationException("主数据同步需要系统管理权限");
        }
        UUID uuid = parseUuid(id);
        if (resource == null || (resource.hasId() && !id.equals(resource.getIdElement().getIdPart()))) {
            throw new InvalidRequestException("Organization.id 必须与请求地址一致");
        }
        requireText(resource.getName(), 40, "机构名称");
        String codeSystem = config.getOeFhirSystem() + "/org_code";
        var codes = resource.getIdentifier().stream().filter(i -> codeSystem.equals(i.getSystem())).toList();
        if (codes.size() != 1) {
            throw new UnprocessableEntityException("必须提供且只能提供一个机构主数据编码 org_code");
        }
        String code = requireText(codes.get(0).getValue(), 20, "机构编码");
        for (var identifier : resource.getIdentifier()) {
            if ((config.getOeFhirSystem() + "/org_uuid").equals(identifier.getSystem())
                    && !id.equals(identifier.getValue())) {
                throw new UnprocessableEntityException("org_uuid 不能覆盖资源标识");
            }
        }
        Set<OrganizationType> canonicalTypes = new LinkedHashSet<>();
        for (var concept : resource.getType()) {
            for (Coding coding : concept.getCoding()) {
                if (!(config.getOeFhirSystem() + "/orgType").equals(coding.getSystem())) {
                    throw new UnprocessableEntityException("机构类型必须使用已配置的 orgType 编码体系");
                }
                OrganizationType type = types.getOrganizationTypeByName(coding.getCode());
                if (type == null)
                    throw new UnprocessableEntityException("机构类型未配置，请先完成编码映射");
                canonicalTypes.add(type);
            }
        }
        if (canonicalTypes.isEmpty())
            throw new UnprocessableEntityException("机构类型不能为空");

        // Includes code collision, parent validation and update in one transaction.
        locks.lock("fhir-organization-master");
        var existing = organizations.getOrganizationByFhirId(id);
        var sameCode = organizations.getAllMatching("code", code);
        if (sameCode.stream().anyMatch(row -> !uuid.equals(row.getFhirUuid()))) {
            throw new UnprocessableEntityException("机构编码已被另一条主数据使用，请核对映射，不得重复建档");
        }
        var parent = resolveParent(resource, uuid);
        boolean department = canonicalTypes.stream().anyMatch(t -> "dept".equals(t.getName()));
        if (department && (parent == null || !isReferringClinic(parent.getId()))) {
            throw new UnprocessableEntityException("科室必须归属于有效的送检医院");
        }
        if (existing != null && resource.hasActive() && !resource.getActive()
                && organizations.getOrganizationsByParentId(existing.getId()).stream()
                        .anyMatch(child -> "Y".equals(child.getIsActive()))) {
            throw new UnprocessableEntityException("机构仍有启用中的下属科室，不能直接停用");
        }

        resource.setId(id);
        org.openelisglobal.organization.valueholder.Organization incoming;
        try {
            incoming = transform.transformToOrganization(resource);
        } catch (org.openelisglobal.dataexchange.fhir.exception.FhirTransformationException e) {
            throw new UnprocessableEntityException("机构数据格式无法转换，请核对字段");
        }
        var target = existing == null ? incoming : existing;
        target.setOrganizationName(resource.getName().trim());
        target.setCode(code);
        target.setFhirUuid(uuid);
        target.setIsActive(resource.hasActive() && !resource.getActive() ? "N" : "Y");
        target.setOrganization(parent);
        target.setShortName(incoming.getShortName());
        target.setCliaNum(incoming.getCliaNum());
        target.setStreetAddress(incoming.getStreetAddress());
        target.setCity(incoming.getCity());
        target.setState(incoming.getState());
        target.setZipCode(incoming.getZipCode());
        target.setSysUserId(userId);
        // Organization's legacy association is inverse. Persist its links explicitly.
        // Do not cascade transient OrganizationType objects from the reverse transform.
        target.setOrganizationTypes(new HashSet<>());
        var saved = organizations.save(target);
        organizations.deleteAllLinksForOrganization(saved.getId());
        for (OrganizationType type : canonicalTypes)
            organizations.linkOrganizationAndType(saved, type.getId());
        saved.setOrganizationTypes(canonicalTypes);
        return new ImportResult(saved, existing == null);
    }

    private org.openelisglobal.organization.valueholder.Organization resolveParent(Organization resource, UUID self) {
        if (!resource.hasPartOf())
            return null;
        var reference = resource.getPartOf().getReferenceElement();
        if (!"Organization".equals(reference.getResourceType())) {
            throw new UnprocessableEntityException("partOf 必须引用 Organization 主数据");
        }
        UUID parentUuid = parseUuid(reference.getIdPart());
        var parent = organizations.getOrganizationByFhirId(parentUuid.toString());
        if (parent == null || !"Y".equals(parent.getIsActive())) {
            throw new UnprocessableEntityException("上级机构不存在或已停用，请先同步上级机构");
        }
        Set<String> visited = new HashSet<>();
        for (var ancestor = parent; ancestor != null; ancestor = ancestor.getOrganization()) {
            if (self.equals(ancestor.getFhirUuid()) || !visited.add(ancestor.getId())) {
                throw new UnprocessableEntityException("机构归属不能形成循环");
            }
        }
        return parent;
    }

    private boolean isReferringClinic(String id) {
        var type = types.getOrganizationTypeByName("referring clinic");
        return type != null && organizations.getTypeIdsForOrganizationId(id).contains(type.getId());
    }

    private static UUID parseUuid(String id) {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new InvalidRequestException("资源标识必须为有效的 UUID");
        }
    }

    private static String requireText(String value, int maxLength, String label) {
        if (value == null || value.isBlank() || value.trim().length() > maxLength) {
            throw new UnprocessableEntityException(label + "不能为空且长度不能超过 " + maxLength);
        }
        return value.trim();
    }
}

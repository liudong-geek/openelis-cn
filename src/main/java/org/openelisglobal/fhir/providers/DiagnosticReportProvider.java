package org.openelisglobal.fhir.providers;

import ca.uhn.fhir.rest.annotation.IdParam;
import ca.uhn.fhir.rest.annotation.OptionalParam;
import ca.uhn.fhir.rest.annotation.Read;
import ca.uhn.fhir.rest.annotation.Search;
import ca.uhn.fhir.rest.param.TokenAndListParam;
import ca.uhn.fhir.rest.server.IResourceProvider;
import ca.uhn.fhir.rest.server.exceptions.ForbiddenOperationException;
import ca.uhn.fhir.rest.server.exceptions.InternalErrorException;
import ca.uhn.fhir.rest.server.exceptions.InvalidRequestException;
import ca.uhn.fhir.rest.server.exceptions.ResourceNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import org.hl7.fhir.instance.model.api.IBaseResource;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.DiagnosticReport;
import org.hl7.fhir.r4.model.IdType;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.report.service.impl.ReportPublicationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

/** Signed report originals only; never proxies the staging FHIR store. */
@Component
public class DiagnosticReportProvider implements IResourceProvider {
    @Autowired
    private ReportPublicationService publications;
    @Autowired
    private FhirConfig configuration;

    @Override
    public Class<? extends IBaseResource> getResourceType() {
        return DiagnosticReport.class;
    }

    @Read
    public DiagnosticReport readDiagnosticReport(@IdParam IdType id, HttpServletRequest request) {
        FhirProviderUtils.validateIdParam(id, "DiagnosticReport", getClass().getSimpleName(), "readDiagnosticReport");
        try {
            String actor = FhirProviderUtils.getSysUserId(request);
            DiagnosticReport result = publications.read(id.getIdPart(), actor);
            if (result == null)
                throw new ResourceNotFoundException("没有可发布的正式签发报告");
            return result;
        } catch (ResourceNotFoundException error) {
            throw error;
        } catch (AccessDeniedException error) {
            throw new ForbiddenOperationException("没有完整报告范围的查询权限");
        } catch (IllegalArgumentException error) {
            throw new InvalidRequestException("请使用正式报告版本ID或原检验任务UUID");
        } catch (Exception error) {
            throw new InternalErrorException("正式报告证据校验失败，未返回报告内容", error);
        }
    }

    @Search
    public Bundle searchDiagnosticReports(
            @OptionalParam(name = DiagnosticReport.SP_IDENTIFIER) TokenAndListParam identifier,
            HttpServletRequest request) {
        try {
            for (String name : request.getParameterMap().keySet()) {
                if (!Set.of("identifier", "_format").contains(name))
                    throw new IllegalArgumentException("仅支持正式报告编号查询，不转发旧结果缓存查询");
            }
            String[] values = request.getParameterValues("identifier");
            if (values == null || values.length != 1 || values[0].isBlank() || values[0].contains(","))
                throw new IllegalArgumentException("请提供一个正式报告编号identifier");
            String number = values[0];
            int separator = number.indexOf('|');
            if (separator >= 0) {
                String expected = configuration.getOeFhirSystem().replaceAll("/+$", "") + "/report-number";
                if (!expected.equals(number.substring(0, separator)))
                    throw new IllegalArgumentException("报告编号命名空间不匹配");
                number = number.substring(separator + 1);
            }
            Bundle result = new Bundle().setType(Bundle.BundleType.SEARCHSET);
            for (DiagnosticReport report : publications.search(number, null, FhirProviderUtils.getSysUserId(request),
                    100))
                result.addEntry().setResource(report).getSearch().setMode(Bundle.SearchEntryMode.MATCH);
            result.setTotal(result.getEntry().size());
            return result;
        } catch (AccessDeniedException error) {
            throw new ForbiddenOperationException("没有完整报告范围的查询权限");
        } catch (IllegalArgumentException error) {
            throw new InvalidRequestException(error.getMessage());
        } catch (Exception error) {
            throw new InternalErrorException("正式报告查询失败，未返回报告内容", error);
        }
    }
}

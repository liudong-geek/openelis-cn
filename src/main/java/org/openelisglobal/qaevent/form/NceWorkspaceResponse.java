package org.openelisglobal.qaevent.form;

import java.util.List;
import java.util.Map;

/** Detached views compiled inside the service transaction. */
public final class NceWorkspaceResponse {
    private NceWorkspaceResponse() {
    }

    public record EffectiveScope(List<String> roleIds, List<String> sectionIds) {
    }

    public record Paging(int currentPage, int totalPages, long totalResults, int pageSize) {
    }

    public record Reporter(String firstName, String lastName, String loginName) {
    }

    public record Choice(String id, String name) {
    }

    public record Type(String id, String name, String displayKey) {
    }

    public record Category(String id, String name, String displayKey, List<Type> types) {
    }

    public record Meta(String queryVersion, String currentUserId, EffectiveScope effectiveScope, boolean canCreate,
            String createUnavailableReason, Reporter reporter, List<Choice> reportingUnits, List<Category> categories,
            List<String> warningCodes) {
    }

    public record Workspace(String queryVersion, String currentUserId, EffectiveScope effectiveScope,
            NceWorkspaceQuery query, Paging paging, List<Category> categories, boolean canCreate,
            String createUnavailableReason, List<Map<String, Object>> nceList, List<String> warningCodes) {
    }

    public record Orders(String queryVersion, String currentUserId, EffectiveScope effectiveScope,
            Map<String, Object> query, Paging paging, List<Map<String, Object>> orders, List<String> warningCodes) {
    }

    public record Receipt(String queryVersion, String currentUserId, String requestId, String requestHash,
            String outcome, String operation, String eventId, String nceNumber, String statusCode, String lastupdated,
            List<Map<String, Object>> linkedSpecimens, List<Map<String, Object>> attachments) {
    }

    public record User(String id, String firstName, String lastName, String loginName) {
    }

    public record Users(String queryVersion, String currentUserId, List<User> users) {
    }

    public record Download(String fileName, String contentType, byte[] bytes) {
    }
}

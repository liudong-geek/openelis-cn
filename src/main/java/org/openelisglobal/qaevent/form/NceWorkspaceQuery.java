package org.openelisglobal.qaevent.form;

import java.util.Set;

public record NceWorkspaceQuery(String keyword, String status, String categoryId, String severity, int page,
        int pageSize) {
    public NceWorkspaceQuery {
        keyword = string(keyword, 200);
        status = string(status, 40);
        severity = string(severity, 20);
        categoryId = string(categoryId, 20);
        if (!categoryId.isEmpty())
            NceRegistrationCommand.id(categoryId);
        paging(page, pageSize);
    }

    public static int integer(String value, int fallback) {
        if (value == null)
            return fallback;
        try {
            if (!value.matches("[1-9][0-9]*"))
                invalid();
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("INVALID_NCE_QUERY");
        }
    }

    public static void paging(int page, int size) {
        if (page < 1 || page > 1000000 || !Set.of(10, 25, 50, 100).contains(size))
            invalid();
    }

    public static String string(String value, int limit) {
        return value == null ? "" : NceRegistrationCommand.text(value, limit, false);
    }

    private static void invalid() {
        throw new IllegalArgumentException("INVALID_NCE_QUERY");
    }
}

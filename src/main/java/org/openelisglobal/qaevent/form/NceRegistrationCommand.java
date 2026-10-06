package org.openelisglobal.qaevent.form;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Immutable complete registration command; no client event number or status.
 */
public record NceRegistrationCommand(String requestId, String currentUserId, String dateOfEvent, String reportingUnit,
        String title, String description, String immediateAction, String suspectedCauses, String proposedAction,
        String severity, String nceCategoryId, String nceTypeId, List<LinkedSpecimen> linkedSpecimens) {
    public NceRegistrationCommand {
        key(requestId);
        id(currentUserId);
        id(reportingUnit);
        id(nceCategoryId);
        if (nceTypeId != null)
            id(nceTypeId);
        eventDate(dateOfEvent);
        title = text(title, 200, false);
        description = text(description, 10000, true);
        immediateAction = text(immediateAction, 10000, false);
        suspectedCauses = text(suspectedCauses, 10000, false);
        proposedAction = text(proposedAction, 10000, false);
        if (!Set.of("MINOR", "MAJOR", "CRITICAL").contains(severity == null ? "" : severity))
            invalid();
        if (linkedSpecimens == null || linkedSpecimens.size() > 200)
            invalid();
        linkedSpecimens = List.copyOf(linkedSpecimens);
        Set<String> identities = new HashSet<>();
        for (var link : linkedSpecimens)
            if (link == null || !identities.add(link.sampleItemId() + ":" + link.analysisId()))
                invalid();
    }

    public record LinkedSpecimen(String sampleId, String labNumber, String sampleLastupdated, String sampleItemId,
            String lastupdated, String analysisId, String analysisLastupdated) {
        public LinkedSpecimen {
            id(sampleId);
            id(sampleItemId);
            text(labNumber, 30, true);
            if (!labNumber.equals(labNumber.strip()))
                invalid();
            version(sampleLastupdated);
            version(lastupdated);
            if (analysisId != null) {
                id(analysisId);
                version(analysisLastupdated);
            } else if (analysisLastupdated != null)
                invalid();
        }
    }

    public static String id(String value) {
        try {
            if (value == null || !value.matches("[1-9][0-9]*") || Integer.parseInt(value) < 1)
                invalid();
        } catch (NumberFormatException e) {
            invalid();
        }
        return value;
    }

    public static String key(String value) {
        try {
            if (value == null || !UUID.fromString(value).toString().equals(value))
                invalid();
        } catch (IllegalArgumentException e) {
            invalid();
        }
        return value;
    }

    public static LocalDate eventDate(String value) {
        try {
            if (value == null || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))
                invalid();
            var date = LocalDate.parse(value,
                    DateTimeFormatter.ofPattern("uuuu-MM-dd").withResolverStyle(ResolverStyle.STRICT));
            if (date.getYear() < 1)
                invalid();
            return date;
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("INVALID_NCE_DATE");
        }
    }

    public static String text(String value, int max, boolean required) {
        if (value == null) {
            if (required)
                invalid();
            return null;
        }
        if (value.length() > max || value.indexOf('\0') >= 0 || required && value.isBlank())
            invalid();
        return value;
    }

    public static String version(String value) {
        try {
            if (value == null || !Timestamp.valueOf(value).toString().equals(value))
                invalid();
        } catch (IllegalArgumentException e) {
            invalid();
        }
        return value;
    }

    private static void invalid() {
        throw new IllegalArgumentException("INVALID_NCE_COMMAND");
    }
}

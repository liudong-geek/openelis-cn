package org.openelisglobal.qaevent.form;

import java.util.Set;

public record NceActionCommand(String requestId, String currentUserId, String lastupdated, String type,
        String description, String assignedTo) {
    public NceActionCommand {
        NceRegistrationCommand.key(requestId);
        NceRegistrationCommand.id(currentUserId);
        NceRegistrationCommand.version(lastupdated);
        if (!Set.of("ACKNOWLEDGE", "ADD_NOTE", "ASSIGN").contains(type == null ? "" : type))
            throw new IllegalArgumentException("INVALID_NCE_ACTION");
        description = NceRegistrationCommand.text(description, 10000, "ADD_NOTE".equals(type));
        if ("ASSIGN".equals(type))
            NceRegistrationCommand.id(assignedTo);
        else if (assignedTo != null)
            throw new IllegalArgumentException("INVALID_NCE_ACTION");
    }
}

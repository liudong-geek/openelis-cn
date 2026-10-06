package org.openelisglobal.qaevent.dao;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.openelisglobal.qaevent.valueholder.NcEvent;
import org.openelisglobal.qaevent.valueholder.NceRegistrationReceipt;
import org.openelisglobal.qaevent.valueholder.NceSpecimen;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemuser.valueholder.SystemUser;

public interface NceWorkspaceDAO {
    Optional<NceRegistrationReceipt> receipt(String requestId);

    void claim(NceRegistrationReceipt receipt);

    void complete(NceRegistrationReceipt receipt, Integer eventId, String response);

    Optional<NcEvent> event(int id, boolean lock);

    List<NcEvent> candidates(Set<String> sections);

    List<NceSpecimen> links(int eventId);

    List<Sample> searchOrders(String type, String value);

    List<SystemUser> users(String search);

    String allocateNumber(SystemModule module, int year);

    void refresh(Object entity);

    void advanceVersion(NcEvent event);

    void lockOwner(Object entity);

    void flush();
}

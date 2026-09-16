package org.openelisglobal.note.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.List;
import org.junit.Test;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.common.util.StringUtil.EncodeContext;
import org.openelisglobal.note.valueholder.Note;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

public class ReviewAuditNoteDisplayTest {
    @Test
    public void clinicalCommentRenderingOmitsMachineAuditWhileRetainingReturnReason() {
        Object oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        try {
            var factory = mock(AutowireCapableBeanFactory.class);
            when(factory.getBean(DefaultConfigurationProperties.class))
                    .thenReturn(mock(DefaultConfigurationProperties.class));
            ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
            var service = new NoteServiceImpl();
            Note audit = new Note();
            audit.setSubject(Note.REVIEW_AUDIT_SUBJECT);
            audit.setText("SIM JSON evidence");
            Note reason = new Note();
            reason.setSubject("Result Note");
            reason.setText("模拟退回复检");
            String displayed = ReflectionTestUtils.invokeMethod(service, "notesToString", null, false, false, "<br/>",
                    List.of(audit, reason), false, EncodeContext.HTML);
            assertEquals("模拟退回复检", displayed);
            assertNull(ReflectionTestUtils.invokeMethod(service, "notesToString", null, false, false, "<br/>",
                    List.of(audit), false, EncodeContext.HTML));
            assertEquals("SIM JSON evidence", audit.getText());
        } finally {
            ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        }
    }
}

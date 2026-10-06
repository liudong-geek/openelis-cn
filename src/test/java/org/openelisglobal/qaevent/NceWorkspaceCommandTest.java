package org.openelisglobal.qaevent;

import static org.junit.Assert.*;

import java.util.List;
import org.junit.Test;
import org.openelisglobal.qaevent.form.NceActionCommand;
import org.openelisglobal.qaevent.form.NceRegistrationCommand;
import org.openelisglobal.qaevent.form.NceWorkspaceQuery;

public class NceWorkspaceCommandTest {
    @Test
    public void strictIsoKeepsLeapDayAndNeverNormalizesInvalidChineseDates() {
        assertEquals("2024-02-29", NceWorkspaceTestSupport.command("2024-02-29", List.of()).dateOfEvent());
        for (String date : List.of("2026-02-31", "2026-02-29", "2026/10/06", "10/06/2026", "2026-10-06junk"))
            assertThrows(IllegalArgumentException.class, () -> NceWorkspaceTestSupport.command(date, List.of()));
    }

    @Test
    public void identityIsExactAndOptionalAnalysisMustCarryItsActualVersion() {
        var link = new NceRegistrationCommand.LinkedSpecimen("1", "24-00001", NceWorkspaceTestSupport.VERSION, "1",
                NceWorkspaceTestSupport.VERSION, null, null);
        assertEquals(1, NceWorkspaceTestSupport.command("2026-10-06", List.of(link)).linkedSpecimens().size());
        assertThrows(IllegalArgumentException.class, () -> new NceRegistrationCommand.LinkedSpecimen("01", "24-00001",
                NceWorkspaceTestSupport.VERSION, "1", NceWorkspaceTestSupport.VERSION, null, null));
        assertThrows(IllegalArgumentException.class, () -> new NceRegistrationCommand.LinkedSpecimen("1", "24-00001 ",
                NceWorkspaceTestSupport.VERSION, "1", NceWorkspaceTestSupport.VERSION, null, null));
        assertThrows(IllegalArgumentException.class, () -> new NceRegistrationCommand.LinkedSpecimen("1", "24-00001",
                NceWorkspaceTestSupport.VERSION, "1", NceWorkspaceTestSupport.VERSION, "2", null));
        assertThrows(IllegalArgumentException.class,
                () -> new NceRegistrationCommand.LinkedSpecimen("1", "24-00001", NceWorkspaceTestSupport.VERSION, "1",
                        NceWorkspaceTestSupport.VERSION, null, NceWorkspaceTestSupport.VERSION));
    }

    @Test
    public void duplicateLinksAreRejectedWhileDifferentRealAnalysesAreRepresentable() {
        var link = new NceRegistrationCommand.LinkedSpecimen("1", "24-00001", NceWorkspaceTestSupport.VERSION, "1",
                NceWorkspaceTestSupport.VERSION, "1", NceWorkspaceTestSupport.VERSION);
        assertThrows(IllegalArgumentException.class,
                () -> NceWorkspaceTestSupport.command("2026-10-06", List.of(link, link)));
        var second = new NceRegistrationCommand.LinkedSpecimen("1", "24-00001", NceWorkspaceTestSupport.VERSION, "1",
                NceWorkspaceTestSupport.VERSION, "2", NceWorkspaceTestSupport.VERSION);
        assertEquals(2, NceWorkspaceTestSupport.command("2026-10-06", List.of(link, second)).linkedSpecimens().size());
    }

    @Test
    public void actionRequiresVersionAndTypedAssigneeOrNote() {
        assertThrows(IllegalArgumentException.class, () -> new NceActionCommand(NceWorkspaceTestSupport.KEY, "7",
                NceWorkspaceTestSupport.VERSION, "ADD_NOTE", "", null));
        assertThrows(IllegalArgumentException.class, () -> new NceActionCommand(NceWorkspaceTestSupport.KEY, "7",
                NceWorkspaceTestSupport.VERSION, "ASSIGN", null, null));
        assertThrows(IllegalArgumentException.class, () -> new NceActionCommand(NceWorkspaceTestSupport.KEY, "7",
                NceWorkspaceTestSupport.VERSION, "ACKNOWLEDGE", null, "8"));
        assertThrows(IllegalArgumentException.class,
                () -> new NceActionCommand(NceWorkspaceTestSupport.KEY, "7", null, "ACKNOWLEDGE", null, null));
        assertEquals("ASSIGN", new NceActionCommand(NceWorkspaceTestSupport.KEY, "7", NceWorkspaceTestSupport.VERSION,
                "ASSIGN", null, "8").type());
    }

    @Test
    public void originalSeverityAndStrictPagingRemainStable() {
        assertEquals("MAJOR", NceWorkspaceTestSupport.command("2026-10-06", List.of()).severity());
        assertEquals("", new NceWorkspaceQuery(null, null, null, null, 1, 25).keyword());
        for (String page : List.of("0", "1.0", "01", " 1", "1e2", "-1", "2147483648"))
            assertThrows(IllegalArgumentException.class, () -> NceWorkspaceQuery.integer(page, 1));
        assertThrows(IllegalArgumentException.class, () -> new NceWorkspaceQuery("", "", "", "", 1, 20));
        assertThrows(IllegalArgumentException.class, () -> NceRegistrationCommand.key("legacy-uuid"));
    }
}

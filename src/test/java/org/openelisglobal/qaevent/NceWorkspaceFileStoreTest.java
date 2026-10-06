package org.openelisglobal.qaevent;

import static org.junit.Assert.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.qaevent.service.NceRegistrationFileStore;
import org.openelisglobal.qaevent.service.NceWorkspaceException;
import org.openelisglobal.qaevent.valueholder.NceAttachment;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public class NceWorkspaceFileStoreTest {
    private Path root;
    private NceRegistrationFileStore store;

    @Before
    public void setup() throws Exception {
        root = Files.createTempDirectory("chg075-files-");
        store = new NceRegistrationFileStore(root.toString());
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }

    @After
    public void close() throws Exception {
        TransactionSynchronizationManager.clear();
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path p : paths.sorted(java.util.Comparator.reverseOrder()).toList())
                Files.deleteIfExists(p);
        }
    }

    private MockMultipartFile file(String name) {
        return new MockMultipartFile("files", name, "text/plain", new byte[] { 1, 2, 3 });
    }

    private void complete(int status) {
        TransactionSynchronizationManager.getSynchronizations().forEach(s -> s.afterCompletion(status));
    }

    @Test
    public void allSelectedFilesKeepSeparateBytesAndDigests() {
        var uploads = store.prepare(List.of(file("first.txt"), file("第二份.txt")));
        assertEquals(2, uploads.size());
        assertEquals("第二份.txt", uploads.get(1).name());
        assertEquals(64, uploads.get(0).sha256().length());
        var paths = store.store(7, uploads);
        assertEquals(2, paths.size());
        assertNotEquals(paths.get(0), paths.get(1));
        complete(TransactionSynchronization.STATUS_COMMITTED);
        assertTrue(Files.exists(paths.get(0)));
        assertTrue(Files.exists(paths.get(1)));
    }

    @Test
    public void confirmedRollbackRemovesAllNewFilesAndOnlyItsNewDirectory() {
        var paths = store.store(7, store.prepare(List.of(file("a.txt"), file("b.txt"))));
        complete(TransactionSynchronization.STATUS_ROLLED_BACK);
        for (var path : paths)
            assertFalse(Files.exists(path));
        assertFalse(Files.exists(root.resolve("7")));
    }

    @Test
    public void unknownCommitNeverDeletesPotentiallyCommittedAttachments() {
        var paths = store.store(7, store.prepare(List.of(file("a.txt"))));
        complete(TransactionSynchronization.STATUS_UNKNOWN);
        assertTrue(Files.exists(paths.get(0)));
    }

    @Test
    public void invalidLaterAttachmentRejectsBeforeAnyFilesystemMutation() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> store.prepare(
                List.of(file("a.txt"), new MockMultipartFile("files", "bad.html", "text/html", new byte[] { 1 }))));
        try (var paths = Files.list(root)) {
            assertEquals(0, paths.count());
        }
        assertThrows(IllegalArgumentException.class, () -> store.prepare(List.of(file("../escape.txt"))));
    }

    @Test
    public void currentStoreFailureDoesNotRemoveExistingFiles() throws Exception {
        Path old = root.resolve("7");
        Files.writeString(old, "preexisting");
        assertThrows(NceWorkspaceException.class, () -> store.store(7, store.prepare(List.of(file("a.txt")))));
        assertEquals("preexisting", Files.readString(old));
    }

    @Test
    public void downloadCanonicalBoundaryRejectsSymlinkAndUsesNonHtmlMime() throws Exception {
        Path outside = Files.createTempFile("chg075-outside-", ".txt");
        try {
            Files.writeString(outside, "outside");
            Path link = root.resolve("escape.txt");
            Files.createSymbolicLink(link, outside);
            var attachment = new NceAttachment();
            attachment.setFileName("escape.txt");
            attachment.setFilePath(link.toString());
            attachment.setFileType("text/plain");
            assertThrows(NceWorkspaceException.class, () -> store.download(attachment));
            Path safe = root.resolve("inside.txt");
            Files.writeString(safe, "safe");
            attachment.setFilePath(safe.toString());
            attachment.setFileType("text/html");
            assertEquals("application/octet-stream", store.download(attachment).contentType());
        } finally {
            Files.deleteIfExists(outside);
        }
    }
}

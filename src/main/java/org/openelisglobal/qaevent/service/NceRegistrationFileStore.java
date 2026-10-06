package org.openelisglobal.qaevent.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.openelisglobal.qaevent.form.NceWorkspaceResponse.Download;
import org.openelisglobal.qaevent.valueholder.NceAttachment;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

/**
 * Bounded validation and rollback compensation, not a claim of crash-atomic
 * DB/filesystem storage.
 */
@Service
public class NceRegistrationFileStore {
    private static final long MAX = 10L * 1024 * 1024;
    private static final Set<String> TYPES = Set.of("image/jpeg", "image/png", "image/gif", "application/pdf",
            "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain", "text/csv");
    private static final Set<String> EXTENSIONS = Set.of(".jpg", ".jpeg", ".png", ".gif", ".pdf", ".doc", ".docx",
            ".xls", ".xlsx", ".txt", ".csv");
    private final Path directory;

    public NceRegistrationFileStore(
            @Value("${org.openelisglobal.nce.attachment.path:/var/lib/openelis-global/nce-attachments}") String directory) {
        this.directory = Path.of(directory);
    }

    public record Upload(String name, String type, long size, String sha256, byte[] bytes) {
    }

    public List<Upload> prepare(List<MultipartFile> files) {
        if (files == null)
            return List.of();
        if (files.size() > 5)
            throw new IllegalArgumentException("NCE_TOO_MANY_ATTACHMENTS");
        List<Upload> result = new ArrayList<>();
        for (var f : files) {
            if (f == null || f.isEmpty() || f.getSize() > MAX)
                throw new IllegalArgumentException("INVALID_NCE_ATTACHMENT");
            String name = f.getOriginalFilename(), type = f.getContentType();
            if (name == null || name.isBlank() || name.length() > 255 || name.indexOf('/') >= 0
                    || name.indexOf('\\') >= 0 || name.chars().anyMatch(c -> c < 32 || c == 127) || type == null
                    || !TYPES.contains(type.toLowerCase(Locale.ROOT)))
                throw new IllegalArgumentException("INVALID_NCE_ATTACHMENT");
            int dot = name.lastIndexOf('.');
            String ext = dot < 0 ? "" : name.substring(dot).toLowerCase(Locale.ROOT);
            if (!EXTENSIONS.contains(ext))
                throw new IllegalArgumentException("INVALID_NCE_ATTACHMENT");
            try (var stream = f.getInputStream()) {
                byte[] bytes = stream.readNBytes((int) MAX + 1);
                if (bytes.length == 0 || bytes.length > MAX || bytes.length != f.getSize())
                    throw new IllegalArgumentException("INVALID_NCE_ATTACHMENT");
                result.add(new Upload(name, type.toLowerCase(Locale.ROOT), bytes.length, hash(bytes), bytes));
            } catch (IOException e) {
                throw new NceWorkspaceException(503, "NCE_ATTACHMENT_READ_FAILED");
            }
        }
        return List.copyOf(result);
    }

    public List<Path> store(int eventId, List<Upload> uploads) {
        if (uploads.isEmpty())
            return List.of();
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive())
            throw new IllegalStateException("NCE_FILE_WRITE_REQUIRES_TRANSACTION");
        List<Path> created = new ArrayList<>();
        List<Path> directories = new ArrayList<>();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK)
                    cleanup(created, directories);
            }
        });
        try {
            Files.createDirectories(directory);
            Path base = directory.toRealPath(), event = base.resolve(String.valueOf(eventId));
            if (!Files.exists(event)) {
                Files.createDirectory(event);
                directories.add(event);
            }
            Path real = event.toRealPath();
            if (!real.startsWith(base))
                throw new IOException("INVALID_STORAGE_BOUNDARY");
            for (var upload : uploads) {
                String ext = upload.name().substring(upload.name().lastIndexOf('.')).toLowerCase(Locale.ROOT);
                Path file = real.resolve(UUID.randomUUID() + ext);
                created.add(file);
                Files.write(file, upload.bytes(), StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            }
            return List.copyOf(created);
        } catch (IOException e) {
            cleanup(created, directories);
            throw new NceWorkspaceException(503, "NCE_ATTACHMENT_STORE_FAILED");
        }
    }

    public Download download(NceAttachment attachment) {
        try {
            Path base = directory.toRealPath(), file = Path.of(attachment.getFilePath()).toRealPath();
            if (!file.startsWith(base) || !Files.isRegularFile(file))
                throw new NceWorkspaceException(403, "NCE_ATTACHMENT_PATH_DENIED");
            if (Files.size(file) > MAX)
                throw new NceWorkspaceException(409, "NCE_ATTACHMENT_TOO_LARGE");
            String type = attachment.getFileType();
            type = type != null && TYPES.contains(type) ? type : "application/octet-stream";
            return new Download(attachment.getFileName(), type, Files.readAllBytes(file));
        } catch (java.nio.file.NoSuchFileException e) {
            throw new NceWorkspaceException(404, "NCE_ATTACHMENT_NOT_FOUND");
        } catch (IOException | java.nio.file.InvalidPathException e) {
            throw new NceWorkspaceException(503, "NCE_ATTACHMENT_READ_FAILED");
        }
    }

    public static String hash(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private void cleanup(List<Path> files, List<Path> dirs) {
        for (Path file : files)
            try {
                Files.deleteIfExists(file);
            } catch (IOException e) {
                org.openelisglobal.common.log.LogEvent.logError("NceRegistrationFileStore", "cleanup",
                        "NCE_FILE_CLEANUP_FAILED");
            }
        for (Path dir : dirs)
            try {
                Files.deleteIfExists(dir);
            } catch (IOException e) {
                org.openelisglobal.common.log.LogEvent.logError("NceRegistrationFileStore", "cleanup",
                        "NCE_DIRECTORY_CLEANUP_FAILED");
            }
    }
}

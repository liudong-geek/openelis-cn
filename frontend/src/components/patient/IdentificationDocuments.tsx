import React, { useState, useEffect, useRef } from "react";
import {
  Button,
  Select,
  SelectItem,
  TextArea,
  Modal,
  Tile,
  InlineNotification,
  Tag,
} from "@carbon/react";
import {
  Add,
  TrashCan,
  View,
  Edit,
  DocumentBlank,
  DocumentPdf,
  CloudUpload,
  Camera,
} from "@carbon/icons-react";
import ImagePreviewModal from "./photoManagement/uploadPhoto/ImagePreviewModal";
import {
  getFromOpenElisServer,
  deleteFromOpenElisServer,
  putToOpenElisServer,
} from "../utils/Utils";
import { useIntl } from "react-intl";
import "./IdentificationDocuments.css";
import { patientMediaMatches } from "./patientMaintenanceContract";

const DOCUMENT_CATEGORIES = [
  { value: "NATIONAL_ID", labelId: "patient.idDoc.category.nationalId" },
  { value: "INSURANCE_CARD", labelId: "patient.idDoc.category.insuranceCard" },
  { value: "OTHER", labelId: "patient.idDoc.category.other" },
];

const ACCEPTED_FORMATS = "image/jpeg,image/png,image/jpg,application/pdf";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface PatientDocument {
  id?: string;
  data?: string;
  thumbnail?: string;
  category?: string;
  description?: string;
  documentLastUpdated?: string;
}

interface IdentificationDocumentsProps {
  patientId?: string;
  pendingDocuments?: PatientDocument[];
  onDocumentsChange: (documents: PatientDocument[]) => void;
  disabled?: boolean;
  explainImmediateActions?: boolean;
  readOnly?: boolean;
  maintenanceSessionKey?: string;
  onImmediateSaveSuccess?: () => void;
  onOperationStateChange?: (busy: boolean, unknown: boolean) => void;
}

const IdentificationDocuments = ({
  patientId,
  pendingDocuments = [],
  onDocumentsChange,
  disabled = false,
  explainImmediateActions = false,
  readOnly = false,
  maintenanceSessionKey,
  onImmediateSaveSuccess,
  onOperationStateChange,
}: IdentificationDocumentsProps) => {
  const intl = useIntl();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mounted = useRef(true);
  const operationSequence = useRef(0);
  const operationBusyRef = useRef(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationUnknown, setOperationUnknown] = useState(false);
  const [operationError, setOperationError] = useState(false);
  const pendingOperation = useRef<null | {
    kind: "edit" | "delete";
    doc: PatientDocument;
    body?: PatientDocument;
  }>(null);
  const operationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operationSequence.current++;
      if (operationTimeout.current) clearTimeout(operationTimeout.current);
    };
  }, []);
  const previousSession = useRef(maintenanceSessionKey);
  useEffect(() => {
    if (
      !explainImmediateActions ||
      previousSession.current === maintenanceSessionKey
    )
      return;
    previousSession.current = maintenanceSessionKey;
    operationSequence.current++;
    if (operationTimeout.current) clearTimeout(operationTimeout.current);
    if (operationBusyRef.current || operationUnknown)
      finishDocumentOperation(false, true);
  }, [maintenanceSessionKey]);
  useEffect(() => {
    onOperationStateChange?.(operationBusy, operationUnknown);
  }, [operationBusy, operationUnknown, onOperationStateChange]);
  const [savedDocuments, setSavedDocuments] = useState<PatientDocument[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [viewDocUrl, setViewDocUrl] = useState<string | null>(null);
  const [viewDocType, setViewDocType] = useState<"pdf" | "image" | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<PatientDocument | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Upload form state
  const [newDocCategory, setNewDocCategory] = useState("NATIONAL_ID");
  const [newDocDescription, setNewDocDescription] = useState("");
  const [newDocPreview, setNewDocPreview] = useState<string | null>(null);
  const [newDocData, setNewDocData] = useState<string | null>(null);
  const [newDocIsPdf, setNewDocIsPdf] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    if (patientId) {
      loadSavedDocuments();
    }
  }, [patientId]);

  const loadSavedDocuments = () => {
    const sequence = operationSequence.current;
    getFromOpenElisServer(
      `/rest/patient-id-documents/${patientId}`,
      (response: PatientDocument[]) => {
        if (
          mounted.current &&
          sequence === operationSequence.current &&
          response &&
          Array.isArray(response)
        ) {
          setSavedDocuments(response);
        }
      },
    );
  };

  const resetUploadForm = () => {
    setNewDocCategory("NATIONAL_ID");
    setNewDocDescription("");
    setNewDocPreview(null);
    setNewDocData(null);
    setNewDocIsPdf(false);
    setFileError("");
    setIsDragging(false);
  };

  const processFile = (file?: File) => {
    setFileError("");

    if (!file) return;

    const validTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/pdf",
    ];
    if (!validTypes.includes(file.type)) {
      setFileError(
        intl.formatMessage({ id: "patient.idDoc.error.invalidFormat" }),
      );
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError(
        intl.formatMessage({ id: "patient.idDoc.error.fileTooLarge" }),
      );
      return;
    }

    const isPdf = file.type === "application/pdf";
    setNewDocIsPdf(isPdf);

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      setNewDocData(dataUrl);
      setNewDocPreview(isPdf ? null : dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    processFile(event.target.files?.[0]);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    processFile(event.dataTransfer.files?.[0]);
  };

  const handleUploadSubmit = () => {
    if (!newDocData) return;
    const newDoc = {
      data: newDocData,
      category: newDocCategory,
      description: newDocDescription,
    };
    onDocumentsChange([...pendingDocuments, newDoc]);
    resetUploadForm();
    setIsUploadModalOpen(false);
  };

  const handleCameraCapture = (imageData: string) => {
    setNewDocData(imageData);
    setNewDocPreview(imageData);
    setNewDocIsPdf(false);
    setFileError("");
    setIsCameraModalOpen(false);
  };

  const handleRemovePending = (index: number) => {
    const updated = pendingDocuments.filter((_, i) => i !== index);
    onDocumentsChange(updated);
  };

  const handleViewSavedDocument = (doc: PatientDocument) => {
    getFromOpenElisServer(
      `/rest/patient-id-documents/${patientId}/${doc.id}/full`,
      (response: PatientDocument) => {
        if (response && response.data) {
          setViewDocUrl(response.data);
          setViewDocType(
            response.data.startsWith("data:application/pdf") ? "pdf" : "image",
          );
          setIsViewModalOpen(true);
        }
      },
    );
  };

  const handleViewPendingDocument = (doc: PatientDocument) => {
    setViewDocUrl(doc.data!);
    setViewDocType(
      doc.data!.startsWith("data:application/pdf") ? "pdf" : "image",
    );
    setIsViewModalOpen(true);
  };

  const handleEditDocument = (doc: PatientDocument) => {
    if (
      explainImmediateActions &&
      (disabled || readOnly || operationBusyRef.current || operationUnknown)
    )
      return;
    setOperationError(false);
    setSelectedDoc(doc);
    setEditCategory(doc.category);
    setEditDescription(doc.description || "");
    // Reset replacement-image state so the dropzone starts empty.
    // If the user picks a new file before saving, it goes in the PUT body.
    setNewDocData(null);
    setNewDocPreview(null);
    setNewDocIsPdf(false);
    setFileError("");
    setIsEditModalOpen(true);
  };

  const finishDocumentOperation = (success: boolean, unknown = true) => {
    if (operationTimeout.current) clearTimeout(operationTimeout.current);
    operationBusyRef.current = false;
    setOperationBusy(false);
    setOperationUnknown(!success && unknown);
    setOperationError(!success);
    if (!success) return;
    onImmediateSaveSuccess?.();
    setIsEditModalOpen(false);
    setIsDeleteModalOpen(false);
    setSelectedDoc(null);
    setNewDocData(null);
    setNewDocPreview(null);
    setNewDocIsPdf(false);
    pendingOperation.current = null;
  };

  const verifyDocumentOperation = (sequence: number) => {
    const pending = pendingOperation.current;
    if (!pending) return;
    const current = () =>
      mounted.current && sequence === operationSequence.current;
    getFromOpenElisServer<PatientDocument[]>(
      `/rest/patient-id-documents/${patientId}`,
      (documents) => {
        if (!current()) return;
        if (!Array.isArray(documents)) {
          finishDocumentOperation(false);
          return;
        }
        const saved = documents.find(
          (doc) => String(doc.id) === String(pending.doc.id),
        );
        if (pending.kind === "delete") {
          if (saved) {
            finishDocumentOperation(false);
            return;
          }
          setSavedDocuments(documents);
          finishDocumentOperation(true);
          return;
        }
        if (
          !saved ||
          (saved.category || "") !== (pending.body?.category || "") ||
          (saved.description || "") !== (pending.body?.description || "")
        ) {
          finishDocumentOperation(false);
          return;
        }
        if (!pending.body?.data) {
          setSavedDocuments(documents);
          finishDocumentOperation(true);
          return;
        }
        getFromOpenElisServer<{ data?: string }>(
          `/rest/patient-id-documents/${patientId}/${pending.doc.id}/full`,
          (full) => {
            if (!current()) return;
            if (
              !full?.data ||
              !patientMediaMatches(full.data, pending.body!.data!)
            ) {
              finishDocumentOperation(false);
              return;
            }
            setSavedDocuments(documents);
            finishDocumentOperation(true);
          },
        );
      },
    );
  };

  const beginDocumentOperation = () => {
    operationBusyRef.current = true;
    setOperationBusy(true);
    setOperationError(false);
    const sequence = ++operationSequence.current;
    if (operationTimeout.current) clearTimeout(operationTimeout.current);
    operationTimeout.current = setTimeout(() => {
      if (!mounted.current || sequence !== operationSequence.current) return;
      operationSequence.current++;
      finishDocumentOperation(false);
    }, 30000);
    return sequence;
  };

  const recheckDocumentOperation = () => {
    if (operationBusyRef.current || !pendingOperation.current) return;
    verifyDocumentOperation(beginDocumentOperation());
  };

  const documentWriteUrl = (document: PatientDocument) =>
    `/rest/patient-id-documents/${encodeURIComponent(String(document.id))}?${new URLSearchParams({ patientId: String(patientId || ""), version: String(document.documentLastUpdated || "") }).toString()}`;

  const handleSaveEdit = () => {
    if (
      !selectedDoc ||
      (explainImmediateActions &&
        (disabled || readOnly || operationBusyRef.current))
    )
      return;
    if (explainImmediateActions && operationUnknown) {
      recheckDocumentOperation();
      return;
    }
    const body: PatientDocument = {
      category: editCategory,
      description: editDescription,
    };
    if (newDocData) {
      body.data = newDocData;
    }
    if (explainImmediateActions) {
      if (!patientId || !selectedDoc.documentLastUpdated) {
        finishDocumentOperation(false, false);
        return;
      }
      pendingOperation.current = { kind: "edit", doc: selectedDoc, body };
      const sequence = beginDocumentOperation();
      putToOpenElisServer(
        documentWriteUrl(selectedDoc),
        JSON.stringify(body),
        (status) => {
          if (!mounted.current || sequence !== operationSequence.current)
            return;
          if ([400, 401, 403, 404, 409, 422].includes(status)) {
            finishDocumentOperation(false, false);
            return;
          }
          verifyDocumentOperation(sequence);
        },
      );
      return;
    }
    putToOpenElisServer(
      `/rest/patient-id-documents/${selectedDoc.id}`,
      JSON.stringify(body),
      () => {
        loadSavedDocuments();
        setIsEditModalOpen(false);
        setSelectedDoc(null);
        setNewDocData(null);
        setNewDocPreview(null);
        setNewDocIsPdf(false);
      },
    );
  };

  const handleDeleteDocument = (doc: PatientDocument) => {
    if (
      explainImmediateActions &&
      (disabled || readOnly || operationBusyRef.current || operationUnknown)
    )
      return;
    setOperationError(false);
    setSelectedDoc(doc);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (
      !selectedDoc ||
      (explainImmediateActions &&
        (disabled || readOnly || operationBusyRef.current))
    )
      return;
    if (explainImmediateActions && operationUnknown) {
      recheckDocumentOperation();
      return;
    }
    if (explainImmediateActions) {
      if (!patientId || !selectedDoc.documentLastUpdated) {
        finishDocumentOperation(false, false);
        return;
      }
      pendingOperation.current = { kind: "delete", doc: selectedDoc };
      const sequence = beginDocumentOperation();
      deleteFromOpenElisServer(documentWriteUrl(selectedDoc), (status) => {
        if (!mounted.current || sequence !== operationSequence.current) return;
        if ([400, 401, 403, 404, 409, 422].includes(status)) {
          finishDocumentOperation(false, false);
          return;
        }
        verifyDocumentOperation(sequence);
      });
      return;
    }
    deleteFromOpenElisServer(
      `/rest/patient-id-documents/${selectedDoc.id}`,
      () => {
        loadSavedDocuments();
        setIsDeleteModalOpen(false);
        setSelectedDoc(null);
      },
    );
  };

  const getCategoryLabel = (categoryValue?: string) => {
    const cat = DOCUMENT_CATEGORIES.find((c) => c.value === categoryValue);
    return cat ? intl.formatMessage({ id: cat.labelId }) : categoryValue || "";
  };

  const isPdfData = (data?: string) =>
    data && data.startsWith("data:application/pdf");

  return (
    <div className="id-documents-section">
      {/* Single hidden file input shared by both upload and edit modals.
          Hoisted out of any Modal so its ref stays valid regardless of
          which modal (or none) is currently open. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FORMATS}
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <div className="id-documents-header">
        <h5 className="id-documents-title">
          {intl.formatMessage({ id: "patient.idDoc.title" })}
        </h5>
        {!disabled && !readOnly && (
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Add}
            disabled={
              explainImmediateActions && (operationBusy || operationUnknown)
            }
            onClick={() => {
              resetUploadForm();
              setIsUploadModalOpen(true);
            }}
          >
            {intl.formatMessage({ id: "patient.idDoc.addDocument" })}
          </Button>
        )}
      </div>

      {explainImmediateActions && (
        <p className="id-documents-save-timing">
          {intl.formatMessage({
            id: "patient.maintenance.documents.saveTiming",
          })}
        </p>
      )}
      {explainImmediateActions && operationError && (
        <InlineNotification
          kind="error"
          hideCloseButton
          title={intl.formatMessage({ id: "notification.title" })}
          subtitle={intl.formatMessage({
            id: operationUnknown
              ? "patient.maintenance.documents.failed"
              : "patient.maintenance.documents.rejected",
          })}
        />
      )}
      {explainImmediateActions && operationUnknown && (
        <Button
          type="button"
          kind="tertiary"
          disabled={operationBusy}
          onClick={recheckDocumentOperation}
        >
          {intl.formatMessage({ id: "patient.maintenance.documents.recheck" })}
        </Button>
      )}
      {/* Upload Modal: file picker + category + description in one step */}
      <Modal
        open={isUploadModalOpen}
        onRequestClose={() => {
          resetUploadForm();
          setIsUploadModalOpen(false);
        }}
        modalHeading={intl.formatMessage({
          id: "patient.idDoc.addDocument",
        })}
        primaryButtonText={intl.formatMessage({
          id: "patient.idDoc.upload",
        })}
        primaryButtonDisabled={!newDocData}
        secondaryButtonText={intl.formatMessage({
          id: "patient.photo.cancel",
        })}
        onRequestSubmit={handleUploadSubmit}
        size="md"
      >
        <div className="id-documents-upload-form">
          <Select
            id="new-doc-category"
            labelText={intl.formatMessage({
              id: "patient.idDoc.documentType",
            })}
            value={newDocCategory}
            onChange={(e) => setNewDocCategory(e.target.value)}
          >
            {DOCUMENT_CATEGORIES.map((cat) => (
              <SelectItem
                key={cat.value}
                value={cat.value}
                text={intl.formatMessage({ id: cat.labelId })}
              />
            ))}
          </Select>

          <TextArea
            id="new-doc-description"
            labelText={intl.formatMessage({
              id: "patient.idDoc.description",
            })}
            value={newDocDescription}
            onChange={(e) => setNewDocDescription(e.target.value)}
            placeholder={intl.formatMessage({
              id: "patient.idDoc.description.placeholder",
            })}
            rows={2}
            maxCount={255}
          />

          {!newDocData ? (
            <div className="id-doc-upload-area">
              <div
                className={`id-doc-dropzone ${isDragging ? "id-doc-dropzone-active" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <CloudUpload size={48} className="id-doc-dropzone-icon" />
                <p className="id-doc-dropzone-title">
                  {intl.formatMessage({ id: "patient.idDoc.dragndrop" })}
                </p>
                <p className="id-doc-dropzone-subtitle">
                  {intl.formatMessage({ id: "patient.idDoc.browse" })}
                </p>
                <p className="id-doc-dropzone-formats">
                  {intl.formatMessage({ id: "patient.idDoc.formats" })}
                </p>
              </div>
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={Camera}
                onClick={() => setIsCameraModalOpen(true)}
                className="id-doc-camera-btn"
              >
                {intl.formatMessage({ id: "patient.idDoc.useCamera" })}
              </Button>
            </div>
          ) : (
            <div className="id-doc-file-preview">
              {newDocIsPdf ? (
                <div className="id-doc-pdf-indicator">
                  <DocumentPdf size={48} />
                  <span>
                    {intl.formatMessage({ id: "patient.idDoc.pdfSelected" })}
                  </span>
                </div>
              ) : (
                <img
                  src={newDocPreview}
                  alt={intl.formatMessage({
                    id: "patient.photo.preview.alt",
                  })}
                  className="id-doc-preview-image"
                />
              )}
              <Button
                kind="tertiary"
                size="sm"
                onClick={() => {
                  setNewDocData(null);
                  setNewDocPreview(null);
                  setNewDocIsPdf(false);
                  setFileError("");
                }}
              >
                {intl.formatMessage({ id: "patient.photo.change" })}
              </Button>
            </div>
          )}

          {fileError && <p className="id-doc-error">{fileError}</p>}
        </div>
      </Modal>

      {/* Camera modal - reuses existing ImagePreviewModal */}
      <ImagePreviewModal
        open={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onImageSelect={handleCameraCapture}
        currentImage={null}
      />

      {/* Document grid */}
      <div className="id-documents-grid">
        {/* Saved documents (from server) */}
        {savedDocuments.map((doc) => (
          <Tile key={`saved-${doc.id}`} className="id-document-card">
            <div
              className="id-document-thumbnail"
              onClick={() => !disabled && handleViewSavedDocument(doc)}
            >
              {doc.thumbnail &&
              doc.thumbnail.startsWith("data:application/pdf") ? (
                <div className="id-doc-pdf-thumb">
                  <DocumentPdf size={40} />
                  <span>PDF</span>
                </div>
              ) : (
                <img
                  src={doc.thumbnail}
                  alt={getCategoryLabel(doc.category)}
                  className="id-document-image"
                />
              )}
            </div>
            <div className="id-document-info">
              <Tag type="blue" size="sm">
                {getCategoryLabel(doc.category)}
              </Tag>
              {doc.description && (
                <span className="id-document-description">
                  {doc.description}
                </span>
              )}
            </div>
            {!disabled && (
              <div className="id-document-actions">
                <Button
                  kind="ghost"
                  size="sm"
                  hasIconOnly
                  iconDescription={intl.formatMessage({
                    id: "patient.idDoc.view",
                  })}
                  renderIcon={View}
                  onClick={() => handleViewSavedDocument(doc)}
                />
                {!readOnly && (
                  <Button
                    kind="ghost"
                    size="sm"
                    hasIconOnly
                    iconDescription={intl.formatMessage({
                      id: "patient.idDoc.edit",
                    })}
                    renderIcon={Edit}
                    onClick={() => handleEditDocument(doc)}
                  />
                )}
                {!readOnly && (
                  <Button
                    kind="danger--ghost"
                    size="sm"
                    hasIconOnly
                    iconDescription={intl.formatMessage({
                      id: "patient.idDoc.delete",
                    })}
                    renderIcon={TrashCan}
                    onClick={() => handleDeleteDocument(doc)}
                  />
                )}
              </div>
            )}
          </Tile>
        ))}

        {/* Pending (unsaved) documents */}
        {pendingDocuments.map((doc, index) => (
          <Tile key={`pending-${index}`} className="id-document-card pending">
            <div
              className="id-document-thumbnail"
              onClick={() => handleViewPendingDocument(doc)}
            >
              {isPdfData(doc.data) ? (
                <div className="id-doc-pdf-thumb">
                  <DocumentPdf size={40} />
                  <span>PDF</span>
                </div>
              ) : (
                <img
                  src={doc.data}
                  alt={getCategoryLabel(doc.category)}
                  className="id-document-image"
                />
              )}
            </div>
            <div className="id-document-info">
              <Tag type="green" size="sm">
                {getCategoryLabel(doc.category)}
              </Tag>
              <Tag type="outline" size="sm">
                {intl.formatMessage({ id: "patient.idDoc.pending" })}
              </Tag>
              {doc.description && (
                <span className="id-document-description">
                  {doc.description}
                </span>
              )}
            </div>
            {!disabled && !readOnly && (
              <div className="id-document-actions">
                <Button
                  kind="ghost"
                  size="sm"
                  hasIconOnly
                  iconDescription={intl.formatMessage({
                    id: "patient.idDoc.view",
                  })}
                  renderIcon={View}
                  onClick={() => handleViewPendingDocument(doc)}
                />
                <Button
                  kind="danger--ghost"
                  size="sm"
                  hasIconOnly
                  iconDescription={intl.formatMessage({
                    id: "patient.idDoc.remove",
                  })}
                  renderIcon={TrashCan}
                  onClick={() => handleRemovePending(index)}
                />
              </div>
            )}
          </Tile>
        ))}

        {/* Empty state */}
        {savedDocuments.length === 0 && pendingDocuments.length === 0 && (
          <div className="id-documents-empty">
            <DocumentBlank size={32} />
            <p>{intl.formatMessage({ id: "patient.idDoc.empty" })}</p>
          </div>
        )}
      </div>

      {/* View Modal - supports both images and PDFs */}
      <Modal
        open={isViewModalOpen}
        onRequestClose={() => {
          setIsViewModalOpen(false);
          setViewDocUrl(null);
          setViewDocType(null);
        }}
        modalHeading={intl.formatMessage({ id: "patient.idDoc.viewDocument" })}
        passiveModal
        size="lg"
      >
        {viewDocUrl && (
          <div className="id-document-view-container">
            {viewDocType === "pdf" ? (
              <iframe
                src={viewDocUrl}
                title={intl.formatMessage({
                  id: "patient.idDoc.viewDocument",
                })}
                className="id-document-view-pdf"
              />
            ) : (
              <img
                src={viewDocUrl}
                alt={intl.formatMessage({
                  id: "patient.idDoc.viewDocument",
                })}
                className="id-document-view-image"
              />
            )}
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={isEditModalOpen}
        onRequestClose={() => {
          if (operationBusyRef.current) return;
          setIsEditModalOpen(false);
          setSelectedDoc(null);
          setNewDocData(null);
          setNewDocPreview(null);
          setNewDocIsPdf(false);
          setFileError("");
        }}
        modalHeading={intl.formatMessage({
          id: "patient.idDoc.editDocument",
        })}
        primaryButtonDisabled={operationBusy}
        primaryButtonText={intl.formatMessage({
          id: operationUnknown
            ? "patient.maintenance.documents.recheck"
            : "label.button.save",
        })}
        secondaryButtonText={intl.formatMessage({ id: "patient.photo.cancel" })}
        onRequestSubmit={handleSaveEdit}
        size="md"
      >
        <div className="id-documents-upload-form">
          {explainImmediateActions && operationError && (
            <InlineNotification
              kind="error"
              hideCloseButton
              title={intl.formatMessage({ id: "notification.title" })}
              subtitle={intl.formatMessage({
                id: operationUnknown
                  ? "patient.maintenance.documents.failed"
                  : "patient.maintenance.documents.rejected",
              })}
            />
          )}
          <fieldset
            disabled={
              explainImmediateActions && (operationBusy || operationUnknown)
            }
            className="fieldset-reset"
          >
            <Select
              id="edit-doc-category"
              labelText={intl.formatMessage({
                id: "patient.idDoc.documentType",
              })}
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
            >
              {DOCUMENT_CATEGORIES.map((cat) => (
                <SelectItem
                  key={cat.value}
                  value={cat.value}
                  text={intl.formatMessage({ id: cat.labelId })}
                />
              ))}
            </Select>
            <TextArea
              id="edit-doc-description"
              labelText={intl.formatMessage({
                id: "patient.idDoc.description",
              })}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              maxCount={255}
            />

            {/* Replacement image picker. Shows the current document's thumbnail
              until the user drops/selects/captures a new file, then shows the
              chosen replacement. Saving with no replacement keeps the existing
              image (back-compat with metadata-only edit). */}
            {!newDocData ? (
              <div className="id-doc-upload-area">
                <div
                  className={`id-doc-dropzone ${isDragging ? "id-doc-dropzone-active" : ""}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {selectedDoc &&
                  !isPdfData(selectedDoc.thumbnail) &&
                  selectedDoc.thumbnail ? (
                    <img
                      src={selectedDoc.thumbnail}
                      alt={intl.formatMessage({
                        id: "patient.photo.preview.alt",
                      })}
                      className="id-doc-preview-image"
                    />
                  ) : (
                    <CloudUpload size={48} className="id-doc-dropzone-icon" />
                  )}
                  <p className="id-doc-dropzone-title">
                    {intl.formatMessage({ id: "patient.idDoc.dragndrop" })}
                  </p>
                  <p className="id-doc-dropzone-subtitle">
                    {intl.formatMessage({ id: "patient.idDoc.browse" })}
                  </p>
                  <p className="id-doc-dropzone-formats">
                    {intl.formatMessage({ id: "patient.idDoc.formats" })}
                  </p>
                </div>
                <Button
                  kind="tertiary"
                  size="sm"
                  renderIcon={Camera}
                  onClick={() => setIsCameraModalOpen(true)}
                  className="id-doc-camera-btn"
                >
                  {intl.formatMessage({ id: "patient.idDoc.useCamera" })}
                </Button>
              </div>
            ) : (
              <div className="id-doc-file-preview">
                {newDocIsPdf ? (
                  <div className="id-doc-pdf-indicator">
                    <DocumentPdf size={48} />
                    <span>
                      {intl.formatMessage({ id: "patient.idDoc.pdfSelected" })}
                    </span>
                  </div>
                ) : (
                  <img
                    src={newDocPreview}
                    alt={intl.formatMessage({
                      id: "patient.photo.preview.alt",
                    })}
                    className="id-doc-preview-image"
                  />
                )}
                <Button
                  kind="tertiary"
                  size="sm"
                  onClick={() => {
                    setNewDocData(null);
                    setNewDocPreview(null);
                    setNewDocIsPdf(false);
                    setFileError("");
                  }}
                >
                  {intl.formatMessage({ id: "patient.photo.change" })}
                </Button>
              </div>
            )}

            {fileError && <p className="id-doc-error">{fileError}</p>}
          </fieldset>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={isDeleteModalOpen}
        onRequestClose={() => {
          if (operationBusyRef.current) return;
          setIsDeleteModalOpen(false);
          setSelectedDoc(null);
        }}
        modalHeading={intl.formatMessage({
          id: "patient.idDoc.confirmDelete",
        })}
        primaryButtonDisabled={operationBusy}
        primaryButtonText={intl.formatMessage({
          id: operationUnknown
            ? "patient.maintenance.documents.recheck"
            : "patient.idDoc.delete",
        })}
        secondaryButtonText={intl.formatMessage({ id: "patient.photo.cancel" })}
        onRequestSubmit={handleConfirmDelete}
        danger
        size="sm"
      >
        {explainImmediateActions && operationError && (
          <InlineNotification
            kind="error"
            hideCloseButton
            title={intl.formatMessage({ id: "notification.title" })}
            subtitle={intl.formatMessage({
              id: operationUnknown
                ? "patient.maintenance.documents.failed"
                : "patient.maintenance.documents.rejected",
            })}
          />
        )}
        <p>{intl.formatMessage({ id: "patient.idDoc.deleteWarning" })}</p>
      </Modal>
    </div>
  );
};

export default IdentificationDocuments;

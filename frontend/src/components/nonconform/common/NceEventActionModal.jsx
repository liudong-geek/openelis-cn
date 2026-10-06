import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  ComboBox,
  ComposedModal,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextArea,
} from "@carbon/react";
import { useHistory } from "react-router-dom";
import { useIntl } from "react-intl";
import { formatPatientDisplayName } from "../../common/patientDisplayName";
import {
  clearNceOperation,
  newNceRequestId,
  pendingNceOperation,
  readNceReceipt,
  readNceUsers,
  rememberNceOperation,
  submitNceOperation,
} from "./nceWorkspaceRequest";
import { useNceScope } from "./useNceScope";
import "../../admin/AdminModal.css";

export const NceEventActionModal = ({
  row,
  type,
  onClose,
  onSaved,
  onScopeUnavailable = () => {},
}) => {
  const history = useHistory(),
    intl = useIntl(),
    scope = useNceScope(),
    t = (id) => intl.formatMessage({ id });
  const [description, setDescription] = useState(""),
    [selected, setSelected] = useState(null),
    [users, setUsers] = useState([]),
    [search, setSearch] = useState(""),
    [feedback, setFeedback] = useState(null),
    [identityUnavailable, setIdentityUnavailable] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(() =>
      scope.owner ? pendingNceOperation(scope.owner) : null,
    );
  const busyRef = useRef(false),
    start = useRef({ owner: scope.owner, epoch: scope.epoch }),
    selectionEpoch = useRef(0),
    selectedRef = useRef(null);
  const current =
    scope.owner === start.current.owner &&
    scope.epoch === start.current.epoch &&
    !identityUnavailable;
  const ownPending = pending?.operation === type && pending?.eventId === row.id;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    const unload = (e) => {
      if (busyRef.current || pendingRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    const unblock = history.block(() =>
      busyRef.current || pendingRef.current ? false : undefined,
    );
    return () => {
      unblock();
      window.removeEventListener("beforeunload", unload);
    };
  }, [history]);
  const stillCurrent = () =>
    scope.isCurrent(start.current.owner, start.current.epoch);
  useEffect(() => {
    if (type !== "ASSIGN" || !current || pending) return;
    const seq = ++selectionEpoch.current;
    let alive = true;
    scope
      .run((signal, owner) => readNceUsers(search, signal, owner))
      .then((v) => {
        if (alive && seq === selectionEpoch.current && current)
          setUsers(v.users);
      })
      .catch(() => {
        if (alive && seq === selectionEpoch.current)
          setFeedback("nce.workspace.usersFailed");
      });
    return () => {
      alive = false;
    };
  }, [search, type, current]);
  const receive = (receipt) => {
    if (!stillCurrent()) return;
    clearNceOperation(scope.owner, receipt.requestId);
    busyRef.current = false;
    setBusy(false);
    setPending(null);
    onSaved(receipt);
  };
  const verify = async () => {
    if (!stillCurrent() || !ownPending || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const v = await scope.run((signal, owner) =>
        readNceReceipt(
          pending.requestId,
          pending.operation,
          pending.eventId,
          signal,
          owner,
        ),
      );
      if (v.outcome === "APPLIED") receive(v);
      else if (stillCurrent()) setFeedback("nce.workspace.notFoundReceipt");
    } catch (error) {
      if (stillCurrent()) {
        setFeedback("nce.workspace.unknown");
        if (["scope", "unauthenticated", "forbidden"].includes(error.kind)) {
          setIdentityUnavailable(true);
          onScopeUnavailable(error.kind);
        }
      }
    } finally {
      if (stillCurrent()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const submit = async () => {
    if (
      !current ||
      pending ||
      busyRef.current ||
      !(type === "ACKNOWLEDGE"
        ? row.canAcknowledge
        : type === "ADD_NOTE"
          ? row.canAddNote
          : row.canAssign)
    )
      return;
    if (type === "ADD_NOTE" && !description.trim()) {
      setFeedback("nce.note.empty");
      return;
    }
    if (type === "ASSIGN" && !selected) {
      setFeedback("nce.assign.selectUser");
      return;
    }
    const requestId = newNceRequestId(),
      command = {
        requestId,
        currentUserId: JSON.parse(scope.owner)[0],
        lastupdated: row.lastupdated,
        type,
        description: type === "ADD_NOTE" ? description : null,
        assignedTo: type === "ASSIGN" ? selected.id : null,
      };
    try {
      rememberNceOperation(scope.owner, {
        requestId,
        operation: type,
        eventId: row.id,
      });
    } catch {
      setPending(pendingNceOperation(scope.owner));
      setFeedback("nce.workspace.pendingOther");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const v = await scope.run(
        (signal, owner) =>
          submitNceOperation(command, [], type, row.id, signal, owner),
        true,
      );
      receive(v);
    } catch (error) {
      if (!stillCurrent()) return;
      if (error.outcome === "UNKNOWN") {
        setPending({ requestId, operation: type, eventId: row.id });
        setFeedback("nce.workspace.unknown");
        if (["scope", "unauthenticated", "forbidden"].includes(error.kind)) {
          setIdentityUnavailable(true);
          onScopeUnavailable(error.kind);
        }
      } else {
        clearNceOperation(start.current.owner, requestId);
        setFeedback(
          error.kind === "changed"
            ? "nce.workspace.eventChanged"
            : "nce.workspace.notApplied",
        );
        if (
          ["changed", "forbidden", "scope", "unauthenticated"].includes(
            error.kind,
          )
        )
          onSaved(null, error.kind);
      }
    } finally {
      if (stillCurrent()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const close = () => {
    if (busyRef.current || ownPending) {
      setFeedback("nce.workspace.closeBlocked");
      return false;
    }
    onClose();
    return false;
  };
  const title =
    type === "ADD_NOTE"
      ? "nce.modal.addNote"
      : type === "ASSIGN"
        ? "nce.modal.assign"
        : "nce.action.acknowledge";
  return (
    <ComposedModal
      open
      preventCloseOnClickOutside
      className="oe-admin-modal"
      onClose={close}
      aria-label={t(title)}
    >
      <ModalHeader
        title={t(title)}
        label={current ? row.nceNumber : ""}
        closeModal={close}
        iconDescription={t("label.button.close")}
      />
      <ModalBody>
        {feedback && (
          <InlineNotification
            kind={pending ? "warning" : "error"}
            hideCloseButton
            title={t(feedback)}
          />
        )}
        {current ? (
          <>
            {type === "ADD_NOTE" && (
              <TextArea
                id="nce-action-note"
                labelText={t("nce.field.notes")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={busy || !!pending}
                maxLength={10000}
              />
            )}
            {type === "ASSIGN" && (
              <ComboBox
                id="nce-action-user"
                titleText={t("nce.modal.selectUser")}
                items={users}
                itemToString={(v) =>
                  v
                    ? `${formatPatientDisplayName(v, intl.locale) || v.loginName || "—"}${v.loginName ? ` (${v.loginName})` : ""}`
                    : ""
                }
                selectedItem={selected}
                onChange={({ selectedItem }) => {
                  selectedRef.current = selectedItem;
                  setSelected(selectedItem);
                }}
                onInputChange={(v) => {
                  const selectedLabel = selectedRef.current
                    ? `${formatPatientDisplayName(selectedRef.current, intl.locale) || selectedRef.current.loginName || "—"}${selectedRef.current.loginName ? ` (${selectedRef.current.loginName})` : ""}`
                    : "";
                  if (v === selectedLabel) return;
                  selectedRef.current = null;
                  setSearch(v);
                  setSelected(null);
                  setUsers([]);
                }}
                disabled={busy || !!pending}
              />
            )}
            {type === "ACKNOWLEDGE" && (
              <p>{t("nce.workspace.acknowledgeConfirm")}</p>
            )}
          </>
        ) : (
          <p role="alert">{t("nce.workspace.error.unauthenticated")}</p>
        )}
        {ownPending && stillCurrent() && (
          <Button kind="tertiary" disabled={busy} onClick={verify}>
            {t("nce.workspace.checkReceipt")}
          </Button>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          kind="secondary"
          disabled={busy || !!ownPending}
          onClick={close}
        >
          {t("label.button.cancel")}
        </Button>
        <Button
          kind="primary"
          disabled={!current || busy || !!pending}
          onClick={submit}
        >
          {t("label.button.save")}
        </Button>
      </ModalFooter>
    </ComposedModal>
  );
};
export default NceEventActionModal;

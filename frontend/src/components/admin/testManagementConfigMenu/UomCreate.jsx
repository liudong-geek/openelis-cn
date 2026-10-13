import React, { useEffect, useRef, useState } from "react";
import { Redirect, useLocation } from "react-router-dom";
import {
  Accordion,
  AccordionItem,
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  TextInput,
} from "@carbon/react";
import { useIntl } from "react-intl";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";
import "../AdminModal.css";

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
const loadedList = (response) =>
  response &&
  !response.error &&
  Number(response.status || response.statusCode || 0) < 400 &&
  Array.isArray(response.existingUomList) &&
  Array.isArray(response.inactiveUomList) &&
  typeof response.existingEnglishNames === "string";
const allNames = (response) =>
  [
    ...response.existingUomList.map((unit) => unit.value),
    ...response.inactiveUomList.map((unit) => unit.value),
    ...response.existingEnglishNames.split("$"),
  ]
    .map(normalize)
    .filter(Boolean);

/** Retired entry pages open the workspace's one unit editor. */
export function LegacyUomRedirect() {
  const location = useLocation();
  const base = location.pathname.startsWith("/admin/")
    ? "/admin"
    : "/MasterListsPage";
  const params = new URLSearchParams(location.search);
  params.set("openUom", "true");
  return (
    <Redirect
      to={{
        pathname: `${base}/testManagementConfigMenu`,
        search: params.toString(),
        state: location.state,
      }}
    />
  );
}

export default function UomCreate({ open, onClose, onSaved }) {
  const intl = useIntl();
  const [draft, setDraft] = useState("");
  const [reference, setReference] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const mounted = useRef(true);
  const locked = useRef(false);
  const submittedName = useRef("");
  const reading = useRef(false);
  const readVersion = useRef(0);
  const message = (id) => intl.formatMessage({ id });

  const load = () => {
    if (reading.current) return;
    reading.current = true;
    const version = ++readVersion.current;
    setPhase("loading");
    setError("");
    getFromOpenElisServer("/rest/UomCreate", (response) => {
      if (!mounted.current || version !== readVersion.current) return;
      readVersion.current += 1;
      reading.current = false;
      if (!loadedList(response)) {
        setPhase("loadFailed");
        setError("server.error.msg");
        return;
      }
      setReference(response);
      setPhase("ready");
    });
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readVersion.current += 1;
    };
  }, []);
  useEffect(() => {
    if (open && phase === "idle") load();
  }, [open, phase]);

  const verify = () => {
    if (reading.current || !locked.current) return;
    reading.current = true;
    const version = ++readVersion.current;
    setPhase("verifying");
    setError("");
    getFromOpenElisServer("/rest/UomCreate", (response) => {
      if (!mounted.current || version !== readVersion.current) return;
      readVersion.current += 1;
      reading.current = false;
      if (!loadedList(response)) {
        setPhase("verifyFailed");
        setError("admin.basicEdit.update.verificationFailed");
        return;
      }
      setReference(response);
      if (allNames(response).includes(normalize(submittedName.current))) {
        locked.current = false;
        submittedName.current = "";
        setDraft("");
        setPhase("idle");
        onSaved();
      } else {
        // Absence in a read cannot prove that an uncertain POST did not commit.
        setPhase("verifyFailed");
        setError("admin.basicEdit.update.verificationFailed");
      }
    });
  };
  const duplicate = reference && allNames(reference).includes(normalize(draft));
  const save = () => {
    if (locked.current || phase !== "ready" || !draft.trim() || duplicate)
      return;
    locked.current = true;
    submittedName.current = draft.trim();
    setPhase("saving");
    setError("");
    let completed = false;
    postToOpenElisServerFullResponse(
      "/rest/UomCreate",
      JSON.stringify({ uomEnglishName: submittedName.current }),
      (response) => {
        if (!mounted.current || completed) return;
        completed = true;
        // Known request rejections permit correction. Timeout/transport/5xx
        // and the legacy HTTP 200 form remain uncertain until read back.
        if (
          [400, 401, 403, 404, 405, 409, 413, 415, 422, 429].includes(
            response?.status,
          )
        ) {
          locked.current = false;
          submittedName.current = "";
          setPhase("ready");
          setError("server.error.msg");
        } else {
          verify();
        }
      },
    );
  };
  const busy = phase === "saving" || phase === "verifying";
  // Keep the editor's state mounted without leaving a hidden dialog/focus trap.
  if (!open) return null;
  return (
    <Modal
      open={open}
      size="sm"
      className="oe-admin-modal"
      preventCloseOnClickOutside
      selectorPrimaryFocus="#uom-new-name"
      modalHeading={message(
        discard ? "workspace.leave.title" : "configuration.uom.create",
      )}
      closeButtonLabel={message("label.button.close")}
      primaryButtonText={message(
        discard ? "workspace.leave.confirm" : "label.button.save",
      )}
      secondaryButtonText={message(
        discard ? "workspace.leave.cancel" : "label.button.cancel",
      )}
      primaryButtonDisabled={
        !discard && (phase !== "ready" || !draft.trim() || duplicate)
      }
      onRequestSubmit={
        discard
          ? () => {
              setDraft("");
              setDiscard(false);
              setError("");
              onClose();
            }
          : save
      }
      onRequestClose={() => {
        // Hiding preserves the sole pending submission in this mounted editor.
        if (locked.current) {
          onClose();
          return;
        }
        if (discard) setDiscard(false);
        else if (draft) setDiscard(true);
        else onClose();
      }}
    >
      {discard ? (
        message("workspace.leave.helper")
      ) : (
        <>
          {error && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title=""
              subtitle={message(error)}
            />
          )}
          {(phase === "loading" || busy) && <InlineLoading />}
          {(phase === "loadFailed" || phase === "verifyFailed") && (
            <Button
              kind="tertiary"
              onClick={phase === "verifyFailed" ? verify : load}
            >
              {message("button.retry")}
            </Button>
          )}
          <TextInput
            id="uom-new-name"
            labelText={message("uom.new")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={phase !== "ready"}
            invalid={Boolean(duplicate)}
            invalidText={message("uom.notification.duplicate")}
            required
          />
          {reference && (
            <Accordion>
              <AccordionItem title={message("uom.existing")}>
                {reference.existingUomList.map((unit) => unit.value).join(", ")}
              </AccordionItem>
            </Accordion>
          )}
        </>
      )}
    </Modal>
  );
}

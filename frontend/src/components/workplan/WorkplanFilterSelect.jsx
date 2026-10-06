import React, { useContext, useEffect, useRef, useState } from "react";
import { Button, ComboBox, InlineNotification } from "@carbon/react";
import { useIntl } from "react-intl";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { readWorkplanOptions, workplanSessionKey } from "./workplanRequest";

export const shouldFilterWorkplanItem = ({ item, inputValue }) =>
  String(item?.value ?? "")
    .toLocaleLowerCase()
    .includes(String(inputValue ?? "").toLocaleLowerCase());
export default function WorkplanFilterSelect({
  id,
  endpoint,
  queryParameter,
  placeholderId,
  title,
  value,
}) {
  const intl = useIntl();
  const { userSessionDetails } = useContext(UserSessionDetailsContext) || {};
  let owner = null;
  try {
    owner = workplanSessionKey(userSessionDetails);
  } catch {}
  const epoch = useRef(0);
  const controlled = useRef({ phase: "loading", selected: null });
  const valueRef = useRef(value);
  valueRef.current = value;
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [phase, setPhase] = useState("loading");
  const [retry, setRetry] = useState(0);
  const placeholder = intl.formatMessage({ id: placeholderId });
  useEffect(() => {
    const generation = ++epoch.current;
    const controller = new AbortController();
    let ended = false;
    const current = () =>
      !ended && !controller.signal.aborted && epoch.current === generation;
    controlled.current = { phase: "loading", selected: null };
    setItems([]);
    setSelectedItem(null);
    setPhase("loading");
    valueRef.current("", placeholder, { restored: true });
    if (!owner) {
      setPhase("error");
      return () => {
        ended = true;
        controller.abort();
      };
    }
    const requestedId =
      new URLSearchParams(window.location.search).get(queryParameter) || "";
    const failed = () => {
      if (current()) {
        ended = true;
        setPhase("error");
        controller.abort();
      }
    };
    const timer = setTimeout(failed, 20000);
    readWorkplanOptions(endpoint, controller.signal, owner)
      .then((response) => {
        if (!current()) return;
        ended = true;
        const selected =
          response.find((item) => item.id === requestedId) || null;
        controlled.current = { phase: "ready", selected };
        valueRef.current(selected?.id || "", selected?.value || placeholder, {
          restored: true,
        });
        setItems(response);
        setSelectedItem(selected);
        setPhase("ready");
      })
      .catch(failed)
      .finally(() => clearTimeout(timer));
    return () => {
      ended = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [endpoint, queryParameter, placeholder, owner, retry]);
  const handleChange = ({ selectedItem: next }) => {
    if (
      controlled.current.phase !== "ready" ||
      (next?.id || "") === (controlled.current.selected?.id || "")
    )
      return;
    controlled.current.selected = next || null;
    setSelectedItem(next || null);
    valueRef.current(next?.id || "", next?.value || placeholder, {
      restored: false,
    });
  };
  return (
    <>
      <ComboBox
        id={id}
        items={items}
        itemToString={(item) => item?.value || ""}
        selectedItem={selectedItem}
        titleText={title}
        placeholder={placeholder}
        onChange={handleChange}
        shouldFilterItem={shouldFilterWorkplanItem}
        disabled={phase !== "ready"}
      />
      {phase === "error" && (
        <>
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({ id: "workplan.options.failed" })}
          />
          <Button
            kind="tertiary"
            size="sm"
            onClick={() => setRetry((count) => count + 1)}
          >
            {intl.formatMessage({ id: "workplan.options.retry" })}
          </Button>
        </>
      )}
    </>
  );
}

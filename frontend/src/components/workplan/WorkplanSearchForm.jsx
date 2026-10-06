import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Column, Form, Grid } from "@carbon/react";
import { FormattedMessage } from "react-intl";
import { useHistory } from "react-router-dom";
import TestSectionSelectForm from "./TestSectionSelectForm";
import TestSelectForm from "./TestSelectForm";
import PanelSelectForm from "./PanelSelectForm";
import PrioritySelectForm from "./PrioritySelectForm";
import { readWorkplan } from "./workplanRequest";

const FILTER_PARAMETERS = {
  test: "testId",
  panel: "panelId",
  unit: "testSectionId",
  priority: "priority",
};
export default function WorkplanSearchForm({
  type,
  owner,
  pageRequest,
  onSelectionChange,
  onQueryStateChange,
}) {
  const history = useHistory();
  const [selection, setSelection] = useState({ id: "", type, owner });
  const alive = useRef(false);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const epoch = useRef(0);
  const active = useRef(null);
  const callbacks = useRef({});
  callbacks.current = { onSelectionChange, onQueryStateChange };
  const title = (
    <FormattedMessage
      id={
        {
          test: "workplan.test.types",
          panel: "workplan.panel.types",
          unit: "workplan.unit.types",
          priority: "workplan.priority.list",
        }[type] || "workplan.mode.label"
      }
    />
  );
  const selectedValue =
    selection.type === type && selection.owner === owner ? selection.id : "";
  const clearActive = () => {
    epoch.current++;
    if (active.current) {
      clearTimeout(active.current.timer);
      active.current.controller.abort();
      active.current = null;
    }
  };
  const handleSelectedValue = (filterId, label, meta = {}) => {
    clearActive();
    callbacks.current.onSelectionChange?.({
      filterId,
      label,
      restored: meta.restored === true,
    });
    callbacks.current.onQueryStateChange?.({
      phase: filterId && owner ? "loading" : "idle",
      owner,
      epoch: epoch.current,
      query: { type, filterId },
      rows: [],
      paging: null,
      errorCode: null,
    });
    setSelection({ id: filterId, type, owner });
    if (!filterId && !meta.restored)
      history.replace({
        ...history.location,
        search: new URLSearchParams({ type }).toString(),
      });
  };
  useEffect(() => {
    clearActive();
    const generation = epoch.current;
    const query = { type, filterId: selectedValue };
    const publish = (phase, extra = {}) =>
      alive.current &&
      callbacks.current.onQueryStateChange?.({
        phase,
        owner,
        epoch: generation,
        query,
        rows: [],
        paging: null,
        errorCode: null,
        ...extra,
      });
    if (!selectedValue || !owner) {
      publish("idle");
      return clearActive;
    }
    const controller = new AbortController();
    let ended = false;
    const current = () =>
      alive.current &&
      !ended &&
      epoch.current === generation &&
      !controller.signal.aborted;
    publish("loading");
    const params = new URLSearchParams({
      type,
      [FILTER_PARAMETERS[type]]: selectedValue,
      page: String(pageRequest.page),
      pageSize: String(pageRequest.pageSize),
    });
    history.replace({ ...history.location, search: params.toString() });
    const timer = setTimeout(() => {
      if (current()) {
        ended = true;
        controller.abort();
        publish("error", { errorCode: "timeout" });
      }
    }, 20000);
    active.current = { controller, timer };
    readWorkplan(
      query,
      pageRequest.page,
      pageRequest.pageSize,
      controller.signal,
      owner,
    )
      .then((result) => {
        if (current()) {
          ended = true;
          publish("success", result);
        }
      })
      .catch((error) => {
        if (current()) {
          ended = true;
          publish("error", { errorCode: error?.kind || "unavailable" });
        }
      })
      .finally(() => clearTimeout(timer));
    return () => {
      ended = true;
      clearTimeout(timer);
      controller.abort();
      if (epoch.current === generation) epoch.current++;
    };
  }, [type, owner, selectedValue, pageRequest]);
  return (
    <section className="oe-workplan-filter">
      <div className="oe-workplan-filter__heading">
        <h2>
          <FormattedMessage id="label.form.searchby" /> {title}
        </h2>
        <p>
          <FormattedMessage id="workplan.filter.help" />
        </p>
      </div>
      <Grid fullWidth condensed>
        <Column sm={4} md={8} lg={8}>
          <Form
            className="container-form"
            onSubmit={(event) => event.preventDefault()}
          >
            <React.Fragment key={`${type}:${owner}`}>
              {type === "test" && (
                <TestSelectForm title={title} value={handleSelectedValue} />
              )}
              {type === "panel" && (
                <PanelSelectForm title={title} value={handleSelectedValue} />
              )}
              {type === "unit" && (
                <TestSectionSelectForm
                  title={title}
                  value={handleSelectedValue}
                />
              )}
              {type === "priority" && (
                <PrioritySelectForm title={title} value={handleSelectedValue} />
              )}
            </React.Fragment>
          </Form>
        </Column>
      </Grid>
    </section>
  );
}

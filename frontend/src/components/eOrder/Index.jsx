import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useHistory, useLocation } from "react-router-dom";
import { FormattedMessage } from "react-intl";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { ConfigurationContext } from "../layout/Layout";
import PageBreadCrumb from "../common/PageBreadCrumb";
import ProductPageHeader from "../common/ProductPageHeader";
import EOrderSearch from "./EOrderSearch";
import EOrder from "./EOrder";
import {
  buildElectronicOrderParams,
  electronicOrderHistoryOwner,
  electronicOrderSessionKey,
  emptyElectronicOrderDraft,
  forgetElectronicOrderHistoryOwner,
  readElectronicOrderSession,
  readElectronicOrders,
  readEOrderAction,
} from "./electronicOrderQuery";
import "./EOrderSearch.scss";

export { default as EOrderSearch } from "./EOrderSearch";
export { default as EOrder } from "./EOrder";
const breadcrumbs = [{ label: "home.label", link: "/" }];
const blankQuery = (owner, epoch, pageSize = 50) => ({
  phase: "idle",
  kind: "",
  totalResults: 0,
  paging: { currentPage: 1, totalPages: 1, totalResults: 0, pageSize },
  owner,
  epoch,
  pageSize,
});
const EOrderPage = () => {
  const history = useHistory();
  const location = useLocation();
  const { configurationProperties = {} } =
    useContext(ConfigurationContext) || {};
  const { userSessionDetails } = useContext(UserSessionDetailsContext) || {};
  const dateLocale = configurationProperties.DEFAULT_DATE_LOCALE;
  let actor = "";
  try {
    actor = electronicOrderSessionKey(userSessionDetails);
  } catch {
    /* SecureRoute owns initial authentication. */
  }
  const actorRef = useRef(actor);
  actorRef.current = actor;
  const historyOwner = electronicOrderHistoryOwner(actor);
  const [initial] = useState(() => {
    const saved = location.state?.electronicOrderQuery;
    if (actor && saved?.owner === historyOwner) {
      try {
        buildElectronicOrderParams(
          saved.draft,
          dateLocale,
          saved.page,
          saved.pageSize,
        );
        return { ...saved, advanced: saved.advanced === true };
      } catch {
        /* Invalid or foreign history starts a fresh default queue. */
      }
    }
    return {
      draft: emptyElectronicOrderDraft(),
      advanced: false,
      page: 1,
      pageSize: 50,
    };
  });
  const [draft, setDraft] = useState(initial.draft);
  const draftRef = useRef(draft);
  const [advanced, setAdvanced] = useState(initial.advanced);
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const currentPaging = useRef({ page, pageSize });
  currentPaging.current = { page, pageSize };
  const [eOrders, setEOrders] = useState([]);
  const [queryState, setQueryState] = useState(() =>
    blankQuery(actor, 0, initial.pageSize),
  );
  const [statuses, setStatuses] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const eOrderRef = useRef(null);
  const request = useRef({ epoch: 0, controller: null, timer: null });
  const mounted = useRef(true);
  const automatic = useRef(false);
  const searchCurrent = useRef(null);
  const applied = useRef(null);
  const invalidate = () => {
    const state = request.current;
    state.epoch += 1;
    state.controller?.abort();
    clearTimeout(state.timer);
    applied.current = null;
    // Disable actions before Carbon can render a previous row against a cleared collection.
    setQueryState(
      blankQuery(actorRef.current, state.epoch, currentPaging.current.pageSize),
    );
    setEOrders([]);
    setWarnings([]);
    return state.epoch;
  };
  const clearPrivate = () => {
    const epoch = invalidate();
    forgetElectronicOrderHistoryOwner(actorRef.current);
    automatic.current = true;
    const fresh = emptyElectronicOrderDraft();
    draftRef.current = fresh;
    setDraft(fresh);
    setAdvanced(false);
    setStatuses([]);
    setPage(1);
    return epoch;
  };
  const changeDraft = (patch) => {
    const candidate = { ...draftRef.current, ...patch };
    if (JSON.stringify(candidate) === JSON.stringify(draftRef.current)) return;
    invalidate();
    draftRef.current = candidate;
    setDraft(candidate);
    setPage(1);
  };
  const runSearch = async (
    candidate = draftRef.current,
    targetPage = 1,
    size = pageSize,
  ) => {
    const epoch = invalidate();
    const owner = actorRef.current;
    let params;
    try {
      if (!owner) throw { kind: "unauthenticated" };
      params = buildElectronicOrderParams(
        candidate,
        dateLocale,
        targetPage,
        size,
      );
    } catch (error) {
      setQueryState({
        ...blankQuery(owner, epoch, size),
        phase: "error",
        kind: error.kind || "invalid",
      });
      return;
    }
    const controller = new AbortController();
    const key = JSON.stringify(candidate);
    request.current.controller = controller;
    setPage(targetPage);
    setPageSize(size);
    setQueryState({ ...blankQuery(owner, epoch, size), phase: "loading" });
    request.current.timer = setTimeout(() => {
      if (!mounted.current || epoch !== request.current.epoch) return;
      controller.abort();
      setQueryState({
        ...blankQuery(owner, epoch, size),
        phase: "error",
        kind: "unavailable",
      });
    }, 20000);
    try {
      const result = await readElectronicOrders(
        params.toString(),
        controller.signal,
        owner,
      );
      if (
        !mounted.current ||
        controller.signal.aborted ||
        epoch !== request.current.epoch ||
        owner !== actorRef.current ||
        key !== JSON.stringify(draftRef.current)
      )
        return;
      applied.current = { owner, epoch, key, page: targetPage, pageSize: size };
      setEOrders(result.rows);
      setStatuses(result.statuses);
      setWarnings(result.warningCodes);
      setQueryState({
        phase: "success",
        kind: "",
        owner,
        epoch,
        pageSize: size,
        paging: result.paging,
        totalResults: result.paging.totalResults,
      });
    } catch (error) {
      if (
        !mounted.current ||
        controller.signal.aborted ||
        epoch !== request.current.epoch ||
        owner !== actorRef.current
      )
        return;
      const privateFailure = ["scope", "unauthenticated", "forbidden"].includes(
        error.kind,
      );
      const finalEpoch = privateFailure ? clearPrivate() : epoch;
      setQueryState({
        ...blankQuery(actorRef.current, finalEpoch, size),
        phase: "error",
        kind: error.kind || "unavailable",
      });
    } finally {
      if (epoch === request.current.epoch) clearTimeout(request.current.timer);
    }
  };
  searchCurrent.current = runSearch;
  const reset = () => {
    const fresh = emptyElectronicOrderDraft();
    draftRef.current = fresh;
    setDraft(fresh);
    setAdvanced(false);
    void runSearch(fresh, 1, pageSize);
  };
  const currentScope = (scope, signal) =>
    mounted.current &&
    !signal?.aborted &&
    applied.current === scope &&
    scope?.epoch === request.current.epoch &&
    scope?.owner === actorRef.current &&
    scope?.key === JSON.stringify(draftRef.current);
  const verifyCurrentOrder = async (row, signal, owner, scope) => {
    if (!row || owner !== scope?.owner || !currentScope(scope, signal))
      throw { kind: "scope" };
    const params = buildElectronicOrderParams(
      draftRef.current,
      dateLocale,
      scope.page,
      scope.pageSize,
    );
    const result = await readElectronicOrders(params.toString(), signal, owner);
    if (!currentScope(scope, signal)) throw { kind: "scope" };
    const fresh = result.rows.find((item) => item.id === row.id);
    const identityKeys = [
      "electronicOrderId",
      "externalOrderId",
      "statusId",
      "statusCode",
      "patientFirstName",
      "patientLastName",
      "subjectNumber",
      "patientNationalId",
      "passportNumber",
    ];
    if (
      !result.canReceive ||
      !fresh ||
      fresh.canReceive !== true ||
      fresh.statusCode !== "ENTERED" ||
      identityKeys.some((key) => (fresh[key] ?? "") !== (row[key] ?? ""))
    )
      throw { kind: "capability" };
    return fresh;
  };
  const rejectCurrentAction = (error, scope, signal) => {
    if (!currentScope(scope, signal)) return;
    const privateFailure = ["scope", "unauthenticated", "forbidden"].includes(
      error.kind,
    );
    const epoch = privateFailure ? clearPrivate() : invalidate();
    setQueryState({
      ...blankQuery(actorRef.current, epoch, currentPaging.current.pageSize),
      phase: "error",
      kind: error.kind || "unavailable",
    });
  };
  const readGuardedAction = async (url, signal, owner, row) => {
    const scope = applied.current;
    try {
      // This read preflight does not replace authorization in the eventual save transaction.
      await verifyCurrentOrder(row, signal, owner, scope);
    } catch (error) {
      rejectCurrentAction(error, scope, signal);
      throw error;
    }
    // Do not send an allocation request for an obsolete or no longer receivable queue row.
    if (!currentScope(scope, signal)) throw { kind: "scope" };
    try {
      return await readEOrderAction(url, signal, owner);
    } catch (error) {
      if (["scope", "unauthenticated", "forbidden"].includes(error.kind))
        rejectCurrentAction(error, scope, signal);
      throw error;
    }
  };
  const reviewOrder = async (row, labNumber, context = {}) => {
    const scope = applied.current;
    if (
      !scope ||
      scope.epoch !== request.current.epoch ||
      scope.owner !== actorRef.current ||
      !row ||
      row.canReceive !== true ||
      row.statusCode !== "ENTERED"
    )
      return;
    const controller = new AbortController();
    request.current.controller?.abort();
    request.current.controller = controller;
    clearTimeout(request.current.timer);
    const cancelReview = () => controller.abort();
    if (context.signal?.aborted) controller.abort();
    context.signal?.addEventListener("abort", cancelReview, { once: true });
    const reviewTimer = setTimeout(() => {
      if (
        !mounted.current ||
        scope.epoch !== request.current.epoch ||
        scope.owner !== actorRef.current
      )
        return;
      const epoch = invalidate();
      setQueryState({
        ...blankQuery(actorRef.current, epoch, pageSize),
        phase: "error",
        kind: "unavailable",
      });
    }, 20000);
    request.current.timer = reviewTimer;
    try {
      const signal = controller.signal;
      await verifyCurrentOrder(row, signal, scope.owner, scope);
      if (!currentScope(scope, signal)) throw { kind: "scope" };
      const params = new URLSearchParams({ ID: row.externalOrderId });
      if (labNumber) params.set("labNumber", labNumber);
      // Preserve this history entry. Receiving remains an explicit save in the existing form.
      history.push({
        pathname: "/SamplePatientEntry",
        search: `?${params}`,
        state: { electronicOrderReturn: true },
      });
      return true;
    } catch (error) {
      if (
        !mounted.current ||
        context.signal?.aborted ||
        scope.epoch !== request.current.epoch
      )
        return false;
      const privateFailure = ["scope", "unauthenticated", "forbidden"].includes(
        error.kind,
      );
      const epoch = privateFailure ? clearPrivate() : invalidate();
      setQueryState({
        ...blankQuery(actorRef.current, epoch, pageSize),
        phase: "error",
        kind: error.kind || "unavailable",
      });
      return false;
    } finally {
      clearTimeout(reviewTimer);
      context.signal?.removeEventListener("abort", cancelReview);
    }
  };
  useEffect(() => {
    if (!actor || automatic.current) return;
    if ((draftRef.current.startDate || draftRef.current.endDate) && !dateLocale)
      return;
    automatic.current = true;
    void runSearch(draftRef.current, initial.page, initial.pageSize);
  }, [actor, dateLocale]);
  const previousActor = useRef(actor);
  const hasAuthenticated = useRef(Boolean(actor));
  useLayoutEffect(() => {
    if (previousActor.current === actor) return;
    const previous = previousActor.current;
    previousActor.current = actor;
    if (!hasAuthenticated.current && actor) {
      hasAuthenticated.current = true;
      automatic.current = false;
      return;
    }
    forgetElectronicOrderHistoryOwner(previous);
    const epoch = clearPrivate();
    setQueryState({
      ...blankQuery(actor, epoch, pageSize),
      phase: "error",
      kind: "scope",
    });
  }, [actor]);
  useEffect(() => {
    if (!actor) return;
    history.replace({
      ...location,
      state: {
        ...location.state,
        electronicOrderQuery: {
          owner: historyOwner,
          draft,
          advanced,
          page,
          pageSize,
        },
      },
    });
  }, [actor, historyOwner, draft, advanced, page, pageSize]);
  useEffect(() => {
    const change = async (event) => {
      if (
        event.key != null &&
        !["CSRF", "userSessionDetails"].includes(event.key)
      )
        return;
      const owner = actorRef.current;
      const candidate = draftRef.current;
      const savedPaging = currentPaging.current;
      const epoch = invalidate();
      const controller = new AbortController();
      request.current.controller = controller;
      setQueryState({
        ...blankQuery(owner, epoch, savedPaging.pageSize),
        phase: "loading",
      });
      request.current.timer = setTimeout(() => {
        if (!mounted.current || request.current.epoch !== epoch) return;
        controller.abort();
        const finalEpoch = clearPrivate();
        setQueryState({
          ...blankQuery(actorRef.current, finalEpoch, savedPaging.pageSize),
          phase: "error",
          kind: "unavailable",
        });
      }, 20000);
      try {
        const currentOwner = await readElectronicOrderSession(
          controller.signal,
        );
        if (
          !mounted.current ||
          controller.signal.aborted ||
          request.current.epoch !== epoch
        )
          return;
        if (currentOwner !== owner || owner !== actorRef.current)
          throw { kind: "scope" };
        // A credential refresh is not an identity change. Requery current capabilities.
        clearTimeout(request.current.timer);
        void searchCurrent.current(
          candidate,
          savedPaging.page,
          savedPaging.pageSize,
        );
      } catch (error) {
        if (
          !mounted.current ||
          controller.signal.aborted ||
          request.current.epoch !== epoch
        )
          return;
        const finalEpoch = clearPrivate();
        setQueryState({
          ...blankQuery(actorRef.current, finalEpoch, savedPaging.pageSize),
          phase: "error",
          kind: error.kind || "unavailable",
        });
      }
    };
    window.addEventListener("storage", change);
    return () => window.removeEventListener("storage", change);
  }, []);
  useEffect(
    () => () => {
      mounted.current = false;
      request.current.epoch += 1;
      request.current.controller?.abort();
      clearTimeout(request.current.timer);
    },
    [],
  );
  // A render after an actor change must never briefly show the previous actor's rows.
  const visibleState =
    queryState.owner === actor
      ? queryState
      : {
          ...blankQuery(actor, request.current.epoch, pageSize),
          phase: "error",
          kind: "scope",
        };
  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <ProductPageHeader
        titleId="eorder-page-title"
        title={<FormattedMessage id="eorder.header" />}
        subtitle={<FormattedMessage id="eorder.page.subtitle" />}
      />
      <div className="eorder-workspace">
        <EOrderSearch
          draft={draft}
          onChange={changeDraft}
          advanced={advanced}
          onToggleAdvanced={() => setAdvanced((value) => !value)}
          statuses={statuses}
          queryState={visibleState}
          warnings={warnings}
          onSearch={() => runSearch()}
          onReset={reset}
        />
        <EOrder
          eOrderRef={eOrderRef}
          eOrders={visibleState.phase === "success" ? eOrders : []}
          setEOrders={setEOrders}
          queryState={visibleState}
          readAction={readGuardedAction}
          onReviewOrder={reviewOrder}
          onPageChange={({ page: next, pageSize: size }) =>
            runSearch(draftRef.current, size === pageSize ? next : 1, size)
          }
        />
      </div>
    </>
  );
};
export default EOrderPage;

import { useContext, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { NotificationContext } from "../../layout/Layout";
import { NotificationKinds } from "../../common/CustomNotification";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";

const emptyMenu = () => ({ menu: {}, childMenus: [] });
const validMenu = (value, menuId) =>
  value?.menu?.elementId === menuId &&
  typeof value.menu.isActive === "boolean" &&
  Array.isArray(value.childMenus);

export default function useMenuConfiguration(menuId, onEditorStateChange) {
  const intl = useIntl();
  const notification = useContext(NotificationContext);
  const callbacks = useRef({ intl, notification, onEditorStateChange });
  callbacks.current = { intl, notification, onEditorStateChange };
  const [state, setState] = useState({
    menuItem: emptyMenu(),
    phase: "loading",
    dirty: false,
  });
  const latest = useRef(state);
  const owner = useRef({ alive: false, hidden: false, epoch: 0 });

  const publish = (change) => {
    latest.current = { ...latest.current, ...change };
    setState(latest.current);
    callbacks.current.onEditorStateChange?.({
      dirty: latest.current.dirty,
      busy: latest.current.phase === "saving",
    });
  };
  const notify = (messageId, kind) => {
    const current = callbacks.current;
    current.notification.setNotificationVisible(true);
    current.notification.addNotification({
      kind,
      title: current.intl.formatMessage({ id: "notification.title" }),
      message: current.intl.formatMessage({ id: messageId }),
    });
  };
  const isCurrent = (epoch) =>
    owner.current.alive &&
    !owner.current.hidden &&
    owner.current.epoch === epoch;

  useEffect(() => {
    owner.current.alive = true;
    owner.current.hidden = false;
    latest.current = { menuItem: emptyMenu(), phase: "loading", dirty: false };
    let request;
    const load = () => {
      request?.abort();
      const epoch = ++owner.current.epoch;
      request = new AbortController();
      publish({ phase: "loading" });
      getFromOpenElisServer(
        `/rest/admin/menu/${menuId}`,
        (response) => {
          if (!isCurrent(epoch)) return;
          if (!validMenu(response, menuId)) {
            publish({ phase: "error" });
            notify("server.error.msg", NotificationKinds.error);
            return;
          }
          // A restored page must fresh-read without replacing a user's draft
          // or silently advancing its optimistic concurrency version.
          publish({
            phase: "ready",
            ...(!latest.current.dirty ? { menuItem: response } : {}),
          });
        },
        request.signal,
      );
    };
    const hide = () => {
      owner.current.hidden = true;
      owner.current.epoch++;
      request?.abort();
    };
    const show = (event) => {
      if (!event.persisted) return;
      owner.current.hidden = false;
      load();
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    load();
    return () => {
      owner.current.alive = false;
      owner.current.epoch++;
      request?.abort();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
    // Identity alone starts a new lifecycle; callbacks are read from their
    // current ref so parent updates do not discard or reload the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuId]);

  const updateMenuItem = (menuItem) => {
    if (!owner.current.alive || owner.current.hidden) return;
    if (latest.current.phase !== "ready") return;
    publish({ menuItem, dirty: true });
  };
  const submit = (event) => {
    event.preventDefault();
    if (!owner.current.alive || owner.current.hidden) return;
    if (
      latest.current.phase !== "ready" ||
      !validMenu(latest.current.menuItem, menuId)
    )
      return;
    const epoch = ++owner.current.epoch;
    const payload = JSON.stringify(latest.current.menuItem);
    // The ref changes before dispatch, protecting duplicate events in the
    // same render as well as disabled controls after the next render.
    publish({ phase: "saving" });
    postToOpenElisServerFullResponse(
      `/rest/menu/${menuId}`,
      payload,
      async (response) => {
        if (!isCurrent(epoch)) return;
        try {
          if (response?.status !== 200) throw new Error("Menu save rejected");
          const persisted = await response.json();
          if (!isCurrent(epoch)) return;
          if (!validMenu(persisted, menuId))
            throw new Error("Menu save returned another configuration");
          publish({ menuItem: persisted, phase: "ready", dirty: false });
          notify("success.add.edited.msg", NotificationKinds.success);
        } catch {
          if (!isCurrent(epoch)) return;
          publish({ phase: "ready" });
          notify("error.add.edited.msg", NotificationKinds.error);
        }
      },
    );
  };

  return {
    menuItem: state.menuItem,
    phase: state.phase,
    updateMenuItem,
    submit,
  };
}

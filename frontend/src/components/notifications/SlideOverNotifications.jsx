import {
  Renew,
  NotificationFilled,
  Email,
  Filter,
  NotificationOff,
} from "@carbon/icons-react";
import {
  formatTimestamp,
  getFromOpenElisServer,
  getFromOpenElisServerV2,
  postToOpenElisServer,
  putToOpenElisServer,
  urlBase64ToUint8Array,
} from "../utils/Utils";
import Spinner from "../common/Spinner";
import { useIntl } from "react-intl";
import { useContext, useEffect, useRef, useState } from "react";
import { NotificationContext } from "../layout/Layout";
import { AlertDialog } from "../common/CustomNotification";
import NoNotificationSVG from "./NoNotificationSVG";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";

export default function SlideOverNotifications(props) {
  const { userSessionDetails = {} } = useContext(UserSessionDetailsContext);
  const requestOwner =
    props.requestsEnabled !== false &&
    userSessionDetails.authenticated === true &&
    typeof userSessionDetails.userId === "string" &&
    userSessionDetails.userId.trim() &&
    typeof userSessionDetails.sessionId === "string" &&
    userSessionDetails.sessionId.trim()
      ? JSON.stringify([
          userSessionDetails.userId,
          userSessionDetails.sessionId,
        ])
      : null;
  const requestOwnerRef = useRef(requestOwner);
  requestOwnerRef.current = requestOwner;
  const requestScopeRef = useRef(null);
  const isCurrentScope = (scope) =>
    scope &&
    requestScopeRef.current === scope &&
    !scope.controller.signal.aborted &&
    requestOwnerRef.current === scope.owner;

  const intl = useIntl();
  const { notificationVisible, addNotification, setNotificationVisible } =
    useContext(NotificationContext);
  const [iconLoading, setIconLoading] = useState({
    icon: null,
    loading: false,
  });

  const [subscriptionState, setSubscriptionState] = useState(null);

  useEffect(() => {
    setSubscriptionState(null);
    setIconLoading({ icon: null, loading: false });
    requestScopeRef.current = null;
    if (!requestOwner || props.requestSignal?.aborted) return;
    const controller = new AbortController();
    const scope = { owner: requestOwner, controller };
    requestScopeRef.current = scope;
    const cancelRequest = () => controller.abort();
    props.requestSignal?.addEventListener("abort", cancelRequest, {
      once: true,
    });
    const isCurrent = () => isCurrentScope(scope);

    getFromOpenElisServer(
      "/rest/notification/pnconfig",
      async (res) => {
        if (!isCurrent()) return;
        try {
          const reg = await navigator.serviceWorker.ready;
          if (!isCurrent()) return;
          const subscription = await reg.pushManager.getSubscription();
          if (!isCurrent()) return;
          if (!res?.subscribed) {
            setSubscriptionState("NotSubscribed");
          } else if (subscription?.endpoint === res?.pfEndpoint) {
            setSubscriptionState("SubscribedOnThisDevice");
          } else {
            setSubscriptionState("SubscribedOnAnotherDevice");
          }
        } catch {
          // Push is optional; only the account that started this read owns it.
          if (isCurrent()) setSubscriptionState("NotSubscribed");
        }
      },
      controller.signal,
    );
    return () => {
      props.requestSignal?.removeEventListener("abort", cancelRequest);
      controller.abort();
      if (requestScopeRef.current === scope) requestScopeRef.current = null;
    };
  }, [requestOwner, props.requestSignal]);

  const completeSubscription = (scope, status) => {
    if (!isCurrentScope(scope)) return;
    const succeeded = status >= 200 && status < 300;
    setIconLoading({ icon: null, loading: false });
    setSubscriptionState(
      succeeded ? "SubscribedOnThisDevice" : "NotSubscribed",
    );
    addNotification({
      kind: succeeded ? "success" : "warning",
      message: intl.formatMessage({
        id: succeeded
          ? "notification.slideover.button.subscribe.success"
          : "notification.slideover.button.subscribe.fail",
      }),
      title: intl.formatMessage({ id: "notification.title" }),
    });
    setNotificationVisible(true);
  };

  const completeUnsubscribe = (scope, status) => {
    if (!isCurrentScope(scope)) return;
    const succeeded = status >= 200 && status < 300;
    if (succeeded) setSubscriptionState("NotSubscribed");
    addNotification({
      kind: succeeded ? "success" : "warning",
      message: intl.formatMessage({
        id: succeeded
          ? "notification.slideover.button.unsubscribe.success"
          : "notification.slideover.button.unsubscribe.fail",
      }),
      title: intl.formatMessage({ id: "notification.title" }),
    });
    setNotificationVisible(true);
  };

  function unsubscribe() {
    const scope = requestScopeRef.current;
    if (!isCurrentScope(scope)) return;
    try {
      putToOpenElisServer("/rest/notification/unsubscribe", null, (status) => {
        completeUnsubscribe(scope, status);
      });
    } catch {
      completeUnsubscribe(scope, 0);
    }
  }

  async function subscribe() {
    const scope = requestScopeRef.current;
    if (!isCurrentScope(scope)) return;
    setIconLoading({ icon: "NOTIFICATION", loading: true });
    try {
      if (!("serviceWorker" in navigator)) {
        throw new Error("Service workers are not supported in this browser.");
      }
      if (!("PushManager" in window)) {
        throw new Error("Push messaging is not supported in this browser.");
      }
      await navigator.serviceWorker.register("/service-worker.js");
      if (!isCurrentScope(scope)) return;
      const sw = await navigator.serviceWorker.ready;
      if (!isCurrentScope(scope)) return;
      const pbKeyData = await getFromOpenElisServerV2(
        "/rest/notification/public_key",
      );
      if (!isCurrentScope(scope)) return;
      const applicationServerKey = urlBase64ToUint8Array(pbKeyData.publicKey);
      const push = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      if (!isCurrentScope(scope)) return;
      const data = {
        pfEndpoint: push.endpoint,
        pfP256dh: btoa(
          String.fromCharCode.apply(
            null,
            new Uint8Array(push.getKey("p256dh")),
          ),
        ),
        pfAuth: btoa(
          String.fromCharCode.apply(null, new Uint8Array(push.getKey("auth"))),
        ),
      };
      // The callback owns both persistence success and UI feedback. A response
      // from an ended session must never change a later account's state.
      if (!isCurrentScope(scope)) return;
      postToOpenElisServer(
        "/rest/notification/subscribe",
        JSON.stringify(data),
        (status) => {
          completeSubscription(scope, status);
        },
      );
    } catch (error) {
      if (!isCurrentScope(scope)) return;
      console.error(
        "An error occurred during the subscription process:",
        error,
      );
      completeSubscription(scope, 0);
    }
  }

  const {
    loading,
    notifications,
    showRead,
    markNotificationAsRead,
    setShowRead,
    getNotifications,
    markAllNotificationsAsRead,
  } = props;

  const NotificationButton = ({ icon, label, onClick, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: disabled ? "#f0f0f0" : "white",
        padding: "0.5rem 0.8rem",
        fontWeight: "600",
        border: "none",
        borderRadius: "0.3rem",
        transition: "background-color 0.2s ease-in-out",
        color: disabled ? "#a1a1a1" : "#837994",
        whiteSpace: "nowrap",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = "#DFDAE8";
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = "white";
      }}
    >
      {icon}
      <span style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>{label}</span>
    </button>
  );

  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "0.3rem",
        transition: "background-color 0.2s ease-in-out",
        padding: "1rem",
        maxWidth: "600px",
        margin: "0 auto",
      }}
    >
      {notificationVisible === true ? <AlertDialog /> : ""}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <br />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          {[
            {
              icon:
                iconLoading.loading == true && iconLoading.icon == "RELOAD" ? (
                  <Spinner />
                ) : (
                  <Renew />
                ),
              label: intl.formatMessage({
                id: "notification.slideover.button.reload",
              }),
              onClick: async () => {
                setIconLoading({ icon: "RELOAD", loading: true });
                await getNotifications();
                setIconLoading({ icon: null, loading: false });
              },
            },
            {
              icon:
                iconLoading.loading == true &&
                iconLoading.icon == "NOTIFICATION" ? (
                  <Spinner />
                ) : subscriptionState == "SubscribedOnThisDevice" ? (
                  <NotificationOff />
                ) : (
                  <NotificationFilled />
                ),
              label:
                subscriptionState &&
                subscriptionState == "SubscribedOnThisDevice"
                  ? intl.formatMessage({
                      id: "notification.slideover.button.unsubscribe",
                    })
                  : intl.formatMessage({
                      id: "notification.slideover.button.subscribe",
                    }),
              onClick: async () => {
                if (subscriptionState == "SubscribedOnThisDevice") {
                  unsubscribe();
                } else {
                  subscribe();
                }
              },
            },
            {
              icon:
                iconLoading.loading == true && iconLoading.icon == "EMAIL" ? (
                  <Spinner />
                ) : (
                  <Email />
                ),
              label: intl.formatMessage({
                id: "notification.slideover.button.markallasread",
              }),
              onClick: async () => {
                setIconLoading({ icon: "EMAIL", loading: true });
                await markAllNotificationsAsRead();
                setIconLoading({ icon: null, loading: false });
              },
            },
            {
              icon: <Filter />,
              label: showRead
                ? intl.formatMessage({
                    id: "notification.slideover.button.hideread",
                  })
                : intl.formatMessage({
                    id: "notification.slideover.button.showread",
                  }),
              onClick: () => setShowRead(!showRead),
            },
          ].map(({ icon, label, onClick }, index) => (
            <NotificationButton
              key={index}
              icon={icon}
              label={label}
              onClick={onClick}
            />
          ))}
        </div>
      </div>
      <div>
        {loading ? (
          <div style={{ textAlign: "center", marginTop: "1rem" }}>
            <Spinner />
          </div>
        ) : notifications && notifications.length > 0 ? (
          notifications.map((notification, index) => (
            <div
              key={index}
              style={{
                position: "relative",
                marginTop: "0.5rem",
                cursor: "pointer",
                borderRadius: "0.5rem",
                padding: "1.5rem 1rem",
                transition: "all 0.2s ease-in-out",
                backgroundColor: notification.readAt ? "#f3f3f3" : "white",
              }}
              onMouseOver={(e) => {
                if (!notification.readAt)
                  e.currentTarget.style.backgroundColor = "#f3f3f3";
              }}
              onMouseOut={(e) => {
                if (!notification.readAt)
                  e.currentTarget.style.backgroundColor = "white";
              }}
            >
              <div style={{ fontWeight: "500" }}>{notification.message}</div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "0.5rem",
                  color: "#4b5563",
                  fontSize: "0.75rem",
                }}
              >
                <div>{formatTimestamp(notification.createdDate)}</div>
                <NotificationButton
                  icon={<Email />}
                  label={intl.formatMessage({
                    id: "notification.slideover.button.markasread",
                  })}
                  onClick={() => markNotificationAsRead(notification.id)}
                  disabled={!!notification.readAt}
                />
              </div>
            </div>
          ))
        ) : (
          <NoNotificationSVG />
        )}
      </div>
    </div>
  );
}

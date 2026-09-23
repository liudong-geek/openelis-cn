import React, { useState, useEffect, useRef, useContext } from "react";
import { useIntl } from "react-intl";
import { HeaderGlobalAction, HeaderPanel } from "@carbon/react";
import { Close, Help } from "@carbon/icons-react";
import { getFromOpenElisServer } from "../utils/Utils";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";

const LOCAL_USER_MANUAL_URL = "/docs/china-lis-user-manual.html";

const HelpMenu = ({
  helpOpen,
  handlePanelToggle,
  requestsEnabled = true,
  requestSignal,
}) => {
  const { userSessionDetails = {} } = useContext(UserSessionDetailsContext);
  const requestOwner =
    requestsEnabled &&
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
  const intl = useIntl();
  const [helpUrls, setHelpUrls] = useState({
    manual: LOCAL_USER_MANUAL_URL,
    tutorials: "",
    "release-notes": "",
  });
  const [error, setError] = useState(null);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  // Remote help is protected; the bundled manual remains available anonymously.
  useEffect(() => {
    setHelpUrls({
      manual: LOCAL_USER_MANUAL_URL,
      tutorials: "",
      "release-notes": "",
    });
    setError(null);
    if (!requestOwner || requestSignal?.aborted) return;
    const controller = new AbortController();
    const cancelRequest = () => controller.abort();
    requestSignal?.addEventListener("abort", cancelRequest, { once: true });

    getFromOpenElisServer(
      "/rest/properties",
      (properties) => {
        if (
          controller.signal.aborted ||
          requestOwnerRef.current !== requestOwner
        )
          return;

        // The API helper calls the callback with `undefined` when the response is
        // not JSON (e.g., auth redirect HTML). Treat that as "no configured help
        // URLs" rather than crashing the entire app.
        if (!properties || typeof properties !== "object") {
          setHelpUrls({
            manual: LOCAL_USER_MANUAL_URL,
            tutorials: "",
            "release-notes": "",
          });
          setError(new Error("Help URL configuration unavailable"));
          return;
        }

        setHelpUrls({
          // This distribution ships a manual that matches its current China
          // workflow. Keep the generic server URL from replacing that content.
          manual: LOCAL_USER_MANUAL_URL,
          tutorials: properties["org.openelisglobal.help.tutorials.url"] || "",
          "release-notes":
            properties["org.openelisglobal.help.release-notes.url"] || "",
        });
      },
      controller.signal,
    );

    return () => {
      requestSignal?.removeEventListener("abort", cancelRequest);
      controller.abort();
    };
  }, [requestOwner, requestSignal]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const target = event.target;
      if (!helpOpen) return;

      const isClickInsidePanel = panelRef.current?.contains(target);
      const isClickOnHelpButton = buttonRef.current?.contains(target);

      const globalActionClicked =
        document.getElementById("search-Icon")?.contains(target) ||
        document.getElementById("notification-Icon")?.contains(target) ||
        document.getElementById("user-Icon")?.contains(target);

      if (!isClickInsidePanel && !isClickOnHelpButton && !globalActionClicked) {
        handlePanelToggle("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [helpOpen, handlePanelToggle]);

  // Opens the help URL in a new window and then closes the help panel
  const openHelp = (type) => {
    const url = helpUrls[type];
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      handlePanelToggle("");
    }
  };

  return (
    <>
      <HeaderGlobalAction
        ref={buttonRef}
        id="user-Help"
        aria-label={intl.formatMessage({ id: "header.icon.help" })}
        onClick={() => {
          handlePanelToggle(helpOpen ? "" : "help");
        }}
        isActive={helpOpen}
      >
        {!helpOpen ? <Help size={20} /> : <Close size={20} />}
      </HeaderGlobalAction>
      <HeaderPanel
        ref={panelRef}
        aria-label={intl.formatMessage({ id: "header.panel.help" })}
        expanded={helpOpen}
        style={{ background: "#295785", color: "white" }}
      >
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {["manual", "tutorials", "release-notes"].map((type) => (
            <li key={type}>
              <button
                style={{
                  width: "100%",
                  padding: "1rem 1.5rem",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  color: "white",
                }}
                onClick={() => openHelp(type)}
                onMouseEnter={(e) =>
                  (e.target.style.background = "rgba(255,255,255,0.15)")
                }
                onMouseLeave={(e) =>
                  (e.target.style.background = "transparent")
                }
              >
                <Help size={16} />
                {type === "manual"
                  ? intl.formatMessage({ id: "banner.menu.help.usermanual" })
                  : type === "tutorials"
                    ? intl.formatMessage({ id: "banner.menu.help.about" })
                    : intl.formatMessage({ id: "banner.menu.help.contact" })}
              </button>
            </li>
          ))}
        </ul>
      </HeaderPanel>
    </>
  );
};

export default HelpMenu;

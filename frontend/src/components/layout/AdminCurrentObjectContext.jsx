import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { useIntl } from "react-intl";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { navigationMenuOwner } from "./navigationMenuAvailability";

const AdminCurrentObjectContext = createContext({
  currentObject: null,
  publishCurrentObject: (_object) => {},
});

export const useAdminCurrentObject = () =>
  useContext(AdminCurrentObjectContext);

// Reset an editor's drafts and owned reads when its identity changes, including
// a new login for the same user. Language changes only refresh display names;
// they must not clear a draft or an unconfirmed write.
export const useAdminEditorIdentity = (id = undefined) => {
  const { userSessionDetails } = useContext(UserSessionDetailsContext);
  if (userSessionDetails?.authenticated === false) return null;
  return JSON.stringify([navigationMenuOwner(userSessionDetails), id]);
};

export function AdminCurrentObjectProvider({ children }) {
  const { pathname } = useLocation();
  const { userSessionDetails } = useContext(UserSessionDetailsContext);
  const { locale } = useIntl();
  const match = pathname.match(
    /^\/(?:admin|MasterListsPage)\/(TestCatalogEditor|SampleTypeManagement)\/([^/]+)(?:\/|$)/,
  );
  const kind = match?.[1] === "TestCatalogEditor" ? "test" : "sample-type";
  const id = match?.[2];
  const owner = navigationMenuOwner(userSessionDetails);
  const scope =
    owner && id && !["new", "group"].includes(id)
      ? JSON.stringify([owner, locale, kind, id])
      : null;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const [snapshot, setSnapshot] = useState({ scope, object: null });
  // This is one current route object, not a cache. Invalidate synchronously so
  // a return visit or account switch cannot render the previous record.
  if (snapshot.scope !== scope) setSnapshot({ scope, object: null });
  const publishCurrentObject = useCallback(
    (object) => {
      if (!scope || activeScope.current !== scope) return;
      if (object && (object.kind !== kind || String(object.id) !== id)) return;
      setSnapshot({
        scope,
        object: object ? { kind, id, name: object.name || "" } : null,
      });
    },
    [scope, kind, id],
  );

  return (
    <AdminCurrentObjectContext.Provider
      value={{
        currentObject: snapshot.scope === scope ? snapshot.object : null,
        publishCurrentObject,
      }}
    >
      {children}
    </AdminCurrentObjectContext.Provider>
  );
}

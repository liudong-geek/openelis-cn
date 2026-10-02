import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Search,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { Link } from "react-router-dom";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import config from "../../../config.json";
import {
  buildTaskFocusedMenu,
  MENU_PROFILES,
} from "../../layout/taskFocusedMenu";
import { getFromOpenElisServer } from "../../utils/Utils";
import { CHINA_PERMISSION_PROFILES } from "../userManagement/chinaPermissionProfiles";
import ProductPageHeader from "../../common/ProductPageHeader";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import "../AdminListWorkspace.css";
import "./SecurityConfiguration.css";

// Use the same adapter and the same server-authorized input as the actual sidebar.
// A template previews navigation only; it never grants a role or a data scope.
export default function ChinaMenuOverview() {
  const intl = useIntl();
  const { userSessionDetails = {} } = useContext(UserSessionDetailsContext);
  const [source, setSource] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    getFromOpenElisServer("/rest/menu", (response) => {
      if (!active) return;
      setLoading(false);
      setFailed(!Array.isArray(response));
      setSource(Array.isArray(response) ? response : []);
    });
    return () => {
      active = false;
    };
  }, [reload]);
  const profile = CHINA_PERMISSION_PROFILES.find(
    (item) => item.id === profileId,
  );
  const menus = useMemo(
    () =>
      buildTaskFocusedMenu(source, {
        profile: MENU_PROFILES.CHINA,
        optionalModules: config.optionalModules,
        roles: profile
          ? [...profile.globalRoleNames, ...profile.labUnitRoleNames]
          : userSessionDetails.roles,
        userLabRolesMap: profile ? {} : userSessionDetails.userLabRolesMap,
      }),
    [
      source,
      profile,
      userSessionDetails.roles,
      userSessionDetails.userLabRolesMap,
    ],
  );
  const label = (item) =>
    intl.formatMessage({
      id: item.menu.displayKey,
      defaultMessage: item.menu.elementId,
    });
  const rows = menus.flatMap((group) =>
    (group.childMenus?.length ? group.childMenus : [group]).map((entry) => ({
      id: entry.menu.elementId,
      group: label(group),
      name: label(entry),
    })),
  );
  const filtered = rows.filter((row) =>
    `${row.group} ${row.name}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="adminPageContent admin-list-workspace china-menu-overview">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
          {
            label: "sidenav.china.management.menuPermissions",
            link: "/MasterListsPage/globalMenuManagement",
          },
        ]}
      />
      <ProductPageHeader
        title={
          <FormattedMessage id="sidenav.china.management.menuPermissions" />
        }
        subtitle={<FormattedMessage id="security.chinaMenu.subtitle" />}
        actions={
          <Button as={Link} to="/MasterListsPage/userManagement" kind="primary">
            <FormattedMessage id="security.chinaMenu.assign" />
          </Button>
        }
      />
      <section className="admin-list-workspace__surface">
        <div className="admin-list-workspace__filters china-menu-overview__filters">
          <Select
            id="menu-profile-preview"
            aria-label={intl.formatMessage({
              id: "security.chinaMenu.profile",
            })}
            labelText={intl.formatMessage({ id: "security.chinaMenu.profile" })}
            value={profileId}
            onChange={(event) => {
              setProfileId(event.target.value);
              setQuery("");
            }}
          >
            <SelectItem
              value=""
              text={intl.formatMessage({ id: "security.chinaMenu.current" })}
            />
            {CHINA_PERMISSION_PROFILES.map((item) => (
              <SelectItem
                key={item.id}
                value={item.id}
                text={intl.formatMessage({ id: item.labelId })}
              />
            ))}
          </Select>
          <Search
            id="china-menu-query"
            labelText={intl.formatMessage({ id: "security.menu.search" })}
            placeholder={intl.formatMessage({
              id: "security.chinaMenu.search",
            })}
            closeButtonLabelText={intl.formatMessage({
              id: "admin.dashboard.search.clear",
            })}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="china-menu-overview__scope" role="note">
          <strong>
            <FormattedMessage
              id={
                profile
                  ? "security.chinaMenu.preview"
                  : "security.chinaMenu.current"
              }
            />
          </strong>
          <p>
            <FormattedMessage
              id={
                profile
                  ? profile.descriptionId
                  : "security.chinaMenu.current.description"
              }
            />
          </p>
          <p>
            <FormattedMessage id="security.chinaMenu.boundary" />
          </p>
          {profile && (
            <p>
              <FormattedMessage id={profile.boundaryId} />
            </p>
          )}
        </div>
        {loading ? (
          <InlineLoading
            description={intl.formatMessage({ id: "loading.description" })}
          />
        ) : failed ? (
          <div className="china-menu-overview__error">
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={intl.formatMessage({ id: "server.error.msg" })}
            />
            <Button
              kind="secondary"
              onClick={() => setReload((value) => value + 1)}
            >
              <FormattedMessage id="security.chinaMenu.retry" />
            </Button>
          </div>
        ) : (
          <>
            <p className="china-menu-overview__count">
              <FormattedMessage
                id="security.menu.visibleCount"
                values={{ count: filtered.length }}
              />
            </p>
            <Table
              size="md"
              className="admin-list-workspace__table"
              aria-label={intl.formatMessage({
                id: "security.menu.list.title",
              })}
            >
              <TableHead>
                <TableRow>
                  <TableHeader>
                    <FormattedMessage id="security.menu.primary" />
                  </TableHeader>
                  <TableHeader>
                    <FormattedMessage id="security.menu.name" />
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.group}</TableCell>
                    <TableCell>{row.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!filtered.length && (
              <p className="china-menu-overview__count" role="status">
                <FormattedMessage id="security.menu.empty.title" />
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

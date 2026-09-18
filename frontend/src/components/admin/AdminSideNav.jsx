import React, { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useHistory, useLocation } from "react-router-dom";
import { ArrowLeft, Catalog } from "@carbon/icons-react";
import {
  SideNavItems,
  SideNavLink,
  SideNavMenu,
  SideNavMenuItem,
} from "@carbon/react";
import { getFromOpenElisServer } from "../utils/Utils";
import { V1_SECTIONS } from "./testCatalog/sectionConfig";
import { SAMPLE_TYPE_SECTIONS } from "./sampleTypeManagement/sectionConfig";
import { getAdminNavigationDomain } from "./adminNavigation";

const getAdminBasePath = (pathname) =>
  pathname.startsWith("/admin") ? "/admin" : "/MasterListsPage";

const normalizePath = (path) => {
  if (!path) return "";
  const pathOnly = path.split(/[?#]/)[0] || "";
  return pathOnly.length > 1 && pathOnly.endsWith("/")
    ? pathOnly.slice(0, -1)
    : pathOnly;
};

export default function AdminSideNav() {
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation();
  const basePath = getAdminBasePath(location.pathname);
  const currentDomain = getAdminNavigationDomain(location.pathname);

  const editorMatch = location.pathname.match(/\/TestCatalogEditor\/([^/]+)/);
  const editorTestId = editorMatch ? editorMatch[1] : null;
  const sampleTypeEditorMatch = location.pathname.match(
    /\/SampleTypeManagement\/([^/]+)/,
  );
  const editorSampleTypeId = sampleTypeEditorMatch
    ? sampleTypeEditorMatch[1]
    : null;
  const inTestCatalogArea =
    !!editorTestId ||
    !!editorSampleTypeId ||
    /\/(TestCatalogList|SampleTypeManagement)(\/|$)/.test(location.pathname);

  const [editorTest, setEditorTest] = useState({ id: null, name: null });
  useEffect(() => {
    if (!editorTestId || editorTestId === "new" || editorTestId === "group") {
      return undefined;
    }
    const controller = new AbortController();
    getFromOpenElisServer(
      `/rest/test-catalog/tests/${editorTestId}`,
      (response) => {
        setEditorTest({ id: editorTestId, name: response?.name || null });
      },
      controller.signal,
    );
    return () => controller.abort();
  }, [editorTestId]);
  const editorTestName =
    editorTest.id === editorTestId ? editorTest.name : null;

  const [editorSampleType, setEditorSampleType] = useState({
    id: null,
    name: null,
  });
  useEffect(() => {
    if (!editorSampleTypeId || editorSampleTypeId === "new") {
      return undefined;
    }
    const controller = new AbortController();
    getFromOpenElisServer(
      "/rest/sample-types",
      (response) => {
        const sampleTypes =
          response?.success && Array.isArray(response.data)
            ? response.data
            : Array.isArray(response)
              ? response
              : [];
        const selectedSampleType = sampleTypes.find(
          (item) => String(item.id) === String(editorSampleTypeId),
        );
        setEditorSampleType({
          id: editorSampleTypeId,
          name:
            selectedSampleType?.name || selectedSampleType?.description || null,
        });
      },
      controller.signal,
    );
    return () => controller.abort();
  }, [editorSampleTypeId]);
  const editorSampleTypeName =
    editorSampleType.id === editorSampleTypeId ? editorSampleType.name : null;

  const handleNavigation = (targetPath) => (event) => {
    event.preventDefault();
    history.push(targetPath);
  };

  const navProps = (targetPath) => {
    const isActive =
      normalizePath(location.pathname) === normalizePath(targetPath);
    return {
      href: targetPath,
      isActive,
      "aria-current": isActive ? "page" : undefined,
      onClick: handleNavigation(targetPath),
    };
  };

  const backToManagementCenter = (
    <SideNavLink
      data-testid="admin-back-to-management-center"
      renderIcon={ArrowLeft}
      {...navProps(basePath)}
    >
      <FormattedMessage id="admin.navigation.backToCenter" />
    </SideNavLink>
  );

  if (!inTestCatalogArea) {
    const DomainIcon = currentDomain?.icon || Catalog;
    return (
      <SideNavItems className="adminSideNav adminSideNav--compact">
        {backToManagementCenter}
        {currentDomain ? (
          <SideNavMenu
            data-testid="admin-current-domain"
            renderIcon={DomainIcon}
            title={intl.formatMessage({ id: currentDomain.titleId })}
            defaultExpanded
          >
            {currentDomain.links.map(([messageId, route]) => (
              <SideNavMenuItem
                key={route}
                data-cy={`admin-domain-${route}`}
                {...navProps(`${basePath}/${route}`)}
              >
                <FormattedMessage id={messageId} />
              </SideNavMenuItem>
            ))}
          </SideNavMenu>
        ) : (
          <li className="adminSideNav__unknownRoute">
            <FormattedMessage id="admin.navigation.useCenter" />
          </li>
        )}
      </SideNavItems>
    );
  }

  return (
    <SideNavItems className="adminSideNav adminSideNav--compact">
      {backToManagementCenter}
      <SideNavMenu
        key="testcatalog-area"
        data-cy="testCatalogManagement"
        renderIcon={Catalog}
        isActive
        defaultExpanded
        title={intl.formatMessage({ id: "sidenav.label.admin.testCatalog" })}
      >
        <SideNavMenuItem
          data-cy="sampleTypeManagement"
          {...navProps(`${basePath}/SampleTypeManagement`)}
        >
          <FormattedMessage
            id={
              editorSampleTypeId
                ? "sidenav.label.admin.sampleType.backToList"
                : "sidenav.label.admin.sampleTypeManagement"
            }
          />
        </SideNavMenuItem>
        <SideNavMenuItem
          data-cy="testCatalogList"
          {...navProps(`${basePath}/TestCatalogList`)}
        >
          <FormattedMessage
            id={
              editorTestId
                ? "sidenav.label.admin.testCatalog.backToList"
                : "sidenav.label.admin.testmgt.testCatalogEditor"
            }
          />
        </SideNavMenuItem>

        {editorSampleTypeId ? (
          <>
            <li
              id="sampleTypeSectionsHelp"
              data-cy="sampleTypeSectionsContext"
              className="adminSideNav__sectionsContext"
            >
              {editorSampleTypeId === "new" ? (
                <FormattedMessage id="sidenav.label.admin.sampleType.addingNew" />
              ) : editorSampleTypeName ? (
                <FormattedMessage
                  id="sidenav.label.admin.sampleType.editing"
                  values={{ name: editorSampleTypeName }}
                />
              ) : (
                <FormattedMessage id="sidenav.label.admin.sampleType.editingGeneric" />
              )}
            </li>
            {SAMPLE_TYPE_SECTIONS.map((sectionKey) => (
              <SideNavMenuItem
                key={sectionKey}
                data-cy={`sampleType-section-${sectionKey}`}
                {...navProps(
                  `${basePath}/SampleTypeManagement/${editorSampleTypeId}/${sectionKey}`,
                )}
              >
                <FormattedMessage
                  id={`label.sampleType.section.${sectionKey}`}
                />
              </SideNavMenuItem>
            ))}
          </>
        ) : (
          editorTestId && (
            <>
              <li
                id="testCatalogSectionsHelp"
                data-cy="testCatalogSectionsContext"
                className="adminSideNav__sectionsContext"
              >
                {editorTestName ? (
                  <FormattedMessage
                    id="sidenav.label.admin.testCatalog.editing"
                    values={{ name: editorTestName }}
                  />
                ) : (
                  <FormattedMessage id="sidenav.label.admin.testCatalog.editingGeneric" />
                )}
              </li>
              {V1_SECTIONS.map((sectionKey) => (
                <SideNavMenuItem
                  key={sectionKey}
                  data-cy={`section-${sectionKey}`}
                  {...navProps(
                    `${basePath}/TestCatalogEditor/${editorTestId}/${sectionKey}`,
                  )}
                >
                  <FormattedMessage
                    id={`label.testCatalog.section.${sectionKey}`}
                  />
                </SideNavMenuItem>
              ))}
            </>
          )
        )}
      </SideNavMenu>
    </SideNavItems>
  );
}

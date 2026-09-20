import React, { useContext, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Button,
  Checkbox,
  Form,
  Loading,
  Select,
  SelectItem,
  TextInput,
} from "@carbon/react";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../../utils/Utils";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import { useLocation } from "react-router-dom";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import AutoComplete from "../../common/AutoComplete";
import { navigateToInternalPath } from "../../utils/NavigationUtils";
import "../AdminFormWorkspace.css";

interface OrganizationType {
  id: string;
  name: string;
  description: string;
}

interface ParentOrganization {
  id?: string;
  isActive?: string | boolean;
  lastupdated?: string;
  mlsSentinelLabFlag?: string | boolean;
  organizationName?: string;
  organizationTypes?: OrganizationType[];
  shortName?: string;
  parentOrganizationName?: string;
}

interface OrganizationResponse {
  id?: string;
  organizationName?: string;
  shortName?: string;
  isActive?: string | boolean;
  internetAddress?: string;
  selectedTypes?: string[];
  cliaNum?: string;
  streetAddress?: string;
  city?: string;
  orgTypes?: OrganizationType[];
  organization?: ParentOrganization;
  lastupdated?: string;
  commune?: string;
  village?: string;
  department?: string;
  formName?: string;
  formMethod?: string;
  cancelAction?: string;
  submitOnCancel?: boolean;
  cancelMethod?: string;
  mlsSentinelLabFlag?: string | boolean;
  parentOrgName?: string;
  state?: string;
}

interface OrganizationFormData extends ParentOrganization {
  internetAddress?: string;
  selectedTypes?: string[];
  cliaNum?: string;
  streetAddress?: string;
  city?: string;
  organization?: ParentOrganization;
  [key: string]: unknown;
}

interface NotificationContextValue {
  notificationVisible: boolean;
  setNotificationVisible: (visible: boolean) => void;
  addNotification: (notification: {
    kind: string;
    title: string;
    message: string;
  }) => void;
}

interface ConfigurationContextValue {
  configurationProperties: Record<string, string>;
}

const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "organization.main.title",
    link: "/MasterListsPage/organizationManagement",
  },
];

const normalizeActive = (value: unknown) =>
  value === true ||
  ["true", "y", "yes", "1"].includes(String(value).toLowerCase())
    ? "Y"
    : "N";

const organizationTypeMessageIds: Record<
  string,
  { name: string; description: string }
> = {
  testkitvender: {
    name: "organization.editor.type.testKitVendor",
    description: "organization.editor.type.testKitVendor.description",
  },
  "referring clinic": {
    name: "organization.editor.type.referringClinic",
    description: "organization.editor.type.referringClinic.description",
  },
  referrallab: {
    name: "organization.editor.type.referralLab",
    description: "organization.editor.type.referralLab.description",
  },
  "health district": {
    name: "organization.editor.type.healthDistrict",
    description: "organization.editor.type.healthDistrict.description",
  },
  "health region": {
    name: "organization.editor.type.healthRegion",
    description: "organization.editor.type.healthRegion.description",
  },
  "patient referral": {
    name: "organization.editor.type.patientReferral",
    description: "organization.editor.type.patientReferral.description",
  },
  dept: {
    name: "organization.editor.type.department",
    description: "organization.editor.type.department.description",
  },
  "sampling site": {
    name: "organization.editor.type.samplingSite",
    description: "organization.editor.type.samplingSite.description",
  },
};

function OrganizationAddModify() {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext) as unknown as NotificationContextValue;
  const { configurationProperties } = useContext(
    ConfigurationContext,
  ) as unknown as ConfigurationContextValue;
  const intl = useIntl();
  const location = useLocation();
  const ID = new URLSearchParams(location.search).get("ID") || "0";

  const [loading, setLoading] = useState(true);
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [parentOrgList, setParentOrgList] = useState<ParentOrganization[]>([]);
  const [parentOrgId, setParentOrgId] = useState("");
  const [parentOrgPost, setParentOrgPost] = useState<ParentOrganization>({});
  const [orgInfo, setOrgInfo] = useState<OrganizationFormData>({});
  const [orgInfoPost, setOrgInfoPost] = useState<OrganizationFormData>({});
  const [dirty, setDirty] = useState(false);
  const [organizationTypes, setOrganizationTypes] = useState<
    OrganizationType[]
  >([]);

  const cancel = () =>
    navigateToInternalPath("/MasterListsPage/organizationManagement", {
      replace: true,
    });

  useEffect(() => {
    setLoading(true);
    getFromOpenElisServer<OrganizationResponse>(
      `/rest/Organization?ID=${ID}&startingRecNo=1`,
      (response) => {
        if (!response) {
          setLoading(false);
          setNotificationVisible(true);
          addNotification({
            kind: NotificationKinds.error,
            title: intl.formatMessage({ id: "notification.title" }),
            message: intl.formatMessage({ id: "server.error.msg" }),
          });
          return;
        }

        const visibleData: OrganizationFormData = {
          id: response.id,
          organizationName: response.organizationName || "",
          shortName: response.shortName || "",
          isActive: normalizeActive(response.isActive),
          internetAddress: response.internetAddress || "",
          selectedTypes: response.selectedTypes || [],
          cliaNum: response.cliaNum || "",
          streetAddress: response.streetAddress || "",
          city: response.city || "",
          organization: response.organization,
        };
        const postData: OrganizationFormData = {
          ...visibleData,
          lastupdated: response.lastupdated,
          commune: response.commune,
          village: response.village,
          department: response.department,
          formName: response.formName,
          formMethod: response.formMethod,
          cancelAction: response.cancelAction,
          submitOnCancel: response.submitOnCancel,
          cancelMethod: response.cancelMethod,
          mlsSentinelLabFlag: response.mlsSentinelLabFlag,
          parentOrgName: response.parentOrgName,
          state: response.state,
        };

        setOrgInfo(visibleData);
        setOrgInfoPost(postData);
        setSelectedTypeIds(response.selectedTypes || []);
        setOrganizationTypes(response.orgTypes || []);
        setParentOrgPost(response.organization || {});
        setDirty(false);
        setLoading(false);
      },
    );
  }, [ID]);

  useEffect(() => {
    getFromOpenElisServer<ParentOrganization[]>(
      "/rest/displayList/ACTIVE_ORG_LIST",
      (response) => setParentOrgList(response || []),
    );
  }, []);

  useEffect(() => {
    setOrgInfoPost((current) => ({
      ...current,
      selectedTypes: selectedTypeIds,
    }));
  }, [selectedTypeIds]);

  useEffect(() => {
    if (!parentOrgId) return;
    getFromOpenElisServer<ParentOrganization>(
      `/rest/organization/${parentOrgId}`,
      (response) => {
        if (!response) return;
        const selectedParent = {
          id: response.id,
          isActive: response.isActive,
          lastupdated: response.lastupdated,
          mlsSentinelLabFlag: response.mlsSentinelLabFlag,
          organizationName: response.organizationName,
          organizationTypes: response.organizationTypes,
          shortName: response.shortName,
        };
        setParentOrgPost(selectedParent);
        setOrgInfoPost((current) => ({
          ...current,
          organization: selectedParent,
        }));
      },
    );
  }, [parentOrgId]);

  const updateField = (field: string, value: string) => {
    setDirty(true);
    setOrgInfo((current) => ({ ...current, [field]: value }));
    setOrgInfoPost((current) => ({ ...current, [field]: value }));
  };

  const internetAddressInvalid = useMemo(() => {
    const value = String(orgInfo.internetAddress || "").trim();
    return Boolean(
      value &&
      !/^(https?:\/\/)?(www\.)?[\w-]+\.[a-z]{2,}(\.[a-z]{2,})?$/i.test(value),
    );
  }, [orgInfo.internetAddress]);

  const toggleType = (typeId: string) => {
    setDirty(true);
    setSelectedTypeIds((current) =>
      current.includes(typeId)
        ? current.filter((id) => id !== typeId)
        : [...current, typeId],
    );
  };

  const localizedType = (type: OrganizationType) => {
    const messageIds =
      organizationTypeMessageIds[type.name.trim().toLowerCase()];
    return messageIds
      ? {
          name: intl.formatMessage({ id: messageIds.name }),
          description: intl.formatMessage({ id: messageIds.description }),
        }
      : type;
  };

  const saveDisabled =
    !dirty ||
    !String(orgInfo.organizationName || "").trim() ||
    !String(orgInfo.shortName || "").trim() ||
    selectedTypeIds.length === 0 ||
    internetAddressInvalid;

  const submitOrganization = () => {
    if (saveDisabled) return;
    setLoading(true);
    postToOpenElisServerJsonResponse<Record<string, unknown>>(
      `/rest/Organization?ID=${ID}&startingRecNo=1`,
      JSON.stringify(orgInfoPost),
      (response) => {
        setLoading(false);
        const failed =
          !response ||
          Boolean(response.error) ||
          Number(response.status || response.statusCode || 0) >= 400;
        setNotificationVisible(true);
        addNotification({
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({
            id: failed
              ? "server.error.msg"
              : "notification.organization.post.success",
          }),
          kind: failed ? NotificationKinds.error : NotificationKinds.success,
        });
        if (!failed) setTimeout(cancel, 200);
      },
    );
  };

  if (loading) return <Loading />;

  return (
    <>
      {notificationVisible ? <AlertDialog /> : null}
      <div className="adminPageContent admin-form-workspace organization-editor-page">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={
            <FormattedMessage
              id={
                ID === "0"
                  ? "organization.add.title"
                  : "organization.edit.title"
              }
            />
          }
          subtitle={<FormattedMessage id="organization.editor.subtitle" />}
        />

        <Form className="admin-form-workspace__content">
          <section className="admin-form-workspace__card">
            <div className="admin-form-workspace__card-heading">
              <h2>
                <FormattedMessage id="organization.editor.basic.title" />
              </h2>
              <p>
                <FormattedMessage id="organization.editor.basic.subtitle" />
              </p>
            </div>
            <div className="admin-form-workspace__fields">
              <TextInput
                id="org-name"
                labelText={intl.formatMessage({
                  id: "organization.organizationName",
                })}
                value={String(orgInfo.organizationName || "")}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateField("organizationName", event.target.value)
                }
                required
              />
              <TextInput
                id="org-prefix"
                labelText={intl.formatMessage({ id: "organization.short.CI" })}
                value={String(orgInfo.shortName || "")}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateField("shortName", event.target.value)
                }
                maxLength={15}
                required
              />
              <Select
                id="org-active"
                labelText={intl.formatMessage({ id: "organization.isActive" })}
                value={normalizeActive(orgInfo.isActive)}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  updateField("isActive", event.target.value)
                }
              >
                <SelectItem
                  value="Y"
                  text={intl.formatMessage({ id: "label.yes" })}
                />
                <SelectItem
                  value="N"
                  text={intl.formatMessage({ id: "label.no" })}
                />
              </Select>
              <AutoComplete
                name="parentOrgName"
                id="parentOrgName"
                allowFreeText={
                  configurationProperties.restrictFreeTextRefSiteEntry !==
                  "true"
                }
                value={
                  parentOrgPost.organizationName ||
                  parentOrgPost.parentOrganizationName ||
                  ""
                }
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setDirty(true);
                  setParentOrgPost((current) => ({
                    ...current,
                    parentOrganizationName: event.target.value,
                  }));
                }}
                onSelect={(selectedId: string) => {
                  setDirty(true);
                  setParentOrgId(selectedId);
                }}
                label={intl.formatMessage({
                  id: "organization.search.parent.name",
                })}
                suggestions={parentOrgList}
              />
            </div>
          </section>

          <section className="admin-form-workspace__card">
            <div className="admin-form-workspace__card-heading">
              <h2>
                <FormattedMessage id="organization.editor.contact.title" />
              </h2>
              <p>
                <FormattedMessage id="organization.editor.contact.subtitle" />
              </p>
            </div>
            <div className="admin-form-workspace__fields">
              <TextInput
                id="org-internet-address"
                labelText={intl.formatMessage({
                  id: "organization.internetaddress",
                })}
                value={String(orgInfo.internetAddress || "")}
                invalid={internetAddressInvalid}
                invalidText={intl.formatMessage({
                  id: "notification.organization.post.internetAddress",
                })}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateField("internetAddress", event.target.value.trim())
                }
              />
              <TextInput
                id="org-street-address"
                labelText={intl.formatMessage({
                  id: "organization.streetAddress",
                })}
                value={String(orgInfo.streetAddress || "")}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateField("streetAddress", event.target.value)
                }
              />
              <TextInput
                id="org-city"
                labelText={intl.formatMessage({ id: "organization.city" })}
                value={String(orgInfo.city || "")}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateField("city", event.target.value)
                }
              />
              <TextInput
                id="org-clia-number"
                labelText={intl.formatMessage({
                  id: "organization.clia.number",
                })}
                value={String(orgInfo.cliaNum || "")}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateField("cliaNum", event.target.value)
                }
              />
            </div>
          </section>

          <section className="admin-form-workspace__card">
            <div className="admin-form-workspace__card-heading">
              <h2>
                <FormattedMessage id="organization.editor.types.title" />
              </h2>
              <p>
                <FormattedMessage id="organization.editor.types.subtitle" />
              </p>
            </div>
            {organizationTypes.length > 0 ? (
              <div className="admin-form-workspace__checks admin-form-workspace__checks--types">
                {organizationTypes.map((type) => (
                  <div
                    className="admin-form-workspace__check-card"
                    key={type.id}
                  >
                    <Checkbox
                      id={`organization-type-${type.id}`}
                      labelText={localizedType(type).name}
                      checked={selectedTypeIds.includes(type.id)}
                      onChange={() => toggleType(type.id)}
                    />
                    {localizedType(type).description ? (
                      <p>{localizedType(type).description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-form-workspace__empty" role="status">
                <div aria-hidden="true">0</div>
                <h3>
                  <FormattedMessage id="organization.editor.types.empty" />
                </h3>
              </div>
            )}
          </section>

          <div className="admin-form-workspace__actions">
            <Button kind="secondary" type="button" onClick={cancel}>
              <FormattedMessage id="label.button.cancel" />
            </Button>
            <Button
              id="saveButton"
              type="button"
              disabled={saveDisabled}
              onClick={submitOrganization}
            >
              <FormattedMessage id="label.button.save" />
            </Button>
          </div>
        </Form>
      </div>
    </>
  );
}

export default injectIntl(OrganizationAddModify);

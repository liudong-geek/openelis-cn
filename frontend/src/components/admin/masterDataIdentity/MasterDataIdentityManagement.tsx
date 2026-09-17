import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Loading,
  Modal,
  Search,
  Select,
  SelectItem,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import { Edit } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import {
  getFromOpenElisServer,
  putToOpenElisServerFullResponse,
} from "../../utils/Utils";

type EntityType = "TEST" | "SAMPLE_TYPE" | "ORGANIZATION" | "PROVIDER";

interface MasterDataItem {
  entityType: EntityType;
  entityId: string;
  name: string;
  nativeCode?: string;
  nativeActive: boolean;
  canonicalCode?: string;
  sourceSystem?: string;
  validFrom?: string;
  validTo?: string;
  lastUpdated?: string;
  status: "VALID" | "MISSING" | "ATTENTION";
  issues: string[];
}

interface MasterDataResponse {
  items: MasterDataItem[];
  summary: {
    total: number;
    registered: number;
    missingCode: number;
    inactive: number;
    notYetValid: number;
    expired: number;
  };
  entityTypes: Record<EntityType, string>;
}

const EMPTY_RESPONSE: MasterDataResponse = {
  items: [],
  summary: {
    total: 0,
    registered: 0,
    missingCode: 0,
    inactive: 0,
    notYetValid: 0,
    expired: 0,
  },
  entityTypes: {
    TEST: "检验项目",
    SAMPLE_TYPE: "样本类型",
    ORGANIZATION: "机构/科室",
    PROVIDER: "医生",
  },
};

const issueMessage = (issue: string) =>
  `masterData.issue.${issue.toLowerCase()}`;

export default function MasterDataIdentityManagement() {
  const intl = useIntl();
  const [response, setResponse] = useState<MasterDataResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState("");
  const [selected, setSelected] = useState<MasterDataItem | null>(null);
  const [canonicalCode, setCanonicalCode] = useState("");
  const [sourceSystem, setSourceSystem] = useState("LIS");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const load = () => {
    setLoading(true);
    getFromOpenElisServer<MasterDataResponse>(
      "/rest/master-data-identities",
      (data) => {
        setResponse(data || EMPTY_RESPONSE);
        setLoading(false);
      },
    );
  };

  useEffect(load, []);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return response.items.filter((item) => {
      if (entityType && item.entityType !== entityType) return false;
      if (!term) return true;
      return [
        item.entityId,
        item.name,
        item.nativeCode || "",
        item.canonicalCode || "",
        item.sourceSystem || "",
      ].some((value) => value.toLowerCase().includes(term));
    });
  }, [response.items, entityType, query]);

  const openEditor = (item: MasterDataItem) => {
    setSelected(item);
    setCanonicalCode(item.canonicalCode || item.nativeCode || "");
    setSourceSystem(item.sourceSystem || "LIS");
    setValidFrom(item.validFrom || "");
    setValidTo(item.validTo || "");
    setNotice(null);
  };

  const save = () => {
    if (!selected) return;
    setSaving(true);
    putToOpenElisServerFullResponse(
      `/rest/master-data-identities/${selected.entityType}/${selected.entityId}`,
      JSON.stringify({
        canonicalCode,
        sourceSystem,
        validFrom,
        validTo,
        expectedLastUpdated: selected.lastUpdated || null,
      }),
      async (result) => {
        setSaving(false);
        if (result?.ok) {
          setSelected(null);
          setNotice({
            kind: "success",
            message: intl.formatMessage({ id: "masterData.save.success" }),
          });
          load();
          return;
        }
        let message = intl.formatMessage({ id: "masterData.save.error" });
        try {
          const body = await result?.json();
          message = body?.message || message;
        } catch {
          // Keep the localized fallback when the server did not return JSON.
        }
        setNotice({ kind: "error", message });
      },
    );
  };

  const summaryTiles = [
    ["masterData.summary.total", response.summary.total],
    ["masterData.summary.registered", response.summary.registered],
    ["masterData.summary.missing", response.summary.missingCode],
    ["masterData.summary.expired", response.summary.expired],
  ];

  return (
    <main
      className="master-data-identity"
      data-testid="master-data-identity-page"
    >
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
          {
            label: "masterData.title",
            link: "/MasterListsPage/masterDataIdentity",
          },
        ]}
      />
      <h2>
        <FormattedMessage id="masterData.title" />
      </h2>
      <p>
        <FormattedMessage id="masterData.subtitle" />
      </p>

      {notice && (
        <InlineNotification
          kind={notice.kind}
          title={notice.message}
          lowContrast
          onCloseButtonClick={() => setNotice(null)}
        />
      )}

      <Grid style={{ margin: "1rem 0", padding: 0 }}>
        {summaryTiles.map(([messageId, value]) => (
          <Column key={String(messageId)} lg={4} md={2} sm={2}>
            <Tile>
              <div style={{ fontSize: "1.75rem", fontWeight: 600 }}>
                {value}
              </div>
              <FormattedMessage id={String(messageId)} />
            </Tile>
          </Column>
        ))}
      </Grid>

      <Grid style={{ margin: "1rem 0", padding: 0 }}>
        <Column lg={10} md={5} sm={4}>
          <Search
            id="master-data-search"
            labelText={intl.formatMessage({ id: "masterData.search" })}
            placeholder={intl.formatMessage({ id: "masterData.search" })}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Column>
        <Column lg={6} md={3} sm={4}>
          <Select
            id="master-data-type"
            labelText={intl.formatMessage({ id: "masterData.type" })}
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
          >
            <SelectItem
              value=""
              text={intl.formatMessage({ id: "masterData.type.all" })}
            />
            {Object.entries(response.entityTypes).map(([value, text]) => (
              <SelectItem key={value} value={value} text={text} />
            ))}
          </Select>
        </Column>
      </Grid>

      {loading ? (
        <Loading withOverlay={false} />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="cds--data-table cds--data-table--zebra">
            <thead>
              <tr>
                <th>
                  <FormattedMessage id="masterData.type" />
                </th>
                <th>
                  <FormattedMessage id="masterData.name" />
                </th>
                <th>
                  <FormattedMessage id="masterData.nativeCode" />
                </th>
                <th>
                  <FormattedMessage id="masterData.canonicalCode" />
                </th>
                <th>
                  <FormattedMessage id="masterData.sourceSystem" />
                </th>
                <th>
                  <FormattedMessage id="masterData.validity" />
                </th>
                <th>
                  <FormattedMessage id="masterData.status" />
                </th>
                <th>
                  <FormattedMessage id="label.button.action" />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={`${item.entityType}-${item.entityId}`}>
                  <td>{response.entityTypes[item.entityType]}</td>
                  <td>{item.name}</td>
                  <td>{item.nativeCode || "—"}</td>
                  <td>{item.canonicalCode || "—"}</td>
                  <td>{item.sourceSystem || "—"}</td>
                  <td>
                    {item.validFrom || "—"} – {item.validTo || "—"}
                  </td>
                  <td>
                    {item.issues.length === 0 ? (
                      <Tag type="green">
                        <FormattedMessage id="masterData.status.valid" />
                      </Tag>
                    ) : (
                      item.issues.map((issue) => (
                        <Tag
                          key={issue}
                          type={issue === "MISSING_CODE" ? "red" : "warm-gray"}
                        >
                          <FormattedMessage id={issueMessage(issue)} />
                        </Tag>
                      ))
                    )}
                  </td>
                  <td>
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={Edit}
                      onClick={() => openEditor(item)}
                    >
                      <FormattedMessage id="masterData.action.edit" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredItems.length === 0 && (
            <p>
              <FormattedMessage id="masterData.empty" />
            </p>
          )}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        modalHeading={intl.formatMessage({ id: "masterData.editor.title" })}
        primaryButtonText={intl.formatMessage({ id: "label.button.save" })}
        secondaryButtonText={intl.formatMessage({ id: "label.button.cancel" })}
        primaryButtonDisabled={
          saving || !canonicalCode.trim() || !sourceSystem.trim()
        }
        onRequestClose={() => setSelected(null)}
        onRequestSubmit={save}
      >
        <p style={{ marginBottom: "1rem" }}>{selected?.name}</p>
        <TextInput
          id="canonical-code"
          labelText={intl.formatMessage({ id: "masterData.canonicalCode" })}
          value={canonicalCode}
          onChange={(event) =>
            setCanonicalCode(event.target.value.toUpperCase())
          }
        />
        <TextInput
          id="source-system"
          labelText={intl.formatMessage({ id: "masterData.sourceSystem" })}
          value={sourceSystem}
          onChange={(event) =>
            setSourceSystem(event.target.value.toUpperCase())
          }
        />
        <TextInput
          id="valid-from"
          type="date"
          labelText={intl.formatMessage({ id: "masterData.validFrom" })}
          value={validFrom}
          onChange={(event) => setValidFrom(event.target.value)}
        />
        <TextInput
          id="valid-to"
          type="date"
          labelText={intl.formatMessage({ id: "masterData.validTo" })}
          value={validTo}
          onChange={(event) => setValidTo(event.target.value)}
        />
        <p style={{ marginTop: "1rem" }}>
          <FormattedMessage id="masterData.expireHelp" />
        </p>
      </Modal>
    </main>
  );
}

import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  DataTable,
  Dropdown,
  Loading,
  Search,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { getFromOpenElisServer } from "../../utils/Utils";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import "./SecurityConfiguration.css";

export const stripPropertyPrefix = (key = "") =>
  String(key)
    .replace(/^org\.openelisglobal\./, "")
    .replace(/^org\.itech\./, "");

const PROPERTY_CATEGORY_RULES = [
  [/^(login\.|security\.)/, "authentication"],
  [/^(facility\.|facilitylist\.|providerlist\.|requester\.)/, "organization"],
  [/^(fhir\.|fhirstore\.|remote\.|task\.)/, "integration"],
  [/^freezermonitoring\./, "monitoring"],
  [/^(mail\.|notification\.)/, "notification"],
  [/^odoo\./, "finance"],
  [/^paging\./, "paging"],
  [/^(program\.|ocl\.)/, "business"],
  [/^(help\.|configuration\.|menu\.)/, "system"],
];

export const getPropertyCategory = (key) => {
  const shortKey = stripPropertyPrefix(key);
  return (
    PROPERTY_CATEGORY_RULES.find(([pattern]) => pattern.test(shortKey))?.[1] ||
    "other"
  );
};

export const isSensitiveProperty = (key = "") =>
  /(password|passwd|secret|token|credential|private.?key|\.auth$|\.username$)/i.test(
    String(key),
  );

export const getPropertyValueType = (value) => {
  const normalized = String(value ?? "").trim();
  if (/^(true|false)$/i.test(normalized)) return "boolean";
  if (/^-?\d+(\.\d+)?$/.test(normalized)) return "number";
  if (/^(https?:\/\/|jdbc:|\/)/i.test(normalized)) return "address";
  return "text";
};

export const buildPropertyRows = (properties = {}) =>
  Object.keys(properties)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => {
      const rawValue = String(properties[key] ?? "");
      const sensitive = isSensitiveProperty(key);
      return {
        id: key,
        name: stripPropertyPrefix(key),
        category: getPropertyCategory(key),
        value: sensitive && rawValue ? "••••••••" : rawValue,
        configured: rawValue.trim().length > 0,
        sensitive,
        valueType: getPropertyValueType(rawValue),
      };
    });

export const CommonProperties = () => {
  const intl = useIntl();
  const { notificationVisible, addNotification, setNotificationVisible } =
    useContext(NotificationContext);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const categoryItems = useMemo(
    () => [
      "all",
      "authentication",
      "organization",
      "integration",
      "monitoring",
      "notification",
      "finance",
      "paging",
      "business",
      "system",
      "other",
    ],
    [],
  );
  const [selectedCategory, setSelectedCategory] = useState("all");

  useEffect(() => {
    getFromOpenElisServer("/rest/properties", (properties, error) => {
      setLoading(false);
      if (error || !properties || Array.isArray(properties)) {
        setNotificationVisible(true);
        addNotification({
          kind: NotificationKinds.error,
          message: intl.formatMessage({ id: "server.error.msg" }),
          title: intl.formatMessage({ id: "notification.title" }),
        });
        return;
      }
      setRows(buildPropertyRows(properties));
    });
  }, [addNotification, intl, setNotificationVisible]);

  const visibleRows = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (selectedCategory !== "all" && row.category !== selectedCategory) {
        return false;
      }
      if (!query) return true;
      return [row.name, row.value]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [rows, searchText, selectedCategory]);

  const configuredCount = rows.filter((row) => row.configured).length;
  const booleanCount = rows.filter((row) => row.valueType === "boolean").length;
  const categoryLabel = (category) =>
    intl.formatMessage({ id: `security.properties.category.${category}` });

  const renderCell = (cell, row) => {
    const sourceRow = rows.find((item) => item.id === row.id);
    if (cell.info.header === "category") {
      return (
        <TableCell key={cell.id}>
          <Tag type="cool-gray" size="sm">
            {categoryLabel(cell.value)}
          </Tag>
        </TableCell>
      );
    }
    if (cell.info.header === "value") {
      if (sourceRow?.valueType === "boolean") {
        const enabled = String(cell.value).toLowerCase() === "true";
        return (
          <TableCell key={cell.id}>
            <Tag type={enabled ? "green" : "cool-gray"} size="sm">
              {intl.formatMessage({
                id: enabled
                  ? "config.workspace.boolean.true"
                  : "config.workspace.boolean.false",
              })}
            </Tag>
          </TableCell>
        );
      }
      return (
        <TableCell key={cell.id}>
          <span className="security-properties__value" title={cell.value}>
            {cell.value || "—"}
          </span>
        </TableCell>
      );
    }
    if (cell.info.header === "configured") {
      return (
        <TableCell key={cell.id}>
          <Tag type={cell.value ? "green" : "gray"} size="sm">
            {intl.formatMessage({
              id: cell.value
                ? "security.properties.configured"
                : "security.properties.unconfigured",
            })}
          </Tag>
        </TableCell>
      );
    }
    return <TableCell key={cell.id}>{cell.value || "—"}</TableCell>;
  };

  return (
    <>
      {notificationVisible && <AlertDialog />}
      {loading && (
        <Loading
          description={intl.formatMessage({ id: "loading.description" })}
        />
      )}
      <div className="adminPageContent admin-list-workspace security-properties">
        <PageBreadCrumb
          breadcrumbs={[
            { label: "home.label", link: "/" },
            { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
            {
              label: "common.properties.title",
              link: "/MasterListsPage/commonproperties",
            },
          ]}
        />
        <ProductPageHeader
          title={<FormattedMessage id="common.properties.title" />}
          subtitle={<FormattedMessage id="security.properties.subtitle" />}
        />

        <div className="admin-list-workspace__overview">
          <article>
            <span>
              <FormattedMessage id="security.properties.total" />
            </span>
            <strong>{rows.length}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="security.properties.configuredCount" />
            </span>
            <strong>{configuredCount}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="security.properties.booleanCount" />
            </span>
            <strong>{booleanCount}</strong>
          </article>
        </div>

        <section className="admin-list-workspace__surface">
          <header className="admin-list-workspace__section-heading">
            <div>
              <h2>
                <FormattedMessage id="security.properties.list.title" />
              </h2>
              <p>
                <FormattedMessage id="security.properties.list.description" />
              </p>
            </div>
          </header>
          <div className="admin-list-workspace__filters security-properties__filters">
            <Search
              id="security-properties-search"
              labelText={intl.formatMessage({
                id: "security.properties.search",
              })}
              placeholder={intl.formatMessage({
                id: "security.properties.search.placeholder",
              })}
              closeButtonLabelText={intl.formatMessage({
                id: "admin.dashboard.search.clear",
              })}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Dropdown
              id="security-properties-category"
              titleText={intl.formatMessage({
                id: "security.properties.category",
              })}
              label={intl.formatMessage({ id: "security.properties.category" })}
              items={categoryItems}
              selectedItem={selectedCategory}
              itemToString={(item) => (item ? categoryLabel(item) : "")}
              onChange={({ selectedItem }) =>
                setSelectedCategory(selectedItem || "all")
              }
            />
            <p>
              <FormattedMessage
                id="security.properties.visibleCount"
                values={{ count: visibleRows.length }}
              />
            </p>
          </div>

          {visibleRows.length === 0 && !loading ? (
            <div className="admin-list-workspace__empty" role="status">
              <div>0</div>
              <h3>
                <FormattedMessage id="security.properties.empty.title" />
              </h3>
              <p>
                <FormattedMessage id="security.properties.empty.description" />
              </p>
            </div>
          ) : (
            <div className="admin-list-workspace__table-scroll">
              <DataTable
                rows={visibleRows}
                headers={[
                  {
                    key: "name",
                    header: intl.formatMessage({
                      id: "security.properties.name",
                    }),
                  },
                  {
                    key: "category",
                    header: intl.formatMessage({
                      id: "security.properties.category",
                    }),
                  },
                  {
                    key: "value",
                    header: intl.formatMessage({
                      id: "security.properties.currentValue",
                    }),
                  },
                  {
                    key: "configured",
                    header: intl.formatMessage({
                      id: "security.properties.status",
                    }),
                  },
                ]}
              >
                {({
                  rows: renderedRows,
                  headers,
                  getHeaderProps,
                  getTableProps,
                }) => (
                  <TableContainer className="admin-list-workspace__table">
                    <Table {...getTableProps()}>
                      <TableHead>
                        <TableRow>
                          {headers.map((header) => (
                            <TableHeader {...getHeaderProps({ header })}>
                              {header.header}
                            </TableHeader>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {renderedRows.map((row) => (
                          <TableRow key={row.id}>
                            {row.cells.map((cell) => renderCell(cell, row))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </DataTable>
            </div>
          )}
        </section>
      </div>
    </>
  );
};

import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  Link,
  Row,
  Stack,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Pagination,
  Column,
  Checkbox,
} from "@carbon/react";
import { Add } from "@carbon/react/icons";
import { getFromOpenElisServer } from "../utils/Utils";
import SampleType from "../addOrder/SampleType";
import { FormattedMessage, useIntl } from "react-intl";
import {
  OrderCurrentTestsHeaders,
  OrderPossibleTestsHeaders,
} from "../data/orderCurrentTestsHeaders";
const EditSample = (props) => {
  const {
    samples = [],
    setSamples,
    orderFormValues,
    setOrderFormValues,
    error,
    disabled = false,
  } = props;
  const intl = useIntl();
  const nextSampleIndex = useRef(
    Math.max(0, ...samples.map((sample) => Number(sample.index) || 0)),
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [page2, setPage2] = useState(1);
  const [pageSize2, setPageSize2] = useState(5);
  const [rejectSampleReasons, setRejectSampleReasons] = useState([]);
  const existingTests = orderFormValues.existingTests ?? [];
  const possibleTests = orderFormValues.possibleTests ?? [];

  const existingRowId = (test, index) =>
    test.analysisId != null && test.analysisId !== ""
      ? `analysis:${test.analysisId}`
      : `existing-readonly:${index}`;
  const possibleRowId = (test, index) =>
    test.sampleItemId != null &&
    test.sampleItemId !== "" &&
    test.testId != null &&
    test.testId !== ""
      ? `possible:${test.sampleItemId}:${test.testId}`
      : `possible-readonly:${index}`;

  // Render copies: null accession numbers delimit tubes in the save contract.
  const formatTestsObject = (tests, rowId) =>
    tests.map((test, index) => ({
      ...test,
      id: rowId(test, index),
      accessionNumber: test.accessionNumber ?? "",
      sampleType: test.sampleType ?? "",
      collectionDate: test.collectionDate ?? "",
      collectionTime: test.collectionTime ?? "",
    }));

  const handleAddNewSample = () => {
    if (disabled) return;
    const index = ++nextSampleIndex.current;
    setSamples((current) => [
      ...current,
      {
        index,
        sampleRejected: false,
        rejectionReason: "",
        requestReferralEnabled: false,
        referralItems: [],
        sampleTypeId: "",
        sampleXML: null,
        panels: [],
        tests: [],
      },
    ]);
  };

  const handleChecked = (name, checked, rowId) => {
    if (disabled) return;
    const isAddition = name === "add";
    const listName = isAddition ? "possibleTests" : "existingTests";
    const identity = isAddition ? possibleRowId : existingRowId;
    setOrderFormValues((current) => ({
      ...current,
      [listName]: (current[listName] ?? []).map((test, index) => {
        if (identity(test, index) !== rowId) return test;
        const hasIdentity = isAddition
          ? test.sampleItemId != null &&
            test.sampleItemId !== "" &&
            test.testId != null &&
            test.testId !== ""
          : test.analysisId != null && test.analysisId !== "";
        const permitted =
          isAddition ||
          (name === "removeSample"
            ? test.canRemoveSample === true
            : test.canCancel === true);
        return hasIdentity && permitted ? { ...test, [name]: checked } : test;
      }),
    }));
  };

  const sampleTypeObject = (object) => {
    if (disabled) return;
    const fields = {
      sampleTypeId: "sampleTypeId",
      sampleRejected: "sampleRejected",
      rejectionReason: "rejectionReason",
      selectedTests: "tests",
      selectedPanels: "panels",
      sampleXML: "sampleXML",
      requestReferralEnabled: "requestReferralEnabled",
      referralItems: "referralItems",
    };
    const updates = {};
    Object.entries(fields).forEach(([source, target]) => {
      if (Object.prototype.hasOwnProperty.call(object, source)) {
        updates[target] = object[source];
      }
    });
    setSamples((current) =>
      current.map((sample, index) =>
        index === object.sampleObjectIndex ? { ...sample, ...updates } : sample,
      ),
    );
  };

  const handlePageChange = (pageInfo) => {
    if (page != pageInfo.page) {
      setPage(pageInfo.page);
    }

    if (pageSize != pageInfo.pageSize) {
      setPageSize(pageInfo.pageSize);
    }
  };

  const handlePageChange2 = (pageInfo) => {
    if (page2 != pageInfo.page) {
      setPage2(pageInfo.page);
    }

    if (pageSize2 != pageInfo.pageSize) {
      setPageSize2(pageInfo.pageSize);
    }
  };

  const removeSample = (index) => {
    if (disabled) return;
    setSamples((current) =>
      current.filter((_, position) => position !== index),
    );
  };

  useEffect(() => {
    let active = true;
    getFromOpenElisServer("/rest/displayList/REJECTION_REASONS", (response) => {
      if (active) setRejectSampleReasons(response ?? []);
    });
    return () => {
      active = false;
    };
  }, []);

  const renderCell = (cell, row) => {
    const name = cell.info.header;
    const isAddition = name === "add";
    const source = isAddition ? possibleTests : existingTests;
    const identity = isAddition ? possibleRowId : existingRowId;
    const test = source.find(
      (entry, index) => identity(entry, index) === row.id,
    );
    const hasIdentity =
      test &&
      (isAddition
        ? test.sampleItemId != null &&
          test.sampleItemId !== "" &&
          test.testId != null &&
          test.testId !== ""
        : test.analysisId != null && test.analysisId !== "");
    const header = (
      isAddition ? OrderPossibleTestsHeaders : OrderCurrentTestsHeaders
    ).find((entry) => entry.key === name)?.header;
    if (name === "hasResults") {
      return (
        <TableCell key={cell.id}>
          <Checkbox
            id={cell.id}
            labelText={header}
            aria-label={intl.formatMessage({ id: "header.results.recorded" })}
            hideLabel
            checked={Boolean(cell.value)}
            disabled
            readOnly
          />
        </TableCell>
      );
    }
    if (["removeSample", "canceled", "add"].includes(name)) {
      if (name === "removeSample" && !test?.accessionNumber) {
        return <TableCell key={cell.id} />;
      }
      const permitted =
        isAddition ||
        (name === "removeSample"
          ? test?.canRemoveSample === true
          : test?.canCancel === true);
      return (
        <TableCell key={cell.id}>
          <Checkbox
            id={cell.id}
            labelText={header}
            aria-label={intl.formatMessage({
              id: {
                removeSample: "sample.remove.action",
                canceled: "header.cancel.test",
                add: "header.assign",
              }[name],
            })}
            hideLabel
            name={name}
            checked={Boolean(cell.value)}
            disabled={disabled || !hasIdentity || !permitted}
            onChange={(event, data) =>
              handleChecked(name, data.checked, row.id)
            }
          />
        </TableCell>
      );
    }
    // Existing collection timestamps are descriptive, not editable inputs.
    return <TableCell key={cell.id}>{cell.value}</TableCell>;
  };

  return (
    <>
      <div className="orderLegendBody">
        <Column lg={16}>
          <DataTable
            rows={formatTestsObject(existingTests, existingRowId)}
            headers={OrderCurrentTestsHeaders}
            isSortable
          >
            {({ rows, headers, getHeaderProps, getTableProps }) => (
              <TableContainer
                title={intl.formatMessage({ id: "currentests.title" })}
              >
                <Table {...getTableProps()}>
                  <TableHead>
                    <TableRow>
                      {headers.map((header) => (
                        <TableHeader
                          key={header.key}
                          {...getHeaderProps({ header })}
                        >
                          {header.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <>
                      {rows
                        .slice((page - 1) * pageSize)
                        .slice(0, pageSize)
                        .map((row) => (
                          <TableRow key={row.id}>
                            {row.cells.map((cell) => renderCell(cell, row))}
                          </TableRow>
                        ))}
                    </>
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
          <Pagination
            onChange={handlePageChange}
            page={page}
            pageSize={pageSize}
            pageSizes={[5, 10, 20, 30]}
            totalItems={existingTests.length}
            forwardText={intl.formatMessage({ id: "pagination.forward" })}
            backwardText={intl.formatMessage({ id: "pagination.backward" })}
            itemRangeText={(min, max, total) =>
              intl.formatMessage(
                { id: "pagination.item-range" },
                { min: min, max: max, total: total },
              )
            }
            itemsPerPageText={intl.formatMessage({
              id: "pagination.items-per-page",
            })}
            itemText={(min, max) =>
              intl.formatMessage(
                { id: "pagination.item" },
                { min: min, max: max },
              )
            }
            pageNumberText={intl.formatMessage({
              id: "pagination.page-number",
            })}
            pageRangeText={(_current, total) =>
              intl.formatMessage(
                { id: "pagination.page-range" },
                { total: total },
              )
            }
            pageText={(page, pagesUnknown) =>
              intl.formatMessage(
                { id: "pagination.page" },
                { page: pagesUnknown ? "" : page },
              )
            }
          />
        </Column>
      </div>
      <div className="orderLegendBody">
        <Column lg={16}>
          <DataTable
            rows={formatTestsObject(possibleTests, possibleRowId)}
            headers={OrderPossibleTestsHeaders}
            isSortable
          >
            {({ rows, headers, getHeaderProps, getTableProps }) => (
              <TableContainer
                title={intl.formatMessage({ id: "availabletests.title" })}
              >
                <Table {...getTableProps()}>
                  <TableHead>
                    <TableRow>
                      {headers.map((header) => (
                        <TableHeader
                          key={header.key}
                          {...getHeaderProps({ header })}
                        >
                          {header.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <>
                      {rows
                        .slice((page2 - 1) * pageSize2)
                        .slice(0, pageSize2)
                        .map((row) => (
                          <TableRow key={row.id}>
                            {row.cells.map((cell) => renderCell(cell, row))}
                          </TableRow>
                        ))}
                    </>
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
          <Pagination
            onChange={handlePageChange2}
            page={page2}
            pageSize={pageSize2}
            pageSizes={[5, 10, 20, 30]}
            totalItems={possibleTests.length}
            forwardText={intl.formatMessage({ id: "pagination.forward" })}
            backwardText={intl.formatMessage({ id: "pagination.backward" })}
            itemRangeText={(min, max, total) =>
              intl.formatMessage(
                { id: "pagination.item-range" },
                { min: min, max: max, total: total },
              )
            }
            itemsPerPageText={intl.formatMessage({
              id: "pagination.items-per-page",
            })}
            itemText={(min, max) =>
              intl.formatMessage(
                { id: "pagination.item" },
                { min: min, max: max },
              )
            }
            pageNumberText={intl.formatMessage({
              id: "pagination.page-number",
            })}
            pageRangeText={(_current, total) =>
              intl.formatMessage(
                { id: "pagination.page-range" },
                { total: total },
              )
            }
            pageText={(page, pagesUnknown) =>
              intl.formatMessage(
                { id: "pagination.page" },
                { page: pagesUnknown ? "" : page },
              )
            }
          />
        </Column>
      </div>
      <Stack gap={10}>
        <div className="orderLegendBody">
          <h3>
            <FormattedMessage id="order.label.add" />
          </h3>
          {samples.map((sample, i) => {
            return (
              <fieldset
                className="sampleType"
                key={sample.index ?? i}
                disabled={disabled}
              >
                <h4>
                  <FormattedMessage id="label.button.sample" /> {i + 1}
                </h4>
                <Link
                  href="#"
                  aria-disabled={disabled}
                  tabIndex={disabled ? -1 : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    removeSample(i);
                  }}
                >
                  {<FormattedMessage id="sample.remove.action" />}
                </Link>
                <SampleType
                  showLabelControls={false}
                  index={i}
                  rejectSampleReasons={rejectSampleReasons}
                  removeSample={removeSample}
                  sample={{
                    ...sample,
                    tests: (sample.tests ?? []).map((test) => ({ ...test })),
                    panels: (sample.panels ?? []).map((panel) => ({
                      ...panel,
                    })),
                    referralItems: (sample.referralItems ?? []).map(
                      (referral) => ({ ...referral }),
                    ),
                  }}
                  disabled={disabled}
                  setSample={(newSample) => {
                    if (disabled) return;
                    setSamples((current) =>
                      current.map((entry, position) =>
                        position === i ? newSample : entry,
                      ),
                    );
                  }}
                  sampleTypeObject={sampleTypeObject}
                  error={error}
                />
              </fieldset>
            );
          })}
          <Row>
            <div className="inlineDiv">
              <Button onClick={handleAddNewSample} disabled={disabled}>
                {<FormattedMessage id="sample.add.action" />}
                &nbsp; &nbsp;
                <Add size={16} />
              </Button>
            </div>
          </Row>
        </div>
      </Stack>
    </>
  );
};

export default EditSample;

import { React, useState, useEffect, useRef, useContext } from "react";
import { FormattedMessage, useIntl, injectIntl } from "react-intl";
import {
  Grid,
  Column,
  Form,
  Button,
  NumberInput,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  InlineLoading,
  InlineNotification,
} from "@carbon/react";
import CustomLabNumberInput from "../common/CustomLabNumberInput";
import { NotificationContext } from "../layout/Layout";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";
import { getFromOpenElisServer } from "../utils/Utils";
import PostSavePrintDialog from "../barcodeWorkflow/PostSavePrintDialog";
import { buildLabelMakerUrl } from "../barcodeWorkflow/labelMakerUrl";

const ExistingOrder = ({ initialLabNumber = "" }) => {
  const intl = useIntl();
  const componentMounted = useRef(false);
  const requestSequence = useRef(0);
  const [accessionNumber, setAccessionNumber] = useState(initialLabNumber);
  const [orderLabels, setOrderLabels] = useState(1);
  const [patientSearchResults, setPatientSearchResults] = useState(null);
  const [orderResults, setOrderResults] = useState(null);
  const [source, setSource] = useState("about:blank");
  const [renderBarcode, setRenderBarcode] = useState(false);
  const [pending, setPending] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  useEffect(() => {
    componentMounted.current = true;
    return () => {
      componentMounted.current = false;
    };
  }, []);
  const fetchPatientData = (res) => {
    if (componentMounted.current) {
      let patientsResults = res?.patientSearchResults;
      if (!Array.isArray(patientsResults)) {
        setLoadError(true);
        return;
      }
      if (patientsResults.length > 0) {
        setPatientSearchResults(patientsResults[0]);
      } else {
        setPatientSearchResults(null);
        addNotification({
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({ id: "patient.search.nopatient" }),
          kind: NotificationKinds.warning,
        });
        setNotificationVisible(true);
      }
    }
  };

  const fetchOrderData = (res) => {
    if (componentMounted.current) {
      if (!Array.isArray(res?.existingTests)) {
        setLoadError(true);
        return;
      }
      setOrderResults(res.existingTests);
    }
  };

  const handleSearch = (e) => {
    e?.preventDefault();
    if (!accessionNumber.trim()) return;
    const sequence = ++requestSequence.current;
    setPatientSearchResults(null);
    setOrderResults(null);
    setRenderBarcode(false);
    setLoadError(false);
    setPending(2);
    const complete = (callback) => (response) => {
      if (!componentMounted.current || sequence !== requestSequence.current)
        return;
      callback(response);
      setPending((count) => Math.max(0, count - 1));
    };
    getFromOpenElisServer(
      `/rest/patient-search-results?labNumber=${encodeURIComponent(accessionNumber.trim())}`,
      complete(fetchPatientData),
    );
    getFromOpenElisServer(
      `/rest/SampleEdit?accessionNumber=${encodeURIComponent(accessionNumber.trim())}`,
      complete(fetchOrderData),
    );
  };

  useEffect(() => {
    if (initialLabNumber) handleSearch();
  }, [initialLabNumber]);

  const printLabelSets = () => {
    setSource(
      buildLabelMakerUrl({
        labNo: accessionNumber,
        type: "default",
        quantity: "",
      }),
    );
    setRenderBarcode(true);
  };

  const printOrderLabels = () => {
    setSource(
      buildLabelMakerUrl({
        labNo: accessionNumber,
        type: "order",
        quantity: orderLabels,
      }),
    );
    setRenderBarcode(true);
  };

  const printSpecimenLabels = (specimenAccessionNumber) => {
    setSource(
      buildLabelMakerUrl({
        labNo: specimenAccessionNumber,
        type: "specimen",
        quantity: 1,
      }),
    );
    setRenderBarcode(true);
  };

  const buildReprintDialogOptions = () => {
    const options = [
      {
        labelType: "order",
        quantity: orderLabels,
        printUrl: `/LabelMakerServlet?labNo=${accessionNumber}&type=order&quantity=${orderLabels}`,
      },
    ];

    if (orderResults) {
      orderResults
        .filter((result) => result.accessionNumber)
        .forEach((result, index) => {
          options.push({
            labelType: `specimen-${index + 1}`,
            quantity: 1,
            printUrl: `/LabelMakerServlet?labNo=${result.accessionNumber}&type=specimen&quantity=1`,
          });
        });
    }

    return options;
  };

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
      <div className="barcode-card">
        <Form onSubmit={handleSearch}>
          <Grid fullWidth className="barcode-fields-grid">
            <Column lg={16} md={8} sm={4}>
              <h2>
                <FormattedMessage id="sample.entry.search.barcode" />
              </h2>
            </Column>
            <Column lg={10} md={6} sm={4}>
              <CustomLabNumberInput
                placeholder={intl.formatMessage({
                  id: "barcode.scan.placeholder",
                })}
                id="labNumber"
                name="labNumber"
                value={accessionNumber}
                onChange={(e, rawVal) => {
                  requestSequence.current += 1;
                  setPending(0);
                  setPatientSearchResults(null);
                  setOrderResults(null);
                  setRenderBarcode(false);
                  setAccessionNumber(rawVal ? rawVal : e?.target?.value);
                }}
                labelText={<FormattedMessage id="search.label.accession" />}
              />
            </Column>
            <Column lg={6} md={2} sm={4} className="barcode-search-action">
              <Button
                data-cy="submitButton"
                type="submit"
                className="btn"
                disabled={pending > 0 || !accessionNumber.trim()}
              >
                <FormattedMessage id="label.button.search" />
              </Button>
            </Column>
          </Grid>
        </Form>
        {pending > 0 && (
          <InlineLoading
            description={intl.formatMessage({ id: "loading.label" })}
          />
        )}
        {loadError && (
          <InlineNotification
            kind="error"
            hideCloseButton
            title={intl.formatMessage({ id: "order.load.error" })}
          />
        )}
        {patientSearchResults !== null && orderResults !== null && (
          <Grid
            fullWidth
            className="barcode-fields-grid barcode-patient-summary"
          >
            {[
              [
                "patient.label.name",
                `${patientSearchResults.firstName || ""} ${patientSearchResults.lastName || ""}`.trim(),
              ],
              ["patient.dob", patientSearchResults.birthdate],
              ["patient.gender", patientSearchResults.gender],
              ["patient.natioanalid", patientSearchResults.nationalId],
            ].map(([label, value]) => (
              <Column lg={4} md={4} sm={4} key={label}>
                <span>
                  <FormattedMessage id={label} />
                </span>
                <strong>{value || "—"}</strong>
              </Column>
            ))}
          </Grid>
        )}
      </div>
      {patientSearchResults !== null && orderResults !== null && (
        <div className="barcode-card">
          <Grid fullWidth className="barcode-fields-grid">
            <Column lg={16} md={8} sm={4}>
              <h2>
                <FormattedMessage id="barcode.print.section.set" />
              </h2>
            </Column>
            <Column lg={16} md={8} sm={4}>
              <FormattedMessage id="barcode.print.set.instruction" />
            </Column>
            <Column lg={16} md={8} sm={4}>
              <Button onClick={printLabelSets}>
                <FormattedMessage id="barcode.print.set.button" />
              </Button>
            </Column>
          </Grid>
        </div>
      )}
      {patientSearchResults !== null && orderResults !== null && (
        <div className="barcode-card">
          <Grid fullWidth className="barcode-fields-grid">
            <Column lg={16} md={8} sm={4}>
              <h2>
                <FormattedMessage id="barcode.print.reprint.dialog" />
              </h2>
            </Column>
            <Column lg={16} md={8} sm={4}>
              <PostSavePrintDialog
                accessionNumber={accessionNumber}
                printableLabelTypes={buildReprintDialogOptions()}
              />
            </Column>
          </Grid>
        </div>
      )}
      {patientSearchResults !== null && orderResults !== null && (
        <div className="barcode-card">
          <DataTable
            headers={[
              {
                key: "labelType",
                header: intl.formatMessage({
                  id: "barcode.print.table.labelType",
                }),
              },
              {
                key: "accessionNumber",
                header: intl.formatMessage({
                  id: "barcode.print.table.labNumber",
                }),
              },
              {
                key: "additionalInfo",
                header: intl.formatMessage({
                  id: "barcode.print.table.additionalInfo",
                }),
              },
              {
                key: "numberToPrint",
                header: intl.formatMessage({
                  id: "barcode.print.table.quantity",
                }),
              },
              { key: "button", header: "" },
            ]}
            rows={[
              {
                id: "row1",
                labelType: intl.formatMessage({
                  id: "barcode.print.table.orderLabel",
                }),
                accessionNumber: accessionNumber,
                additionalInfo: "",
                numberToPrint: (
                  <NumberInput
                    min={1}
                    max={100}
                    defaultValue={1}
                    onChange={(_, state) => setOrderLabels(state.value)}
                    id="numberToPrint"
                    className="inputText"
                  />
                ),
                button: (
                  <Button onClick={printOrderLabels}>
                    <FormattedMessage id="barcode.print.individual.button" />
                  </Button>
                ),
              },
              ...orderResults
                .filter((result) => result.accessionNumber)
                .map((result, index) => ({
                  id: `row${index + 2}`,
                  labelType: intl.formatMessage({
                    id: "barcode.print.table.specimenLabel",
                  }),
                  accessionNumber: result.accessionNumber,
                  additionalInfo: result.sampleType,
                  numberToPrint: 1,
                  button: (
                    <Button
                      onClick={() =>
                        printSpecimenLabels(result.accessionNumber)
                      }
                    >
                      <FormattedMessage id="barcode.print.individual.button" />
                    </Button>
                  ),
                })),
            ]}
          >
            {({ rows, headers, getHeaderProps, getTableProps }) => (
              <TableContainer>
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
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.cells.map((cell) => (
                          <TableCell key={cell.id}>{cell.value}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        </div>
      )}
      {renderBarcode && (
        <div className="barcode-card">
          <Grid fullWidth className="barcode-fields-grid">
            <Column lg={16} md={8} sm={4}>
              <h2>
                <FormattedMessage id="barcode.header" />
              </h2>
            </Column>
          </Grid>
          <iframe
            title={intl.formatMessage({ id: "barcode.header" })}
            src={source}
            width="100%"
            height="500px"
          />
        </div>
      )}
    </>
  );
};
export default injectIntl(ExistingOrder);

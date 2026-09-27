import { React, useState, useEffect, useRef } from "react";
import { FormattedMessage, useIntl, injectIntl } from "react-intl";
import {
  Checkbox,
  Select,
  SelectItem,
  Grid,
  Column,
  NumberInput,
  Button,
  ComboBox,
  Modal,
} from "@carbon/react";
import { getFromOpenElisServer } from "../utils/Utils";
import { sampleTypeTestsStructure } from "../data/SampleEntryTestsForTypeProvider";
import { Printer } from "@carbon/icons-react";
import { buildLabelMakerUrl } from "../barcodeWorkflow/labelMakerUrl";

const PrePrint = () => {
  const intl = useIntl();
  const componentMounted = useRef(false);
  const [sampleTypes, setSampleTypes] = useState([]);
  const [selectedSampleTypeId, setSelectedSampleTypeId] = useState(null);

  const [sampleTypeTests, setSampleTypeTests] = useState(
    sampleTypeTestsStructure,
  );
  const [selectedTests, setSelectedTests] = useState([]);
  const [selectedPanels, setSelectedPanels] = useState([]);

  const [labelSets, setLabelSets] = useState(1);
  const [orderLabelsPerSet, setOrderLabelsPerSet] = useState(1);
  const [specimenLabelsPerSet, setSpecimenLabelsPerSet] = useState(1);
  const [facilityId, setFacilityId] = useState("");

  const [source, setSource] = useState("about:blank");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [siteNames, setSiteNames] = useState([]);

  const getSiteList = (response) => {
    if (componentMounted.current) {
      setSiteNames(response);
    }
  };

  useEffect(() => {
    componentMounted.current = true;
    getFromOpenElisServer(
      "/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC",
      getSiteList,
    );
    return () => {
      componentMounted.current = false;
    };
  }, []);

  function findTestById(testId) {
    return sampleTypeTests.tests.find((test) => test.id === testId);
  }
  function findTestIndex(testId) {
    return sampleTypeTests.tests.findIndex((test) => test.id === testId);
  }

  function updateSampleTypeTests(test, userBenchChoice = false) {
    let tests = [...sampleTypeTests.tests];
    let testIndex = findTestIndex(test.id);
    tests[testIndex].userBenchChoice = userBenchChoice;
    setSampleTypeTests({ ...sampleTypeTests, tests: tests });
  }

  const triggerPanelCheckBoxChange = (isChecked, testIds) => {
    const testIdsList = testIds.split(",").map((id) => id.trim());
    testIdsList.map((testId) => {
      let testIndex = findTestIndex(testId);
      let test = findTestById(testId);
      if (testIndex !== -1) {
        updateSampleTypeTests(test, isChecked);
        if (isChecked) {
          setSelectedTests((prevState) => {
            return [...prevState, { id: test.id, name: test.name }];
          });
        } else {
          removeTestFromSelectedTests(test);
        }
      }
    });
  };

  const addPanelToSelectedPanels = (panel) => {
    setSelectedPanels([
      ...selectedPanels,
      { id: panel.id, name: panel.name, testIds: panel.testIds },
    ]);
    triggerPanelCheckBoxChange(true, panel.testIds);
  };

  const removePanelFromSelectedPanels = (panel) => {
    let index = 0;
    for (let i in selectedPanels) {
      if (selectedPanels[i].id === panel.id) {
        triggerPanelCheckBoxChange(false, selectedPanels[i].testIds);
        const newPanels = selectedPanels;
        newPanels.splice(index, 1);
        setSelectedPanels([...newPanels]);
        break;
      }
      index++;
    }
  };

  const removeTestFromSelectedTests = (test) => {
    let index = 0;
    for (let i in selectedTests) {
      if (selectedTests[i].id === test.id) {
        const newTests = selectedTests;
        newTests.splice(index, 1);
        setSelectedTests([...newTests]);
        break;
      }
      index++;
    }
  };

  function addTestToSelectedTests(test) {
    setSelectedTests([...selectedTests, { id: test.id, name: test.name }]);
  }
  const handlePanelCheckbox = (checked, panel) => {
    if (checked) {
      addPanelToSelectedPanels(panel);
    } else {
      removePanelFromSelectedPanels(panel);
    }
  };
  const handleTestCheckbox = (checked, test) => {
    if (checked) {
      addTestToSelectedTests(test);
    } else {
      removeTestFromSelectedTests(test);
    }
  };
  const fetchSamplesTypes = (res) => {
    setSampleTypes(res);
  };

  const fetchSampleTypeTests = (res) => {
    setSampleTypeTests(res);
  };

  const handleFetchSampleTypeTests = (e) => {
    const { value } = e.target;
    setSelectedSampleTypeId(value);
    setSelectedTests([]);
    setSelectedPanels([]);
  };

  const prePrintLabels = () => {
    const selectedTestIds = selectedTests
      .map((selectedTest) => selectedTest.id)
      .join(",");
    const params = new URLSearchParams({
      prePrinting: "true",
      numSetsOfLabels: labelSets,
      numOrderLabelsPerSet: orderLabelsPerSet,
      numSpecimenLabelsPerSet: specimenLabelsPerSet,
      facilityName: facilityId,
      testIds: selectedTestIds,
    });
    setSource(buildLabelMakerUrl(params));
    setPreviewOpen(true);
  };

  useEffect(() => {
    getFromOpenElisServer("/rest/user-sample-types", fetchSamplesTypes);
  }, []);

  useEffect(() => {
    if (selectedSampleTypeId !== null) {
      getFromOpenElisServer(
        `/rest/sample-type-tests?sampleType=${selectedSampleTypeId}`,
        fetchSampleTypeTests,
      );
    }
  }, [selectedSampleTypeId]);

  const totalLabels =
    Number(labelSets) *
    (Number(orderLabelsPerSet) + Number(specimenLabelsPerSet));
  const validQuantities = [
    labelSets,
    orderLabelsPerSet,
    specimenLabelsPerSet,
  ].every(
    (value) =>
      Number.isInteger(Number(value)) &&
      Number(value) >= 1 &&
      Number(value) <= 100,
  );

  return (
    <>
      <div className="barcode-card barcode-preprint">
        <Grid fullWidth className="barcode-form-grid">
          <Column lg={8} md={4} sm={4} className="barcode-form-section">
            <h2>
              <FormattedMessage id="barcode.print.preprint" />
            </h2>
            <p className="barcode-section-help">
              <FormattedMessage id="barcode.workspace.quantityHelp" />
            </p>
            <Grid fullWidth className="barcode-fields-grid">
              <Column lg={8} md={4} sm={4}>
                <NumberInput
                  min={1}
                  max={100}
                  value={labelSets}
                  onChange={(_, state) => setLabelSets(state.value)}
                  label={intl.formatMessage({ id: "label.barcode.labelsets" })}
                  id="labelSets"
                />
              </Column>
              <Column lg={4} md={4} sm={4}>
                <NumberInput
                  min={1}
                  max={100}
                  value={orderLabelsPerSet}
                  onChange={(_, state) => setOrderLabelsPerSet(state.value)}
                  label={intl.formatMessage({ id: "label.barcode.orderlabel" })}
                  id="orderLabelsPerSet"
                />
              </Column>
              <Column lg={4} md={4} sm={4}>
                <NumberInput
                  min={1}
                  max={100}
                  value={specimenLabelsPerSet}
                  onChange={(_, state) => setSpecimenLabelsPerSet(state.value)}
                  label={intl.formatMessage({
                    id: "label.barcode.specimenlabel",
                  })}
                  id="specimenLabelsPerSet"
                />
              </Column>
              <Column lg={8} md={4} sm={4}>
                <ComboBox
                  id="siteName"
                  titleText={intl.formatMessage({
                    id: "barcode.workspace.facility",
                  })}
                  placeholder={intl.formatMessage({
                    id: "barcode.workspace.facilityPlaceholder",
                  })}
                  items={siteNames || []}
                  itemToString={(item) => item?.value || ""}
                  selectedItem={
                    (siteNames || []).find((site) => site.id === facilityId) ||
                    null
                  }
                  onChange={({ selectedItem }) =>
                    setFacilityId(selectedItem?.id || "")
                  }
                  shouldFilterItem={({ item, inputValue }) =>
                    (item?.value || "")
                      .toLowerCase()
                      .includes((inputValue || "").toLowerCase())
                  }
                />
              </Column>
            </Grid>
          </Column>
          <Column lg={8} md={4} sm={4} className="barcode-form-section">
            <h2>
              <FormattedMessage id="barcode.workspace.specimenTests" />
            </h2>
            <p className="barcode-section-help">
              <FormattedMessage id="barcode.workspace.sampleHelp" />
            </p>
            <Select
              id="selectSampleType"
              labelText={intl.formatMessage({ id: "sample.type" })}
              value={selectedSampleTypeId || ""}
              onChange={handleFetchSampleTypeTests}
            >
              <SelectItem
                text={intl.formatMessage({ id: "sample.select.type" })}
                value=""
                disabled
              />
              {sampleTypes?.map((sampleType) => (
                <SelectItem
                  text={sampleType.value}
                  value={sampleType.id}
                  key={sampleType.id}
                />
              ))}
            </Select>
            {!selectedSampleTypeId && (
              <div className="barcode-selection-hint">
                <FormattedMessage id="barcode.workspace.sampleHelp" />
              </div>
            )}
            {selectedSampleTypeId && (
              <>
                {sampleTypeTests.panels?.some((panel) => panel.name) && (
                  <fieldset className="barcode-checklist">
                    <legend>
                      <FormattedMessage id="sample.entry.panels" />
                    </legend>
                    <div className="barcode-checklist__items">
                      {sampleTypeTests.panels
                        .filter((panel) => panel.name)
                        .map((panel) => (
                          <Checkbox
                            onChange={(_event, { checked }) =>
                              handlePanelCheckbox(checked, panel)
                            }
                            labelText={panel.name}
                            id={"panel_" + panel.id}
                            key={panel.id}
                            checked={selectedPanels.some(
                              (item) => item.id === panel.id,
                            )}
                          />
                        ))}
                    </div>
                  </fieldset>
                )}
                <fieldset className="barcode-checklist">
                  <legend>
                    <FormattedMessage id="sample.entry.available.tests" />
                  </legend>
                  <div className="barcode-checklist__items">
                    {sampleTypeTests.tests
                      ?.filter((test) => test.name)
                      .map((test) => (
                        <Checkbox
                          onChange={(_event, { checked }) =>
                            handleTestCheckbox(checked, test)
                          }
                          labelText={test.name}
                          id={"test_" + test.id}
                          key={test.id}
                          checked={selectedTests.some(
                            (item) => item.id === test.id,
                          )}
                        />
                      ))}
                  </div>
                </fieldset>
              </>
            )}
          </Column>
        </Grid>
        <div className="barcode-preprint__footer">
          <div className="barcode-print-total" role="status" aria-live="polite">
            <span>
              <FormattedMessage id="label.barcode.totallabel" />
            </span>
            <strong>{validQuantities ? totalLabels : "—"}</strong>
          </div>
          <Button
            data-cy="pre-Print"
            renderIcon={Printer}
            disabled={!validQuantities || selectedTests.length === 0}
            onClick={prePrintLabels}
          >
            <FormattedMessage id="barcode.print.preprint.button" />
          </Button>
        </div>
        <p className="barcode-print-note">
          <FormattedMessage id="barcode.print.preprint.note" />
        </p>
      </div>
      <Modal
        open={previewOpen}
        passiveModal
        size="lg"
        className="barcode-preview-modal"
        modalHeading={intl.formatMessage({ id: "barcode.header" })}
        closeButtonLabel={intl.formatMessage({ id: "button.close" })}
        onRequestClose={() => {
          setPreviewOpen(false);
          setSource("about:blank");
        }}
      >
        {previewOpen && (
          <iframe
            className="barcode-preview-modal__frame"
            title={intl.formatMessage({ id: "barcode.header" })}
            src={source}
          />
        )}
      </Modal>
    </>
  );
};
export default injectIntl(PrePrint);

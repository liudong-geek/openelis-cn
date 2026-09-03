import React, { useState } from "react";
import SearchPatientForm from "../patient/SearchPatientForm";
import { Button, Column, Grid, Form } from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import CustomLabNumberInput from "../common/CustomLabNumberInput";

function SearchOrder() {
  const intl = useIntl();
  const history = useHistory();
  const [accessionNumber, setAccessionNumber] = useState("");

  const getSelectedPatient = (patient) => {
    if (patient?.patientPK) {
      history.push(
        `/ModifyOrder?patientId=${encodeURIComponent(patient.patientPK)}`,
      );
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const labNumber = accessionNumber.trim();
    if (labNumber) {
      history.push(
        `/ModifyOrder?accessionNumber=${encodeURIComponent(labNumber)}`,
      );
    }
  };

  return (
    <>
      <div className="orderLegendBody">
        <Form onSubmit={handleSearch}>
          <Grid>
            <Column lg={16} md={8} sm={4}>
              <h4>
                <FormattedMessage id="sample.label.search.labnumber" />
              </h4>
            </Column>
            <Column lg={16} md={8} sm={4}>
              <CustomLabNumberInput
                placeholder={intl.formatMessage({
                  id: "input.placeholder.labNo",
                })}
                id="labNumber"
                name="labNumber"
                value={accessionNumber}
                onChange={(e, rawVal) =>
                  setAccessionNumber(rawVal ? rawVal : e?.target?.value)
                }
                labelText={<FormattedMessage id="search.label.accession" />}
              />
            </Column>
            <Column lg={16} md={8} sm={4}>
              <br></br>
            </Column>
            <Column lg={16} md={8} sm={4}>
              <Button
                data-cy="submit-button"
                type="submit"
                disabled={!accessionNumber.trim()}
              >
                <FormattedMessage id="label.button.submit" />
              </Button>
            </Column>
          </Grid>
        </Form>
      </div>
      <div className="orderLegendBody">
        <Grid>
          <Column lg={16} md={8} sm={4}>
            <h4>
              {" "}
              <FormattedMessage id="sample.label.search.patient" />
            </h4>
          </Column>
          <Column lg={16} md={8} sm={4}>
            <SearchPatientForm
              getSelectedPatient={getSelectedPatient}
            ></SearchPatientForm>
          </Column>
        </Grid>
      </div>
    </>
  );
}

export default SearchOrder;

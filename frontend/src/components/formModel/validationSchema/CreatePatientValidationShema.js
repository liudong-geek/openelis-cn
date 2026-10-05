import * as Yup from "yup";
import { parseDateForLocale } from "../../common/dateLocaleUtils";

export const createPatientValidationSchema = (
  configurationProperties = {},
  intl,
) => {
  const message = (id, fallback) =>
    intl ? intl.formatMessage({ id }) : fallback;
  const nationalIdValidator =
    configurationProperties.PATIENT_NATIONAL_ID_REQUIRED === "false"
      ? Yup.string()
      : Yup.string().required(
          message(
            "patient.maintenance.validation.nationalIdRequired",
            "National ID Required",
          ),
        );

  return Yup.object().shape({
    nationalId: nationalIdValidator,
    birthDateForDisplay: Yup.string()
      .required(
        message(
          "patient.maintenance.validation.birthDateRequired",
          "Patient Birth date Required",
        ),
      )
      .test(
        "valid-date",
        message(
          "patient.maintenance.validation.invalidDate",
          "Invalid date format",
        ),
        function (value) {
          return Boolean(
            parseDateForLocale(
              value,
              configurationProperties.DEFAULT_DATE_LOCALE || "en-US",
            ),
          );
        },
      ),
    email: Yup.string().email(
      message(
        "patient.maintenance.validation.patientEmail",
        "Patient Email Must Be Valid",
      ),
    ),
    patientContact: Yup.object().shape({
      person: Yup.object().shape({
        email: Yup.string().email(
          message(
            "patient.maintenance.validation.contactEmail",
            "Contact Email Must Be Valid",
          ),
        ),
      }),
    }),
    gender: Yup.string().required(
      message(
        "patient.maintenance.validation.genderRequired",
        "Gender is Required",
      ),
    ),
  });
};

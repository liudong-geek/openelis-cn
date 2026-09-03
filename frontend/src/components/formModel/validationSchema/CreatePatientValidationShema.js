import * as Yup from "yup";
import { parseDateForLocale } from "../../common/dateLocaleUtils";

export const createPatientValidationSchema = (configurationProperties = {}) => {
  const nationalIdValidator =
    configurationProperties.PATIENT_NATIONAL_ID_REQUIRED === "false"
      ? Yup.string()
      : Yup.string().required("National ID Required");

  return Yup.object().shape({
    nationalId: nationalIdValidator,
    birthDateForDisplay: Yup.string()
      .required("Patient Birth date Required")
      .test("valid-date", "Invalid date format", function (value) {
        return Boolean(
          parseDateForLocale(
            value,
            configurationProperties.DEFAULT_DATE_LOCALE || "en-US",
          ),
        );
      }),
    email: Yup.string().email("Patient Email Must Be Valid"),
    patientContact: Yup.object().shape({
      person: Yup.object().shape({
        email: Yup.string().email("Contact Email Must Be Valid"),
      }),
    }),
    gender: Yup.string().required("Gender is Required"),
  });
};

import * as Yup from "yup";

export const createModifyOrderEntryValidationSchema = (intl) => {
  const message = (id, fallback) =>
    intl ? intl.formatMessage({ id }) : fallback;
  return Yup.object().shape({
    sampleOrderItems: Yup.object()
      .shape({
        labNo: Yup.string()
          .transform((value, original) => (original == null ? "" : value))
          .required(
            message(
              "modify.order.validation.lab",
              "Sample Lab Number is required",
            ),
          ),
        referringSiteName: Yup.string().nullable(),
        referringSiteId: Yup.string().nullable(),
        providerLastName: Yup.string()
          .transform((value, original) => (original == null ? "" : value))
          .required(
            message(
              "modify.order.validation.lastName",
              "Requester Last Name is required",
            ),
          ),
        providerFirstName: Yup.string()
          .transform((value, original) => (original == null ? "" : value))
          .required(
            message(
              "modify.order.validation.firstName",
              "Requester First Name is required",
            ),
          ),
        providerEmail: Yup.string()
          .nullable()
          .email(message("modify.order.validation.email", "Invalid Email")),
      })
      .test(
        "referringSiteName",
        message("modify.order.validation.site", "Referring Site is required"),
        function (value) {
          const { referringSiteName, referringSiteId } = value || {};
          return !!referringSiteName || !!referringSiteId;
        },
      ),
  });
};

export default createModifyOrderEntryValidationSchema();

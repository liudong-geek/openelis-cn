package org.openelisglobal.patient.validator;

import java.util.List;
import org.apache.commons.validator.GenericValidator;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.common.util.validator.CustomDateValidator;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.patientidentity.service.PatientIdentityService;
import org.openelisglobal.patientidentity.valueholder.PatientIdentity;
import org.openelisglobal.patientidentitytype.util.PatientIdentityTypeMap;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.validation.Errors;

public class ValidatePatientInfo {

    private static final String AMBIGUOUS_DATE_CHAR = ConfigurationProperties.getInstance()
            .getPropertyValue(ConfigurationProperties.Property.AmbiguousDateHolder);
    private static final String AMBIGUOUS_DATE_HOLDER = AMBIGUOUS_DATE_CHAR + AMBIGUOUS_DATE_CHAR;

    public static void validatePatientInfo(Errors errors, PatientManagementInfo patientInfo) {
        boolean disallowDuplicateSubjectNumbers = ConfigurationProperties.getInstance()
                .isPropertyValueEqual(ConfigurationProperties.Property.ALLOW_DUPLICATE_SUBJECT_NUMBERS, "false");
        boolean disallowDuplicateNationalIds = ConfigurationProperties.getInstance()
                .isPropertyValueEqual(ConfigurationProperties.Property.ALLOW_DUPLICATE_NATIONAL_IDS, "false");
        if (disallowDuplicateSubjectNumbers || disallowDuplicateNationalIds) {
            String currentPatientId = normalize(patientInfo.getPatientPK());
            String newSubjectNumber = normalize(patientInfo.getSubjectNumber());
            String newNationalId = normalize(patientInfo.getNationalId());

            PatientService patientService = SpringContext.getBean(PatientService.class);
            if (disallowDuplicateNationalIds && newNationalId != null) {
                List<Patient> matches = patientService.getPatientsByNationalId(newNationalId);
                if (matches != null && matches.stream().anyMatch(patient -> !isSamePatient(patient.getId(), currentPatientId))) {
                    errors.reject("error.duplicate.nationalId", null, "National ID is already in use");
                }
            }

            if (disallowDuplicateSubjectNumbers && newSubjectNumber != null) {
                String subjectTypeId = PatientIdentityTypeMap.getInstance().getIDForType("SUBJECT");
                if (!GenericValidator.isBlankOrNull(subjectTypeId)) {
                    PatientIdentityService identityService = SpringContext.getBean(PatientIdentityService.class);
                    List<PatientIdentity> matches = identityService
                            .getPatientIdentitiesByValueAndType(newSubjectNumber, subjectTypeId);
                    if (matches != null && matches.stream()
                            .anyMatch(identity -> !isSamePatient(identity.getPatientId(), currentPatientId))) {
                        errors.reject("error.duplicate.subjectNumber", null, "Patient number is already in use");
                    }
                }
            }
        }
        validateBirthdateFormat(patientInfo, errors);
    }

    private static String normalize(String value) {
        return GenericValidator.isBlankOrNull(value) ? null : value.trim();
    }

    private static boolean isSamePatient(String patientId, String currentPatientId) {
        return currentPatientId != null && currentPatientId.equals(patientId);
    }

    private static void validateBirthdateFormat(PatientManagementInfo patientInfo, Errors errors) {
        String birthDate = patientInfo.getBirthDateForDisplay();
        if (!org.apache.commons.validator.GenericValidator.isBlankOrNull(birthDate)) {
            if (!isValidBirthDateFormat(birthDate)) {
                errors.reject("error.birthdate.format", "error.birthdate.format");
            }
        }
    }

    static boolean isValidBirthDateFormat(String birthDate) {
        if (GenericValidator.isBlankOrNull(birthDate) || birthDate.length() != 10) {
            return false;
        }

        // A patient selected from search is returned using the configured display
        // locale. Validate that same contract instead of forcing the legacy
        // day/month/year representation on every locale.
        if (CustomDateValidator.getInstance().isValid(birthDate, DateUtil.getDateFormatLocale())) {
            return true;
        }

        // Preserve the legacy partial-date convention for records whose day or
        // month is intentionally unknown.
        return birthDate.matches("(((" + AMBIGUOUS_DATE_HOLDER + "|\\d{2})/\\d{2})|"
                + AMBIGUOUS_DATE_HOLDER + "/(" + AMBIGUOUS_DATE_HOLDER + "|\\d{2}))/\\d{4}");
    }
}

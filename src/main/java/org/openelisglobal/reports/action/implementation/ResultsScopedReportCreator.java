package org.openelisglobal.reports.action.implementation;

import java.util.List;
import org.openelisglobal.analysis.valueholder.Analysis;

/**
 * Marks report creators whose output contains patient-level laboratory results.
 *
 * <p>
 * Authorization is based on the concrete creator returned by the report factory,
 * not on a caller-controlled report-name allow-list. The selection type tells the
 * authorization service how the legacy creator resolves its result set before any
 * patient data is loaded into the report.
 */
public interface ResultsScopedReportCreator extends IReportCreator {

    enum SelectionType {
        CLINICAL_PATIENT,
        STUDY_PATIENT,
        PATIENT_COLLECTION,
        INDETERMINATE_BY_LOCATION,
        REFERRED_OUT_BY_LOCATION,
        PATIENT_ASSOCIATED_UNSUPPORTED,
        COVID_RESULTS_BY_DATE,
        PATHOLOGY_PROGRAM_SAMPLE,
        CYTOLOGY_PROGRAM_SAMPLE,
        IMMUNOHISTOCHEMISTRY_PROGRAM_SAMPLE
    }

    interface ClinicalPatientSelection extends ResultsScopedReportCreator {
        @Override
        default SelectionType getResultsAuthorizationSelectionType() {
            return SelectionType.CLINICAL_PATIENT;
        }
    }

    interface StudyPatientSelection extends ResultsScopedReportCreator {
        @Override
        default SelectionType getResultsAuthorizationSelectionType() {
            return SelectionType.STUDY_PATIENT;
        }
    }

    interface IndeterminateByLocationSelection extends StudyPatientSelection {
        @Override
        default SelectionType getResultsAuthorizationSelectionType() {
            return SelectionType.INDETERMINATE_BY_LOCATION;
        }
    }

    interface ReferredOutByLocationSelection extends ClinicalPatientSelection {
        @Override
        default SelectionType getResultsAuthorizationSelectionType() {
            return SelectionType.REFERRED_OUT_BY_LOCATION;
        }
    }

    /** Exact completed-date COVID export selection. */
    interface CovidResultsByDateSelection extends ResultsScopedReportCreator {
        @Override
        default SelectionType getResultsAuthorizationSelectionType() {
            return SelectionType.COVID_RESULTS_BY_DATE;
        }
    }

    interface PatientCollectionSelection extends ResultsScopedReportCreator {
        @Override
        default SelectionType getResultsAuthorizationSelectionType() {
            return SelectionType.PATIENT_COLLECTION;
        }
    }

    /**
     * The associated-patient report launches nested date/location reports whose
     * complete result set cannot yet be snapshotted safely.
     */
    interface UnsupportedPatientAssociatedSelection extends PatientCollectionSelection {
        @Override
        default SelectionType getResultsAuthorizationSelectionType() {
            return SelectionType.PATIENT_ASSOCIATED_UNSUPPORTED;
        }
    }

    /**
     * Fail-closed base capability for patient-program reports. A concrete report
     * must opt into one of the typed sample resolvers below.
     */
    interface UnresolvedProgramSampleSelection extends ResultsScopedReportCreator {
    }

    interface PathologyProgramSampleSelection extends UnresolvedProgramSampleSelection {
        @Override
        default SelectionType getResultsAuthorizationSelectionType() {
            return SelectionType.PATHOLOGY_PROGRAM_SAMPLE;
        }
    }

    interface CytologyProgramSampleSelection extends UnresolvedProgramSampleSelection {
        @Override
        default SelectionType getResultsAuthorizationSelectionType() {
            return SelectionType.CYTOLOGY_PROGRAM_SAMPLE;
        }
    }

    interface ImmunohistochemistryProgramSampleSelection extends UnresolvedProgramSampleSelection {
        @Override
        default SelectionType getResultsAuthorizationSelectionType() {
            return SelectionType.IMMUNOHISTOCHEMISTRY_PROGRAM_SAMPLE;
        }
    }

    SelectionType getResultsAuthorizationSelectionType();

    default List<String> getResultsAuthorizationProjectIds() {
        return List.of();
    }

    default List<String> getResultsAuthorizationSampleStatusIds() {
        return List.of();
    }

    default void setResultsAuthorizationCandidates(List<Analysis> analyses) {
        // Only creators that need an exact authorized result snapshot override this.
    }
}

package org.openelisglobal.reports.action.implementation;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import org.junit.Test;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator.ClinicalPatientSelection;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator.CovidResultsByDateSelection;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator.CytologyProgramSampleSelection;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator.IndeterminateByLocationSelection;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator.ImmunohistochemistryProgramSampleSelection;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator.PatientCollectionSelection;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator.PathologyProgramSampleSelection;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator.ReferredOutByLocationSelection;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator.SelectionType;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator.StudyPatientSelection;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator.UnsupportedPatientAssociatedSelection;

public class ReportImplementationFactoryResultsScopedTest {

    @Test
    public void factoryMarksCovidBulkExportAsResultsScoped() {
        assertFactorySelection("covidResultsReport", CovidResultsReport.class, CovidResultsByDateSelection.class,
                SelectionType.COVID_RESULTS_BY_DATE);
        assertTrue(BulkPatientExportReportCreator.class.isAssignableFrom(CovidResultsReport.class));
    }

    @Test
    public void everyLegacyPatientCreatorUsesAnExplicitTypedSelectionCapability() {
        assertClassSelection(PatientClinicalReport.class, ClinicalPatientSelection.class,
                SelectionType.CLINICAL_PATIENT);
        assertClassSelection(PatientCILNSPClinical.class, ClinicalPatientSelection.class,
                SelectionType.CLINICAL_PATIENT);
        assertClassSelection(PatientCILNSPClinical_vreduit.class, ClinicalPatientSelection.class,
                SelectionType.CLINICAL_PATIENT);
        assertClassSelection(TBPatientReport.class, ClinicalPatientSelection.class, SelectionType.CLINICAL_PATIENT);

        assertClassSelection(PatientARVVersion1Report.class, StudyPatientSelection.class,
                SelectionType.STUDY_PATIENT);
        assertClassSelection(PatientARVInitialVersion1Report.class, StudyPatientSelection.class,
                SelectionType.STUDY_PATIENT);
        assertClassSelection(PatientARVInitialVersion2Report.class, StudyPatientSelection.class,
                SelectionType.STUDY_PATIENT);
        assertClassSelection(PatientARVFollowupVersion1Report.class, StudyPatientSelection.class,
                SelectionType.STUDY_PATIENT);
        assertClassSelection(PatientARVFollowupVersion2Report.class, StudyPatientSelection.class,
                SelectionType.STUDY_PATIENT);
        assertClassSelection(PatientEIDVersion1Report.class, StudyPatientSelection.class,
                SelectionType.STUDY_PATIENT);
        assertClassSelection(PatientEIDVersion2Report.class, StudyPatientSelection.class,
                SelectionType.STUDY_PATIENT);
        assertClassSelection(PatientVLVersion1Report.class, StudyPatientSelection.class,
                SelectionType.STUDY_PATIENT);
        assertClassSelection(PatientIndeterminateVersion1Report.class, StudyPatientSelection.class,
                SelectionType.STUDY_PATIENT);
        assertClassSelection(PatientIndeterminateVersion2Report.class, StudyPatientSelection.class,
                SelectionType.STUDY_PATIENT);
        assertClassSelection(PatientIndeterminateByLocationReport.class, IndeterminateByLocationSelection.class,
                SelectionType.INDETERMINATE_BY_LOCATION);
        assertClassSelection(ReferredOutReport.class, ReferredOutByLocationSelection.class,
                SelectionType.REFERRED_OUT_BY_LOCATION);
        assertClassSelection(RetroCIPatientCollectionReport.class, PatientCollectionSelection.class,
                SelectionType.PATIENT_COLLECTION);
    }

    @Test
    public void factoryMarksEveryPatientProgramReportWithItsTypedResolver() {
        assertFactorySelection("PatientPathologyReport", PatientPathologyReport.class,
                PathologyProgramSampleSelection.class,
                SelectionType.PATHOLOGY_PROGRAM_SAMPLE);
        assertFactorySelection("PatientCytologyReport", PatientCytologyReport.class,
                CytologyProgramSampleSelection.class,
                SelectionType.CYTOLOGY_PROGRAM_SAMPLE);
        assertFactorySelection("PatientImmunoChemistryReport", PatientImmunoChemistryReport.class,
                ImmunohistochemistryProgramSampleSelection.class,
                SelectionType.IMMUNOHISTOCHEMISTRY_PROGRAM_SAMPLE);
        assertFactorySelection("DualInSituHybridizationReport", DualInSituHybridizationReport.class,
                ImmunohistochemistryProgramSampleSelection.class,
                SelectionType.IMMUNOHISTOCHEMISTRY_PROGRAM_SAMPLE);
        assertFactorySelection("BreastCancerHormoneReceptorReport", BreastCancerHormoneReceptorReport.class,
                ImmunohistochemistryProgramSampleSelection.class,
                SelectionType.IMMUNOHISTOCHEMISTRY_PROGRAM_SAMPLE);
    }

    @Test
    public void factoryFailClosesPatientAssociated() {
        assertFactorySelection("patientAssociated", RetroCIPatientAssociatedReport.class,
                UnsupportedPatientAssociatedSelection.class, SelectionType.PATIENT_ASSOCIATED_UNSUPPORTED);
    }

    @Test
    public void factorySafeAggregateCreatorsAreExplicitlyMarked() {
        assertSafeCreator(IndicatorHIV.class);
        assertSafeCreator(IndicatorHIVLNSP.class);
        assertSafeCreator(IndicatorCDIHIVLNSP.class);
        assertSafeCreator(IndicatorAllTestClinical.class);
        assertSafeCreator(IndicatorAllTestLNSP.class);
        assertSafeCreator(RetroCINonConformityBySectionReason.class);
        assertSafeCreator(HaitiNonConformityBySectionReason.class);
        assertSafeCreator(IndicatorHaitiSiteTestCountReport.class);
        assertSafeCreator(ValidationBacklogReport.class);
        assertSafeCreator(IPCIRealisationReport.class);
        assertSafeCreator(StatisticsReport.class);

        assertTrue(!SafeNonPatientReportCreator.class.isAssignableFrom(IndicatorSectionPerformanceReport.class));
        assertTrue(!SafeNonPatientReportCreator.class.isAssignableFrom(ActivityReportByTest.class));
        assertTrue(!SafeNonPatientReportCreator.class.isAssignableFrom(CSVSampleRejectionReport.class));
        assertTrue(!SafeNonPatientReportCreator.class.isAssignableFrom(MauritiusProtocolSheet.class));
    }

    private void assertFactorySelection(String reportName, Class<? extends IReportCreator> expectedClass,
            Class<? extends ResultsScopedReportCreator> expectedCapability, SelectionType expectedSelection) {
        Class<? extends IReportCreator> creatorClass = ReportImplementationFactory
                .getAdditionalResultsScopedCreatorClass(reportName);
        assertEquals(expectedClass, creatorClass);
        assertTrue(reportName + " must be results scoped",
                ResultsScopedReportCreator.class.isAssignableFrom(creatorClass));
        assertTrue(reportName + " must implement its typed resolver capability",
                expectedCapability.isAssignableFrom(creatorClass));
        assertSelectionMethodDeclaredBy(expectedClass, expectedCapability);
        assertCapabilitySelection(expectedCapability, expectedSelection);
    }

    private void assertClassSelection(Class<? extends IReportCreator> creatorClass,
            Class<? extends ResultsScopedReportCreator> expectedCapability, SelectionType expectedSelection) {
        assertTrue(ResultsScopedReportCreator.class.isAssignableFrom(creatorClass));
        assertTrue(expectedCapability.isAssignableFrom(creatorClass));
        assertSelectionMethodDeclaredBy(creatorClass, expectedCapability);
        assertCapabilitySelection(expectedCapability, expectedSelection);
    }

    private void assertSelectionMethodDeclaredBy(Class<?> creatorClass, Class<?> expectedCapability) {
        try {
            Method selectionMethod = creatorClass.getMethod("getResultsAuthorizationSelectionType");
            assertEquals(expectedCapability, selectionMethod.getDeclaringClass());
        } catch (NoSuchMethodException e) {
            throw new AssertionError(creatorClass.getName() + " has no explicit authorization selection", e);
        }
    }

    private void assertCapabilitySelection(Class<? extends ResultsScopedReportCreator> expectedCapability,
            SelectionType expectedSelection) {
        ResultsScopedReportCreator capability = (ResultsScopedReportCreator) Proxy.newProxyInstance(
                expectedCapability.getClassLoader(), new Class<?>[] { expectedCapability }, (proxy, method, args) -> {
                    if (method.isDefault()) {
                        return InvocationHandler.invokeDefault(proxy, method, args);
                    }
                    throw new UnsupportedOperationException(method.getName());
                });
        assertEquals(expectedSelection, capability.getResultsAuthorizationSelectionType());
    }

    private void assertSafeCreator(Class<?> creatorClass) {
        assertTrue(creatorClass.getSimpleName() + " must explicitly opt into safe aggregate reporting",
                SafeNonPatientReportCreator.class.isAssignableFrom(creatorClass));
    }
}

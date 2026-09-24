package org.openelisglobal.common.provider.query.workerObjects;

import java.util.List;
import java.util.Objects;
import org.apache.commons.validator.GenericValidator;
import org.openelisglobal.address.service.AddressPartService;
import org.openelisglobal.address.valueholder.AddressPart;
import org.openelisglobal.common.provider.query.ExtendedPatientSearchResults;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.patientidentity.service.PatientIdentityService;
import org.openelisglobal.patientidentity.valueholder.PatientIdentity;
import org.openelisglobal.patientidentitytype.util.PatientIdentityTypeMap;
import org.openelisglobal.person.service.PersonService;
import org.openelisglobal.person.valueholder.Person;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Persists one bounded external-search snapshot as a single transaction. */
@Service
public class ExternalPatientImportService {

    private final PatientService patientService;
    private final PatientIdentityService patientIdentityService;
    private final PersonService personService;
    private final AddressPartService addressPartService;

    public ExternalPatientImportService(PatientService patientService, PatientIdentityService patientIdentityService,
            PersonService personService, AddressPartService addressPartService) {
        this.patientService = patientService;
        this.patientIdentityService = patientIdentityService;
        this.personService = personService;
        this.addressPartService = addressPartService;
    }

    @Transactional(rollbackFor = Exception.class)
    public void importPatients(List<ExtendedPatientSearchResults> externalPatients, String sysUserId) {
        Objects.requireNonNull(externalPatients, "externalPatients");
        if (externalPatients.isEmpty()) {
            return;
        }

        String communePartId = "";
        String villagePartId = "";
        for (AddressPart addressPart : addressPartService.getAll()) {
            if ("commune".equals(addressPart.getPartName())) {
                communePartId = addressPart.getId();
            } else if ("village".equals(addressPart.getPartName())) {
                villagePartId = addressPart.getId();
            }
        }

        for (ExtendedPatientSearchResults results : externalPatients) {
            importPatient(results, sysUserId, communePartId, villagePartId);
        }
    }

    private void importPatient(ExtendedPatientSearchResults results, String sysUserId, String communePartId,
            String villagePartId) {
        Patient patient = new Patient();
        Person person = new Person();

        patient.setBirthDateForDisplay(results.getBirthdate());
        patient.setGender(results.getGender());
        patient.setNationalId(results.getNationalId());
        patient.setSysUserId(sysUserId);

        person.setLastName(results.getLastName());
        person.setFirstName(results.getFirstName());
        person.setStreetAddress(results.getStreetAddress());
        person.setZipCode(results.getPostalCode());
        person.setSysUserId(sysUserId);

        personService.insert(person);
        patient.setPerson(person);
        patientService.insert(patient);

        persistIdentity(results.getStNumber(), "ST", patient.getId(), sysUserId);
        persistIdentity(results.getSubjectNumber(), "SUBJECT", patient.getId(), sysUserId);
        persistIdentity(results.getMothersName(), "MOTHER", patient.getId(), sysUserId);
        persistIdentity(results.getGUID(), "GUID", patient.getId(), sysUserId);
        persistIdentity(results.getDataSourceId(), "ORG_SITE", patient.getId(), sysUserId);

        patientService.insertNewPatientAddressInfo(communePartId, results.getCampCommune(), "T", patient, sysUserId);
        patientService.insertNewPatientAddressInfo(villagePartId, results.getTown(), "T", patient, sysUserId);

        results.setPatientID(patient.getId());
    }

    private void persistIdentity(String value, String type, String patientId, String sysUserId) {
        if (GenericValidator.isBlankOrNull(value)) {
            return;
        }
        PatientIdentity patientIdentity = new PatientIdentity();
        patientIdentity.setPatientId(patientId);
        patientIdentity.setIdentityTypeId(PatientIdentityTypeMap.getInstance().getIDForType(type));
        patientIdentity.setSysUserId(sysUserId);
        patientIdentity.setIdentityData(value);
        patientIdentity.setLastupdatedFields();
        patientIdentityService.insert(patientIdentity);
    }
}

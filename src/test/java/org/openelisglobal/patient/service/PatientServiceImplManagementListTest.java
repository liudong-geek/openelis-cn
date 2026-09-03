package org.openelisglobal.patient.service;

import static org.junit.Assert.assertEquals;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.patient.dao.PatientDAO;
import org.openelisglobal.patient.form.PatientListResponse;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.person.service.PersonService;
import org.openelisglobal.person.valueholder.Person;

@RunWith(MockitoJUnitRunner.class)
public class PatientServiceImplManagementListTest {

    @Mock
    private PatientDAO patientDAO;

    @Mock
    private PersonService personService;

    @InjectMocks
    private PatientServiceImpl patientService;

    private Patient patient;
    private Person person;

    @Before
    public void setUp() {
        person = new Person();
        person.setFirstName("明");
        person.setLastName("李");
        person.setPrimaryPhone("13800000000");

        patient = new Patient();
        patient.setId("22");
        patient.setPerson(person);
        patient.setGender("M");
        patient.setNationalId("ID-22");
        when(personService.getFirstName(person)).thenReturn("明");
        when(personService.getLastName(person)).thenReturn("李");
        when(personService.getPhone(person)).thenReturn("13800000000");
    }

    @Test
    public void getPatientManagementListBuildsPagedPatientRows() {
        when(patientDAO.getPatientManagementCount()).thenReturn(1);
        when(patientDAO.getPatientManagementPage(0, 20)).thenReturn(List.of(patient));

        PatientListResponse response = patientService.getPatientManagementList(1, 20);

        assertEquals(1, response.totalItems());
        assertEquals(1, response.totalPages());
        assertEquals("22", response.patients().get(0).patientId());
        assertEquals("李", response.patients().get(0).lastName());
        assertEquals("明", response.patients().get(0).firstName());
        assertEquals("13800000000", response.patients().get(0).phoneNumber());
    }

    @Test
    public void getPatientManagementListClampsInvalidPagingValues() {
        when(patientDAO.getPatientManagementCount()).thenReturn(0);
        when(patientDAO.getPatientManagementPage(0, 10)).thenReturn(List.of());

        PatientListResponse response = patientService.getPatientManagementList(-5, 1);

        assertEquals(1, response.page());
        assertEquals(10, response.pageSize());
        assertEquals(1, response.totalPages());
    }
}

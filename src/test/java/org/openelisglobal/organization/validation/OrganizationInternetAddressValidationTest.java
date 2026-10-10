package org.openelisglobal.organization.validation;

import static org.junit.Assert.assertEquals;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.Arrays;
import java.util.Collection;
import org.hibernate.validator.messageinterpolation.ParameterMessageInterpolator;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.Parameterized;
import org.openelisglobal.organization.form.OrganizationForm;
import org.openelisglobal.organization.valueholder.Organization;

/** Real default-group @URL properties; no Spring mocks, network or database. */
@RunWith(Parameterized.class)
public class OrganizationInternetAddressValidationTest {
    private static ValidatorFactory factory;
    private static Validator validator;
    private final String address;
    private final boolean accepted;

    @Parameterized.Parameters(name = "{index}:{0}")
    public static Collection<Object[]> addresses() {
        return Arrays.asList(new Object[][] { { "httpPrivateIpv4", "http://10.42.0.8:18080/lis/results", true },
                { "httpsPublicLiteralDns", "https://lis.example.org/results", true },
                { "httpMultiLabelIntranetDns", "http://lis.intranet.local:18080/lis/results", true },
                { "httpSingleLabelDns", "http://lis:18080/results", true },
                { "httpLocalhost", "http://localhost:18080/results", true },
                { "httpsPrivateIpv4", "https://192.168.10.20:8443/lis/results", true },
                { "httpBracketedIpv6", "http://[fd00::8]:18080/lis/results", true },
                { "httpsPortPathQuery", "https://lis.example.org:8443/lis/results?group=1", true },
                { "malformedText", "not a url", false }, { "bareDns", "lis.intranet.local/results", false },
                { "bareIp", "10.42.0.8:18080/results", false }, { "optionalEmpty", "", true },
                { "optionalNull", null, true }, { "exactStorage40", "https://lis.example.org/r?group=12345678", true },
                { "overStorage41", "https://lis.example.org/r?group=123456789", true } });
    }

    public OrganizationInternetAddressValidationTest(String name, String address, boolean accepted) {
        this.address = address;
        this.accepted = accepted;
    }

    @BeforeClass
    public static void startActualProvider() {
        factory = Validation.byDefaultProvider().configure().messageInterpolator(new ParameterMessageInterpolator())
                .buildValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterClass
    public static void closeActualProvider() {
        if (factory != null)
            factory.close();
    }

    @Test
    public void defaultFormInternetAddressConstraintMatchesMatrix() {
        OrganizationForm form = new OrganizationForm();
        form.setInternetAddress(address);
        assertExactFormatAndStorageConstraints(validator.validateProperty(form, "internetAddress"));
    }

    @Test
    public void defaultEntityInternetAddressConstraintMatchesMatrix() {
        Organization organization = new Organization();
        organization.setInternetAddress(address);
        assertExactFormatAndStorageConstraints(validator.validateProperty(organization, "internetAddress"));
    }

    private <T> void assertExactFormatAndStorageConstraints(
            java.util.Set<jakarta.validation.ConstraintViolation<T>> violations) {
        java.util.Set<Class<? extends java.lang.annotation.Annotation>> expected = new java.util.HashSet<>();
        if (!accepted)
            expected.add(org.hibernate.validator.constraints.URL.class);
        if (address != null && address.length() > 40)
            expected.add(jakarta.validation.constraints.Size.class);
        java.util.Set<Class<? extends java.lang.annotation.Annotation>> actual = new java.util.HashSet<>();
        for (jakarta.validation.ConstraintViolation<T> violation : violations) {
            Class<? extends java.lang.annotation.Annotation> annotation = violation.getConstraintDescriptor()
                    .getAnnotation().annotationType();
            actual.add(annotation);
            assertEquals("internetAddress", violation.getPropertyPath().toString());
            assertEquals(address, violation.getInvalidValue());
            if (annotation == jakarta.validation.constraints.Size.class) {
                assertEquals(40, violation.getConstraintDescriptor().getAttributes().get("max"));
                assertEquals(0, violation.getConstraintDescriptor().getAttributes().get("min"));
            }
        }
        assertEquals("Original URL format validity remains independent of storage length", accepted,
                !actual.contains(org.hibernate.validator.constraints.URL.class));
        assertEquals("Only the exact expected URL or Size constraint may reject the input", expected, actual);
        assertEquals("No extra violations may be hidden by a set", expected.size(), violations.size());
    }
}

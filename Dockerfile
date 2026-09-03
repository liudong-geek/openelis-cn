##
# Build Stage
#
FROM maven:3-eclipse-temurin-21 AS build

RUN --mount=target=/var/lib/apt/lists,type=cache,sharing=locked \
    --mount=target=/var/cache/apt,type=cache,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && for attempt in 1 2 3 4 5; do \
        apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=60 \
            --allow-releaseinfo-change update && break; \
        if [ "${attempt}" = "5" ]; then exit 1; fi; \
        rm -rf /var/lib/apt/lists/*; \
        sleep $((attempt * 2)); \
    done \
    && apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=60 \
        -y --no-install-recommends install \
        git apache2-utils


# OE Default Password
ARG DEFAULT_PW="adminADMIN!"
COPY ./install/createDefaultPassword.sh /build/install/createDefaultPassword.sh
WORKDIR /build
RUN ./install/createDefaultPassword.sh -c -p ${DEFAULT_PW}

##
# Build DataExport
#
COPY ./dataexport /build/dataexport
WORKDIR /build/dataexport/dataexport-core
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    mvn dependency:go-offline 
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    mvn clean install -DskipTests
WORKDIR /build/dataexport/
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    mvn dependency:go-offline 
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    mvn clean install -DskipTests \
    && mkdir -p /build/dataexport-m2/org \
    && cp -r /root/.m2/repository/org/itech /build/dataexport-m2/org/

##
# Build the Project
#
# NOTE: Each step restores dataexport artifacts into the cache mount if missing.
# When BuildKit restores cached layers from GHA, the --mount=type=cache volume
# starts empty (it is not part of the layer blob). Without this restore step,
# the main project build cannot resolve org.itech:dataexport-* dependencies.
#
WORKDIR /build

COPY ./pom.xml /build/pom.xml
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    [ -d /root/.m2/repository/org/itech ] || { mkdir -p /root/.m2/repository/org && cp -r /build/dataexport-m2/org/itech /root/.m2/repository/org/; } \
    && mvn dependency:go-offline

ARG SKIP_SPOTLESS="false"
COPY ./src /build/src
# Analyzer vendor/protocol profiles are runtime assets as well as test
# fixtures. Keep them in the build context so the full backend gate exercises
# the same profiles that are shipped to local installations.
COPY ./projects/analyzer-profiles /build/projects/analyzer-profiles
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    [ -d /root/.m2/repository/org/itech ] || { mkdir -p /root/.m2/repository/org && cp -r /build/dataexport-m2/org/itech /root/.m2/repository/org/; } \
    && mvn clean install -Dmaven.test.skip=true -DskipITs=true -Dspotless.check.skip=${SKIP_SPOTLESS}

# Optional fast backend regression target. The runtime image remains the final
# stage, while local delivery/CI can run the P1 controller tests with:
#   docker build --target p1-unit-test .
FROM build AS p1-unit-test
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    [ -d /root/.m2/repository/org/itech ] || { mkdir -p /root/.m2/repository/org && cp -r /build/dataexport-m2/org/itech /root/.m2/repository/org/; } \
    && mvn test -DskipITs=true \
        -Dtest=SampleQaChecklistRestControllerTest,SampleTypeRequestRestControllerTest,ResultEntryWorklistServiceTest,SamplePatientErrorMergeTest,RequesterMasterDataValidatorTest,OrganizationRestControllerReferringSiteTest,BarcodeInfoServiceImplTest,ResultsTreeProviderRestControllerTest,PatientResultHistoryServiceImplTest,PatientServiceImplManagementListTest,ResultDAOImplPatientHistoryTest,PatientSearchResultsDateLocaleTest,DateUtilLocaleTest,ValidatePatientInfoLocaleTest,DBSearchResultsDAOImplDateLocaleTest,DBSearchResultsDAOImplQuickSearchTest,TestConfigurationHandlerTest,TestConfigurationHandlerIdempotencyTest,LocalizationLocaleResolutionTest,GlobalLocaleResolverTest,TestSectionServiceImplLocaleTest,ReferralServiceImplUnitTest,ReferredOutTestsRestControllerSecurityTest,ReportAnalysisAuthorizationServiceTest,ReportPrintAuthorizationControllerTest,CovidResultsCandidateServiceTest,AnalysisDAOImplUnitTest,ReportImplementationFactoryResultsScopedTest,UserServiceImplUnitTest,SampleTypeManagementRestControllerLocalizationTest,StatisticsReportTest,ControllerSetupLoggingTest,NotificationRestControllerTest,FhirPersistanceServiceImplDisabledTest

# Reproducible full backend unit-test runner. Tests use Testcontainers, so they
# must run after the image is built with access to the host Docker socket. The
# Maven repository is copied out of the BuildKit cache so the runner also keeps
# the locally built org.itech dataexport artifacts, which are not published to
# Maven Central.
#
#   docker build --target full-unit-test -t openelis-full-unit-test .
#   docker run --rm \
#     -v /var/run/docker.sock:/var/run/docker.sock \
#     -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
#     openelis-full-unit-test
FROM build AS full-unit-test
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    [ -d /root/.m2/repository/org/itech ] || { mkdir -p /root/.m2/repository/org && cp -r /build/dataexport-m2/org/itech /root/.m2/repository/org/; } \
    && mkdir -p /opt/openelis-maven-repository \
    && cp -a /root/.m2/repository/. /opt/openelis-maven-repository/
CMD ["mvn", "-Dmaven.repo.local=/opt/openelis-maven-repository", "test", "-DskipITs=true", "-Dspotless.check.skip=true"]

##
# Run Stage
#
FROM tomcat:10-jre21

COPY install/createDefaultPassword.sh ./


#Clean out unneccessary files from tomcat (especially pre-existing applications) 
RUN rm -rf /usr/local/tomcat/webapps/* \ 
    /usr/local/tomcat/conf/Catalina/localhost/manager.xml

#Deploy the war into tomcat image and point root to it
COPY install/tomcat-resources/ROOT.war /usr/local/tomcat/webapps/ROOT.war
COPY --from=build /build/target/OpenELIS-Global.war /usr/local/tomcat/webapps/OpenELIS-Global.war

#rewrite cataline.properties with our catalina.properties so it contains:
#    org.apache.catalina.STRICT_SERVLET_COMPLIANCE=true
#    org.apache.catalina.connector.RECYCLE_FACADES=true
#    org.apache.catalina.connector.CoyoteAdapter.ALLOW_BACKSLASH=false
#    org.apache.tomcat.util.buf.UDecoder.ALLOW_ENCODED_SLASH=false
#    org.apache.coyote.USE_CUSTOM_STATUS_MSG_IN_HEADER=false
COPY install/tomcat-resources/catalina.properties /usr/local/tomcat/conf/catalina.properties
COPY install/tomcat-resources/logging.properties /usr/local/tomcat/conf/logging.properties

# Built-in vendor templates for ASTM, HL7 and file-based analyzer adapters.
# Administrators may still replace this directory with a read-only bind mount
# in a managed deployment, but the product must work out of the box.
COPY ./projects/analyzer-profiles /data/analyzer-profiles

#replace ServerInfo.properties with a less informative one
RUN mkdir -p /usr/local/tomcat/lib/org/apache/catalina/util
COPY install/tomcat-resources/ServerInfo.properties /usr/local/tomcat/lib/org/apache/catalina/util/ServerInfo.properties 

#restrict files
#GID AND UID must be kept the same as setupTomcat.sh (if using default certificate group)
RUN groupadd tomcat; \
    groupadd tomcat-ssl-cert -g 8443; \ 
    useradd -M -s /bin/bash -u 8443 tomcat_admin; \
    usermod -a -G tomcat,tomcat-ssl-cert tomcat_admin; \
    chown -R tomcat_admin:tomcat $CATALINA_HOME; \
    chmod g-w,o-rwx $CATALINA_HOME; \
    chmod g-w,o-rwx $CATALINA_HOME/conf; \
    chmod o-rwx $CATALINA_HOME/logs; \
    chmod o-rwx $CATALINA_HOME/temp; \
    chmod g-w,o-rwx $CATALINA_HOME/bin; \
    chmod g-w,o-rwx $CATALINA_HOME/webapps; \
    chmod 770 $CATALINA_HOME/conf/catalina.policy; \
    chmod g-w,o-rwx $CATALINA_HOME/conf/catalina.properties; \
    chmod g-w,o-rwx $CATALINA_HOME/conf/context.xml; \
    chmod g-w,o-rwx $CATALINA_HOME/conf/logging.properties; \
    chmod g-w,o-rwx $CATALINA_HOME/conf/server.xml; \
    chmod g-w,o-rwx $CATALINA_HOME/conf/tomcat-users.xml; \
    chmod g-w,o-rwx $CATALINA_HOME/conf/web.xml; \
    mkdir -p /var/lib/openelis-global/logs/; \
    chown -R tomcat_admin:tomcat /var/lib/openelis-global/logs/;\
    mkdir -p /var/lib/openelis-global/properties/; \
    chown -R tomcat_admin:tomcat /var/lib/openelis-global/properties/; \
    mkdir -p /var/lib/openelis-global/configuration/; \
    chown -R tomcat_admin:tomcat /var/lib/openelis-global/configuration/;


COPY install/openelis_healthcheck.sh /healthcheck.sh
RUN chown tomcat_admin:tomcat /healthcheck.sh; \
    chmod 770 /healthcheck.sh;  

COPY install/docker-entrypoint.sh /docker-entrypoint.sh
RUN chown tomcat_admin:tomcat /docker-entrypoint.sh; \
    chmod 770 /docker-entrypoint.sh;

COPY ./tomcat/oe_server.xml /usr/local/tomcat/conf/server.xml    
USER root

ENTRYPOINT [ "/docker-entrypoint.sh" ]

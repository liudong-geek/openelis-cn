import { describe, expect, it } from "vitest";
import {
  assertDisposableE2eDatabaseLabels,
  assertDisposableE2eDatabaseVolumeLabels,
  buildPsqlQueryArguments,
  COMPOSE_PROJECT_LABEL,
  COMPOSE_SERVICE_LABEL,
  COMPOSE_VOLUME_LABEL,
  E2E_DISPOSABLE_DATABASE_LABEL,
  resolveE2eComposeProject,
  resolveE2eDatabaseContainer,
} from "../cypress/support/e2ePsqlArguments.js";

const E2E_PROJECT = "openelis-cn-e2e";

describe("resolveE2eDatabaseContainer", () => {
  it("requires an explicit database container", () => {
    expect(() => resolveE2eDatabaseContainer({})).toThrow(
      "OPENELIS_E2E_DB_CONTAINER is required",
    );
  });

  it("accepts a valid explicit database container", () => {
    expect(
      resolveE2eDatabaseContainer({
        OPENELIS_E2E_DB_CONTAINER: " openelis-e2e-database ",
      }),
    ).toBe("openelis-e2e-database");
  });

  it("rejects a container value that could add docker arguments", () => {
    expect(() =>
      resolveE2eDatabaseContainer({
        OPENELIS_E2E_DB_CONTAINER: "openelis-db --privileged",
      }),
    ).toThrow("must be a valid Docker container name");
  });
});

describe("resolveE2eComposeProject", () => {
  it("requires an explicit Compose project", () => {
    expect(() => resolveE2eComposeProject({})).toThrow(
      "OPENELIS_E2E_COMPOSE_PROJECT is required",
    );
  });

  it("accepts a lowercase isolated project", () => {
    expect(
      resolveE2eComposeProject({
        OPENELIS_E2E_COMPOSE_PROJECT: ` ${E2E_PROJECT} `,
      }),
    ).toBe(E2E_PROJECT);
  });

  it("rejects a project value that could add Compose arguments", () => {
    expect(() =>
      resolveE2eComposeProject({
        OPENELIS_E2E_COMPOSE_PROJECT: "openelis-e2e --project-directory=/",
      }),
    ).toThrow("valid lowercase Compose project name");
  });

  it("rejects the production Compose project", () => {
    expect(() =>
      resolveE2eComposeProject({
        OPENELIS_E2E_COMPOSE_PROJECT: "openelis-cn",
      }),
    ).toThrow("dedicated openelis-cn-e2e or openelis-e2e-* namespace");
  });

  it("accepts a CI-scoped E2E project", () => {
    expect(
      resolveE2eComposeProject({
        OPENELIS_E2E_COMPOSE_PROJECT: "openelis-e2e-12345-core",
      }),
    ).toBe("openelis-e2e-12345-core");
  });
});

describe("assertDisposableE2eDatabaseLabels", () => {
  it("accepts only the explicit disposable database label", () => {
    expect(() =>
      assertDisposableE2eDatabaseLabels(
        {
          [E2E_DISPOSABLE_DATABASE_LABEL]: "true",
          [COMPOSE_PROJECT_LABEL]: E2E_PROJECT,
          [COMPOSE_SERVICE_LABEL]: "db.openelis.org",
        },
        E2E_PROJECT,
      ),
    ).not.toThrow();
  });

  it.each([null, {}, { [E2E_DISPOSABLE_DATABASE_LABEL]: "false" }])(
    "rejects an unmarked database container: %j",
    (labels) => {
      expect(() =>
        assertDisposableE2eDatabaseLabels(labels, E2E_PROJECT),
      ).toThrow(
        `disposable db.openelis.org container from Compose project ${E2E_PROJECT}`,
      );
    },
  );

  it("rejects a disposable marker copied onto another Compose project", () => {
    expect(() =>
      assertDisposableE2eDatabaseLabels(
        {
          [E2E_DISPOSABLE_DATABASE_LABEL]: "true",
          [COMPOSE_PROJECT_LABEL]: "openelis-cn",
          [COMPOSE_SERVICE_LABEL]: "db.openelis.org",
        },
        E2E_PROJECT,
      ),
    ).toThrow(E2E_PROJECT);
  });
});

describe("assertDisposableE2eDatabaseVolumeLabels", () => {
  it("accepts only the dedicated project-scoped E2E volume", () => {
    expect(() =>
      assertDisposableE2eDatabaseVolumeLabels(
        {
          [COMPOSE_PROJECT_LABEL]: E2E_PROJECT,
          [COMPOSE_VOLUME_LABEL]: "e2e-db-data",
        },
        E2E_PROJECT,
      ),
    ).not.toThrow();
  });

  it("rejects the production db-data volume", () => {
    expect(() =>
      assertDisposableE2eDatabaseVolumeLabels(
        {
          [COMPOSE_PROJECT_LABEL]: "openelis-cn",
          [COMPOSE_VOLUME_LABEL]: "db-data",
        },
        E2E_PROJECT,
      ),
    ).toThrow("e2e-db-data volume");
  });
});

describe("buildPsqlQueryArguments", () => {
  it("keeps untrusted values out of fixed SQL text", () => {
    const query = `
      SELECT COUNT(*)
      FROM clinlims.patient
      WHERE national_id = :'national_id';
    `;
    const maliciousNationalId = "UG-MERGE-' OR TRUE; SELECT pg_sleep(10); --";

    const argumentsList = buildPsqlQueryArguments(query, {
      outputArguments: ["-t"],
      variables: { national_id: maliciousNationalId },
    });

    expect(argumentsList).toEqual([
      "-t",
      "-v",
      `national_id=${maliciousNationalId}`,
      "-c",
      query,
    ]);
    expect(argumentsList.at(-1)).toBe(query);
    expect(argumentsList.at(-1)).not.toContain(maliciousNationalId);
  });

  it("rejects variable names that could add psql syntax", () => {
    expect(() =>
      buildPsqlQueryArguments("SELECT 1", {
        variables: { "unsafe-name": "value" },
      }),
    ).toThrow("Invalid psql variable name");
  });

  it("rejects non-string task values instead of coercing them", () => {
    expect(() =>
      buildPsqlQueryArguments("SELECT 1", {
        variables: { national_id: { injected: true } },
      }),
    ).toThrow("psql variable national_id must be a string");
  });
});

const PSQL_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DOCKER_CONTAINER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const COMPOSE_PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const E2E_COMPOSE_PROJECT_NAME_PATTERN =
  /^(?:openelis-cn-e2e|openelis-e2e-[a-z0-9_-]+)$/;

export const E2E_DISPOSABLE_DATABASE_LABEL =
  "org.openelisglobal.e2e.disposable";
export const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
export const COMPOSE_SERVICE_LABEL = "com.docker.compose.service";
export const COMPOSE_VOLUME_LABEL = "com.docker.compose.volume";

/**
 * Database-mutating Cypress tasks must name their Docker target explicitly.
 * A base URL can point at any running stack, so silently falling back to a
 * conventional container name risks changing a different local database.
 */
export function resolveE2eDatabaseContainer(environment = process.env) {
  const containerName = environment.OPENELIS_E2E_DB_CONTAINER?.trim();
  if (!containerName) {
    throw new Error(
      "OPENELIS_E2E_DB_CONTAINER is required for Cypress database tasks.",
    );
  }
  if (!DOCKER_CONTAINER_NAME_PATTERN.test(containerName)) {
    throw new Error(
      "OPENELIS_E2E_DB_CONTAINER must be a valid Docker container name (1-128 letters, numbers, dots, underscores, or hyphens).",
    );
  }
  return containerName;
}

export function resolveE2eComposeProject(environment = process.env) {
  const projectName = environment.OPENELIS_E2E_COMPOSE_PROJECT?.trim();
  if (!projectName) {
    throw new Error(
      "OPENELIS_E2E_COMPOSE_PROJECT is required for Cypress database tasks.",
    );
  }
  if (!COMPOSE_PROJECT_NAME_PATTERN.test(projectName)) {
    throw new Error(
      "OPENELIS_E2E_COMPOSE_PROJECT must be a valid lowercase Compose project name.",
    );
  }
  if (!E2E_COMPOSE_PROJECT_NAME_PATTERN.test(projectName)) {
    throw new Error(
      "OPENELIS_E2E_COMPOSE_PROJECT must use the dedicated openelis-cn-e2e or openelis-e2e-* namespace.",
    );
  }
  return projectName;
}

/**
 * Require the container itself to carry the disposable-test marker. Merely
 * setting a process environment flag is insufficient because it says nothing
 * about the selected Docker target.
 */
export function assertDisposableE2eDatabaseLabels(labels, expectedProject) {
  if (
    labels === null ||
    typeof labels !== "object" ||
    labels[E2E_DISPOSABLE_DATABASE_LABEL] !== "true" ||
    labels[COMPOSE_PROJECT_LABEL] !== expectedProject ||
    labels[COMPOSE_SERVICE_LABEL] !== "db.openelis.org"
  ) {
    throw new Error(
      `Cypress database tasks require the disposable db.openelis.org container from Compose project ${expectedProject}.`,
    );
  }
}

export function assertDisposableE2eDatabaseVolumeLabels(
  labels,
  expectedProject,
) {
  if (
    labels === null ||
    typeof labels !== "object" ||
    labels[COMPOSE_PROJECT_LABEL] !== expectedProject ||
    labels[COMPOSE_VOLUME_LABEL] !== "e2e-db-data"
  ) {
    throw new Error(
      `Cypress database tasks require the e2e-db-data volume from Compose project ${expectedProject}.`,
    );
  }
}

/**
 * Build psql arguments for a fixed query and separately supplied variables.
 *
 * Query text must reference values through psql's SQL-literal form, for
 * example `WHERE national_id = :'national_id'`. Keeping values in their own
 * argv entry lets execFileSync avoid both shell parsing and SQL interpolation.
 */
export function buildPsqlQueryArguments(
  query,
  { outputArguments = [], variables = {} } = {},
) {
  if (typeof query !== "string" || query.trim() === "") {
    throw new TypeError("psql query must be a non-empty string");
  }

  const variableArguments = Object.entries(variables).flatMap(
    ([name, value]) => {
      if (!PSQL_VARIABLE_NAME_PATTERN.test(name)) {
        throw new TypeError(`Invalid psql variable name: ${name}`);
      }
      if (typeof value !== "string") {
        throw new TypeError(`psql variable ${name} must be a string`);
      }

      return ["-v", `${name}=${value}`];
    },
  );

  return [...outputArguments, ...variableArguments, "-c", query];
}

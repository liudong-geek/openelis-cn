/**
 * E2E Tests for Site Branding - User Story 1: Access Site Branding Configuration
 *
 * Reference: OpenELIS Testing Roadmap (.specify/guides/testing-roadmap.md)
 * Quick Reference: Cypress Best Practices (.specify/guides/cypress-best-practices.md)
 * Template: Cypress E2E Test
 *
 * Constitution V.5 Compliance Checklist:
 * - Video disabled by default (cypress.config.js)
 * - Screenshots enabled on failure (cypress.config.js)
 * - Browser console logging enabled and reviewed after each run
 * - Tests run individually during development (not full suite)
 * - Post-run review completed (console logs, screenshots, test output)
 * - Intercepts set up BEFORE actions that trigger them
 * - Uses .should() assertions for retry-ability (no arbitrary cy.wait())
 * - Element readiness checks before all interactions
 * - Focused on happy paths (user workflows, not implementation details)
 * - data-testid selectors used (PREFERRED)
 * - Viewport set before visit
 * - Session management via cy.session() (10-20x faster)
 * - API-based test data setup (10x faster than UI)
 *
 * Task Reference: T020
 *
 * Execution:
 * - Development: npm run cy:run -- --spec "cypress/e2e/siteBranding.cy.js"
 * - CI/CD: npm run cy:run (full suite)
 */

/**
 * Session Management (cy.session() - 10-20x faster)
 *
 * Login runs ONCE per test file, cached for all tests.
 */
before("Login and setup session", () => {
  // Login runs ONCE, cached for all tests
  cy.login(Cypress.env("USERNAME"), Cypress.env("PASSWORD"));
});

describe("Site Branding - User Story 1: Access Site Branding Configuration", function () {
  beforeEach(() => {
    // Viewport management (profy.dev: set viewport before visit)
    cy.viewport(1025, 900); // Desktop viewport

    // Set up API intercepts BEFORE actions that trigger them (Constitution V.5)
    cy.intercept("GET", "**/rest/site-branding").as("getBranding");
  });

  /**
   * Test: Administrator can access site branding configuration page
   * Task Reference: T020
   *
   * Testing user workflow (happy path focus):
   * - Navigate to Admin → General Configuration → Site Information → Site Branding
   * - Verify configuration page loads
   * - Verify all branding options are visible
   */
  it("should access site branding configuration page", function () {
    // Act: Navigate to site branding configuration
    cy.visit("/MasterListsPage/SiteBrandingMenu");

    // Assert: The page is backed by the real branding endpoint and renders its controls.
    cy.wait("@getBranding").then(({ response }) => {
      expect(response, "branding API response").to.exist;
      expect(response.statusCode).to.eq(200);
      expect(response.body).to.include.keys(
        "headerColor",
        "primaryColor",
        "secondaryColor",
      );

      cy.get('input[type="color"]')
        .should("have.length", 3)
        .each(($input, index) => {
          const responseColors = [
            response.body.headerColor,
            response.body.primaryColor,
            response.body.secondaryColor,
          ];
          expect($input.val().toLowerCase()).to.eq(
            responseColors[index].toLowerCase(),
          );
        });
    });

    cy.contains("h1", /界面标识与配色|Site Branding/i, {
      timeout: 10000,
    }).should("be.visible");
    cy.contains("h2", /系统标识|Logos/i).should("be.visible");
    cy.contains("h2", /界面配色|Colors/i).should("be.visible");
    cy.get('[data-testid="branding-reset-button"]').should("be.visible");
    cy.get('[data-testid="branding-cancel-button"]').should("be.disabled");
    cy.contains("button", /保存配置|Save Changes/i).should("be.disabled");
  });
});

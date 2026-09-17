import { intakeFixture } from "./intakeDecision.fixtures";

export function admissionFixture() {
  const result = intakeFixture();
  result.current.specimenDecisions.forEach((row, index) => {
    const tube = result.current.physicalSpecimens[index];
    row.resultEntryAdmission = {
      schema: 1,
      sampleId: result.current.sampleId,
      sampleItemId: tube.id,
      itemVersion: tube.lastUpdated,
      state: "READY",
      analyses: tube.analyses.map((analysis) => ({
        analysisId: analysis.id,
        testId: analysis.testId,
        analysisVersion: analysis.lastUpdated,
        allowed: true,
        blockedReason: null,
      })),
    };
  });
  return result;
}

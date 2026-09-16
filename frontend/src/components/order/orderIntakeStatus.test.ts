import { describe, expect, it } from "vitest";
import { normalizeIntakeFilter, resolveIntakeStage } from "./orderIntakeStatus";

describe("specimen intake status contract", () => {
  const exceptionalFlags = [
    ["hasRejectedSpecimens", "rejected", "order.intake.rejected"],
    [
      "hasIntakeStatusConflict",
      "status_conflict",
      "order.intake.statusConflict",
    ],
    ["hasNoActiveTests", "no_active_tests", "order.intake.noActiveTests"],
  ] as const;

  it.each(exceptionalFlags)(
    "%s overrides every preparation stage and the legacy completion flags",
    (flag, status, messageId) => {
      for (const specimenIntakeStatus of [
        "registration_pending",
        "collection_pending",
        "label_pending",
        "qa_pending",
        "checklist_complete",
      ]) {
        expect(
          resolveIntakeStage({
            [flag]: true,
            specimenIntakeStatus,
            statusScope: "preanalytic_progress",
            stepProgress: { enter: true, collect: true, label: true, qa: true },
          }),
        ).toEqual({ status, nextStep: null, completedSteps: null, messageId });
      }
      expect(resolveIntakeStage({ [flag]: true })).toEqual({
        status,
        nextStep: null,
        completedSteps: null,
        messageId,
      });
    },
  );

  it.each(exceptionalFlags)(
    "%s false does not block valid preparation work",
    (flag) => {
      expect(
        resolveIntakeStage({
          [flag]: false,
          specimenIntakeStatus: "qa_pending",
        }),
      ).toMatchObject({ nextStep: "qa", completedSteps: 3 });
    },
  );

  it.each(["hasDisposedSpecimens", ...exceptionalFlags.map(([flag]) => flag)])(
    "%s must be Boolean when explicitly supplied",
    (flag) => {
      for (const value of ["true", "false", 1, 0, null, {}, []]) {
        expect(
          resolveIntakeStage({
            [flag]: value,
            specimenIntakeStatus: "qa_pending",
          }),
        ).toMatchObject({
          status: "unknown",
          nextStep: null,
          completedSteps: null,
          messageId: "order.intake.unknown",
        });
      }
    },
  );

  it("multiple exception flags have stable priority instead of reporting completed intake", () => {
    expect(
      resolveIntakeStage({
        hasDisposedSpecimens: true,
        hasRejectedSpecimens: true,
        hasIntakeStatusConflict: true,
        hasNoActiveTests: true,
        specimenIntakeStatus: "checklist_complete",
      }),
    ).toMatchObject({
      status: "disposed",
      nextStep: null,
      completedSteps: null,
    });
  });

  it("a disposed specimen blocks new intake actions without guessing historical completion", () => {
    expect(
      resolveIntakeStage({
        hasDisposedSpecimens: true,
        specimenIntakeStatus: "label_pending",
      }),
    ).toMatchObject({
      status: "disposed",
      nextStep: null,
      completedSteps: null,
    });
  });
  it.each([
    ["registration_pending", "enter", 0],
    ["collection_pending", "collect", 1],
    ["label_pending", "label", 2],
    ["qa_pending", "qa", 3],
    ["checklist_complete", null, 4],
  ])(
    "uses server stage %s, not conflicting legacy flags",
    (status, nextStep, completedSteps) => {
      expect(
        resolveIntakeStage({
          specimenIntakeStatus: status as string,
          statusScope: "preanalytic_progress",
          stepProgress: { enter: true, collect: true, label: true, qa: true },
        }),
      ).toMatchObject({ status, nextStep, completedSteps });
    },
  );

  it.each(["report_issued", "", null, undefined])(
    "does not guess an unknown explicit server stage %s",
    (status) => {
      expect(
        resolveIntakeStage({
          specimenIntakeStatus: status,
          stepProgress: { enter: true, collect: true, label: true, qa: true },
        }),
      ).toMatchObject({
        status: "unknown",
        nextStep: null,
        completedSteps: null,
      });
    },
  );

  it("rejects a different status scope", () => {
    expect(
      resolveIntakeStage({
        specimenIntakeStatus: "checklist_complete",
        statusScope: "report",
      }).status,
    ).toBe("unknown");
  });

  it.each(["storage_pending", "intake_complete"])(
    "obsolete stage %s cannot override current label/checklist semantics",
    (specimenIntakeStatus) => {
      expect(
        resolveIntakeStage({
          specimenIntakeStatus,
          statusScope: "preanalytic_progress",
          stepProgress: { enter: true, collect: true, label: true, qa: true },
          storageSkipped: true,
        }),
      ).toMatchObject({
        status: "unknown",
        nextStep: null,
        completedSteps: null,
      });
      expect(normalizeIntakeFilter(specimenIntakeStatus)).toBe("all");
    },
  );

  it("the obsolete specimen_intake scope does not authorize a current stage", () => {
    expect(
      resolveIntakeStage({
        specimenIntakeStatus: "checklist_complete",
        statusScope: "specimen_intake",
      }).status,
    ).toBe("unknown");
  });

  it("uses the earliest unfinished legacy step, not a sum of disconnected flags", () => {
    expect(
      resolveIntakeStage({
        stepProgress: { enter: true, collect: false, label: true, qa: true },
      }),
    ).toMatchObject({
      status: "collection_pending",
      completedSteps: 1,
      nextStep: "collect",
    });
  });

  it("storage skip alone does not establish label generation", () => {
    expect(
      resolveIntakeStage({
        stepProgress: { enter: true, collect: true },
        storageSkipped: true,
      }),
    ).toMatchObject({
      status: "label_pending",
      completedSteps: 2,
      nextStep: "label",
    });
  });

  it("does not complete legacy storage for an empty sample list", () => {
    expect(
      resolveIntakeStage({
        stepProgress: { enter: true, collect: true },
        samples: [],
      }).status,
    ).toBe("label_pending");
  });

  it("storage assignments do not establish label generation", () => {
    expect(
      resolveIntakeStage({
        stepProgress: { enter: true, collect: true, qa: true },
        samples: [{ storageLocationId: "1" }],
      }).status,
    ).toBe("label_pending");
  });

  it.each([
    ["completed", "checklist_complete"],
    ["pending_qa", "qa_pending"],
    ["in_progress", "in_progress"],
    ["collection_pending", "collection_pending"],
    ["rejected", "all"],
    [undefined, "all"],
  ])("restores filter %s as %s", (legacy, expected) => {
    expect(normalizeIntakeFilter(legacy)).toBe(expected);
  });
});

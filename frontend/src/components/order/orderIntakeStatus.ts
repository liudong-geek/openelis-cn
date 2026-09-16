/** Specimen preparation only. These stages never imply a reviewed or issued report. */
const STAGES = {
  registration_pending: {
    nextStep: "enter",
    completedSteps: 0,
    messageId: "order.intake.registration.pending",
  },
  collection_pending: {
    nextStep: "collect",
    completedSteps: 1,
    messageId: "order.intake.collection.pending",
  },
  label_pending: {
    nextStep: "label",
    completedSteps: 2,
    messageId: "order.intake.label.pending",
  },
  qa_pending: {
    nextStep: "qa",
    completedSteps: 3,
    messageId: "order.intake.qa.pending",
  },
  checklist_complete: {
    nextStep: null,
    completedSteps: 4,
    messageId: "order.dashboard.checklistComplete",
  },
} as const;

type IntakeStatus = keyof typeof STAGES;
const EXCEPTIONS = [
  {
    flag: "hasDisposedSpecimens",
    status: "disposed",
    messageId: "order.intake.disposed",
  },
  {
    flag: "hasRejectedSpecimens",
    status: "rejected",
    messageId: "order.intake.rejected",
  },
  {
    flag: "hasIntakeStatusConflict",
    status: "status_conflict",
    messageId: "order.intake.statusConflict",
  },
  {
    flag: "hasNoActiveTests",
    status: "no_active_tests",
    messageId: "order.intake.noActiveTests",
  },
] as const;

type IntakeOrder = {
  hasDisposedSpecimens?: boolean;
  hasRejectedSpecimens?: boolean;
  hasIntakeStatusConflict?: boolean;
  hasNoActiveTests?: boolean;
  specimenIntakeStatus?: string | null;
  statusScope?: string;
  stepProgress?: {
    enter?: boolean;
    collect?: boolean;
    label?: boolean;
    qa?: boolean;
  };
  storageSkipped?: boolean;
  samples?: { storageLocationId?: string }[];
};

const isIntakeStatus = (status: unknown): status is IntakeStatus =>
  typeof status === "string" &&
  Object.prototype.hasOwnProperty.call(STAGES, status);

const knownStage = (status: IntakeStatus) => ({ status, ...STAGES[status] });
const unknownStage = () =>
  ({
    status: "unknown",
    nextStep: null,
    completedSteps: null,
    messageId: "order.intake.unknown",
  }) as const;

export function resolveIntakeStage(order: IntakeOrder) {
  if (
    EXCEPTIONS.some(
      ({ flag }) => flag in order && typeof order[flag] !== "boolean",
    )
  ) {
    // Missing flags support older responses; malformed explicit flags do not.
    return unknownStage();
  }
  const exception = EXCEPTIONS.find(({ flag }) => order[flag] === true);
  if (exception) {
    // Exceptional specimens do not establish historical completion or a safe next
    // task. Their persisted flags override both server stages and legacy progress.
    return {
      status: exception.status,
      nextStep: null,
      completedSteps: null,
      messageId: exception.messageId,
    } as const;
  }
  if ("specimenIntakeStatus" in order) {
    if (
      isIntakeStatus(order.specimenIntakeStatus) &&
      (!order.statusScope || order.statusScope === "preanalytic_progress")
    ) {
      return knownStage(order.specimenIntakeStatus);
    }
    // A new/invalid contract must not silently fall back to stale legacy flags.
    return unknownStage();
  }

  // Older responses may still supply progress flags. Only an explicit label
  // flag counts here; storage assignments and skipped storage are separate facts.
  const progress = order.stepProgress || {};
  if (Object.values(progress).some((value) => typeof value !== "boolean"))
    return unknownStage();
  if (progress.enter !== true) return knownStage("registration_pending");
  if (progress.collect !== true) return knownStage("collection_pending");
  if (progress.label !== true) return knownStage("label_pending");
  if (progress.qa !== true) return knownStage("qa_pending");
  return knownStage("checklist_complete");
}

export function normalizeIntakeFilter(value?: string) {
  if (value === "completed") return "checklist_complete";
  if (value === "pending_qa") return "qa_pending";
  // Preserve an existing aggregate filter; it represents the first three stages.
  if (value === "in_progress" || isIntakeStatus(value)) return value;
  return "all";
}

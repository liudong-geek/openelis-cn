const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HOUR_MINUTE = /^(\d{2}):(\d{2})$/;

export const normalizeServerClock = (response) => {
  const date = response?.date;
  const time = response?.time;
  const timezone = response?.timezone;
  const dateParts = typeof date === "string" && ISO_DATE.exec(date);
  const timeParts = typeof time === "string" && HOUR_MINUTE.exec(time);
  if (!dateParts || !timeParts || typeof timezone !== "string" || !timezone)
    return null;

  const [, year, month, day] = dateParts;
  const [, hour, minute] = timeParts;
  const calendarDate = new Date(Date.UTC(+year, +month - 1, +day));
  if (
    calendarDate.toISOString().slice(0, 10) !== date ||
    +hour > 23 ||
    +minute > 59
  )
    return null;

  const normalized = { date, time, timezone };
  if (response.instant !== undefined) {
    const instant = response.instant;
    if (
      typeof instant !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(
        instant,
      ) ||
      !Number.isFinite(Date.parse(instant)) ||
      new Date(instant).toISOString().slice(0, 10) !== instant.slice(0, 10)
    )
      return null;
    normalized.instant = instant;
  }
  return normalized;
};

export const isFutureCollectionTimestamp = (sample, serverClock) => {
  if (!serverClock || !sample?.collectionDate || !sample?.collectionTime)
    return false;
  if (
    !ISO_DATE.test(sample.collectionDate) ||
    !HOUR_MINUTE.test(sample.collectionTime)
  )
    return false;
  // Both values are wall-clock fields in the laboratory server's time zone.
  // ISO date and 24-hour time sort chronologically without browser parsing.
  return (
    `${sample.collectionDate}T${sample.collectionTime}` >
    `${serverClock.date}T${serverClock.time}`
  );
};

export const collectionDefaultsFor = (
  sample,
  serverClock,
  receiptMode = "now",
) => {
  if (sample.sampleItemId || !serverClock) return {};
  const updates = {};
  if (!sample.collectionDate && !sample.collectionDateUserEdited)
    updates.collectionDate = serverClock.date;
  if (!sample.collectionTime && !sample.collectionTimeUserEdited)
    updates.collectionTime = serverClock.time;
  if (
    receiptMode === "now" &&
    !sample.receivedDate &&
    !sample.receivedDateUserEdited
  )
    updates.receivedDate = serverClock.date;
  if (
    receiptMode === "now" &&
    !sample.receivedTime &&
    !sample.receivedTimeUserEdited
  )
    updates.receivedTime = serverClock.time;
  return updates;
};

export const refreshUntouchedCollectionClock = (
  samples,
  serverClock,
  receiptMode = "now",
) =>
  samples.map((sample) => {
    if (sample.sampleItemId || !sample.sampleTypeId || !serverClock)
      return sample;
    return {
      ...sample,
      ...(!sample.collectionDateUserEdited
        ? { collectionDate: serverClock.date }
        : {}),
      ...(!sample.collectionTimeUserEdited
        ? { collectionTime: serverClock.time }
        : {}),
      ...(receiptMode === "now" && !sample.receivedDateUserEdited
        ? { receivedDate: serverClock.date }
        : {}),
      ...(receiptMode === "now" && !sample.receivedTimeUserEdited
        ? { receivedTime: serverClock.time }
        : {}),
      ...(receiptMode === "later"
        ? { receivedDate: "", receivedTime: "" }
        : {}),
    };
  });

export const hasPendingClockDefaults = (samples, receiptMode = "now") =>
  samples.some(
    (sample) =>
      !sample.sampleItemId &&
      sample.sampleTypeId &&
      ((!sample.collectionDate && !sample.collectionDateUserEdited) ||
        (!sample.collectionTime && !sample.collectionTimeUserEdited) ||
        (receiptMode === "now" &&
          !sample.receivedDate &&
          !sample.receivedDateUserEdited) ||
        (receiptMode === "now" &&
          !sample.receivedTime &&
          !sample.receivedTimeUserEdited)),
  );

export const hasInvalidReceiptPair = (samples, receiptMode = "now") =>
  samples.some((sample) => {
    if (!sample.sampleTypeId) return false;
    const hasDate = Boolean(sample.receivedDate);
    const hasTime = Boolean(sample.receivedTime);
    if (sample.sampleItemId) return hasDate !== hasTime;
    return receiptMode === "now" ? !hasDate || !hasTime : hasDate || hasTime;
  });

export const mergePendingCollectionSamples = (
  requestedSamples,
  currentSamples,
) =>
  requestedSamples.map((request) => {
    const matchedByRequest = currentSamples.find(
      (sample) =>
        sample.sampleTypeRequestId &&
        String(sample.sampleTypeRequestId) ===
          String(request.sampleTypeRequestId),
    );
    const sameType = (sample) =>
      String(sample.sampleTypeId) === String(request.sampleTypeId);
    const uniqueTypeFallback =
      requestedSamples.filter(sameType).length === 1 &&
      currentSamples.filter(sameType).length === 1;
    const unboundSameType = currentSamples.find(
      (sample) => sameType(sample) && !sample.sampleTypeRequestId,
    );
    const existing =
      matchedByRequest || (uniqueTypeFallback ? unboundSameType : undefined);
    if (!existing || !sameType(existing)) return request;

    return {
      ...request,
      collectorId: existing.collectorId || request.collectorId,
      collectionConditions:
        existing.collectionConditions || request.collectionConditions,
      receivedDate: existing.receivedDateUserEdited
        ? existing.receivedDate
        : existing.receivedDate || request.receivedDate,
      receivedTime: existing.receivedTimeUserEdited
        ? existing.receivedTime
        : existing.receivedTime || request.receivedTime,
      collectionDate: existing.collectionDateUserEdited
        ? existing.collectionDate
        : request.collectionDate,
      collectionTime: existing.collectionTimeUserEdited
        ? existing.collectionTime
        : request.collectionTime,
      collectionDateUserEdited: existing.collectionDateUserEdited || false,
      collectionTimeUserEdited: existing.collectionTimeUserEdited || false,
      receivedDateUserEdited: existing.receivedDateUserEdited || false,
      receivedTimeUserEdited: existing.receivedTimeUserEdited || false,
    };
  });

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

  return { date, time, timezone };
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

export const collectionDefaultsFor = (sample, serverClock) => {
  if (sample.sampleItemId || !serverClock) return {};
  const updates = {};
  if (!sample.collectionDate && !sample.collectionDateUserEdited)
    updates.collectionDate = serverClock.date;
  if (!sample.collectionTime && !sample.collectionTimeUserEdited)
    updates.collectionTime = serverClock.time;
  if (!sample.receivedDate && !sample.receivedDateUserEdited)
    updates.receivedDate = serverClock.date;
  if (!sample.receivedTime && !sample.receivedTimeUserEdited)
    updates.receivedTime = serverClock.time;
  return updates;
};

export const refreshUntouchedCollectionClock = (samples, serverClock) =>
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
      ...(!sample.receivedDateUserEdited
        ? { receivedDate: serverClock.date }
        : {}),
      ...(!sample.receivedTimeUserEdited
        ? { receivedTime: serverClock.time }
        : {}),
    };
  });

export const hasPendingClockDefaults = (samples) =>
  samples.some(
    (sample) =>
      !sample.sampleItemId &&
      sample.sampleTypeId &&
      ((!sample.collectionDate && !sample.collectionDateUserEdited) ||
        (!sample.collectionTime && !sample.collectionTimeUserEdited) ||
        (!sample.receivedDate && !sample.receivedDateUserEdited) ||
        (!sample.receivedTime && !sample.receivedTimeUserEdited)),
  );

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

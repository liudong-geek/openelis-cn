import React, { useContext, useEffect, useRef, useState } from "react";
import { Checkbox, InlineLoading } from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { getFromOpenElisServer, putToOpenElisServer } from "../../utils/Utils";
import { NotificationContext } from "../../layout/Layout";

const DAY_KEYS = [
  "calendar.management.day.sun",
  "calendar.management.day.mon",
  "calendar.management.day.tue",
  "calendar.management.day.wed",
  "calendar.management.day.thu",
  "calendar.management.day.fri",
  "calendar.management.day.sat",
];

export default function WeekendConfig() {
  const intl = useIntl();
  const { addNotification, setNotificationVisible } =
    useContext(NotificationContext);
  const savedTimerRef = useRef(null);
  const [weekendDays, setWeekendDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    getFromOpenElisServer("/rest/calendar/weekends", (response) => {
      setWeekendDays(
        Array.isArray(response?.weekendDays) ? response.weekendDays : [],
      );
      setLoading(false);
    });
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleToggle = (dayNumber, checked) => {
    const previous = [...weekendDays];
    const next = (
      checked
        ? [...weekendDays, dayNumber]
        : weekendDays.filter((day) => day !== dayNumber)
    ).sort((left, right) => left - right);
    setWeekendDays(next);
    setSaving(true);
    setShowSaved(false);
    putToOpenElisServer(
      "/rest/calendar/weekends",
      JSON.stringify({ weekendDays: next }),
      (status) => {
        setSaving(false);
        if (status === 200) {
          setShowSaved(true);
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setShowSaved(false), 3000);
          return;
        }
        setWeekendDays(previous);
        addNotification({
          kind: "error",
          title: intl.formatMessage({ id: "calendar.management.saveError" }),
        });
        setNotificationVisible(true);
      },
    );
  };

  return (
    <section className="calendar-weekend-panel">
      <header>
        <div>
          <h2>
            <FormattedMessage id="calendar.management.weekendDays" />
          </h2>
          <p>
            <FormattedMessage id="calendar.management.weekendHelper" />
          </p>
        </div>
        <div className="calendar-weekend-panel__status" role="status">
          {loading || saving ? (
            <InlineLoading
              description={intl.formatMessage({
                id: loading
                  ? "calendar.management.weekendLoading"
                  : "calendar.management.weekendUpdating",
              })}
            />
          ) : showSaved ? (
            <FormattedMessage id="calendar.management.weekendSaved" />
          ) : null}
        </div>
      </header>
      <div className="calendar-weekend-panel__days">
        {DAY_KEYS.map((key, index) => (
          <div
            className={
              weekendDays.includes(index)
                ? "calendar-weekend-panel__day calendar-weekend-panel__day--selected"
                : "calendar-weekend-panel__day"
            }
            key={key}
          >
            <Checkbox
              id={`weekend-checkbox-${index}`}
              data-testid={`weekend-checkbox-${index}`}
              labelText={intl.formatMessage({ id: key })}
              checked={weekendDays.includes(index)}
              disabled={loading || saving}
              onChange={(_event, { checked }) => handleToggle(index, checked)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

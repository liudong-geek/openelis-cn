import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Column, Dropdown, Button } from "@carbon/react";
import { ZoomIn, ZoomOut, Renew, Download } from "@carbon/icons-react";
import { LineChart } from "@carbon/charts-react";
import { useIntl } from "react-intl";
import "@carbon/charts/styles.css";

import "./HistoricalTrends.scss";
import { fetchHistoricalReadings } from "./api";
import { toDate } from "./shared/timeUtils";

const TIME_RANGE_OPTIONS = ["24h", "7d", "30d", "all"];
const ALL_FREEZERS = "__ALL_FREEZERS__";

const RANGE_TO_DURATION = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  all: 90 * 24 * 60 * 60 * 1000,
};

const MAX_SERIES = 5;

const getRangeBoundaries = (timeRange) => {
  const duration = RANGE_TO_DURATION[timeRange] ?? RANGE_TO_DURATION["24h"];
  const end = new Date();
  const start = new Date(end.getTime() - duration);
  return { start: start.toISOString(), end: end.toISOString() };
};

const formatTrendLabel = (value) => {
  const date = toDate(value);
  if (!date) {
    return "—";
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function HistoricalTrends({
  devices = [],
  initialSelectedFreezerId = null,
  onFreezerSelected,
}) {
  const intl = useIntl();
  const [selectedFreezer, setSelectedFreezer] = useState(
    initialSelectedFreezerId || ALL_FREEZERS,
  );
  const [timeRange, setTimeRange] = useState("24h");
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const freezerOptions = useMemo(() => {
    const uniqueDevices = devices.filter(
      (device, index, self) =>
        device.id && self.findIndex((d) => d.id === device.id) === index,
    );
    const names = uniqueDevices.map(
      (device) =>
        device.unitName ||
        intl.formatMessage(
          { id: "coldStorage.device.fallbackName" },
          { id: device.id },
        ),
    );
    return [ALL_FREEZERS, ...names];
  }, [devices, intl]);

  const freezerNameToIdMap = useMemo(() => {
    const map = {};
    devices.forEach((device) => {
      if (device.id) {
        const name =
          device.unitName ||
          intl.formatMessage(
            { id: "coldStorage.device.fallbackName" },
            { id: device.id },
          );
        map[name] = device.id;
      }
    });
    return map;
  }, [devices, intl]);

  const loadReadings = useCallback(async () => {
    if (!devices.length) {
      setChartData([]);
      return;
    }
    const ids =
      selectedFreezer === ALL_FREEZERS
        ? devices
            .map((device) => device.id)
            .filter(Boolean)
            .slice(0, MAX_SERIES)
        : [freezerNameToIdMap[selectedFreezer] || devices[0]?.id].filter(
            Boolean,
          );

    if (!ids.length) {
      setChartData([]);
      return;
    }

    setLoading(true);
    setError(null);
    const { start, end } = getRangeBoundaries(timeRange);

    try {
      const responses = await Promise.all(
        ids.map((id) =>
          fetchHistoricalReadings(id, start, end).then((data) => ({
            freezerId: id,
            readings: data || [],
          })),
        ),
      );

      const normalized = responses.flatMap(({ freezerId, readings }) => {
        const device = devices.find((d) => d.id === freezerId);
        const freezerName =
          device?.unitName ||
          intl.formatMessage(
            { id: "coldStorage.device.fallbackName" },
            { id: freezerId },
          );
        return readings
          .filter((reading) => reading.temperatureCelsius != null)
          .map((reading) => ({
            group: freezerName,
            key: formatTrendLabel(reading.recordedAt),
            value: reading.temperatureCelsius,
          }));
      });

      setChartData(normalized);
    } catch (apiError) {
      setError(
        intl.formatMessage({ id: "coldStorage.trends.error.loadFailed" }),
      );
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, [devices, selectedFreezer, timeRange, freezerNameToIdMap, intl]);

  useEffect(() => {
    loadReadings();
  }, [loadReadings]);

  useEffect(() => {
    if (
      initialSelectedFreezerId &&
      devices.some((device) => device.id === initialSelectedFreezerId)
    ) {
      const device = devices.find((d) => d.id === initialSelectedFreezerId);
      const freezerName =
        device?.unitName ||
        intl.formatMessage(
          { id: "coldStorage.device.fallbackName" },
          { id: initialSelectedFreezerId },
        );
      setSelectedFreezer(freezerName);
      if (onFreezerSelected) {
        onFreezerSelected(initialSelectedFreezerId);
      }
    }
  }, [initialSelectedFreezerId, devices, onFreezerSelected, intl]);

  useEffect(() => {
    if (
      selectedFreezer !== ALL_FREEZERS &&
      !freezerNameToIdMap[selectedFreezer]
    ) {
      setSelectedFreezer(ALL_FREEZERS);
    }
  }, [devices, selectedFreezer, freezerNameToIdMap]);

  const stats = useMemo(() => {
    if (!chartData.length) {
      return { avg: "-", min: "-", max: "-", count: 0 };
    }
    const values = chartData.map((d) => d.value);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
      avg: avg.toFixed(1),
      min: min.toFixed(1),
      max: max.toFixed(1),
      count: values.length,
    };
  }, [chartData]);

  const chartOptions = useMemo(
    () => ({
      title: "",
      axes: {
        bottom: {
          title: "",
          mapsTo: "key",
          scaleType: "labels",
        },
        left: {
          title: intl.formatMessage({ id: "coldStorage.temperature.celsius" }),
          mapsTo: "value",
          scaleType: "linear",
        },
      },
      legend: {
        position: "bottom",
      },
      height: `${400 * zoomLevel}px`,
      tooltip: {
        showTotal: false,
      },
    }),
    [intl, zoomLevel],
  );

  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleReset = useCallback(() => {
    setZoomLevel(1);
    loadReadings();
  }, [loadReadings]);

  const handleExportCsv = useCallback(() => {
    if (!chartData.length) {
      return;
    }

    // Create CSV content
    const headers = [
      intl.formatMessage({ id: "coldStorage.device.type.freezer" }),
      intl.formatMessage({ id: "coldStorage.timestamp" }),
      intl.formatMessage({ id: "coldStorage.temperature.celsius" }),
    ];
    const rows = chartData.map((item) => [item.group, item.key, item.value]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    // Create blob and download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `冰箱温度数据-${timestamp}.csv`;

    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [chartData, intl]);

  return (
    <div className="hist-trends-page">
      <Grid fullWidth>
        <Column lg={16} md={8} sm={4}>
          <h3 className="hist-title">
            {intl.formatMessage({ id: "coldStorage.trends.title" })}
          </h3>
        </Column>
      </Grid>

      <Grid fullWidth className="hist-filter-row">
        <Column lg={6} md={4} sm={4}>
          <Dropdown
            id="freezer-filter"
            titleText={intl.formatMessage({
              id: "coldStorage.device.type.freezer",
            })}
            label={
              selectedFreezer === ALL_FREEZERS
                ? intl.formatMessage({ id: "coldStorage.trends.allFreezers" })
                : selectedFreezer
            }
            items={freezerOptions}
            itemToString={(item) =>
              item === ALL_FREEZERS
                ? intl.formatMessage({ id: "coldStorage.trends.allFreezers" })
                : item || ""
            }
            selectedItem={selectedFreezer}
            onChange={({ selectedItem }) => {
              setSelectedFreezer(selectedItem);
              if (onFreezerSelected) {
                onFreezerSelected(selectedItem);
              }
            }}
          />
        </Column>
        <Column lg={4} md={4} sm={4}>
          <Dropdown
            id="time-range-filter"
            titleText={intl.formatMessage({
              id: "coldStorage.trends.timeRange",
            })}
            label={intl.formatMessage({
              id: `coldStorage.trends.range.${timeRange}`,
            })}
            items={TIME_RANGE_OPTIONS}
            itemToString={(item) =>
              item
                ? intl.formatMessage({
                    id: `coldStorage.trends.range.${item}`,
                  })
                : ""
            }
            selectedItem={timeRange}
            onChange={({ selectedItem }) => setTimeRange(selectedItem)}
          />
        </Column>

        <Column lg={16} md={8} sm={4} className="hist-toolbar">
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ZoomIn}
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3}
          >
            {intl.formatMessage({ id: "coldStorage.trends.zoomIn" })}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ZoomOut}
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.25}
          >
            {intl.formatMessage({ id: "coldStorage.trends.zoomOut" })}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Renew}
            onClick={handleReset}
          >
            {intl.formatMessage({ id: "coldStorage.trends.reset" })}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Download}
            onClick={handleExportCsv}
            disabled={!chartData.length}
          >
            {intl.formatMessage({ id: "coldStorage.trends.export" })}
          </Button>
        </Column>
      </Grid>

      <Grid fullWidth>
        <Column lg={16} md={8} sm={4}>
          <div className="hist-chart-card">
            {error && <p className="hist-error">{error}</p>}
            {loading ? (
              <p className="hist-placeholder">
                {intl.formatMessage({ id: "coldStorage.trends.loading" })}
              </p>
            ) : chartData.length === 0 ? (
              <p className="hist-placeholder">
                {intl.formatMessage({ id: "coldStorage.trends.empty" })}
              </p>
            ) : (
              <LineChart data={chartData} options={chartOptions} />
            )}
          </div>
        </Column>
      </Grid>

      <Grid fullWidth className="hist-kpis">
        <Column lg={4} md={4} sm={4}>
          <div className="hist-kpi-card">
            <p className="hist-kpi-label">
              {intl.formatMessage({ id: "coldStorage.trends.average" })}
            </p>
            <p className="hist-kpi-value">
              {stats.avg === "-" ? "-" : `${stats.avg}°C`}
            </p>
          </div>
        </Column>
        <Column lg={4} md={4} sm={4}>
          <div className="hist-kpi-card">
            <p className="hist-kpi-label">
              {intl.formatMessage({ id: "coldStorage.trends.minimum" })}
            </p>
            <p className="hist-kpi-value hist-kpi-min">
              {stats.min === "-" ? "-" : `${stats.min}°C`}
            </p>
          </div>
        </Column>
        <Column lg={4} md={4} sm={4}>
          <div className="hist-kpi-card">
            <p className="hist-kpi-label">
              {intl.formatMessage({ id: "coldStorage.trends.maximum" })}
            </p>
            <p className="hist-kpi-value hist-kpi-max">
              {stats.max === "-" ? "-" : `${stats.max}°C`}
            </p>
          </div>
        </Column>
        <Column lg={4} md={4} sm={4}>
          <div className="hist-kpi-card">
            <p className="hist-kpi-label">
              {intl.formatMessage({ id: "coldStorage.trends.dataPoints" })}
            </p>
            <p className="hist-kpi-value">{stats.count.toLocaleString()}</p>
          </div>
        </Column>
      </Grid>

      <Grid fullWidth>
        <Column lg={16} md={8} sm={4}>
          <p className="hist-footer">
            {intl.formatMessage({
              id: "coldStorage.dashboard.complianceNotice",
            })}
          </p>
        </Column>
      </Grid>
    </div>
  );
}

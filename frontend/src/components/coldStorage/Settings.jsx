import React, { useState, useContext } from "react";
import {
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Heading,
} from "@carbon/react";
import { Settings as SettingsIcon } from "@carbon/icons-react";
import { injectIntl } from "react-intl";
import DeviceManagement from "./settings/DeviceManagement";
import TemperatureThresholds from "./settings/TemperatureThresholds";
import AlertSettings from "./settings/AlertSettings";
import SystemSettings from "./settings/SystemSettings";
import { AlertDialog } from "../common/CustomNotification";
import { NotificationContext } from "../layout/Layout";

function Settings({ intl }) {
  const [selectedTab, setSelectedTab] = useState(0);
  const { notificationVisible } = useContext(NotificationContext);

  return (
    <div style={{ padding: "1rem 0" }}>
      {notificationVisible === true ? <AlertDialog /> : ""}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <SettingsIcon size={24} />
        <Heading>
          {intl.formatMessage({ id: "coldStorage.settings.title" })}
        </Heading>
      </div>

      <Tabs
        selectedIndex={selectedTab}
        onChange={({ selectedIndex }) => setSelectedTab(selectedIndex)}
      >
        <TabList
          aria-label={intl.formatMessage({
            id: "coldStorage.settings.tabs.ariaLabel",
          })}
          contained
        >
          <Tab>
            {intl.formatMessage({ id: "coldStorage.deviceManagement" })}
          </Tab>
          <Tab>
            {intl.formatMessage({ id: "coldStorage.thresholdConfiguration" })}
          </Tab>
          <Tab>
            {intl.formatMessage({ id: "coldStorage.alertConfiguration" })}
          </Tab>
          <Tab>
            {intl.formatMessage({ id: "coldStorage.systemConfiguration" })}
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <DeviceManagement />
          </TabPanel>
          <TabPanel>
            <TemperatureThresholds />
          </TabPanel>
          <TabPanel>
            <AlertSettings />
          </TabPanel>
          <TabPanel>
            <SystemSettings />
          </TabPanel>
        </TabPanels>
      </Tabs>
      <div style={{ marginTop: "1rem" }}>
        <p className="hist-footer">
          {intl.formatMessage({ id: "coldStorage.reports.footer" })}
        </p>
      </div>
    </div>
  );
}

export default injectIntl(Settings);

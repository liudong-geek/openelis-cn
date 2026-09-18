/**
 * AnalyzersPage Route Component
 *
 * Page component integrating AnalyzersList
 */

import React from "react";
import AnalyzersList from "../components/analyzers/AnalyzersList/AnalyzersList";
import ManagementWorkspaceSwitcher from "../components/management/ManagementWorkspaceSwitcher";

const AnalyzersPage = () => {
  return (
    <>
      <ManagementWorkspaceSwitcher activeView="analyzers" />
      <AnalyzersList />
    </>
  );
};

export default AnalyzersPage;

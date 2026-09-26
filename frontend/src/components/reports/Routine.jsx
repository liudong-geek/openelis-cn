import React from "react";
import { Redirect } from "react-router-dom";
import { DEFAULT_ROUTINE_REPORT_PATH } from "./routineReportNavigation";

const Routine = () => <Redirect to={DEFAULT_ROUTINE_REPORT_PATH} />;

export default Routine;

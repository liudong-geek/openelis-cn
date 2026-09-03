import React from "react";
import { render } from "@testing-library/react";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import FindOrder from "./Index";

test.each([
  ["/SampleEdit", "/order", ""],
  [
    "/SampleEdit?accessionNumber=DEMO-12",
    "/ModifyOrder",
    "?accessionNumber=DEMO-12",
  ],
  [
    "/SampleEdit?patientId=42&type=readonly",
    "/ModifyOrder",
    "?patientId=42&type=readonly",
  ],
])(
  "keeps the old application bookmark %s compatible",
  (path, target, query) => {
    const history = createMemoryHistory({ initialEntries: [path] });
    render(
      <Router history={history}>
        <FindOrder />
      </Router>,
    );
    expect(history.location.pathname).toBe(target);
    expect(history.location.search).toBe(query);
  },
);

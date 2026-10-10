import React from "react";
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import messages from "../../languages/zh.json";
import GlobalAdminConfiguration from "./GlobalAdminConfiguration";

test.each([
  [{ authenticated: true, roles: ["Global Administrator"] }, true],
  [{ authenticated: true, roles: ["User Account Administrator"] }, false],
  [{ authenticated: true, roles: ["Results", "Validation"] }, false],
  [{ authenticated: false, roles: ["Global Administrator"] }, false],
  [{ authenticated: true }, false],
])(
  "requires the actual authenticated global role before mounting an editor",
  (session, allowed) => {
    render(
      <IntlProvider locale="zh" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: session }}
        >
          <GlobalAdminConfiguration>
            <div>真实配置编辑器</div>
          </GlobalAdminConfiguration>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>,
    );
    if (allowed) expect(screen.getByText("真实配置编辑器")).toBeVisible();
    else {
      expect(screen.queryByText("真实配置编辑器")).not.toBeInTheDocument();
      expect(screen.getByText("当前账号没有此配置的维护权限。")).toBeVisible();
    }
  },
);

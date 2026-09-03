import type { Context } from "react";

export interface UserSessionDetailsValue {
  authenticated?: boolean;
  roles?: string[];
  [key: string]: unknown;
}

export interface UserSessionDetailsContextValue {
  userSessionDetails?: UserSessionDetailsValue;
  [key: string]: unknown;
}

declare const UserSessionDetailsContext: Context<UserSessionDetailsContextValue>;

export default UserSessionDetailsContext;

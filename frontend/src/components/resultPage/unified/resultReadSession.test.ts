import { resultReadSessionKey } from "./resultReadSession";
import { sessionReady, entrySession } from "./resultEntryState";
const user = {
  authenticated: true,
  userId: "701",
  sessionId: "SIM-SESSION",
  csrf: "SIM-MASK-A",
  roles: ["Results"],
  loginLabUnit: "4",
  userLabRolesMap: { 4: ["Results"] },
};
test("read identity ignores valid CSRF masks while the existing write guard remains strict", () => {
  localStorage.setItem("CSRF", "SIM-MASK-B");
  const context = { userSessionDetails: user };
  expect(resultReadSessionKey(context)).not.toBeNull();
  expect(
    resultReadSessionKey({
      userSessionDetails: { ...user, csrf: "SIM-MASK-B" },
    }),
  ).toBe(resultReadSessionKey(context));
  expect(sessionReady(context, entrySession(context))).toBe(false);
});
test.each([
  { userSessionDetails: { ...user, authenticated: false } },
  { userSessionDetails: { ...user, roles: ["Validation"] } },
  { userSessionDetails: { ...user, roles: undefined } },
  { userSessionDetails: { ...user, sessionId: "" } },
  { userSessionDetails: user, errorLoadingSessionDetails: true },
  { userSessionDetails: user, sessionPhase: "checking" },
])(
  "unverified reads cannot treat a missing role or identity as authorization: %j",
  (context) => {
    expect(resultReadSessionKey(context)).toBeNull();
  },
);
test.each([
  { userId: "702" },
  { sessionId: "SIM-NEXT" },
  { roles: ["Results", "Validation"] },
  { loginLabUnit: "5" },
  { userLabRolesMap: { 5: ["Results"] } },
])(
  "actor, session and permission scope remain part of the read key: %j",
  (change) => {
    expect(
      resultReadSessionKey({ userSessionDetails: { ...user, ...change } }),
    ).not.toBe(resultReadSessionKey({ userSessionDetails: user }));
  },
);

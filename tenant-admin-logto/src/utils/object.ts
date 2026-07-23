// @ts-nocheck — vendored from logto-io/logto packages/console (typechecked upstream)
export const removeFalsyValues = (object: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value));

/** Cloud plan helpers shimmed for self-host: never a paid/pro plan. */
export const isPaidPlan = (..._args: unknown[]) => false;
export const isProPlan = (..._args: unknown[]) => false;
export const isFreePlan = (..._args: unknown[]) => true;

/** Cloud analytics shim: no conversion tracking in the self-hosted portal. */
export const GtagConversionId = Object.freeze({
  CreateFirstApp: 'create_first_app',
  SignUp: 'sign_up',
  PurchaseProPlan: 'purchase_pro_plan',
}) as Record<string, string>;

export const reportToGoogle = (..._args: unknown[]) => {
  // Intentionally a no-op.
};

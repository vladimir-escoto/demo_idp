/**
 * Shim: the console offers assigning Management-API roles to a new M2M app.
 * That is an identity-admin capability, intentionally absent from the tenant
 * portal, so this modal renders nothing (the creation flow simply completes).
 */
export default function RoleAssignmentModal(_props: Record<string, unknown>) {
  return null;
}

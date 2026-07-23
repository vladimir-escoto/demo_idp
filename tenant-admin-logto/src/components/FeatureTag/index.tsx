/**
 * OSS/self-host build: cloud paywall and plan tags never apply, so all tags
 * render nothing while keeping the console components' import surface intact.
 */
type AnyProps = Record<string, unknown>;

export type PaywallPlanId = 'pro' | 'enterprise';

function FeatureTag(_props: AnyProps) {
  return null;
}

export default FeatureTag;

export function BetaTag(_props: AnyProps) {
  return null;
}

export function CloudTag(_props: AnyProps) {
  return null;
}

export function CombinedAddOnAndFeatureTag(_props: AnyProps) {
  return null;
}

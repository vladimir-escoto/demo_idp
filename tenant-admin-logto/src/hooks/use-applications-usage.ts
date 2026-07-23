/** Cloud usage-limit shim: self-hosted has no app quotas. */
const useApplicationsUsage = () => ({
  hasAppsReachedLimit: false,
  hasAppsSurpassedLimit: false,
  hasMachineToMachineAppsReachedLimit: false,
  hasMachineToMachineAppsSurpassedLimit: false,
  hasThirdPartyAppsReachedLimit: false,
  hasSamlAppsReachedLimit: false,
});

export default useApplicationsUsage;

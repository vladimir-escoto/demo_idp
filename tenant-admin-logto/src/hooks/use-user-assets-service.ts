/**
 * Shim: this self-hosted instance has no user-assets (S3) service configured,
 * so image fields fall back to plain URL inputs — which is exactly what the
 * tenant portal wants (PRD asks for logo/favicon URL inputs).
 */
const useUserAssetsService = () => ({ isReady: false, isLoading: false });

export default useUserAssetsService;

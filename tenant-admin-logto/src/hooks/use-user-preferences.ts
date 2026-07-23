/** Console user-preferences shim: nothing is persisted in this portal. */
const useUserPreferences = () => ({
  data: {} as Record<string, unknown>,
  isLoading: false,
  isLoaded: true,
  error: undefined,
  update: async (_values: Record<string, unknown>) => {},
});

export default useUserPreferences;

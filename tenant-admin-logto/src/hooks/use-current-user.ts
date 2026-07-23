/** Console profile-API shim: the portal has no /api/me profile endpoint. */
const useCurrentUser = () => ({
  user: undefined,
  isLoading: false,
  isLoaded: true,
  error: undefined,
  reload: async () => {},
});

export default useCurrentUser;

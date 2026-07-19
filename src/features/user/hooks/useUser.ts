import getUserQuery from "../api/user.queries";

const useUser = () => {
  const { data, isLoading, isError, refetch } = getUserQuery();

  return {
    user: data,
    isLoading,
    isError,
    refetch,
  };
};

export default useUser;

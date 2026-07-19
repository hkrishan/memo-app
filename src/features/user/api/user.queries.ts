import { useQuery } from "@tanstack/react-query";
import userApi from "./user.api";

const getUserQuery = () => {
  return useQuery({
    queryKey: ["user", "me"],
    queryFn: userApi.getMe,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export default getUserQuery;

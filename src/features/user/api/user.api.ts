import { endpoints, httpClient } from "@/lib/api";
import { User } from "../types/user.types";

const userApi = {
  getMe: async (): Promise<User> =>
    httpClient.get<User>(endpoints.user.profile),
};

export default userApi;

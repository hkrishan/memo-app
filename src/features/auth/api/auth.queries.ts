import { useMutation } from "@tanstack/react-query";
import authApi from "./auth.api";
import { EmailLoginRequest, EmailRegisterRequest } from "../types/auth.types";

/**
 * Google login mutation
 */
export const useGoogleLogin = () => {
  return useMutation({
    mutationKey: ["auth", "google"],
    mutationFn: (idToken: string) => authApi.googleLogin(idToken),
  });
};

/**
 * Apple login mutation
 */
export const useAppleLogin = () => {
  return useMutation({
    mutationKey: ["auth", "apple"],
    mutationFn: (data: {
      identityToken: string;
      authorizationCode: string;
      user?: { email?: string; name?: { firstName?: string; lastName?: string } };
    }) => authApi.appleLogin(data),
  });
};

/**
 * Facebook login mutation
 */
export const useFacebookLogin = () => {
  return useMutation({
    mutationKey: ["auth", "facebook"],
    mutationFn: (accessToken: string) => authApi.facebookLogin(accessToken),
  });
};

/**
 * Email login mutation
 */
export const useEmailLogin = () => {
  return useMutation({
    mutationKey: ["auth", "emailLogin"],
    mutationFn: (data: EmailLoginRequest) => authApi.emailLogin(data),
  });
};

/**
 * Email register mutation
 */
export const useEmailRegister = () => {
  return useMutation({
    mutationKey: ["auth", "emailRegister"],
    mutationFn: (data: EmailRegisterRequest) => authApi.emailRegister(data),
  });
};

/**
 * Logout mutation
 */
export const useLogout = () => {
  return useMutation({
    mutationKey: ["auth", "logout"],
    mutationFn: () => authApi.logout(),
  });
};

/**
 * Test login mutation (development only)
 */
export const useTestLogin = () => {
  return useMutation({
    mutationKey: ["auth", "testLogin"],
    mutationFn: (userId: string) => authApi.testLogin(userId),
  });
};

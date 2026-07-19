import Constants from "expo-constants";

type EnvConfig = {
  API_URL: string;
  APP_ENV: "development" | "production" | "staging";
};

class Env {
  private config: EnvConfig;

  constructor() {
    const extra = Constants.expoConfig?.extra;

    if (!extra?.apiUrl) {
      throw new Error(
        "Environment variables not configured. Make sure app.config.js is set up correctly.",
      );
    }

    this.config = {
      API_URL: extra.apiUrl,
      APP_ENV: extra.appEnv || "development",
    };

    // Always log environment config to verify correct env is loaded
    console.log(`🔧 Environment Config [${this.config.APP_ENV}]:`, {
      API_URL: this.config.API_URL,
      APP_ENV: this.config.APP_ENV,
    });
  }

  get apiUrl(): string {
    return this.config.API_URL;
  }

  get environment(): string {
    return this.config.APP_ENV;
  }

  get isDevelopment(): boolean {
    return this.config.APP_ENV === "development";
  }

  get isProduction(): boolean {
    return this.config.APP_ENV === "production";
  }
}

export const env = new Env();

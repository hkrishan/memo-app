import Constants from "expo-constants";

type EnvConfig = {
  API_URL: string;
  SOCKET_URL: string;
  APP_ENV: "development" | "production" | "staging";
};

const DEFAULT_SOCKET_PORT = "3031";

/**
 * Derive the socket server URL from the API url when no explicit
 * SOCKET_URL is configured: same host, socket port, no path.
 * e.g. http://192.168.1.111:3026/v1 -> http://192.168.1.111:3031
 */
function deriveSocketUrl(apiUrl: string): string {
  const match = apiUrl.match(/^(https?:\/\/[^/:]+)(?::\d+)?/);
  if (match) {
    return `${match[1]}:${DEFAULT_SOCKET_PORT}`;
  }
  return `http://localhost:${DEFAULT_SOCKET_PORT}`;
}

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
      SOCKET_URL: extra.socketUrl || deriveSocketUrl(extra.apiUrl),
      APP_ENV: extra.appEnv || "development",
    };

    if (this.config.APP_ENV === "development") {
      console.log(`🔧 Environment Config [${this.config.APP_ENV}]:`, {
        API_URL: this.config.API_URL,
        SOCKET_URL: this.config.SOCKET_URL,
        APP_ENV: this.config.APP_ENV,
      });
    }
  }

  get apiUrl(): string {
    return this.config.API_URL;
  }

  get socketUrl(): string {
    return this.config.SOCKET_URL;
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

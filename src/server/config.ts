export interface ServerConfig {
  host: string;
  port: number;
  corsOrigin?: string;
  staticDir?: string;
}

const ALLOWED_BIND_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0", "::"]);

export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const host = env.TART_API_HOST ?? env.HOST ?? "127.0.0.1";
  if (!ALLOWED_BIND_HOSTS.has(host)) {
    throw new Error("Invalid TART_API_HOST. Use 127.0.0.1 for local dev or 0.0.0.0 for Docker/Unraid.");
  }

  const port = Number(env.PORT ?? env.TART_API_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid PORT. Use an integer from 1 to 65535.");
  }

  return {
    host,
    port,
    corsOrigin: env.TART_CORS_ORIGIN,
    staticDir: env.TART_STATIC_DIR ?? "dist/client"
  };
}

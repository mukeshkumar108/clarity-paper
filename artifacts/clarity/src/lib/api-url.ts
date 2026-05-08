const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

export function getApiUrl(path: string): string {
  if (!configuredApiBaseUrl) return path;
  return `${configuredApiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getConfiguredApiBaseUrl(): string | null {
  return configuredApiBaseUrl || null;
}

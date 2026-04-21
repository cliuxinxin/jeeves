const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLoopbackHost(hostname: string) {
  return loopbackHosts.has(hostname.toLowerCase());
}

function pointsToLoopback(apiUrl: string) {
  try {
    return isLoopbackHost(new URL(apiUrl).hostname);
  } catch {
    return false;
  }
}

function shouldUseSameOriginApi() {
  if (configuredApiUrl === "same-origin") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const frontendHost = window.location.hostname;
  if (isLoopbackHost(frontendHost)) {
    return false;
  }

  return !configuredApiUrl || pointsToLoopback(configuredApiUrl);
}

export const API_URL =
  shouldUseSameOriginApi()
    ? ""
    : configuredApiUrl?.replace(/\/$/, "") || "http://localhost:8000";

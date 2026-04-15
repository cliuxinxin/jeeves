const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

export const API_URL =
  configuredApiUrl === "same-origin"
    ? ""
    : configuredApiUrl?.replace(/\/$/, "") || "http://localhost:8000";

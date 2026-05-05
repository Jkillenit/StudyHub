export function getApiKey() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return localStorage.getItem("studyHub.apiKey") || localStorage.getItem("anthropic_api_key") || null;
}

export function hasApiKey() {
  const key = getApiKey();
  return !!key && key.startsWith("sk-ant-");
}

/**
 * The Anthropic key is stored encrypted in the main process. The renderer can
 * only ask whether one is configured.
 */
export async function hasApiKey() {
  try {
    const status = await window.studyHub?.ai?.getStatus?.();
    return !!status?.configured;
  } catch {
    return false;
  }
}

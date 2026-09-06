export function parseJsonTail(output: string): unknown | null {
  const start = output.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(output.slice(start));
  } catch {
    return null;
  }
}

export function needsMigration(marker: string | null, current: string): boolean {
  const cur = current.trim();
  if (!cur) return false;
  return (marker ?? "").trim() !== cur;
}

export function countAuthProfiles(output: string): number {
  const parsed = parseJsonTail(output) as { profiles?: unknown } | null;
  return Array.isArray(parsed?.profiles) ? parsed.profiles.length : 0;
}

export function dashboardFragment(output: string): string | null {
  const parsed = parseJsonTail(output) as { browserUrl?: unknown } | null;
  if (typeof parsed?.browserUrl !== "string") return null;
  let hash: string;
  try {
    hash = new URL(parsed.browserUrl).hash;
  } catch {
    return null;
  }
  return hash.includes("bootstrapToken=") ? hash : null;
}

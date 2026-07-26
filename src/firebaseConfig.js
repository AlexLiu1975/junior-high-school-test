export function getMissingFirebaseConfigKeys(config) {
  return Object.entries(config)
    .filter(([, value]) => typeof value !== "string" || value.trim() === "")
    .map(([key]) => key);
}

/** Business calendar dates are stored as UTC-midnight DATE values, not instants. */
export function businessDateKey(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
export function businessDate(now = new Date()) {
  return new Date(businessDateKey(now) + "T00:00:00Z");
}

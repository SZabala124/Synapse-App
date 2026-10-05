const PROFILE_FIELDS = ["firstName", "lastName", "nationalId", "phone", "careers"];

export function profileFieldsToPersist(existing, submitted, isInitialAuthBinding) {
  const patch = {};
  for (const field of PROFILE_FIELDS) {
    const value = submitted[field];
    if (value === undefined || value === null || value === "" || (field === "careers" && value.length === 0)) continue;

    const currentValue = existing?.[field];
    const isMissing = currentValue === undefined
      || currentValue === null
      || currentValue === ""
      || (field === "careers" && (!Array.isArray(currentValue) || currentValue.length === 0));
    if (isInitialAuthBinding || isMissing) patch[field] = value;
  }
  return patch;
}

export const FREE_TRACKED_SUBJECT_LIMIT = 3;
export const MAX_QUARTER_SUBJECTS = 7;

export function canEditTrackedSubject({ plan, isAdmin = false, index }) {
  return isAdmin || plan !== "free" || index < FREE_TRACKED_SUBJECT_LIMIT;
}

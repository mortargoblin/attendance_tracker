import { t } from "./i18n.js";

// how each attendance status from the backend ("present" | "late" | "absent"
// | "excused") is shown: a full label, a one-character version for dense
// tables, and its colours. shared by the teacher's and the student's
// attendance pages so both read the same. the label and short form are
// translated (status.<name>.label / status.<name>.short).
const CLASSES = {
  present: "bg-emerald-100 text-emerald-800",
  late: "bg-amber-100 text-amber-800",
  absent: "bg-red-100 text-red-700",
  excused: "bg-sky-100 text-sky-800",
};

export const STATUSES = Object.keys(CLASSES);

// unknown statuses are shown as absent
export function badge(status) {
  if (!(status in CLASSES)) status = "absent";
  return { label: t(`status.${status}.label`), short: t(`status.${status}.short`), classes: CLASSES[status] };
}

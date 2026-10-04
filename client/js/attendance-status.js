// how each attendance status from the backend ("present" | "late" | "absent"
// | "excused") is shown: a full label, a one-character version for dense
// tables, and its colours. shared by the teacher's and the student's
// attendance pages so both read the same.
export const BADGES = {
  present: { label: "Present", short: "✓", classes: "bg-emerald-100 text-emerald-800" },
  late: { label: "Late", short: "L", classes: "bg-amber-100 text-amber-800" },
  absent: { label: "Absent", short: "✗", classes: "bg-red-100 text-red-700" },
  excused: { label: "Excused", short: "E", classes: "bg-sky-100 text-sky-800" },
};

// Year of study, as stored in users.year.
export const YEARS = [
  { value: "1", label: "First year" },
  { value: "2", label: "Second year" },
  { value: "3", label: "Third year" },
  { value: "4", label: "Final year" },
];

export const yearLabel = (year: number | null) =>
  YEARS.find((y) => y.value === String(year))?.label ?? "—";

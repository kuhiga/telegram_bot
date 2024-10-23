import { WorkoutSet } from "../types/WorkoutSet.ts";
export const parseCSV = (csvContent: string): WorkoutSet[] => {
  const lines = csvContent.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const sets: WorkoutSet[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]
      .split(",")
      .map((v) => v.trim().replace(/['"]/g, ""));
    if (values.length >= headers.length) {
      sets.push({
        date: values[0],
        workoutName: values[1].toLowerCase(),
        duration: values[2],
        exerciseName: values[3],
        setOrder: Number(values[4]),
        weight: Number(Number(values[5]).toFixed(1)),
        reps: Number(values[6]),
        distance: values[7],
        seconds: values[8],
        notes: values[9] ?? undefined,
        workoutNotes: values[10],
        rpe: Number(values[11]),
      });
    }
  }
  return sets;
};

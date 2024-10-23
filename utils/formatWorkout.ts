import { WorkoutSet } from "../types/WorkoutSet.ts";
export function formatWorkoutDetails(sets: WorkoutSet[]): string {
  const workoutName = sets[0].workoutName;
  const duration = sets[0].duration;

  const exerciseGroups = new Map<string, WorkoutSet[]>();
  sets.forEach((set) => {
    if (!exerciseGroups.has(set.exerciseName)) {
      exerciseGroups.set(set.exerciseName, []);
    }
    exerciseGroups.get(set.exerciseName)?.push(set);
  });

  let details = `🏋️ ${workoutName} (${duration})\n`;

  for (const [exercise, exerciseSets] of exerciseGroups) {
    details += `\n  • ${exercise}:\n`;
    exerciseSets.forEach((set) => {
      const setDetails = [];
      if (set.weight > 0) setDetails.push(`${set.weight}kg`);
      if (set.reps > 0) setDetails.push(`${set.reps} reps`);
      if (set.distance) setDetails.push(`${set.distance}m`);
      if (set.seconds) setDetails.push(`${set.seconds}s`);
      if (set.rpe) setDetails.push(`RPE: ${set.rpe}`);

      details += `    ▫️ Set ${set.setOrder}: ${setDetails.join(", ")}`;
      if (set.notes) details += ` (${set.notes})`;
      details += "\n";
    });
  }

  if (sets[0].workoutNotes) {
    details += `\n📝 Notes: ${sets[0].workoutNotes}\n`;
  }

  return details;
}

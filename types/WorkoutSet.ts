export interface WorkoutSet {
  date: string;
  workoutName: string;
  duration: string;
  exerciseName: string;
  setOrder: number;
  weight: number;
  reps: number;
  distance?: any;
  seconds?: any;
  notes?: string;
  workoutNotes?: string;
  rpe?: string;
}

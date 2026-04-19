export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'student';
  points?: number;
  age?: string;
  objective?: string;
  photoUrl?: string;
  createdAt: string;
  lastResetMonth?: number;
  studiedExercises?: string[];
  lastWeeklyPointsKey?: string;
  theme?: 'light' | 'dark';
}

export interface WorkoutLog {
  id: string;
  studentId: string;
  workoutId: string;
  workoutName: string;
  date: string;
  exercisesCompleted: number;
  totalExercises: number;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  gifUrl: string;
  difficulty?: 'Iniciante' | 'Intermediário' | 'Avançado';
  instructions?: string;
  purpose?: string;
  equipmentName?: string;
}

export interface WorkoutExercise extends Exercise {
  series: string;
  reps: string;
  rest: string;
}

export interface Workout {
  id: string;
  studentId: string;
  trainerId: string;
  name: string;
  exercises: WorkoutExercise[];
  updatedAt: any;
}

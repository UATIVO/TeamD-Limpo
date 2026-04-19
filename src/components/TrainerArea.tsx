import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { UserProfile, Exercise, Workout, WorkoutExercise } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Dumbbell, 
  Plus, 
  Trash2, 
  Edit3, 
  ChevronRight, 
  Search, 
  X,
  Award,
  PlusCircle,
  Save,
  LogOut,
  FileText,
  Share2
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { getRank } from '../lib/ranks';

export default function TrainerArea() {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [isEditingWorkout, setIsEditingWorkout] = useState(false);
  const [currentWorkout, setCurrentWorkout] = useState<Partial<Workout>>({ exercises: [] });
  const [searchEx, setSearchEx] = useState('');
  const [filterMuscle, setFilterMuscle] = useState('Todos');
  const [filterDifficulty, setFilterDifficulty] = useState('Todos');
  const [showRanking, setShowRanking] = useState(false);
  const [showExportSelection, setShowExportSelection] = useState(false);
  const [showCreateSelection, setShowCreateSelection] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const unsubStudents = onSnapshot(collection(db, 'users'), (snap) => {
      setStudents(snap.docs.map(d => d.data() as UserProfile).filter(u => u.role === 'student'));
    });
    const unsubExercises = onSnapshot(collection(db, 'exercises'), (snap) => {
      const exData: Exercise[] = [];
      const seenNames = new Set<string>();
      
      snap.docs.forEach(d => {
        const ex = { id: d.id, ...d.data() } as Exercise;
        if (ex.name && !seenNames.has(ex.name)) {
          exData.push(ex);
          seenNames.add(ex.name);
        }
      });
      
      setExercises(exData);
      
      // Auto-seed if empty
      if (exData.length === 0) {
        seedExercises();
      }
    });

    // Check if we need to force an update of images styles
    // We'll use a local storage flag to only do this once to avoid infinite loops
    const lastUpdate = localStorage.getItem('last_exercise_update');
    const CURRENT_VERSION = 'v6_force_cleanup'; // New version to force deep cleanup
    if (lastUpdate !== CURRENT_VERSION) {
      seedExercises().then(() => {
        localStorage.setItem('last_exercise_update', CURRENT_VERSION);
      });
    }

    return () => {
      unsubStudents();
      unsubExercises();
    };
  }, []);

  const fetchWorkouts = async (studentId: string) => {
    const q = query(collection(db, 'workouts'), orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    const data = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as Workout))
      .filter(w => w.studentId === studentId);
    setWorkouts(data);
  };

  const openWorkoutEditor = (workout?: Workout) => {
    if (workout) {
      setCurrentWorkout(workout);
    } else {
      setCurrentWorkout({
        studentId: selectedStudent?.uid,
        name: '',
        exercises: [],
        trainerId: auth.currentUser?.uid
      });
    }
    setIsEditingWorkout(true);
  };

  const handleSaveWorkout = async () => {
    if (!currentWorkout.name || currentWorkout.exercises?.length === 0) return;

    if (currentWorkout.id) {
      await updateDoc(doc(db, 'workouts', currentWorkout.id), {
        ...currentWorkout,
        updatedAt: new Date().toISOString()
      });
    } else {
      await addDoc(collection(db, 'workouts'), {
        ...currentWorkout,
        updatedAt: new Date().toISOString()
      });
    }

    setIsEditingWorkout(false);
    if (selectedStudent) fetchWorkouts(selectedStudent.uid);
  };

  const handleExportStudent = async (student: UserProfile) => {
    try {
      const q = query(collection(db, 'workouts'), orderBy('updatedAt', 'desc'));
      const snapshot = await getDocs(q);
      const studentWorkouts = snapshot.docs
        .map(d => d.data() as Workout)
        .filter(w => w.studentId === student.uid);
      
      if (studentWorkouts.length === 0) {
        alert("Este aluno não possui treinos para exportar.");
        return;
      }

      let exportText = `TEAM D - TREINOS: ${student.name.toUpperCase()}\n\n`;
      studentWorkouts.forEach(w => {
        exportText += `🏋️ TREINO: ${w.name}\n`;
        w.exercises.forEach(ex => {
          exportText += `• ${ex.name}: ${ex.series}x${ex.reps} (Desc: ${ex.rest}s)\n`;
        });
        exportText += "\n";
      });

      await navigator.clipboard.writeText(exportText);
      alert(`Treino de ${student.name} copiado!`);
      setIsMenuOpen(false);
      setShowExportSelection(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao exportar treino.");
    }
  };

  const handleExportWorkouts = async () => {
    try {
      const q = query(collection(db, 'workouts'), orderBy('updatedAt', 'desc'));
      const snapshot = await getDocs(q);
      const allWorkouts = snapshot.docs.map(d => d.data() as Workout);
      
      let exportText = "TEAM D - RELATÓRIO DE TREINOS\n\n";
      
      for (const student of students) {
        exportText += `ALUNO: ${student.name.toUpperCase()}\n`;
        const studentWorkouts = allWorkouts.filter(w => w.studentId === student.uid);
        
        if (studentWorkouts.length === 0) {
          exportText += "Sem treinos atribuídos.\n";
        } else {
          studentWorkouts.forEach(w => {
            exportText += `- TREINO: ${w.name}\n`;
            w.exercises.forEach(ex => {
              exportText += `  * ${ex.name}: ${ex.series}x${ex.reps} (Desc: ${ex.rest}s)\n`;
            });
          });
        }
        exportText += "\n" + "=".repeat(30) + "\n\n";
      }

      await navigator.clipboard.writeText(exportText);
      alert("Relatório de treinos copiado para a área de transferência! Você pode colar no WhatsApp ou E-mail.");
      setIsMenuOpen(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao exportar treinos.");
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 3);
  };

  const ExerciseIcon = ({ name, className = "" }: { name: string, className?: string }) => {
    const initials = getInitials(name);
    // Cores pastéis com contraste levemente ajustado para melhor legibilidade
    const colors = [
      'bg-slate-100 text-slate-600',
      'bg-zinc-100 text-zinc-600',
      'bg-blue-100 text-blue-600',
      'bg-indigo-100 text-indigo-600',
      'bg-purple-100 text-purple-600',
      'bg-stone-100 text-stone-600',
    ];
    const colorIndex = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;

    return (
      <div className={`flex items-center justify-center font-black rounded-[18px] select-none ${colors[colorIndex]} ${className}`}>
        <span className={`tracking-[0.15em] relative left-[0.075em] ${initials.length > 2 ? 'text-[11px]' : 'text-[14px]'}`}>
          {initials}
        </span>
      </div>
    );
  };

  const addExerciseToWorkout = (ex: Exercise) => {
    // Prevent adding the same exercise again (check by ID)
    if (currentWorkout.exercises?.find(e => e.id === ex.id)) {
      alert("Este exercício já foi adicionado a este treino.");
      return;
    }
    const newEx: WorkoutExercise = { ...ex, series: '3', reps: '12', rest: '60' };
    setCurrentWorkout(prev => ({
      ...prev,
      exercises: [...(prev.exercises || []), newEx]
    }));
  };

  const removeExerciseFromWorkout = (exId: string) => {
    setCurrentWorkout(prev => ({
      ...prev,
      exercises: prev.exercises?.filter(e => e.id !== exId)
    }));
  };

  const updateExerciseDetail = (idx: number, field: string, value: string) => {
    setCurrentWorkout(prev => {
      const newExArr = [...(prev.exercises || [])];
      newExArr[idx] = { ...newExArr[idx], [field]: value };
      return { ...prev, exercises: newExArr };
    });
  };

  // Seed data from user's list
  const seedExercises = async () => {
    try {
      const slugify = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      
      const getImg = (name: string, muscle: string) => {
        const muscleMap: { [key: string]: string } = {
          'Peito': 'chest,pectoral',
          'Costas': 'back,traps,lats',
          'Ombros': 'shoulders,deltoids',
          'Bíceps': 'biceps',
          'Tríceps': 'triceps',
          'Quadríceps': 'quadriceps,quads',
          'Posterior': 'hamstrings',
          'Glúteos': 'glutes,buttocks',
          'Panturrilha': 'calves,gastrocnemius',
          'Core': 'abs,abs,abdominal',
          'Funcional': 'full,body,fitness'
        };
        const muscleKeywords = muscleMap[muscle] || muscle.toLowerCase();
        const query = encodeURIComponent(`anatomy,muscle,diagram,illustration,${muscleKeywords}`);
        return `https://loremflickr.com/400/400/${query}/all`;
      };

      const list: any[] = [
        // PEITO
        { name: 'Supino máquina', muscleGroup: 'Peito', difficulty: 'Iniciante', gifUrl: getImg('Supino máquina', 'Peito') },
        { name: 'Chest press', muscleGroup: 'Peito', difficulty: 'Iniciante', gifUrl: getImg('Chest press', 'Peito') },
        { name: 'Crucifixo máquina', muscleGroup: 'Peito', difficulty: 'Iniciante', gifUrl: getImg('Crucifixo máquina', 'Peito') },
        { name: 'Crucifixo polia', muscleGroup: 'Peito', difficulty: 'Iniciante', gifUrl: getImg('Crucifixo polia', 'Peito') },
        { name: 'Flexão inclinada', muscleGroup: 'Peito', difficulty: 'Iniciante', gifUrl: getImg('Flexão inclinada', 'Peito') },
        { name: 'Flexão joelhos', muscleGroup: 'Peito', difficulty: 'Iniciante', gifUrl: getImg('Flexão joelhos', 'Peito') },
        { name: 'Supino reto barra', muscleGroup: 'Peito', difficulty: 'Intermediário', gifUrl: getImg('Supino reto barra', 'Peito') },
        { name: 'Supino reto halter', muscleGroup: 'Peito', difficulty: 'Intermediário', gifUrl: getImg('Supino reto halter', 'Peito') },
        { name: 'Supino inclinado halter', muscleGroup: 'Peito', difficulty: 'Intermediário', gifUrl: getImg('Supino inclinado halter', 'Peito') },
        { name: 'Supino inclinado barra', muscleGroup: 'Peito', difficulty: 'Intermediário', gifUrl: getImg('Supino inclinado barra', 'Peito') },
        { name: 'Crucifixo halter', muscleGroup: 'Peito', difficulty: 'Intermediário', gifUrl: getImg('Crucifixo halter', 'Peito') },
        { name: 'Crossover', muscleGroup: 'Peito', difficulty: 'Intermediário', gifUrl: getImg('Crossover', 'Peito') },
        { name: 'Flexão tradicional', muscleGroup: 'Peito', difficulty: 'Intermediário', gifUrl: getImg('Flexão tradicional', 'Peito') },
        { name: 'Pullover halter', muscleGroup: 'Peito', difficulty: 'Intermediário', gifUrl: getImg('Pullover halter', 'Peito') },
        { name: 'Supino com pausa', muscleGroup: 'Peito', difficulty: 'Avançado', gifUrl: getImg('Supino com pausa', 'Peito') },
        { name: 'Supino pegada fechada', muscleGroup: 'Peito', difficulty: 'Avançado', gifUrl: getImg('Supino pegada fechada', 'Peito') },
        { name: 'Supino inclinado pesado', muscleGroup: 'Peito', difficulty: 'Avançado', gifUrl: getImg('Supino inclinado pesado', 'Peito') },
        { name: 'Crossover unilateral', muscleGroup: 'Peito', difficulty: 'Avançado', gifUrl: getImg('Crossover unilateral', 'Peito') },
        { name: 'Flexão declinada', muscleGroup: 'Peito', difficulty: 'Avançado', gifUrl: getImg('Flexão declinada', 'Peito') },
        { name: 'Flexão com peso', muscleGroup: 'Peito', difficulty: 'Avançado', gifUrl: getImg('Flexão com peso', 'Peito') },
        { name: 'Flexão explosiva', muscleGroup: 'Peito', difficulty: 'Avançado', gifUrl: getImg('Flexão explosiva', 'Peito') },

        // COSTAS
        { name: 'Puxada frente', muscleGroup: 'Costas', difficulty: 'Iniciante', gifUrl: getImg('Puxada frente', 'Costas') },
        { name: 'Puxada neutra', muscleGroup: 'Costas', difficulty: 'Iniciante', gifUrl: getImg('Puxada neutra', 'Costas') },
        { name: 'Puxada supinada', muscleGroup: 'Costas', difficulty: 'Iniciante', gifUrl: getImg('Puxada supinada', 'Costas') },
        { name: 'Pulldown corda', muscleGroup: 'Costas', difficulty: 'Iniciante', gifUrl: getImg('Pulldown corda', 'Costas') },
        { name: 'Remada máquina', muscleGroup: 'Costas', difficulty: 'Iniciante', gifUrl: getImg('Remada máquina', 'Costas') },
        { name: 'Remada baixa', muscleGroup: 'Costas', difficulty: 'Iniciante', gifUrl: getImg('Remada baixa', 'Costas') },
        { name: 'Barra fixa assistida', muscleGroup: 'Costas', difficulty: 'Intermediário', gifUrl: getImg('Barra fixa assistida', 'Costas') },
        { name: 'Barra fixa', muscleGroup: 'Costas', difficulty: 'Intermediário', gifUrl: getImg('Barra fixa', 'Costas') },
        { name: 'Remada curvada barra', muscleGroup: 'Costas', difficulty: 'Intermediário', gifUrl: getImg('Remada curvada barra', 'Costas') },
        { name: 'Remada unilateral', muscleGroup: 'Costas', difficulty: 'Intermediário', gifUrl: getImg('Remada unilateral', 'Costas') },
        { name: 'Remada cavalinho', muscleGroup: 'Costas', difficulty: 'Intermediário', gifUrl: getImg('Remada cavalinho', 'Costas') },
        { name: 'Pullover polia', muscleGroup: 'Costas', difficulty: 'Intermediário', gifUrl: getImg('Pullover polia', 'Costas') },
        { name: 'Barra fixa com peso', muscleGroup: 'Costas', difficulty: 'Avançado', gifUrl: getImg('Barra fixa com peso', 'Costas') },
        { name: 'Barra fixa arqueiro', muscleGroup: 'Costas', difficulty: 'Avançado', gifUrl: getImg('Barra fixa arqueiro', 'Costas') },
        { name: 'Remada pendlay', muscleGroup: 'Costas', difficulty: 'Avançado', gifUrl: getImg('Remada pendlay', 'Costas') },
        { name: 'Remada curvada pesada', muscleGroup: 'Costas', difficulty: 'Avançado', gifUrl: getImg('Remada curvada pesada', 'Costas') },
        { name: 'Rack pull', muscleGroup: 'Costas', difficulty: 'Avançado', gifUrl: getImg('Rack pull', 'Costas') },

        // OMBROS
        { name: 'Desenvolvimento máquina', muscleGroup: 'Ombros', difficulty: 'Iniciante', gifUrl: getImg('Desenvolvimento máquina', 'Ombros') },
        { name: 'Desenvolvimento halter sentado', muscleGroup: 'Ombros', difficulty: 'Iniciante', gifUrl: getImg('Desenvolvimento halter sentado', 'Ombros') },
        { name: 'Elevação lateral máquina', muscleGroup: 'Ombros', difficulty: 'Iniciante', gifUrl: getImg('Elevação lateral máquina', 'Ombros') },
        { name: 'Elevação frontal halter', muscleGroup: 'Ombros', difficulty: 'Iniciante', gifUrl: getImg('Elevação frontal halter', 'Ombros') },
        { name: 'Elevação posterior máquina', muscleGroup: 'Ombros', difficulty: 'Iniciante', gifUrl: getImg('Elevação posterior máquina', 'Ombros') },
        { name: 'Desenvolvimento barra', muscleGroup: 'Ombros', difficulty: 'Intermediário', gifUrl: getImg('Desenvolvimento barra', 'Ombros') },
        { name: 'Desenvolvimento halter', muscleGroup: 'Ombros', difficulty: 'Intermediário', gifUrl: getImg('Desenvolvimento halter', 'Ombros') },
        { name: 'Elevação lateral halter', muscleGroup: 'Ombros', difficulty: 'Intermediário', gifUrl: getImg('Elevação lateral halter', 'Ombros') },
        { name: 'Elevação posterior halter', muscleGroup: 'Ombros', difficulty: 'Intermediário', gifUrl: getImg('Elevação posterior halter', 'Ombros') },
        { name: 'Face pull', muscleGroup: 'Ombros', difficulty: 'Intermediário', gifUrl: getImg('Face pull', 'Ombros') },
        { name: 'Push press', muscleGroup: 'Ombros', difficulty: 'Avançado', gifUrl: getImg('Push press', 'Ombros') },
        { name: 'Arnold press', muscleGroup: 'Ombros', difficulty: 'Avançado', gifUrl: getImg('Arnold press', 'Ombros') },
        { name: 'Elevação lateral unilateral', muscleGroup: 'Ombros', difficulty: 'Avançado', gifUrl: getImg('Elevação lateral unilateral', 'Ombros') },
        { name: 'Elevação lateral parcial', muscleGroup: 'Ombros', difficulty: 'Avançado', gifUrl: getImg('Elevação lateral parcial', 'Ombros') },
        { name: 'Face pull com pausa', muscleGroup: 'Ombros', difficulty: 'Avançado', gifUrl: getImg('Face pull com pausa', 'Ombros') },

        // BÍCEPS
        { name: 'Rosca máquina', muscleGroup: 'Bíceps', difficulty: 'Iniciante', gifUrl: getImg('Rosca máquina', 'Bíceps') },
        { name: 'Rosca direta barra W', muscleGroup: 'Bíceps', difficulty: 'Iniciante', gifUrl: getImg('Rosca direta barra W', 'Bíceps') },
        { name: 'Rosca alternada leve', muscleGroup: 'Bíceps', difficulty: 'Iniciante', gifUrl: getImg('Rosca alternada leve', 'Bíceps') },
        { name: 'Rosca direta barra', muscleGroup: 'Bíceps', difficulty: 'Intermediário', gifUrl: getImg('Rosca direta barra', 'Bíceps') },
        { name: 'Rosca alternada', muscleGroup: 'Bíceps', difficulty: 'Intermediário', gifUrl: getImg('Rosca alternada', 'Bíceps') },
        { name: 'Rosca martelo', muscleGroup: 'Bíceps', difficulty: 'Intermediário', gifUrl: getImg('Rosca martelo', 'Bíceps') },
        { name: 'Rosca Scott', muscleGroup: 'Bíceps', difficulty: 'Intermediário', gifUrl: getImg('Rosca Scott', 'Bíceps') },
        { name: 'Rosca concentrada', muscleGroup: 'Bíceps', difficulty: 'Intermediário', gifUrl: getImg('Rosca concentrada', 'Bíceps') },
        { name: 'Rosca spider', muscleGroup: 'Bíceps', difficulty: 'Avançado', gifUrl: getImg('Rosca spider', 'Bíceps') },
        { name: 'Rosca Zottman', muscleGroup: 'Bíceps', difficulty: 'Avançado', gifUrl: getImg('Rosca Zottman', 'Bíceps') },
        { name: 'Rosca inversa', muscleGroup: 'Bíceps', difficulty: 'Avançado', gifUrl: getImg('Rosca inversa', 'Bíceps') },
        { name: 'Rosca 21', muscleGroup: 'Bíceps', difficulty: 'Avançado', gifUrl: getImg('Rosca 21', 'Bíceps') },
        { name: 'Rosca cheat', muscleGroup: 'Bíceps', difficulty: 'Avançado', gifUrl: getImg('Rosca cheat', 'Bíceps') },

        // TRÍCEPS
        { name: 'Tríceps máquina', muscleGroup: 'Tríceps', difficulty: 'Iniciante', gifUrl: getImg('Tríceps máquina', 'Tríceps') },
        { name: 'Tríceps pulley barra', muscleGroup: 'Tríceps', difficulty: 'Iniciante', gifUrl: getImg('Tríceps pulley barra', 'Tríceps') },
        { name: 'Tríceps corda', muscleGroup: 'Tríceps', difficulty: 'Iniciante', gifUrl: getImg('Tríceps corda', 'Tríceps') },
        { name: 'Tríceps testa', muscleGroup: 'Tríceps', difficulty: 'Intermediário', gifUrl: getImg('Tríceps testa', 'Tríceps') },
        { name: 'Tríceps francês', muscleGroup: 'Tríceps', difficulty: 'Intermediário', gifUrl: getImg('Tríceps francês', 'Tríceps') },
        { name: 'Tríceps banco', muscleGroup: 'Tríceps', difficulty: 'Intermediário', gifUrl: getImg('Tríceps banco', 'Tríceps') },
        { name: 'Extensão overhead', muscleGroup: 'Tríceps', difficulty: 'Intermediário', gifUrl: getImg('Extensão overhead', 'Tríceps') },
        { name: 'Mergulho paralelo', muscleGroup: 'Tríceps', difficulty: 'Avançado', gifUrl: getImg('Mergulho paralelo', 'Tríceps') },
        { name: 'Tríceps testa pesado', muscleGroup: 'Tríceps', difficulty: 'Avançado', gifUrl: getImg('Tríceps testa pesado', 'Tríceps') },
        { name: 'Tríceps unilateral', muscleGroup: 'Tríceps', difficulty: 'Avançado', gifUrl: getImg('Tríceps unilateral', 'Tríceps') },
        { name: 'Tríceps pulley drop', muscleGroup: 'Tríceps', difficulty: 'Avançado', gifUrl: getImg('Tríceps pulley drop', 'Tríceps') },

        // QUADRÍCEPS
        { name: 'Leg press', muscleGroup: 'Quadríceps', difficulty: 'Iniciante', gifUrl: getImg('Leg press', 'Quadríceps') },
        { name: 'Cadeira extensora', muscleGroup: 'Quadríceps', difficulty: 'Iniciante', gifUrl: getImg('Cadeira extensora', 'Quadríceps') },
        { name: 'Agachamento smith', muscleGroup: 'Quadríceps', difficulty: 'Iniciante', gifUrl: getImg('Agachamento smith', 'Quadríceps') },
        { name: 'Agachamento livre', muscleGroup: 'Quadríceps', difficulty: 'Intermediário', gifUrl: getImg('Agachamento livre', 'Quadríceps') },
        { name: 'Agachamento frontal', muscleGroup: 'Quadríceps', difficulty: 'Intermediário', gifUrl: getImg('Agachamento frontal', 'Quadríceps') },
        { name: 'Afundo', muscleGroup: 'Quadríceps', difficulty: 'Intermediário', gifUrl: getImg('Afundo', 'Quadríceps') },
        { name: 'Passada', muscleGroup: 'Quadríceps', difficulty: 'Intermediário', gifUrl: getImg('Passada', 'Quadríceps') },
        { name: 'Step up', muscleGroup: 'Quadríceps', difficulty: 'Intermediário', gifUrl: getImg('Step up', 'Quadríceps') },
        { name: 'Agachamento profundo', muscleGroup: 'Quadríceps', difficulty: 'Avançado', gifUrl: getImg('Agachamento profundo', 'Quadríceps') },
        { name: 'Agachamento pausa', muscleGroup: 'Quadríceps', difficulty: 'Avançado', gifUrl: getImg('Agachamento pausa', 'Quadríceps') },
        { name: 'Agachamento búlgaro', muscleGroup: 'Quadríceps', difficulty: 'Avançado', gifUrl: getImg('Agachamento búlgaro', 'Quadríceps') },
        { name: 'Sissy squat', muscleGroup: 'Quadríceps', difficulty: 'Avançado', gifUrl: getImg('Sissy squat', 'Quadríceps') },

        // POSTERIOR / GLÚTEO
        { name: 'Cadeira flexora', muscleGroup: 'Posterior', difficulty: 'Iniciante', gifUrl: getImg('Cadeira flexora', 'Posterior') },
        { name: 'Mesa flexora', muscleGroup: 'Posterior', difficulty: 'Iniciante', gifUrl: getImg('Mesa flexora', 'Posterior') },
        { name: 'Glute bridge', muscleGroup: 'Glúteos', difficulty: 'Iniciante', gifUrl: getImg('Glute bridge', 'Glúteos') },
        { name: 'Abdução máquina', muscleGroup: 'Glúteos', difficulty: 'Iniciante', gifUrl: getImg('Abdução máquina', 'Glúteos') },
        { name: 'Stiff halter', muscleGroup: 'Posterior', difficulty: 'Intermediário', gifUrl: getImg('Stiff halter', 'Posterior') },
        { name: 'Stiff barra', muscleGroup: 'Posterior', difficulty: 'Intermediário', gifUrl: getImg('Stiff barra', 'Posterior') },
        { name: 'Hip thrust', muscleGroup: 'Glúteos', difficulty: 'Intermediário', gifUrl: getImg('Hip thrust', 'Glúteos') },
        { name: 'Pull through', muscleGroup: 'Glúteos', difficulty: 'Intermediário', gifUrl: getImg('Pull through', 'Glúteos') },
        { name: 'Levantamento terra', muscleGroup: 'Posterior', difficulty: 'Avançado', gifUrl: getImg('Levantamento terra', 'Posterior') },
        { name: 'Terra romeno', muscleGroup: 'Posterior', difficulty: 'Avançado', gifUrl: getImg('Terra romeno', 'Posterior') },
        { name: 'Terra sumô', muscleGroup: 'Posterior', difficulty: 'Avançado', gifUrl: getImg('Terra sumô', 'Posterior') },
        { name: 'Nordic curl', muscleGroup: 'Posterior', difficulty: 'Avançado', gifUrl: getImg('Nordic curl', 'Posterior') },
        { name: 'Good morning', muscleGroup: 'Posterior', difficulty: 'Avançado', gifUrl: getImg('Good morning', 'Posterior') },

        // PANTURRILHA
        { name: 'Panturrilha máquina', muscleGroup: 'Panturrilha', difficulty: 'Iniciante', gifUrl: getImg('Panturrilha máquina', 'Panturrilha') },
        { name: 'Panturrilha sentado', muscleGroup: 'Panturrilha', difficulty: 'Iniciante', gifUrl: getImg('Panturrilha sentado', 'Panturrilha') },
        { name: 'Panturrilha em pé', muscleGroup: 'Panturrilha', difficulty: 'Intermediário', gifUrl: getImg('Panturrilha em pé', 'Panturrilha') },
        { name: 'Panturrilha no leg press', muscleGroup: 'Panturrilha', difficulty: 'Intermediário', gifUrl: getImg('Panturrilha no leg press', 'Panturrilha') },
        { name: 'Panturrilha unilateral', muscleGroup: 'Panturrilha', difficulty: 'Avançado', gifUrl: getImg('Panturrilha unilateral', 'Panturrilha') },
        { name: 'Panturrilha com pausa', muscleGroup: 'Panturrilha', difficulty: 'Avançado', gifUrl: getImg('Panturrilha com pausa', 'Panturrilha') },
        { name: 'Panturrilha donkey', muscleGroup: 'Panturrilha', difficulty: 'Avançado', gifUrl: getImg('Panturrilha donkey', 'Panturrilha') },

        // CORE
        { name: 'Abdominal máquina', muscleGroup: 'Core', difficulty: 'Iniciante', gifUrl: getImg('Abdominal máquina', 'Core') },
        { name: 'Crunch', muscleGroup: 'Core', difficulty: 'Iniciante', gifUrl: getImg('Crunch', 'Core') },
        { name: 'Elevação de joelhos', muscleGroup: 'Core', difficulty: 'Iniciante', gifUrl: getImg('Elevação de joelhos', 'Core') },
        { name: 'Prancha joelho', muscleGroup: 'Core', difficulty: 'Iniciante', gifUrl: getImg('Prancha joelho', 'Core') },
        { name: 'Prancha', muscleGroup: 'Core', difficulty: 'Intermediário', gifUrl: getImg('Prancha', 'Core') },
        { name: 'Prancha lateral', muscleGroup: 'Core', difficulty: 'Intermediário', gifUrl: getImg('Prancha lateral', 'Core') },
        { name: 'Elevação de pernas', muscleGroup: 'Core', difficulty: 'Intermediário', gifUrl: getImg('Elevação de pernas', 'Core') },
        { name: 'Crunch com peso', muscleGroup: 'Core', difficulty: 'Intermediário', gifUrl: getImg('Crunch com peso', 'Core') },
        { name: 'Dragon flag', muscleGroup: 'Core', difficulty: 'Avançado', gifUrl: getImg('Dragon flag', 'Core') },
        { name: 'Ab wheel', muscleGroup: 'Core', difficulty: 'Avançado', gifUrl: getImg('Ab wheel', 'Core') },
        { name: 'Toes to bar', muscleGroup: 'Core', difficulty: 'Avançado', gifUrl: getImg('Toes to bar', 'Core') },
        { name: 'Prancha com carga', muscleGroup: 'Core', difficulty: 'Avançado', gifUrl: getImg('Prancha com carga', 'Core') },

        // FUNCIONAL / CONDICIONAMENTO
        { name: 'Bike', muscleGroup: 'Funcional', difficulty: 'Iniciante', gifUrl: getImg('Bike', 'Funcional') },
        { name: 'Caminhada', muscleGroup: 'Funcional', difficulty: 'Iniciante', gifUrl: getImg('Caminhada', 'Funcional') },
        { name: 'Elíptico', muscleGroup: 'Funcional', difficulty: 'Iniciante', gifUrl: getImg('Elíptico', 'Funcional') },
        { name: 'Corrida', muscleGroup: 'Funcional', difficulty: 'Intermediário', gifUrl: getImg('Corrida', 'Funcional') },
        { name: 'Burpee', muscleGroup: 'Funcional', difficulty: 'Intermediário', gifUrl: getImg('Burpee', 'Funcional') },
        { name: 'Kettlebell swing', muscleGroup: 'Funcional', difficulty: 'Intermediário', gifUrl: getImg('Kettlebell swing', 'Funcional') },
        { name: 'Pular corda', muscleGroup: 'Funcional', difficulty: 'Intermediário', gifUrl: getImg('Pular corda', 'Funcional') },
        { name: 'Sprint', muscleGroup: 'Funcional', difficulty: 'Avançado', gifUrl: getImg('Sprint', 'Funcional') },
        { name: 'Sled push', muscleGroup: 'Funcional', difficulty: 'Avançado', gifUrl: getImg('Sled push', 'Funcional') },
        { name: 'Sled pull', muscleGroup: 'Funcional', difficulty: 'Avançado', gifUrl: getImg('Sled pull', 'Funcional') },
        { name: 'Box jump', muscleGroup: 'Funcional', difficulty: 'Avançado', gifUrl: getImg('Box jump', 'Funcional') },
        { name: 'Farmer walk', muscleGroup: 'Funcional', difficulty: 'Avançado', gifUrl: getImg('Farmer walk', 'Funcional') },
      ];

      // Perform clean setDocs with slug IDs
      for (const ex of list) {
        await setDoc(doc(db, 'exercises', slugify(ex.name)), ex);
      }
      
      // Cleanup: remove old documents without slug IDs (numeric IDs or duplicates)
      const currentSnap = await getDocs(collection(db, 'exercises'));
      const listNames = new Set(list.map(ex => ex.name));
      for (const d of currentSnap.docs) {
        const data = d.data() as Exercise;
        // If the ID is NOT the slug of the name, or if it's not even in our current list name set, delete it
        if (d.id !== slugify(data.name) || !listNames.has(data.name)) {
          await deleteDoc(doc(db, 'exercises', d.id));
        }
      }

      alert("Biblioteca unificada com sucesso! Duplicatas removidas.");
    } catch (error) {
      console.error("Error seeding exercises:", error);
      alert("Erro ao atualizar biblioteca. Tente novamente.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row h-screen overflow-hidden">
      {/* Sidebar / Menu */}
      <div className="w-full md:w-80 bg-black text-white p-6 flex flex-col flex-shrink-0">
        <div className="flex items-center gap-3 mb-10 overflow-hidden">
          <div className="bg-white w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
            <span className="text-xl font-black text-black">D</span>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight leading-none">Team D</h1>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Trainer Edition</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <button 
            onClick={() => { setSelectedStudent(null); setShowRanking(false); }}
            className={`w-full flex items-center gap-3 px-4 py-4 rounded-2xl font-bold transition-all duration-300 ${!selectedStudent && !showRanking ? 'bg-white text-black shadow-[0_10px_20px_rgba(255,255,255,0.1)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            <Users className="w-5 h-5" /> Alunos
          </button>
          <button 
            onClick={() => setShowRanking(true)}
            className={`w-full flex items-center gap-3 px-4 py-4 rounded-2xl font-bold transition-all duration-300 ${showRanking ? 'bg-white text-black shadow-[0_10px_20px_rgba(255,255,255,0.1)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            <Award className="w-5 h-5" /> Ranking Global
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-[#F8F9FA] relative">
        {/* Floating Action Menu */}
        <div className="fixed top-8 right-8 z-40">
          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="w-14 h-14 bg-black text-white rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.3)] flex items-center justify-center hover:bg-zinc-800 transition-all cursor-pointer"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
            </motion.button>

            <AnimatePresence>
              {isMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-16 right-0 w-72 bg-white/90 backdrop-blur-2xl rounded-[32px] shadow-[0_30px_60px_rgba(0,0,0,0.2)] border border-white/50 p-2 flex flex-col gap-1 overflow-hidden"
                >
                  <div className="p-4 flex items-center gap-3 bg-black/5 rounded-3xl mb-1">
                    <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center font-bold text-black border border-black/10">
                      {auth.currentUser?.displayName?.[0] || 'T'}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-black truncate">{auth.currentUser?.displayName || 'Treinador'}</p>
                      <p className="text-[10px] text-gray-400 font-bold truncate tracking-tight">{auth.currentUser?.email}</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => { setShowCreateSelection(true); setSelectedStudent(null); setShowExportSelection(false); setShowRanking(false); setIsMenuOpen(false); }}
                    className="flex items-center gap-3 px-4 py-4 rounded-2xl hover:bg-black/5 text-left transition-colors group"
                  >
                    <div className="w-10 h-10 bg-black/5 text-black rounded-xl flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all">
                      <Plus className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-sm">Criar Treino</span>
                  </button>

                  <button 
                    onClick={() => { setSelectedStudent(null); setShowRanking(false); setShowExportSelection(false); setIsMenuOpen(false); }}
                    className="flex items-center gap-3 px-4 py-4 rounded-2xl hover:bg-black/5 text-left transition-colors group"
                  >
                    <div className="w-10 h-10 bg-black/5 text-black rounded-xl flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all">
                      <Users className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-sm">Painel Geral</span>
                  </button>

                  <button 
                    onClick={() => { setShowExportSelection(true); setSelectedStudent(null); setShowRanking(false); setIsMenuOpen(false); }}
                    className="flex items-center gap-3 px-4 py-4 rounded-2xl hover:bg-black/5 text-left transition-colors group"
                  >
                    <div className="w-10 h-10 bg-black/5 text-black rounded-xl flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all">
                      <Share2 className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-sm">Exportar Aluno</span>
                  </button>

                  <button 
                    onClick={() => { seedExercises(); setIsMenuOpen(false); }}
                    className="flex items-center gap-3 px-4 py-4 rounded-2xl hover:bg-orange-50 text-left transition-colors group"
                  >
                    <div className="w-10 h-10 bg-orange-50 text-orange-500 rounded-xl flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-all">
                      <PlusCircle className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-sm text-orange-600">Atualizar Biblioteca (100+)</span>
                  </button>

                  <div className="h-px bg-black/5 my-1 mx-4" />
                  
                  <button 
                    onClick={() => auth.signOut()}
                    className="flex items-center gap-3 px-4 py-4 rounded-2xl hover:bg-red-50 text-left transition-colors group"
                  >
                    <div className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-all">
                      <LogOut className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-sm text-red-600">Sair do App</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {!selectedStudent && !showRanking && !showExportSelection && !showCreateSelection && (
          <div className="max-w-6xl mx-auto p-6 md:p-12">
            <header className="mb-12">
              <h2 className="text-4xl font-black tracking-tight text-black mb-2">Painel de Gestão</h2>
              <p className="text-gray-500 font-medium">Acompanhe o desempenho e gerencie os treinos da sua equipe.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Total de Alunos</p>
                  <h3 className="text-3xl font-black">{students.length}</h3>
                </div>
                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Exercícios na Base</p>
                  <h3 className="text-3xl font-black">{exercises.length}</h3>
                </div>
                <div className="bg-black p-6 rounded-[32px] shadow-xl text-white">
                  <p className="text-xs font-black text-white/50 uppercase tracking-widest mb-1">Status do Sistema</p>
                  <h3 className="text-3xl font-black text-green-400">Online</h3>
                </div>
              </div>
            </header>

            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black">Lista de Alunos</h3>
              <div className="bg-white px-4 py-2 rounded-2xl border border-gray-100 flex items-center gap-3 text-sm font-bold text-gray-400">
                <Search className="w-4 h-4" />
                <input placeholder="Procurar aluno..." className="bg-transparent outline-none text-black" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {students.map(s => (
                <motion.button
                  whileHover={{ y: -8, shadow: '0 20px 40px rgba(0,0,0,0.05)' }}
                  key={s.uid}
                  onClick={() => { setSelectedStudent(s); fetchWorkouts(s.uid); }}
                  className="bg-white p-8 rounded-[40px] text-left shadow-sm border border-gray-100 transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-full -mr-16 -mt-16 group-hover:bg-amber-500/10 transition-colors" />
                  
                  <div className="w-14 h-14 bg-black rounded-2xl mb-6 flex items-center justify-center text-xl font-bold text-white shadow-lg relative z-10">
                    {s.name[0]}
                  </div>
                  <h3 className="text-xl font-black leading-tight text-gray-900 mb-1 relative z-10">{s.name}</h3>
                  <p className="text-sm text-gray-400 font-bold mb-6 relative z-10">{s.email}</p>
                  
                  <div className="flex items-center justify-between pt-6 border-t border-gray-50 relative z-10">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Pontos</span>
                      <span className="text-lg font-black text-black">{s.points || 0}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-xl group-hover:bg-black group-hover:text-white transition-all">
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {showCreateSelection && (
          <div className="max-w-4xl mx-auto p-6 md:p-12">
            <header className="mb-12 text-center">
              <h2 className="text-3xl font-black mb-4">Novo Treino para...</h2>
              <div className="relative max-w-md mx-auto">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Search className="w-5 h-5 text-gray-400" />
                </div>
                <input 
                  type="text"
                  placeholder="Nome do aluno..."
                  className="w-full bg-gray-200/50 backdrop-blur-sm border-none rounded-2xl py-4 pl-12 pr-4 font-semibold text-gray-900 focus:ring-2 focus:ring-black/5 transition-all outline-none md:text-lg"
                  onChange={(e) => setSearchEx(e.target.value)}
                />
              </div>
            </header>

            <div className="space-y-4">
              {students
                .filter(s => s.name.toLowerCase().includes(searchEx.toLowerCase()))
                .map(s => (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    key={s.uid}
                    onClick={() => {
                        setSelectedStudent(s);
                        fetchWorkouts(s.uid);
                        setShowCreateSelection(false);
                        openWorkoutEditor({
                            studentId: s.uid,
                            trainerId: auth.currentUser?.uid,
                            name: '',
                            exercises: [],
                            updatedAt: new Date().toISOString()
                        } as any);
                    }}
                    className="w-full bg-white p-6 rounded-[32px] flex items-center justify-between border border-gray-100 shadow-sm hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center font-black text-gray-400 group-hover:bg-black group-hover:text-white transition-all">
                        {s.name[0]}
                      </div>
                      <div className="text-left">
                        <h4 className="font-black text-gray-900">{s.name}</h4>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{s.email}</p>
                      </div>
                    </div>
                    <div className="bg-gray-100 p-3 rounded-2xl text-gray-400 group-hover:bg-black group-hover:text-white transition-all">
                      <Plus className="w-5 h-5" />
                    </div>
                  </motion.button>
                ))}
            </div>
            
            <button 
              onClick={() => setShowCreateSelection(false)}
              className="mt-10 mx-auto block text-sm font-black text-gray-400 hover:text-black uppercase tracking-widest transition-colors"
            >
              Cancelar e Voltar
            </button>
          </div>
        )}

        {showExportSelection && (
          <div className="max-w-4xl mx-auto p-6 md:p-12">
            <header className="mb-12 text-center">
              <h2 className="text-3xl font-black mb-4">Exportar Treino</h2>
              <div className="relative max-w-md mx-auto">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Search className="w-5 h-5 text-gray-400" />
                </div>
                <input 
                  type="text"
                  placeholder="Buscar aluno..."
                  className="w-full bg-gray-200/50 backdrop-blur-sm border-none rounded-2xl py-4 pl-12 pr-4 font-semibold text-gray-900 focus:ring-2 focus:ring-black/5 transition-all outline-none md:text-lg"
                  onChange={(e) => setSearchEx(e.target.value)}
                />
              </div>
            </header>

            <div className="space-y-4">
              {students
                .filter(s => s.name.toLowerCase().includes(searchEx.toLowerCase()))
                .map(s => (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    key={s.uid}
                    onClick={() => handleExportStudent(s)}
                    className="w-full bg-white p-6 rounded-[32px] flex items-center justify-between border border-gray-100 shadow-sm hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center font-black text-gray-400 group-hover:bg-black group-hover:text-white transition-all">
                        {s.name[0]}
                      </div>
                      <div className="text-left">
                        <h4 className="font-black text-gray-900">{s.name}</h4>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{s.email}</p>
                      </div>
                    </div>
                    <div className="bg-gray-100 p-3 rounded-2xl text-gray-400 group-hover:bg-green-500 group-hover:text-white transition-all">
                      <Share2 className="w-5 h-5" />
                    </div>
                  </motion.button>
                ))}
            </div>
            
            <button 
              onClick={() => setShowExportSelection(false)}
              className="mt-10 mx-auto block text-sm font-black text-gray-400 hover:text-black uppercase tracking-widest transition-colors"
            >
              Cancelar e Voltar
            </button>
          </div>
        )}

        {showRanking && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-black mb-8 flex items-center gap-3">
              <Award className="w-8 h-8 text-amber-500" /> Ranking Global
            </h2>
            <div className="bg-white rounded-[40px] shadow-xl overflow-hidden border border-gray-100">
              {students.sort((a,b) => (b.points || 0) - (a.points || 0)).map((s, idx) => (
                <div key={s.uid} className={`flex items-center gap-4 p-6 ${idx !== students.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <span className={`w-8 text-center font-black text-xl ${idx < 3 ? 'text-amber-500' : 'text-gray-300'}`}>{idx + 1}</span>
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center font-bold text-gray-400">
                    {s.name[0]}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                       <h4 className="font-bold">{s.name}</h4>
                       <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${getRank(s.points || 0).bg} ${getRank(s.points || 0).color}`}>
                         {getRank(s.points || 0).name}
                       </span>
                    </div>
                    <p className="text-xs text-gray-400 font-bold uppercase">{s.points || 0} Pontos</p>
                  </div>
                  {idx === 0 && <Award className="w-6 h-6 text-amber-500" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedStudent && (
          <div className="max-w-4xl mx-auto">
            <header className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-6">
                <button onClick={() => setSelectedStudent(null)} className="p-3 bg-white rounded-2xl shadow-sm hover:scale-105 transition-transform"><X /></button>
                <div>
                  <h2 className="text-3xl font-black">{selectedStudent.name}</h2>
                  <p className="text-gray-500 font-medium">Gerenciando treinos personalizados</p>
                </div>
              </div>
              <button 
                onClick={() => openWorkoutEditor()}
                className="bg-black text-white px-6 py-4 rounded-2xl font-bold flex items-center gap-2 shadow-xl hover:bg-gray-800 transition-colors"
              >
                <PlusCircle className="w-5 h-5" /> Novo Treino
              </button>
            </header>

            <div className="space-y-6">
              {workouts.length > 0 ? workouts.map(w => (
                <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} key={w.id} className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 flex flex-col md:flex-row gap-8 items-start">
                  <div className="flex-1">
                    <h3 className="text-2xl font-black mb-2">{w.name}</h3>
                    <p className="text-sm font-bold text-gray-400 mb-6 uppercase tracking-wider">{w.exercises.length} exercícios definidos</p>
                    <div className="flex flex-wrap gap-2">
                      {w.exercises.map(ex => (
                        <span key={ex.id} className="px-3 py-1 bg-gray-50 text-gray-600 rounded-lg text-xs font-bold uppercase">{ex.name}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => openWorkoutEditor(w)} className="p-4 bg-blue-50 text-blue-600 rounded-3xl hover:bg-blue-100 transition-colors"><Edit3 /></button>
                    <button onClick={() => deleteDoc(doc(db, 'workouts', w.id)).then(() => fetchWorkouts(selectedStudent.uid))} className="p-4 bg-red-50 text-red-600 rounded-3xl hover:bg-red-100 transition-colors"><Trash2 /></button>
                  </div>
                </motion.div>
              )) : (
                <div className="text-center py-20 bg-gray-100/50 rounded-[40px] border-2 border-dashed border-gray-200">
                  <p className="text-gray-400 font-bold">Inicie um novo plano de treino para este aluno.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Workout Editor Modal */}
      <AnimatePresence>
        {isEditingWorkout && (
          <div className="fixed inset-0 z-50 flex items-center justify-end">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsEditingWorkout(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25 }}
              className="relative w-full max-w-2xl bg-white h-screen overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-8 border-b flex justify-between items-center">
                <h3 className="text-2xl font-black">{currentWorkout.id ? 'Editar Treino' : 'Novo Treino'}</h3>
                <button onClick={() => setIsEditingWorkout(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X/></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Nome do Treino</label>
                  <input 
                    value={currentWorkout.name || ''} 
                    onChange={e => setCurrentWorkout(prev => ({...prev, name: e.target.value}))}
                    placeholder="Ex: Treino A - Peito e Tríceps"
                    className="w-full text-2xl font-bold border-b-2 border-gray-100 focus:border-black outline-none pb-2 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Exercícios Selecionados ({currentWorkout.exercises?.length})</label>
                  <div className="space-y-3">
                    {currentWorkout.exercises?.map((ex, idx) => (
                      <div key={idx} className="bg-gray-50 p-6 rounded-3xl flex gap-4 items-start">
                        <div className="flex-shrink-0">
                          <ExerciseIcon name={ex.name} className="w-12 h-12 shadow-sm" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold leading-tight">{ex.name}</h4>
                          <div className="grid grid-cols-3 gap-2 mt-3">
                            <div>
                              <span className="text-[10px] font-black text-gray-400 uppercase">Séries</span>
                              <input value={ex.series} onChange={e => updateExerciseDetail(idx, 'series', e.target.value)} className="w-full bg-white border-0 focus:ring-1 focus:ring-black rounded px-1 font-bold text-sm" />
                            </div>
                            <div>
                              <span className="text-[10px] font-black text-gray-400 uppercase">Reps</span>
                              <input value={ex.reps} onChange={e => updateExerciseDetail(idx, 'reps', e.target.value)} className="w-full bg-white border-0 focus:ring-1 focus:ring-black rounded px-1 font-bold text-sm" />
                            </div>
                            <div>
                              <span className="text-[10px] font-black text-gray-400 uppercase">Desc (s)</span>
                              <input value={ex.rest} onChange={e => updateExerciseDetail(idx, 'rest', e.target.value)} className="w-full bg-white border-0 focus:ring-1 focus:ring-black rounded px-1 font-bold text-sm" />
                            </div>
                          </div>
                          <div className="mt-2">
                             <span className="text-[10px] font-black text-gray-400 uppercase">Aparelho / Equipamento</span>
                             <input 
                               value={ex.equipmentName || ''} 
                               placeholder="Ex: Crossover, Halteres..."
                               onChange={e => updateExerciseDetail(idx, 'equipmentName', e.target.value)} 
                               className="w-full bg-white border-0 focus:ring-1 focus:ring-black rounded px-2 py-1 font-bold text-[11px] placeholder:text-gray-300" 
                             />
                          </div>
                        </div>
                        <button onClick={() => removeExerciseFromWorkout(ex.id)} className="p-2 text-red-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-8 border-t">
                  <div className="flex flex-col gap-4 mb-6">
                    <div className="flex items-center gap-4 bg-gray-100 px-4 py-3 rounded-2xl">
                      <Search className="text-gray-400 w-5 h-5" />
                      <input 
                        placeholder="Buscar na biblioteca..." 
                        className="bg-transparent outline-none flex-1 font-medium"
                        value={searchEx}
                        onChange={e => setSearchEx(e.target.value)}
                      />
                    </div>
                    
                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                      {['Todos', 'Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps', 'Quadríceps', 'Posterior', 'Glúteos', 'Panturrilha', 'Core', 'Funcional'].map(m => (
                        <button 
                          key={m}
                          onClick={() => setFilterMuscle(m)}
                          className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${filterMuscle === m ? 'bg-black text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                        >
                          {m === 'Peito' ? 'Peitoral' : m}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      {['Todos', 'Iniciante', 'Intermediário', 'Avançado'].map(d => (
                        <button 
                          key={d}
                          onClick={() => setFilterDifficulty(d)}
                          className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${filterDifficulty === d ? 'bg-amber-500 text-black' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {exercises
                      .filter(ex => {
                        const matchesSearch = ex.name.toLowerCase().includes(searchEx.toLowerCase());
                        const matchesMuscle = filterMuscle === 'Todos' || ex.muscleGroup === filterMuscle;
                        const matchesDifficulty = filterDifficulty === 'Todos' || ex.difficulty === filterDifficulty;
                        return matchesSearch && matchesMuscle && matchesDifficulty;
                      })
                      .map(ex => (
                        <button 
                          key={ex.id}
                          onClick={() => addExerciseToWorkout(ex)}
                          className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-2xl hover:border-black transition-all group relative overflow-hidden"
                        >
                          <div className="w-12 h-12 bg-zinc-50 rounded-xl overflow-hidden flex-shrink-0 border border-zinc-100 flex items-center justify-center">
                             {ex.gifUrl && !ex.gifUrl.includes('loremflickr') ? (
                               <img 
                                 src={ex.gifUrl}
                                 alt={ex.name}
                                 className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all"
                                 referrerPolicy="no-referrer"
                               />
                             ) : (
                               <span className="text-[16px] font-black text-zinc-300 group-hover:text-black transition-colors">{ex.name.substring(0,2).toUpperCase()}</span>
                             )}
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <span className="text-sm font-bold truncate block">{ex.name}</span>
                            <div className="flex gap-1 items-center">
                              <span className={`text-[8px] font-black px-1 rounded uppercase ${
                                ex.difficulty === 'Iniciante' ? 'bg-green-100 text-green-600' :
                                ex.difficulty === 'Intermediário' ? 'bg-blue-100 text-blue-600' :
                                'bg-purple-100 text-purple-600'
                              }`}>
                                {ex.difficulty?.[0]}
                              </span>
                              <span className="text-[8px] text-gray-300 font-black uppercase truncate">{ex.muscleGroup}</span>
                            </div>
                          </div>
                          <Plus className="w-4 h-4 text-gray-300 group-hover:text-black flex-shrink-0" />
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              <div className="p-8 border-t bg-gray-50">
                <button 
                  onClick={handleSaveWorkout}
                  className="w-full bg-black text-white py-5 rounded-[24px] font-black shadow-xl shadow-black/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  <Save className="w-6 h-6" /> SALVAR TREINO
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

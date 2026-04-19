import React, { useEffect, useState, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc,
  getDoc,
  setDoc,
  getDocs, 
  orderBy, 
  limit
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { Workout, Exercise, WorkoutExercise, UserProfile, WorkoutLog } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Repeat, 
  Clock, 
  ChevronRight, 
  CheckCircle2, 
  Trophy, 
  User, 
  Calendar, 
  ArrowLeft, 
  History, 
  Camera,
  Target,
  Dumbbell,
  Timer,
  Check,
  X,
  Info,
  LogOut,
  Zap,
  Smile,
  Moon,
  Sun,
  Sparkles
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { getRank } from '../lib/ranks';

const REST_JOKES = [
  "Por que o haltere foi à academia? Porque ele queria ficar pesado!",
  "Qual é o exercício favorito do pão? O 'pão-flexão'!",
  "Por que o treinador não consegue ver o aluno? Porque ele está fazendo 'abdominal oculto'!",
  "Foco! O músculo não cresce sozinho, mas a preguiça sim...",
  "Descansa agora, chora no leg press depois!",
  "Beba água! Seus músculos são 75% água e 25% vontade de ir embora.",
  "O treino está tão puxado que até o meu suor está pedindo arrego.",
  "Agachamento: a única maneira de ficar feliz por não conseguir sentar no dia seguinte.",
  "Levantamento de copo não conta como treino de ombro, sinto muito.",
  "Não é suor, é o seu corpo chorando porque a gordura está morrendo."
];

type View = 'DASHBOARD' | 'TRAINING' | 'DETAIL' | 'PROFILE' | 'HISTORY';

export default function StudentArea() {
  const { profile } = useAuth();
  const [view, setView] = useState<View>('DASHBOARD');
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<{
    workout: Workout;
    currentIndex: number;
    completedSets: boolean[][]; // [exerciseIndex][setIndex]
    startTime: string;
  } | null>(null);
  const [selectedExerciseIndex, setSelectedExerciseIndex] = useState<number | null>(null);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Timer for rest
  const [restTimeLeft, setRestTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Gemini state for exercise info
  const [exerciseInfo, setExerciseInfo] = useState<{ 
    [id: string]: { 
      purpose: string;
      setup: string;
      posture: string;
      execution: string;
      mindMuscle: string;
      equipmentName: string;
      instructions?: string; // fallback
    } 
  }>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [generatingInfo, setGeneratingInfo] = useState(false);

  // Reward Notification
  const [reward, setReward] = useState<{
    show: boolean;
    message: string;
    points: number;
    type: 'INTEREST' | 'WORKOUT_COMPLETE' | 'JOKE';
  } | null>(null);

  const [activeJoke, setActiveJoke] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    // Monthly Reset Logic
    const currentMonth = new Date().getMonth();
    
    if (profile.lastResetMonth !== undefined && profile.lastResetMonth !== currentMonth) {
      if ((profile.points || 0) > 0) {
        handleUpdateProfile({ points: 0, lastResetMonth: currentMonth });
      } else {
        handleUpdateProfile({ lastResetMonth: currentMonth });
      }
    } else if (profile.lastResetMonth === undefined) {
      handleUpdateProfile({ lastResetMonth: currentMonth });
    }

    // Listen to workouts
    const qWorkouts = query(collection(db, 'workouts'), where('studentId', '==', profile.uid));
    const unsubWorkouts = onSnapshot(qWorkouts, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Workout));
      setWorkouts(data);
      setLoading(false);
    });

    // Listen to history
    const qLogs = query(
      collection(db, 'workout_logs'), 
      where('studentId', '==', profile.uid),
      orderBy('date', 'desc'),
      limit(10)
    );
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkoutLog)));
    });

    return () => {
      unsubWorkouts();
      unsubLogs();
    };
  }, [profile]);

  useEffect(() => {
    if (restTimeLeft === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      setRestTimeLeft(null);
    }
  }, [restTimeLeft]);

  const startWorkout = (workout: Workout) => {
    setActiveWorkout({
      workout,
      currentIndex: 0,
      completedSets: workout.exercises.map(ex => new Array(parseInt(ex.series)).fill(false)),
      startTime: new Date().toISOString()
    });
    setView('TRAINING');

    // Auto-fetch ALL exercises to show info immediately, but WITHOUT awarding points (awardPoint=false)
    workout.exercises.forEach(ex => {
      getExerciseDetails(ex, true, false);
    });
  };

  const toggleSet = (exIdx: number, setIdx: number) => {
    if (!activeWorkout) return;
    
    const newCompleted = [...activeWorkout.completedSets];
    newCompleted[exIdx] = [...newCompleted[exIdx]];
    const wasDone = newCompleted[exIdx][setIdx];
    newCompleted[exIdx][setIdx] = !wasDone;
    
    setActiveWorkout({
      ...activeWorkout,
      completedSets: newCompleted
    });

    if (!wasDone) {
      const restSeconds = parseInt(activeWorkout.workout.exercises[exIdx].rest);
      startRestTimer(restSeconds);
      
      // Select a random joke
      const randomJoke = REST_JOKES[Math.floor(Math.random() * REST_JOKES.length)];
      setActiveJoke(randomJoke);
    }
  };

  const startRestTimer = (seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRestTimeLeft(seconds);
    timerRef.current = setInterval(() => {
      setRestTimeLeft(prev => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
  };

  const finishWorkout = async () => {
    if (!activeWorkout || !profile) return;

    const totalExercises = activeWorkout.workout.exercises.length;
    const completedCount = activeWorkout.completedSets.filter(sets => sets.every(s => s)).length;
    
    // Check Weekly Points
    const now = new Date();
    // Simple key for the week: Year-WeekNumber
    const getWeek = (date: Date) => {
      const oneJan = new Date(date.getFullYear(), 0, 1);
      const numberOfDays = Math.floor((date.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
      return Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
    };
    const weeklyKey = `${now.getFullYear()}-W${getWeek(now)}`;
    const alreadyGotWeekly = profile.lastWeeklyPointsKey === weeklyKey;

    let totalAwarded = 0;
    let message = "";

    if (!alreadyGotWeekly) {
      // Reward: 10 points for finishing + potentially 40 bonus
      const baseReward = 10;
      const achievementBonus = completedCount === totalExercises ? 40 : 10;
      totalAwarded = baseReward + achievementBonus;
      
      message = completedCount === totalExercises 
        ? "Performance Perfeita! Você dominou o treino completo e garantiu seu bônus semanal!" 
        : "Treino Finalizado! Ótimo trabalho hoje. Bônus semanal garantido!";
    } else {
      message = "Treino concluído com sucesso! Você já garantiu seus pontos semanais, mas seu esforço continua valendo para o Rank!";
    }

    const newPoints = (profile.points || 0) + totalAwarded;

    await addDoc(collection(db, 'workout_logs'), {
      studentId: profile.uid,
      workoutId: activeWorkout.workout.id,
      workoutName: activeWorkout.workout.name,
      date: new Date().toISOString(),
      exercisesCompleted: completedCount,
      totalExercises: totalExercises
    });

    await updateDoc(doc(db, 'users', profile.uid), {
      points: newPoints,
      lastWeeklyPointsKey: weeklyKey
    });

    setReward({
      show: true,
      message,
      points: totalAwarded,
      type: 'WORKOUT_COMPLETE'
    });

    setActiveWorkout(null);
    setView('DASHBOARD');
  };

  const getExerciseDetails = async (exercise: WorkoutExercise, force = false, awardPoint = false) => {
    // Interest point AWARD logic - only on explicit user request AND once per exercise
    if (awardPoint && profile) {
      const alreadyStudied = profile.studiedExercises?.includes(exercise.id);
      
      if (!alreadyStudied) {
        const currentPoints = profile.points || 0;
        const newStudiedList = [...(profile.studiedExercises || []), exercise.id];
        
        handleUpdateProfile({ 
          points: currentPoints + 1,
          studiedExercises: newStudiedList
        });
        
        setReward({
          show: true,
          message: "Parabéns pelo seu interesse em aprender a técnica correta! Estudar cada exercício te leva mais longe.",
          points: 1,
          type: 'INTEREST'
        });
      }
    }

    if (!force && exerciseInfo[exercise.id]) return;
    
    setLoadingIds(prev => new Set(prev).add(exercise.id));
    setGeneratingInfo(true);
    try {
      // Create a URL safe slug for the exercise name
      const slugify = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      const docId = slugify(exercise.name);
      const knowledgeRef = doc(db, 'exercise_knowledge', docId);
      
      const knowledgeSnap = await getDoc(knowledgeRef);

      if (knowledgeSnap.exists()) {
        const cachedData = knowledgeSnap.data();
        setExerciseInfo(prev => ({ 
          ...prev, 
          [exercise.id]: cachedData as any
        }));
      } else {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Como um treinador de elite e Mestre Daniel (especialista em biomecânica), forneça um guia de execução COMPLETO, DIDÁTICO e TOTALMENTE ESPECÍFICO para o exercício "${exercise.name}" focado em ${exercise.muscleGroup}.
          
          IMPORTANTE: Não use generalidades. Se for um Supino, fale de peito e tríceps. Se for um Agachamento, fale de quadríceps e glúteos. As instruções devem ser auto-explicativas para que o aluno não precise de ajuda.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                purpose: { type: Type.STRING, description: "Propósito anatômico específico deste exercício." },
                setup: { type: Type.STRING, description: "Posicionamento inicial: pés, base e mãos." },
                posture: { type: Type.STRING, description: "Postura: alinhamento de coluna, ombros e cabeça." },
                execution: { type: Type.STRING, description: "Execução: movimento, respiração e controle." },
                mindMuscle: { type: Type.STRING, description: "Dica infalível para sentir o músculo certo (conexão mente-músculo)." },
                equipmentName: { type: Type.STRING, description: "Nome exato do aparelho ou peso usado." },
                curiosity: { type: Type.STRING, description: "Fato incrivelmente interessante, história ou segredo biomecânico muito raro sobre este exercício. Seja cativante!" }
              },
              required: ["purpose", "setup", "posture", "execution", "mindMuscle", "equipmentName", "curiosity"]
            }
          }
        });
        
        const parsed = JSON.parse(response.text);
        const payload = {
          ...parsed,
          curiosity: parsed.curiosity || `A biomecânica dominada do ${exercise.name} é o segredo para transformar estímulos simples em hipertrofia real.`,
          equipmentName: exercise.equipmentName || parsed.equipmentName,
          instructions: `${parsed.setup}\n${parsed.posture}\n${parsed.execution}\n${parsed.mindMuscle}`
        };

        // Cache the newly generated content so it's consistent for everyone across all devices
        await setDoc(knowledgeRef, payload);

        setExerciseInfo(prev => ({ 
          ...prev, 
          [exercise.id]: payload
        }));
      }
    } catch (err) {
      console.error("Erro na geração AI:", err);
      // Fallback mais específico ao exercício para evitar o erro "tudo igual"
      setExerciseInfo(prev => ({ 
        ...prev, 
        [exercise.id]: { 
          purpose: `Fortalecimento de ${exercise.muscleGroup} através do movimento de ${exercise.name}.`,
          setup: `Posicione-se confortavelmente para iniciar o ${exercise.name}.`,
          posture: "Mantenha a coluna protegida e ombros estáveis.",
          execution: "Realize o movimento completo com controle na descida.",
          mindMuscle: `Foque totalmente na contração do ${exercise.muscleGroup} durante cada repetição.`,
          equipmentName: exercise.equipmentName || "Equipamento Padrão",
          curiosity: `É vital manter a técnica no ${exercise.name} para recrutar 100% de ${exercise.muscleGroup}.`,
          instructions: "Siga o padrão de movimento biomecânico correto."
        } 
      }));
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(exercise.id);
        return next;
      });
      setGeneratingInfo(false);
    }
  };

  const handleUpdateProfile = async (data: Partial<UserProfile>) => {
    if (!profile) return;
    await updateDoc(doc(db, 'users', profile.uid), data);
  };

  const getInitials = (name: string) => {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2) || '??';
  };

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-black/5 border-t-black rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFDFD] dark:bg-zinc-950 text-[#1D1D1F] dark:text-zinc-100 pb-20 transition-colors duration-300">
      <AnimatePresence mode="wait">
        {view === 'DASHBOARD' && (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pb-28"
          >
            <div className="px-6 pt-16 pb-8">
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h1 className="text-4xl font-black tracking-tighter mb-1 dark:text-white">
                    Olá, {profile?.name.split(' ')[0]}
                  </h1>
                  <p className="text-gray-400 dark:text-zinc-500 font-medium">Pronto para o treino?</p>
                </div>
                <button 
                  onClick={() => setView('PROFILE')}
                  className="w-14 h-14 rounded-[22px] bg-gray-100 dark:bg-zinc-800 overflow-hidden border-2 border-white dark:border-zinc-700 shadow-sm"
                >
                  {profile?.photoUrl ? (
                    <img src={profile.photoUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-lg">
                      {getInitials(profile?.name || '')}
                    </div>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-[32px] p-6 flex flex-col justify-between h-40 relative overflow-hidden">
                  <div className={`absolute top-0 right-0 p-4 opacity-20 ${getRank(profile?.points || 0).color}`}>
                    <Trophy className="w-20 h-20" />
                  </div>
                  <div>
                    <div className={`w-fit px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter mb-2 ${getRank(profile?.points || 0).bg} ${getRank(profile?.points || 0).color}`}>
                      Rank {getRank(profile?.points || 0).name}
                    </div>
                    <span className="text-3xl font-black block leading-none">{profile?.points || 0}</span>
                    <span className="text-xs font-bold text-white/50 dark:text-zinc-900/50 uppercase tracking-widest mt-1 block">Sua Pontuação</span>
                  </div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-[32px] p-6 flex flex-col justify-between h-40 border border-emerald-100 dark:border-emerald-900/50">
                  <Calendar className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <span className="text-3xl font-black block leading-none text-emerald-950 dark:text-emerald-50">
                      {logs.filter(l => l.date.split('T')[0] === new Date().toISOString().split('T')[0]).length > 0 ? 'Concluído' : 'Hoje'}
                    </span>
                    <span className="text-xs font-bold text-emerald-600/60 dark:text-emerald-400/60 uppercase tracking-widest mt-1 block">Status Diário</span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-[32px] p-6 mb-10">
                <div className="flex justify-between items-end mb-4">
                  <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">Progresso Semanal</h3>
                  <span className="text-2xl font-black dark:text-white">{logs.length} <span className="text-xs text-zinc-400">/ 7</span></span>
                </div>
                <div className="flex gap-2 h-2">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className={`flex-1 rounded-full ${i < logs.length ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-100 dark:bg-zinc-800'}`} />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl font-black tracking-tight mb-4 dark:text-white">Seus Treinos</h2>
                {workouts.length > 0 ? workouts.map(w => (
                  <div key={w.id} className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-6 rounded-[32px] flex items-center justify-between">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-zinc-900 dark:bg-zinc-100 rounded-[20px] flex items-center justify-center text-white dark:text-zinc-900">
                        <Dumbbell className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-lg leading-tight dark:text-white">{w.name}</h4>
                        <p className="text-xs text-zinc-400 font-bold uppercase mt-0.5">{w.exercises.length} Exercícios</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => startWorkout(w)}
                      className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center dark:text-white"
                    >
                      <Play className="w-5 h-5 fill-current" />
                    </button>
                  </div>
                )) : (
                  <div className="text-center py-10 bg-zinc-50 dark:bg-zinc-900/50 rounded-[32px] border-2 border-dashed border-zinc-100 dark:border-zinc-800">
                    <p className="text-zinc-400 font-bold uppercase text-xs tracking-widest">Aguardando treinador...</p>
                  </div>
                )}
              </div>
            </div>

            <div className="fixed bottom-8 left-6 right-6">
              <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-zinc-100 dark:border-zinc-800 rounded-[32px] py-4 px-8 flex justify-between shadow-2xl shadow-black/5 dark:shadow-black/20">
                <button onClick={() => setView('DASHBOARD')} className="flex flex-col items-center gap-1 text-zinc-900 dark:text-white">
                  <div className="w-1 h-1 bg-zinc-900 dark:bg-white rounded-full mb-1" />
                  <Target className="w-6 h-6" />
                </button>
                <button onClick={() => setView('HISTORY')} className="text-zinc-300 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors">
                  <History className="w-6 h-6" />
                </button>
                <button onClick={() => setView('PROFILE')} className="text-zinc-300 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors">
                  <User className="w-6 h-6" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {view === 'TRAINING' && activeWorkout && (
          <motion.div 
            key="training"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            className="bg-white dark:bg-zinc-950 min-h-screen pb-32 transition-colors duration-300"
          >
            <div className="px-6 pt-16 pb-8 sticky top-0 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-lg z-10 flex items-center justify-between border-b border-zinc-50 dark:border-zinc-900">
              <button 
                onClick={() => setView('DASHBOARD')}
                className="w-12 h-12 bg-zinc-50 dark:bg-zinc-900 rounded-full flex items-center justify-center dark:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="text-center">
                <h2 className="font-black text-xl tracking-tight dark:text-white">{activeWorkout.workout.name}</h2>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <div className="w-40 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-500" 
                      style={{ width: `${(activeWorkout.completedSets.filter(s => s.every(v => v)).length / activeWorkout.workout.exercises.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black uppercase text-zinc-400 dark:text-zinc-500">
                    {activeWorkout.completedSets.filter(s => s.every(v => v)).length} / {activeWorkout.workout.exercises.length}
                  </span>
                </div>
              </div>
              <div className="w-12" />
            </div>

            <div className="px-6 space-y-8 mt-4">
              {activeWorkout.workout.exercises.map((ex, exIdx) => (
                <div key={ex.id} className="space-y-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-6 rounded-[32px] shadow-sm">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex gap-4 items-start flex-1">
                      {/* Technical/Equipment Thumbnail */}
                      <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl overflow-hidden flex-shrink-0 border border-zinc-200 dark:border-zinc-700 flex flex-col items-center justify-center relative">
                        {ex.gifUrl && !ex.gifUrl.includes('loremflickr') ? (
                          <img 
                            src={ex.gifUrl}
                            alt="Execução"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-[20px] font-black text-zinc-300 dark:text-zinc-600 leading-none">
                            {getInitials(ex.name)}
                          </span>
                        )}
                      </div>

                      <button 
                        onClick={() => {
                          setSelectedExerciseIndex(exIdx);
                          getExerciseDetails(ex, false, true); // awardPoint=true
                          setView('DETAIL');
                        }}
                        className="flex-1 text-left"
                      >
                        <h3 className="text-xl font-black tracking-tight leading-tight dark:text-white">{exIdx + 1}. {ex.name}</h3>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                            {ex.muscleGroup} • {ex.series} Séries
                          </span>
                          {exerciseInfo[ex.id]?.equipmentName && (
                            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-md">
                              {exerciseInfo[ex.id].equipmentName}
                            </span>
                          )}
                        </div>
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => {
                        setSelectedExerciseIndex(exIdx);
                        getExerciseDetails(ex, false, true); // awardPoint=true
                        setView('DETAIL');
                      }}
                      className="w-10 h-10 bg-zinc-50 dark:bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 dark:text-zinc-500"
                    >
                      <Info className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Expandable How-to Button */}
                  <div className="bg-zinc-50/50 dark:bg-zinc-800/30 rounded-2xl p-4 border border-zinc-100/50 dark:border-zinc-800/50">
                    <button 
                      onClick={() => getExerciseDetails(ex, false, true)} // awardPoint=true
                      disabled={loadingIds.has(ex.id)}
                      className="flex items-center justify-between w-full"
                    >
                      <div className="flex items-center gap-2">
                        {loadingIds.has(ex.id) ? (
                          <div className="w-3 h-3 border-2 border-zinc-200 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin" />
                        ) : (
                          <Info className="w-4 h-4 text-zinc-400" />
                        )}
                        <span className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em]">
                          {loadingIds.has(ex.id) ? "Mapeando técnica..." : "Passo a passo e postura"}
                        </span>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform ${exerciseInfo[ex.id] ? 'rotate-90' : ''}`} />
                    </button>
                    
                    {exerciseInfo[ex.id] && (
                      <div className="mt-6 space-y-6 border-t border-zinc-100 dark:border-zinc-800 pt-6 animate-in fade-in slide-in-from-top-4">
                        <div className="flex gap-4 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                          <div className="w-8 h-8 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0">
                            <span className="font-black text-[10px] dark:text-white">1</span>
                          </div>
                          <div>
                            <h4 className="font-black text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-1">Base e Pés</h4>
                            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed">{exerciseInfo[ex.id].setup}</p>
                          </div>
                        </div>

                        <div className="flex gap-4 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                          <div className="w-8 h-8 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0">
                            <span className="font-black text-[10px] dark:text-white">2</span>
                          </div>
                          <div>
                            <h4 className="font-black text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-1">Braços e Ombros</h4>
                            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed">{exerciseInfo[ex.id].posture}</p>
                          </div>
                        </div>

                        <div className="flex gap-4 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                          <div className="w-8 h-8 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0">
                            <span className="font-black text-[10px] dark:text-white">3</span>
                          </div>
                          <div>
                            <h4 className="font-black text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-1">Movimento</h4>
                            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed">{exerciseInfo[ex.id].execution}</p>
                          </div>
                        </div>

                        <div className="flex gap-4 p-5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-[32px] shadow-lg shadow-zinc-900/10">
                          <div className="w-10 h-10 bg-amber-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                            <Zap className="w-5 h-5 text-zinc-900" />
                          </div>
                          <div>
                            <h4 className="font-black text-[9px] uppercase tracking-[0.2em] text-amber-400 dark:text-amber-600 mb-1">Conexão Mente-Músculo</h4>
                            <p className="text-sm font-bold leading-tight italic">"{exerciseInfo[ex.id].mindMuscle}"</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                    {activeWorkout.completedSets[exIdx].map((isDone, setIdx) => (
                      <button
                        key={setIdx}
                        onClick={() => toggleSet(exIdx, setIdx)}
                        className={`w-14 h-14 rounded-[20px] flex-shrink-0 flex items-center justify-center font-black transition-all ${
                          isDone 
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 border border-zinc-200/50 dark:border-zinc-700/50'
                        }`}
                      >
                        {isDone ? <Check className="w-5 h-5" /> : setIdx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <AnimatePresence>
              {restTimeLeft !== null && (
                <motion.div 
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 50 }}
                  className="fixed bottom-32 left-6 right-6 z-50"
                >
                  <div className="bg-black text-white rounded-[32px] p-8 flex items-center justify-between shadow-2xl">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-full border-4 border-white/10 flex items-center justify-center relative">
                        <Timer className="w-6 h-6" />
                        <motion.div 
                          className="absolute inset-[-4px] rounded-full border-4 border-emerald-500 border-t-transparent"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-white/50 uppercase tracking-widest">Descanso</h4>
                        <span className="text-3xl font-black leading-none">{restTimeLeft}s</span>
                      </div>
                    </div>
                    
                    {activeJoke && (
                      <div className="flex-1 px-6 border-l border-white/10 hidden sm:block">
                        <div className="flex gap-2 items-start">
                          <Smile className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-1" />
                          <p className="text-[11px] font-bold text-white/80 italic leading-snug">
                            {activeJoke}
                          </p>
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={() => setRestTimeLeft(0)}
                      className="bg-zinc-800 text-white px-6 py-3 rounded-2xl font-bold uppercase text-[10px] tracking-widest hover:bg-zinc-700 ml-4"
                    >
                      Pular
                    </button>
                  </div>

                  {/* Mobile Joke Display */}
                  {activeJoke && (
                    <div className="mt-3 bg-white/5 backdrop-blur-md rounded-2xl p-4 sm:hidden border border-white/10">
                      <div className="flex gap-3 items-start">
                        <Smile className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                        <p className="text-xs font-bold text-white/90 italic leading-relaxed">
                          {activeJoke}
                        </p>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="fixed bottom-8 left-6 right-6">
              <button
                onClick={finishWorkout}
                disabled={!activeWorkout.completedSets.every(sets => sets.every(s => s))}
                className={`w-full py-6 rounded-[32px] font-black text-lg shadow-2xl transition-all ${
                  activeWorkout.completedSets.every(sets => sets.every(s => s))
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-zinc-900/40'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed shadow-none'
                }`}
              >
                {activeWorkout.completedSets.every(sets => sets.every(s => s)) 
                  ? 'Finalizar Treino' 
                  : 'Complete o Treino para Finalizar'}
              </button>
            </div>
          </motion.div>
        )}

        {view === 'DETAIL' && selectedExerciseIndex !== null && activeWorkout && (
          <motion.div 
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="min-h-screen bg-white dark:bg-zinc-950 pb-32 transition-colors duration-300"
          >
            <div className="px-6 pt-16 pb-6 flex items-center justify-between">
              <button 
                onClick={() => setView('TRAINING')}
                className="w-12 h-12 bg-zinc-50 dark:bg-zinc-900 rounded-full flex items-center justify-center dark:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-black text-sm uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Instruções</h2>
              <div className="w-12" />
            </div>

            <div className="px-6 pt-4">
              <div className="w-full aspect-square bg-zinc-100 dark:bg-zinc-900 rounded-[48px] overflow-hidden mb-8 border border-zinc-200 dark:border-zinc-800 relative group flex items-center justify-center">
                {activeWorkout.workout.exercises[selectedExerciseIndex].gifUrl && !activeWorkout.workout.exercises[selectedExerciseIndex].gifUrl.includes('loremflickr') ? (
                  <>
                    <img 
                      src={activeWorkout.workout.exercises[selectedExerciseIndex].gifUrl}
                      alt={activeWorkout.workout.exercises[selectedExerciseIndex].name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-8 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-white font-black text-xl uppercase tracking-widest mb-2">Execução do Exercício</p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-zinc-300 dark:text-zinc-600 w-full h-full">
                    <div className="w-32 h-32 rounded-[40px] bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center mb-4 border-4 border-zinc-300 dark:border-zinc-700">
                      <span className="text-4xl font-black tracking-widest text-zinc-400 dark:text-zinc-500">
                        {getInitials(activeWorkout.workout.exercises[selectedExerciseIndex].name)}
                      </span>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Referência do Alvo Anatômico</p>
                    <p className="text-xs text-zinc-400 mt-2 px-10 text-center">Focando no recrutamento do {activeWorkout.workout.exercises[selectedExerciseIndex].muscleGroup}.</p>
                  </div>
                )}
              </div>

              <h1 className="text-4xl font-black tracking-tighter mb-4 dark:text-white">
                {activeWorkout.workout.exercises[selectedExerciseIndex].name}
              </h1>

              {generatingInfo ? (
                <div className="space-y-4">
                  <div className="h-4 bg-zinc-50 dark:bg-zinc-900 rounded-full w-3/4 animate-pulse" />
                  <div className="h-4 bg-zinc-50 dark:bg-zinc-900 rounded-full w-full animate-pulse" />
                  <div className="h-4 bg-zinc-50 dark:bg-zinc-900 rounded-full w-2/3 animate-pulse" />
                </div>
              ) : (
                <div className="space-y-10">
                  <section>
                    <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 mb-6 flex items-center gap-2">
                      <Target className="w-4 h-4" /> Alvo Muscular Prioritário
                    </h3>
                    <p className="text-xl font-medium leading-relaxed text-zinc-800 dark:text-zinc-200 mb-6">
                      {exerciseInfo[activeWorkout.workout.exercises[selectedExerciseIndex].id]?.purpose || "Processando análise..."}
                    </p>
                    {exerciseInfo[activeWorkout.workout.exercises[selectedExerciseIndex].id]?.equipmentName && (
                      <div className="flex items-center gap-3 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                        <div className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-xl shadow-sm flex items-center justify-center">
                          <Dumbbell className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-widest">Equipamento Sugerido</p>
                          <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{exerciseInfo[activeWorkout.workout.exercises[selectedExerciseIndex].id].equipmentName}</p>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="space-y-6">
                    <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> Sabedoria de Mestre
                    </h3>
                    
                    <div className="p-6 bg-emerald-50 dark:bg-emerald-950/20 rounded-3xl border border-emerald-100 dark:border-emerald-900/30 shadow-sm relative overflow-hidden">
                      <div className="absolute -right-4 -top-4 opacity-10">
                        <Sparkles className="w-24 h-24 text-emerald-500" />
                      </div>
                      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100 leading-relaxed italic relative z-10">
                        "{exerciseInfo[activeWorkout.workout.exercises[selectedExerciseIndex].id]?.curiosity || 'Todo exercício possui segredos biomecânicos. Uma vez dominados, o resultado é muito mais rápido e duradouro.'}"
                      </p>
                    </div>
                  </section>
                </div>
              )}
            </div>

            <div className="fixed bottom-8 left-6 right-6">
              <button 
                onClick={() => setView('TRAINING')}
                className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-6 rounded-[32px] font-black text-lg shadow-2xl transition-colors"
              >
                Voltar ao Treino
              </button>
            </div>
          </motion.div>
        )}

        {view === 'PROFILE' && (
          <motion.div 
            key="profile"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-6 pt-16 pb-32"
          >
            <div className="flex items-center justify-between mb-10">
              <button 
                onClick={() => setView('DASHBOARD')}
                className="w-12 h-12 bg-zinc-50 dark:bg-zinc-900 rounded-full flex items-center justify-center dark:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-black dark:text-white">Meu Perfil</h1>
              <div className="w-12" />
            </div>

            <div className="flex flex-col items-center mb-12">
              <div className="relative mb-4 group cursor-pointer">
                <div className="w-32 h-32 rounded-[40px] bg-zinc-100 dark:bg-zinc-800 overflow-hidden border-4 border-white dark:border-zinc-700 shadow-xl relative">
                  {profile?.photoUrl ? (
                    <img src={profile.photoUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-4xl font-black">
                      {getInitials(profile?.name || '')}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Camera className="text-white w-8 h-8" />
                  </div>
                </div>
                <input 
                  type="file" 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        handleUpdateProfile({ photoUrl: reader.result as string });
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </div>
              <h2 className="text-2xl font-black tracking-tight dark:text-white">{profile?.name}</h2>
              <div className={`mt-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${getRank(profile?.points || 0).bg} ${getRank(profile?.points || 0).color}`}>
                Rank {getRank(profile?.points || 0).name}
              </div>
              <p className="text-zinc-400 font-bold mt-1 dark:text-zinc-500">{profile?.email}</p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-widest pl-2 mb-2">Tema</label>
                <div className="bg-zinc-100 dark:bg-zinc-800 p-1 rounded-[24px] flex gap-1">
                  <button
                    onClick={() => handleUpdateProfile({ theme: 'light' })}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[20px] font-black uppercase text-[10px] tracking-widest transition-all ${
                      (profile?.theme || 'light') === 'light' 
                        ? 'bg-white text-zinc-900 shadow-md transform scale-[1.02]' 
                        : 'bg-transparent text-zinc-400 hover:text-zinc-600 dark:text-zinc-500'
                    }`}
                  >
                    <Sun className={`w-3.5 h-3.5 ${(profile?.theme || 'light') === 'light' ? 'text-orange-500' : ''}`} /> 
                    Claro
                  </button>
                  <button
                    onClick={() => handleUpdateProfile({ theme: 'dark' })}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[20px] font-black uppercase text-[10px] tracking-widest transition-all ${
                      profile?.theme === 'dark' 
                        ? 'bg-white dark:bg-zinc-100 text-zinc-900 shadow-md transform scale-[1.02]' 
                        : 'bg-transparent text-zinc-400 hover:text-zinc-600 dark:text-zinc-500'
                    }`}
                  >
                    <Moon className={`w-3.5 h-3.5 ${profile?.theme === 'dark' ? 'text-blue-500' : ''}`} /> 
                    Escuro
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-widest pl-2 mb-2">Idade</label>
                <input 
                  type="number" 
                  value={profile?.age || ''} 
                  onChange={(e) => handleUpdateProfile({ age: e.target.value })}
                  placeholder="Ex: 25"
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 px-6 py-4 rounded-[24px] font-bold dark:text-white focus:border-zinc-900 dark:focus:border-zinc-100 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-widest pl-2 mb-2">Objetivo</label>
                <input 
                  type="text" 
                  value={profile?.objective || ''} 
                  onChange={(e) => handleUpdateProfile({ objective: e.target.value })}
                  placeholder="Ex: Ganho de Massa"
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 px-6 py-4 rounded-[24px] font-bold dark:text-white focus:border-zinc-900 dark:focus:border-zinc-100 outline-none transition-all"
                />
              </div>
            </div>

            <div className="mt-12 space-y-4 flex flex-col items-center">
              <button 
                onClick={() => setView('HISTORY')}
                className="flex items-center gap-3 text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-black uppercase text-xs tracking-widest transition-colors"
              >
                <History className="w-4 h-4" /> Ver Histórico de Treinos
              </button>
              
              <button 
                onClick={() => signOut(auth)}
                className="flex items-center gap-3 text-red-400 hover:text-red-600 font-black uppercase text-xs tracking-widest pt-8 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sair da Conta
              </button>
            </div>
          </motion.div>
        )}

        {view === 'HISTORY' && (
          <motion.div 
            key="history"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-6 pt-16 pb-32 transition-colors duration-300"
          >
            <div className="flex items-center justify-between mb-10">
              <button 
                onClick={() => setView('DASHBOARD')}
                className="w-12 h-12 bg-zinc-50 dark:bg-zinc-900 rounded-full flex items-center justify-center dark:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-black dark:text-white">Histórico</h1>
              <div className="w-12" />
            </div>

            <div className="space-y-6">
              {logs.length > 0 ? logs.map(log => (
                <div key={log.id} className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-6 rounded-[32px] flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-lg leading-tight dark:text-white">{log.workoutName}</h4>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase mt-0.5">
                      {new Date(log.date).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black block dark:text-white">{log.exercisesCompleted}/{log.totalExercises}</span>
                    <span className="text-[8px] font-black uppercase text-zinc-300 dark:text-zinc-600">Exercícios</span>
                  </div>
                </div>
              )) : (
                <div className="text-center py-20 text-zinc-300 dark:text-zinc-700 italic">
                  Nenhum treino registrado ainda.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reward && reward.show && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-6 bg-black/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-[48px] p-10 w-full max-w-sm text-center shadow-2xl relative overflow-hidden"
            >
              <div className={`absolute top-0 left-0 w-full h-3 ${getRank(profile?.points || 0).bg}`} />
              
              <div className={`w-24 h-24 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner ${getRank(profile?.points || 0).bg} ${getRank(profile?.points || 0).color}`}>
                <Trophy className="w-12 h-12" />
              </div>
              
              <h3 className="text-3xl font-black tracking-tighter mb-4 dark:text-white">Você Evoluiu!</h3>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed mb-10 text-lg">
                {reward.message}
              </p>
              
              <div className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-[32px] py-6 px-10 mb-10 inline-flex items-center gap-4 shadow-xl">
                <Zap className="w-6 h-6 text-amber-400 fill-current" />
                <span className="text-3xl font-black">+{reward.points} Pontos</span>
              </div>
              
              <button 
                onClick={() => setReward(null)}
                className="w-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 py-6 rounded-[32px] font-black text-xl transition-all active:scale-95 shadow-sm"
              >
                Obter Recompensa
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {view === 'DASHBOARD' && restTimeLeft !== null && (
        <div className="fixed top-12 left-6 right-6 z-[60]">
          <div className="bg-emerald-500 text-white px-6 py-3 rounded-full flex items-center justify-between shadow-xl">
            <span className="text-xs font-black uppercase tracking-widest">Descanso Ativo</span>
            <span className="text-xl font-black">{restTimeLeft}s</span>
          </div>
        </div>
      )}
    </div>
  );
}

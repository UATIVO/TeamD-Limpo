import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { motion } from 'framer-motion';
import { LogIn, UserPlus, Dumbbell } from 'lucide-react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const MASTER_ADMIN_EMAIL = 'SimonKamina2014@gmail.com';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName: name });
        
        // Define role based on email
        const role = email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() ? 'admin' : 'student';

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          name,
          email,
          role,
          points: 0,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está em uso.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else if (err.code === 'auth/invalid-email') {
        setError('E-mail inválido.');
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('E-mail ou senha incorretos.');
      } else {
        setError('Erro ao processar: ' + (err.message || 'Erro desconhecido'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden"
      >
        <div className="bg-black p-8 text-center text-white">
          <div className="mx-auto w-24 h-24 bg-white/5 rounded-[2rem] mb-4 overflow-hidden border-2 border-white/10 p-1 flex items-center justify-center">
            <img src="/team-icon.png?v=2" alt="Team D Logo" className="w-full h-full object-cover rounded-[1.7rem] shadow-xl" />
          </div>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent">TEAM D</h1>
          <p className="text-white/60 text-sm mt-2 font-medium tracking-wide uppercase">Sua jornada começa aqui</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-black focus:ring-0 transition-colors bg-gray-50"
                    placeholder="Seu nome"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-black focus:ring-0 transition-colors bg-gray-50"
                placeholder="exemplo@email.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-black focus:ring-0 transition-colors bg-gray-50"
                placeholder="******"
              />
            </div>

            {error && <p className="text-red-500 text-xs font-medium bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white py-4 rounded-2xl font-semibold shadow-lg hover:bg-gray-900 active:scale-95 transition-all flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? (
                    <>
                      Entrar <LogIn className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  ) : (
                    <>
                      Criar Conta <UserPlus className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm font-medium text-gray-500 hover:text-black transition-colors"
            >
              {isLogin ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Faça login'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import StudentArea from './components/StudentArea';
import TrainerArea from './components/TrainerArea';

function AppContent() {
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (profile?.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [profile?.theme]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !profile) {
    return <Login />;
  }

  return (
    <main>
      {profile.role === 'admin' ? <TrainerArea /> : <StudentArea />}
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

import { useState } from 'react';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import { LoginForm } from './components/Auth/LoginForm';
import { ChatList } from './components/Chat/ChatList';
import { ChatWindow } from './components/Chat/ChatWindow';
import { CRMSidebar } from './components/CRM/CRMSidebar';
import { PendingManagers } from './components/Dashboard/PendingManagers';
import { AdminDashboard } from './components/Dashboard/AdminDashboard';
import { ReportsPanel } from './components/Dashboard/ReportsPanel';
import { EmployeeActivity } from './components/Dashboard/EmployeeActivity';
import { signOut } from './services/auth';
import type { Chat } from './types';

function AppContent() {
  const { employee, loading, refetch } = useAuthProvider();
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [adminView, setAdminView] = useState<'dashboard' | 'chat' | 'reports' | 'activity'>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b141a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) return <LoginForm onSuccess={refetch} />;

  const handleChatSelect = (chat: Chat) => {
    setActiveChat(chat);
    if (employee.role === 'admin') setAdminView('chat');
  };

  return (
    <AuthContext.Provider value={{ employee, loading, refetch }}>
      <div className="flex h-screen bg-[#0b141a]">
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-white/5">
          <div className="px-4 py-3 bg-[#202c33] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                {employee.name[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-[#e9edef]">{employee.name}</p>
                <p className="text-xs text-[#8696a0]">{employee.role === 'admin' ? 'Администратор' : 'Менеджер'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {employee.role === 'admin' && (
                <>
                  <button
                    onClick={() => { setAdminView('dashboard'); setActiveChat(null); }}
                    className={`px-2 py-1 rounded-lg transition-colors ${adminView === 'dashboard' ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                    title="Dashboard"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { setAdminView('reports'); setActiveChat(null); }}
                    className={`px-2 py-1 rounded-lg transition-colors ${adminView === 'reports' ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                    title="Аналитика"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { setAdminView('activity'); setActiveChat(null); }}
                    className={`px-2 py-1 rounded-lg transition-colors ${adminView === 'activity' ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                    title="Активность"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </>
              )}
              <button onClick={() => signOut()} className="text-[#8696a0] hover:text-[#e9edef] transition-colors" title="Выйти">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
          {employee.role === 'admin' && <PendingManagers />}
          <div className="flex-1 overflow-hidden">
            <ChatList activeChatId={activeChat?.id} onChatSelect={handleChatSelect} />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {employee.role === 'admin' && adminView === 'reports' ? (
            <ReportsPanel />
          ) : employee.role === 'admin' && adminView === 'activity' ? (
            <EmployeeActivity />
          ) : employee.role === 'admin' && adminView === 'dashboard' && !activeChat ? (
            <AdminDashboard onChatSelect={handleChatSelect} activeChatId={activeChat?.id} />
          ) : activeChat ? (
            <>
              <div className="flex-1 flex flex-col overflow-hidden">
                <ChatWindow chat={activeChat} onArchive={() => setActiveChat(null)} />
              </div>
              <CRMSidebar chat={activeChat} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 text-[#8696a0] mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-[#8696a0] text-sm">Выбери чат чтобы начать</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthContext.Provider>
  );
}

export default function App() {
  return <AppContent />;
}


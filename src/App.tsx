import { useState, useEffect, useRef } from 'react';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import { supabase } from './services/supabase';
import { LoginForm } from './components/Auth/LoginForm';
import { ChatList } from './components/Chat/ChatList';
import { ChatWindow } from './components/Chat/ChatWindow';
import { CRMSidebar } from './components/CRM/CRMSidebar';
import { PendingManagers } from './components/Dashboard/PendingManagers';
import { AdminDashboard } from './components/Dashboard/AdminDashboard';
import { ReportsPanel } from './components/Dashboard/ReportsPanel';
import { EmployeeActivity } from './components/Dashboard/EmployeeActivity';
import { signOut } from './services/auth';
import { ImportExcel } from './components/Chat/ImportExcel';
import { usePushNotifications } from './hooks/usePushNotifications';
import type { Chat } from './types';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  branch_admin: 'Руководитель',
  manager: 'Менеджер',
};

function AppContent() {
  const { employee, loading, refetch } = useAuthProvider();
  usePushNotifications(employee?.id);
  useEffect(() => {
    supabase.from('branches').select('id, name, city').then(({ data }) => setSidebarBranches(data ?? []));
  }, []);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [adminView, setAdminView] = useState<'dashboard' | 'chat' | 'reports' | 'activity'>('dashboard');
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'crm' | 'main'>('list');
  const [showImport, setShowImport] = useState(false);
  const [sidebarBranches, setSidebarBranches] = useState<{id:string;name:string;city:string}[]>([]);
  const isMobile = useIsMobile();
  const swipeRef = useRef({ x: 0, y: 0 });
  const mobileViewRef = useRef(mobileView);
  useEffect(() => { mobileViewRef.current = mobileView; }, [mobileView]);
  const activeChatRef = useRef(activeChat);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  useEffect(() => {
    if (!isMobile) return;
    const onStart = (e: TouchEvent) => { swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - swipeRef.current.x;
      const dy = Math.abs(e.changedTouches[0].clientY - swipeRef.current.y);
      if (dy < 80 && dx > 60) {
        const view = mobileViewRef.current;
        const chat = activeChatRef.current;
        if (view === 'crm') setMobileView('chat');
        else if (view === 'chat' && chat) { setActiveChat(null); setMobileView('list'); }
        else if (view === 'main') { setActiveChat(null); setMobileView('list'); setAdminView('dashboard'); }
      }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => { document.removeEventListener('touchstart', onStart); document.removeEventListener('touchend', onEnd); };
  }, [isMobile]);

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
    if (isMobile) setMobileView('chat');
  };

  const handleBack = () => {
    setActiveChat(null);
    setMobileView('list');
    if (employee.role === 'admin') setAdminView('dashboard');
  };

  const handleBackToList = () => {
    setActiveChat(null);
    setMobileView('list');
    setAdminView('dashboard');
  };

  const handleArchive = () => {
    setActiveChat(null);
    setMobileView('list');
  };

  const isAdminBtnActive = (view: string) =>
    adminView === view && (!isMobile || mobileView === 'main');

  const MobilePageHeader = ({ title }: { title: string }) => (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-white/10 flex-shrink-0">
      <button
        onClick={handleBackToList}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2a3942] text-white active:scale-95 transition-transform"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className="text-white font-semibold text-base">{title}</span>
    </div>
  );

  const Sidebar = (
    <div className={`${isMobile ? 'w-full' : 'w-80 flex-shrink-0 border-r border-white/5'} flex flex-col`}>
      <div className="px-4 py-3 bg-[#202c33] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
            {employee.name[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-[#e9edef]">{employee.name}</p>
            <p className="text-xs text-[#8696a0]">{ROLE_LABELS[employee.role] ?? employee.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {employee.role === 'admin' && (
            <>
              <button
                onClick={() => { setAdminView(`dashboard`); setActiveChat(null); if (isMobile) setMobileView(`main`); }} style={{display: isMobile ? `none` : `inline-flex`}}
                className={`px-2 py-1 rounded-lg transition-colors ${isAdminBtnActive('dashboard') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Dashboard"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              </button>
              <button
                onClick={() => { setAdminView('reports'); setActiveChat(null); if (isMobile) setMobileView('main'); }}
                className={`px-2 py-1 rounded-lg transition-colors ${isAdminBtnActive('reports') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Аналитика"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </button>
              <button
                onClick={() => { setAdminView('activity'); setActiveChat(null); if (isMobile) setMobileView('main'); }}
                className={`px-2 py-1 rounded-lg transition-colors ${isAdminBtnActive('activity') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Активность"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
            </>
          )}
          {employee.role === 'admin' && (
            <button
              onClick={() => setShowImport(true)}
              className="px-2 py-1 rounded-lg transition-colors text-[#8696a0] hover:text-[#e9edef]"
              title="Импорт Excel"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </button>
          )}
          <button onClick={() => signOut()} className="text-[#8696a0] hover:text-[#e9edef] transition-colors" title="Выйти">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          </button>
        </div>
      </div>
      {employee.role === 'admin' && <PendingManagers />}
      <div className="flex-1 overflow-hidden">
        <ChatList activeChatId={activeChat?.id} onChatSelect={handleChatSelect} />
      </div>
    </div>
  );

  const MainArea = (
    <div className="flex-1 flex overflow-hidden">
      {employee.role === 'admin' && adminView === 'reports' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile && <MobilePageHeader title="Аналитика" />}
          <ReportsPanel />
        </div>
      ) : employee.role === 'admin' && adminView === 'activity' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile && <MobilePageHeader title="Активность" />}
          <EmployeeActivity />
        </div>
      ) : employee.role === 'admin' && adminView === 'dashboard' && !activeChat ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile && <MobilePageHeader title="Dashboard" />}
          <AdminDashboard onChatSelect={handleChatSelect} activeChatId={activeChat?.id} />
        </div>
      ) : activeChat ? (
        <>
          <div className="flex-1 flex flex-col overflow-hidden">
            {isMobile ? (
              <>
                <div className="flex-1 overflow-hidden flex flex-col">
                  {mobileView === 'crm' ? (
                    <CRMSidebar chat={activeChat} onBack={() => setMobileView('chat')} />
                  ) : (
                    <ChatWindow chat={activeChat} onArchive={handleArchive} onBack={handleBack} />
                  )}
                </div>
                <div className="flex bg-[#202c33] border-t border-white/10 flex-shrink-0">
                  <button
                    onClick={() => setMobileView('chat')}
                    className={`flex-1 py-2 text-xs font-medium flex flex-col items-center gap-0.5 transition-colors ${mobileView !== 'crm' ? 'text-emerald-400' : 'text-[#8696a0]'}`}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                    Чат
                  </button>
                  <button
                    onClick={() => setMobileView('crm')}
                    className={`flex-1 py-2 text-xs font-medium flex flex-col items-center gap-0.5 transition-colors ${mobileView === 'crm' ? 'text-emerald-400' : 'text-[#8696a0]'}`}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    CRM
                  </button>
                </div>
              </>
            ) : (
              <ChatWindow chat={activeChat} onArchive={handleArchive} onBack={undefined} />
            )}
          </div>
          {!isMobile && <CRMSidebar chat={activeChat} onBack={() => setMobileView('chat')} />}
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
  );

  if (isMobile) {
    return (
      <AuthContext.Provider value={{ employee, loading, refetch }}>
        <div className="flex flex-col h-screen bg-[#0b141a]">
          {mobileView === 'list' && Sidebar}
          {(mobileView === 'chat' || mobileView === 'crm' || mobileView === 'main') && MainArea}
        </div>
        {showImport && <ImportExcel onClose={() => setShowImport(false)} branches={sidebarBranches} />}
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={{ employee, loading, refetch }}>
      <div className="flex h-screen bg-[#0b141a]">
        {Sidebar}
        {MainArea}
      </div>
      {showImport && <ImportExcel onClose={() => setShowImport(false)} branches={sidebarBranches} />}
    </AuthContext.Provider>
  );
}

export default function App() {
  return <AppContent />;
}





import { useState, useEffect, useRef } from 'react';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import { supabase } from './services/supabase';
import { LoginForm } from './components/Auth/LoginForm';
import { ChatList } from './components/Chat/ChatList';
import { ChatWindow } from './components/Chat/ChatWindow';
import { CRMSidebar } from './components/CRM/CRMSidebar';
import { PendingManagers } from './components/Dashboard/PendingManagers';
import { AdminDashboard } from './components/Dashboard/AdminDashboard';
import { WatchlistPanel, useWatchlistCount } from './components/Dashboard/WatchlistPanel';
import { ShieldAlert, Wrench } from 'lucide-react';
import { ReportsPanel } from './components/Dashboard/ReportsPanel';
import { EmployeeActivity } from './components/Dashboard/EmployeeActivity';
import { ManagerCRMPanel } from './components/CRM/ManagerCRMPanel';
import { TasksPanel } from './components/Dashboard/TasksPanel';
import { signOut } from './services/auth';
import { ImportExcel } from './components/Chat/ImportExcel';
import { usePushNotifications } from './hooks/usePushNotifications';
import InventoryPage from './pages/InventoryPage';
import WorkshopPage from './pages/WorkshopPage';
import WorkshopManagerView from './components/Workshop/WorkshopManagerView';
import { AutoArchiveSettings } from './components/Dashboard/AutoArchiveSettings';
import type { Chat } from './types';
import { playNotificationSound } from './utils/sound';

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

  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [chatSource, setChatSource] = useState<'list' | 'crm'>('list');
  const chatSourceRef = useRef<'list' | 'crm'>('list');
  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [hasPendingTransfers, setHasPendingTransfers] = useState(false);
  const [adminView, setAdminView] = useState<'dashboard' | 'chat' | 'reports' | 'activity' | 'tasks' | 'inventory' | 'workshop' | 'settings' | 'watchlist'>('dashboard');
  const watchlistCount = useWatchlistCount();
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'main' | 'manager-crm' | 'tasks' | 'inventory' | 'shop' | 'workshop'>('list');
  const [mobileHistory, setMobileHistory] = useState<typeof mobileView[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [sidebarBranches, setSidebarBranches] = useState<{id:string;name:string;city:string}[]>([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    supabase.from('branches').select('id, name, city').then(({ data }) => {
      setSidebarBranches(data ?? []);
    });
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') {
        playNotificationSound();
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (!employee || employee.role !== 'manager') return;
    let prevCount = 0;
    const fetchPending = async () => {
      const { count } = await supabase.from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', employee.id)
        .eq('confirmation_status', 'pending');
      const newCount = count ?? 0;
      if (newCount > prevCount) playNotificationSound();
      prevCount = newCount;
      setPendingTasksCount(newCount);
    };
    fetchPending();
    const channel = supabase
      .channel(`pending-tasks-badge-${employee.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter: `employee_id=eq.${employee.id}` }, fetchPending)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `employee_id=eq.${employee.id}` }, fetchPending)
      .subscribe();
    window.addEventListener('tasks-updated', fetchPending);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('tasks-updated', fetchPending);
    };
  }, [employee?.id]);

  useEffect(() => {
    if (!employee?.branch_id) return;
    const lastViewed = localStorage.getItem('lastViewedMovements') ?? new Date(0).toISOString();
    supabase
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .eq('to_branch_id', employee.branch_id)
      .eq('type', 'transfer')
      .eq('status', 'in_transit')
      .gt('created_at', lastViewed)
      .then(({ count }) => setHasPendingTransfers((count ?? 0) > 0));
  }, [employee?.branch_id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view === 'inventory') {
      navigateTo('inventory');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const navigateTo = (view: typeof mobileView) => {
    setMobileHistory(prev => [...prev, mobileView]);
    setMobileView(view);
  };

  const swipeRef = useRef({ x: 0, y: 0 });
  const mobileViewRef = useRef(mobileView);
  useEffect(() => { mobileViewRef.current = mobileView; }, [mobileView]);
  const mobileHistoryRef = useRef(mobileHistory);
  useEffect(() => { mobileHistoryRef.current = mobileHistory; }, [mobileHistory]);
  const activeChatRef = useRef(activeChat);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  const adminViewRef = useRef(adminView);
  useEffect(() => { adminViewRef.current = adminView; }, [adminView]);

  const navigateBackRef = useRef(() => {});
  navigateBackRef.current = () => {
    if (mobileHistoryRef.current.length === 0) return;
    const prev = mobileHistoryRef.current[mobileHistoryRef.current.length - 1];
    setMobileHistory(h => h.slice(0, -1));
    setMobileView(prev);
  };

  useEffect(() => {
    if (!isMobile) return;
    const onStart = (e: TouchEvent) => {
      swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onEnd = (e: TouchEvent) => {
      if (document.querySelector('[data-modal="true"]')) return;
      const dx = e.changedTouches[0].clientX - swipeRef.current.x;
      const dy = Math.abs(e.changedTouches[0].clientY - swipeRef.current.y);
      if (dy < 80 && dx > 60) {
        const view = mobileViewRef.current;
        if (view === 'inventory' || view === 'shop' || view === 'workshop' || (view === 'main' && (adminViewRef.current === 'inventory' || adminViewRef.current === 'workshop'))) {
          setMobileView('list');
        } else if (view === 'main' && ['reports', 'tasks', 'activity', 'settings', 'watchlist'].includes(adminViewRef.current)) {
          setActiveChat(null);
          setMobileView('list');
          setAdminView('dashboard');
        } else {
          navigateBackRef.current();
        }
      }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [isMobile]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b141a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) return <LoginForm onSuccess={refetch} />;

  const isManager = employee.role === 'manager';
  const isAdmin = employee.role === 'admin' || employee.role === 'branch_admin';

  const handleChatSelect = (chat: Chat) => {
    setChatSource('list');
    chatSourceRef.current = 'list';
    setActiveChat(chat);
    if (isAdmin) setAdminView('chat');
    if (isMobile) setMobileView('chat');
  };

  const handleBack = () => {
    setActiveChat(null);
    if (chatSourceRef.current === 'crm') {
      setMobileView('manager-crm');
    } else {
      setMobileView('list');
      if (isAdmin) setAdminView('dashboard');
    }
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

  const isManagerBtnActive = (view: string) =>
    mobileView === view && !activeChat;

  const MobilePageHeader = ({ title }: { title: string }) => (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-white/10 flex-shrink-0">
      <button onClick={handleBackToList}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2a3942] text-white active:scale-95 transition-transform">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className="text-white font-semibold text-base">{title}</span>
    </div>
  );

  const Sidebar = (
    <div className={`${isMobile ? 'w-full' : 'w-80 flex-shrink-0 border-r border-white/5'} flex flex-col`}>
      <div className="px-4 py-3 bg-[#202c33] flex items-center justify-between overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
            {employee.name[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#e9edef] truncate">{employee.name}</p>
            <p className="text-xs text-[#8696a0] truncate">{ROLE_LABELS[employee.role] ?? employee.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {isAdmin && !isMobile && (
            <>
              <button onClick={() => { setAdminView('dashboard'); setActiveChat(null); if (isMobile) setMobileView('main'); }}
                className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 ${isAdminBtnActive('dashboard') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Dashboard">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              </button>
              <button onClick={() => { setAdminView('tasks'); setActiveChat(null); if (isMobile) setMobileView('main'); }}
                className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 ${isAdminBtnActive('tasks') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Задачи">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
              </button>
              <button onClick={() => { setAdminView('reports'); setActiveChat(null); if (isMobile) setMobileView('main'); }}
                className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 ${isAdminBtnActive('reports') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Аналитика">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </button>
              <button onClick={() => { setAdminView('activity'); setActiveChat(null); if (isMobile) setMobileView('main'); }}
                className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 ${isAdminBtnActive('activity') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Активность">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
              <button onClick={() => { setAdminView('inventory'); setActiveChat(null); if (isMobile) setMobileView('inventory'); }}
                className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 ${isAdminBtnActive('inventory') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Склад">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              </button>
              {employee?.branch_id === '1104bc27-07bb-4930-93b2-19a2d92b71c9' && (
              <button onClick={() => { setAdminView('workshop'); setActiveChat(null); if (isMobile) setMobileView('workshop'); }}
                className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 ${isAdminBtnActive('workshop') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Мастерская">
                <Wrench className="w-3.5 h-3.5" />
              </button>
              )}
              <button onClick={() => setShowImport(true)}
                className="px-1 py-1 rounded-lg transition-colors flex-shrink-0 text-[#8696a0] hover:text-[#e9edef]" title="Импорт Excel">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </button>
              {employee.role === 'admin' && (
                <button
                  onClick={() => { setAdminView('settings'); setActiveChat(null); if (isMobile) setMobileView('main'); }}
                  className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 ${isAdminBtnActive('settings') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                  title="Настройки">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              )}
              {employee.role === 'admin' && (
                <button
                  onClick={() => { setAdminView('watchlist'); setActiveChat(null); if (isMobile) setMobileView('main'); }}
                  className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 relative ${isAdminBtnActive('watchlist') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                  title="На заметке"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {watchlistCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                      {watchlistCount > 9 ? '9+' : watchlistCount}
                    </span>
                  )}
                </button>
              )}
            </>
          )}

          {/* Кнопки навигации менеджера на десктопе */}
          {isManager && !isMobile && (
            <>
              <button onClick={() => { setMobileView('tasks'); setActiveChat(null); }}
                className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 ${isManagerBtnActive('tasks') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Задачи">
                <div className="relative">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                  {pendingTasksCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 rounded-full text-white text-[8px] font-bold flex items-center justify-center px-0.5">
                      {pendingTasksCount > 99 ? '99+' : pendingTasksCount}
                    </span>
                  )}
                </div>
              </button>
              <button onClick={() => { setMobileView('manager-crm'); setActiveChat(null); }}
                className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 ${isManagerBtnActive('manager-crm') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="CRM">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              </button>
              <button onClick={() => { setMobileView('shop'); setActiveChat(null); }}
                className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 ${isManagerBtnActive('shop') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Магазин">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
              </button>
              <button onClick={() => { setMobileView('inventory'); setActiveChat(null); }}
                className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 ${isManagerBtnActive('inventory') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Склад">
                <div className="relative">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                  {hasPendingTransfers && mobileView !== 'inventory' && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </div>
              </button>
              <button onClick={() => { setMobileView('workshop'); setActiveChat(null); }}
                className={`px-1 py-1 rounded-lg transition-colors flex-shrink-0 ${isManagerBtnActive('workshop') ? 'bg-emerald-500 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                title="Мастерская">
                <Wrench className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button onClick={() => signOut()} className="text-[#8696a0] hover:text-[#e9edef] transition-colors flex-shrink-0" title="Выйти">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          </button>
        </div>
      </div>
      {isAdmin && isMobile && (
        <div className="flex justify-around bg-[#202c33] border-b border-white/10 px-1 py-2 flex-shrink-0">
          <button
            onClick={() => { setAdminView('dashboard'); setActiveChat(null); setMobileView('main'); }}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${isAdminBtnActive('dashboard') ? 'text-emerald-400' : 'text-[#8696a0]'}`}
            title="Dashboard"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
          </button>
          <button
            onClick={() => { setAdminView('tasks'); setActiveChat(null); setMobileView('main'); }}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${isAdminBtnActive('tasks') ? 'text-emerald-400' : 'text-[#8696a0]'}`}
            title="Задачи"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
          </button>
          <button
            onClick={() => { setAdminView('reports'); setActiveChat(null); setMobileView('main'); }}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${isAdminBtnActive('reports') ? 'text-emerald-400' : 'text-[#8696a0]'}`}
            title="Аналитика"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </button>
          <button
            onClick={() => { setAdminView('activity'); setActiveChat(null); setMobileView('main'); }}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${isAdminBtnActive('activity') ? 'text-emerald-400' : 'text-[#8696a0]'}`}
            title="Активность"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
          <button
            onClick={() => { setAdminView('inventory'); setActiveChat(null); setMobileView('inventory'); }}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${isAdminBtnActive('inventory') ? 'text-emerald-400' : 'text-[#8696a0]'}`}
            title="Склад"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
          </button>
          {employee?.branch_id === '1104bc27-07bb-4930-93b2-19a2d92b71c9' && (
          <button
            onClick={() => { setAdminView('workshop'); setActiveChat(null); setMobileView('workshop'); }}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${isAdminBtnActive('workshop') ? 'text-emerald-400' : 'text-[#8696a0]'}`}
            title="Мастерская"
          >
            <Wrench className="w-5 h-5" />
          </button>
          )}
          {employee.role === 'admin' && (
            <button
              onClick={() => { setAdminView('settings'); setActiveChat(null); setMobileView('main'); }}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${isAdminBtnActive('settings') ? 'text-emerald-400' : 'text-[#8696a0]'}`}
              title="Настройки"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
          {employee.role === 'admin' && (
            <button
              onClick={() => { setAdminView('watchlist'); setActiveChat(null); setMobileView('main'); }}
              className={`relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${isAdminBtnActive('watchlist') ? 'text-emerald-400' : 'text-[#8696a0]'}`}
              title="На заметке"
            >
              <ShieldAlert className="w-5 h-5" />
              {watchlistCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                  {watchlistCount > 9 ? '9+' : watchlistCount}
                </span>
              )}
            </button>
          )}
        </div>
      )}
      {isAdmin && <PendingManagers />}
      <div className="flex-1 overflow-hidden">
        <ChatList activeChatId={activeChat?.id} onChatSelect={handleChatSelect} />
      </div>
      {(employee.role === 'manager' || employee.role === 'branch_admin') && isMobile && (
        <div className="flex bg-[#202c33] border-t border-white/10 flex-shrink-0">
          <button onClick={() => { setMobileHistory([]); setMobileView('list'); }}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors ${mobileView === 'list' ? 'text-emerald-400' : 'text-[#8696a0]'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            <span className="text-[10px] font-medium">Чаты</span>
          </button>
          <button onClick={() => navigateTo('tasks')}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors ${mobileView === 'tasks' ? 'text-emerald-400' : 'text-[#8696a0]'}`}>
            <div className="relative">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
              {pendingTasksCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                  {pendingTasksCount > 99 ? '99+' : pendingTasksCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">Задачи</span>
          </button>
          <button onClick={() => navigateTo('manager-crm')}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors ${mobileView === 'manager-crm' ? 'text-emerald-400' : 'text-[#8696a0]'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            <span className="text-[10px] font-medium">CRM</span>
          </button>
          <button onClick={() => navigateTo('shop')}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors ${mobileView === 'shop' ? 'text-emerald-400' : 'text-[#8696a0]'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
            <span className="text-[10px] font-medium">Магазин</span>
          </button>
          <button onClick={() => navigateTo('inventory')}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors ${mobileView === 'inventory' ? 'text-emerald-400' : 'text-[#8696a0]'}`}>
            <div className="relative inline-flex flex-col items-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              {hasPendingTransfers && mobileView !== 'inventory' && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
              <span className="text-[10px] font-medium">Склад</span>
            </div>
          </button>
          <button onClick={() => navigateTo('workshop')}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors ${mobileView === 'workshop' ? 'text-emerald-400' : 'text-[#8696a0]'}`}>
            <Wrench className="w-5 h-5" />
            <span className="text-[10px] font-medium">Мастерская</span>
          </button>
        </div>
      )}
    </div>
  );

  const MainArea = (
    <div className="flex-1 flex overflow-hidden">
      {isAdmin && adminView === 'watchlist' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile && <MobilePageHeader title="На заметке" />}
          <WatchlistPanel />
        </div>
      ) : isAdmin && adminView === 'settings' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile && <MobilePageHeader title="Настройки" />}
          <AutoArchiveSettings onBack={handleBackToList} />
        </div>
      ) : isAdmin && adminView === 'inventory' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile && <MobilePageHeader title="Склад" />}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <InventoryPage
              branchId={employee?.branch_id}
              employeeId={employee.id}
              role={employee.role as 'manager' | 'branch_admin' | 'admin'}
            />
          </div>
        </div>
      ) : isAdmin && adminView === 'workshop' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile && <MobilePageHeader title="Мастерская" />}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <WorkshopPage
              branchId={null}
              employeeId={employee.id}
              role={employee.role as 'manager' | 'branch_admin' | 'admin'}
            />
          </div>
        </div>
      ) : isAdmin && adminView === 'tasks' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile && <MobilePageHeader title="Задачи" />}
          <TasksPanel onBack={handleBackToList} />
        </div>
      ) : isAdmin && adminView === 'reports' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile && <MobilePageHeader title="Аналитика" />}
          <ReportsPanel onBack={handleBackToList} />
        </div>
      ) : isAdmin && adminView === 'activity' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile && <MobilePageHeader title="Активность" />}
          <EmployeeActivity onBack={handleBackToList} />
        </div>
      ) : isAdmin && adminView === 'dashboard' && !activeChat ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile && <MobilePageHeader title="Dashboard" />}
          <AdminDashboard onChatSelect={handleChatSelect} activeChatId={activeChat?.id} />
        </div>

      ) : isManager && !isMobile && !activeChat && mobileView === 'tasks' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <TasksPanel onBack={() => setMobileView('list')} />
        </div>
      ) : isManager && !isMobile && !activeChat && mobileView === 'manager-crm' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <ManagerCRMPanel
            onBack={() => setMobileView('list')}
            employeeId={employee.id}
            onOpenChat={(chat) => { setChatSource('crm'); chatSourceRef.current = 'crm'; setActiveChat(chat); }}
          />
        </div>
      ) : isManager && !isMobile && !activeChat && mobileView === 'inventory' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50">
            <InventoryPage
              branchId={employee?.branch_id}
              employeeId={employee.id}
              role={employee.role as 'manager' | 'branch_admin' | 'admin'}
              onPendingTransfersChange={setHasPendingTransfers}
            />
          </div>
        </div>
      ) : isManager && !isMobile && !activeChat && mobileView === 'shop' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50">
            <InventoryPage
              branchId={employee?.branch_id}
              employeeId={employee.id}
              role={employee.role as 'manager' | 'branch_admin' | 'admin'}
              defaultTab="sales"
              storefront={true}
            />
          </div>
        </div>
      ) : isManager && !isMobile && !activeChat && mobileView === 'workshop' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50">
            {employee?.branch_id === '1104bc27-07bb-4930-93b2-19a2d92b71c9' ? (
              <WorkshopPage
                branchId={employee.branch_id}
                employeeId={employee.id}
                role={employee.role as 'manager' | 'branch_admin' | 'admin'}
              />
            ) : (
              <WorkshopManagerView
                branchId={employee?.branch_id ?? ''}
                employeeId={employee.id}
                role={employee.role as 'manager' | 'branch_admin' | 'admin'}
              />
            )}
          </div>
        </div>

      ) : activeChat ? (
        <>
          <div className="flex-1 flex flex-col overflow-hidden">
            <ChatWindow chat={activeChat} onArchive={handleArchive} onBack={isMobile ? handleBack : undefined} />
          </div>
          {!isMobile && <CRMSidebar chat={activeChat} />}
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
          {mobileView === 'tasks' && <TasksPanel onBack={() => setMobileView('list')} />}
          {mobileView === 'manager-crm' && <ManagerCRMPanel onBack={() => setMobileView('list')} employeeId={employee.id} onOpenChat={(chat) => { setChatSource('crm'); chatSourceRef.current = 'crm'; setActiveChat(chat); setMobileView('chat'); }} />}
          {mobileView === 'inventory' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <MobilePageHeader title="Склад" />
              <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50">
                <InventoryPage
                  branchId={employee?.branch_id}
                  employeeId={employee.id}
                  role={employee.role as 'manager' | 'branch_admin' | 'admin'}
                  onPendingTransfersChange={setHasPendingTransfers}
                />
              </div>
            </div>
          )}
          {mobileView === 'shop' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <MobilePageHeader title="Магазин" />
              <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50">
                <InventoryPage
                  branchId={employee?.branch_id}
                  employeeId={employee.id}
                  role={employee.role as 'manager' | 'branch_admin' | 'admin'}
                  defaultTab="sales"
                  storefront={true}
                />
              </div>
            </div>
          )}
          {mobileView === 'workshop' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <MobilePageHeader title={
                isAdmin || employee?.branch_id === '1104bc27-07bb-4930-93b2-19a2d92b71c9'
                  ? 'Мастерская'
                  : 'Услуги мастерской'
              } />
              <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50">
                {isAdmin || employee?.branch_id === '1104bc27-07bb-4930-93b2-19a2d92b71c9' ? (
                  <WorkshopPage
                    branchId={isAdmin ? null : employee.branch_id}
                    employeeId={employee.id}
                    role={employee.role as 'manager' | 'branch_admin' | 'admin'}
                  />
                ) : (
                  <WorkshopManagerView
                    branchId={employee?.branch_id ?? ''}
                    employeeId={employee.id}
                    role={employee.role as 'manager' | 'branch_admin' | 'admin'}
                  />
                )}
              </div>
            </div>
          )}
          {(mobileView === 'chat' || (mobileView === 'main' && isAdmin)) && MainArea}
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
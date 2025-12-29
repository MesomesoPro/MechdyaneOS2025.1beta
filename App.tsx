import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Taskbar from './components/Taskbar';
import Desktop from './components/Desktop';
import Window from './components/Window';
import StartMenu from './components/StartMenu';
import GlobalSearch from './components/GlobalSearch';
import Assistant from './pages/Assistant';
import Emotions from './pages/Emotions';
import AppManager from './pages/AppManager';
import Settings from './pages/Settings';
import ControlPanel from './pages/ControlPanel';
import Calendar from './pages/Calendar';
import Armory from './pages/Armory';
import Achievements from './pages/Achievements';
import MindMapper from './pages/MindMapper';
import FocusTimer from './pages/FocusTimer';
import SmartCalc from './pages/SmartCalc';
import NeuralStream from './pages/NeuralStream';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
import CourseCreator from './pages/CourseCreator';
import OSHelper from './pages/OSHelper';
import BountyBoard from './pages/BountyBoard';
import { SOFTWARE_CATALOG, MODULES as INITIAL_MODULES, INITIAL_USER, INITIAL_ACHIEVEMENTS, INITIAL_INVENTORY } from './constants';
import { AppId, LearningModule, UserState, Achievement, InventoryItem, RewardToast, SystemError } from './types';
import { generateDynamicLessonContent } from './services/geminiService';

interface WindowState {
  id: AppId;
  title: string;
  icon: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
}

const App: React.FC = () => {
  // --- STATE ---
  const [user, setUser] = useState<UserState>(() => {
    const saved = localStorage.getItem('mechdyane_user');
    return saved ? JSON.parse(saved) : { ...INITIAL_USER, badges: [] };
  });
  const [modules, setModules] = useState<LearningModule[]>(() => {
    const saved = localStorage.getItem('mechdyane_modules');
    return saved ? JSON.parse(saved) : INITIAL_MODULES;
  });
  const [installedAppIds, setInstalledAppIds] = useState<AppId[]>(() => {
    const saved = localStorage.getItem('mechdyane_installed');
    return saved ? JSON.parse(saved) : SOFTWARE_CATALOG.filter(a => a.isSystem).map(a => a.id);
  });
  const [achievements, setAchievements] = useState<Achievement[]>(() => {
    const saved = localStorage.getItem('mechdyane_achievements');
    return saved ? JSON.parse(saved) : INITIAL_ACHIEVEMENTS;
  });
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem('mechdyane_inventory');
    return saved ? JSON.parse(saved) : INITIAL_INVENTORY;
  });
  const [claimedBountyIds, setClaimedBountyIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('mechdyane_claimed_bounties');
    return saved ? JSON.parse(saved) : [];
  });

  const [focusMode, setFocusMode] = useState<boolean>(localStorage.getItem('mechdyane_focus') === 'true');
  
  const [isApiEnabled, setIsApiEnabled] = useState(() => {
    const saved = localStorage.getItem('mechdyane_api_enabled');
    return saved !== 'false'; 
  });
  
  const [synapticPulse, setSynapticPulse] = useState<number>(Number(localStorage.getItem('mechdyane_pulse')) || 1);

  const [windows, setWindows] = useState<Record<AppId, WindowState>>({});
  const [activeApp, setActiveApp] = useState<AppId | null>(null);
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [maxZ, setMaxZ] = useState(100);
  const [rewardToasts, setRewardToasts] = useState<RewardToast[]>([]);

  // --- LEARNING ENGINE ---
  const [activeLearningModuleId, setActiveLearningModuleId] = useState<string | null>(null);
  const [learningStep, setLearningStep] = useState<'lesson' | 'loading' | 'quiz' | 'result' | 'error'>('lesson');
  const [dynamicMilestone, setDynamicMilestone] = useState<any>(null);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [lessonScore, setLessonScore] = useState(0);
  const [quizSelection, setQuizSelection] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string>('SYNCHRONIZING');

  const activeLearningModule = useMemo(() => 
    modules.find(m => m.id === activeLearningModuleId),
    [modules, activeLearningModuleId]
  );

  // --- PERSISTENCE ---
  useEffect(() => { localStorage.setItem('mechdyane_user', JSON.stringify(user)); }, [user]);
  useEffect(() => { localStorage.setItem('mechdyane_achievements', JSON.stringify(achievements)); }, [achievements]);
  useEffect(() => { localStorage.setItem('mechdyane_inventory', JSON.stringify(inventory)); }, [inventory]);
  useEffect(() => { localStorage.setItem('mechdyane_modules', JSON.stringify(modules)); }, [modules]);
  useEffect(() => { localStorage.setItem('mechdyane_claimed_bounties', JSON.stringify(claimedBountyIds)); }, [claimedBountyIds]);
  useEffect(() => { localStorage.setItem('mechdyane_focus', String(focusMode)); }, [focusMode]);
  useEffect(() => { localStorage.setItem('mechdyane_api_enabled', String(isApiEnabled)); }, [isApiEnabled]);

  // --- SMART SIDEBAR ---
  useEffect(() => {
    const allWindows = Object.values(windows) as WindowState[];
    const openWindows = allWindows.filter(w => w.isOpen);
    const anyMaximized = openWindows.some(w => w.isMaximized);
    const nonDashFocused = activeApp && activeApp !== 'dashboard';
    const shouldHide = anyMaximized || (nonDashFocused && openWindows.length > 0);
    const isWorkspaceClear = openWindows.length === 0 || openWindows.every(w => w.isMinimized);

    if (shouldHide && !isSidebarHidden) setIsSidebarHidden(true);
    else if (isWorkspaceClear && isSidebarHidden) setIsSidebarHidden(false);
  }, [windows, activeApp, isSidebarHidden]);

  // --- REWARDS ---
  const triggerRewardToast = (amount: string, type: 'xp' | 'credits' | 'error') => {
    const id = Math.random().toString(36).substr(2, 9);
    setRewardToasts(prev => [...prev, { id, amount, type, timestamp: Date.now() }]);
    setTimeout(() => {
      setRewardToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const processPointGain = (xpGain: number, creditGain: number) => {
    triggerRewardToast(`+${xpGain}`, 'xp');
    triggerRewardToast(`+${creditGain}`, 'credits');
    setUser(prev => {
      const nextTotalXp = prev.xp + xpGain;
      return { ...prev, xp: nextTotalXp, credits: prev.credits + creditGain, level: Math.floor(nextTotalXp / 1000) + 1 };
    });
  };

  // --- WINDOWS ---
  const openApp = useCallback((id: AppId, title?: string, icon?: string, fromTaskbar: boolean = false) => {
    const newZ = maxZ + 1;
    setMaxZ(newZ);
    const existing = windows[id];
    
    if (fromTaskbar && activeApp === id && existing?.isOpen && !existing?.isMinimized) {
      setWindows(prev => ({ ...prev, [id]: { ...prev[id], isMinimized: true } }));
      setActiveApp(null);
      return;
    }

    setWindows(prev => {
      const win = prev[id];
      if (win && win.isOpen) {
        return { ...prev, [id]: { ...win, isMinimized: false, zIndex: newZ } };
      }
      const mod = modules.find(m => m.id === id);
      const appInfo = SOFTWARE_CATALOG.find(a => a.id === id);
      return {
        ...prev,
        [id]: {
          id, title: title || mod?.title || appInfo?.name || id, icon: icon || mod?.icon || appInfo?.icon || 'fa-cube',
          isOpen: true, isMinimized: false, isMaximized: false, zIndex: newZ
        }
      };
    });

    setActiveApp(id);
    setIsStartOpen(false);

    const mod = modules.find(m => m.id === id);
    if (mod && (!existing || !existing.isOpen)) {
      setActiveLearningModuleId(id);
      loadLessonContent(mod);
    }
  }, [maxZ, activeApp, modules, windows]);

  const closeApp = (id: AppId) => {
    setWindows(prev => ({ ...prev, [id]: { ...prev[id], isOpen: false } }));
    if (activeApp === id) setActiveApp(null);
  };

  const focusApp = (id: AppId) => {
    const newZ = maxZ + 1;
    setMaxZ(newZ);
    setWindows(prev => ({ ...prev, [id]: { ...prev[id], zIndex: newZ, isMinimized: false } }));
    setActiveApp(id);
  };

  const loadLessonContent = async (mod: LearningModule) => {
    setLearningStep('loading');
    setLoadingStatus('SYNCHRONIZING');
    setCurrentQuizIndex(0);
    setLessonScore(0);
    setQuizSelection(null);
    
    if (!isApiEnabled) {
      setTimeout(() => {
        const localMilestone = mod.milestones[mod.lessonsFinished] || mod.milestones[0];
        setDynamicMilestone(localMilestone);
        setLearningStep('lesson');
      }, 1500); 
      return;
    }

    try {
      const dynamicData = await generateDynamicLessonContent(mod.title, mod.lessonsFinished + 1, user.level);
      setDynamicMilestone(dynamicData);
      setLearningStep('lesson');
    } catch (e) {
      setLoadingStatus('DESYNC');
      triggerRewardToast('Neural Desync', 'error');
    }
  };

  const handleForceLocalSync = () => {
    setIsApiEnabled(false);
    setLoadingStatus('ARCHIVING');
    setTimeout(() => {
      if (activeLearningModule) {
        const localMilestone = activeLearningModule.milestones[activeLearningModule.lessonsFinished] || activeLearningModule.milestones[0];
        setDynamicMilestone(localMilestone);
        setLearningStep('lesson');
      }
    }, 800);
  };

  const handleCheckAnswer = () => {
    if (!activeLearningModule || !quizSelection || !dynamicMilestone) return;
    const currentQuiz = dynamicMilestone.quizzes[currentQuizIndex];
    if (currentQuiz.correctLetter === quizSelection) {
      setQuizFeedback('correct');
      setLessonScore(prev => prev + 1);
      setTimeout(() => {
        if (currentQuizIndex < dynamicMilestone.quizzes.length - 1) {
          setCurrentQuizIndex(prev => prev + 1);
          setQuizSelection(null);
          setQuizFeedback(null);
        } else {
          const nextFinished = activeLearningModule.lessonsFinished + 1;
          const nextProgress = Math.floor((nextFinished / activeLearningModule.totalLessons) * 100);
          setModules(m => m.map(item => item.id === activeLearningModule.id ? { ...item, lessonsFinished: nextFinished, progress: nextProgress } : item));
          processPointGain(150, 50); 
          setLearningStep('result');
        }
      }, 1000);
    } else {
      setQuizFeedback('incorrect');
      setTimeout(() => {
        if (currentQuizIndex < dynamicMilestone.quizzes.length - 1) {
          setCurrentQuizIndex(prev => prev + 1);
          setQuizSelection(null);
          setQuizFeedback(null);
        } else setLearningStep('result');
      }, 1500);
    }
  };

  return (
    <div className={`h-screen w-screen bg-[#020617] text-slate-100 flex flex-col md:flex-row font-sans overflow-hidden transition-all duration-1000 ${focusMode ? 'grayscale-[0.6] brightness-[0.7] sepia-[0.1]' : ''}`}>
      <Sidebar onLaunch={(id) => openApp(id)} user={user} activeApp={activeApp} isHidden={isSidebarHidden} />
      <div className="flex-1 flex flex-col relative h-full transition-all duration-700">
        <main className="relative flex-1 z-10 p-2 md:p-6 h-[calc(100vh-56px)] overflow-hidden">
          <Desktop installedAppIds={installedAppIds} onIconClick={(id) => openApp(id)} />
          
          {(Object.values(windows) as WindowState[]).map(win => {
            const mod = modules.find(m => m.id === win.id);
            return win.isOpen && (
              <Window key={win.id} {...win} isActive={activeApp === win.id} onClose={() => closeApp(win.id)} onFocus={() => focusApp(win.id)} onMinimize={() => setWindows(p => ({...p, [win.id]: {...p[win.id], isMinimized: true}}))} onMaximize={() => setWindows(p => ({...p, [win.id]: {...p[win.id], isMaximized: !p[win.id].isMaximized}}))}>
                {mod ? (
                  <LearningEngineOverlay user={user} module={mod} milestone={dynamicMilestone} step={learningStep} currentQuizIndex={currentQuizIndex} currentScore={lessonScore} onClose={() => closeApp(win.id)} onNextStep={() => setLearningStep('quiz')} onQuizSelect={setQuizSelection} onCheckAnswer={handleCheckAnswer} onNextLesson={() => loadLessonContent(mod)} onResultClose={() => closeApp(mod.id)} selectedAnswer={quizSelection} feedback={quizFeedback} onForceLocalSync={handleForceLocalSync} isApiEnabled={isApiEnabled} loadingStatus={loadingStatus} />
                ) : (
                  <>
                    {win.id === 'dashboard' && <Dashboard user={user} modules={modules} inventory={inventory} onLaunchQuest={(id) => openApp(id)} onEnroll={(id) => setModules(m => m.map(item => item.id === id ? {...item, isEnrolled: true} : item))} onMinimize={() => setWindows(prev => ({...prev, dashboard: {...prev.dashboard, isMinimized: true}}))} isApiEnabled={isApiEnabled} yielded={win.isMinimized} />}
                    {win.id === 'profile' && <Profile user={user} modules={modules} achievements={achievements} inventory={inventory} onUpdateUser={(u) => setUser(p => ({ ...p, ...u }))} />}
                    {win.id === 'armory' && <Armory user={user} inventory={inventory} onBuy={(id) => { const item = inventory.find(i => i.id === id); if(item && user.credits >= item.cost) { setInventory(p => p.map(i => i.id === id ? { ...i, isOwned: true } : i)); setUser(u => ({ ...u, credits: u.credits - item.cost })); } }} onEquip={(id) => setInventory(p => p.map(i => i.id === id ? { ...i, isEquipped: !i.isEquipped } : i))} />}
                    {win.id === 'trophy-room' && <Achievements achievements={achievements} user={user} modules={modules} />}
                    {win.id === 'bounty-board' && <BountyBoard user={user} modules={modules} claimedIds={claimedBountyIds} onClaim={(xp, cr, bid) => { setClaimedBountyIds(p => [...p, bid]); processPointGain(xp, cr); }} isApiEnabled={isApiEnabled} />}
                    {win.id === 'control-panel' && <ControlPanel focusMode={focusMode} setFocusMode={setFocusMode} pulseSpeed={synapticPulse} setPulseSpeed={setSynapticPulse} isApiEnabled={isApiEnabled} setIsApiEnabled={setIsApiEnabled} />}
                    {win.id === 'neural-stream' && <NeuralStream isApiEnabled={isApiEnabled} setIsApiEnabled={setIsApiEnabled} pulseSpeed={synapticPulse} />}
                    {win.id === 'mindmap' && <MindMapper />}
                    {win.id === 'timer' && <FocusTimer />}
                    {win.id === 'calc' && <SmartCalc />}
                    {win.id === 'assistant' && <Assistant isApiEnabled={isApiEnabled} />}
                    {win.id === 'appmanager' && <AppManager installedAppIds={installedAppIds} onInstall={(id) => setInstalledAppIds(p => [...p, id])} onUninstall={(id) => setInstalledAppIds(p => p.filter(a => a !== id))} onOpen={(id) => openApp(id)} />}
                    {win.id === 'course-creator' && <CourseCreator onAddModule={(m) => setModules(p => [...p, m])} />}
                    {win.id === 'calendar' && <Calendar />}
                    {win.id === 'os-helper' && <OSHelper />}
                    {win.id === 'settings' && <Settings wallpaper="" setWallpaper={()=>{}} focusMode={focusMode} setFocusMode={setFocusMode} pulseSpeed={synapticPulse} setPulseSpeed={setSynapticPulse} />}
                    {win.id === 'journal' && <Emotions />}
                  </>
                )}
              </Window>
            );
          })}

          <div className="fixed bottom-20 right-8 z-[100000] flex flex-col gap-3 items-end pointer-events-none">
            {rewardToasts.map(toast => (
              <div key={toast.id} className={`flex items-center gap-4 px-8 py-4 rounded-2xl border backdrop-blur-xl animate-in slide-in-from-right-16 fade-in duration-500 ${toast.type === 'xp' ? 'bg-blue-600/20 border-blue-500/40 text-blue-400' : toast.type === 'credits' ? 'bg-amber-600/20 border-amber-500/40 text-amber-400' : 'bg-red-600/20 border-red-500/40 text-red-400'}`}>
                <i className={`fas ${toast.type === 'xp' ? 'fa-dna' : toast.type === 'credits' ? 'fa-coins' : 'fa-triangle-exclamation'} text-lg`}></i>
                <span className="font-orbitron font-black text-base">{toast.amount} {toast.type.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </main>
        <Taskbar isApiEnabled={isApiEnabled} windows={(Object.values(windows) as WindowState[]).filter(w => w.isOpen)} activeApp={activeApp} onAppClick={(id) => openApp(id, undefined, undefined, true)} onCloseApp={closeApp} onMinimizeApp={(id) => setWindows(p => ({...p, [id]: {...p[id], isMinimized: true}}))} onStartClick={() => setIsStartOpen(!isStartOpen)} onControlClick={() => openApp('control-panel')} onCalendarClick={() => openApp('calendar')} />
      </div>

      {isStartOpen && (
        <StartMenu 
          installedAppIds={installedAppIds} 
          onClose={() => setIsStartOpen(false)} 
          onLaunch={(id) => openApp(id)} 
        />
      )}
      
      <GlobalSearch 
        isOpen={false} 
        onClose={() => {}} 
        onLaunch={(id) => openApp(id)} 
      />
    </div>
  );
};

const LearningEngineOverlay: React.FC<any> = ({ user, module, milestone, step, currentQuizIndex, currentScore, onClose, onNextStep, onQuizSelect, onCheckAnswer, onNextLesson, onResultClose, selectedAnswer, feedback, onForceLocalSync, isApiEnabled, loadingStatus }) => {
  if (step === 'loading') return (
    <div className="h-full w-full flex flex-col items-center justify-center p-4 md:p-8 bg-[#020617] text-center select-none animate-in fade-in duration-1000 relative overflow-hidden">
      <div className="absolute inset-0 os-grid opacity-[0.08] pointer-events-none"></div>
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[120px] opacity-10 transition-all duration-1000 ${loadingStatus === 'DESYNC' ? 'bg-amber-600' : 'bg-blue-600'}`}></div>

      <div className="relative mb-6 md:mb-10 scale-75 md:scale-90 transition-transform duration-1000">
        <div className="w-16 h-16 md:w-24 md:h-24 rounded-full border border-white/5 flex items-center justify-center relative">
          <div className={`absolute inset-0 rounded-full transition-all duration-1000 ${loadingStatus === 'DESYNC' ? 'bg-amber-500/10 animate-pulse' : 'bg-blue-500/15 animate-pulse'}`}></div>
          <i className={`fas fa-brain text-3xl md:text-4xl relative z-10 transition-all duration-700 drop-shadow-[0_0_20px_rgba(59,130,246,0.8)] ${loadingStatus === 'DESYNC' ? 'text-amber-500' : 'text-blue-500'}`}></i>
          <div className="absolute inset-[-10px] md:inset-[-12px] rounded-full border-t-2 border-l-2 border-blue-500/80 animate-[spin_2.5s_linear_infinite]"></div>
          <div className="absolute inset-[-20px] md:inset-[-24px] rounded-full border-b-2 border-r-2 border-blue-500/20 animate-[spin_6s_linear_reverse_infinite]"></div>
        </div>
      </div>
      
      <div className="space-y-3 mb-6 md:mb-10 relative z-10">
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-black text-white font-orbitron tracking-[0.3em] uppercase leading-none drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]">Synthesis Protocol</h2>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-4">
             <div className={`w-1.5 h-1.5 rounded-full ${loadingStatus === 'DESYNC' ? 'bg-amber-500 animate-ping' : 'bg-blue-400 animate-pulse'}`}></div>
             <p className={`text-[8px] md:text-[9px] font-black font-mono tracking-[0.4em] uppercase transition-colors ${loadingStatus === 'DESYNC' ? 'text-amber-500' : 'text-blue-400'}`}>
                {loadingStatus === 'SYNCHRONIZING' ? 'Assembling Neural Layers' : loadingStatus === 'DESYNC' ? 'Link Failure: Re-Routing required' : 'Extracting Static Assets'}
             </p>
          </div>
          <div className="w-32 md:w-48 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent mt-2"></div>
        </div>
      </div>
      
      <div className="w-full max-w-lg space-y-6 relative z-10 px-6">
        <div className="w-full h-[2px] bg-white/5 rounded-full overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent animate-[shimmer_2.5s_infinite]"></div>
          <div className={`h-full transition-all duration-1000 ${loadingStatus === 'DESYNC' ? 'bg-amber-600 w-1/4' : 'bg-blue-600 w-full'} shadow-[0_0_15px_rgba(59,130,246,0.6)]`}></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] font-mono px-4">
          <div className="flex flex-col items-center md:items-start gap-1">
            <span className="opacity-40">Integration:</span>
            <span className={loadingStatus === 'DESYNC' ? 'text-amber-500' : 'text-emerald-400'}>{loadingStatus === 'DESYNC' ? 'HOLDING' : '100% SYNC'}</span>
          </div>
          <div className="flex flex-col items-center gap-1 hidden md:flex">
             <span className="opacity-40">Frequency:</span>
             <span className="text-white">942.8 MHz</span>
          </div>
          <div className="flex flex-col items-center md:items-end gap-1">
            <span className="opacity-40">Link:</span>
            <span className={loadingStatus === 'DESYNC' ? 'text-red-500 animate-pulse' : (isApiEnabled ? "text-blue-400" : "text-amber-500")}>
              {loadingStatus === 'DESYNC' ? 'DESYNC' : (isApiEnabled ? "LIVE" : "ARCHIVE")}
            </span>
          </div>
        </div>
      </div>
      
      <div className="mt-8 md:mt-12 w-full max-w-sm relative z-10 px-4">
        <button onClick={onForceLocalSync} className={`w-full py-4 bg-[#0a0f1e]/90 hover:bg-[#111827] border text-[9px] font-black uppercase tracking-[0.3em] rounded-xl transition-all active:scale-[0.98] shadow-2xl backdrop-blur-xl group font-orbitron ${loadingStatus === 'DESYNC' ? 'border-amber-500/40 text-amber-500 ring-1 ring-amber-500/10' : 'border-white/10 text-blue-400/80 hover:text-white'}`}>
          <span className="group-hover:tracking-[0.4em] transition-all duration-500">Interrupt & Force Sync</span>
        </button>
      </div>
    </div>
  );
  
  if (step === 'lesson') return (
    <div className="h-full flex flex-col bg-[#020617]/80 overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-1000 relative">
      <div className="absolute inset-0 os-grid opacity-[0.03] pointer-events-none"></div>
      
      {/* Primary scroll container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth">
        {/* Alignment wrapper refined for tablet/desktop */}
        <div className="min-h-full flex flex-col justify-start pt-6 md:pt-12 lg:pt-16 pb-12">
          <div className="max-w-4xl mx-auto w-full p-6 md:p-10 lg:p-14 space-y-6 md:space-y-8">
            <header className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="px-4 py-1 bg-blue-600/10 text-blue-400 border border-blue-500/20 rounded-full text-[8px] md:text-[9px] font-black uppercase font-orbitron tracking-[0.2em]">Layer {module.lessonsFinished + 1} / 12</span>
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,1)]"></div>
              </div>
              <div className="space-y-2">
                 <h1 className="text-xl md:text-2xl lg:text-3xl font-black text-white font-orbitron uppercase tracking-tighter leading-tight drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">{milestone?.title}</h1>
                 <div className="w-full h-px bg-gradient-to-r from-blue-500 via-white/5 to-transparent"></div>
              </div>
            </header>

            <div className="relative z-10 w-full space-y-6">
              <div className="bg-slate-900/60 backdrop-blur-xl p-6 md:p-10 rounded-[2rem] border border-white/5 text-slate-300 text-sm md:text-base leading-[1.8] whitespace-pre-wrap font-medium shadow-2xl relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-4 opacity-5 text-4xl md:text-8xl transition-transform duration-[3s] group-hover:scale-110">
                    <i className="fas fa-microchip"></i>
                 </div>
                 <div className="relative z-10">
                   <div className="text-blue-400/30 text-[8px] md:text-[9px] font-black uppercase tracking-[0.3em] mb-5 font-mono border-b border-white/5 pb-4 flex items-center gap-2">
                      <i className="fas fa-terminal"></i>
                      Decrypted Synaptic Content
                   </div>
                   {milestone?.content}
                 </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pb-6">
                 <div className="bg-blue-600/5 border border-blue-500/10 p-5 rounded-[2rem] flex items-center gap-5 group hover:border-blue-500/30 transition-all">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 text-base shadow-lg group-hover:scale-110 transition-transform">
                       <i className="fas fa-dna"></i>
                    </div>
                    <div>
                       <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest font-orbitron">Source</p>
                       <p className="text-[10px] text-slate-400 font-medium leading-relaxed">Gemini-3 Neural Layer</p>
                    </div>
                 </div>
                 <div className="bg-white/5 border border-white/10 p-5 rounded-[2rem] flex items-center gap-5">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-500 text-base">
                       <i className="fas fa-shield-halved"></i>
                    </div>
                    <div>
                       <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest font-orbitron">Integrity</p>
                       <p className="text-[10px] text-slate-400 font-medium leading-relaxed">Logical Verification: Pass</p>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Footer - Refined Height */}
      <div className="h-16 md:h-18 lg:h-20 bg-slate-900/98 backdrop-blur-3xl border-t border-white/10 flex items-center justify-end px-6 md:px-12 gap-4 z-[100] shadow-[0_-15px_40px_rgba(0,0,0,0.8)] shrink-0">
        <button onClick={onClose} className="px-6 md:px-8 py-2 md:py-3 bg-white/5 text-slate-500 rounded-xl text-[8px] md:text-[9px] uppercase font-black tracking-widest hover:bg-white/10 hover:text-white transition-all">Abort Link</button>
        <button onClick={onNextStep} className="px-10 md:px-14 py-3 md:py-4 bg-blue-600 text-white rounded-xl text-[10px] uppercase font-black tracking-[0.2em] shadow-xl font-orbitron hover:bg-blue-500 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3">
           <span>Initiate Mastery</span>
           <i className="fas fa-chevron-right text-[9px] opacity-40"></i>
        </button>
      </div>
    </div>
  );

  if (step === 'quiz') {
    const q = milestone?.quizzes?.[currentQuizIndex];
    if (!q) return null;
    return (
      <div className="h-full flex flex-col bg-[#020617]/95 overflow-y-auto custom-scrollbar animate-in fade-in duration-700 relative">
        <div className="absolute inset-0 os-grid opacity-[0.03] pointer-events-none"></div>
        
        {/* Alignment wrapper refined for tablet/desktop */}
        <div className="min-h-full flex flex-col items-center justify-start pt-8 md:pt-16 lg:pt-24 p-4 md:p-10 space-y-6 md:space-y-10">
          <header className="text-center px-4 max-w-4xl relative z-10">
            <div className="flex flex-col items-center gap-2 mb-4 md:mb-6">
               <p className="text-[8px] md:text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] font-orbitron flex items-center gap-2">
                  <i className="fas fa-crosshairs text-[7px] animate-pulse"></i>
                  Verification Gate {currentQuizIndex + 1}/5
               </p>
               <div className="flex gap-1.5">
                  {[0, 1, 2, 3, 4].map(idx => (
                     <div key={idx} className={`w-3 md:w-6 h-1 rounded-full transition-all duration-700 ${idx === currentQuizIndex ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,1)]' : idx < currentQuizIndex ? 'bg-emerald-500/40' : 'bg-white/10'}`}></div>
                  ))}
               </div>
            </div>
            <h2 className="text-sm md:text-xl lg:text-2xl font-black text-white font-orbitron uppercase leading-snug text-center tracking-tight drop-shadow-2xl max-w-2xl mx-auto px-2">
               {q.question}
            </h2>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 w-full max-w-3xl px-4 relative z-10">
            {q.options.map((opt: any) => (
              <button key={opt.letter} onClick={() => !feedback && onQuizSelect(opt.letter)} className={`group/opt p-4 md:p-5 rounded-xl md:rounded-[1.5rem] border transition-all duration-500 text-left flex items-center gap-4 relative overflow-hidden ${selectedAnswer === opt.letter ? 'bg-blue-600/20 border-blue-500 text-white shadow-lg ring-1 ring-blue-500/50' : 'bg-slate-900/60 border-white/5 text-slate-400 hover:border-white/20 hover:bg-slate-900/80'}`}>
                <div className={`w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-xl flex items-center justify-center font-black font-orbitron text-xs md:text-sm shrink-0 transition-all duration-700 ${selectedAnswer === opt.letter ? 'bg-blue-600 text-white shadow-xl' : 'bg-white/5 text-slate-600 group-hover/opt:text-blue-400'}`}>
                  {opt.letter}
                </div>
                <span className={`font-bold text-[11px] md:text-sm leading-snug transition-colors duration-500 ${selectedAnswer === opt.letter ? 'text-white' : 'group-hover/opt:text-slate-200'}`}>{opt.text}</span>
                
                {selectedAnswer === opt.letter && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-500/10 text-3xl md:text-5xl animate-in fade-in zoom-in-50">
                    <i className={feedback === 'correct' ? 'fas fa-check-circle' : feedback === 'incorrect' ? 'fas fa-times-circle' : 'fas fa-bullseye'}></i>
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="w-full flex flex-col items-center gap-3 relative z-10 pb-12">
            <button onClick={onCheckAnswer} disabled={!selectedAnswer || !!feedback} className={`w-full max-w-[180px] md:max-w-[240px] px-8 py-4 text-[9px] md:text-[10px] font-black uppercase tracking-[0.25em] font-orbitron rounded-xl transition-all active:scale-95 disabled:opacity-20 shadow-xl ${feedback === 'correct' ? 'bg-emerald-600 text-white' : feedback === 'incorrect' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/20'}`}>
              {feedback === 'correct' ? 'SYNCHRONIZED' : feedback === 'incorrect' ? 'CONFLICT' : 'VERIFY LINK'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'result') {
    const isSuccess = currentScore >= 4;
    return (
      <div className="h-full flex items-center justify-center p-6 bg-[#020617]/98 backdrop-blur-3xl overflow-y-auto custom-scrollbar relative">
        <div className="absolute inset-0 os-grid opacity-[0.05] pointer-events-none"></div>
        <div className={`bg-[#0f172a]/95 p-10 md:p-14 rounded-[2.5rem] md:rounded-[4rem] border border-white/10 text-center space-y-8 md:space-y-10 max-w-md w-full shadow-[0_0_100px_rgba(0,0,0,1)] relative overflow-hidden my-6 animate-in zoom-in-95 duration-500`}>
          
          <div className="relative group transition-transform duration-1000">
            <div className={`w-20 h-20 md:w-24 md:h-24 rounded-[1.5rem] md:rounded-[2rem] mx-auto flex items-center justify-center text-3xl md:text-4xl text-white relative transition-all duration-1000 shadow-[0_0_40px_rgba(0,0,0,0.5)] ${isSuccess ? 'bg-gradient-to-tr from-emerald-500 to-blue-600 shadow-[0_0_30px_rgba(16,185,129,0.5)]' : 'bg-red-600 shadow-red-500/30'}`}>
              <i className={`fas ${isSuccess ? 'fa-certificate' : 'fa-skull-crossbones'}`}></i>
              {isSuccess && <div className="absolute inset-0 rounded-inherit border-2 border-white/40 animate-ping"></div>}
            </div>
          </div>

          <div className="space-y-2 relative z-10">
            <h1 className="text-2xl md:text-4xl font-black text-white font-orbitron uppercase tracking-tighter leading-none">{isSuccess ? 'Mastery Locked' : 'Terminal Reject'}</h1>
            <p className="text-[9px] md:text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] font-mono">{isSuccess ? 'Neural alignment achieved' : 'Link failure • Recalibrate'}</p>
          </div>

          <div className="flex flex-col gap-4 relative z-10">
            <button onClick={onNextLesson} className="w-full py-5 md:py-6 bg-blue-600 text-white rounded-2xl font-black text-[10px] md:text-[12px] uppercase tracking-[0.2em] font-orbitron shadow-xl transition-all hover:scale-[1.02] active:scale-95 hover:bg-blue-500">
              {isSuccess ? 'Continue Link' : 'Retry Node'}
            </button>
            <button onClick={onResultClose} className="text-[9px] font-black text-slate-600 hover:text-white uppercase tracking-[0.4em] transition-colors font-orbitron py-2">DISCONNECT</button>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default App;
import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  TrendingUp, 
  AlertCircle, 
  PlusCircle, 
  Search,
  ArrowRight,
  TrendingDown,
  Calendar,
  Layers,
  ChevronRight,
  LogOut,
  Database,
  BarChart3,
  ExternalLink,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  doc, 
  setDoc, 
  orderBy, 
  serverTimestamp,
  writeBatch,
  getDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './lib/firebase';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar
} from 'recharts';

// --- Types ---

interface Metric {
  id: string;
  name: string;
  target: number;
  unit: 'percentage' | 'number' | 'currency';
  group?: string;
}

interface WeeklyData {
  weekId: string;
  metrics: { [metricId: string]: number };
}

interface Client {
  id: string;
  name: string;
  owner: string;
  status: 'active' | 'paused' | 'archived';
  metrics: Metric[];
  weeklyPerformance: WeeklyData[];
}

interface UserProfile {
  email: string;
  role: 'admin' | 'viewer';
}

// --- Constants ---

const DEFAULT_METRICS: Metric[] = [
  { id: 'accept-rate', name: 'Accept Rate', target: 80, unit: 'percentage', group: 'Sales' },
  { id: 'posts-total', name: 'Total Posts', target: 50, unit: 'number', group: 'Ops' },
  { id: 'pending-approvals', name: 'Pending Approvals', target: 5, unit: 'number', group: 'Ops' },
];

const WEEKS = ['2026-W12', '2026-W13', '2026-W14', '2026-W15', '2026-W16'];

// --- Helper Components ---

const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white border border-gray-100 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, variant = "default" }: { children: React.ReactNode, variant?: "default" | "accent" | "outline" }) => {
  const styles = variant === "outline" 
    ? "border border-gray-200 text-gray-500" 
    : variant === "accent"
    ? "bg-accent text-accent-foreground shadow-sm"
    : "bg-black text-white";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles}`}>
      {children}
    </span>
  );
};

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'meetings' | 'settings'>('dashboard');
  const [meetingIndex, setMeetingIndex] = useState(0);

  // Auth Effect
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          setUserProfile(userDoc.data() as UserProfile);
        } else if (u.email === 'sanyam@myntmore.com') {
          // Auto-bootstrap admin
          const profile: UserProfile = { email: u.email, role: 'admin' };
          await setDoc(userRef, profile);
          setUserProfile(profile);
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthReady(true);
    });
  }, []);

  // Data Fetching Effect
  useEffect(() => {
    if (!user) {
      setClients([]);
      setIsLoading(false);
      return;
    }

    const performanceUnsubscribes: { [clientId: string]: () => void } = {};

    const q = query(collection(db, 'clients'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setIsLoading(false);
      const clientsData: Client[] = snapshot.docs.map((clientDoc) => {
        const data = clientDoc.data() as any;
        return {
          ...data,
          id: clientDoc.id,
          weeklyPerformance: [] 
        };
      });

      setClients(prev => {
        return clientsData.map(newClient => {
          const existing = prev.find(p => p.id === newClient.id);
          return existing ? { ...newClient, weeklyPerformance: existing.weeklyPerformance } : newClient;
        });
      });

      // Manage performance listeners
      clientsData.forEach(client => {
        if (!performanceUnsubscribes[client.id]) {
          const perfQ = query(collection(db, `clients/${client.id}/performance`), orderBy('weekId', 'asc'));
          performanceUnsubscribes[client.id] = onSnapshot(perfQ, (perfSnapshot) => {
            const performance: WeeklyData[] = perfSnapshot.docs.map(d => d.data() as WeeklyData);
            setClients(prev => prev.map(c => c.id === client.id ? { ...c, weeklyPerformance: performance } : c));
          }, (error) => handleFirestoreError(error, OperationType.LIST, `clients/${client.id}/performance`));
        }
      });

      // Cleanup listeners for removed clients
      Object.keys(performanceUnsubscribes).forEach(clientId => {
        if (!clientsData.find(c => c.id === clientId)) {
          performanceUnsubscribes[clientId]();
          delete performanceUnsubscribes[clientId];
        }
      });

    }, (error) => {
      setIsLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'clients');
    });

    return () => {
      unsubscribe();
      Object.values(performanceUnsubscribes).forEach(unsub => unsub());
    };
  }, [user]);

  // --- Actions ---

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      toast.error('Login failed');
    }
  };

  const handleLogout = () => signOut(auth);

  const seedData = async () => {
    if (!userProfile || userProfile.role !== 'admin') {
      toast.error('Admin access required');
      return;
    }

    const mockClients = [
      { name: 'SKC — Divya', owner: 'Aditya Gupta', status: 'active' as const },
      { name: 'Mindful — Rohan', owner: 'Sanyam', status: 'active' as const },
      { name: 'Zenith Labs', owner: 'Priya', status: 'active' as const },
    ];

    const loadId = toast.loading('Seeding OS records...');

    try {
      for (const client of mockClients) {
        const clientRef = await addDoc(collection(db, 'clients'), {
          ...client,
          metrics: DEFAULT_METRICS,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        const batch = writeBatch(db);
        WEEKS.forEach((weekId, idx) => {
          const weekRef = doc(db, `clients/${clientRef.id}/performance`, weekId);
          batch.set(weekRef, {
            weekId,
            metrics: {
              'accept-rate': 65 + Math.random() * 25,
              'posts-total': 30 + Math.random() * 30,
              'pending-approvals': Math.floor(Math.random() * 10)
            },
            timestamp: serverTimestamp()
          });
        });
        await batch.commit();
      }
      toast.success('System seeded successfully', { id: loadId });
    } catch (error) {
      console.error(error);
      toast.error('Seeding failed', { id: loadId });
    }
  };

  // --- Helpers ---

  const getStatus = (actual: number, target: number) => {
    const ratio = actual / target;
    if (ratio >= 0.9) return 'on-track';
    if (ratio >= 0.7) return 'at-risk';
    return 'off-track';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on-track': return 'status-on-track';
      case 'at-risk': return 'status-at-risk';
      case 'off-track': return 'status-off-track';
      default: return 'bg-gray-300';
    }
  };

  // --- Render Sections ---

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 border-4 border-black/5 border-t-accent rounded-full animate-spin" />
          <p className="text-[10px] font-mono text-black/40 uppercase tracking-[0.3em]">Booting Myntmore OS</p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-sm space-y-8 text-center">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-black tracking-tight">MYNTMORE OS</h1>
            <p className="text-black/40 text-xs font-mono uppercase tracking-widest">Internal Agency Operations</p>
          </div>
          
          <Card className="bg-white border-gray-100 p-8 shadow-xl">
            <button 
              onClick={handleLogin}
              className="w-full bg-accent text-accent-foreground font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:opacity-90 transition-all shadow-lg shadow-accent/20"
            >
              <ShieldCheck className="w-5 h-5" />
              Secure Login
            </button>
            <p className="mt-6 text-[10px] text-black/30 font-mono leading-relaxed">
              AUTHORISED PERSONNEL ONLY. ACCESS LOGS ARE PERMANENTLY RECORDED.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-100 flex flex-col bg-white sticky top-0 h-screen">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-3 h-3 bg-black rounded-full" />
            <span className="font-bold tracking-tight">MYNTMORE OS</span>
          </div>
          <span className="text-[9px] text-gray-400 font-mono uppercase tracking-[0.2em] block pl-6">v1.2.0-STABLE</span>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'clients', label: 'Clients', icon: Users },
            { id: 'meetings', label: 'Monday Meeting', icon: Calendar },
            { id: 'settings', label: 'System Settings', icon: Settings },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === item.id 
                  ? 'bg-accent text-accent-foreground shadow-lg shadow-accent/20' 
                  : 'text-gray-500 hover:bg-gray-50 hover:text-black'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-6 border-t border-gray-50 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <span className="text-xs font-bold">{user?.email?.[0].toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{user?.displayName || 'User'}</p>
              <p className="text-[10px] text-gray-400 uppercase font-mono">{userProfile?.role || 'Guest'}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-xs text-red-500 font-medium px-4 py-2 hover:bg-red-50/50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden">
        {/* Header */}
        <header className="h-20 border-b border-gray-100 bg-white/80 backdrop-blur-md flex items-center justify-between px-10 sticky top-0 z-10">
          <div className="flex items-center gap-6">
            <h2 className="text-lg font-semibold capitalize">{activeTab}</h2>
            <div className="h-4 w-px bg-gray-200" />
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="font-mono">{isLoading ? 'Syncing...' : 'Real-time'}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search global records..."
                className="pl-10 pr-4 py-2 bg-gray-50 border-transparent focus:bg-white focus:border-gray-200 rounded-xl text-xs w-64 outline-none transition-all"
              />
            </div>
            {userProfile?.role === 'admin' && (
              <button 
                onClick={seedData}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-xl text-xs font-bold shadow-sm hover:opacity-90 transition-all"
              >
                <Database className="w-4 h-4" />
                Seed Mock Data
              </button>
            )}
          </div>
        </header>

        <div className="p-10 max-w-7xl mx-auto">
          {activeTab === 'dashboard' && (
            <div className="space-y-10">
              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="p-6 bg-accent border-none shadow-lg shadow-accent/10">
                  <p className="text-[10px] font-mono text-black/50 uppercase tracking-widest mb-1">Total Network Clients</p>
                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-black text-black">{clients.length}</span>
                    <span className="text-black/40 text-xs font-bold mb-1.5">+2</span>
                  </div>
                </Card>
                <Card className="p-6">
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">On Track Status</p>
                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-bold">
                      {clients.filter(c => {
                        const last = c.weeklyPerformance[c.weeklyPerformance.length - 1];
                        return c.metrics.every(m => getStatus(last?.metrics[m.id] || 0, m.target) === 'on-track');
                      }).length}
                    </span>
                    <span className="text-gray-300 text-xs font-mono mb-1.5">/ {clients.length}</span>
                  </div>
                </Card>
                <Card className="p-6">
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">At Risk Accounts</p>
                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-bold text-yellow-500">
                      {clients.filter(c => {
                        const last = c.weeklyPerformance[c.weeklyPerformance.length - 1];
                        return c.metrics.some(m => getStatus(last?.metrics[m.id] || 0, m.target) === 'at-risk');
                      }).length}
                    </span>
                  </div>
                </Card>
                <Card className="p-6 border-red-100">
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">Attention Required</p>
                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-bold text-red-500">
                      {clients.filter(c => {
                        const last = c.weeklyPerformance[c.weeklyPerformance.length - 1];
                        return c.metrics.some(m => getStatus(last?.metrics[m.id] || 0, m.target) === 'off-track');
                      }).length}
                    </span>
                  </div>
                </Card>
              </div>

              {/* Performance Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 p-8">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="font-bold tracking-tight">Average Portfolio Performance</h3>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-black rounded-full" />
                        <span>Performance Rate</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    {clients.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={WEEKS.map(week => {
                          const achievements = clients.map(c => {
                            const data = c.weeklyPerformance.find(w => w.weekId === week);
                            if (!data) return 0;
                            return c.metrics.reduce((acc, m) => acc + (m.target > 0 ? (data.metrics[m.id] || 0) / m.target : 0), 0) / c.metrics.length;
                          });
                          return {
                            name: week,
                            achievement: (achievements.reduce((a, b) => a + b, 0) / clients.length) * 100
                          };
                        })}>
                          <defs>
                            <linearGradient id="colorAchieve" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#000000" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#000000" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#999' }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#999' }} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                            labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                          />
                          <Area type="monotone" dataKey="achievement" stroke="#FFC947" strokeWidth={3} fillOpacity={1} fill="url(#colorAchieve)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-gray-300 text-sm font-mono tracking-widest uppercase italic">
                        No Data Loaded
                      </div>
                    )}
                  </div>
                </Card>

                <div className="space-y-6">
                  <h3 className="font-bold tracking-tight">Active Client Watchlist</h3>
                  <div className="space-y-3">
                    {clients.length === 0 ? (
                      <div className="text-center py-10 text-gray-300 text-xs font-mono uppercase tracking-widest bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                        Initial seeding required
                      </div>
                    ) : (
                      clients.map(client => {
                        const lastWeek = client.weeklyPerformance[client.weeklyPerformance.length - 1];
                        const avg = client.metrics.reduce((acc, m) => acc + (m.target > 0 ? (lastWeek?.metrics[m.id] || 0) / m.target : 0), 0) / client.metrics.length;
                        return (
                          <Card key={client.id} className="p-4 hover:border-accent transition-colors cursor-pointer group">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(getStatus(avg, 1))}`} />
                                <span className="text-sm font-semibold group-hover:text-black transition-colors">{client.name}</span>
                              </div>
                              <span className="text-xs font-mono text-gray-400">{(avg * 100).toFixed(0)}%</span>
                            </div>
                            <div className="mt-2 w-full bg-gray-100 h-1 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(avg * 100, 100)}%` }}
                                className={`h-full ${avg >= 0.9 ? 'bg-accent' : avg >= 0.7 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              />
                            </div>
                          </Card>
                        );
                      })
                    )}
                  </div>
                  
                  <Card className="p-6 bg-gray-50 border-none">
                    <div className="flex items-center gap-2 text-gray-900 mb-3">
                      <AlertCircle className="w-4 h-4" />
                      <p className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold">AI Insight Engine</p>
                    </div>
                    <p className="text-xs leading-relaxed text-gray-500">
                      Based on last 4 weeks, <span className="font-bold text-black">Mindful — Rohan</span> is projected to hit 'On Track' status by W18 if Accept Rate continues its 5% WoW growth.
                    </p>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'clients' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clients.map(client => (
                <Card key={client.id} className="overflow-hidden group">
                  <div className="p-6 border-b border-gray-50">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg mb-1">{client.name}</h3>
                        <p className="text-xs text-gray-400 font-medium">Owner: {client.owner}</p>
                      </div>
                      <Badge variant="accent">{client.status}</Badge>
                    </div>
                    
                    <div className="space-y-4">
                      {client.metrics.map(m => {
                        const actual = client.weeklyPerformance[client.weeklyPerformance.length - 1]?.metrics[m.id] || 0;
                        const status = getStatus(actual, m.target);
                        return (
                          <div key={m.id} className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">{m.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-[10px] opacity-30">T: {m.target}{m.unit === 'percentage' ? '%' : ''}</span>
                              <span className={`font-bold ${status === 'off-track' ? 'text-red-500' : ''}`}>
                                {actual}{m.unit === 'percentage' ? '%' : ''}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="px-6 py-3 bg-gray-50 flex justify-between items-center opacity-70 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] font-mono text-gray-400 uppercase">Last Sync: 2m ago</span>
                    <button className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all">
                      Full Scope <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </Card>
              ))}
              
              <button 
                className="h-full min-h-[250px] border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center gap-4 text-gray-300 hover:text-black hover:border-gray-300 transition-all group"
              >
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-current flex items-center justify-center group-hover:scale-110 transition-transform">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold">Deploy New Scope</span>
              </button>
            </div>
          )}

          {activeTab === 'meetings' && (
            <div className="max-w-4xl mx-auto space-y-10">
              <div className="flex flex-col items-center text-center space-y-4 mb-16">
                <div className="px-4 py-1.5 bg-accent text-accent-foreground font-bold rounded-full text-[10px] font-mono tracking-widest uppercase">Meeting Mode Active</div>
                <h2 className="text-4xl font-bold tracking-tight">Portfolio Pulse: Monday Sync</h2>
                <p className="text-gray-400 text-sm max-w-lg">
                  Project performance review across all active accounts. Real-time targets based on current sprint velocities.
                </p>
              </div>

              {clients.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
                    {clients.map((c, i) => (
                      <button 
                        key={c.id} 
                        onClick={() => setMeetingIndex(i)}
                        className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                          meetingIndex === i ? 'bg-accent text-accent-foreground shadow-lg shadow-accent/20' : 'bg-white border border-gray-100 text-gray-400'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={clients[meetingIndex].id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                    >
                      <Card className="p-10 border-2 border-accent min-h-[500px] flex flex-col">
                        <div className="flex justify-between items-start mb-12">
                          <div>
                            <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">Focus Account</p>
                            <h2 className="text-3xl font-bold">{clients[meetingIndex].name}</h2>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">Manager</p>
                            <p className="text-lg font-bold">{clients[meetingIndex].owner}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 flex-1">
                          {clients[meetingIndex].metrics.map(m => {
                            const actual = clients[meetingIndex].weeklyPerformance[clients[meetingIndex].weeklyPerformance.length - 1]?.metrics[m.id] || 0;
                            const status = getStatus(actual, m.target);
                            return (
                              <div key={m.id} className="space-y-4">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
                                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">{m.name}</span>
                                </div>
                                <div className="space-y-1">
                                  <div className="text-5xl font-bold tracking-tighter">
                                    {actual}{m.unit === 'percentage' ? '%' : ''}
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] font-mono">
                                    <span className="text-gray-400 uppercase">Target:</span>
                                    <span className="font-bold">{m.target}{m.unit === 'percentage' ? '%' : ''}</span>
                                    <span className={`ml-1 font-bold ${actual >= m.target ? 'text-green-500' : 'text-red-500'}`}>
                                      ({((actual/m.target)*100).toFixed(0)}%)
                                    </span>
                                  </div>
                                </div>
                                <div className="h-32 w-full pt-4">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={clients[meetingIndex].weeklyPerformance}>
                                      <Bar 
                                        dataKey={`metrics.${m.id}`} 
                                        fill={status === 'off-track' ? '#EF4444' : '#FFC947'} 
                                        radius={[4, 4, 0, 0]} 
                                      />
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    </motion.div>
                  </AnimatePresence>
                </div>
              ) : (
                <div className="py-20 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mx-auto text-gray-300">
                    <Layers className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-mono uppercase tracking-widest text-gray-400">Initialize OS Data to begin pulse sync</p>
                  <button onClick={seedData} className="px-6 py-2 bg-accent text-accent-foreground rounded-xl text-xs font-bold shadow-sm">Seed System now</button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-10">
              <div className="space-y-4">
                <h3 className="font-bold text-xl tracking-tight">System Configuration</h3>
                <Card className="divide-y divide-gray-50">
                  <div className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Real-time DB Sync</p>
                      <p className="text-xs text-gray-400">Cloud Firestore enterprise-grade latency</p>
                    </div>
                    <Badge>Enabled</Badge>
                  </div>
                  <div className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Audit Logs</p>
                      <p className="text-xs text-gray-400">Every write operation is logged with Auth ID</p>
                    </div>
                    <Badge>Active</Badge>
                  </div>
                  <div className="p-6 flex items-center justify-between opacity-50 pointer-events-none">
                    <div>
                      <p className="text-sm font-semibold">Self-Destruct OS</p>
                      <p className="text-xs text-gray-400">Wipe all agency records instantly</p>
                    </div>
                    <button className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Locked</button>
                  </div>
                </Card>
              </div>

              <div className="space-y-4 pt-10">
                <h3 className="font-bold text-xl tracking-tight text-red-500">Danger Zone</h3>
                <Card className="border-red-100 bg-red-50/20 p-8 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-bold">Reset Environment</p>
                    <p className="text-xs text-gray-500">Deletes all client records permanently.</p>
                  </div>
                  <button className="px-6 py-2 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition-colors">
                    Nuke Database
                  </button>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

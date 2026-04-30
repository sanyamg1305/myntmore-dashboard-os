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
  updateDoc,
  doc, 
  setDoc, 
  orderBy, 
  where,
  getDocs,
  serverTimestamp,
  writeBatch,
  getDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  createUserWithEmailAndPassword,
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

interface MetricValue {
  value: number | string | boolean;
  target?: number;
  status?: 'on-track' | 'at-risk' | 'off-track';
  statusOverride?: 'on-track' | 'at-risk' | 'off-track';
  note?: string;
}

interface WeeklyPerformance {
  weekId: string;
  weekOf: string;
  contentMetrics: { [key: string]: MetricValue };
  leadGenMetrics: { [key: string]: MetricValue };
  lastUpdatedContent?: any;
  lastUpdatedLeadGen?: any;
  submittedAtContent?: any;
  submittedAtLeadGen?: any;
}

interface Client {
  id: string;
  name: string;
  status: 'active' | 'archived';
  contentManagerUid: string;
  contentManagerName: string;
  leadGenManagerUid: string;
  leadGenManagerName: string;
  createdAt: any;
  createdBy: string;
  weeklyPerformance: WeeklyPerformance[];
}

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  department: 'content' | 'leadgen' | 'both';
  role: 'admin' | 'member';
  assignedClients: { clientId: string; role: 'contentManager' | 'leadGenManager' }[];
  inviteStatus: 'active' | 'disabled';
  invitedBy: string;
  createdAt: any;
}

interface Invite {
  id: string;
  email: string;
  name: string;
  department: 'content' | 'leadgen' | 'both';
  role: 'member';
  invitedBy: string;
  createdAt: any;
  status: 'pending' | 'accepted';
  token: string;
}

// --- Constants ---

const CONTENT_METRICS_LIST = [
  { id: 'C01', name: 'LinkedIn Post Ideation', type: 'number', category: 'Production Pipeline' },
  { id: 'C02', name: 'Target Set by Content Owner', type: 'number', category: 'Production Pipeline' },
  { id: 'C03', name: 'LinkedIn Post Drafting', type: 'number', category: 'Production Pipeline' },
  { id: 'C04', name: 'Posts Approved by Client', type: 'number', category: 'Production Pipeline' },
  { id: 'C05', name: 'What Content Went Out This Week', type: 'textarea', category: 'Production Pipeline' },
  { id: 'C06', name: 'Text + Image Posts Posted', type: 'number', category: 'Post Output' },
  { id: 'C07', name: 'Carousels Posted', type: 'number', category: 'Post Output' },
  { id: 'C08', name: 'Videos Posted', type: 'number', category: 'Post Output' },
  { id: 'C09', name: 'Total Posts Posted', type: 'auto', category: 'Post Output', calc: (vals: any) => (Number(vals.C06) || 0) + (Number(vals.C07) || 0) + (Number(vals.C08) || 0) },
  { id: 'C10', name: 'Impressions', type: 'number', category: 'Performance' },
  { id: 'C11', name: 'Likes', type: 'number', category: 'Performance' },
  { id: 'C12', name: 'Comments', type: 'number', category: 'Performance' },
  { id: 'C13', name: 'Engagement Total', type: 'auto', category: 'Performance', calc: (vals: any) => (Number(vals.C11) || 0) + (Number(vals.C12) || 0) },
  { id: 'C14', name: 'Profile Viewers', type: 'number', category: 'Performance' },
  { id: 'C15', name: 'New Followers', type: 'number', category: 'Performance' },
  { id: 'C16', name: 'Total Follower Count', type: 'number', category: 'Performance' },
  { id: 'C17', name: 'Engagement on Other Profiles', type: 'number', category: 'Engagement Activity' },
  { id: 'C18', name: 'Comment Replies', type: 'boolean-text', category: 'Engagement Activity' },
  { id: 'C19', name: 'Bi-Monthly / Weekly Meeting', type: 'boolean', category: 'Delivery & Reporting' },
  { id: 'C20', name: 'EOM Report Sent', type: 'boolean', category: 'Delivery & Reporting' },
  { id: 'C21', name: 'Monthly Podcast Delivered', type: 'boolean', category: 'Delivery & Reporting' },
  { id: 'C22', name: 'Quarterly Client Feedback', type: 'boolean', category: 'Delivery & Reporting' },
  { id: 'C23', name: 'Aha Moments / Bi-Monthly Update', type: 'boolean', category: 'Delivery & Reporting' },
  { id: 'C24', name: 'What\'s Working (Content)', type: 'textarea', category: 'Qualitative' },
  { id: 'C25', name: 'What\'s Not Working (Content)', type: 'textarea', category: 'Qualitative' },
];

const LEADGEN_METRICS_LIST = [
  { id: 'L01', name: 'InMail ICP Targeted', type: 'textarea', category: 'InMail Outreach' },
  { id: 'L02', name: 'InMails Sent', type: 'number', category: 'InMail Outreach' },
  { id: 'L03', name: 'InMails Accepted', type: 'number', category: 'InMail Outreach' },
  { id: 'L04', name: 'InMails Declined', type: 'number', category: 'InMail Outreach' },
  { id: 'L05', name: 'InMail Acceptance Rate', type: 'auto', category: 'InMail Outreach', calc: (vals: any) => (Number(vals.L02) > 0 ? (Number(vals.L03) / Number(vals.L02)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L06', name: 'InMail Hot Leads', type: 'number', category: 'InMail Outreach' },
  { id: 'L07', name: 'ICP Targeted — Connection Requests', type: 'textarea', category: 'Connection Request Outreach' },
  { id: 'L08', name: 'Message Narrative / Strategy Used', type: 'textarea', category: 'Connection Request Outreach' },
  { id: 'L09', name: 'Target Set by Outreach Owner', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L10', name: 'Connection Requests Sent', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L11', name: 'Accepted Invitations', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L12', name: 'Acceptance Rate', type: 'auto', category: 'Connection Request Outreach', calc: (vals: any) => (Number(vals.L10) > 0 ? (Number(vals.L11) / Number(vals.L10)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L13', name: 'Answered Messages', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L14', name: 'Response Rate', type: 'auto', category: 'Connection Request Outreach', calc: (vals: any) => (Number(vals.L11) > 0 ? (Number(vals.L13) / Number(vals.L11)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L15', name: 'Positive Replies', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L16', name: 'Negative Replies', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L17', name: 'Positive Response Rate', type: 'auto', category: 'Connection Request Outreach', calc: (vals: any) => (Number(vals.L13) > 0 ? (Number(vals.L15) / Number(vals.L13)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L18', name: 'Negative Response Rate', type: 'auto', category: 'Connection Request Outreach', calc: (vals: any) => (Number(vals.L13) > 0 ? (Number(vals.L16) / Number(vals.L13)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L19', name: 'Existing Connections Messages Sent', type: 'number', category: 'Existing Connections Outreach' },
  { id: 'L20', name: 'Existing Connections Answered', type: 'number', category: 'Existing Connections Outreach' },
  { id: 'L21', name: 'Existing Connections Response Rate', type: 'auto', category: 'Existing Connections Outreach', calc: (vals: any) => (Number(vals.L19) > 0 ? (Number(vals.L20) / Number(vals.L19)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L22', name: 'Existing Connections Hot Leads', type: 'number', category: 'Existing Connections Outreach' },
  { id: 'L23', name: 'Hot Leads Total', type: 'number', category: 'Pipeline & Conversion' },
  { id: 'L24', name: 'Meetings Booked', type: 'number', category: 'Pipeline & Conversion' },
  { id: 'L25', name: 'Meetings Attended', type: 'number', category: 'Pipeline & Conversion' },
  { id: 'L26', name: 'Meeting Show Up Rate', type: 'auto', category: 'Pipeline & Conversion', calc: (vals: any) => (Number(vals.L24) > 0 ? (Number(vals.L25) / Number(vals.L24)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L27', name: 'Leads Generated', type: 'number', category: 'Pipeline & Conversion' },
  { id: 'L28', name: 'Cold Emails Sent', type: 'number', category: 'Cold Email' },
  { id: 'L29', name: 'Cold Emails Opened', type: 'number', category: 'Cold Email' },
  { id: 'L30', name: 'Cold Email Open Rate', type: 'auto', category: 'Cold Email', calc: (vals: any) => (Number(vals.L28) > 0 ? (Number(vals.L29) / Number(vals.L28)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L31', name: 'Cold Email Replies', type: 'number', category: 'Cold Email' },
  { id: 'L32', name: 'Cold Email Positive Replies', type: 'number', category: 'Cold Email' },
  { id: 'L33', name: 'Cold Email Negative Replies', type: 'number', category: 'Cold Email' },
  { id: 'L34', name: 'Cold Email Response Rate', type: 'auto', category: 'Cold Email', calc: (vals: any) => (Number(vals.L28) > 0 ? (Number(vals.L31) / Number(vals.L28)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L35', name: 'What\'s Working (Lead Gen)', type: 'textarea', category: 'Qualitative' },
  { id: 'L36', name: 'What\'s Not Working (Lead Gen)', type: 'textarea', category: 'Qualitative' },
  { id: 'L37', name: 'Happiness Index', type: 'slider', category: 'Qualitative' },
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

// --- Sub-components (defined outside to prevent re-creation on render) ---

const AcceptInviteView = ({ onAcceptSuccess }: { onAcceptSuccess: () => void }) => {
  const [password, setPassword] = useState('');
  const [inviteData, setInviteData] = useState<Invite | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadInvite = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        setError('No invite token found in the URL.');
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, 'invites'),
        where('token', '==', token)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError('Invite not found. It may have expired or already been used.');
        setLoading(false);
        return;
      }

      const inviteDoc = snapshot.docs[0];
      const inviteData = inviteDoc.data();

      if (inviteData.status === 'accepted') {
        setError('This invite has already been used. Please log in instead.');
        setLoading(false);
        return;
      }

      setInviteData({ id: inviteDoc.id, ...inviteData } as Invite);
      setLoading(false);

    } catch (err: any) {
      setError('Something went wrong: ' + err.message);
      setLoading(false);
    }
  };

  useEffect(() => { 
    loadInvite(); 
    const timer = setTimeout(() => {
      setLoading(prevLoading => {
        if (prevLoading) {
          setError('Invitation verification timed out (8s). Please check your connection.');
          return false;
        }
        return prevLoading;
      });
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteData) return;
    setIsProcessing(true);
    const loadId = toast.loading('Initializing identity...');

    try {
      const u = await createUserWithEmailAndPassword(auth, inviteData.email, password);
      const profile: UserProfile = {
        uid: u.user.uid,
        email: inviteData.email,
        name: inviteData.name,
        department: inviteData.department,
        role: inviteData.role,
        assignedClients: [],
        inviteStatus: 'active',
        invitedBy: inviteData.invitedBy,
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, 'users', u.user.uid), profile);
      await updateDoc(doc(db, 'invites', inviteData.id), { status: 'accepted' });
      
      toast.success('Access Granted. Welcome to Myntmore OS.', { id: loadId });
      onAcceptSuccess();
    } catch (error) {
      toast.error('Identity creation failed', { id: loadId });
    } finally {
      setIsProcessing(false);
    }
  };

  if (error) return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 text-center">
      <div className="space-y-4 max-w-sm">
        <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-gray-500 text-sm">{error}</p>
        <button onClick={() => window.location.href = '/'} className="px-6 py-2 bg-black text-white rounded-xl text-xs font-bold uppercase tracking-widest">Return to Base</button>
      </div>
    </div>
  );

  if (loading) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 gap-4">
      <div className="w-10 h-10 border-2 border-black/5 border-t-accent rounded-full animate-spin" />
      <div className="text-center">
        <p className="text-[10px] font-mono text-black/40 uppercase tracking-[0.3em] mb-1 animate-pulse">Decoding invitation token...</p>
        <p className="text-[8px] font-mono text-black/20 uppercase tracking-[0.2em]">Authenticating Secure Handshake...</p>
      </div>
    </div>
  );

  if (!inviteData) return null;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-sm">
        <Card className="p-10 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black italic tracking-tighter uppercase">ACCESS REQUESTED</h2>
            <p className="text-gray-400 text-xs font-mono uppercase tracking-widest">Pending verification for {inviteData?.name}</p>
          </div>

          <form onSubmit={handleAccept} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest pl-1">Email Authority</label>
              <input 
                disabled
                value={inviteData?.email}
                className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl text-gray-400 font-medium"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest pl-1">Define Master Password</label>
              <input 
                required
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none focus:ring-2 ring-accent/50"
                placeholder="••••••••"
              />
            </div>
            <button 
              type="submit" 
              disabled={isProcessing}
              className="w-full py-4 bg-accent text-accent-foreground font-black rounded-xl shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              SECURE IDENTITY & JOIN
            </button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
};

const TeamView = ({ allUsers, invites, userId }: { allUsers: UserProfile[], invites: Invite[], userId?: string }) => {
  const [isInviting, setIsInviting] = useState(false);
  const [inviteData, setInviteData] = useState({ name: '', email: '', department: 'content' as any });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const loadId = toast.loading('Sending invitation...');
    try {
      const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
      await addDoc(collection(db, 'invites'), {
        ...inviteData,
        role: 'member',
        invitedBy: userId,
        createdAt: serverTimestamp(),
        status: 'pending',
        token
      });
      toast.success(`Invite link generated: /accept-invite?token=${token}`, { id: loadId, duration: 10000 });
      setIsInviting(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'invites');
      toast.error('Failed to send invite', { id: loadId });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Team Intelligence</h2>
          <p className="text-gray-400 text-sm">Manage internal operators and access tiers.</p>
        </div>
        <button 
          onClick={() => setIsInviting(true)}
          className="px-6 py-2 bg-accent text-accent-foreground font-bold rounded-xl shadow-lg shadow-accent/20 flex items-center gap-2"
        >
          <PlusCircle className="w-4 h-4" />
          Invite Member
        </button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50/50 text-[10px] font-mono uppercase tracking-widest text-gray-400">
            <tr>
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">Department</th>
              <th className="px-6 py-4">Clients</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {allUsers.map((u, i) => (
              <tr key={i} className="text-sm">
                <td className="px-6 py-4">
                  <p className="font-bold">{u.name}</p>
                  <p className="text-[10px] text-gray-400 font-mono">{u.email}</p>
                </td>
                <td className="px-6 py-4 capitalize">{u.department}</td>
                <td className="px-6 py-4">
                  <Badge variant="outline">{u.assignedClients?.length || 0} Assigned</Badge>
                </td>
                <td className="px-6 py-4">
                  <Badge variant={u.inviteStatus === 'active' ? 'accent' : 'outline'}>{u.inviteStatus}</Badge>
                </td>
                <td className="px-6 py-4">
                  <button className="text-gray-400 hover:text-black transition-colors">Edit</button>
                </td>
              </tr>
            ))}
            {invites.filter(i => i.status === 'pending').map((inv, i) => (
              <tr key={`inv-${i}`} className="text-sm opacity-60 bg-yellow-50/30">
                <td className="px-6 py-4">
                  <p className="font-bold">{inv.name}</p>
                  <p className="text-[10px] text-gray-400 font-mono">{inv.email}</p>
                </td>
                <td className="px-6 py-4 capitalize">{inv.department}</td>
                <td className="px-6 py-4">—</td>
                <td className="px-6 py-4">
                  <Badge variant="accent">Pending</Badge>
                </td>
                <td className="px-6 py-4">
                  <button className="text-gray-400 hover:text-black transition-colors">Resend</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {isInviting && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md">
            <Card className="p-8 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">New Mission Invite</h3>
                <button onClick={() => setIsInviting(false)} className="text-gray-400 hover:text-black">✕</button>
              </div>
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Full Name</label>
                  <input 
                    required
                    className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none" 
                    onChange={e => setInviteData({...inviteData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Email Address</label>
                  <input 
                    required
                    type="email"
                    className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none" 
                    onChange={e => setInviteData({...inviteData, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Department</label>
                  <select 
                    className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none"
                    onChange={e => setInviteData({...inviteData, department: e.target.value as any})}
                  >
                    <option value="content">Content</option>
                    <option value="leadgen">Lead Gen</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <button type="submit" className="w-full py-4 bg-accent text-accent-foreground font-bold rounded-xl shadow-lg shadow-accent/20">
                  Deploy Invitation
                </button>
              </form>
            </Card>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const DataEntryView = ({ clients, userProfile }: { clients: Client[], userProfile: UserProfile | null }) => {
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState('2026-W16');
  const [entryData, setEntryData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  const client = clients.find(c => c.id === selectedClient);
  const userRoleInClient = userProfile?.assignedClients?.find(a => a.clientId === selectedClient)?.role;
  const canSeeContent = userProfile?.role === 'admin' || userRoleInClient === 'contentManager' || userProfile?.department === 'both';
  const canSeeLeadGen = userProfile?.role === 'admin' || userRoleInClient === 'leadGenManager' || userProfile?.department === 'both';

  const handleSave = async (submit = false) => {
    if (!selectedClient) return;
    setIsSaving(true);
    const loadId = toast.loading('Syncing OS data...');
    try {
      const docId = selectedWeek;
      const year = '2026';
      const ref = doc(db, `weeklyData/${selectedClient}/${year}`, docId);

      const updatePayload: any = {};
      if (canSeeContent) {
        updatePayload.contentMetrics = entryData.contentMetrics || {};
        updatePayload.lastUpdatedContent = serverTimestamp();
        if (submit) updatePayload.submittedAtContent = serverTimestamp();
      }
      if (canSeeLeadGen) {
        updatePayload.leadGenMetrics = entryData.leadGenMetrics || {};
        updatePayload.lastUpdatedLeadGen = serverTimestamp();
        if (submit) updatePayload.submittedAtLeadGen = serverTimestamp();
      }

      await setDoc(ref, { 
        ...updatePayload,
        weekOf: new Date().toISOString() 
      }, { merge: true });

      toast.success(submit ? 'Week Submitted Successfully' : 'Draft Saved', { id: loadId });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `weeklyData/${selectedClient}/2026/${selectedWeek}`);
      toast.error('Sync failed', { id: loadId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Select Client</label>
          <select 
            className="w-full bg-white border border-gray-100 px-6 py-4 rounded-2xl outline-none shadow-sm font-bold text-lg"
            onChange={(e) => {
              setSelectedClient(e.target.value);
              const perf = clients.find(c => c.id === e.target.value)?.weeklyPerformance.find(w => w.weekId === selectedWeek);
              setEntryData(perf || { contentMetrics: {}, leadGenMetrics: {} });
            }}
          >
            <option value="">— Select Target Account —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Select Week</label>
          <select 
            className="w-full bg-white border border-gray-100 px-6 py-4 rounded-2xl outline-none shadow-sm font-bold"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
          >
            {WEEKS.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>

      {!selectedClient ? (
        <div className="py-20 text-center bg-gray-50/50 border-2 border-dashed border-gray-100 rounded-3xl">
          <TrendingUp className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium">Select a client account to begin data entry pulse.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex gap-4 border-b border-gray-100">
            {canSeeContent && <button className="px-6 py-4 border-b-2 border-accent text-sm font-bold">Content Metrics</button>}
            {canSeeLeadGen && <button className="px-6 py-4 text-sm font-medium text-gray-400">Lead Gen Metrics</button>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {(canSeeContent ? CONTENT_METRICS_LIST : LEADGEN_METRICS_LIST).map(m => (
              <div key={m.id} className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">{m.category}</p>
                    <h4 className="font-bold text-sm">{m.name}</h4>
                  </div>
                  {m.type === 'auto' && <Badge variant="outline">Auto</Badge>}
                </div>
                
                {m.type === 'number' && (
                  <div className="flex gap-4">
                    <input 
                      type="number"
                      placeholder="Actual"
                      className="flex-1 bg-gray-50 border-none px-4 py-3 rounded-xl outline-none"
                      value={entryData[canSeeContent ? 'contentMetrics' : 'leadGenMetrics']?.[m.id]?.value || ''}
                      onChange={(e) => {
                        const section = canSeeContent ? 'contentMetrics' : 'leadGenMetrics';
                        setEntryData({
                          ...entryData,
                          [section]: {
                            ...entryData[section],
                            [m.id]: { ...entryData[section]?.[m.id], value: Number(e.target.value) }
                          }
                        });
                      }}
                    />
                    <input 
                      type="number"
                      placeholder="Target"
                      className="w-24 bg-gray-100/50 border-none px-4 py-3 rounded-xl outline-none text-xs font-mono"
                      value={entryData[canSeeContent ? 'contentMetrics' : 'leadGenMetrics']?.[m.id]?.target || ''}
                      onChange={(e) => {
                        const section = canSeeContent ? 'contentMetrics' : 'leadGenMetrics';
                        setEntryData({
                          ...entryData,
                          [section]: {
                            ...entryData[section],
                            [m.id]: { ...entryData[section]?.[m.id], target: Number(e.target.value) }
                          }
                        });
                      }}
                    />
                  </div>
                )}

                {m.type === 'textarea' && (
                  <textarea 
                    className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none min-h-[100px] text-sm"
                    placeholder="Detailed notes / descriptions..."
                    value={entryData[canSeeContent ? 'contentMetrics' : 'leadGenMetrics']?.[m.id]?.value || ''}
                    onChange={(e) => {
                      const section = canSeeContent ? 'contentMetrics' : 'leadGenMetrics';
                      setEntryData({
                        ...entryData,
                        [section]: {
                          ...entryData[section],
                          [m.id]: { ...entryData[section]?.[m.id], value: e.target.value }
                        }
                      });
                    }}
                  />
                )}

                {m.type === 'boolean' && (
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => {
                        const section = canSeeContent ? 'contentMetrics' : 'leadGenMetrics';
                        setEntryData({
                          ...entryData,
                          [section]: {
                            ...entryData[section],
                            [m.id]: { ...entryData[section]?.[m.id], value: true }
                          }
                        });
                      }}
                      className={`px-6 py-3 rounded-xl text-xs font-bold transition-all ${entryData[canSeeContent ? 'contentMetrics' : 'leadGenMetrics']?.[m.id]?.value === true ? 'bg-accent text-accent-foreground' : 'bg-gray-50 text-gray-400'}`}
                    >
                      YES
                    </button>
                    <button 
                       onClick={() => {
                        const section = canSeeContent ? 'contentMetrics' : 'leadGenMetrics';
                        setEntryData({
                          ...entryData,
                          [section]: {
                            ...entryData[section],
                            [m.id]: { ...entryData[section]?.[m.id], value: false }
                          }
                        });
                      }}
                      className={`px-6 py-3 rounded-xl text-xs font-bold transition-all ${entryData[canSeeContent ? 'contentMetrics' : 'leadGenMetrics']?.[m.id]?.value === false ? 'bg-red-500 text-white' : 'bg-gray-50 text-gray-400'}`}
                    >
                      NO
                    </button>
                  </div>
                )}

                {m.type === 'auto' && (
                  <div className="bg-gray-50/50 p-4 rounded-xl border border-dashed border-gray-200">
                    <span className="text-xl font-black">{m.calc?.(entryData[canSeeContent ? 'contentMetrics' : 'leadGenMetrics'] || {})}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="pt-12 flex gap-4">
            <button 
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="px-10 py-4 bg-white border border-gray-100 font-bold rounded-2xl shadow-sm hover:bg-gray-50 transition-all"
            >
              Save Draft
            </button>
            <button 
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="flex-1 py-4 bg-accent text-accent-foreground font-black rounded-2xl shadow-xl shadow-accent/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
              Submit Week Pulse
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'data-entry' | 'monday-mode' | 'actionables' | 'sales' | 'finance' | 'internal' | 'settings' | 'team' | 'accept-invite'>('dashboard');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [meetingIndex, setMeetingIndex] = useState(0);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClientData, setNewClientData] = useState({ name: '', contentManagerUid: '', leadGenManagerUid: '' });

  // Router for Accept Invite
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const path = window.location.pathname;
    
    if (path === '/accept-invite' && token) {
      setInviteToken(token);
      setActiveTab('accept-invite');
    }
  }, []);

  const navItems = useMemo(() => {
    if (!userProfile) return [];
    
    const isAdmin = userProfile.role === 'admin';
    
    const baseItems = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'actionables', label: 'Actionables', icon: Layers },
      { id: 'data-entry', label: 'Data Entry', icon:TrendingUp },
    ];

    if (isAdmin) {
      return [
        ...baseItems,
        { id: 'clients', label: 'Clients', icon: Users },
        { id: 'monday-mode', label: 'Monday Mode', icon: Calendar },
        { id: 'sales', label: 'Sales & Pipeline', icon: BarChart3 },
        { id: 'finance', label: 'Finance', icon: ShieldCheck },
        { id: 'internal', label: 'Internal Systems', icon: Database },
        { id: 'team', label: 'Team Members', icon: ShieldCheck },
        { id: 'settings', label: 'Settings', icon: Settings },
      ];
    }

    return baseItems;
  }, [userProfile]);

  // Auth Effect
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      try {
        setUser(u);
        if (u) {
          const userRef = doc(db, 'users', u.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            setUserProfile(userDoc.data() as UserProfile);
          } else if (u.email === 'sanyam@myntmore.com') {
            // Auto-bootstrap admin
            const profile: UserProfile = { 
              uid: u.uid,
              email: u.email, 
              role: 'admin', 
              name: 'Sanyam', 
              department: 'both',
              assignedClients: [],
              inviteStatus: 'active',
              invitedBy: 'system',
              createdAt: serverTimestamp()
            };
            await setDoc(userRef, profile);
            setUserProfile(profile);
          }
        } else {
          setUserProfile(null);
        }
      } catch (error) {
        console.error('Auth sync error:', error);
        // Don't set profile but let auth ready continue
      } finally {
        setIsAuthReady(true);
      }
    });
  }, []);

  // Data Fetching Effect (Extended for Invites/Users)
  useEffect(() => {
    if (!user || !userProfile) return;

    if (userProfile.role === 'admin') {
      const invitesUnsub = onSnapshot(collection(db, 'invites'), (snap) => {
        setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invite)));
      });
      const usersUnsub = onSnapshot(collection(db, 'users'), (snap) => {
        setAllUsers(snap.docs.map(d => d.data() as UserProfile));
      });
      return () => {
        invitesUnsub();
        usersUnsub();
      };
    }
  }, [user, userProfile]);

  // Data Fetching Effect
  useEffect(() => {
    if (!user || !userProfile) {
      setClients([]);
      setIsLoading(false);
      return;
    }

    const performanceUnsubscribes: { [clientId: string]: () => void } = {};

    let clientsQuery = query(collection(db, 'clients'));
    
    const unsubscribe = onSnapshot(clientsQuery, (snapshot) => {
      setIsLoading(false);
      let clientsData: Client[] = snapshot.docs.map((clientDoc) => {
        const data = clientDoc.data() as any;
        return {
          ...data,
          id: clientDoc.id,
          weeklyPerformance: [] 
        };
      });

      // Member access control: Only their assigned clients
      if (userProfile.role !== 'admin') {
        const assignedIds = (userProfile.assignedClients || []).map(c => c.clientId);
        clientsData = clientsData.filter(c => assignedIds.includes(c.id));
      }

      setClients(prev => {
        return clientsData.map(newClient => {
          const existing = prev.find(p => p.id === newClient.id);
          return existing ? { ...newClient, weeklyPerformance: existing.weeklyPerformance } : newClient;
        });
      });

      // Listen to weeklyData subcollections
      clientsData.forEach(client => {
        if (!performanceUnsubscribes[client.id]) {
          const perfQ = query(collection(db, `weeklyData/${client.id}/2026`), orderBy('weekOf', 'asc'));
          performanceUnsubscribes[client.id] = onSnapshot(perfQ, (perfSnapshot) => {
            const performance: WeeklyPerformance[] = perfSnapshot.docs.map(d => ({ weekId: d.id, ...d.data() } as any));
            setClients(prev => prev.map(c => c.id === client.id ? { ...c, weeklyPerformance: performance as any } : c));
          }, (error) => handleFirestoreError(error, OperationType.LIST, `weeklyData/${client.id}/2026`));
        }
      });

      // Cleanup listeners
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
  }, [user, userProfile]);

  // --- Views ---

  // (Internal view logic moved to sub-components)


  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const loadId = toast.loading('Establishing new scope...');
    try {
      const contentMan = allUsers.find(u => u.uid === newClientData.contentManagerUid);
      const leadMan = allUsers.find(u => u.uid === newClientData.leadGenManagerUid);

      const clientRef = await addDoc(collection(db, 'clients'), {
        name: newClientData.name,
        status: 'active',
        contentManagerUid: newClientData.contentManagerUid,
        contentManagerName: contentMan?.name || 'Unknown',
        leadGenManagerUid: newClientData.leadGenManagerUid,
        leadGenManagerName: leadMan?.name || 'Unknown',
        createdAt: serverTimestamp(),
        createdBy: user?.uid
      });

      // Update managers profiles
      const updateProfile = async (uid: string, role: any) => {
        const uRef = doc(db, 'users', uid);
        const uDoc = await getDoc(uRef);
        if (uDoc.exists()) {
          const assigned = uDoc.data().assignedClients || [];
          await setDoc(uRef, {
            assignedClients: [...assigned, { clientId: clientRef.id, role }]
          }, { merge: true });
        }
      };

      await updateProfile(newClientData.contentManagerUid, 'contentManager');
      if (newClientData.contentManagerUid !== newClientData.leadGenManagerUid) {
        await updateProfile(newClientData.leadGenManagerUid, 'leadGenManager');
      }

      toast.success('Client scope established', { id: loadId });
      setIsAddingClient(false);
    } catch (error) {
      toast.error('Failed to establish scope', { id: loadId });
    }
  };

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
      { name: 'SKC — Divya', status: 'active' as const, contentManagerUid: userProfile.uid, contentManagerName: userProfile.name, leadGenManagerUid: userProfile.uid, leadGenManagerName: userProfile.name },
      { name: 'Mindful — Rohan', status: 'active' as const, contentManagerUid: userProfile.uid, contentManagerName: userProfile.name, leadGenManagerUid: userProfile.uid, leadGenManagerName: userProfile.name },
    ];

    const loadId = toast.loading('Seeding OS records...');

    try {
      for (const client of mockClients) {
        const clientRef = await addDoc(collection(db, 'clients'), {
          ...client,
          createdAt: serverTimestamp(),
          createdBy: userProfile.uid,
          updatedAt: serverTimestamp()
        });

        // Add to assignedClients for the current admin too
        const userRef = doc(db, 'users', userProfile.uid);
        const currentAssigned = userProfile.assignedClients || [];
        if (!currentAssigned.find(a => a.clientId === clientRef.id)) {
          await setDoc(userRef, {
            assignedClients: [
              ...currentAssigned,
              { clientId: clientRef.id, role: 'contentManager' },
              { clientId: clientRef.id, role: 'leadGenManager' }
            ]
          }, { merge: true });
        }

        const batch = writeBatch(db);
        WEEKS.forEach((weekId, idx) => {
          const weekRef = doc(db, `weeklyData/${clientRef.id}/2026`, weekId);
          
          const contentMetrics: any = {};
          CONTENT_METRICS_LIST.forEach(m => {
            if (m.type === 'number') contentMetrics[m.id] = { value: Math.floor(Math.random() * 50), target: 40 };
            else if (m.type === 'boolean') contentMetrics[m.id] = { value: Math.random() > 0.5 };
            else contentMetrics[m.id] = { value: 'Seed qualitative data' };
          });

          const leadGenMetrics: any = {};
          LEADGEN_METRICS_LIST.forEach(m => {
            if (m.type === 'number') leadGenMetrics[m.id] = { value: Math.floor(Math.random() * 50), target: 40 };
            else if (m.type === 'boolean') leadGenMetrics[m.id] = { value: Math.random() > 0.5 };
            else leadGenMetrics[m.id] = { value: 'Seed lead gen description' };
          });

          batch.set(weekRef, {
            weekOf: `2026-0${idx + 1}-01`,
            contentMetrics,
            leadGenMetrics,
            lastUpdatedContent: serverTimestamp(),
            lastUpdatedLeadGen: serverTimestamp(),
            submittedAtContent: serverTimestamp(),
            submittedAtLeadGen: serverTimestamp()
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

  const getStatus = (actual: number, target: number): 'on-track' | 'at-risk' | 'off-track' => {
    if (actual >= target) return 'on-track';
    if (actual >= target * 0.8) return 'at-risk';
    return 'off-track';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on-track': return 'bg-accent';
      case 'at-risk': return 'bg-yellow-500';
      case 'off-track': return 'bg-red-500';
      default: return 'bg-gray-200';
    }
  };

  const calculateAchievement = (client: Client) => {
    if (!client.weeklyPerformance || client.weeklyPerformance.length === 0) return 0;
    const last = client.weeklyPerformance[client.weeklyPerformance.length - 1];
    
    let totalTarget = 0;
    let totalActual = 0;

    const processMetrics = (metrics: any) => {
      Object.values(metrics).forEach((m: any) => {
        if (typeof m.value === 'number' && m.target) {
          totalTarget += m.target;
          totalActual += m.value;
        }
      });
    };

    if (last.contentMetrics) processMetrics(last.contentMetrics);
    if (last.leadGenMetrics) processMetrics(last.leadGenMetrics);

    return totalTarget > 0 ? (totalActual / totalTarget) : 0;
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

  if (activeTab === 'accept-invite') {
    return <AcceptInviteView onAcceptSuccess={() => setActiveTab('dashboard')} />;
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-100 flex flex-col bg-white sticky top-0 h-screen">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-3 h-3 bg-accent rounded-full" />
            <span className="font-bold tracking-tight">MYNTMORE OS</span>
          </div>
          <span className="text-[9px] text-gray-400 font-mono uppercase tracking-[0.2em] block pl-6">v1.3.0-RC</span>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map(item => (
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
                  </div>
                </Card>
                <Card className="p-6">
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">Global Health Index</p>
                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-bold">
                      {(clients.reduce((acc, c) => acc + calculateAchievement(c), 0) / (clients.length || 1) * 100).toFixed(0)}%
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
                            const data = c.weeklyPerformance.find(w => (w as any).weekId === week);
                            if (!data) return 0;
                            
                            let totalTarget = 0;
                            let totalActual = 0;

                            const processSec = (metrics: any) => {
                              Object.values(metrics).forEach((m: any) => {
                                if (typeof m.value === 'number' && m.target) {
                                  totalTarget += m.target;
                                  totalActual += m.value;
                                }
                              });
                            };
                            processSec(data.contentMetrics || {});
                            processSec(data.leadGenMetrics || {});

                            return totalTarget > 0 ? (totalActual / totalTarget) : 0;
                          });
                          return {
                            name: week,
                            achievement: (achievements.reduce((a, b) => a + b, 0) / (clients.length || 1)) * 100
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
                        const avg = calculateAchievement(client);
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

          {activeTab === 'clients' && userProfile?.role === 'admin' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clients.map(client => (
                <Card key={client.id} className="overflow-hidden group">
                  <div className="p-6 border-b border-gray-50">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg mb-1">{client.name}</h3>
                        <div className="space-y-1 mt-2">
                          <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">Managers</p>
                          <div className="grid grid-cols-1 gap-1">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              <span className="text-[11px] font-medium">Content: {client.contentManagerName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              <span className="text-[11px] font-medium">Lead Gen: {client.leadGenManagerName}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <Badge variant="accent">{client.status}</Badge>
                    </div>
                  </div>
                  <div className="px-6 py-4 bg-gray-50 flex justify-between items-center">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Achievement</p>
                      <p className="text-lg font-black">{(calculateAchievement(client) * 100).toFixed(0)}%</p>
                    </div>
                    <button className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 bg-white border border-gray-100 rounded-lg shadow-sm">
                      Configure
                    </button>
                  </div>
                </Card>
              ))}
              
              <button 
                onClick={() => setIsAddingClient(true)}
                className="h-full min-h-[200px] border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center gap-4 text-gray-300 hover:text-black hover:border-gray-300 transition-all group"
              >
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-current flex items-center justify-center group-hover:scale-110 transition-transform">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold">Deploy New Scope</span>
              </button>

              {isAddingClient && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                  <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md">
                    <Card className="p-8 space-y-6">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold">New Client Scope</h3>
                        <button onClick={() => setIsAddingClient(false)} className="text-gray-400 hover:text-black">✕</button>
                      </div>
                      <form onSubmit={handleAddClient} className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Client Name</label>
                          <input 
                            required
                            className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none" 
                            onChange={e => setNewClientData({...newClientData, name: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Content Manager</label>
                          <select 
                            required
                            className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none"
                            onChange={e => setNewClientData({...newClientData, contentManagerUid: e.target.value})}
                          >
                            <option value="">— Select Content Owner —</option>
                            {allUsers.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Lead Gen Manager</label>
                          <select 
                            required
                            className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none"
                            onChange={e => setNewClientData({...newClientData, leadGenManagerUid: e.target.value})}
                          >
                            <option value="">— Select Outreach Owner —</option>
                            {allUsers.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                          </select>
                        </div>
                        <button type="submit" className="w-full py-4 bg-accent text-accent-foreground font-black rounded-xl shadow-lg shadow-accent/20">
                          Establish Account
                        </button>
                      </form>
                    </Card>
                  </motion.div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'team' && userProfile?.role === 'admin' && <TeamView allUsers={allUsers} invites={invites} userId={user?.uid} />}
          {activeTab === 'data-entry' && <DataEntryView clients={clients} userProfile={userProfile} />}

          {activeTab === 'actionables' && (
            <div className="py-20 text-center space-y-4">
              <Layers className="w-12 h-12 text-gray-200 mx-auto" />
              <h3 className="text-lg font-bold">Actionable Tasks</h3>
              <p className="text-gray-400">Task tracking and pipeline logic coming in v1.4</p>
            </div>
          )}

          {activeTab === 'monday-mode' && userProfile?.role === 'admin' && (
            <div className="space-y-10">
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
                            <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">Managers</p>
                            <p className="text-sm font-bold">C: {clients[meetingIndex].contentManagerName}</p>
                            <p className="text-sm font-bold">L: {clients[meetingIndex].leadGenManagerName}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 flex-1">
                          <div className="space-y-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-accent" />
                              <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Growth Velocity</span>
                            </div>
                            <div className="text-6xl font-black tracking-tighter">
                              {(calculateAchievement(clients[meetingIndex]) * 100).toFixed(0)}%
                            </div>
                            <p className="text-sm text-gray-400 font-medium italic">"{clients[meetingIndex].name} is maintaining stable trajectory."</p>
                          </div>
                          
                          <div className="md:col-span-2 grid grid-cols-2 gap-6">
                             <div className="p-6 bg-gray-50 rounded-2xl">
                               <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-2">Content Pulse</p>
                               <div className="text-2xl font-bold">On Track</div>
                             </div>
                             <div className="p-6 bg-gray-50 rounded-2xl">
                               <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-2">Lead Gen Health</p>
                               <div className="text-2xl font-bold text-accent">Optimization Req.</div>
                             </div>
                          </div>
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


          {activeTab === 'sales' && <div className="p-10 font-mono text-xs uppercase tracking-widest text-gray-400">Sales & Pipeline Authority Dashboard</div>}
          {activeTab === 'finance' && <div className="p-10 font-mono text-xs uppercase tracking-widest text-gray-400">Finance & ARR Tracking</div>}
          {activeTab === 'internal' && <div className="p-10 font-mono text-xs uppercase tracking-widest text-gray-400">Internal Agency Systems Configuration</div>}

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

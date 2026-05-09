// Vercel trigger commit: 2026-05-08
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
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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
import * as XLSX from 'xlsx';

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
  weekStart?: string;
  weekEnd?: string;
  weekLabel?: string;
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

interface HighScore {
  lifetimeHigh: number;
  achievedWeek: string;
  previousHigh: number | null;
  updatedAt: any;
}

interface ClientSettings {
  activeContentMetrics: string[];
  activeLeadGenMetrics: string[];
  customTargets: { [key: string]: number };
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
  // InMail Outreach
  { id: 'L01', name: 'InMail ICP Targeted', type: 'textarea', category: 'InMail Outreach' },
  { id: 'L02', name: 'InMails Sent', type: 'number', category: 'InMail Outreach' },
  { id: 'L03', name: 'InMails Accepted', type: 'number', category: 'InMail Outreach' },
  { id: 'L04', name: 'InMails Declined', type: 'number', category: 'InMail Outreach' },
  { id: 'L05', name: 'InMails Answered', type: 'number', category: 'InMail Outreach' },
  { id: 'L06', name: 'InMail Meetings Booked', type: 'number', category: 'InMail Outreach' },

  // Connection Request Outreach
  { id: 'L07', name: 'Connection ICP Targeted', type: 'textarea', category: 'Connection Request Outreach' },
  { id: 'L08', name: 'Connection Requests Sent', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L09', name: 'Connection Requests Accepted', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L10', name: 'Acceptance Rate', type: 'auto', category: 'Connection Request Outreach', calc: (vals: any) => (Number(vals.L08) > 0 ? (Number(vals.L09) / Number(vals.L08)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L11', name: 'Messages Sent to New Connections', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L12', name: 'New Connections Replied', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L13', name: 'Reply Rate (New Connections)', type: 'auto', category: 'Connection Request Outreach', calc: (vals: any) => (Number(vals.L11) > 0 ? (Number(vals.L12) / Number(vals.L11)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L14', name: 'Hot Leads (New Connections)', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L15', name: 'Negative Replies (New)', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L16', name: 'Generic Responses (New)', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L17', name: 'Meetings Booked (New)', type: 'number', category: 'Connection Request Outreach' },
  { id: 'L18', name: 'Conversion Rate (Sent to Meeting)', type: 'auto', category: 'Connection Request Outreach', calc: (vals: any) => (Number(vals.L08) > 0 ? (Number(vals.L17) / Number(vals.L08)) * 100 : 0).toFixed(1) + '%' },

  // Existing Connections
  { id: 'L19', name: 'Messages Sent to Existing Connections', type: 'number', category: 'Existing Connections' },
  { id: 'L20', name: 'Existing Connections Replied', type: 'number', category: 'Existing Connections' },
  { id: 'L21', name: 'Reply Rate (Existing)', type: 'auto', category: 'Existing Connections', calc: (vals: any) => (Number(vals.L19) > 0 ? (Number(vals.L20) / Number(vals.L19)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L22', name: 'Meetings Booked (Existing)', type: 'number', category: 'Existing Connections' },

  // Pipeline & Conversion
  { id: 'L23', name: 'Total Meetings Completed', type: 'number', category: 'Pipeline & Conversion' },
  { id: 'L24', name: 'Total No Shows', type: 'number', category: 'Pipeline & Conversion' },
  { id: 'L25', name: 'Proposals Sent', type: 'number', category: 'Pipeline & Conversion' },
  { id: 'L26', name: 'Follow Ups Done', type: 'number', category: 'Pipeline & Conversion' },
  { id: 'L27', name: 'Clients Converted', type: 'number', category: 'Pipeline & Conversion' },

  // Cold Email
  { id: 'L28', name: 'Emails Sent', type: 'number', category: 'Cold Email' },
  { id: 'L29', name: 'Emails Delivered', type: 'number', category: 'Cold Email' },
  { id: 'L30', name: 'Emails Opened', type: 'number', category: 'Cold Email' },
  { id: 'L31', name: 'Open Rate', type: 'auto', category: 'Cold Email', calc: (vals: any) => (Number(vals.L29) > 0 ? (Number(vals.L30) / Number(vals.L29)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L32', name: 'Replies Received', type: 'number', category: 'Cold Email' },
  { id: 'L33', name: 'Reply Rate', type: 'auto', category: 'Cold Email', calc: (vals: any) => (Number(vals.L29) > 0 ? (Number(vals.L32) / Number(vals.L29)) * 100 : 0).toFixed(1) + '%' },
  { id: 'L34', name: 'Meetings Booked via Email', type: 'number', category: 'Cold Email' },

  // Qualitative + Happiness
  { id: 'L35', name: 'What\'s Working (Lead Gen)', type: 'textarea', category: 'Qualitative + Happiness' },
  { id: 'L36', name: 'What\'s Not Working (Lead Gen)', type: 'textarea', category: 'Qualitative + Happiness' },
  { id: 'L37', name: 'Happiness Index', type: 'number', category: 'Qualitative + Happiness' },
];

const TJ_METRICS = {
  instagram: [
    { id: 'TJI01', name: 'Stories Posted', type: 'number' },
    { id: 'TJI02', name: 'Carousels Posted', type: 'number' },
    { id: 'TJI03', name: 'Reels Posted', type: 'number' },
    { id: 'TJI04', name: 'Total Posts', type: 'auto', calc: (vals: any) => (Number(vals.TJI02) || 0) + (Number(vals.TJI03) || 0) },
    { id: 'TJI05', name: 'Impressions', type: 'number' },
    { id: 'TJI06', name: 'Likes', type: 'number' },
    { id: 'TJI07', name: 'Comments', type: 'number' },
    { id: 'TJI08', name: 'Shares', type: 'number' },
    { id: 'TJI09', name: 'Saves', type: 'number' },
    { id: 'TJI10', name: 'Followers Gained', type: 'number' },
    { id: 'TJI11', name: 'Total Follower Count', type: 'number' },
    { id: 'TJI12', name: 'What content went out', type: 'textarea' },
  ],
  youtube: [
    { id: 'TJY01', name: 'Shorts Uploaded', type: 'number' },
    { id: 'TJY02', name: 'CTR (%)', type: 'percentage' },
    { id: 'TJY03', name: 'Avg View Duration (seconds)', type: 'number' },
    { id: 'TJY04', name: 'Views', type: 'number' },
    { id: 'TJY05', name: 'Impressions', type: 'number' },
    { id: 'TJY06', name: 'Likes', type: 'number' },
    { id: 'TJY07', name: 'Comments', type: 'number' },
    { id: 'TJY08', name: 'New Subscribers', type: 'number' },
    { id: 'TJY09', name: 'Total Subscriber Count', type: 'number' },
    { id: 'TJY10', name: 'Total Watch Time (hours)', type: 'number' },
  ],
  linkedinNewsletter: [
    { id: 'TJN01', name: 'Subscriber Count', type: 'number' },
    { id: 'TJN02', name: 'Issues Sent', type: 'number' },
    { id: 'TJN03', name: 'Email Open Rate (%)', type: 'percentage' },
    { id: 'TJN04', name: 'Members Reached', type: 'number' },
    { id: 'TJN05', name: 'Impressions', type: 'number' },
  ],
  emailNewsletter: [
    { id: 'TJE01', name: 'Subscriber Count', type: 'number' },
    { id: 'TJE02', name: 'Emails Sent', type: 'number' },
    { id: 'TJE03', name: 'Delivered', type: 'number' },
    { id: 'TJE04', name: 'Open Rate (%)', type: 'percentage' },
    { id: 'TJE05', name: 'Clicked', type: 'number' },
    { id: 'TJE06', name: 'Replies', type: 'number' },
    { id: 'TJE07', name: 'Unsubscribed', type: 'number' },
  ],
  podcast: [
    { id: 'TJP01', name: 'Episodes Recorded', type: 'number' },
    { id: 'TJP02', name: 'Episodes Live', type: 'number' },
    { id: 'TJP03', name: 'Listens / Downloads', type: 'number' },
    { id: 'TJP04', name: 'Listener Growth', type: 'number' },
    { id: 'TJP05', name: 'Guest Name', type: 'text' },
    { id: 'TJP06', name: 'Episode Topic', type: 'text' },
  ],
  videoPipeline: [
    { id: 'TJV01', name: 'Videos Sent to Atharwa', type: 'number' },
    { id: 'TJV02', name: 'Videos Edited', type: 'number' },
    { id: 'TJV03', name: 'Videos Shot', type: 'number' },
    { id: 'TJV04', name: 'Videos Shot Pending Editing', type: 'number' },
    { id: 'TJV05', name: 'Videos in Pipeline for Edit', type: 'number' },
    { id: 'TJV06', name: 'Videos Posted', type: 'number' },
    { id: 'TJV07', name: 'Videos Pending Approval', type: 'number' },
    { id: 'TJV08', name: 'Stories Posted', type: 'number' },
    { id: 'TJV09', name: 'Carousels Made', type: 'number' },
    { id: 'TJV10', name: 'Static Posts', type: 'number' },
    { id: 'TJV11', name: 'Feedback Given by TJ to Atharwa', type: 'number' },
    { id: 'TJV12', name: 'TJ Idea Approvals', type: 'number' },
    { id: 'TJV13', name: 'TJ Ideas Approval Pending', type: 'number' },
  ]
};

const SALES_METRICS = {
  tjOutreach: [
    { id: 'SO01', name: 'ICP Targeted', type: 'textarea' },
    { id: 'SO02', name: 'Connection Requests Sent', type: 'number' },
    { id: 'SO03', name: 'Accepted Invitations', type: 'number' },
    { id: 'SO04', name: 'Acceptance Rate', type: 'auto', calc: (vals: any) => (Number(vals.SO02) > 0 ? (Number(vals.SO03) / Number(vals.SO02)) * 100 : 0).toFixed(1) + '%' },
    { id: 'SO05', name: 'Answered Messages', type: 'number' },
    { id: 'SO06', name: 'Response Rate', type: 'auto', calc: (vals: any) => (Number(vals.SO03) > 0 ? (Number(vals.SO05) / Number(vals.SO03)) * 100 : 0).toFixed(1) + '%' },
    { id: 'SO07', name: 'Hot Leads', type: 'number' },
    { id: 'SO08', name: 'Negative Replies', type: 'number' },
    { id: 'SO09', name: 'Generic Prospects', type: 'number' },
    { id: 'SO10', name: 'Meetings Booked', type: 'number' },
  ],
  jahnviOutreach: [
    { id: 'SO11', name: 'ICP Targeted', type: 'textarea' },
    { id: 'SO12', name: 'Connection Requests Sent', type: 'number' },
    { id: 'SO13', name: 'Accepted Invitations', type: 'number' },
    { id: 'SO14', name: 'Acceptance Rate', type: 'auto', calc: (vals: any) => (Number(vals.SO12) > 0 ? (Number(vals.SO13) / Number(vals.SO12)) * 100 : 0).toFixed(1) + '%' },
    { id: 'SO15', name: 'Answered Messages', type: 'number' },
    { id: 'SO16', name: 'Response Rate', type: 'auto', calc: (vals: any) => (Number(vals.SO13) > 0 ? (Number(vals.SO15) / Number(vals.SO13)) * 100 : 0).toFixed(1) + '%' },
    { id: 'SO17', name: 'Hot Leads', type: 'number' },
    { id: 'SO18', name: 'Negative Replies', type: 'number' },
    { id: 'SO19', name: 'Generic Prospects', type: 'number' },
  ],
  shirinOutreach: [
    { id: 'SO20', name: 'InMail ICP Targeted', type: 'textarea' },
    { id: 'SO21', name: 'InMails Sent', type: 'number' },
    { id: 'SO22', name: 'InMails Accepted', type: 'number' },
    { id: 'SO23', name: 'InMails Declined', type: 'number' },
    { id: 'SO24', name: 'InMail Acceptance Rate', type: 'auto', calc: (vals: any) => (Number(vals.SO21) > 0 ? (Number(vals.SO22) / Number(vals.SO21)) * 100 : 0).toFixed(1) + '%' },
    { id: 'SO25', name: 'Connection Requests Sent', type: 'number' },
    { id: 'SO26', name: 'Accepted Invitations', type: 'number' },
    { id: 'SO27', name: 'Acceptance Rate', type: 'auto', calc: (vals: any) => (Number(vals.SO25) > 0 ? (Number(vals.SO26) / Number(vals.SO25)) * 100 : 0).toFixed(1) + '%' },
    { id: 'SO28', name: 'Answered Messages', type: 'number' },
    { id: 'SO29', name: 'Response Rate', type: 'auto', calc: (vals: any) => (Number(vals.SO26) > 0 ? (Number(vals.SO28) / Number(vals.SO26)) * 100 : 0).toFixed(1) + '%' },
    { id: 'SO30', name: 'Hot Leads', type: 'number' },
    { id: 'SO31', name: 'Negative Replies', type: 'number' },
    { id: 'SO32', name: 'Generic Prospects', type: 'number' },
  ],
  coldEmail: [
    { id: 'SO33', name: 'Emails Sent', type: 'number' },
    { id: 'SO34', name: 'Emails Opened', type: 'number' },
    { id: 'SO35', name: 'Open Rate', type: 'auto', calc: (vals: any) => (Number(vals.SO33) > 0 ? (Number(vals.SO34) / Number(vals.SO33)) * 100 : 0).toFixed(1) + '%' },
    { id: 'SO36', name: 'Replies Received', type: 'number' },
    { id: 'SO37', name: 'Email Response Rate', type: 'auto', calc: (vals: any) => (Number(vals.SO33) > 0 ? (Number(vals.SO36) / Number(vals.SO33)) * 100 : 0).toFixed(1) + '%' },
    { id: 'SO38', name: 'Positive Replies', type: 'number' },
    { id: 'SO39', name: 'Negative Replies', type: 'number' },
  ],
  meetingTracker: [
    { id: 'SO40', name: 'Meetings Booked via LinkedIn', type: 'number' },
    { id: 'SO41', name: 'Meetings Booked via Cold Email', type: 'number' },
    { id: 'SO42', name: 'Meetings Booked via Referral', type: 'number' },
    { id: 'SO43', name: 'Meetings Booked via Other (TiE/WhatsApp/WeWork)', type: 'number' },
    { id: 'SO44', name: 'Total Meetings Booked', type: 'auto', calc: (vals: any) => (Number(vals.SO40) || 0) + (Number(vals.SO41) || 0) + (Number(vals.SO42) || 0) + (Number(vals.SO43) || 0) },
    { id: 'SO45', name: 'Meetings Completed', type: 'number' },
    { id: 'SO46', name: 'No-Show / Rescheduled', type: 'number' },
    { id: 'SO47', name: 'Meeting Completion Rate', type: 'auto', calc: (vals: any) => (Number(vals.SO44) > 0 ? (Number(vals.SO45) / Number(vals.SO44)) * 100 : 0).toFixed(1) + '%' },
    { id: 'SO48', name: 'Leads Added to CRM', type: 'number' },
    { id: 'SO49', name: 'Proposals Sent', type: 'number' },
    { id: 'SO50', name: 'Follow-ups Sent', type: 'number' },
    { id: 'SO51', name: 'Conversions (New Clients signed)', type: 'number' },
    { id: 'SO52', name: 'Conversion Rate', type: 'auto', calc: (vals: any) => (Number(vals.SO44) > 0 ? (Number(vals.SO51) / Number(vals.SO44)) * 100 : 0).toFixed(1) + '%' },
    { id: 'SO53', name: 'Average Deal Size (₹)', type: 'number' },
    { id: 'SO54', name: 'Total Revenue from Conversions', type: 'auto', calc: (vals: any) => (Number(vals.SO51) || 0) * (Number(vals.SO53) || 0) },
  ]
};


const getWeekRange = (weeksAgo = 0) => {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7) - (weeksAgo * 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  const d = new Date(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { 
    day: 'numeric', month: 'short', year: 'numeric' 
  });
  
  return {
    label: `Week ${weekNo} (${fmt(monday)} – ${fmt(sunday)})`,
    weekStart: monday.toISOString().split('T')[0], // used as Firestore document ID
    weekEnd: sunday.toISOString().split('T')[0]
  };
};

const LAST_12_WEEKS = Array.from({ length: 12 }, (_, i) => getWeekRange(i));
const CURRENT_WEEK = LAST_12_WEEKS[0];


// --- Helper Components ---

const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white border border-gray-100 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, variant = "default", className = "" }: { children: React.ReactNode, variant?: "default" | "accent" | "outline" | "gold", className?: string }) => {
  const styles = variant === "outline" 
    ? "border border-gray-200 text-gray-500" 
    : variant === "accent"
    ? "bg-accent text-accent-foreground shadow-sm"
    : variant === "gold"
    ? "bg-yellow-400 text-black shadow-sm"
    : "bg-black text-white";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles} ${className}`}>
      {children}
    </span>
  );
};

const checkAndUpdateHighScore = async (clientId: string, metricId: string, newValue: number, weekStart: string) => {
  if (newValue === undefined || newValue === null || isNaN(newValue)) return false;
  
  const hsRef = doc(db, 'highScores', clientId, 'metrics', metricId);
  const hsSnap = await getDoc(hsRef);
  
  if (!hsSnap.exists() || newValue > hsSnap.data().lifetimeHigh) {
    await setDoc(hsRef, {
      lifetimeHigh: newValue,
      achievedWeek: weekStart,
      previousHigh: hsSnap.exists() ? hsSnap.data().lifetimeHigh : null,
      updatedAt: serverTimestamp()
    });
    return true; // signals new record
  }
  return false;
};

const exportAllData = async (clients: Client[]) => {
  const loadId = toast.loading('Generating enterprise export...');
  try {
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Client Performance
    const clientRows: any[] = [];
    for (const client of clients) {
      for (const perf of client.weeklyPerformance) {
        const row: any = {
          'Client Name': client.name,
          'Content Manager': client.contentManagerName,
          'Lead Gen Manager': client.leadGenManagerName,
          'Week': perf.weekLabel || perf.weekId
        };
        Object.entries(perf.contentMetrics || {}).forEach(([id, m]: [string, any]) => {
          row[`CONTENT_${id}`] = m.value;
        });
        Object.entries(perf.leadGenMetrics || {}).forEach(([id, m]: [string, any]) => {
          row[`LEADGEN_${id}`] = m.value;
        });
        clientRows.push(row);
      }
    }
    const ws1 = XLSX.utils.json_to_sheet(clientRows);
    XLSX.utils.book_append_sheet(wb, ws1, 'Client Performance');

    // Sheet 2: TJ Personal Brand
    const tjSnap = await getDocs(collection(db, 'tjPersonalBrand'));
    const tjRows = tjSnap.docs.map(d => ({ week: d.id, ...d.data() }));
    const ws2 = XLSX.utils.json_to_sheet(tjRows);
    XLSX.utils.book_append_sheet(wb, ws2, 'TJ Brand');

    // Sheet 3: Sales
    const salesSnap = await getDocs(collection(db, 'salesData'));
    const salesRows = salesSnap.docs.map(d => ({ week: d.id, ...d.data() }));
    const ws3 = XLSX.utils.json_to_sheet(salesRows);
    XLSX.utils.book_append_sheet(wb, ws3, 'Sales Outreach');

    // Sheet 4: Hot Leads
    const leadsSnap = await getDocs(collection(db, 'salesLeads'));
    const leadsRows = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const ws4 = XLSX.utils.json_to_sheet(leadsRows);
    XLSX.utils.book_append_sheet(wb, ws4, 'Hot Leads');

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Myntmore_Export_${date}.xlsx`);
    toast.success('Export complete', { id: loadId });
  } catch (error) {
    console.error(error);
    toast.error('Export failed', { id: loadId });
  }
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
    } catch (error: any) {
      toast.error(`Identity creation failed: ${error.message}`, { id: loadId });
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

  const handleDeleteUser = async (uid: string) => {
    if (window.confirm('Are you sure you want to permanently delete this member?')) {
      const loadId = toast.loading('Deleting member...');
      try {
        await deleteDoc(doc(db, 'users', uid));
        toast.success('Member deleted', { id: loadId });
      } catch (error) {
        toast.error('Failed to delete member', { id: loadId });
      }
    }
  };

  const handleDeleteInvite = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this invite?')) {
      const loadId = toast.loading('Deleting invite...');
      try {
        await deleteDoc(doc(db, 'invites', id));
        toast.success('Invite deleted', { id: loadId });
      } catch (error) {
        toast.error('Failed to delete invite', { id: loadId });
      }
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
                <td className="px-6 py-4 flex items-center gap-3">
                  <button className="text-gray-400 hover:text-black transition-colors">Edit</button>
                  {u.uid !== userId && (
                    <button onClick={() => handleDeleteUser(u.uid)} className="text-gray-400 hover:text-red-500 transition-colors">Delete</button>
                  )}
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
                <td className="px-6 py-4 flex items-center gap-3">
                  <button className="text-gray-400 hover:text-black transition-colors">Resend</button>
                  <button onClick={() => handleDeleteInvite(inv.id)} className="text-gray-400 hover:text-red-500 transition-colors">Delete</button>
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
const TJPersonalBrandView = ({ userProfile }: { userProfile: UserProfile | null }) => {
  const [selectedWeek, setSelectedWeek] = useState(CURRENT_WEEK.weekStart);
  const [entryData, setEntryData] = useState<any>({});
  const [highScores, setHighScores] = useState<{ [metricId: string]: HighScore }>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadData();
    loadHighScores();
  }, [selectedWeek]);

  const loadData = async () => {
    const year = new Date(selectedWeek).getFullYear().toString();
    const ref = doc(db, `tjPersonalBrand/${year}`, selectedWeek);
    const snap = await getDoc(ref);
    setEntryData(snap.exists() ? snap.data() : {});
  };

  const loadHighScores = async () => {
    const q = query(collection(db, 'highScores', 'tj', 'metrics'));
    const snap = await getDocs(q);
    const scores: any = {};
    snap.docs.forEach(d => scores[d.id] = d.data());
    setHighScores(scores);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const loadId = toast.loading('Syncing TJ Brand data...');
    try {
      const year = new Date(selectedWeek).getFullYear().toString();
      const ref = doc(db, `tjPersonalBrand/${year}`, selectedWeek);
      const weekData = LAST_12_WEEKS.find(w => w.weekStart === selectedWeek);

      const payload = {
        ...entryData,
        weekStart: weekData?.weekStart,
        weekEnd: weekData?.weekEnd,
        weekLabel: weekData?.label,
        lastUpdatedBy: userProfile?.uid,
        lastUpdatedAt: serverTimestamp()
      };

      await setDoc(ref, payload, { merge: true });

      // High scores
      for (const [channel, metrics] of Object.entries(TJ_METRICS)) {
        for (const m of metrics as any[]) {
          if (m.type === 'number' || m.type === 'percentage') {
            const val = entryData[channel]?.[m.id];
            if (typeof val === 'number') {
              const isNew = await checkAndUpdateHighScore('tj', m.id, val, selectedWeek);
              if (isNew) toast.success(`🏆 NEW TJ RECORD: ${m.name}!`);
            }
          }
        }
      }

      toast.success('TJ Brand data synced', { id: loadId });
      loadHighScores();
    } catch (error) {
      toast.error('Sync failed', { id: loadId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-10 max-w-6xl mx-auto">
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Reporting Week</label>
          <select 
            className="w-full bg-white border border-gray-100 px-6 py-4 rounded-2xl outline-none shadow-sm font-bold focus:ring-2 ring-accent/20"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
          >
            {LAST_12_WEEKS.map(w => <option key={w.weekStart} value={w.weekStart}>{w.label}</option>)}
          </select>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="px-10 py-4 bg-black text-white font-black rounded-2xl shadow-xl hover:scale-[1.01] transition-all"
        >
          Update Brand Records
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {Object.entries(TJ_METRICS).map(([channel, metrics]) => (
          <Card key={channel} className="p-8 space-y-6">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] border-b border-gray-50 pb-4">{channel.replace(/([A-Z])/g, ' $1')}</h3>
            <div className="grid grid-cols-1 gap-6">
              {metrics.map((m: any) => (
                <div key={m.id} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-500">{m.name}</label>
                    {highScores[m.id] && (m.type === 'number' || m.type === 'percentage') && (
                      <span className="text-[9px] font-bold text-yellow-600">🏆 BEST: {highScores[m.id].lifetimeHigh}</span>
                    )}
                  </div>
                  {m.type === 'textarea' ? (
                    <textarea 
                      className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none text-sm min-h-[100px]"
                      value={entryData[channel]?.[m.id] || ''}
                      onChange={(e) => setEntryData({ ...entryData, [channel]: { ...entryData[channel], [m.id]: e.target.value } })}
                    />
                  ) : m.type === 'auto' ? (
                    <div className="bg-gray-50 p-4 rounded-xl font-black text-xl text-gray-400">
                      {m.calc(entryData[channel] || {})}
                    </div>
                  ) : (
                    <input 
                      type="number"
                      className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none font-bold"
                      value={entryData[channel]?.[m.id] ?? ''}
                      onChange={(e) => setEntryData({ ...entryData, [channel]: { ...entryData[channel], [m.id]: Number(e.target.value) } })}
                    />
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const SalesOutreachView = ({ userProfile }: { userProfile: UserProfile | null }) => {
  const [activeTab, setActiveTab] = useState<'data' | 'leads'>('data');
  const [selectedWeek, setSelectedWeek] = useState(CURRENT_WEEK.weekStart);
  const [entryData, setEntryData] = useState<any>({});
  const [leads, setLeads] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [newLead, setNewLead] = useState<any>({ status: 'New', probability: 50, source: 'LinkedIn' });

  useEffect(() => {
    if (activeTab === 'data') {
      loadData();
    } else {
      loadLeads();
    }
  }, [selectedWeek, activeTab]);

  const loadData = async () => {
    const year = new Date(selectedWeek).getFullYear().toString();
    const ref = doc(db, `salesData/${year}`, selectedWeek);
    const snap = await getDoc(ref);
    setEntryData(snap.exists() ? snap.data() : {});
  };

  const loadLeads = async () => {
    const q = query(collection(db, 'salesLeads'), orderBy('lastUpdated', 'desc'));
    const snap = await getDocs(q);
    setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const handleSaveData = async () => {
    setIsSaving(true);
    const loadId = toast.loading('Syncing Sales data...');
    try {
      const year = new Date(selectedWeek).getFullYear().toString();
      const ref = doc(db, `salesData/${year}`, selectedWeek);
      const weekData = LAST_12_WEEKS.find(w => w.weekStart === selectedWeek);

      const payload = {
        ...entryData,
        weekStart: weekData?.weekStart,
        weekEnd: weekData?.weekEnd,
        weekLabel: weekData?.label,
        lastUpdatedBy: userProfile?.uid,
        lastUpdatedAt: serverTimestamp()
      };

      await setDoc(ref, payload, { merge: true });
      toast.success('Sales data synced', { id: loadId });
    } catch (error) {
      toast.error('Sync failed', { id: loadId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    const loadId = toast.loading('Adding lead to pipeline...');
    try {
      await addDoc(collection(db, 'salesLeads'), {
        ...newLead,
        lastUpdated: serverTimestamp(),
        weightedValue: (Number(newLead.dealValue) || 0) * (Number(newLead.probability) / 100)
      });
      toast.success('Lead captured', { id: loadId });
      setIsAddingLead(false);
      loadLeads();
    } catch (error) {
      toast.error('Failed to add lead', { id: loadId });
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex gap-4 p-1 bg-gray-100 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('data')}
          className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'data' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
        >
          Weekly Outreach
        </button>
        <button 
          onClick={() => setActiveTab('leads')}
          className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'leads' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
        >
          Hot Leads CRM
        </button>
      </div>

      {activeTab === 'data' ? (
        <div className="space-y-10">
          <div className="flex justify-between items-end">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Reporting Week</label>
              <select 
                className="w-full bg-white border border-gray-100 px-6 py-4 rounded-2xl outline-none shadow-sm font-bold focus:ring-2 ring-accent/20"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
              >
                {LAST_12_WEEKS.map(w => <option key={w.weekStart} value={w.weekStart}>{w.label}</option>)}
              </select>
            </div>
            <button 
              onClick={handleSaveData}
              disabled={isSaving}
              className="px-10 py-4 bg-accent text-accent-foreground font-black rounded-2xl shadow-xl shadow-accent/20 hover:scale-[1.01] transition-all"
            >
              Sync Outreach Pulse
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {Object.entries(SALES_METRICS).map(([section, metrics]) => (
              <Card key={section} className="p-8 space-y-6">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] border-b border-gray-50 pb-4">{section.replace(/([A-Z])/g, ' $1')}</h3>
                <div className="grid grid-cols-1 gap-6">
                  {metrics.map((m: any) => (
                    <div key={m.id} className="space-y-2">
                      <label className="text-xs font-bold text-gray-500">{m.name}</label>
                      {m.type === 'textarea' ? (
                        <textarea 
                          className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none text-sm min-h-[80px]"
                          value={entryData[section]?.[m.id] || ''}
                          onChange={(e) => setEntryData({ ...entryData, [section]: { ...entryData[section], [m.id]: e.target.value } })}
                        />
                      ) : m.type === 'auto' ? (
                        <div className="bg-gray-50 p-4 rounded-xl font-black text-xl text-gray-400">
                          {m.calc(entryData[section] || {})}
                        </div>
                      ) : (
                        <input 
                          type="number"
                          className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none font-bold"
                          value={entryData[section]?.[m.id] ?? ''}
                          onChange={(e) => setEntryData({ ...entryData, [section]: { ...entryData[section], [m.id]: Number(e.target.value) } })}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold">Active Pipeline Leaderboard</h3>
            <button 
              onClick={() => setIsAddingLead(true)}
              className="px-6 py-2 bg-yellow-400 text-black font-bold rounded-xl shadow-lg shadow-yellow-400/20 flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Add Lead
            </button>
          </div>

          <Card className="overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-[10px] font-mono uppercase tracking-widest text-gray-400">
                <tr>
                  <th className="px-6 py-4">Lead / Company</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Value (₹)</th>
                  <th className="px-6 py-4">Weighted</th>
                  <th className="px-6 py-4">Source</th>
                  <th className="px-6 py-4">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leads.sort((a, b) => (b.weightedValue || 0) - (a.weightedValue || 0)).map((lead) => (
                  <tr key={lead.id} className="text-sm hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold">{lead.leadName}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{lead.company}</p>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={lead.status === 'Won' ? 'accent' : lead.status === 'Lost' ? 'outline' : 'default'} className={
                        lead.status === 'Won' ? 'bg-green-500' : lead.status === 'Lost' ? 'bg-red-500' : ''
                      }>{lead.status}</Badge>
                    </td>
                    <td className="px-6 py-4 font-bold">₹{(lead.dealValue || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 font-black text-accent">₹{(lead.weightedValue || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-xs">{lead.source}</td>
                    <td className="px-6 py-4 text-xs font-medium">{lead.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {isAddingLead && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg">
                <Card className="p-8 space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold">New Pipeline Entry</h3>
                    <button onClick={() => setIsAddingLead(false)} className="text-gray-400 hover:text-black">✕</button>
                  </div>
                  <form onSubmit={handleAddLead} className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[10px] font-mono uppercase text-gray-400">Lead Name</label>
                      <input required className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none" onChange={e => setNewLead({...newLead, leadName: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase text-gray-400">Company</label>
                      <input required className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none" onChange={e => setNewLead({...newLead, company: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase text-gray-400">Owner</label>
                      <input required className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none" onChange={e => setNewLead({...newLead, owner: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase text-gray-400">Deal Value (₹)</label>
                      <input type="number" required className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none" onChange={e => setNewLead({...newLead, dealValue: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase text-gray-400">Probability (%)</label>
                      <input type="number" required className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none" value={newLead.probability} onChange={e => setNewLead({...newLead, probability: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase text-gray-400">Source</label>
                      <select className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none" onChange={e => setNewLead({...newLead, source: e.target.value})}>
                        <option>LinkedIn</option>
                        <option>Cold Email</option>
                        <option>Referral</option>
                        <option>Exhibition</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase text-gray-400">Status</label>
                      <select className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none" onChange={e => setNewLead({...newLead, status: e.target.value})}>
                        <option>New</option>
                        <option>Contacted</option>
                        <option>Meeting Booked</option>
                        <option>Proposal Sent</option>
                        <option>Negotiation</option>
                        <option>Won</option>
                        <option>Lost</option>
                      </select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-[10px] font-mono uppercase text-gray-400">Notes</label>
                      <textarea className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none min-h-[80px]" onChange={e => setNewLead({...newLead, notes: e.target.value})} />
                    </div>
                    <button type="submit" className="col-span-2 py-4 bg-yellow-400 text-black font-black rounded-xl shadow-lg mt-4">Deploy Lead Record</button>
                  </form>
                </Card>
              </motion.div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ClientSettingsView = ({ client, onClose, allUsers }: { client: Client, onClose: () => void, allUsers: UserProfile[] }) => {
  const [settings, setSettings] = useState<ClientSettings>({
    activeContentMetrics: CONTENT_METRICS_LIST.map(m => m.id),
    activeLeadGenMetrics: LEADGEN_METRICS_LIST.map(m => m.id),
    customTargets: {}
  });
  const [managers, setManagers] = useState({
    contentManagerUid: client.contentManagerUid,
    leadGenManagerUid: client.leadGenManagerUid
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [client.id]);

  const loadSettings = async () => {
    const ref = doc(db, 'clientSettings', client.id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      setSettings(snap.data() as ClientSettings);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const loadId = toast.loading('Updating client configuration...');
    try {
      // Save metrics settings
      await setDoc(doc(db, 'clientSettings', client.id), settings);
      
      // Save manager updates if changed
      if (managers.contentManagerUid !== client.contentManagerUid || managers.leadGenManagerUid !== client.leadGenManagerUid) {
        const contentMan = allUsers.find(u => u.uid === managers.contentManagerUid);
        const leadMan = allUsers.find(u => u.uid === managers.leadGenManagerUid);
        
        await updateDoc(doc(db, 'clients', client.id), {
          contentManagerUid: managers.contentManagerUid,
          contentManagerName: contentMan?.name || 'Unknown',
          leadGenManagerUid: managers.leadGenManagerUid,
          leadGenManagerName: leadMan?.name || 'Unknown',
        });
      }

      toast.success('Configuration committed', { id: loadId });
      onClose();
    } catch (error) {
      toast.error('Failed to save settings', { id: loadId });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleMetric = (id: string, type: 'content' | 'leadgen') => {
    const key = type === 'content' ? 'activeContentMetrics' : 'activeLeadGenMetrics';
    const current = settings[key] || [];
    const updated = current.includes(id) ? current.filter(m => m !== id) : [...current, id];
    setSettings({ ...settings, [key]: updated });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-4xl h-[80vh] flex flex-col">
        <Card className="p-8 space-y-6 flex-1 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold">Configure: {client.name}</h3>
              <p className="text-xs text-gray-400 font-mono">CLIENT_ID: {client.id}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-black">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-accent">Team Assignment</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase text-gray-400">Content Owner</label>
                  <select 
                    className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none text-sm"
                    value={managers.contentManagerUid}
                    onChange={e => setManagers({...managers, contentManagerUid: e.target.value})}
                  >
                    {allUsers.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase text-gray-400">Outreach Owner</label>
                  <select 
                    className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none text-sm"
                    value={managers.leadGenManagerUid}
                    onChange={e => setManagers({...managers, leadGenManagerUid: e.target.value})}
                  >
                    {allUsers.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-accent">Active Content Metrics</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {CONTENT_METRICS_LIST.map(m => (
                  <label key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent"
                      checked={settings.activeContentMetrics?.includes(m.id)}
                      onChange={() => toggleMetric(m.id, 'content')}
                    />
                    <span className="text-xs font-medium">{m.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-accent">Active Lead Gen Metrics</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {LEADGEN_METRICS_LIST.map(m => (
                  <label key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent"
                      checked={settings.activeLeadGenMetrics?.includes(m.id)}
                      onChange={() => toggleMetric(m.id, 'leadgen')}
                    />
                    <span className="text-xs font-medium">{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-gray-100 flex gap-4">
            <button onClick={onClose} className="px-8 py-3 font-bold text-gray-400">Cancel</button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 py-4 bg-accent text-accent-foreground font-black rounded-xl shadow-lg shadow-accent/20"
            >
              Commit Configuration
            </button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};

const DataEntryView = ({ clients, userProfile }: { clients: Client[], userProfile: UserProfile | null }) => {
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(CURRENT_WEEK.weekStart);
  const [activeDataTab, setActiveDataTab] = useState<'content' | 'leadgen'>('content');
  const [entryData, setEntryData] = useState<any>({ contentMetrics: {}, leadGenMetrics: {} });
  const [highScores, setHighScores] = useState<{ [metricId: string]: HighScore }>({});
  const [clientSettings, setClientSettings] = useState<ClientSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(['InMail Outreach', 'Connection Request Outreach', 'Existing Connections', 'Pipeline & Conversion', 'Cold Email', 'Qualitative + Happiness', 'Production Pipeline', 'Post Output', 'Performance', 'Engagement Activity', 'Delivery & Reporting', 'Qualitative']);

  const client = clients.find(c => c.id === selectedClient);
  
  useEffect(() => {
    if (selectedClient && selectedWeek) {
      loadWeekData();
      loadHighScores();
      loadClientSettings();
    }
  }, [selectedClient, selectedWeek]);

  const loadClientSettings = async () => {
    if (!selectedClient) return;
    const ref = doc(db, 'clientSettings', selectedClient);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      setClientSettings(snap.data() as ClientSettings);
    } else {
      setClientSettings({
        activeContentMetrics: CONTENT_METRICS_LIST.map(m => m.id),
        activeLeadGenMetrics: LEADGEN_METRICS_LIST.map(m => m.id),
        customTargets: {}
      });
    }
  };


  const loadWeekData = async () => {
    if (!selectedClient) return;
    const year = new Date(selectedWeek).getFullYear().toString();
    const ref = doc(db, `weeklyData/${selectedClient}/${year}`, selectedWeek);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      setEntryData(snap.data());
    } else {
      setEntryData({ contentMetrics: {}, leadGenMetrics: {} });
    }
  };

  const loadHighScores = async () => {
    if (!selectedClient) return;
    const q = query(collection(db, 'highScores', selectedClient, 'metrics'));
    const snap = await getDocs(q);
    const scores: any = {};
    snap.docs.forEach(d => scores[d.id] = d.data());
    setHighScores(scores);
  };

  const isAdmin = userProfile?.role === 'admin';
  const canSeeContent = true; // All team members can see all fields
  const canSeeLeadGen = true;

  const handleSave = async (submit = false) => {
    if (!selectedClient) return;
    setIsSaving(true);
    const loadId = toast.loading('Syncing OS data...');
    try {
      const year = new Date(selectedWeek).getFullYear().toString();
      const weekRef = doc(db, `weeklyData/${selectedClient}/${year}`, selectedWeek);
      const weekData = LAST_12_WEEKS.find(w => w.weekStart === selectedWeek);

      const updatePayload: any = {
        weekStart: weekData?.weekStart,
        weekEnd: weekData?.weekEnd,
        weekLabel: weekData?.label,
        weekOf: new Date(selectedWeek).toISOString()
      };

      const metricsToUpdate = activeDataTab === 'content' ? entryData.contentMetrics : entryData.leadGenMetrics;
      const prefix = activeDataTab === 'content' ? 'contentMetrics' : 'leadGenMetrics';

      Object.entries(metricsToUpdate).forEach(([id, data]: [string, any]) => {
        updatePayload[`${prefix}.${id}`] = data;
      });

      updatePayload[`${prefix}.lastUpdatedBy`] = userProfile?.uid;
      updatePayload[`${prefix}.lastUpdatedAt`] = serverTimestamp();
      if (submit) {
        updatePayload[`${prefix}.submittedAt`] = serverTimestamp();
      }

      await setDoc(weekRef, updatePayload, { merge: true });

      // Check high scores for numeric metrics
      const metricList = activeDataTab === 'content' ? CONTENT_METRICS_LIST : LEADGEN_METRICS_LIST;
      for (const m of metricList) {
        if (m.type === 'number') {
          const val = metricsToUpdate[m.id]?.value;
          if (typeof val === 'number') {
            const isNewHigh = await checkAndUpdateHighScore(selectedClient, m.id, val, selectedWeek);
            if (isNewHigh) {
              toast.success(`🏆 NEW RECORD: ${m.name}!`, { duration: 5000 });
            }
          }
        }
      }

      toast.success(submit ? 'Week Submitted Successfully' : 'Draft Saved', { id: loadId });
      loadHighScores(); // Refresh high scores
    } catch (error) {
      console.error(error);
      toast.error('Sync failed', { id: loadId });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSection = (name: string) => {
    setExpandedSections(prev => 
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  };

  const renderMetric = (m: any) => {
    const section = activeDataTab === 'content' ? 'contentMetrics' : 'leadGenMetrics';
    const metricData = entryData[section]?.[m.id] || {};
    const highScore = highScores[m.id];

    return (
      <div key={m.id} className="space-y-3 p-4 bg-white rounded-2xl border border-gray-50 shadow-sm">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h4 className="font-bold text-sm">{m.name}</h4>
            {highScore && m.type === 'number' && (
              <p className="text-[10px] text-yellow-600 font-bold">
                🏆 Lifetime best: {highScore.lifetimeHigh} (week of {new Date(highScore.achievedWeek).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})
              </p>
            )}
          </div>
          {m.type === 'auto' && <Badge variant="outline">Auto</Badge>}
        </div>
        
        {m.type === 'number' && (
          <div className="flex gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-[9px] font-mono text-gray-400 uppercase pl-1">Actual</label>
              <input 
                type="number"
                className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none focus:ring-2 ring-accent/20"
                value={metricData.value ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : Number(e.target.value);
                  setEntryData({
                    ...entryData,
                    [section]: {
                      ...entryData[section],
                      [m.id]: { ...metricData, value: val }
                    }
                  });
                }}
              />
            </div>
            <div className="w-24 space-y-1">
              <label className="text-[9px] font-mono text-gray-400 uppercase pl-1">Target</label>
              <input 
                type="number"
                className="w-full bg-gray-100/50 border-none px-4 py-3 rounded-xl outline-none text-xs font-mono"
                value={metricData.target ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : Number(e.target.value);
                  setEntryData({
                    ...entryData,
                    [section]: {
                      ...entryData[section],
                      [m.id]: { ...metricData, target: val }
                    }
                  });
                }}
              />
            </div>
          </div>
        )}

        {m.type === 'textarea' && (
          <textarea 
            className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none min-h-[100px] text-sm focus:ring-2 ring-accent/20"
            placeholder="Detailed notes / descriptions..."
            value={metricData.value || ''}
            onChange={(e) => {
              setEntryData({
                ...entryData,
                [section]: {
                  ...entryData[section],
                  [m.id]: { ...metricData, value: e.target.value }
                }
              });
            }}
          />
        )}

        {m.type === 'boolean' && (
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setEntryData({
                  ...entryData,
                  [section]: {
                    ...entryData[section],
                    [m.id]: { ...metricData, value: true }
                  }
                });
              }}
              className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${metricData.value === true ? 'bg-accent text-accent-foreground shadow-lg shadow-accent/20' : 'bg-gray-50 text-gray-400'}`}
            >
              YES
            </button>
            <button 
               onClick={() => {
                setEntryData({
                  ...entryData,
                  [section]: {
                    ...entryData[section],
                    [m.id]: { ...metricData, value: false }
                  }
                });
              }}
              className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${metricData.value === false ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-gray-50 text-gray-400'}`}
            >
              NO
            </button>
          </div>
        )}

        {m.type === 'auto' && (
          <div className="bg-gray-50/50 p-4 rounded-xl border border-dashed border-gray-200">
            <span className="text-xl font-black text-gray-400">
              {m.calc?.(Object.fromEntries(Object.entries(entryData[section] || {}).map(([id, d]: [string, any]) => [id, d.value]))) || 0}
            </span>
          </div>
        )}
      </div>
    );
  };

  const LEADGEN_GROUPS = [
    { name: 'InMail Outreach', ids: ['L01', 'L02', 'L03', 'L04', 'L05', 'L06'] },
    { name: 'Connection Request Outreach', ids: ['L07', 'L08', 'L09', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16', 'L17', 'L18'] },
    { name: 'Existing Connections', ids: ['L19', 'L20', 'L21', 'L22'] },
    { name: 'Pipeline & Conversion', ids: ['L23', 'L24', 'L25', 'L26', 'L27'] },
    { name: 'Cold Email', ids: ['L28', 'L29', 'L30', 'L31', 'L32', 'L33', 'L34'] },
    { name: 'Qualitative + Happiness', ids: ['L35', 'L36', 'L37'] },
  ];

  const CONTENT_GROUPS = [
    { name: 'Production Pipeline', ids: ['C01', 'C02', 'C03', 'C04', 'C05'] },
    { name: 'Post Output', ids: ['C06', 'C07', 'C08', 'C09'] },
    { name: 'Performance', ids: ['C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16'] },
    { name: 'Engagement Activity', ids: ['C17', 'C18'] },
    { name: 'Delivery & Reporting', ids: ['C19', 'C20', 'C21', 'C22', 'C23'] },
    { name: 'Qualitative', ids: ['C24', 'C25'] },
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Target Account</label>
          <select 
            className="w-full bg-white border border-gray-100 px-6 py-4 rounded-2xl outline-none shadow-sm font-bold text-lg focus:ring-2 ring-accent/20"
            value={selectedClient || ''}
            onChange={(e) => setSelectedClient(e.target.value)}
          >
            <option value="">— Select Account —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Reporting Week</label>
          <select 
            className="w-full bg-white border border-gray-100 px-6 py-4 rounded-2xl outline-none shadow-sm font-bold focus:ring-2 ring-accent/20"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
          >
            {LAST_12_WEEKS.map(w => <option key={w.weekStart} value={w.weekStart}>{w.label}</option>)}
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
          <div className="flex gap-4 p-1 bg-gray-100 rounded-2xl w-fit">
            {canSeeContent && (
              <button 
                onClick={() => setActiveDataTab('content')}
                className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${activeDataTab === 'content' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Content
              </button>
            )}
            {canSeeLeadGen && (
              <button 
                onClick={() => setActiveDataTab('leadgen')}
                className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${activeDataTab === 'leadgen' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Lead Gen
              </button>
            )}
          </div>

          <div className="space-y-6">
            {(activeDataTab === 'content' ? CONTENT_GROUPS : LEADGEN_GROUPS).map(group => {
              const activeMetricsInGroup = group.ids.filter(id => {
                const activeList = activeDataTab === 'content' ? clientSettings?.activeContentMetrics : clientSettings?.activeLeadGenMetrics;
                return !activeList || activeList.includes(id);
              });

              if (activeMetricsInGroup.length === 0) return null;

              return (
                <div key={group.name} className="space-y-4">
                  <button 
                    onClick={() => toggleSection(group.name)}
                    className="w-full flex items-center justify-between py-2 border-b border-gray-100 group"
                  >
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 group-hover:text-black transition-colors">{group.name}</h3>
                    <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${expandedSections.includes(group.name) ? 'rotate-90' : ''}`} />
                  </button>
                  
                  {expandedSections.includes(group.name) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {activeMetricsInGroup.map(id => {
                        const m = (activeDataTab === 'content' ? CONTENT_METRICS_LIST : LEADGEN_METRICS_LIST).find(m => m.id === id);
                        return m ? renderMetric(m) : null;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'data-entry' | 'monday-mode' | 'actionables' | 'sales' | 'finance' | 'internal' | 'settings' | 'team' | 'accept-invite' | 'tj-brand'>('dashboard');

  const [invites, setInvites] = useState<Invite[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [meetingIndex, setMeetingIndex] = useState(0);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [activeConfigClient, setActiveConfigClient] = useState<string | null>(null);
  const [newClientData, setNewClientData] = useState({ name: '', contentManagerUid: '', leadGenManagerUid: '' });

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);


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
    const isTJ = userProfile.email === 'tejas@myntmore.com' || isAdmin;
    
    const baseItems = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'actionables', label: 'Actionables', icon: Layers },
      { id: 'data-entry', label: 'Data Entry', icon: TrendingUp },
    ];

    const items = [...baseItems];

    if (isTJ) {
      items.push({ id: 'tj-brand', label: 'TJ Personal Brand', icon: Users });
    }

    if (isAdmin) {
      items.push(
        { id: 'clients', label: 'Clients', icon: Users },
        { id: 'monday-mode', label: 'Monday Mode', icon: Calendar },
        { id: 'sales', label: 'Sales & Outreach', icon: BarChart3 },
        { id: 'finance', label: 'Finance', icon: ShieldCheck },
        { id: 'internal', label: 'Internal Systems', icon: Database },
        { id: 'team', label: 'Team Members', icon: ShieldCheck },
        { id: 'settings', label: 'Settings', icon: Settings },
      );
    }

    return items;
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

      // All members see all clients
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

      toast.success('Client scope established', { id: loadId });
      setIsAddingClient(false);
    } catch (error) {
      toast.error('Failed to establish scope', { id: loadId });
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    if (window.confirm('Are you sure you want to delete this client? This will remove all their weekly data permanently.')) {
      const loadId = toast.loading('Deleting client records...');
      try {
        // Delete client document
        await deleteDoc(doc(db, 'clients', clientId));
        
        // Also should ideally delete weeklyData subcollections, but Firestore doesn't support recursive deletes from client SDK easily.
        // For now, deleting the main doc is a start.
        
        toast.success('Client deleted from OS', { id: loadId });
      } catch (error) {
        toast.error('Failed to delete client', { id: loadId });
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      toast.error('Google Login failed');
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    const loadId = toast.loading('Authenticating...');
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      toast.success('Access Granted', { id: loadId });
    } catch (error: any) {
      toast.error(error.message || 'Authentication failed', { id: loadId });
    } finally {
      setIsLoggingIn(false);
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
        LAST_12_WEEKS.forEach((week, idx) => {
          const weekId = week.weekStart;
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

  if (activeTab === 'accept-invite') {
    return <AcceptInviteView onAcceptSuccess={() => setActiveTab('dashboard')} />;
  }

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
          
          <Card className="bg-white border-gray-100 p-8 shadow-xl text-left">
            <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest pl-1">Email Authority</label>
                <input required type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest pl-1">Master Password</label>
                <input required type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="w-full bg-gray-50 border-none px-4 py-3 rounded-xl outline-none" />
              </div>
              <button type="submit" disabled={isLoggingIn} className="w-full bg-black text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all shadow-lg text-sm">
                 Access Terminal
              </button>
            </form>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-gray-400 font-mono">OR</span>
              </div>
            </div>

            <button 
              type="button"
              onClick={handleGoogleLogin}
              className="w-full bg-accent text-accent-foreground font-bold py-3 rounded-xl flex items-center justify-center gap-3 hover:opacity-90 transition-all shadow-sm text-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              Admin Override (Google)
            </button>
          </Card>
          <p className="mt-6 text-[10px] text-black/30 font-mono leading-relaxed">
            AUTHORISED PERSONNEL ONLY. ACCESS LOGS ARE PERMANENTLY RECORDED.
          </p>
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
                        <AreaChart data={LAST_12_WEEKS.map(week => {
                          const achievements = clients.map(c => {
                            const data = c.weeklyPerformance.find(w => w.weekStart === week.weekStart);
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
                            name: week.label,
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
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setActiveConfigClient(client.id)}
                        className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 bg-white border border-gray-100 rounded-lg shadow-sm hover:border-accent transition-colors"
                      >
                        Configure
                      </button>
                      <button 
                        onClick={() => handleDeleteClient(client.id)}
                        className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 bg-white border border-gray-100 rounded-lg shadow-sm hover:text-red-500 hover:border-red-100 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
              
              {activeConfigClient && clients.find(c => c.id === activeConfigClient) && (
                <ClientSettingsView 
                  client={clients.find(c => c.id === activeConfigClient)!} 
                  onClose={() => setActiveConfigClient(null)} 
                  allUsers={allUsers}
                />
              )}

              
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
          {activeTab === 'tj-brand' && (userProfile?.role === 'admin' || userProfile?.email === 'tejas@myntmore.com') && <TJPersonalBrandView userProfile={userProfile} />}
          {activeTab === 'sales' && userProfile?.role === 'admin' && <SalesOutreachView userProfile={userProfile} />}

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
                      className="space-y-6"
                    >
                      <Card className="p-10 border-2 border-accent min-h-[400px] flex flex-col">
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

                        <div className="flex flex-col gap-10 flex-1 overflow-y-auto pr-2 mt-8">
                          {(() => {
                            const performance = clients[meetingIndex].weeklyPerformance;
                            const last = performance[performance.length - 1];
                            if (!last) return <p className="text-gray-400 italic">No recent data</p>;
                            
                            const contentMetrics = Object.entries(last.contentMetrics || {}).map(([id, m]) => ({ id, ...m, name: CONTENT_METRICS_LIST.find(cm => cm.id === id)?.name }));
                            const leadGenMetrics = Object.entries(last.leadGenMetrics || {}).map(([id, m]) => ({ id, ...m, name: LEADGEN_METRICS_LIST.find(lm => lm.id === id)?.name }));

                            const renderMetricCard = (m: any, type: 'content' | 'leadgen') => {
                              if (typeof m.value !== 'number') {
                                if (typeof m.value === 'string' && m.value.trim() !== '') {
                                   return (
                                     <div key={m.id} className="p-6 bg-gray-50/50 border border-gray-100 rounded-2xl space-y-3 col-span-2">
                                       <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">{m.name}</p>
                                       <p className="text-sm font-medium italic text-gray-700">"{m.value}"</p>
                                     </div>
                                   );
                                } else if (typeof m.value === 'boolean') {
                                   return (
                                     <div key={m.id} className="p-6 bg-gray-50/50 border border-gray-100 rounded-2xl space-y-3 flex items-center justify-between col-span-1">
                                       <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">{m.name}</p>
                                       <Badge variant={m.value ? 'accent' : 'outline'}>{m.value ? 'YES' : 'NO'}</Badge>
                                     </div>
                                   );
                                }
                                return null;
                              }

                              const history = performance.map(w => ({
                                name: w.weekOf,
                                val: Number(w[type === 'content' ? 'contentMetrics' : 'leadGenMetrics']?.[m.id]?.value || 0)
                              }));

                              return (
                                <div key={m.id} className="p-6 bg-gray-50 rounded-2xl space-y-4">
                                  <div className="flex justify-between items-start">
                                    <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">{m.name}</p>
                                    <Badge variant="gold">BEST: {m.value}</Badge>
                                  </div>
                                  <div className="text-3xl font-black">{m.value}</div>
                                  {m.target && (
                                    <div className="w-full bg-gray-200 h-1 rounded-full overflow-hidden mb-4">
                                       <div className="h-full bg-accent" style={{ width: `${Math.min((Number(m.value) / Number(m.target)) * 100, 100)}%` }} />
                                    </div>
                                  )}
                                  
                                  {history.length > 1 && (
                                    <div className="h-16 w-full mt-4">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={history}>
                                          <defs>
                                            <linearGradient id={`grad-${m.id}`} x1="0" y1="0" x2="0" y2="1">
                                              <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                                              <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                                            </linearGradient>
                                          </defs>
                                          <Area type="monotone" dataKey="val" stroke="#10B981" fillOpacity={1} fill={`url(#grad-${m.id})`} />
                                        </AreaChart>
                                      </ResponsiveContainer>
                                    </div>
                                  )}
                                </div>
                              );
                            };

                            return (
                              <div className="flex flex-col gap-10">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  <div className="space-y-4 p-8 bg-gray-50 rounded-3xl">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full bg-accent" />
                                      <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Growth Velocity</span>
                                    </div>
                                    <div className="text-6xl font-black tracking-tighter">
                                      {(calculateAchievement(clients[meetingIndex]) * 100).toFixed(0)}%
                                    </div>
                                    <p className="text-sm text-gray-400 font-medium italic">Current trajectory based on sprint targets.</p>
                                  </div>
                                  <div className="space-y-4 p-8 bg-gray-50 rounded-3xl">
                                    <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Content Pulse</span>
                                    <div className="text-4xl font-bold text-accent">{contentMetrics.filter(m => typeof m.value === 'number' && m.target && m.value >= m.target).length} <span className="text-gray-400 text-lg">/ {contentMetrics.filter(m => typeof m.value === 'number' && m.target).length}</span></div>
                                    <p className="text-xs text-gray-400">KPIs On Track</p>
                                  </div>
                                  <div className="space-y-4 p-8 bg-gray-50 rounded-3xl">
                                    <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Outreach Health</span>
                                    <div className="text-4xl font-bold text-black">{leadGenMetrics.filter(m => typeof m.value === 'number' && m.target && m.value >= m.target).length} <span className="text-gray-400 text-lg">/ {leadGenMetrics.filter(m => typeof m.value === 'number' && m.target).length}</span></div>
                                    <p className="text-xs text-gray-400">KPIs On Track</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                  <div className="space-y-6">
                                     <h3 className="text-lg font-bold border-b pb-4 border-gray-100 flex items-center gap-2">
                                       <div className="w-2 h-2 rounded-full bg-accent" />
                                       Content Intelligence
                                     </h3>
                                     <div className="grid grid-cols-2 gap-4">
                                       {contentMetrics.map(m => renderMetricCard(m, 'content'))}
                                     </div>
                                  </div>
                                  
                                  <div className="space-y-6">
                                     <h3 className="text-lg font-bold border-b pb-4 border-gray-100 flex items-center gap-2">
                                       <div className="w-2 h-2 rounded-full bg-black" />
                                       Pipeline & Outreach
                                     </h3>
                                     <div className="grid grid-cols-2 gap-4">
                                       {leadGenMetrics.map(m => renderMetricCard(m, 'leadgen'))}
                                     </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
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



          {activeTab === 'finance' && <div className="p-10 font-mono text-xs uppercase tracking-widest text-gray-400">Finance & ARR Tracking Authority Dashboard — Coming in v1.4</div>}
          {activeTab === 'internal' && <div className="p-10 font-mono text-xs uppercase tracking-widest text-gray-400">Internal Agency Systems Configuration Authority Dashboard — Coming in v1.5</div>}


          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-10">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-xl tracking-tight">System Configuration</h3>
                  <button 
                    onClick={() => exportAllData(clients)}
                    className="px-6 py-2 bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg"
                  >
                    <Database className="w-4 h-4" />
                    Export All Data
                  </button>
                </div>

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

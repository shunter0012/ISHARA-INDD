import React, { useState, useEffect, useRef } from 'react';
import { User, Post, Reel, AdItem, MediaDiagnosticReport, MediaRepairResult } from '../../types/index';
import { apiRequest } from '../../lib/api';
import { uploadMediaFile } from '../../lib/upload';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { AiAppBuilder } from './ai-agent/AiAppBuilder';
import { 
  ShieldAlert, 
  Users, 
  Film, 
  Trash2, 
  CheckCircle2, 
  RefreshCw, 
  Lock,
  Megaphone,
  PlusCircle,
  ExternalLink,
  Eye,
  MousePointerClick,
  Play,
  AlertTriangle,
  Flag,
  UserX,
  Clock,
  ShieldCheck,
  Check,
  X,
  Loader2,
  Upload,
  BellRing,
  MessageSquareQuote,
  ArrowLeft,
  Bot
} from 'lucide-react';

interface ModerationReport {
  id: string;
  reporterId: string;
  reporter?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
  targetType: 'POST' | 'REEL' | 'USER' | 'post' | 'reel' | 'user' | 'comment';
  targetId: string;
  targetAuthorId?: string;
  reason: string;
  details?: string;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED' | 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
  targetPreview?: {
    authorId?: string;
    title?: string;
    caption?: string;
    mediaUrl?: string;
    mediaType?: string;
    thumbnailUrl?: string;
    username?: string;
  };
  resolvedBy?: string;
  resolvedAt?: string;
  actionTaken?: string;
}

interface AdminConsoleProps {
  onClose?: () => void;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [postsList, setPostsList] = useState<Post[]>([]);
  const [reelsList, setReelsList] = useState<Reel[]>([]);
  const [adsList, setAdsList] = useState<AdItem[]>([]);
  const [reportsList, setReportsList] = useState<ModerationReport[]>([]);
  const [bansList, setBansList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'ads' | 'reports' | 'bans' | 'users' | 'moderation' | 'integrity' | 'ai-builder'>('ads');

  // Media Integrity & Safe Migration Diagnostics State
  const [diagnosticReport, setDiagnosticReport] = useState<MediaDiagnosticReport | null>(null);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [isExecutingRepair, setIsExecutingRepair] = useState(false);
  const [repairResult, setRepairResult] = useState<MediaRepairResult | null>(null);

  // Ad Creation Form State
  const [adTitle, setAdTitle] = useState('');
  const [adSponsorName, setAdSponsorName] = useState('');
  const [adSponsorAvatar, setAdSponsorAvatar] = useState('');
  const [adPlacement, setAdPlacement] = useState<'reels' | 'feed' | 'stories'>('reels');
  const [adMediaType, setAdMediaType] = useState<'video' | 'image'>('video');
  const [adMediaUrl, setAdMediaUrl] = useState('');
  const [adTargetUrl, setAdTargetUrl] = useState('');
  const [adCtaText, setAdCtaText] = useState('Learn More');
  const [adIsActive, setAdIsActive] = useState(true);
  const [adSubmitting, setAdSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const adFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAdMedia, setUploadingAdMedia] = useState(false);

  const handleAdFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAdMedia(true);
    setFormError(null);
    try {
      if (file.type.startsWith('image/')) {
        setAdMediaType('image');
      } else if (file.type.startsWith('video/')) {
        setAdMediaType('video');
      }
      const uploadedUrl = await uploadMediaFile(file);
      setAdMediaUrl(uploadedUrl);
    } catch (err: any) {
      setFormError(err.message || 'Failed to upload ad media file');
    } finally {
      setUploadingAdMedia(false);
      if (adFileInputRef.current) {
        adFileInputRef.current.value = '';
      }
    }
  };

  // Ban Modal State
  const [banModalTarget, setBanModalTarget] = useState<{ id: string; name: string; username: string } | null>(null);
  const [banReason, setBanReason] = useState('Violation of community standards');
  const [banDurationHours, setBanDurationHours] = useState(24);
  const [banIsPermanent, setBanIsPermanent] = useState(false);
  const [submittingBan, setSubmittingBan] = useState(false);

  // Moderation Review & Warning State
  const [inspectingReport, setInspectingReport] = useState<ModerationReport | null>(null);
  const [warningModalReport, setWarningModalReport] = useState<ModerationReport | null>(null);
  const [warningMessage, setWarningMessage] = useState('');
  const [isSubmittingWarning, setIsSubmittingWarning] = useState(false);
  const [deleteReportConfirm, setDeleteReportConfirm] = useState<ModerationReport | null>(null);
  const [isDeletingReportContent, setIsDeletingReportContent] = useState(false);
  const [liveReportToast, setLiveReportToast] = useState<string | null>(null);

  // In-app Action Confirmation State
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, postsRes, reelsRes, adsRes, reportsRes, bansRes] = await Promise.all([
        apiRequest<{ stats: any }>('/admin/stats').catch(() => ({ stats: null })),
        apiRequest<{ users: User[] }>('/users/all').catch(() => ({ users: [] })),
        apiRequest<{ posts: Post[] }>('/posts').catch(() => ({ posts: [] })),
        apiRequest<{ reels: Reel[] }>('/reels').catch(() => ({ reels: [] })),
        apiRequest<{ ads: AdItem[] }>('/ads?all=true').catch(() => ({ ads: [] })),
        apiRequest<{ reports: ModerationReport[] }>('/admin/reports').catch(() => ({ reports: [] })),
        apiRequest<{ bans: User[] }>('/admin/bans').catch(() => ({ bans: [] }))
      ]);

      if (statsRes.stats) setStats(statsRes.stats);
      setUsersList(usersRes.users || []);
      setPostsList(postsRes.posts || []);
      setReelsList(reelsRes.reels || []);
      setAdsList(adsRes.ads || []);
      setReportsList(reportsRes.reports || []);
      setBansList(bansRes.bans || []);
    } catch (err) {
      console.warn('Failed to fetch admin data', err);
    } finally {
      setLoading(false);
    }
  };

  const { subscribe } = useRealtime();

  useEffect(() => {
    fetchAdminData();
  }, []);

  // Real-time admin notification for incoming user reports
  useEffect(() => {
    const unsubNew = subscribe('NEW_REPORT', (event) => {
      fetchAdminData();
      const reporterUsername = event.report?.reporter?.username || 'user';
      const targetType = (event.report?.targetType || 'content').toLowerCase();
      setLiveReportToast(`New ${targetType} reported by @${reporterUsername}: "${event.report?.reason || 'Policy violation'}"`);
      setTimeout(() => setLiveReportToast(null), 6000);
    });

    const unsubUpdate = subscribe('REPORT_UPDATED', () => {
      fetchAdminData();
    });

    return () => {
      unsubNew();
      unsubUpdate();
    };
  }, [subscribe]);

  const handleToggleVerified = async (targetUser: User) => {
    try {
      const nextVerified = !targetUser.verified;
      await apiRequest(`/admin/users/${targetUser.id}/verify`, {
        method: 'POST',
        body: JSON.stringify({ verified: nextVerified, userId: targetUser.id })
      });
      setUsersList(prev => prev.map(u => u.id === targetUser.id ? { ...u, verified: nextVerified } : u));
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    }
  };

  const handleResolveReport = async (
    reportId: string, 
    action: 'DISMISS' | 'DELETE_CONTENT' | 'WARN_USER' | 'BAN_USER'
  ) => {
    try {
      await apiRequest(`/admin/reports/${reportId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action, notes: `Resolved by ${user?.displayName || 'Admin'}` })
      });
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to resolve report');
    }
  };

  // Dedicated moderation handlers
  const handleOpenWarning = (report: ModerationReport) => {
    setWarningModalReport(report);
    const targetAuthor = report.targetPreview?.username ? `@${report.targetPreview.username}` : 'User';
    setWarningMessage(
      `Official Warning from ISHARA Moderation: Your ${report.targetType.toLowerCase()} was flagged and reviewed for "${report.reason}". This violates our community standards. Please adhere to guidelines. Repeated infractions will lead to account restrictions or permanent ban.`
    );
  };

  const handleExecuteWarning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warningModalReport) return;

    setIsSubmittingWarning(true);
    try {
      await apiRequest(`/admin/reports/${warningModalReport.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'WARN_USER',
          warningMessage: warningMessage.trim(),
          notes: `Warned by ${user?.displayName || 'Admin'}`
        })
      });
      setWarningModalReport(null);
      if (inspectingReport?.id === warningModalReport.id) {
        setInspectingReport(null);
      }
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to issue warning to user');
    } finally {
      setIsSubmittingWarning(false);
    }
  };

  const handleExecuteDeleteReportContent = async (report: ModerationReport) => {
    setIsDeletingReportContent(true);
    try {
      await apiRequest(`/admin/reports/${report.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'DELETE_CONTENT',
          notes: `Content permanently deleted by admin (${user?.displayName || 'Admin'}) for community guidelines breach.`
        })
      });
      setDeleteReportConfirm(null);
      if (inspectingReport?.id === report.id) {
        setInspectingReport(null);
      }
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete reported content');
    } finally {
      setIsDeletingReportContent(false);
    }
  };

  const handleExecuteBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banModalTarget) return;

    setSubmittingBan(true);
    try {
      await apiRequest(`/admin/users/${banModalTarget.id}/ban`, {
        method: 'POST',
        body: JSON.stringify({
          reason: banReason.trim() || 'Violation of community guidelines',
          durationHours: banIsPermanent ? undefined : banDurationHours,
          isPermanent: banIsPermanent,
          banType: banIsPermanent ? 'permanent' : 'temporary'
        })
      });
      setBanModalTarget(null);
      setBanReason('');
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to ban user');
    } finally {
      setSubmittingBan(false);
    }
  };

  const handleUnbanUser = (targetUserId: string) => {
    setAdminActionError(null);
    setConfirmAction({
      title: 'Lift Ban',
      message: 'Are you sure you want to lift the ban on this user?',
      confirmLabel: 'Unban User',
      onConfirm: async () => {
        await apiRequest(`/admin/users/${targetUserId}/unban`, {
          method: 'POST'
        });
        fetchAdminData();
      }
    });
  };

  const handleDeletePost = (postId: string) => {
    setAdminActionError(null);
    setConfirmAction({
      title: 'Delete Post',
      message: 'Are you sure you want to permanently delete this post as an Administrator?',
      confirmLabel: 'Delete Post',
      onConfirm: async () => {
        await apiRequest(`/posts/${postId}`, { method: 'DELETE' });
        fetchAdminData();
      }
    });
  };

  const handleDeleteReel = (reelId: string) => {
    setAdminActionError(null);
    setConfirmAction({
      title: 'Delete Reel',
      message: 'Are you sure you want to permanently delete this reel as an Administrator?',
      confirmLabel: 'Delete Reel',
      onConfirm: async () => {
        await apiRequest(`/reels/${reelId}`, { method: 'DELETE' });
        fetchAdminData();
      }
    });
  };

  // Safe Diagnostic & Repair Handlers
  const runDiagnosticReport = async () => {
    setIsRunningDiagnostic(true);
    setDiagnosticError(null);
    try {
      const res = await apiRequest<{ report: MediaDiagnosticReport }>('/admin/media/diagnostic');
      if (res.report) {
        setDiagnosticReport(res.report);
      }
    } catch (err: any) {
      setDiagnosticError(err.message || 'Failed to generate diagnostic report');
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  const executeMediaRepair = async () => {
    setIsExecutingRepair(true);
    setDiagnosticError(null);
    try {
      const res = await apiRequest<{ result: MediaRepairResult }>('/admin/media/repair', {
        method: 'POST'
      });
      if (res.result) {
        setRepairResult(res.result);
        // Refresh diagnostic report and feeds
        await runDiagnosticReport();
        fetchAdminData();
      }
    } catch (err: any) {
      setDiagnosticError(err.message || 'Failed to execute media repair');
    } finally {
      setIsExecutingRepair(false);
    }
  };

  // Ad Management Handlers
  const handleToggleAdStatus = async (adId: string) => {
    try {
      await apiRequest(`/ads/${adId}/toggle`, { method: 'PATCH' });
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle ad status');
    }
  };

  const handleDeleteAd = (adId: string) => {
    setAdminActionError(null);
    setConfirmAction({
      title: 'Delete Ad Campaign',
      message: 'Are you sure you want to permanently delete this ad campaign?',
      confirmLabel: 'Delete Ad',
      onConfirm: async () => {
        await apiRequest(`/ads/${adId}`, { method: 'DELETE' });
        fetchAdminData();
      }
    });
  };

  const handleCreateAd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!adTitle.trim() || !adSponsorName.trim() || !adMediaUrl.trim() || !adTargetUrl.trim()) {
      setFormError('Please fill out all required fields marked with *');
      return;
    }

    setAdSubmitting(true);
    try {
      const avatar = adSponsorAvatar.trim() || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(adSponsorName)}`;
      const payload = {
        title: adTitle.trim(),
        sponsorName: adSponsorName.trim(),
        sponsorAvatar: avatar,
        sponsorAvatarUrl: avatar,
        placement: adPlacement,
        mediaType: adMediaType,
        mediaUrl: adMediaUrl.trim(),
        targetUrl: adTargetUrl.trim(),
        ctaText: adCtaText.trim() || 'Learn More',
        isActive: adIsActive
      };

      const res = await apiRequest<{ ad: AdItem }>('/ads', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.ad) {
        setFormSuccess(`Ad campaign "${res.ad.title}" published successfully to ${res.ad.placement.toUpperCase()} feed!`);
        setAdTitle('');
        setAdSponsorName('');
        setAdSponsorAvatar('');
        setAdMediaUrl('');
        setAdTargetUrl('');
        fetchAdminData();
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to publish ad campaign');
    } finally {
      setAdSubmitting(false);
    }
  };

  const isOwnerAdmin = Boolean(
    user && (
      user.role === 'OWNER_ADMIN' || 
      user.role === 'ADMIN' ||
      user.username?.toLowerCase() === 'shuv' || 
      user.id === 'user-shuv'
    )
  );

  if (!isOwnerAdmin) {
    return (
      <div className="text-center py-24 text-xs text-red-600 space-y-2">
        <Lock className="w-8 h-8 text-red-600 mx-auto" />
        <p className="font-bold text-sm">Access Denied</p>
        <p>Administrator privileges (SHUV OWNER_ADMIN) are required to access the moderation console.</p>
      </div>
    );
  }

  const isReportPending = (status?: string) => status?.toLowerCase() === 'pending';
  const pendingReportsCount = reportsList.filter(r => isReportPending(r.status)).length;

  return (
    <div className="w-full max-w-4xl mx-auto pb-20 space-y-6 relative">
      {/* Live Toast Notification for incoming user report */}
      {liveReportToast && (
        <div className="fixed top-20 right-6 z-[110] bg-amber-500 text-white px-4 py-3 rounded-2xl shadow-xl border border-amber-400 flex items-center space-x-3 animate-bounce">
          <BellRing className="w-5 h-5 shrink-0" />
          <div className="text-xs font-semibold">{liveReportToast}</div>
          <button 
            type="button" 
            onClick={() => setLiveReportToast(null)} 
            className="text-white/80 hover:text-white font-bold ml-2 text-sm cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-red-950 via-zinc-900 to-black text-white p-6 rounded-3xl shadow-lg border border-red-800 flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2 text-red-400 text-xs font-bold uppercase tracking-wider mb-1">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <span>Platform Moderation & Ads Management</span>
          </div>
          <h2 className="text-xl font-extrabold font-['Outfit']">ISHARA Owner Console</h2>
          <p className="text-xs text-red-200 mt-1">
            Server-side moderation, ban enforcement, user reports review, and sponsored shorts campaigns.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {onClose && (
            <button
              id="admin-console-close-btn"
              onClick={onClose}
              className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl shadow-md transition-colors cursor-pointer mr-1"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={fetchAdminData}
            className="p-2.5 bg-red-800 hover:bg-red-700 text-white rounded-2xl shadow-md transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Admin Panel Notification Alert for Pending Reports */}
      {pendingReportsCount > 0 && (
        <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <BellRing className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-200/90 text-amber-900 px-2 py-0.5 rounded-md">
                  Moderation Required
                </span>
                <span className="text-[11px] text-amber-800 font-medium">New User Notification</span>
              </div>
              <p className="text-xs font-bold text-amber-950 mt-0.5">
                {pendingReportsCount} content report{pendingReportsCount > 1 ? 's' : ''} awaiting admin review
              </p>
              <p className="text-[11px] text-amber-800/90">
                You can inspect the flagged content, delete offending posts, or issue an official policy warning.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Review Reports Now</span>
          </button>
        </div>
      )}

      {/* Primary Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-[#EEEEEE] pb-2 overflow-x-auto">
        {user?.role === 'OWNER_ADMIN' && (
          <button
            onClick={() => setActiveTab('ai-builder')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeTab === 'ai-builder'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md'
                : 'text-indigo-600 hover:bg-indigo-50 border border-indigo-200/80 bg-indigo-50/40'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>AI App Builder</span>
            <span className="ml-1 px-1.5 py-0.5 text-[9px] bg-white/20 text-white rounded-full uppercase tracking-wider font-mono">
              Agent
            </span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('ads')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'ads' ? 'bg-[#1A1A1A] text-white shadow-xs' : 'text-[#666666] hover:bg-[#F5F5F5]'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          <span>Ads & Campaigns</span>
          <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full">
            {adsList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'reports' ? 'bg-[#1A1A1A] text-white shadow-xs' : 'text-[#666666] hover:bg-[#F5F5F5]'
          }`}
        >
          <Flag className="w-4 h-4 text-amber-500" />
          <span>User Reports</span>
          {pendingReportsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded-full">
              {pendingReportsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('bans')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'bans' ? 'bg-[#1A1A1A] text-white shadow-xs' : 'text-[#666666] hover:bg-[#F5F5F5]'
          }`}
        >
          <UserX className="w-4 h-4 text-rose-500" />
          <span>Active Bans</span>
          <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-rose-200 text-rose-800 rounded-full">
            {bansList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'users' ? 'bg-[#1A1A1A] text-white shadow-xs' : 'text-[#666666] hover:bg-[#F5F5F5]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Accounts</span>
          <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-zinc-200 text-zinc-800 rounded-full">
            {usersList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('moderation')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'moderation' ? 'bg-[#1A1A1A] text-white shadow-xs' : 'text-[#666666] hover:bg-[#F5F5F5]'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>Content Audit</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('integrity');
            runDiagnosticReport();
          }}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'integrity' ? 'bg-[#1A1A1A] text-white shadow-xs' : 'text-[#666666] hover:bg-[#F5F5F5]'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Storage & Vault Integrity</span>
        </button>
      </div>

      {/* Metric Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-[#EEEEEE] p-4 rounded-2xl shadow-xs">
            <p className="text-[11px] font-bold text-[#8E8E8E] uppercase tracking-wider">Active Campaigns</p>
            <p className="text-xl font-black text-[#1A1A1A] mt-1">{adsList.filter(a => a.isActive).length}</p>
          </div>
          <div className="bg-white border border-[#EEEEEE] p-4 rounded-2xl shadow-xs">
            <p className="text-[11px] font-bold text-[#8E8E8E] uppercase tracking-wider">Pending Reports</p>
            <p className="text-xl font-black text-amber-600 mt-1">{pendingReportsCount}</p>
          </div>
          <div className="bg-white border border-[#EEEEEE] p-4 rounded-2xl shadow-xs">
            <p className="text-[11px] font-bold text-[#8E8E8E] uppercase tracking-wider">Active Bans</p>
            <p className="text-xl font-black text-rose-600 mt-1">{bansList.length}</p>
          </div>
          <div className="bg-white border border-[#EEEEEE] p-4 rounded-2xl shadow-xs">
            <p className="text-[11px] font-bold text-[#8E8E8E] uppercase tracking-wider">Total Users</p>
            <p className="text-xl font-black text-blue-600 mt-1">{usersList.length}</p>
          </div>
        </div>
      )}

      {/* ================= TAB 0: AI APP BUILDER (OWNER_ADMIN ONLY) ================= */}
      {activeTab === 'ai-builder' && user?.role === 'OWNER_ADMIN' && (
        <AiAppBuilder />
      )}

      {/* ================= TAB 1: ADS & CAMPAIGNS ================= */}
      {activeTab === 'ads' && (
        <div className="space-y-6">
          {/* Ad Creation Form */}
          <div className="bg-white border border-[#EEEEEE] rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center space-x-2">
              <PlusCircle className="w-5 h-5 text-red-600" />
              <h3 className="text-sm font-bold text-[#1A1A1A]">Create Sponsored Ad Campaign</h3>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            {formSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateAd} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Campaign Headline *</label>
                  <input
                    type="text"
                    required
                    value={adTitle}
                    onChange={e => setAdTitle(e.target.value)}
                    placeholder="e.g. Upgrade your gear with 20% off"
                    className="w-full px-3.5 py-2 bg-[#FAFAFA] border border-[#EEEEEE] rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Brand / Sponsor Name *</label>
                  <input
                    type="text"
                    required
                    value={adSponsorName}
                    onChange={e => setAdSponsorName(e.target.value)}
                    placeholder="e.g. Nike Running"
                    className="w-full px-3.5 py-2 bg-[#FAFAFA] border border-[#EEEEEE] rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-gray-700">Media URL (Video or Image) *</label>
                    <div className="flex items-center space-x-1.5 text-[10px]">
                      <span className="text-gray-400">Quick:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAdMediaUrl('/uploads/sample-blazes.mp4');
                          setAdMediaType('video');
                          setAdPlacement('reels');
                          if (!adTitle) setAdTitle('Summer Collection 2026');
                          if (!adSponsorName) setAdSponsorName('Nike Motion');
                          if (!adTargetUrl) setAdTargetUrl('https://ishara.social');
                        }}
                        className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-semibold transition-colors"
                      >
                        Reels MP4
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdMediaUrl('https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop&q=80');
                          setAdMediaType('image');
                          setAdPlacement('feed');
                          if (!adTitle) setAdTitle('Limited Sneaker Drop');
                          if (!adSponsorName) setAdSponsorName('SneakerHub');
                          if (!adTargetUrl) setAdTargetUrl('https://ishara.social');
                        }}
                        className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-semibold transition-colors"
                      >
                        Feed Banner
                      </button>
                    </div>
                  </div>
                  <input
                    ref={adFileInputRef}
                    type="file"
                    accept="video/*,image/*"
                    onChange={handleAdFileUpload}
                    className="hidden"
                    id="admin-ad-media-file-input"
                  />
                  <div className="flex gap-2">
                    <input
                      type="url"
                      required
                      value={adMediaUrl}
                      onChange={e => setAdMediaUrl(e.target.value)}
                      placeholder="https://assets.example.com/video.mp4 or YouTube Shorts link"
                      className="flex-1 px-3.5 py-2 bg-[#FAFAFA] border border-[#EEEEEE] rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                    />
                    <button
                      type="button"
                      disabled={uploadingAdMedia}
                      onClick={() => adFileInputRef.current?.click()}
                      className="px-3.5 py-2 bg-zinc-900 hover:bg-black text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer"
                      title="Upload video or image directly from device"
                    >
                      {uploadingAdMedia ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" />
                          <span>Gallery Upload</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Upload MP4 / WebM / Images from device gallery, or paste a video link or YouTube Shorts URL.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Destination Target URL *</label>
                  <input
                    type="url"
                    required
                    value={adTargetUrl}
                    onChange={e => setAdTargetUrl(e.target.value)}
                    placeholder="https://brand.com/special-offer"
                    className="w-full px-3.5 py-2 bg-[#FAFAFA] border border-[#EEEEEE] rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Feed Placement</label>
                  <select
                    value={adPlacement}
                    onChange={e => setAdPlacement(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-[#FAFAFA] border border-[#EEEEEE] rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-black"
                  >
                    <option value="reels">Shorts / Reels Feed (Full-Screen)</option>
                    <option value="feed">Home Feed Grid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Media Format</label>
                  <select
                    value={adMediaType}
                    onChange={e => setAdMediaType(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-[#FAFAFA] border border-[#EEEEEE] rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-black"
                  >
                    <option value="video">Vertical Video (MP4)</option>
                    <option value="image">Image Display</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Button CTA Text</label>
                  <input
                    type="text"
                    value={adCtaText}
                    onChange={e => setAdCtaText(e.target.value)}
                    placeholder="e.g. Shop Now"
                    className="w-full px-3.5 py-2 bg-[#FAFAFA] border border-[#EEEEEE] rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={adSubmitting}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-black hover:bg-zinc-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{adSubmitting ? 'Publishing Campaign...' : 'Publish to Feed'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Active Ads List */}
          <div className="bg-white border border-[#EEEEEE] rounded-3xl p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#1A1A1A]">Live Campaigns & Delivery</h3>
            {adsList.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">No ads published yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#EEEEEE] text-[#8E8E8E]">
                      <th className="pb-3 font-semibold">Campaign</th>
                      <th className="pb-3 font-semibold">Placement</th>
                      <th className="pb-3 font-semibold">Impressions</th>
                      <th className="pb-3 font-semibold">Clicks</th>
                      <th className="pb-3 font-semibold">Status</th>
                      <th className="pb-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5]">
                    {adsList.map(ad => (
                      <tr key={ad.id} className="hover:bg-gray-50/50">
                        <td className="py-3 flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-black shrink-0">
                            {ad.mediaType === 'video' ? (
                              <video src={ad.mediaUrl} className="w-full h-full object-cover" muted />
                            ) : (
                              <img src={ad.mediaUrl} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-[#1A1A1A]">{ad.title}</p>
                            <p className="text-[10px] text-zinc-500">{ad.sponsorName}</p>
                          </div>
                        </td>
                        <td className="py-3 uppercase font-semibold text-[10px] text-gray-500">{ad.placement}</td>
                        <td className="py-3 font-semibold">{ad.impressions || 0}</td>
                        <td className="py-3 font-semibold text-blue-600">{ad.clicks || 0}</td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => handleToggleAdStatus(ad.id)}
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold cursor-pointer ${
                              ad.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                            }`}
                          >
                            {ad.isActive ? 'Active' : 'Paused'}
                          </button>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteAd(ad.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 2: USER REPORTS ================= */}
      {activeTab === 'reports' && (
        <div className="bg-white border border-[#EEEEEE] rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">User Reports Queue</h3>
              <p className="text-xs text-gray-500">Audit content flagged by community members for policy violations.</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 rounded-full border border-amber-200">
              {pendingReportsCount} Pending
            </span>
          </div>

          {reportsList.length === 0 ? (
            <div className="py-12 text-center text-gray-400 space-y-2">
              <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500" />
              <p className="text-xs font-bold text-gray-700">All clear!</p>
              <p className="text-[11px]">No user reports waiting for moderation.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {reportsList.map(report => {
                const pending = isReportPending(report.status);
                const reporterUsername = report.reporter?.username || 'user';
                const authorUsername = report.targetPreview?.username;

                return (
                  <div key={report.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start space-x-3.5 min-w-0 flex-1">
                      <div className={`p-2.5 rounded-2xl text-white shrink-0 ${
                        report.targetType?.toUpperCase() === 'POST' ? 'bg-blue-600' : report.targetType?.toUpperCase() === 'REEL' ? 'bg-purple-600' : 'bg-rose-600'
                      }`}>
                        <Flag className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 px-2 py-0.5 rounded-md text-gray-700">
                            {report.targetType}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(report.createdAt).toLocaleString()}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            pending ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {report.status.toUpperCase()}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            Reported by <span className="font-semibold text-gray-800">@{reporterUsername}</span>
                          </span>
                        </div>

                        <p className="text-xs font-bold text-[#1A1A1A] mt-1.5">
                          Reason: <span className="font-normal text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">{report.reason}</span>
                        </p>

                        {report.details && (
                          <p className="text-[11px] text-gray-600 italic mt-1 bg-gray-50 p-1.5 rounded-md border border-gray-100">
                            "{report.details}"
                          </p>
                        )}

                        {report.targetPreview && (
                          <div className="mt-2 p-2.5 bg-gray-50/80 rounded-2xl border border-gray-200/70 flex items-center space-x-3 max-w-lg">
                            {(report.targetPreview.thumbnailUrl || report.targetPreview.mediaUrl) && (
                              <div className="w-12 h-12 rounded-xl overflow-hidden bg-black shrink-0 relative">
                                <img
                                  src={report.targetPreview.thumbnailUrl || report.targetPreview.mediaUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                                {report.targetPreview.mediaType === 'video' && (
                                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                    <Play className="w-3.5 h-3.5 text-white fill-white" />
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              {authorUsername && (
                                <p className="text-xs font-bold text-gray-900 flex items-center gap-1">
                                  <span>Author:</span>
                                  <span className="text-blue-600 font-semibold">@{authorUsername}</span>
                                </p>
                              )}
                              <p className="text-[11px] text-gray-600 line-clamp-2 mt-0.5">
                                {report.targetPreview.caption || report.targetPreview.title || 'No caption available'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setInspectingReport(report)}
                              className="px-2 py-1 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 text-[10px] font-bold rounded-lg shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
                              title="Inspect content"
                            >
                              <Eye className="w-3 h-3 text-gray-500" />
                              <span>Inspect</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {pending ? (
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-start md:self-center">
                        <button
                          type="button"
                          onClick={() => setInspectingReport(report)}
                          className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-zinc-600" />
                          <span>See Post</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteReportConfirm(report)}
                          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                          <span>Delete Post</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenWarning(report)}
                          className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>Give Warning</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveReport(report.id, 'DISMISS')}
                          className="px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-xs font-medium rounded-xl transition-colors cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <div className="text-right shrink-0">
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                          Resolved: {report.actionTaken || 'PROCESSED'}
                        </span>
                        {report.resolvedBy && (
                          <p className="text-[10px] text-gray-400 mt-1">by {report.resolvedBy}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 3: ACTIVE BANS ================= */}
      {activeTab === 'bans' && (
        <div className="bg-white border border-[#EEEEEE] rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">Suspended & Banned Users</h3>
              <p className="text-xs text-gray-500">Active server-side ban registry. Terminated sessions & hidden posts.</p>
            </div>
            <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
              {bansList.length} Active
            </span>
          </div>

          {bansList.length === 0 ? (
            <div className="py-12 text-center text-gray-400 space-y-2">
              <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500" />
              <p className="text-xs font-bold text-gray-700">No active suspensions</p>
              <p className="text-[11px]">All platform accounts are in good standing.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#EEEEEE] text-[#8E8E8E]">
                    <th className="pb-3 font-semibold">User</th>
                    <th className="pb-3 font-semibold">Reason</th>
                    <th className="pb-3 font-semibold">Ban Type & Duration</th>
                    <th className="pb-3 font-semibold">Banned Date</th>
                    <th className="pb-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F5F5]">
                  {bansList.map(u => {
                    const isPerm = !u.banExpiresAt;
                    const expiresDate = u.banExpiresAt ? new Date(u.banExpiresAt) : null;
                    const isExpired = expiresDate && expiresDate < new Date();

                    return (
                      <tr key={u.id} className="hover:bg-gray-50/50">
                        <td className="py-3 flex items-center space-x-2.5">
                          <img
                            src={u.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${u.username}`}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-[#EEEEEE]"
                          />
                          <div>
                            <p className="font-bold text-[#1A1A1A]">{u.displayName}</p>
                            <p className="text-[10px] text-[#8E8E8E]">@{u.username}</p>
                          </div>
                        </td>
                        <td className="py-3 max-w-[200px] truncate text-gray-700">
                          {u.banReason || 'Policy violation'}
                        </td>
                        <td className="py-3">
                          {isPerm ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[10px] font-bold rounded-full">
                              Permanent Ban
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                              isExpired ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {isExpired ? 'Expired' : `Expires ${expiresDate?.toLocaleDateString()}`}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-gray-500">
                          {u.bannedAt ? new Date(u.bannedAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleUnbanUser(u.id)}
                            className="px-3 py-1 bg-zinc-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition-all"
                          >
                            Lift Ban
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 4: USERS & VERIFIED BADGES ================= */}
      {activeTab === 'users' && (
        <div className="bg-white border border-[#EEEEEE] rounded-3xl p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-[#1A1A1A]">User Accounts & Moderation</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#EEEEEE] text-[#8E8E8E]">
                  <th className="pb-3 font-semibold">User</th>
                  <th className="pb-3 font-semibold">Role</th>
                  <th className="pb-3 font-semibold">Ban Status</th>
                  <th className="pb-3 font-semibold">Followers</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5]">
                {usersList.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/50">
                    <td className="py-3 flex items-center space-x-2.5">
                      <img
                        src={u.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${u.username}`}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover border border-[#EEEEEE]"
                      />
                      <div>
                        <p className="font-bold text-[#1A1A1A] flex items-center space-x-1">
                          <span>{u.displayName}</span>
                          {u.verified && <VerifiedBadge size="xs" />}
                        </p>
                        <p className="text-[10px] text-[#8E8E8E]">@{u.username}</p>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        u.role === 'OWNER_ADMIN' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3">
                      {u.isBanned ? (
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-full">
                          Banned
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-gray-700 font-semibold">{u.followersCount}</td>
                    <td className="py-3 text-right space-x-2">
                      <button
                        onClick={() => handleToggleVerified(u)}
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-semibold transition-colors ${
                          u.verified
                            ? 'bg-amber-50 text-amber-800 border border-amber-300 font-bold hover:bg-amber-100'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {u.verified ? 'Verified (Orange Tick) ✓' : 'Grant Orange Tick'}
                      </button>

                      {u.isBanned ? (
                        <button
                          onClick={() => handleUnbanUser(u.id)}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-black text-white rounded-xl text-[10px] font-bold"
                        >
                          Unban
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setBanModalTarget({ id: u.id, name: u.displayName, username: u.username });
                            setBanReason('Violation of community guidelines');
                            setBanIsPermanent(false);
                            setBanDurationHours(24);
                          }}
                          disabled={u.role === 'OWNER_ADMIN'}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-[10px] font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Ban / Suspend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= TAB 5: CONTENT MODERATION ================= */}
      {activeTab === 'moderation' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Posts Moderation */}
          <div className="bg-white border border-[#EEEEEE] rounded-3xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#1A1A1A]">Recent Posts ({postsList.length})</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto divide-y divide-gray-100">
              {postsList.map(p => (
                <div key={p.id} className="pt-2 first:pt-0 flex items-center justify-between space-x-3">
                  <img
                    src={p.mediaUrl}
                    alt=""
                    className="w-10 h-10 rounded-xl object-cover border border-[#EEEEEE]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">@{p.author.username}</p>
                    <p className="text-[11px] text-[#8E8E8E] truncate">{p.caption || 'No caption'}</p>
                  </div>
                  <button
                    onClick={() => handleDeletePost(p.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Reels Moderation */}
          <div className="bg-white border border-[#EEEEEE] rounded-3xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#1A1A1A]">Recent Reels ({reelsList.length})</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto divide-y divide-gray-100">
              {reelsList.map(r => (
                <div key={r.id} className="pt-2 first:pt-0 flex items-center justify-between space-x-3">
                  <img
                    src={r.thumbnailUrl || r.author.avatarUrl}
                    alt=""
                    className="w-10 h-10 rounded-xl object-cover border border-[#EEEEEE]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">@{r.author.username}</p>
                    <p className="text-[11px] text-[#8E8E8E] truncate">{r.caption || 'No caption'}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteReel(r.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 6: STORAGE & VAULT INTEGRITY ================= */}
      {activeTab === 'integrity' && (
        <div className="space-y-6">
          {/* Status & Action Banner */}
          <div className="bg-white border border-[#EEEEEE] rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1A1A1A]">Media Integrity & Disaster Recovery Vault</h3>
                  <p className="text-xs text-[#8E8E8E]">
                    Preservation Shields active • Atomic backup mirrors • Schema v2.0
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={runDiagnosticReport}
                  disabled={isRunningDiagnostic}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRunningDiagnostic ? 'animate-spin' : ''}`} />
                  <span>{isRunningDiagnostic ? 'Scanning...' : 'Run Health Scan'}</span>
                </button>

                <button
                  type="button"
                  onClick={executeMediaRepair}
                  disabled={isExecutingRepair}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center space-x-1.5 shadow-xs cursor-pointer"
                >
                  <ShieldCheck className={`w-3.5 h-3.5 ${isExecutingRepair ? 'animate-spin' : ''}`} />
                  <span>{isExecutingRepair ? 'Repairing...' : 'Safe Repair & Migrate'}</span>
                </button>
              </div>
            </div>

            {diagnosticError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{diagnosticError}</span>
              </div>
            )}

            {repairResult && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs space-y-1.5">
                <div className="flex items-center space-x-2 text-emerald-800 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Repair Complete: {repairResult.repairedCount} items verified / recovered</span>
                </div>
                <p className="text-emerald-700">
                  Restored from Vault: {repairResult.restoredFromVaultCount} • Schema Migrations: {repairResult.migratedSchemaCount}
                </p>
                {repairResult.details.length > 0 && (
                  <ul className="list-disc list-inside text-emerald-600/90 text-[11px] pt-1 space-y-0.5">
                    {repairResult.details.map((d, idx) => (
                      <li key={idx}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Diagnostic Metrics */}
          {diagnosticReport && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-[#EEEEEE] p-4 rounded-2xl shadow-xs">
                <p className="text-[11px] font-bold text-[#8E8E8E] uppercase tracking-wider">Indexed Posts & Reels</p>
                <p className="text-xl font-black text-[#1A1A1A] mt-1">
                  {diagnosticReport.summary.totalPosts + diagnosticReport.summary.totalReels}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {diagnosticReport.summary.totalPosts} posts • {diagnosticReport.summary.totalReels} reels
                </p>
              </div>

              <div className="bg-white border border-[#EEEEEE] p-4 rounded-2xl shadow-xs">
                <p className="text-[11px] font-bold text-[#8E8E8E] uppercase tracking-wider">Vault Backup Entries</p>
                <p className="text-xl font-black text-emerald-600 mt-1">
                  {diagnosticReport.summary.vaultEntriesCount}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">Permanent mirror storage</p>
              </div>

              <div className="bg-white border border-[#EEEEEE] p-4 rounded-2xl shadow-xs">
                <p className="text-[11px] font-bold text-[#8E8E8E] uppercase tracking-wider">Disk Media Files</p>
                <p className="text-xl font-black text-blue-600 mt-1">
                  {diagnosticReport.summary.diskFilesCount}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">Live filesystem uploads</p>
              </div>

              <div className="bg-white border border-[#EEEEEE] p-4 rounded-2xl shadow-xs">
                <p className="text-[11px] font-bold text-[#8E8E8E] uppercase tracking-wider">Integrity Health</p>
                <p className={`text-xl font-black mt-1 ${diagnosticReport.summary.issuesCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {diagnosticReport.summary.issuesCount === 0 ? '100% Healthy' : `${diagnosticReport.summary.issuesCount} Flagged`}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {diagnosticReport.summary.issuesCount === 0 ? 'Zero missing files' : 'Repair available'}
                </p>
              </div>
            </div>
          )}

          {/* Detailed Issues or Clean State */}
          {diagnosticReport && (
            <div className="bg-white border border-[#EEEEEE] rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-[#1A1A1A]">Diagnostic Findings & Health Log</h4>
                <span className="text-[11px] text-[#8E8E8E]">
                  Scanned: {new Date(diagnosticReport.timestamp).toLocaleTimeString()}
                </span>
              </div>

              {diagnosticReport.issues.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-[#1A1A1A]">All Content and Media Links are Secure</p>
                  <p className="text-xs text-[#8E8E8E] max-w-md mx-auto">
                    Every published post, reel, and video is backed by mirrored vault storage and active filesystem references.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 divide-y divide-gray-100">
                  {diagnosticReport.issues.map((issue) => (
                    <div key={issue.id} className="pt-3 first:pt-0 flex items-start justify-between gap-3">
                      <div className="flex items-start space-x-2.5">
                        <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                          issue.severity === 'high' ? 'text-rose-500' : 'text-amber-500'
                        }`} />
                        <div>
                          <p className="text-xs font-bold text-[#1A1A1A]">
                            [{issue.contentType.toUpperCase()}] {issue.title || issue.contentId}
                          </p>
                          <p className="text-[11px] text-gray-600 mt-0.5">{issue.description}</p>
                          {issue.path && (
                            <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate max-w-md">
                              Path: {issue.path}
                            </p>
                          )}
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        issue.canAutoRepair ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {issue.canAutoRepair ? 'Auto-Repairable' : 'Manual Review'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendations */}
              {diagnosticReport.recommendations.length > 0 && (
                <div className="pt-4 border-t border-gray-100">
                  <h5 className="text-xs font-bold text-gray-700 mb-2">Automated Recommendations:</h5>
                  <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
                    {diagnosticReport.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Preservation Shield Guarantees Card */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-3xl p-5 text-xs text-neutral-700 space-y-2">
            <div className="flex items-center space-x-2 text-neutral-900 font-bold">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span>Production Preservation Rules Enforced</span>
            </div>
            <p className="text-[11px] text-neutral-600 leading-relaxed">
              • <strong>Zero Overwrite Shield:</strong> Saves are aborted if a write would clear or zero-out posts, reels, or users.<br />
              • <strong>Cross-Backup Merging:</strong> In case of primary file corruption, data is reconstructed by merging golden snapshots.<br />
              • <strong>Vault Mirroring:</strong> All uploaded videos are encoded into permanent base64 disaster vaults for immediate file rehydration.<br />
              • <strong>Non-Destructive Playback:</strong> Playback interruptions trigger diagnostic beacons and clean retries; content records are never deleted.
            </p>
          </div>
        </div>
      )}

      {/* Ban / Suspension Modal */}
      {banModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2 text-red-600">
                <AlertTriangle className="w-4 h-4" />
                <h3 className="text-sm font-bold text-[#1A1A1A]">Suspend or Ban Account</h3>
              </div>
              <button
                onClick={() => setBanModalTarget(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600">
              Take punitive moderation action on <span className="font-bold text-gray-900">@{banModalTarget.username}</span> ({banModalTarget.name}). Active sessions will be immediately revoked.
            </p>

            <form onSubmit={handleExecuteBan} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Ban Reason *</label>
                <input
                  type="text"
                  required
                  value={banReason}
                  onChange={e => setBanReason(e.target.value)}
                  placeholder="e.g. Harassment, spam, community violations"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Ban Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBanIsPermanent(false)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                      !banIsPermanent ? 'bg-black text-white border-black' : 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    Temporary
                  </button>
                  <button
                    type="button"
                    onClick={() => setBanIsPermanent(true)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                      banIsPermanent ? 'bg-red-600 text-white border-red-600' : 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    Permanent
                  </button>
                </div>
              </div>

              {!banIsPermanent && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Duration</label>
                  <select
                    value={banDurationHours}
                    onChange={e => setBanDurationHours(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-black"
                  >
                    <option value={1}>1 Hour (Warning cooldown)</option>
                    <option value={6}>6 Hours</option>
                    <option value={24}>24 Hours (1 Day)</option>
                    <option value={72}>72 Hours (3 Days)</option>
                    <option value={168}>168 Hours (1 Week)</option>
                    <option value={720}>720 Hours (30 Days)</option>
                  </select>
                </div>
              )}

              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setBanModalTarget(null)}
                  className="w-1/2 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBan}
                  className="w-1/2 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-1"
                >
                  {submittingBan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Apply Ban</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Moderation Inspection Modal (See Post / Reel) */}
      {inspectingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-gray-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 bg-blue-100 text-blue-800 rounded-lg">
                  <Eye className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Content Moderation Inspection
                  </h3>
                  <p className="text-[10px] text-gray-500">
                    Reviewing flagged {inspectingReport.targetType.toLowerCase()} #{inspectingReport.targetId.slice(0, 8)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingReport(null)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Media Preview */}
            {inspectingReport.targetPreview?.mediaUrl ? (
              <div className="rounded-2xl overflow-hidden bg-black max-h-72 flex items-center justify-center">
                {inspectingReport.targetPreview.mediaType === 'video' || inspectingReport.targetPreview.mediaUrl.endsWith('.mp4') ? (
                  <video
                    src={inspectingReport.targetPreview.mediaUrl}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className="w-full max-h-72 object-contain"
                  />
                ) : (
                  <img
                    src={inspectingReport.targetPreview.mediaUrl}
                    alt=""
                    className="w-full max-h-72 object-contain"
                  />
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-xs">
                No direct visual preview available for this item
              </div>
            )}

            {/* Content Details */}
            <div className="space-y-2 bg-gray-50 p-3.5 rounded-2xl border border-gray-100 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-gray-900">Author:</span>
                  <span className="text-blue-600 font-semibold">
                    @{inspectingReport.targetPreview?.username || 'unknown'}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400">
                  {new Date(inspectingReport.createdAt).toLocaleString()}
                </span>
              </div>

              {inspectingReport.targetPreview?.caption && (
                <p className="text-gray-700 bg-white p-2.5 rounded-xl border border-gray-200/60 text-xs">
                  "{inspectingReport.targetPreview.caption}"
                </p>
              )}

              <div className="pt-2 border-t border-gray-200/60 space-y-1">
                <p className="text-[11px] text-gray-600">
                  <strong>Reported by:</strong> @{inspectingReport.reporter?.username || 'user'}
                </p>
                <p className="text-[11px] text-gray-600">
                  <strong>Violation Reason:</strong> <span className="text-rose-600 font-semibold">{inspectingReport.reason}</span>
                </p>
                {inspectingReport.details && (
                  <p className="text-[11px] text-gray-600">
                    <strong>Reporter notes:</strong> "{inspectingReport.details}"
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {isReportPending(inspectingReport.status) ? (
              <div className="pt-2 flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => handleResolveReport(inspectingReport.id, 'DISMISS')}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Dismiss Report
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenWarning(inspectingReport)}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Give Warning</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteReportConfirm(inspectingReport)}
                  className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Post</span>
                </button>
              </div>
            ) : (
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setInspectingReport(null)}
                  className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Give Warning Modal */}
      {warningModalReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-amber-200 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-sm font-bold text-gray-900">Issue Community Warning</h3>
              </div>
              <button
                type="button"
                onClick={() => setWarningModalReport(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-1 text-amber-900">
              <p>
                Target User: <strong className="text-gray-900">@{warningModalReport.targetPreview?.username || 'user'}</strong>
              </p>
              <p className="text-[11px] text-amber-800">
                The user will receive an official notification in their alerts feed and a policy warning strike will be recorded on their account.
              </p>
            </div>

            {/* Quick preset chips */}
            <div>
              <label className="block text-[11px] font-bold text-gray-600 mb-1.5">Preset Violations:</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Inappropriate Content',
                  'Harassment & Bullying',
                  'Spam & Scams',
                  'Hate Speech',
                  'Copyright Violation'
                ].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setWarningMessage(
                        `Official Warning: Your ${warningModalReport.targetType.toLowerCase()} violated our community guidelines on ${preset}. Please review community policies. Repeat infractions will result in account suspension.`
                      );
                    }}
                    className="px-2.5 py-1 bg-gray-100 hover:bg-amber-100 hover:text-amber-900 text-gray-700 text-[10px] font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleExecuteWarning} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Official Warning Message *
                </label>
                <textarea
                  required
                  rows={4}
                  value={warningMessage}
                  onChange={e => setWarningMessage(e.target.value)}
                  placeholder="Enter the official policy warning message to deliver to the user..."
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 leading-relaxed"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setWarningModalReport(null)}
                  className="w-1/2 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWarning || !warningMessage.trim()}
                  className="w-1/2 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSubmittingWarning ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Send Warning</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Content Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteReportConfirm)}
        title={`Delete Reported ${deleteReportConfirm?.targetType || 'Content'}`}
        message={`Are you sure you want to permanently delete this ${deleteReportConfirm?.targetType.toLowerCase()} by @${deleteReportConfirm?.targetPreview?.username || 'user'}? The post will be removed from feeds and databases, and the author will be notified of the removal.`}
        confirmLabel="Delete Content"
        isDestructive={true}
        isLoading={isDeletingReportContent}
        onConfirm={() => {
          if (deleteReportConfirm) {
            handleExecuteDeleteReportContent(deleteReportConfirm);
          }
        }}
        onCancel={() => setDeleteReportConfirm(null)}
      />

      {/* Confirmation Dialog for Admin Actions */}
      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        title={confirmAction?.title || 'Confirm Action'}
        message={confirmAction?.message || 'Are you sure you want to proceed?'}
        confirmLabel={confirmAction?.confirmLabel || 'Confirm'}
        isDestructive={true}
        isLoading={isExecutingAction}
        onConfirm={async () => {
          if (!confirmAction) return;
          setIsExecutingAction(true);
          try {
            await confirmAction.onConfirm();
            setConfirmAction(null);
          } catch (err: any) {
            setAdminActionError(err.message || 'Action failed');
          } finally {
            setIsExecutingAction(false);
          }
        }}
        onCancel={() => {
          setConfirmAction(null);
          setAdminActionError(null);
        }}
      />

      {adminActionError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] bg-red-600 text-white text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2">
          <span>{adminActionError}</span>
          <button 
            type="button" 
            onClick={() => setAdminActionError(null)} 
            className="font-bold ml-2 hover:opacity-80"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

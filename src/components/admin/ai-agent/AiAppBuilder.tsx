import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { apiRequest } from '../../../lib/api';
import { 
  AiAgentMessage, 
  AiCodeDiff, 
  AiStructuredResponse, 
  AiVersionSnapshot, 
  AiProjectArchitecture 
} from '../../../types/index';
import { 
  Bot, 
  Sparkles, 
  Send, 
  Upload, 
  Image as ImageIcon, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Terminal, 
  GitBranch, 
  GitCompare, 
  RotateCcw, 
  ShieldCheck, 
  FileCode, 
  Activity, 
  Database, 
  Server, 
  Layers, 
  Monitor, 
  Smartphone, 
  Check, 
  X, 
  Copy, 
  FileText, 
  ChevronRight,
  ChevronDown,
  Info,
  ExternalLink,
  ShieldAlert,
  Loader2,
  Sliders,
  History
} from 'lucide-react';

export const AiAppBuilder: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AiAgentMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content: 'Welcome, SHUV. I am the ISHARA Integrated AI Software Architect. I have full structural awareness of the ISHARA codebase (React 19, Vite 6, Tailwind CSS v4, Express 4, Cloud Firestore, WebSocket, and Media Vault). You can describe any feature, bug fix, or visual polish in natural language, or attach a screenshot. All modifications are diff-first, non-destructive, versioned, and verified before deployment.',
      timestamp: new Date().toLocaleTimeString(),
      status: 'success'
    }
  ]);

  const [promptInput, setPromptInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [architecture, setArchitecture] = useState<AiProjectArchitecture | null>(null);
  const [versions, setVersions] = useState<AiVersionSnapshot[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'agent' | 'diff' | 'architecture' | 'versions' | 'build' | 'preview'>('agent');
  
  // Terminal logs & Diagnostics
  const [terminalLogs, setTerminalLogs] = useState<string>('Ready. Click "Run Diagnostics" or "Run Linter" to inspect system state.');
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [activeDiff, setActiveDiff] = useState<AiCodeDiff | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<AiVersionSnapshot | null>(null);

  // Preview device frame
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewKey, setPreviewKey] = useState(Date.now());

  // Applying / rollback state
  const [isApplying, setIsApplying] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [highRiskApprovalNeeded, setHighRiskApprovalNeeded] = useState<AiStructuredResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  // Load Architecture & Versions on mount
  useEffect(() => {
    loadArchitecture();
    loadVersions();
  }, []);

  const loadArchitecture = async () => {
    try {
      const res = await apiRequest<{ architecture: AiProjectArchitecture }>('/admin/ai-agent/architecture');
      if (res.architecture) setArchitecture(res.architecture);
    } catch (err: any) {
      console.warn('Failed to load architecture:', err.message);
    }
  };

  const loadVersions = async () => {
    try {
      const res = await apiRequest<{ versions: AiVersionSnapshot[] }>('/admin/ai-agent/versions');
      if (res.versions) {
        setVersions(res.versions);
        if (res.versions.length > 0 && !selectedVersion) {
          setSelectedVersion(res.versions[0]);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load versions:', err.message);
    }
  };

  const handleScreenshotSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitPrompt = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const textToSend = customText || promptInput.trim();
    if (!textToSend || isProcessing) return;

    const userMessage: AiAgentMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString(),
      screenshotUrl: screenshotPreview || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setPromptInput('');
    const currentScreenshot = screenshotPreview;
    setScreenshotPreview(null);
    setIsProcessing(true);
    setActionNotice(null);

    try {
      const res = await apiRequest<{ response: AiStructuredResponse }>('/admin/ai-agent/prompt', {
        method: 'POST',
        body: JSON.stringify({
          prompt: textToSend,
          screenshotBase64: currentScreenshot
        })
      });

      const structured = res.response;
      const assistantMessage: AiAgentMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: structured.understanding,
        timestamp: new Date().toLocaleTimeString(),
        structuredResponse: structured,
        status: structured.isHighRisk ? 'needs_approval' : 'success'
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (structured.diffs && structured.diffs.length > 0) {
        setActiveDiff(structured.diffs[0]);
      }

      if (structured.isHighRisk) {
        setHighRiskApprovalNeeded(structured);
      }
    } catch (err: any) {
      const errorMessage: AiAgentMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Error processing prompt: ${err.message || 'Network or authorization error'}`,
        timestamp: new Date().toLocaleTimeString(),
        status: 'failed'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
      loadArchitecture();
      loadVersions();
    }
  };

  const handleApplyChanges = async (structured: AiStructuredResponse) => {
    setIsApplying(true);
    setActionNotice(null);
    try {
      const res = await apiRequest<{ success: boolean; version: AiVersionSnapshot; logs: string }>('/admin/ai-agent/apply', {
        method: 'POST',
        body: JSON.stringify({
          versionId: structured.version,
          prompt: structured.understanding,
          diffs: structured.diffs
        })
      });

      if (res.success) {
        setActionNotice({
          type: 'success',
          message: `Successfully applied Version ${structured.version} to development workspace. Linter verified cleanly.`
        });
        setTerminalLogs(res.logs || 'Version applied cleanly. 0 compilation errors.');
        loadVersions();
        setPreviewKey(Date.now());
        setHighRiskApprovalNeeded(null);
      }
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        message: `Failed to apply changes: ${err.message}`
      });
      setTerminalLogs(`[ERROR] ${err.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    setIsRollingBack(true);
    setActionNotice(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/admin/ai-agent/rollback', {
        method: 'POST',
        body: JSON.stringify({ versionId })
      });

      if (res.success) {
        setActionNotice({
          type: 'success',
          message: res.message
        });
        loadVersions();
        setPreviewKey(Date.now());
      }
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        message: `Rollback failed: ${err.message}`
      });
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleRunLint = async () => {
    setIsRunningTest(true);
    setTerminalLogs('Running TypeScript compilation check (`tsc --noEmit`)...');
    try {
      const res = await apiRequest<{ success: boolean; logs: string }>('/admin/ai-agent/run-lint', {
        method: 'POST'
      });
      setTerminalLogs(`[LINT RESULT: ${res.success ? 'PASSED' : 'FAILED'}]\n\n${res.logs}`);
    } catch (err: any) {
      setTerminalLogs(`[LINT ERROR]\n${err.message}`);
    } finally {
      setIsRunningTest(false);
    }
  };

  const handleRunDiagnostics = async () => {
    setIsRunningTest(true);
    setTerminalLogs('Auditing Cloud Firestore, Media Vault, and Route Health...');
    try {
      const res = await apiRequest<{
        database: boolean;
        auth: boolean;
        storage: boolean;
        routes: boolean;
        details: string;
      }>('/admin/ai-agent/diagnostics', {
        method: 'POST'
      });
      setTerminalLogs(`[DIAGNOSTICS REPORT]\nDatabase: ${res.database ? 'CONNECTED' : 'OFFLINE'}\nAuth Perimeter: ${res.auth ? 'VERIFIED' : 'UNSAFE'}\nStorage Vault: ${res.storage ? 'ACTIVE' : 'DEGRADED'}\n\nSummary:\n${res.details}`);
    } catch (err: any) {
      setTerminalLogs(`[DIAGNOSTICS ERROR]\n${err.message}`);
    } finally {
      setIsRunningTest(false);
    }
  };

  const promptSuggestions = [
    'Add dual-mode message deletion for myself and everyone in chats',
    'Enhance Reels layout fluid responsiveness and auto-pause on scroll',
    'Elevate Profile screen typography contrast and verified badge placement',
    'Audit Firestore Security Rules perimeter for OWNER_ADMIN access',
    'Run deep diagnostics on database and media storage vault'
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[680px] bg-[#0E0E10] text-[#E0E0E0] rounded-xl border border-neutral-800 overflow-hidden shadow-2xl">
      {/* Top Bar / Status Header */}
      <div className="flex flex-wrap items-center justify-between px-6 py-3 bg-[#141418] border-b border-neutral-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-md">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-wide text-white">AI APP BUILDER</h2>
              <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-medium">
                OWNER_ADMIN ACCESS
              </span>
            </div>
            <p className="text-xs text-neutral-400">Integrated Development Agent • ISHARA Production Workspace</p>
          </div>
        </div>

        {/* Global Navigation Tabs */}
        <div className="flex items-center gap-1 bg-[#1A1A22] p-1 rounded-lg border border-neutral-800 text-xs">
          <button
            onClick={() => setActiveSubTab('agent')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeSubTab === 'agent' ? 'bg-cyan-600 text-white shadow-xs' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Agent Chat</span>
          </button>
          <button
            onClick={() => setActiveSubTab('diff')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeSubTab === 'diff' ? 'bg-cyan-600 text-white shadow-xs' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Diff Viewer</span>
          </button>
          <button
            onClick={() => setActiveSubTab('architecture')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeSubTab === 'architecture' ? 'bg-cyan-600 text-white shadow-xs' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Architecture</span>
          </button>
          <button
            onClick={() => setActiveSubTab('versions')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeSubTab === 'versions' ? 'bg-cyan-600 text-white shadow-xs' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Snapshots ({versions.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('build')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeSubTab === 'build' ? 'bg-cyan-600 text-white shadow-xs' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Build & Test</span>
          </button>
          <button
            onClick={() => setActiveSubTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeSubTab === 'preview' ? 'bg-cyan-600 text-white shadow-xs' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Live Staging</span>
          </button>
        </div>

        {/* Real-time Status Badges */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded-md text-[11px] font-mono text-neutral-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Firestore: Connected</span>
          </div>
          <button
            onClick={handleRunDiagnostics}
            disabled={isRunningTest}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 rounded-md border border-neutral-700 font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningTest ? 'animate-spin' : ''}`} />
            <span>Diagnostics</span>
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className={`flex items-center justify-between px-6 py-2.5 text-xs font-medium ${
          actionNotice.type === 'success' ? 'bg-emerald-950/80 text-emerald-300 border-b border-emerald-800' : 'bg-rose-950/80 text-rose-300 border-b border-rose-800'
        }`}>
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
            <span>{actionNotice.message}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-neutral-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* High-risk approval modal */}
      {highRiskApprovalNeeded && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#1A1A22] border border-amber-500/50 rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-semibold text-white">Sensitive System Modification Detected</h3>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              {highRiskApprovalNeeded.riskWarning || 'This modification affects security rules or authorization infrastructure. Modifying these files requires explicit Owner-Admin confirmation.'}
            </p>
            <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-300 space-y-1">
              <div>Affected Files:</div>
              {highRiskApprovalNeeded.filesInvolved.map(f => (
                <div key={f} className="text-amber-300">• {f}</div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setHighRiskApprovalNeeded(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApplyChanges(highRiskApprovalNeeded)}
                disabled={isApplying}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white rounded-lg shadow-sm"
              >
                {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Approve & Apply to Workspace</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab Panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* TAB 1: AGENT CONVERSATION */}
        {activeSubTab === 'agent' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}

                  <div className={`max-w-3xl rounded-xl p-4 text-xs leading-relaxed space-y-3 ${
                    msg.role === 'user'
                      ? 'bg-cyan-900/40 border border-cyan-700/50 text-cyan-100'
                      : 'bg-[#181820] border border-neutral-800 text-neutral-200 shadow-md'
                  }`}>
                    {msg.screenshotUrl && (
                      <div className="rounded-lg overflow-hidden border border-neutral-700 max-w-sm mb-2">
                        <img src={msg.screenshotUrl} alt="Attached screenshot" className="w-full object-cover max-h-48" />
                      </div>
                    )}

                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    {/* Structured AI Plan & Diff Summary Card */}
                    {msg.structuredResponse && (
                      <div className="mt-4 pt-4 border-t border-neutral-800 space-y-4">
                        {/* Section: Plan */}
                        <div>
                          <div className="text-[11px] font-mono tracking-wider text-cyan-400 uppercase font-semibold mb-2 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Architectural Plan</span>
                          </div>
                          <ul className="space-y-1.5 pl-2">
                            {msg.structuredResponse.plan.map((step, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-neutral-300">
                                <span className="w-4 h-4 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-mono text-cyan-400 shrink-0 mt-0.5">
                                  {idx + 1}
                                </span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Section: Files Involved */}
                        <div>
                          <div className="text-[11px] font-mono tracking-wider text-indigo-400 uppercase font-semibold mb-2 flex items-center gap-1.5">
                            <FileCode className="w-3.5 h-3.5" />
                            <span>Target Files ({msg.structuredResponse.filesInvolved.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.structuredResponse.filesInvolved.map(file => (
                              <span key={file} className="px-2 py-1 bg-neutral-900 border border-neutral-800 text-neutral-300 font-mono text-[11px] rounded-md">
                                {file}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Section: Proposed Diffs Preview */}
                        {msg.structuredResponse.diffs && msg.structuredResponse.diffs.length > 0 && (
                          <div>
                            <div className="text-[11px] font-mono tracking-wider text-emerald-400 uppercase font-semibold mb-2 flex items-center gap-1.5">
                              <GitCompare className="w-3.5 h-3.5" />
                              <span>Code Changes Preview</span>
                            </div>
                            <div className="space-y-2">
                              {msg.structuredResponse.diffs.map((diff, dIdx) => (
                                <div key={dIdx} className="bg-neutral-950 rounded-lg border border-neutral-800 p-3 space-y-2 font-mono text-[11px]">
                                  <div className="flex items-center justify-between text-neutral-400">
                                    <span className="text-white font-semibold">{diff.filePath}</span>
                                    <span className="text-[10px] text-neutral-500">{diff.reason}</span>
                                  </div>
                                  <div className="p-2 bg-[#0A0A0C] rounded-md overflow-x-auto text-[10px] leading-relaxed text-neutral-300 max-h-36 overflow-y-auto">
                                    {diff.unifiedDiff.split('\n').map((line, lIdx) => (
                                      <div key={lIdx} className={
                                        line.startsWith('+') ? 'text-emerald-400 bg-emerald-950/20' :
                                        line.startsWith('-') ? 'text-rose-400 bg-rose-950/20' :
                                        line.startsWith('@') ? 'text-cyan-400 font-bold' : 'text-neutral-400'
                                      }>
                                        {line}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action Buttons for this plan */}
                        <div className="flex flex-wrap items-center justify-between pt-2 gap-3 border-t border-neutral-800">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-neutral-400">Target Version:</span>
                            <span className="px-2 py-0.5 bg-neutral-900 border border-neutral-800 text-cyan-300 font-mono text-xs rounded-md">
                              {msg.structuredResponse.version}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (msg.structuredResponse?.diffs?.[0]) {
                                  setActiveDiff(msg.structuredResponse.diffs[0]);
                                  setActiveSubTab('diff');
                                }
                              }}
                              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded-lg font-medium transition-colors"
                            >
                              Inspect Full Diff
                            </button>
                            <button
                              onClick={() => handleApplyChanges(msg.structuredResponse!)}
                              disabled={isApplying}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg font-medium shadow-sm transition-colors"
                            >
                              {isApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                              <span>Apply to Workspace</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="text-[10px] text-neutral-500 text-right">{msg.timestamp}</div>
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-cyan-700 flex items-center justify-center shrink-0 shadow-sm">
                      <span className="text-white font-bold text-xs">SH</span>
                    </div>
                  )}
                </div>
              ))}

              {isProcessing && (
                <div className="flex gap-4 items-center">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="p-4 bg-[#181820] border border-neutral-800 rounded-xl text-xs text-neutral-300 flex items-center gap-3">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>Analyzing ISHARA architecture, inspecting target files, and planning non-destructive diffs...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Prompt Suggestions Bar */}
            <div className="px-6 py-2 bg-[#121216] border-t border-neutral-800/80 flex items-center gap-2 overflow-x-auto text-[11px] whitespace-nowrap">
              <span className="text-neutral-400 font-medium">Suggestions:</span>
              {promptSuggestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSubmitPrompt(undefined, sug)}
                  className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 rounded-md transition-colors"
                >
                  {sug}
                </button>
              ))}
            </div>

            {/* Prompt Input Form */}
            <div className="p-4 bg-[#141418] border-t border-neutral-800">
              {screenshotPreview && (
                <div className="flex items-center gap-3 p-2 mb-2 bg-neutral-900 border border-neutral-800 rounded-lg max-w-sm">
                  <img src={screenshotPreview} alt="Preview" className="w-12 h-12 object-cover rounded-md" />
                  <div className="flex-1 text-xs text-neutral-300 truncate">Attached UI Screenshot</div>
                  <button onClick={() => setScreenshotPreview(null)} className="text-neutral-400 hover:text-white p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmitPrompt} className="flex gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleScreenshotSelect}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach screenshot for visual bug fixing"
                  className="p-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl border border-neutral-700 transition-colors shrink-0"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>

                <textarea
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmitPrompt();
                    }
                  }}
                  rows={2}
                  placeholder="Describe code changes in natural language (e.g. 'Add dual-mode message deletion', 'Fix Reels playback glitch', 'Improve profile layout')..."
                  className="flex-1 bg-neutral-900 text-white text-xs p-3 rounded-xl border border-neutral-700 focus:outline-none focus:border-cyan-500 resize-none font-sans"
                />

                <button
                  type="submit"
                  disabled={!promptInput.trim() || isProcessing}
                  className="px-5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium rounded-xl flex items-center justify-center shrink-0 shadow-md transition-all"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: CODE DIFF VIEWER */}
        {activeSubTab === 'diff' && (
          <div className="flex-1 flex flex-col h-full bg-[#0A0A0E] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 bg-[#141418] border-b border-neutral-800 text-xs">
              <div className="flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-white">Unified Code Diff Inspector</span>
                {activeDiff && (
                  <span className="px-2 py-0.5 bg-neutral-900 border border-neutral-800 text-neutral-300 font-mono text-[11px] rounded-md">
                    {activeDiff.filePath}
                  </span>
                )}
              </div>
              {activeDiff && (
                <span className="text-neutral-400">{activeDiff.reason}</span>
              )}
            </div>

            <div className="flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed">
              {activeDiff ? (
                <div className="space-y-4">
                  <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-300">
                    <span className="text-cyan-400 font-bold">Summary: </span>
                    <span>{activeDiff.changesSummary}</span>
                  </div>

                  <div className="bg-[#121218] border border-neutral-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
                      <span>{activeDiff.filePath}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(activeDiff.unifiedDiff)}
                        className="flex items-center gap-1 hover:text-white"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Diff</span>
                      </button>
                    </div>
                    <div className="p-4 overflow-x-auto space-y-0.5">
                      {activeDiff.unifiedDiff.split('\n').map((line, idx) => (
                        <div
                          key={idx}
                          className={`px-2 py-0.5 rounded-xs ${
                            line.startsWith('+') ? 'bg-emerald-950/40 text-emerald-300' :
                            line.startsWith('-') ? 'bg-rose-950/40 text-rose-300' :
                            line.startsWith('@') ? 'bg-cyan-950/40 text-cyan-300 font-bold my-1' :
                            'text-neutral-400'
                          }`}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-2">
                  <GitCompare className="w-8 h-8 opacity-40" />
                  <p>No active diff selected. Run a prompt in the Agent Chat to view unified diffs.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PROJECT ARCHITECTURE MAP */}
        {activeSubTab === 'architecture' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Full-Stack Project Architecture Map</h3>
                <p className="text-xs text-neutral-400">Real-time inspection of active layers, routes, and security boundaries</p>
              </div>
              <button
                onClick={loadArchitecture}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 rounded-lg border border-neutral-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Map</span>
              </button>
            </div>

            {architecture ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Layer 1: Frontend */}
                <div className="p-5 bg-[#141418] border border-neutral-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
                    <Monitor className="w-4 h-4" />
                    <span>Frontend Client Layer</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-neutral-300 font-mono">
                    <div><span className="text-neutral-500">Framework: </span>{architecture.frontend.framework}</div>
                    <div><span className="text-neutral-500">Styling: </span>{architecture.frontend.styling}</div>
                    <div><span className="text-neutral-500">Bundler: </span>{architecture.frontend.bundler}</div>
                    <div><span className="text-neutral-500">Components: </span>{architecture.frontend.componentsCount} active modules</div>
                    <div><span className="text-neutral-500">Entry: </span>{architecture.frontend.mainEntry}</div>
                  </div>
                </div>

                {/* Layer 2: Backend */}
                <div className="p-5 bg-[#141418] border border-neutral-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                    <Server className="w-4 h-4" />
                    <span>Backend Server Layer</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-neutral-300 font-mono">
                    <div><span className="text-neutral-500">Server: </span>{architecture.backend.server}</div>
                    <div><span className="text-neutral-500">Runtime: </span>{architecture.backend.runtime}</div>
                    <div><span className="text-neutral-500">Port: </span>{architecture.backend.port}</div>
                    <div><span className="text-neutral-500">Realtime: </span>{architecture.backend.realtime}</div>
                  </div>
                </div>

                {/* Layer 3: Database & Firestore */}
                <div className="p-5 bg-[#141418] border border-neutral-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                    <Database className="w-4 h-4" />
                    <span>Cloud Firestore & Data</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-neutral-300 font-mono">
                    <div><span className="text-neutral-500">Primary DB: </span>{architecture.database.primary}</div>
                    <div><span className="text-neutral-500">Project ID: </span>{architecture.database.projectId}</div>
                    <div><span className="text-neutral-500">DB Instance: </span>{architecture.database.databaseId}</div>
                    <div><span className="text-neutral-500">Fallback: </span>{architecture.database.fallback}</div>
                  </div>
                </div>

                {/* Layer 4: Storage Vault */}
                <div className="p-5 bg-[#141418] border border-neutral-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                    <FileCode className="w-4 h-4" />
                    <span>Persistent Media Vault</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-neutral-300 font-mono">
                    <div><span className="text-neutral-500">Tier: </span>{architecture.storage.tier}</div>
                    <div><span className="text-neutral-500">Vault Path: </span>{architecture.storage.vaultPath}</div>
                    <div><span className="text-neutral-500">Total Vault Items: </span>{architecture.storage.totalItems} records</div>
                  </div>
                </div>

                {/* Layer 5: Authentication & Permissions */}
                <div className="p-5 bg-[#141418] border border-neutral-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Auth & Role Perimeter</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-neutral-300 font-mono">
                    <div><span className="text-neutral-500">Mechanism: </span>{architecture.auth.mechanism}</div>
                    <div><span className="text-neutral-500">Active Roles: </span>{architecture.auth.roles.join(', ')}</div>
                    <div><span className="text-neutral-500">Owner UID: </span>{architecture.auth.ownerAdminUid}</div>
                  </div>
                </div>

                {/* Layer 6: API Routes breakdown */}
                <div className="p-5 bg-[#141418] border border-neutral-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs">
                    <Activity className="w-4 h-4" />
                    <span>API Routes Map ({architecture.routes.count})</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-neutral-300">
                    {Object.entries(architecture.routes.categories).map(([cat, count]) => (
                      <div key={cat} className="flex justify-between p-1.5 bg-neutral-900 rounded-md">
                        <span className="capitalize text-neutral-400">{cat}:</span>
                        <span className="font-semibold text-white">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-neutral-500 text-xs">Loading architecture map...</div>
            )}
          </div>
        )}

        {/* TAB 4: SNAPSHOTS & VERSION HISTORY */}
        {activeSubTab === 'versions' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Application Version Snapshots</h3>
                <p className="text-xs text-neutral-400">Non-destructive snapshots with instant rollback capabilities</p>
              </div>
              <button
                onClick={loadVersions}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 rounded-lg border border-neutral-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Snapshots</span>
              </button>
            </div>

            <div className="space-y-3">
              {versions.map((ver) => (
                <div key={ver.versionId} className="p-4 bg-[#141418] border border-neutral-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-0.5 bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono text-xs font-bold rounded-md">
                        {ver.versionId}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-mono rounded-md uppercase font-medium ${
                        ver.status === 'DEPLOYED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                        ver.status === 'APPLIED' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' :
                        'bg-neutral-800 text-neutral-400'
                      }`}>
                        {ver.status}
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        {new Date(ver.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-300">{ver.prompt}</p>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono">
                      <span>Changed files:</span>
                      <span className="text-neutral-200">{ver.changedFiles.join(', ')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {ver.rollbackAvailable && (
                      <button
                        onClick={() => handleRollback(ver.versionId)}
                        disabled={isRollingBack}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-medium rounded-lg transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Rollback to {ver.versionId}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: BUILD & TEST CONSOLE */}
        {activeSubTab === 'build' && (
          <div className="flex-1 flex flex-col h-full bg-[#0A0A0E] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between px-6 py-3 bg-[#141418] border-b border-neutral-800 gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span>Build, Linter & Diagnostics Terminal</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunLint}
                  disabled={isRunningTest}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 rounded-lg border border-neutral-700 font-medium"
                >
                  <Play className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Run Linter (`tsc --noEmit`)</span>
                </button>
                <button
                  onClick={handleRunDiagnostics}
                  disabled={isRunningTest}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 rounded-lg border border-neutral-700 font-medium"
                >
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Run Deep Diagnostics</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 font-mono text-xs text-neutral-300 bg-[#060608] space-y-2 leading-relaxed">
              <div className="text-neutral-500">// ISHARA Development Terminal Output</div>
              <pre className="whitespace-pre-wrap">{terminalLogs}</pre>
            </div>
          </div>
        )}

        {/* TAB 6: LIVE STAGING / PREVIEW */}
        {activeSubTab === 'preview' && (
          <div className="flex-1 flex flex-col h-full bg-[#0C0C10] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-2.5 bg-[#141418] border-b border-neutral-800 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-white">Live Development Preview</span>
                <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-md border border-neutral-800">
                  <button
                    onClick={() => setPreviewDevice('desktop')}
                    className={`p-1.5 rounded-xs transition-colors ${previewDevice === 'desktop' ? 'bg-neutral-700 text-white' : 'text-neutral-400'}`}
                    title="Desktop frame"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPreviewDevice('mobile')}
                    className={`p-1.5 rounded-xs transition-colors ${previewDevice === 'mobile' ? 'bg-neutral-700 text-white' : 'text-neutral-400'}`}
                    title="Mobile frame"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewKey(Date.now())}
                  className="flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md text-[11px]"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reload Preview</span>
                </button>
                <a
                  href="/"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md text-[11px]"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open Tab</span>
                </a>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#070709]">
              <div className={`h-full border border-neutral-800 rounded-xl overflow-hidden shadow-2xl transition-all duration-300 bg-black ${
                previewDevice === 'mobile' ? 'w-[375px] max-h-[760px] border-4 border-neutral-700 rounded-3xl' : 'w-full'
              }`}>
                <iframe
                  key={previewKey}
                  src="/"
                  title="ISHARA App Preview"
                  className="w-full h-full border-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

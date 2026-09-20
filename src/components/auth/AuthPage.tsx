import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { 
  Lock, 
  User as UserIcon, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import { VerificationCodeBox } from './VerificationCodeBox';

interface AuthPageProps {
  onClose?: () => void;
}

type AuthTab = 'login' | 'register' | 'recovery';

// Character set for client-side fallback generation if needed
const FALLBACK_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateRandomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += FALLBACK_CODE_CHARS[Math.floor(Math.random() * FALLBACK_CODE_CHARS.length)];
  }
  return code;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onClose }) => {
  const { login, signup } = useAuth();
  const [activeTab, setActiveTab] = useState<AuthTab>('login');

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regIsPrivate, setRegIsPrivate] = useState(false);
  const [regVerificationCodeId, setRegVerificationCodeId] = useState('');
  const [regVerificationCodeDisplay, setRegVerificationCodeDisplay] = useState('');
  const [regEnteredCode, setRegEnteredCode] = useState('');
  const [isRefreshingRegCode, setIsRefreshingRegCode] = useState(false);

  // Recovery form state
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [recoveryVerificationCodeId, setRecoveryVerificationCodeId] = useState('');
  const [recoveryVerificationCodeDisplay, setRecoveryVerificationCodeDisplay] = useState('');
  const [recoveryEnteredCode, setRecoveryEnteredCode] = useState('');
  const [isRefreshingRecoveryCode, setIsRefreshingRecoveryCode] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch or randomize on-page verification code for registration
  const randomizeRegCode = useCallback(async () => {
    setIsRefreshingRegCode(true);
    try {
      const res = await apiRequest<{ id: string; code: string }>('/auth/verification-code', {
        method: 'GET'
      });
      setRegVerificationCodeId(res.id);
      setRegVerificationCodeDisplay(res.code);
    } catch {
      // Offline / fallback code
      const code = generateRandomCode();
      setRegVerificationCodeId(`vc-local-${Date.now()}`);
      setRegVerificationCodeDisplay(code);
    } finally {
      setRegEnteredCode('');
      setIsRefreshingRegCode(false);
    }
  }, []);

  // Fetch or randomize on-page verification code for recovery
  const randomizeRecoveryCode = useCallback(async () => {
    setIsRefreshingRecoveryCode(true);
    try {
      const res = await apiRequest<{ id: string; code: string }>('/auth/verification-code', {
        method: 'GET'
      });
      setRecoveryVerificationCodeId(res.id);
      setRecoveryVerificationCodeDisplay(res.code);
    } catch {
      const code = generateRandomCode();
      setRecoveryVerificationCodeId(`vc-local-${Date.now()}`);
      setRecoveryVerificationCodeDisplay(code);
    } finally {
      setRecoveryEnteredCode('');
      setIsRefreshingRecoveryCode(false);
    }
  }, []);

  // Randomize code whenever switching tabs or mounting
  useEffect(() => {
    if (activeTab === 'register') {
      randomizeRegCode();
    } else if (activeTab === 'recovery') {
      randomizeRecoveryCode();
    }
  }, [activeTab, randomizeRegCode, randomizeRecoveryCode]);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  // ----------------------------------------------------
  // 1. STANDARD LOGIN
  // ----------------------------------------------------
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      await login(loginIdentifier.trim(), loginPassword);
      onClose?.();
    } catch (err: any) {
      setError(err.message || 'Invalid username or password. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // 2. CREATE ACCOUNT WITH ON-PAGE RANDOM CODE
  // ----------------------------------------------------
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    const trimmedUsername = regUsername.trim();
    const trimmedEnteredCode = regEnteredCode.trim().toUpperCase();

    if (!regDisplayName.trim()) {
      setError('Please enter your full or display name.');
      return;
    }
    if (!trimmedUsername || trimmedUsername.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9._]+$/.test(trimmedUsername)) {
      setError('Username can only contain letters, numbers, underscores, and periods.');
      return;
    }
    if (!regPassword || regPassword.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (!trimmedEnteredCode) {
      setError('Please enter the verification code shown in the security box.');
      return;
    }

    setLoading(true);
    try {
      await signup({
        username: trimmedUsername,
        displayName: regDisplayName.trim() || trimmedUsername,
        password: regPassword,
        isPrivate: regIsPrivate,
        verificationCodeId: regVerificationCodeId,
        verificationCode: trimmedEnteredCode
      });

      onClose?.();
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check the code and try again.');
      // Randomize code every time registration fails so the user gets a fresh challenge
      randomizeRegCode();
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // 3. ACCOUNT PASSWORD RECOVERY WITH ON-PAGE RANDOM CODE
  // ----------------------------------------------------
  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    const trimmedUsername = recoveryUsername.trim();
    const trimmedEnteredCode = recoveryEnteredCode.trim().toUpperCase();

    if (!trimmedUsername) {
      setError('Please enter your username.');
      return;
    }
    if (!recoveryNewPassword || recoveryNewPassword.length < 4) {
      setError('New password must be at least 4 characters.');
      return;
    }
    if (!trimmedEnteredCode) {
      setError('Please enter the verification code shown in the security box.');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          username: trimmedUsername,
          newPassword: recoveryNewPassword,
          verificationCodeId: recoveryVerificationCodeId,
          verificationCode: trimmedEnteredCode
        })
      });

      // Automatically sign in with the new password
      await login(trimmedUsername, recoveryNewPassword);
      onClose?.();
    } catch (err: any) {
      setError(err.message || 'Password reset failed. Please check the details and code.');
      // Randomize code on recovery failure
      randomizeRecoveryCode();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      id="auth-page-container"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in"
    >
      <div 
        id="auth-card"
        className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 space-y-4 max-h-[95vh] overflow-y-auto"
      >
        {/* Brand Header */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#1A1A1A] text-white flex items-center justify-center font-black text-2xl shadow-md">
            I
          </div>
          <h2 className="text-xl font-black tracking-tight text-[#1A1A1A] font-['Outfit'] pt-1">
            ISHARA
          </h2>
          <p className="text-xs text-gray-500">
            {activeTab === 'login' && 'Sign in to continue to ISHARA'}
            {activeTab === 'register' && 'Enter your details and the verification code below'}
            {activeTab === 'recovery' && 'Reset your password using security code verification'}
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-gray-100 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab('login');
              clearMessages();
            }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'login' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              clearMessages();
            }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'register' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('recovery');
              clearMessages();
            }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'recovery' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            Reset
          </button>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 1: EXISTING USER LOGIN                           */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Username or Email
              </label>
              <div className="relative">
                <input
                  id="login-identifier-input"
                  type="text"
                  required
                  placeholder="e.g. jordan or user@ishara.app"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black"
                />
                <UserIcon className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('recovery');
                    clearMessages();
                  }}
                  className="text-[11px] text-zinc-500 hover:text-black font-semibold"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password-input"
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black font-mono"
                />
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-black"
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#1A1A1A] hover:bg-black text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 2: CREATE NEW ACCOUNT WITH VISUAL ON-PAGE CODE   */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Display Name
              </label>
              <input
                id="register-displayname-input"
                type="text"
                required
                placeholder="e.g. Jordan Miller"
                value={regDisplayName}
                onChange={(e) => setRegDisplayName(e.target.value)}
                className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Desired Username
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 text-xs font-mono">@</span>
                <input
                  id="register-username-input"
                  type="text"
                  required
                  placeholder="jordan"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
                  className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="register-password-input"
                  type={showRegPassword ? 'text' : 'password'}
                  required
                  minLength={4}
                  placeholder="At least 4 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  className="absolute right-3 top-2 text-gray-400 hover:text-black"
                >
                  {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-100 rounded-xl">
              <div>
                <p className="text-xs font-semibold text-gray-800">Private Profile</p>
                <p className="text-[10px] text-gray-500">Require approval for follow requests</p>
              </div>
              <input
                id="register-isprivate-input"
                type="checkbox"
                checked={regIsPrivate}
                onChange={(e) => setRegIsPrivate(e.target.checked)}
                className="w-4 h-4 accent-black rounded cursor-pointer"
              />
            </div>

            {/* Verification Code Box: Prominently displayed randomized code */}
            <VerificationCodeBox
              code={regVerificationCodeDisplay}
              onRefresh={randomizeRegCode}
              isRefreshing={isRefreshingRegCode}
            />

            {/* Input field for user to enter code shown on page */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Enter The Code Shown Above
              </label>
              <input
                id="register-verification-code-input"
                type="text"
                required
                maxLength={8}
                autoComplete="off"
                placeholder="e.g. 7X3M9Q"
                value={regEnteredCode}
                onChange={(e) => setRegEnteredCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-center font-mono font-black text-base tracking-widest outline-none focus:border-black focus:bg-white transition-colors uppercase"
              />
            </div>

            <button
              id="register-create-account-btn"
              type="submit"
              disabled={loading || !regEnteredCode.trim()}
              className="w-full py-2.5 bg-[#1A1A1A] hover:bg-black text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Verify & Create Account</span>
            </button>
          </form>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 3: RESET PASSWORD WITH ON-PAGE RANDOM CODE       */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'recovery' && (
          <form onSubmit={handleRecoverySubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Account Username
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 text-xs font-mono">@</span>
                <input
                  id="recovery-username-input"
                  type="text"
                  required
                  placeholder="your_username"
                  value={recoveryUsername}
                  onChange={(e) => setRecoveryUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
                  className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                New Secure Password
              </label>
              <div className="relative">
                <input
                  id="recovery-new-password-input"
                  type={showRecoveryPassword ? 'text' : 'password'}
                  required
                  minLength={4}
                  placeholder="At least 4 characters"
                  value={recoveryNewPassword}
                  onChange={(e) => setRecoveryNewPassword(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowRecoveryPassword(!showRecoveryPassword)}
                  className="absolute right-3 top-2 text-gray-400 hover:text-black"
                >
                  {showRecoveryPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Verification Code Box: Prominently displayed randomized code */}
            <VerificationCodeBox
              code={recoveryVerificationCodeDisplay}
              onRefresh={randomizeRecoveryCode}
              isRefreshing={isRefreshingRecoveryCode}
            />

            {/* Input field for user to enter code shown on page */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Enter The Code Shown Above
              </label>
              <input
                id="recovery-verification-code-input"
                type="text"
                required
                maxLength={8}
                autoComplete="off"
                placeholder="e.g. 7X3M9Q"
                value={recoveryEnteredCode}
                onChange={(e) => setRecoveryEnteredCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-center font-mono font-black text-base tracking-widest outline-none focus:border-black focus:bg-white transition-colors uppercase"
              />
            </div>

            <button
              id="recovery-submit-btn"
              type="submit"
              disabled={loading || !recoveryEnteredCode.trim()}
              className="w-full py-2.5 bg-[#1A1A1A] hover:bg-black text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              <span>Verify & Reset Password</span>
            </button>
          </form>
        )}

        {/* Footer controls */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
};

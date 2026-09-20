import React, { useState } from 'react';
import { X, Flag, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../../lib/api';

export interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'post' | 'reel' | 'user' | 'comment';
  targetId: string;
  contentAuthorUsername?: string;
  onReportSubmitted?: () => void;
}

const REPORT_REASONS = [
  { id: 'spam', label: 'Spam, scam, or misleading content' },
  { id: 'inappropriate', label: 'Inappropriate, nudity, or sexual activity' },
  { id: 'hate', label: 'Hate speech, harassment, or bullying' },
  { id: 'violence', label: 'Violence, threat, or dangerous organizations' },
  { id: 'misinformation', label: 'False information or fraud' },
  { id: 'copyright', label: 'Intellectual property violation' },
  { id: 'other', label: 'Other violation of community guidelines' },
];

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  contentAuthorUsername,
  onReportSubmitted,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>(REPORT_REASONS[0].label);
  const [details, setDetails] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReason) {
      setError('Please select a reason for reporting.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest('/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType,
          targetId,
          reason: selectedReason,
          details: details.trim() || undefined,
        }),
      });

      setIsSuccess(true);
      if (onReportSubmitted) {
        onReportSubmitted();
      }

      setTimeout(() => {
        setIsSuccess(false);
        setDetails('');
        onClose();
      }, 1800);
    } catch (err: any) {
      setError(err.message || 'Failed to submit report. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setIsSuccess(false);
      setError(null);
      setDetails('');
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
      onClick={handleClose}
    >
      <div 
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-[#E5E5E5] transform transition-all animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
              <Flag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">Report Content</h3>
              <p className="text-[11px] text-[#737373]">
                Help us keep our community safe and respectful
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        {isSuccess ? (
          <div className="p-8 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-[#1A1A1A] mb-1">Report Submitted</h4>
            <p className="text-xs text-[#737373] max-w-xs mb-2">
              Thank you for letting us know. A report notification has been sent to our administration team for immediate review.
            </p>
            <span className="text-[11px] font-medium text-emerald-600">Closing automatically...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {contentAuthorUsername && (
              <div className="text-xs px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200/70 text-zinc-600 flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span>
                  Reporting <span className="font-semibold text-zinc-800">{targetType}</span> by{' '}
                  <span className="font-semibold text-zinc-800">@{contentAuthorUsername}</span>
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#1A1A1A] mb-2">
                Why are you reporting this {targetType}?
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {REPORT_REASONS.map((reason) => (
                  <label
                    key={reason.id}
                    className={`flex items-center px-3 py-2 rounded-xl text-xs cursor-pointer border transition-colors ${
                      selectedReason === reason.label
                        ? 'border-rose-500 bg-rose-50/40 text-rose-950 font-medium'
                        : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={reason.label}
                      checked={selectedReason === reason.label}
                      onChange={() => setSelectedReason(reason.label)}
                      className="sr-only"
                    />
                    <span className="w-3.5 h-3.5 rounded-full border border-zinc-300 mr-2.5 flex items-center justify-center shrink-0">
                      {selectedReason === reason.label && (
                        <span className="w-2 h-2 rounded-full bg-rose-600" />
                      )}
                    </span>
                    <span className="leading-snug">{reason.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1A1A1A] mb-1.5">
                Additional Details (Optional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Help the moderation team understand the issue with specific context..."
                rows={2}
                maxLength={400}
                className="w-full text-xs p-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 resize-none placeholder:text-zinc-400"
              />
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#F0F0F0]">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 rounded-xl hover:bg-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !selectedReason}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Flag className="w-3.5 h-3.5" />
                    <span>Submit Report</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

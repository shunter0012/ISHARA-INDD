import React from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  icon?: 'trash' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isDestructive = true,
  isLoading = false,
  icon = 'trash',
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div 
        className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-gray-100 overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="absolute top-3.5 right-3.5 p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start space-x-3.5">
          <div className={`p-2.5 rounded-full shrink-0 ${
            isDestructive ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
          }`}>
            {icon === 'trash' ? (
              <Trash2 className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-sm font-bold text-gray-900 leading-snug">
              {title}
            </h3>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end space-x-2.5 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-3.5 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 ${
              isDestructive 
                ? 'bg-red-600 hover:bg-red-700 active:bg-red-800' 
                : 'bg-[#1A1A1A] hover:bg-black active:scale-98'
            }`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

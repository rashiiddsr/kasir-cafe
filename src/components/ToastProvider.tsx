import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

type Toast = {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'info';
};

type ToastContextValue = {
  showToast: (message: string, variant?: Toast['variant']) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: Toast['variant'] = 'error') => {
    const id = createId();
    setToasts((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => removeToast(id), 3500);
  }, [removeToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-6 top-6 z-50 space-y-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-lg px-4 py-3 shadow-lg text-white ${
              toast.variant === 'success'
                ? 'bg-emerald-600'
                : toast.variant === 'info'
                  ? 'bg-blue-600'
                  : 'bg-red-600'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

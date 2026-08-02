'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Card, CardBody, Button } from '@nextui-org/react';

interface Toast {
  id: string;
  message: string;
}

interface ToastContextType {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15);
  };

  const showToast = (message: string) => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container - fixed bottom-right */}
      <div className="fixed bottom-6 right-6 z-[99999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <Card
            key={toast.id}
            className="pointer-events-auto max-w-[320px] animate-[slideInRight_0.3s_ease-out]"
            shadow="lg"
            classNames={{
              base: "bg-content1/95 backdrop-blur-md border border-secondary/40",
            }}
          >
            <CardBody className="py-3 px-4 flex flex-row items-center gap-3">
              <Sparkles size={14} className="text-secondary flex-shrink-0" />
              <span className="flex-1 text-sm text-foreground font-medium leading-relaxed">
                {toast.message}
              </span>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onClick={() => removeToast(toast.id)}
                className="text-default-500 hover:text-default-900"
                aria-label="Close Toast"
              >
                <X size={14} />
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

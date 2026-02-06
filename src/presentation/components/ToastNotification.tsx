import React, { useEffect, useState } from 'react';
import { useTestRunStore } from '../stores';
import './ToastNotification.css';

interface Toast {
    id: string;
    message: string;
    type: 'error' | 'success' | 'info';
}

/**
 * ToastNotification Component
 * Displays error notifications from the agent loop
 */
export function ToastNotification(): React.ReactElement {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const { status, errorMessage } = useTestRunStore();

    // Add toast when error occurs
    useEffect(() => {
        if (status === 'error' && errorMessage) {
            const newToast: Toast = {
                id: Date.now().toString(),
                message: errorMessage,
                type: 'error',
            };
            setToasts((prev) => [...prev, newToast]);

            // Auto-dismiss after 5 seconds
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
            }, 5000);
        }
    }, [status, errorMessage]);

    const dismissToast = (id: string): void => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    if (toasts.length === 0) {
        return <></>;
    }

    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <div key={toast.id} className={`toast toast-${toast.type}`}>
                    <span className="toast-icon">
                        {toast.type === 'error' ? '⚠️' : toast.type === 'success' ? '✅' : 'ℹ️'}
                    </span>
                    <span className="toast-message">{toast.message}</span>
                    <button className="toast-dismiss" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
}

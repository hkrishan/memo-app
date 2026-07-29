import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  Notification,
  NotificationContextValue,
  ShowToastOptions,
  ShowPopupOptions,
} from "./types";

const NotificationContext = createContext<NotificationContextValue | null>(null);

let notificationId = 0;
const generateId = () => `notification-${++notificationId}`;

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Mark notification as dismissing (triggers exit animation)
  const dismiss = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, dismissing: true } : n)),
    );
  }, []);

  // Actually remove from state (called after animation completes)
  const remove = useCallback((id: string) => {
    setNotifications((prev) => {
      const notification = prev.find((n) => n.id === id);
      if (notification?.onDismiss) {
        notification.onDismiss();
      }
      return prev.filter((n) => n.id !== id);
    });
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, dismissing: true })));
  }, []);

  const showToast = useCallback(
    (options: ShowToastOptions): string => {
      const id = generateId();
      const notification: Notification = {
        id,
        variant: "toast",
        type: options.type ?? "info",
        title: options.title,
        message: options.message,
        duration: options.duration ?? 3000,
        position: options.position ?? "top",
        onPress: options.onPress,
        onDismiss: options.onDismiss,
      };

      setNotifications((prev) => [...prev, notification]);

      // Auto dismiss after duration
      if (notification.duration && notification.duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, notification.duration);
      }

      return id;
    },
    [dismiss],
  );

  const showPopup = useCallback((options: ShowPopupOptions): string => {
    const id = generateId();
    const notification: Notification = {
      id,
      variant: "popup",
      type: options.type ?? "info",
      title: options.title,
      message: options.message,
      primaryAction: options.primaryAction,
      secondaryAction: options.secondaryAction,
      dismissable: options.dismissable ?? true,
      onDismiss: options.onDismiss,
    };

    setNotifications((prev) => [...prev, notification]);
    return id;
  }, []);

  const showError = useCallback(
    (title: string, message?: string): string => {
      return showToast({
        type: "error",
        title,
        message,
        duration: 4000,
      });
    },
    [showToast],
  );

  const showSuccess = useCallback(
    (title: string, message?: string): string => {
      return showToast({
        type: "success",
        title,
        message,
        duration: 3000,
      });
    },
    [showToast],
  );

  // Memoized: un-memoized, every provider render handed consumers a fresh
  // object — and since `notifications` changes per toast, every toast
  // re-rendered every useNotification() consumer app-wide regardless
  const value: NotificationContextValue = useMemo(
    () => ({
      notifications,
      showToast,
      showPopup,
      showError,
      showSuccess,
      dismiss,
      dismissAll,
      remove,
    }),
    [
      notifications,
      showToast,
      showPopup,
      showError,
      showSuccess,
      dismiss,
      dismissAll,
      remove,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotification must be used within a NotificationProvider",
    );
  }
  return context;
}

// Singleton for imperative API (can be called from non-React code)
let notificationRef: NotificationContextValue | null = null;

export function setNotificationRef(ref: NotificationContextValue | null) {
  notificationRef = ref;
}

export const notify = {
  toast: (options: ShowToastOptions) => {
    if (!notificationRef) {
      if (__DEV__) console.warn("NotificationProvider not mounted");
      return "";
    }
    return notificationRef.showToast(options);
  },
  popup: (options: ShowPopupOptions) => {
    if (!notificationRef) {
      if (__DEV__) console.warn("NotificationProvider not mounted");
      return "";
    }
    return notificationRef.showPopup(options);
  },
  error: (title: string, message?: string) => {
    if (!notificationRef) {
      if (__DEV__) console.warn("NotificationProvider not mounted");
      return "";
    }
    return notificationRef.showError(title, message);
  },
  success: (title: string, message?: string) => {
    if (!notificationRef) {
      if (__DEV__) console.warn("NotificationProvider not mounted");
      return "";
    }
    return notificationRef.showSuccess(title, message);
  },
  dismiss: (id: string) => {
    notificationRef?.dismiss(id);
  },
  dismissAll: () => {
    notificationRef?.dismissAll();
  },
};

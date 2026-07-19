export type NotificationType = "success" | "error" | "warning" | "info";

export type NotificationPosition = "top" | "bottom";

/**
 * Base notification configuration
 */
interface BaseNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  onPress?: () => void;
  onDismiss?: () => void;
  dismissing?: boolean;
}

/**
 * Toast notification - appears at top/bottom briefly
 */
export interface ToastNotification extends BaseNotification {
  variant: "toast";
  position?: NotificationPosition;
}

/**
 * Popup notification - modal dialog with actions
 */
export interface PopupNotification extends BaseNotification {
  variant: "popup";
  primaryAction?: {
    label: string;
    onPress: () => void;
  };
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
  dismissable?: boolean;
}

export type Notification = ToastNotification | PopupNotification;

/**
 * Options for showing a toast
 */
export interface ShowToastOptions {
  type?: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  position?: NotificationPosition;
  onPress?: () => void;
  onDismiss?: () => void;
}

/**
 * Options for showing a popup
 */
export interface ShowPopupOptions {
  type?: NotificationType;
  title: string;
  message?: string;
  primaryAction?: {
    label: string;
    onPress: () => void;
  };
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
  dismissable?: boolean;
  onDismiss?: () => void;
}

/**
 * Notification context value
 */
export interface NotificationContextValue {
  notifications: Notification[];
  showToast: (options: ShowToastOptions) => string;
  showPopup: (options: ShowPopupOptions) => string;
  showError: (title: string, message?: string) => string;
  showSuccess: (title: string, message?: string) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  remove: (id: string) => void;
}

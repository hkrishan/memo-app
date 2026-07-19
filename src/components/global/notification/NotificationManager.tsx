import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useNotification, setNotificationRef } from "./NotificationContext";
import Toast from "./Toast";
import Popup from "./Popup";

export default function NotificationManager() {
  const notificationContext = useNotification();
  const { notifications, remove } = notificationContext;

  // Set the ref for imperative API
  useEffect(() => {
    setNotificationRef(notificationContext);
    return () => setNotificationRef(null);
  }, [notificationContext]);

  const toasts = notifications.filter((n) => n.variant === "toast");
  const popups = notifications.filter((n) => n.variant === "popup");

  // Show the latest toast (including ones being dismissed for animation)
  const latestToast = toasts[toasts.length - 1];

  // Only show one popup at a time
  const currentPopup = popups[0];

  return (
    <View style={styles.container} pointerEvents="box-none">
      {latestToast && (
        <Toast
          key={latestToast.id}
          notification={latestToast}
          onRemove={() => remove(latestToast.id)}
        />
      )}

      {currentPopup && (
        <Popup
          key={currentPopup.id}
          notification={currentPopup}
          onDismiss={() => remove(currentPopup.id)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
});

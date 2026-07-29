import React from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import { captureException } from "@/lib/sentry";

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

/**
 * Root error boundary: reports render errors to Sentry and shows a friendly
 * full-screen fallback (dark, matching the app's visual language) with a
 * "Try again" button that resets the boundary and re-renders the tree.
 */
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    captureException(error, {
      componentStack: errorInfo.componentStack,
      source: "AppErrorBoundary",
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          An unexpected error occurred. Please try again.
        </Text>
        <Pressable
          onPress={this.handleReset}
          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        >
          <Text style={styles.pillLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: "InstrumentSans_400Regular",
    fontWeight: "400",
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 28,
  },
  pill: {
    alignSelf: "stretch",
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  pillPressed: {
    backgroundColor: "#d8d8dc",
  },
  pillLabel: {
    color: "#111",
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
});

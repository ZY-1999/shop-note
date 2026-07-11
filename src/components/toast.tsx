import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/use-theme";

type ToastType = "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

export interface ToastApi {
  /** Pop a green success bubble. */
  success: (message: string) => void;
  /** Pop a red error bubble. */
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Show a transient success/error bubble. The mutation hooks
 * ([mutations.ts](../hooks/mutations.ts)) call this on every commit / throw, so
 * every save surfaces outcome feedback — a success bubble on commit, the repo's
 * own error message on failure (no more silent save failures). Mounted inside
 * `AppProviders`, so it's available in production AND under the test harness.
 *
 * One bubble at a time (newest replaces older), auto-dismisses after ~2.5s, tap
 * to dismiss. The viewport overlays the screen from the top.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be used within <ToastProvider>");
  return ctx;
}

const AUTO_DISMISS_MS = 2500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const nextId = useRef(1);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const show = useCallback((message: string, type: ToastType) => {
    const id = nextId.current++;
    setToast({ id, message, type });
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToast((cur) => (cur?.id === id ? null : cur));
    }, AUTO_DISMISS_MS);
    timers.current.add(timer);
  }, []);

  // Clear any pending auto-dismiss timers on unmount — no stale state updates.
  useEffect(() => {
    const live = timers.current;
    return () => {
      live.forEach((t) => clearTimeout(t));
      live.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => show(m, "success"), error: (m) => show(m, "error") }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toast={toast} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toast }: { toast: ToastItem | null }) {
  const theme = useTheme();
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <View pointerEvents="box-none" style={styles.viewport}>
      <Pressable
        testID="toast"
        accessibilityRole="alert"
        style={[styles.bubble, { backgroundColor: isError ? theme.danger : theme.success }]}>
        <Ionicons name={isError ? "alert-circle" : "checkmark-circle"} size={18} color="#fff" />
        <Text style={styles.message} numberOfLines={4}>
          {toast.message}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    maxWidth: 360,
  },
  message: { color: "#fff", fontSize: 14, fontWeight: "600", flexShrink: 1 },
});

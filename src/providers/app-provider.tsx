import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AppProviders } from "@/providers/providers";
import { setupRepos, type Repos } from "@/data/composition";
import { ExpoSqliteAdapter } from "@/data/expo-sqlite";

/**
 * The production composition root (ADR-0005, spec #04). At boot it opens the real
 * `shop_note.db`, runs WAL + migrations (inside `ExpoSqliteAdapter.open`), builds
 * the single `Repos` via `setupRepos` — the SAME wiring the cross-adapter smoke
 * uses (no second wiring to drift) — and feeds it into #3's `AppProviders`.
 *
 * Three states: **loading** (DB opening — the native splash covers this), **error**
 * (open failed — a retryable error screen), **ready** (renders the app under the
 * providers). Children mount only once ready, so the splash-stripping overlay (a
 * child) hides the native splash exactly when the DB is ready (AC2 coordination is
 * structural, not flag-based). `onError` lets the shell hide the splash on the
 * error path (where children — and thus the overlay — never mount).
 *
 * This is the ONLY place in the UI tree that references `ExpoSqliteAdapter`;
 * everything below consumes `useRepos()`.
 */
type BootState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; repos: Repos };

export interface AppProviderProps {
  children: ReactNode;
  /** DB file name. Production `shop_note.db`; the smoke stays on `shop_note_smoke.db` (ADR-0004). */
  dbName?: string;
  /** Fired when open fails — so the shell can hide the splash and reveal the error screen. */
  onError?: () => void;
}

export function AppProvider({ children, dbName = "shop_note.db", onError }: AppProviderProps) {
  const [state, setState] = useState<BootState>({ status: "loading" });

  // Ref so callback identity never re-triggers `open` (open depends only on dbName).
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const open = useCallback(() => {
    setState({ status: "loading" });
    ExpoSqliteAdapter.open(dbName)
      .then((adapter) => {
        setState({ status: "ready", repos: setupRepos(adapter) });
      })
      .catch(() => {
        setState({ status: "error" });
        onErrorRef.current?.();
      });
  }, [dbName]);

  useEffect(() => {
    open();
  }, [open]);

  if (state.status === "error") {
    return (
      <View style={styles.center}>
        <Text>数据库打开失败</Text>
        <Pressable testID="retry" onPress={open} style={styles.retry}>
          <Text>重试</Text>
        </Pressable>
      </View>
    );
  }
  if (state.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="boot-loading" />
      </View>
    );
  }
  return <AppProviders repos={state.repos}>{children}</AppProviders>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  retry: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
});

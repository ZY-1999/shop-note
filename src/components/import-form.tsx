import * as DocumentPicker from "expo-document-picker";
import { EncodingType, readAsStringAsync } from "expo-file-system/legacy";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useToast } from "@/components/toast";
import { BottomTabInset } from "@/constants/theme";
import { ADMIN_STAFF_ID } from "@/data/staff";
import { XLSX_MIME } from "@/export/types";
import { useImportStaff } from "@/hooks/mutations";
import { useExport } from "@/hooks/use-export";
import { useTheme } from "@/hooks/use-theme";
import {
  buildStaffImportTemplate,
  STAFF_IMPORT_TEMPLATE_FILENAME,
} from "@/import/build-staff-import-template";
import { parseStaffImportWorkbook } from "@/import/parse-staff-import-workbook";
import {
  previewStaffImport,
  type StaffImportFail,
  type StaffImportOk,
} from "@/import/preview-staff-import";
import { useRepos } from "@/providers/providers";

/** Import kinds the shell accepts; product/restock wire in later specs. */
export type ImportKind = "staff" | "product" | "restock";

export type ImportFormProps = {
  kind: ImportKind;
  /**
   * Optional slot rendered above the confirm button.
   * Staff/product unused; restock (#03) injects batch note here.
   */
  confirmExtra?: ReactNode;
};

type StaffPreview = {
  ok: StaffImportOk[];
  fail: StaffImportFail[];
};

/**
 * Kind-parameterized import shell (manage-import #01).
 * Root-Stack sibling of record-form / topup-form. Staff path is fully wired;
 * product/restock kinds reserve the route shape for #02/#03.
 */
export function ImportForm({ kind, confirmExtra }: ImportFormProps) {
  const theme = useTheme();
  const toast = useToast();
  const repos = useRepos();
  const exportMutation = useExport();
  const importStaff = useImportStaff();
  const [preview, setPreview] = useState<StaffPreview | null>(null);
  const [failOpen, setFailOpen] = useState(false);

  if (kind !== "staff") {
    return (
      <View
        testID="import-form-unsupported"
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <Text style={{ color: theme.textSecondary }}>
          该导入类型尚未接入
        </Text>
      </View>
    );
  }

  const onDownloadTemplate = () => {
    exportMutation.mutate(
      {
        filename: STAFF_IMPORT_TEMPLATE_FILENAME,
        mimeType: XLSX_MIME,
        encoding: "base64",
        dialogTitle: "下载会员导入模板",
        build: () => buildStaffImportTemplate(),
      },
      { onError: (e) => toast.error(e.message) },
    );
  };

  const onPickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        XLSX_MIME,
        "application/vnd.ms-excel",
        "application/octet-stream",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;
    const name = (asset.name ?? "").toLowerCase();
    const mime = asset.mimeType ?? "";
    const isXlsx =
      name.endsWith(".xlsx") ||
      mime === XLSX_MIME ||
      mime.includes("spreadsheetml");
    if (!isXlsx) {
      // 非 xlsx：不改库、不报错
      return;
    }

    try {
      const base64 = await readAsStringAsync(asset.uri, {
        encoding: EncodingType.Base64,
      });
      const rows = parseStaffImportWorkbook(base64);
      const existing = await repos.staff.list({ includeVoided: true });
      const admin = await repos.staff.getById(ADMIN_STAFF_ID);
      const adminName = admin?.name ?? "管理员";
      const next = previewStaffImport(rows, existing, adminName);
      setPreview(next);
      setFailOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const onConfirm = () => {
    if (!preview || preview.ok.length === 0) return;
    importStaff.mutate(preview.ok, {
      onSuccess: () => router.back(),
    });
  };

  const n = preview?.ok.length ?? 0;

  return (
    <ScrollView
      testID="import-form-staff"
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.actions}>
        <Pressable
          testID="import-download-template"
          onPress={onDownloadTemplate}
          disabled={exportMutation.isPending}
          style={[
            styles.btn,
            {
              borderColor: theme.border,
              opacity: exportMutation.isPending ? 0.5 : 1,
            },
          ]}
        >
          <Text style={{ color: theme.text, fontWeight: "600" }}>
            {exportMutation.isPending ? "下载中…" : "下载模板"}
          </Text>
        </Pressable>
        <Pressable
          testID="import-pick-file"
          onPress={() => {
            void onPickFile();
          }}
          style={[styles.btn, { borderColor: theme.border }]}
        >
          <Text style={{ color: theme.text, fontWeight: "600" }}>
            选择文件
          </Text>
        </Pressable>
      </View>

      {preview != null && (
        <View testID="import-preview">
          <Text
            testID="import-ok-count"
            style={[styles.sectionTitle, { color: theme.text }]}
          >
            可导入 {preview.ok.length} 条
          </Text>
          <View
            testID="import-ok-table"
            style={[styles.table, { borderColor: theme.border }]}
          >
            <View style={[styles.tableRow, styles.tableHead]}>
              {["姓名", "电话", "备注", "等级"].map((h) => (
                <Text
                  key={h}
                  style={[styles.cell, styles.headCell, { color: theme.textSecondary }]}
                >
                  {h}
                </Text>
              ))}
            </View>
            {preview.ok.map((row) => (
              <View
                key={row.row}
                testID={`import-ok-row-${row.row}`}
                style={styles.tableRow}
              >
                <Text style={[styles.cell, { color: theme.text }]}>
                  {row.name}
                </Text>
                <Text style={[styles.cell, { color: theme.text }]}>
                  {row.phone}
                </Text>
                <Text style={[styles.cell, { color: theme.text }]}>
                  {row.notes}
                </Text>
                <Text style={[styles.cell, { color: theme.text }]}>
                  {row.level === "gold" ? "星站" : "普站"}
                </Text>
              </View>
            ))}
          </View>

          {preview.fail.length > 0 && (
            <View testID="import-fail-section" style={styles.failSection}>
              <Pressable
                testID="import-fail-toggle"
                onPress={() => setFailOpen((o) => !o)}
                style={styles.failToggle}
              >
                <Text style={{ color: theme.textSecondary, fontWeight: "600" }}>
                  失败 {preview.fail.length} 条{failOpen ? " ▾" : " ▸"}
                </Text>
              </Pressable>
              {failOpen &&
                preview.fail.map((f) => (
                  <Text
                    key={f.row}
                    testID={`import-fail-row-${f.row}`}
                    style={{ color: theme.textSecondary, marginTop: 4 }}
                  >
                    第 {f.row} 行：{f.reason}
                  </Text>
                ))}
            </View>
          )}

          {confirmExtra != null ? (
            <View testID="import-confirm-extra">{confirmExtra}</View>
          ) : null}

          <Pressable
            testID="import-confirm"
            onPress={onConfirm}
            disabled={n === 0 || importStaff.isPending}
            style={[
              styles.confirmBtn,
              {
                backgroundColor: theme.success,
                opacity: n === 0 || importStaff.isPending ? 0.5 : 1,
              },
            ]}
          >
            <Text style={styles.confirmText}>
              {importStaff.isPending
                ? "导入中…"
                : `确认导入 ${n} 个会员`}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, gap: 12, paddingBottom: BottomTabInset },
  actions: { flexDirection: "row", gap: 8 },
  btn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "600", marginBottom: 8 },
  table: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  tableHead: { backgroundColor: "transparent" },
  tableRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8 },
  cell: { flex: 1, fontSize: 13 },
  headCell: { fontWeight: "600" },
  failSection: { marginTop: 12 },
  failToggle: { paddingVertical: 4 },
  confirmBtn: {
    marginTop: 16,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});

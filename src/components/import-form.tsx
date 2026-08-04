import * as DocumentPicker from "expo-document-picker";
import {
  cacheDirectory,
  copyAsync,
  EncodingType,
  readAsStringAsync,
} from "expo-file-system/legacy";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useToast } from "@/components/toast";
import { BottomTabInset } from "@/constants/theme";
import { ADMIN_STAFF_ID } from "@/data/staff";
import { XLSX_MIME } from "@/export/types";
import {
  useImportProducts,
  useImportRestocks,
  useImportStaff,
} from "@/hooks/mutations";
import { useExport } from "@/hooks/use-export";
import { useTheme } from "@/hooks/use-theme";
import {
  buildProductImportTemplate,
  PRODUCT_IMPORT_TEMPLATE_FILENAME,
} from "@/import/build-product-import-template";
import {
  buildRestockImportTemplate,
  RESTOCK_IMPORT_TEMPLATE_FILENAME,
} from "@/import/build-restock-import-template";
import {
  buildStaffImportTemplate,
  STAFF_IMPORT_TEMPLATE_FILENAME,
} from "@/import/build-staff-import-template";
import { parseProductImportWorkbook } from "@/import/parse-product-import-workbook";
import { parseRestockImportWorkbook } from "@/import/parse-restock-import-workbook";
import { parseStaffImportWorkbook } from "@/import/parse-staff-import-workbook";
import {
  previewProductImport,
  type ProductImportFail,
  type ProductImportOk,
} from "@/import/preview-product-import";
import {
  previewRestockImport,
  type RestockImportFail,
  type RestockImportOk,
} from "@/import/preview-restock-import";
import {
  previewStaffImport,
  type StaffImportFail,
  type StaffImportOk,
} from "@/import/preview-staff-import";
import { formatCentsAsYuan } from "@/lib/format-cents-as-yuan";
import { useRepos } from "@/providers/providers";

/** Import kinds the shell accepts (manage-import #01/#02/#03). */
export type ImportKind = "staff" | "product" | "restock";

export type ImportFormProps = {
  kind: ImportKind;
  /**
   * Optional slot rendered above the confirm button.
   * Staff/product unused; restock (#03) injects batch note here when provided,
   * otherwise restock renders its own batch-note field in this slot.
   */
  confirmExtra?: ReactNode;
};

type StaffPreview = {
  ok: StaffImportOk[];
  fail: StaffImportFail[];
};

type ProductPreview = {
  ok: ProductImportOk[];
  fail: ProductImportFail[];
};

type RestockPreview = {
  ok: RestockImportOk[];
  fail: RestockImportFail[];
};

/**
 * Kind-parameterized import shell (manage-import #01/#02/#03).
 * Root-Stack sibling of record-form / topup-form. Staff / product / restock
 * paths share download → pick → preview → confirm UX.
 */
export function ImportForm({ kind, confirmExtra }: ImportFormProps) {
  const theme = useTheme();
  const toast = useToast();
  const repos = useRepos();
  const exportMutation = useExport();
  const importStaff = useImportStaff();
  const importProducts = useImportProducts();
  const importRestocks = useImportRestocks();
  const [staffPreview, setStaffPreview] = useState<StaffPreview | null>(null);
  const [productPreview, setProductPreview] = useState<ProductPreview | null>(
    null,
  );
  const [restockPreview, setRestockPreview] = useState<RestockPreview | null>(
    null,
  );
  const [failOpen, setFailOpen] = useState(false);
  const [batchNote, setBatchNote] = useState("");

  const preview =
    kind === "staff"
      ? staffPreview
      : kind === "product"
        ? productPreview
        : restockPreview;
  const importPending =
    kind === "staff"
      ? importStaff.isPending
      : kind === "product"
        ? importProducts.isPending
        : importRestocks.isPending;

  const onDownloadTemplate = () => {
    if (kind === "staff") {
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
      return;
    }
    if (kind === "product") {
      exportMutation.mutate(
        {
          filename: PRODUCT_IMPORT_TEMPLATE_FILENAME,
          mimeType: XLSX_MIME,
          encoding: "base64",
          dialogTitle: "下载商品导入模板",
          build: () => buildProductImportTemplate(),
        },
        { onError: (e) => toast.error(e.message) },
      );
      return;
    }
    exportMutation.mutate(
      {
        filename: RESTOCK_IMPORT_TEMPLATE_FILENAME,
        mimeType: XLSX_MIME,
        encoding: "base64",
        dialogTitle: "下载补货导入模板",
        build: () => buildRestockImportTemplate(),
      },
      { onError: (e) => toast.error(e.message) },
    );
  };

  const onPickFile = async () => {
    try {
      // Android Expo Go: DocumentPicker's own cache copy lands outside the
      // experience-scoped sandbox that legacy readAsStringAsync may read.
      // Keep content:// (or any URI outside cacheDirectory), copy into
      // scoped cache, then read.
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          XLSX_MIME,
          "application/vnd.ms-excel",
          "application/octet-stream",
        ],
        copyToCacheDirectory: false,
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

      const scopedCache = cacheDirectory ?? "";
      let readUri = asset.uri;
      if (
        asset.uri.startsWith("content://") ||
        !asset.uri.startsWith(scopedCache)
      ) {
        const dest = `${scopedCache}import-${Date.now()}.xlsx`;
        await copyAsync({ from: asset.uri, to: dest });
        readUri = dest;
      }
      const base64 = await readAsStringAsync(readUri, {
        encoding: EncodingType.Base64,
      });
      if (kind === "staff") {
        const rows = parseStaffImportWorkbook(base64);
        const existing = await repos.staff.list({ includeVoided: true });
        const admin = await repos.staff.getById(ADMIN_STAFF_ID);
        const adminName = admin?.name ?? "管理员";
        setStaffPreview(previewStaffImport(rows, existing, adminName));
      } else if (kind === "product") {
        const rows = parseProductImportWorkbook(base64);
        const existing = await repos.products.list({ includeVoided: true });
        setProductPreview(previewProductImport(rows, existing));
      } else {
        const rows = parseRestockImportWorkbook(base64);
        // includeVoided so preview can distinguish 不存在 vs 已删除
        const products = await repos.products.list({ includeVoided: true });
        setRestockPreview(previewRestockImport(rows, products));
      }
      setFailOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const onConfirm = () => {
    if (!preview || preview.ok.length === 0) return;
    if (kind === "staff") {
      importStaff.mutate(preview.ok as StaffImportOk[], {
        onSuccess: () => router.back(),
      });
      return;
    }
    if (kind === "product") {
      importProducts.mutate(preview.ok as ProductImportOk[], {
        onSuccess: () => router.back(),
      });
      return;
    }
    importRestocks.mutate(
      { rows: preview.ok as RestockImportOk[], note: batchNote },
      { onSuccess: () => router.back() },
    );
  };

  const n = preview?.ok.length ?? 0;
  const confirmLabel =
    kind === "staff"
      ? `确认导入 ${n} 个会员`
      : kind === "product"
        ? `确认导入 ${n} 个商品`
        : `确认导入 ${n} 笔补货`;

  const formTestId =
    kind === "staff"
      ? "import-form-staff"
      : kind === "product"
        ? "import-form-product"
        : "import-form-restock";

  const restockNoteSlot = (
    <View style={styles.batchNoteField}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
        备注
      </Text>
      <TextInput
        testID="import-batch-note"
        style={[
          styles.batchNoteInput,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
        placeholder="整批共用备注（可空）"
        placeholderTextColor={theme.textSecondary}
        value={batchNote}
        onChangeText={setBatchNote}
      />
    </View>
  );

  const extraSlot =
    confirmExtra != null
      ? confirmExtra
      : kind === "restock"
        ? restockNoteSlot
        : null;

  return (
    <ScrollView
      testID={formTestId}
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <Text
        testID="import-format-hint"
        style={[styles.formatHint, { color: theme.textSecondary }]}
      >
        仅支持模板文件内容格式导入，如有需要可下载模板
      </Text>
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
            {kind === "staff" ? (
              <>
                <View style={[styles.tableRow, styles.tableHead]}>
                  {(
                    [
                      { key: "姓名", style: styles.cell },
                      { key: "电话", style: styles.cell },
                      { key: "备注", style: styles.cell },
                      { key: "等级", style: styles.cellLevel },
                    ] as const
                  ).map((h) => (
                    <Text
                      key={h.key}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[
                        h.style,
                        styles.headCell,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {h.key}
                    </Text>
                  ))}
                </View>
                {(preview.ok as StaffImportOk[]).map((row) => (
                  <View
                    key={row.row}
                    testID={`import-ok-row-${row.row}`}
                    style={styles.tableRow}
                  >
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[styles.cell, { color: theme.text }]}
                    >
                      {row.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[styles.cell, { color: theme.text }]}
                    >
                      {row.phone}
                    </Text>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[styles.cell, { color: theme.text }]}
                    >
                      {row.notes}
                    </Text>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[styles.cellLevel, { color: theme.text }]}
                    >
                      {row.level === "gold" ? "星站" : "普站"}
                    </Text>
                  </View>
                ))}
              </>
            ) : kind === "product" ? (
              <>
                <View style={[styles.tableRow, styles.tableHead]}>
                  {["名称", "单价"].map((h) => (
                    <Text
                      key={h}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[
                        styles.cell,
                        styles.headCell,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {h}
                    </Text>
                  ))}
                </View>
                {(preview.ok as ProductImportOk[]).map((row) => (
                  <View
                    key={row.row}
                    testID={`import-ok-row-${row.row}`}
                    style={styles.tableRow}
                  >
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[styles.cell, { color: theme.text }]}
                    >
                      {row.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[styles.cell, { color: theme.text }]}
                    >
                      {formatCentsAsYuan(row.purchase_price)}
                    </Text>
                  </View>
                ))}
              </>
            ) : (
              <>
                <View style={[styles.tableRow, styles.tableHead]}>
                  {["商品名称", "数量"].map((h) => (
                    <Text
                      key={h}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[
                        styles.cell,
                        styles.headCell,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {h}
                    </Text>
                  ))}
                </View>
                {(preview.ok as RestockImportOk[]).map((row) => (
                  <View
                    key={row.row}
                    testID={`import-ok-row-${row.row}`}
                    style={styles.tableRow}
                  >
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[styles.cell, { color: theme.text }]}
                    >
                      {row.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[styles.cell, { color: theme.text }]}
                    >
                      {row.qty}
                    </Text>
                  </View>
                ))}
              </>
            )}
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

          {extraSlot != null ? (
            <View testID="import-confirm-extra">{extraSlot}</View>
          ) : null}

          <Pressable
            testID="import-confirm"
            onPress={onConfirm}
            disabled={n === 0 || importPending}
            style={[
              styles.confirmBtn,
              {
                backgroundColor: theme.success,
                opacity: n === 0 || importPending ? 0.5 : 1,
              },
            ]}
          >
            <Text style={styles.confirmText}>
              {importPending ? "导入中…" : confirmLabel}
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
  formatHint: { fontSize: 13, lineHeight: 18 },
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
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  cell: { flex: 1, minWidth: 0, fontSize: 13 },
  /** 等级仅两字：不占 1/4 均分宽，按内容收在末列 */
  cellLevel: { flex: 0, marginLeft: 8, fontSize: 13 },
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
  batchNoteField: { marginTop: 12, gap: 6 },
  fieldLabel: { fontSize: 13 },
  batchNoteInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
});

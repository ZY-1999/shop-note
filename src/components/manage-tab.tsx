import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { MoneyText } from "@/components/money-text";
import { SmokeEntry } from "@/components/smoke-entry";
import { useToast } from "@/components/toast";
import { BottomTabInset } from "@/constants/theme";
import { cents, type Cents } from "@/data/primitives";
import {
  ADMIN_STAFF_ID,
  DEFAULT_STAFF_LEVEL,
  STAFF_LEVELS,
  type StaffLevel,
} from "@/data/staff";
import {
  buildProductWorkbook,
  productExportFilename,
} from "@/export/build-product-workbook";
import {
  buildStaffWorkbook,
  staffExportFilename,
} from "@/export/build-staff-workbook";
import { XLSX_MIME } from "@/export/types";
import {
  useCreateProduct,
  useCreateStaff,
  useCreateStockRecord,
  useRestoreProduct,
  useRestoreStaff,
  useUpdateProduct,
  useUpdateStaff,
  useUpdateUnitPrice,
  useVoidProduct,
  useVoidStaff,
} from "@/hooks/mutations";
import { useExport } from "@/hooks/use-export";
import { useProducts, useStaff, useUnitPrice } from "@/hooks/reads";
import { useTheme } from "@/hooks/use-theme";
import { useRepos } from "@/providers/providers";
import { ItemsSeletor, PickedLine } from "./items-selector";
import { MemberName } from "./member-name";

/**
 * The 管理 tab (spec #09) — master-data maintenance. A staff|product toggle over
 * two parallel CRUD domains: staff (create/edit/search/soft-delete/restore) and
 * products (same, plus cost-price editing that instantly revalues all current
 * inventory). Everything created here becomes selectable in 记账 (#5/#6); a
 * price change reflows through 记账 summaries + 汇总 (#8) automatically.
 *
 * Soft-delete is delegated to the repos: every selector/search excludes voided,
 * so a voided staff/product drops out of 记账 selectors with no extra wiring, and
 * history/snapshots are never erased (PRD: no hard delete). The dev-only smoke
 * entry (#4) stays put below the CRUD region.
 */
type Domain = "staff" | "product" | "restock" | "config";

export type ImportKind = "staff" | "product" | "restock";

export type ManageTabProps = {
  /** Route adapter supplies navigation — keep ManageTab router-agnostic (ADR-0006). */
  onImport: (kind: ImportKind) => void;
};

export function ManageTab({ onImport }: ManageTabProps) {
  const theme = useTheme();
  const [domain, setDomain] = useState<Domain>("staff");

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.segments, { borderColor: theme.border }]}>
        <Pressable
          testID="seg-staff"
          onPress={() => setDomain("staff")}
          style={[
            styles.segment,
            domain === "staff" && { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              { color: domain === "staff" ? theme.text : theme.textSecondary },
            ]}
          >
            会员
          </Text>
        </Pressable>
        <Pressable
          testID="seg-product"
          onPress={() => setDomain("product")}
          style={[
            styles.segment,
            domain === "product" && {
              backgroundColor: theme.backgroundSelected,
            },
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              {
                color: domain === "product" ? theme.text : theme.textSecondary,
              },
            ]}
          >
            商品
          </Text>
        </Pressable>
        <Pressable
          testID="seg-restock"
          onPress={() => setDomain("restock")}
          style={[
            styles.segment,
            domain === "restock" && {
              backgroundColor: theme.backgroundSelected,
            },
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              {
                color: domain === "restock" ? theme.text : theme.textSecondary,
              },
            ]}
          >
            补货
          </Text>
        </Pressable>
        <Pressable
          testID="seg-config"
          onPress={() => setDomain("config")}
          style={[
            styles.segment,
            domain === "config" && {
              backgroundColor: theme.backgroundSelected,
            },
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              { color: domain === "config" ? theme.text : theme.textSecondary },
            ]}
          >
            配置
          </Text>
        </Pressable>
      </View>

      {domain === "staff" ? (
        <StaffManage onImport={() => onImport("staff")} />
      ) : domain === "product" ? (
        <ProductManage onImport={() => onImport("product")} />
      ) : domain === "restock" ? (
        <RestockManage onImport={() => onImport("restock")} />
      ) : (
        <ConfigManage />
      )}

      {__DEV__ && <SmokeEntry />}
    </View>
  );
}

/**
 * 配置 (config) — the global unit price (stock-balance-refactor). The operator
 * enters the per-bundle price in 元; on save it is parsed to Cents and posted
 * via `useUpdateUnitPrice`. New checkouts freeze this price; existing records
 * keep their own snapshots. (spec 04)
 */
function ConfigManage() {
  const theme = useTheme();
  const unitPrice = useUnitPrice();
  const updateUnitPrice = useUpdateUnitPrice();
  const [price, setPrice] = useState("" + (unitPrice.data ?? 0));
  const [error, setError] = useState<string | null>(null);
  // input 直接承载当前单价：data 加载/更新时同步进 input（冷启动显 "0"，保存成功
  // 后 invalidate 回来的新值也回显）。dirty 在用户编辑后挡住 query 延迟 resolve 的
  // 回写，避免覆盖正在输入的值；保存成功后复位，让新 data 重新同步进 input。
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current && unitPrice.data != null) {
      setPrice((unitPrice.data / 100).toString());
    }
  }, [unitPrice.data]);

  const submit = () => {
    const yuan = parseFloat(price);
    if (!isFinite(yuan) || yuan < 0) {
      setError("请输入有效单价");
      return;
    }
    setError(null);
    setSaved(false);
    updateUnitPrice.mutate(cents(Math.round(yuan * 100)), {
      onSuccess: () => {
        setSaved(true);
        dirty.current = false; // 允许 invalidate 回来的新 data 重新同步进 input
      },
    });
  };

  return (
    <View testID="view-config" style={styles.form}>
      <Text style={{ color: theme.textSecondary }}>
        全局单价（每单 元）—— 出库时按此拆分单数 + 零售
      </Text>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          单价（元）
        </Text>
        <TextInput
          testID="config-price-input"
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          value={price}
          onChangeText={(v) => {
            dirty.current = true;
            setSaved(false);
            setPrice(v);
          }}
          keyboardType="decimal-pad"
        />
      </View>
      {error && (
        <Text testID="config-error" style={{ color: theme.danger }}>
          {error}
        </Text>
      )}
      {updateUnitPrice.isError && (
        <Text testID="config-save-error" style={{ color: theme.danger }}>
          保存失败：
          {updateUnitPrice.error instanceof Error
            ? updateUnitPrice.error.message
            : String(updateUnitPrice.error ?? "未知错误")}
        </Text>
      )}
      <Pressable
        testID="config-submit"
        onPress={submit}
        disabled={updateUnitPrice.isPending}
        style={[styles.createBtn, { backgroundColor: theme.success }]}
      >
        <Text style={styles.createBtnText}>
          {updateUnitPrice.isPending
            ? "保存中…"
            : saved
              ? "已保存"
              : "保存单价"}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Restock (补货) — post an `in` movement under the admin `-1` (stock-balance-
 * refactor). The operator picks a product, enters a qty, and submits; the record
 * lands under `ADMIN_STAFF_ID`, so the direction guard admits it and `shopAggregate`
 * reflects the restock on the next read. This is the ONLY place stock enters the
 * system — members only check out. (配置 segment lands in spec 04.)
 */
function RestockManage({ onImport }: { onImport: () => void }) {
  const theme = useTheme();
  const createRecord = useCreateStockRecord();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const [selectedItems, setSelectedItems] = useState<PickedLine[]>([]);

  const submit = () => {
    if (!selectedItems || selectedItems.length < 1) {
      setError("请选择商品");
      return;
    }
    setError(null);
    createRecord.mutate(
      {
        staff_id: ADMIN_STAFF_ID,
        direction: "in",
        timestamp: Date.now(),
        note: note.trim() || undefined,
        items: selectedItems.map((l) => ({
          product_id: l.productId,
          qty: Number(l.qty),
        })),
      },
      {
        onSuccess: () => {
          setSelectedItems([]);
          setNote("");
        },
      },
    );
  };

  return (
    <ScrollView
      testID="view-restock"
      style={styles.domain}
      contentContainerStyle={styles.listContent}
    >
      <View style={styles.filterBar}>
        <View style={styles.filterSpacer} />
        <Pressable
          testID="restock-import"
          onPress={onImport}
          style={[styles.exportBtn, { borderColor: theme.border }]}
        >
          <Text style={{ color: theme.text, fontWeight: "600" }}>导入</Text>
        </Pressable>
      </View>
      <Text style={{ color: theme.textSecondary }}>选择商品补货</Text>
      <ItemsSeletor
        value={selectedItems}
        onChange={(value) => {
          setSelectedItems(value);
          setError(null);
        }}
      />
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
          备注
        </Text>
        <TextInput
          testID="note"
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          placeholder="单号 / 原因"
          placeholderTextColor={theme.textSecondary}
          value={note}
          onChangeText={setNote}
        />
      </View>
      {error && (
        <Text testID="restock-error" style={{ color: theme.danger }}>
          {error}
        </Text>
      )}
      <Pressable
        testID="restock-submit"
        onPress={submit}
        disabled={createRecord.isPending}
        style={[styles.createBtn, { backgroundColor: theme.success }]}
      >
        <Text style={styles.createBtnText}>
          {createRecord.isPending ? "保存中…" : "补货入库"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

/**
 * Staff CRUD — searchable list + create/edit form. Default list is active-only;
 * 「包含删除」Switch (testID staff-include-voided) shares includeVoided with
 * search so voided members can be found and restored. Top-bar right
 * 「导入｜导出」— import left of export (manage-import #01 / manage-export #03).
 */
function StaffManage({ onImport }: { onImport: () => void }) {
  const theme = useTheme();
  const toast = useToast();
  const exportMutation = useExport();
  const [search, setSearch] = useState("");
  const [includeVoided, setIncludeVoided] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const staff = useStaff(
    search ? { search, includeVoided } : { includeVoided },
  );
  const voidStaff = useVoidStaff();
  const restoreStaff = useRestoreStaff();
  const rows = staff.data ?? [];

  if (creating) {
    return <StaffForm onDone={() => setCreating(false)} />;
  }
  if (editingId) {
    return <StaffForm staffId={editingId} onDone={() => setEditingId(null)} />;
  }

  const onExport = () => {
    exportMutation.mutate(
      {
        filename: staffExportFilename(),
        mimeType: XLSX_MIME,
        encoding: "base64",
        dialogTitle: "导出会员",
        build: () => buildStaffWorkbook(rows, { includeVoided }),
      },
      { onError: (e) => toast.error(e.message) },
    );
  };

  return (
    <ScrollView
      testID="view-staff"
      style={styles.domain}
      contentContainerStyle={styles.listContent}
    >
      <View style={styles.filterBar}>
        <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>
          包含删除
        </Text>
        <Switch
          testID="staff-include-voided"
          value={includeVoided}
          onValueChange={setIncludeVoided}
        />
        <View style={styles.filterSpacer} />
        <Pressable
          testID="staff-import"
          onPress={onImport}
          style={[styles.exportBtn, { borderColor: theme.border }]}
        >
          <Text style={{ color: theme.text, fontWeight: "600" }}>导入</Text>
        </Pressable>
        <Pressable
          testID="staff-export"
          onPress={onExport}
          disabled={exportMutation.isPending}
          style={[
            styles.exportBtn,
            {
              borderColor: theme.border,
              opacity: exportMutation.isPending ? 0.5 : 1,
            },
          ]}
        >
          <Text style={{ color: theme.text, fontWeight: "600" }}>
            {exportMutation.isPending ? "导出中…" : "导出"}
          </Text>
        </Pressable>
      </View>
      <TextInput
        testID="staff-search"
        style={[
          styles.searchInput,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
        placeholder="搜索会员姓名或电话"
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
      />
      <Pressable
        testID="staff-create"
        onPress={() => setCreating(true)}
        style={[styles.createBtn, { backgroundColor: theme.success }]}
      >
        <Text style={styles.createBtnText}>新增会员</Text>
      </Pressable>
      {rows.map((item) => {
        const voided = item.voided_at != null;
        return (
          <Pressable
            key={item.id}
            testID={`manage-staff-${item.id}`}
            style={[styles.row, { borderColor: theme.border }]}
            disabled={voided}
            onPress={voided ? undefined : () => setEditingId(item.id)}
          >
            <View style={styles.rowMain}>
              <MemberName
                name={item.name}
                level={item.level}
                nameStyle={[
                  styles.name,
                  { color: voided ? theme.textSecondary : theme.text },
                ]}
                maxWidth={230}
              />
              <Text style={[styles.sub, { color: theme.textSecondary }]}>
                {item.phone || "--"}
              </Text>
            </View>
            {voided ? (
              <>
                <Text style={[styles.voidedTag, { color: theme.danger }]}>
                  已删除
                </Text>
                <Pressable
                  testID={`staff-restore-${item.id}`}
                  onPress={() => restoreStaff.mutate(item.id)}
                  style={[styles.rowAction, { borderColor: theme.border }]}
                >
                  <Text style={{ color: theme.text }}>恢复</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                testID={`staff-void-${item.id}`}
                onPress={() => voidStaff.mutate(item.id)}
                style={[styles.rowAction, { borderColor: theme.danger }]}
              >
                <Text style={{ color: theme.danger }}>删除</Text>
              </Pressable>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Staff create/edit form (spec #09). name/phone/notes, controlled; pre-submit
 * validation (name required — mirrors the repo's not-empty expectation).
 *
 * Create submits through `useCreateStaff`; edit mode (pass `staffId`) preloads
 * the staff and submits through `useUpdateStaff`. Both invalidate qk.staff so
 * every staff read refetches; `onDone` returns to the list.
 */
function StaffForm({
  staffId,
  onDone,
}: {
  staffId?: string;
  onDone: () => void;
}) {
  const theme = useTheme();
  const repos = useRepos();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const editing = staffId != null;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [level, setLevel] = useState<StaffLevel>(DEFAULT_STAFF_LEVEL);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!editing);

  // Preload the staff once for edit mode (one-shot read — same posture as
  // ProductForm's preload; the list refetch on save shows the new values).
  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    void repos.staff.getById(staffId).then((s) => {
      if (cancelled || !s) return;
      setName(s.name);
      setPhone(s.phone);
      setNotes(s.notes);
      setLevel(s.level);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [staffId, repos]);

  const submit = () => {
    if (!name.trim()) {
      setError("请输入姓名");
      return;
    }
    setError(null);
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      notes: notes.trim(),
      level,
    };
    if (editing && staffId) {
      updateStaff.mutate({ staffId, patch: payload }, { onSuccess: onDone });
    } else {
      createStaff.mutate(payload, { onSuccess: onDone });
    }
  };

  if (!loaded) return null;

  return (
    <View testID="staff-form" style={styles.form}>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>姓名</Text>
        <TextInput
          testID="staff-name-input"
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          value={name}
          onChangeText={setName}
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          电话（可选）
        </Text>
        <TextInput
          testID="staff-phone-input"
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          value={phone}
          onChangeText={setPhone}
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          备注（可选）
        </Text>
        <TextInput
          testID="staff-notes-input"
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>等级</Text>
        <View style={styles.levelSegs}>
          {[...STAFF_LEVELS]
            .sort((a, b) => a.rank - b.rank)
            .map(({ code, label }) => {
              const selected = level === code;
              return (
                <Pressable
                  key={code}
                  testID={`staff-level-${code}`}
                  onPress={() => setLevel(code)}
                  style={[
                    styles.levelSeg,
                    { borderColor: theme.border },
                    selected && { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? theme.text : theme.textSecondary,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      </View>
      {error && (
        <Text testID="staff-form-error" style={{ color: theme.danger }}>
          {error}
        </Text>
      )}
      <View style={styles.formActions}>
        <Pressable
          testID="staff-submit"
          onPress={submit}
          disabled={createStaff.isPending || updateStaff.isPending}
          style={[styles.actionBtn, { backgroundColor: theme.success }]}
        >
          <Text style={styles.createBtnText}>
            {createStaff.isPending || updateStaff.isPending
              ? "保存中…"
              : "保存"}
          </Text>
        </Pressable>
        <Pressable
          testID="staff-cancel"
          onPress={onDone}
          style={[styles.actionBtn, { borderColor: theme.border }]}
        >
          <Text style={{ color: theme.text }}>取消</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Product CRUD — mirrors StaffManage: searchable list + create/edit form.
 * Default list is active-only; 「包含删除」shares includeVoided with search.
 * Top-bar right 「导入｜导出」— import left of export (manage-import #02 /
 * manage-export #04).
 */
function ProductManage({ onImport }: { onImport: () => void }) {
  const theme = useTheme();
  const toast = useToast();
  const exportMutation = useExport();
  const [search, setSearch] = useState("");
  const [includeVoided, setIncludeVoided] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const products = useProducts(
    search
      ? { search: { text: search }, includeVoided }
      : { includeVoided },
  );
  const voidProduct = useVoidProduct();
  const restoreProduct = useRestoreProduct();
  const rows = products.data ?? [];

  if (creating) {
    return <ProductForm onDone={() => setCreating(false)} />;
  }
  if (editingId) {
    return (
      <ProductForm productId={editingId} onDone={() => setEditingId(null)} />
    );
  }

  const onExport = () => {
    exportMutation.mutate(
      {
        filename: productExportFilename(),
        mimeType: XLSX_MIME,
        encoding: "base64",
        dialogTitle: "导出商品",
        build: () => buildProductWorkbook(rows, { includeVoided }),
      },
      { onError: (e) => toast.error(e.message) },
    );
  };

  return (
    <ScrollView
      testID="view-product"
      style={styles.domain}
      contentContainerStyle={styles.listContent}
    >
      <View style={styles.filterBar}>
        <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>
          包含删除
        </Text>
        <Switch
          testID="product-include-voided"
          value={includeVoided}
          onValueChange={setIncludeVoided}
        />
        <View style={styles.filterSpacer} />
        <Pressable
          testID="product-import"
          onPress={onImport}
          style={[styles.exportBtn, { borderColor: theme.border }]}
        >
          <Text style={{ color: theme.text, fontWeight: "600" }}>导入</Text>
        </Pressable>
        <Pressable
          testID="product-export"
          onPress={onExport}
          disabled={exportMutation.isPending}
          style={[
            styles.exportBtn,
            {
              borderColor: theme.border,
              opacity: exportMutation.isPending ? 0.5 : 1,
            },
          ]}
        >
          <Text style={{ color: theme.text, fontWeight: "600" }}>
            {exportMutation.isPending ? "导出中…" : "导出"}
          </Text>
        </Pressable>
      </View>
      <TextInput
        testID="product-search"
        style={[
          styles.searchInput,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
        placeholder="搜索商品名称"
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
      />
      <Pressable
        testID="product-create"
        onPress={() => setCreating(true)}
        style={[styles.createBtn, { backgroundColor: theme.success }]}
      >
        <Text style={styles.createBtnText}>新增商品</Text>
      </Pressable>
      {rows.map((item) => {
        const voided = item.voided_at != null;
        return (
          <Pressable
            key={item.id}
            testID={`manage-product-${item.id}`}
            style={[styles.row, { borderColor: theme.border }]}
            disabled={voided}
            onPress={voided ? undefined : () => setEditingId(item.id)}
          >
            <View style={styles.rowMain}>
              <Text
                style={[
                  styles.name,
                  { color: voided ? theme.textSecondary : theme.text },
                ]}
              >
                {item.title}
              </Text>
              <Text style={[styles.sub, { color: theme.textSecondary }]}>
                <MoneyText cents={item.purchase_price} />
              </Text>
            </View>
            {voided ? (
              <>
                <Text style={[styles.voidedTag, { color: theme.danger }]}>
                  已删除
                </Text>
                <Pressable
                  testID={`product-restore-${item.id}`}
                  onPress={() => restoreProduct.mutate(item.id)}
                  style={[styles.rowAction, { borderColor: theme.border }]}
                >
                  <Text style={{ color: theme.text }}>恢复</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                testID={`product-void-${item.id}`}
                onPress={() => voidProduct.mutate(item.id)}
                style={[styles.rowAction, { borderColor: theme.danger }]}
              >
                <Text style={{ color: theme.danger }}>删除</Text>
              </Pressable>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Product create/edit form (spec #09). title / 元-price (parsed to Cents).
 * Pre-submit validation: title required; price must parse to a positive number.
 * The price input is 元 (user-facing); it's
 * converted to 分 via `cents(Math.round(parseFloat(元) * 100))` — cents() then
 * guarantees integrality.
 *
 * Edit mode: pass `productId` to preload the product and submit via
 * `useUpdateProduct` — whose onSuccess invalidates qk.inventory (the one
 * cross-entity invalidation) so every derived amount revalues at the new price
 * on the next read (ADR-0002).
 */
function ProductForm({
  productId,
  onDone,
}: {
  productId?: string;
  onDone: () => void;
}) {
  const theme = useTheme();
  const repos = useRepos();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const editing = productId != null;
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!editing);

  // Preload the product once for edit mode. (Not a useQuery — the form is a
  // short-lived editor; a one-shot read avoids adding a key the mutation would
  // then have to invalidate. The list refetch on save shows the new values.)
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    void repos.products.getById(productId).then((p) => {
      if (cancelled || !p) return;
      setTitle(p.title);
      setPrice((p.purchase_price / 100).toString());
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [productId, repos]);

  const submit = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("请输入名称");
      return;
    }
    const yuan = parseFloat(price);
    if (!isFinite(yuan) || yuan <= 0) {
      setError("请输入有效单价");
      return;
    }
    const priceCents: Cents = cents(Math.round(yuan * 100));
    setError(null);
    const done = { onSuccess: onDone } as const;
    if (editing && productId) {
      updateProduct.mutate(
        {
          productId,
          patch: { title: trimmedTitle, purchase_price: priceCents },
        },
        done,
      );
    } else {
      createProduct.mutate(
        { title: trimmedTitle, purchase_price: priceCents },
        done,
      );
    }
  };

  if (!loaded) return null;

  return (
    <View testID="product-form" style={styles.form}>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>名称</Text>
        <TextInput
          testID="product-title-input"
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          value={title}
          onChangeText={setTitle}
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          单价（元）
        </Text>
        <TextInput
          testID="product-price-input"
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
        />
      </View>
      {error && (
        <Text testID="product-form-error" style={{ color: theme.danger }}>
          {error}
        </Text>
      )}
      <View style={styles.formActions}>
        <Pressable
          testID="product-submit"
          onPress={submit}
          disabled={createProduct.isPending || updateProduct.isPending}
          style={[styles.actionBtn, { backgroundColor: theme.success }]}
        >
          <Text style={styles.createBtnText}>
            {createProduct.isPending || updateProduct.isPending
              ? "保存中…"
              : "保存"}
          </Text>
        </Pressable>
        <Pressable
          testID="product-cancel"
          onPress={onDone}
          style={[styles.actionBtn, { borderColor: theme.border }]}
        >
          <Text style={{ color: theme.text }}>取消</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8 },
  segments: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  segment: { flex: 1, paddingVertical: 10, alignItems: "center" },
  segmentText: { fontSize: 14, fontWeight: "600" },
  domain: { flex: 1 },
  form: { flex: 1, gap: 8 },
  field: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  fieldLabel: { fontSize: 14, fontWeight: "500" },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterLabel: { fontSize: 14, fontWeight: "500" },
  filterSpacer: { flex: 1 },
  exportBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  label: { fontSize: 13, fontWeight: "500", width: 84 },
  listContent: { gap: 8, paddingBottom: BottomTabInset },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 8,
  },
  rowMain: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  levelSegs: {
    flex: 1,
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  levelSeg: { flex: 1, paddingVertical: 8, alignItems: "center" },
  rowAction: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  voidedTag: { fontSize: 12, fontWeight: "600" },
  name: { fontSize: 16, fontWeight: "600" },
  sub: { fontSize: 13 },
  createBtn: { borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  createBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  formActions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
});

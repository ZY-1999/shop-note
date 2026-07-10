import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SmokeEntry } from '@/components/smoke-entry';
import { MoneyText } from '@/components/money-text';
import {
  useCreateStaff,
  useUpdateStaff,
  useVoidStaff,
  useRestoreStaff,
  useCreateProduct,
  useUpdateProduct,
  useVoidProduct,
  useRestoreProduct,
} from '@/hooks/mutations';
import { useStaff, useProducts } from '@/hooks/reads';
import { useRepos } from '@/providers/providers';
import { useTheme } from '@/hooks/use-theme';
import { cents, type Cents } from '@/data/primitives';

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
type Domain = 'staff' | 'product';

export function ManageTab() {
  const theme = useTheme();
  const [domain, setDomain] = useState<Domain>('staff');

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.segments, { borderColor: theme.border }]}>
        <Pressable
          testID="seg-staff"
          onPress={() => setDomain('staff')}
          style={[styles.segment, domain === 'staff' && { backgroundColor: theme.backgroundSelected }]}>
          <Text style={[styles.segmentText, { color: domain === 'staff' ? theme.text : theme.textSecondary }]}>员工</Text>
        </Pressable>
        <Pressable
          testID="seg-product"
          onPress={() => setDomain('product')}
          style={[styles.segment, domain === 'product' && { backgroundColor: theme.backgroundSelected }]}>
          <Text style={[styles.segmentText, { color: domain === 'product' ? theme.text : theme.textSecondary }]}>商品</Text>
        </Pressable>
      </View>

      {domain === 'staff' ? <StaffManage /> : <ProductManage />}

      {__DEV__ && <SmokeEntry />}
    </View>
  );
}

/**
 * Staff CRUD — searchable list of staff (active + voided, with a restore
 * affordance on voided rows), plus a create/edit form. `list({ includeVoided })`
 * is used so the operator can see and restore soft-deleted staff; search()
 * stays active-only, mirroring how 记账 selectors see the world.
 */
function StaffManage() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const staff = useStaff(search ? { search } : { includeVoided: true });
  const voidStaff = useVoidStaff();
  const restoreStaff = useRestoreStaff();
  const rows = staff.data ?? [];

  if (creating) {
    return <StaffForm onDone={() => setCreating(false)} />;
  }
  if (editingId) {
    return <StaffForm staffId={editingId} onDone={() => setEditingId(null)} />;
  }

  return (
    <ScrollView testID="view-staff" style={styles.domain} contentContainerStyle={styles.listContent}>
      <TextInput
        testID="staff-search"
        style={[styles.searchInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
        placeholder="搜索员工姓名或电话"
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
      />
      <Pressable
        testID="staff-create"
        onPress={() => setCreating(true)}
        style={[styles.createBtn, { backgroundColor: theme.success }]}>
        <Text style={styles.createBtnText}>新增员工</Text>
      </Pressable>
      {rows.map((item) => {
        const voided = item.voided_at != null;
        return (
          <Pressable
            key={item.id}
            testID={`manage-staff-${item.id}`}
            style={[styles.row, { borderColor: theme.border }]}
            disabled={voided}
            onPress={voided ? undefined : () => setEditingId(item.id)}>
            <View style={styles.rowMain}>
              <Text style={[styles.name, { color: voided ? theme.textSecondary : theme.text }]}>{item.name}</Text>
              <Text style={[styles.sub, { color: theme.textSecondary }]}>{item.phone || '--'}</Text>
            </View>
            {voided ? (
              <>
                <Text style={[styles.voidedTag, { color: theme.danger }]}>已删除</Text>
                <Pressable
                  testID={`staff-restore-${item.id}`}
                  onPress={() => restoreStaff.mutate(item.id)}
                  style={[styles.rowAction, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.text }}>恢复</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                testID={`staff-void-${item.id}`}
                onPress={() => voidStaff.mutate(item.id)}
                style={[styles.rowAction, { borderColor: theme.danger }]}>
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
function StaffForm({ staffId, onDone }: { staffId?: string; onDone: () => void }) {
  const theme = useTheme();
  const repos = useRepos();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const editing = staffId != null;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
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
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [staffId, repos]);

  const submit = () => {
    if (!name.trim()) {
      setError('请输入姓名');
      return;
    }
    setError(null);
    const payload = { name: name.trim(), phone: phone.trim(), notes: notes.trim() };
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
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
          value={name}
          onChangeText={setName}
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>电话（可选）</Text>
        <TextInput
          testID="staff-phone-input"
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
          value={phone}
          onChangeText={setPhone}
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>备注（可选）</Text>
        <TextInput
          testID="staff-notes-input"
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
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
          style={[styles.actionBtn, { backgroundColor: theme.success }]}>
          <Text style={styles.createBtnText}>
            {createStaff.isPending || updateStaff.isPending ? '保存中…' : '保存'}
          </Text>
        </Pressable>
        <Pressable testID="staff-cancel" onPress={onDone} style={[styles.actionBtn, { borderColor: theme.border }]}>
          <Text style={{ color: theme.text }}>取消</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Product CRUD (spec #09) — mirrors StaffManage: searchable list (active +
 * voided, restore on voided rows) + a create/edit form (tap a row to edit).
 * Rows show title / price (MoneyText). A price edit revalues inventory on next read
 * (ADR-0002) via useUpdateProduct's cross-entity invalidation (Slice 5).
 */
function ProductManage() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const products = useProducts(search ? { search: { text: search } } : { includeVoided: true });
  const voidProduct = useVoidProduct();
  const restoreProduct = useRestoreProduct();
  const rows = products.data ?? [];

  if (creating) {
    return <ProductForm onDone={() => setCreating(false)} />;
  }
  if (editingId) {
    return <ProductForm productId={editingId} onDone={() => setEditingId(null)} />;
  }

  return (
    <ScrollView testID="view-product" style={styles.domain} contentContainerStyle={styles.listContent}>
      <TextInput
        testID="product-search"
        style={[styles.searchInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
        placeholder="搜索商品名称"
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
      />
      <Pressable
        testID="product-create"
        onPress={() => setCreating(true)}
        style={[styles.createBtn, { backgroundColor: theme.success }]}>
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
            onPress={voided ? undefined : () => setEditingId(item.id)}>
            <View style={styles.rowMain}>
              <Text style={[styles.name, { color: voided ? theme.textSecondary : theme.text }]}>{item.title}</Text>
              <Text style={[styles.sub, { color: theme.textSecondary }]}>
                <MoneyText cents={item.purchase_price} />
              </Text>
            </View>
            {voided ? (
              <>
                <Text style={[styles.voidedTag, { color: theme.danger }]}>已删除</Text>
                <Pressable
                  testID={`product-restore-${item.id}`}
                  onPress={() => restoreProduct.mutate(item.id)}
                  style={[styles.rowAction, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.text }}>恢复</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                testID={`product-void-${item.id}`}
                onPress={() => voidProduct.mutate(item.id)}
                style={[styles.rowAction, { borderColor: theme.danger }]}>
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
function ProductForm({ productId, onDone }: { productId?: string; onDone: () => void }) {
  const theme = useTheme();
  const repos = useRepos();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const editing = productId != null;
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
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
    return () => { cancelled = true; };
  }, [productId, repos]);

  const submit = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('请输入名称');
      return;
    }
    const yuan = parseFloat(price);
    if (!isFinite(yuan) || yuan <= 0) {
      setError('请输入有效单价');
      return;
    }
    const priceCents: Cents = cents(Math.round(yuan * 100));
    setError(null);
    const done = { onSuccess: onDone } as const;
    if (editing && productId) {
      updateProduct.mutate(
        { productId, patch: { title: trimmedTitle, purchase_price: priceCents } },
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
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
          value={title}
          onChangeText={setTitle}
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>单价（元）</Text>
        <TextInput
          testID="product-price-input"
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
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
          style={[styles.actionBtn, { backgroundColor: theme.success }]}>
          <Text style={styles.createBtnText}>
            {createProduct.isPending || updateProduct.isPending ? '保存中…' : '保存'}
          </Text>
        </Pressable>
        <Pressable testID="product-cancel" onPress={onDone} style={[styles.actionBtn, { borderColor: theme.border }]}>
          <Text style={{ color: theme.text }}>取消</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8 },
  segments: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '600' },
  domain: { flex: 1 },
  form: { flex: 1, gap: 8 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, fontWeight: '500', width: 84 },
  listContent: { gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  searchInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  rowMain: { flex: 1, gap: 2 },
  rowAction: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  voidedTag: { fontSize: 12, fontWeight: '600' },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13 },
  createBtn: { borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  formActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
});

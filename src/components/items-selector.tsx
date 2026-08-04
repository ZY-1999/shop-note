import { cents, Cents } from "@/data/primitives";
import { Product } from "@/data/product";
import { useProducts } from "@/hooks/reads";
import { useTheme } from "@/hooks/use-theme";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MoneyText } from "./money-text";

function qtyInt(qty: string): number {
  return Math.floor(Number(qty) || 0);
}

/** `− [qty] +` per line (spec #03). − clamps at 1 (disabled there); 删除 removes the line. */
function QtyStepper({
  index,
  qty,
  onSetQty,
}: {
  index: number;
  qty: string;
  onSetQty: (i: number, qty: string) => void;
}) {
  const theme = useTheme();
  const atMin = qtyInt(qty) <= 1;
  return (
    <View style={styles.stepper}>
      <Pressable
        testID={`dec-${index}`}
        onPress={() => onSetQty(index, String(Math.max(1, qtyInt(qty) - 1)))}
        disabled={atMin}
        style={[
          styles.stepBtn,
          { borderColor: theme.border },
          atMin && { opacity: 0.4 },
        ]}
      >
        <Text style={[styles.stepBtnText, { color: theme.text }]}>−</Text>
      </Pressable>
      <TextInput
        testID={`qty-${index}`}
        style={[
          styles.qtyInput,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
        keyboardType="numeric"
        value={qty}
        onChangeText={(v) => onSetQty(index, v)}
      />
      <Pressable
        testID={`inc-${index}`}
        onPress={() => onSetQty(index, String(qtyInt(qty) + 1))}
        style={[styles.stepBtn, { borderColor: theme.border }]}
      >
        <Text style={[styles.stepBtnText, { color: theme.text }]}>+</Text>
      </Pressable>
    </View>
  );
}

export interface PickedLine {
  /** Stable item id when editing — drives the repo's touched/untouched merge. Undefined for new lines. */
  id?: string;
  productId: string;
  title: string;
  price: Cents;
  qty: string;
}

export function lineAmount(line: PickedLine): number {
  const qtyNum = line.qty.trim() === "" ? 0 : Number(line.qty);
  return Number.isInteger(qtyNum) ? line.price * qtyNum : 0;
}

export interface ItemsSeletorProps {
  value?: PickedLine[];
  onChange?: (value: PickedLine[]) => void;
  unitPrice?: number; // 传入后总计会展示金额成多少单，零售多少
}

export function ItemsSeletor(props: ItemsSeletorProps) {
  const { value, onChange, unitPrice } = props;
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const products = useProducts(
    search ? { search: { text: search } } : undefined,
  );

  const linesWithAmount = (value ?? []).map((l) => ({
    ...l,
    amount: lineAmount(l),
  }));

  const total = linesWithAmount.reduce((old, cur) => old + cur.amount, 0);
  const unitCount = unitPrice ? Math.floor(total / unitPrice) : 0;
  const retail = unitPrice ? total % unitPrice : 0;

  const handleChange = (changeFn: (prev: PickedLine[]) => PickedLine[]) => {
    const newValue = changeFn(value ?? []);
    onChange?.(newValue);
  };

  const pickProduct = (p: Product) => {
    handleChange((prev) => {
      const existing = prev.findIndex((l) => l.productId === p.id);
      if (existing >= 0) {
        return prev.map((l, i) =>
          i === existing ? { ...l, qty: String(qtyInt(l.qty) + 1) } : l,
        );
      }
      return [
        ...prev,
        { productId: p.id, title: p.title, price: p.purchase_price, qty: "1" },
      ];
    });
  };

  const setQty = (index: number, qty: string) => {
    handleChange((prev) =>
      prev.map((l, i) => (i === index ? { ...l, qty } : l)),
    );
  };
  const removeLine = (index: number) =>
    handleChange((prev) => prev.filter((_, i) => i !== index));

  return (
    <View testID="items-selector">
      <TextInput
        testID="product-search"
        style={[
          styles.input,
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
      {products.data && products.data.length > 0 && (
        <ScrollView style={styles.chipsBox}>
          <View style={styles.chips}>
            {products.data.map((p) => {
              const picked = (value ?? []).some((l) => l.productId === p.id);
              return (
                <Pressable
                  key={p.id}
                  testID={`pick-${p.id}`}
                  onPress={() => pickProduct(p)}
                  style={[
                    styles.chip,
                    {
                      borderColor: picked ? theme.success : theme.border,
                      backgroundColor: picked
                        ? theme.backgroundSelected
                        : theme.inputBg,
                    },
                  ]}
                >
                  <Text style={{ color: theme.text }}>{p.title}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
      {linesWithAmount.map((line, i) => (
        <View
          key={`${line.productId}-${i}`}
          testID={`picked-line-${i}`}
          style={[styles.line, { borderColor: theme.border }]}
        >
          <View style={styles.lineLeft}>
            <Text style={[styles.lineTitle, { color: theme.text }]}>
              {line.title}
            </Text>
            <MoneyText cents={cents(line.amount)} />
          </View>
          <View style={[styles.lineRight]}>
            <QtyStepper index={i} qty={line.qty} onSetQty={setQty} />
            <Pressable testID={`remove-${i}`} onPress={() => removeLine(i)}>
              <Text style={{ color: theme.danger }}>删除</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
          合计
        </Text>
        <MoneyText cents={cents(total)} testID="running-total" />
        {unitPrice ? (
          <>
            <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
              计 {unitCount} 单
            </Text>
            <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
              零售
            </Text>
            <MoneyText cents={cents(retail)} testID="running-total" />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    flex: 1,
  },
  chipsBox: {
    maxHeight: 120,
    marginTop: 8,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  line: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 8,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lineLeft: {
    flexDirection: "column",
  },
  lineRight: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  lineTitle: { flex: 1, fontSize: 15 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: { fontSize: 18, fontWeight: "600" },
  qtyInput: {
    width: 60,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 15,
    textAlign: "center",
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    paddingVertical: 8,
  },
  totalLabel: { fontSize: 15 },
});

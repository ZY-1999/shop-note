import { AuditProvider, type AuditAction } from "@/data/audit";
import type { HasId, StoragePort } from "@/data/port";
import { type Cents, id, now } from "@/data/primitives";

/** Product master-data entity. purchase_price is integer cents (Cents brand);
 *  code/category are nullable. voided_at drives soft-delete. */
export interface Product extends HasId {
  title: string;
  purchase_price: Cents;
  code: string | null;
  category: string | null;
  voided_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ProductCreateInput {
  title: string;
  purchase_price: Cents; // the only way to mint a Cents is cents(), which rejects floats
  code?: string;
  category?: string;
}

export interface ProductUpdatePatch {
  title?: string;
  purchase_price?: Cents;
  code?: string | null;
  category?: string | null;
}

/**
 * Product repository — master-data CRUD over the storage port, audit-wired via
 * the audit provider (#02). Mirrors the staff repo's mutation shape. The
 * purchase_price is typed Cents (#01), so floating-point prices are rejected
 * at the type/runtime boundary, not per-call. The cost revaluation triggered
 * by a price change is #07's concern — this repo only guarantees the new price
 * is readable (getById returns even voided products, for #05 snapshots / #07 cost).
 */
export class ProductRepository {
  constructor(
    private storage: StoragePort,
    private audit: AuditProvider,
  ) {}

  async create(input: ProductCreateInput): Promise<Product> {
    const ts = now();
    const product: Product = {
      id: id(),
      title: input.title,
      purchase_price: input.purchase_price,
      code: input.code ?? null,
      category: input.category ?? null,
      voided_at: null,
      created_at: ts,
      updated_at: ts,
    };
    await this.storage.withTransaction(async () => {
      await this.storage.insert("product", product);
      await this.audit.logEvent({
        action: "create",
        entity_type: "product",
        entity_id: product.id,
        after: auditable(product),
      });
    });
    return product;
  }

  async getById(productId: string): Promise<Product | null> {
    return this.storage.findById<Product>("product", productId);
  }

  async list(opts?: { includeVoided?: boolean }): Promise<Product[]> {
    const rows = await this.storage.find<Product>("product", {
      orderBy: { field: "created_at", dir: "asc" },
    });
    if (opts?.includeVoided) return rows;
    return rows.filter((p) => p.voided_at == null);
  }

  async search(q: { text?: string; code?: string; category?: string }): Promise<Product[]> {
    const rows = await this.storage.find<Product>("product", {
      where: { voided_at: null },
      orderBy: { field: "created_at", dir: "asc" },
    });
    const text = q.text?.toLowerCase();
    return rows.filter((p) => {
      if (text !== undefined && !p.title.toLowerCase().includes(text)) return false;
      if (q.code !== undefined && p.code !== q.code) return false;
      if (q.category !== undefined && p.category !== q.category) return false;
      return true;
    });
  }

  async update(productId: string, patch: ProductUpdatePatch): Promise<Product> {
    return this.mutate(productId, "update", (current) => {
      const ts = now();
      return {
        persist: { ...patch, updated_at: ts },
        next: { ...current, ...patch, updated_at: ts },
      };
    });
  }

  async void(productId: string): Promise<Product> {
    return this.mutate(productId, "void", (current) => {
      const ts = now();
      return {
        persist: { voided_at: ts, updated_at: ts },
        next: { ...current, voided_at: ts, updated_at: ts },
      };
    });
  }

  async restore(productId: string): Promise<Product> {
    return this.mutate(productId, "restore", (current) => {
      const ts = now();
      return {
        persist: { voided_at: null, updated_at: ts },
        next: { ...current, voided_at: null, updated_at: ts },
      };
    });
  }

  /**
   * Shared mutation template: read current → compute patch + next → persist →
   * audit before→after, in one transaction. Throws if the product does not exist.
   */
  private async mutate(
    productId: string,
    action: AuditAction,
    compute: (current: Product) => { persist: Partial<Product>; next: Product },
  ): Promise<Product> {
    return this.storage.withTransaction(async () => {
      const current = await this.storage.findById<Product>("product", productId);
      if (!current) throw new Error(`product ${productId} not found`);
      const { persist, next } = compute(current);
      await this.storage.update<Product>("product", productId, persist);
      await this.audit.logEvent({
        action,
        entity_type: "product",
        entity_id: productId,
        before: auditable(current),
        after: auditable(next),
      });
      return next;
    });
  }
}

/**
 * Fields worth auditing — user-visible state + voided_at. Excludes
 * id/created_at/updated_at (system metadata; updated_at would pollute diffs).
 */
function auditable(product: Product): Record<string, unknown> {
  return {
    title: product.title,
    purchase_price: product.purchase_price,
    code: product.code,
    category: product.category,
    voided_at: product.voided_at,
  };
}

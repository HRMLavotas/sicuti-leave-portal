/**
 * simpelClient.js
 *
 * Client langsung ke database SIMPEL menggunakan token SSO dari AuthManager.
 * Menggunakan VITE_SIMPEL_URL + VITE_SIMPEL_ANON_KEY dengan RLS via token user.
 */
import { createClient } from "@supabase/supabase-js";
import { AuthManager } from "./auth";
import { createDisabledAuthOptions, getOrCreateClient } from "./supabaseAuthOptions";

const SIMPEL_URL = import.meta.env.VITE_SIMPEL_URL;
const SIMPEL_ANON_KEY = import.meta.env.VITE_SIMPEL_ANON_KEY;

let _cachedToken = null;

async function getSimpelClient() {
  const session = await AuthManager.ensureFreshSsoSession();
  const token = session?.access_token || AuthManager.getUserSession()?.access_token;
  if (!token) {
    throw new Error("Sesi tidak aktif. Silakan login ulang melalui SIPANDAI.");
  }

  if (_cachedToken === token) {
    return getOrCreateClient("simpel-query", () => createSimpelClient(token));
  }

  _cachedToken = token;
  if (typeof window !== "undefined" && window.__sicutiSupabaseClients) {
    delete window.__sicutiSupabaseClients["simpel-query"];
  }
  return getOrCreateClient("simpel-query", () => createSimpelClient(token));
}

function createSimpelClient(token) {
  const url = SIMPEL_URL;
  const key = SIMPEL_ANON_KEY;
  // Gunakan storageKey yang UNIK dan JANGAN sama dengan SiCuti client!
  const storageKey = "sb-simpel-sso-query-v2";

  return createClient(url, key, {
    ...createDisabledAuthOptions(storageKey),
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

class SimpelQueryBuilder {
  constructor(table) {
    this._table = table;
    this._action = "select";
    this._select = "*";
    this._filters = [];
    this._or = null;
    this._order = null;
    this._range = null;
    this._head = false;
    this._count = null;
    this._single = false;
    this._maybeSingle = false;
    this._limit = null;
    this._data = null;
    this._upsertOptions = null;
  }

  select(columns, options = {}) {
    this._action = "select";
    this._select = columns;
    if (options.head) this._head = true;
    if (options.count) this._count = options.count;
    return this;
  }

  insert(data) {
    this._action = "insert";
    this._data = data;
    return this;
  }

  update(data) {
    this._action = "update";
    this._data = data;
    return this;
  }

  upsert(data, options = {}) {
    this._action = "upsert";
    this._data = data;
    this._upsertOptions = options;
    return this;
  }

  eq(column, value) {
    this._filters.push({ op: "eq", column, value });
    return this;
  }

  in(column, value) {
    this._filters.push({ op: "in", column, value });
    return this;
  }

  ilike(column, value) {
    this._filters.push({ op: "ilike", column, value });
    return this;
  }

  not(column, operator, value) {
    if (operator === "is") {
      this._filters.push({ op: "not.is", column, value });
    }
    return this;
  }

  gte(column, value) {
    this._filters.push({ op: "gte", column, value });
    return this;
  }

  lte(column, value) {
    this._filters.push({ op: "lte", column, value });
    return this;
  }

  or(expression) {
    this._or = expression;
    return this;
  }

  order(column, options = {}) {
    this._order = { column, ascending: options.ascending ?? true };
    return this;
  }

  range(from, to) {
    this._range = { from, to };
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  maybeSingle() {
    this._maybeSingle = true;
    return this;
  }

  _buildPayload() {
    return {
      table: this._table,
      action: this._action,
      select: this._select,
      filters: this._filters,
      or: this._or,
      order: this._order,
      range: this._range,
      head: this._head,
      count: this._count,
      single: this._single,
      maybeSingle: this._maybeSingle,
      limit: this._limit,
      data: this._data,
      upsertOptions: this._upsertOptions,
    };
  }

  async execute() {
    const runQuery = async () => {
      const client = await getSimpelClient();
      let query;

      if (this._action === "select") {
        query = client.from(this._table).select(this._select, {
          count: this._count,
          head: this._head,
        });
      } else if (this._action === "insert") {
        query = client.from(this._table).insert(this._data).select();
      } else if (this._action === "update") {
        query = client.from(this._table).update(this._data);
      } else if (this._action === "upsert") {
        query = client.from(this._table).upsert(this._data, this._upsertOptions ?? {}).select();
      } else {
        throw new Error(`Action tidak didukung: ${this._action}`);
      }

      // Apply filters
      for (const f of this._filters) {
        if (f.op === "eq")     query = query.eq(f.column, f.value);
        else if (f.op === "in")     query = query.in(f.column, f.value);
        else if (f.op === "ilike")  query = query.ilike(f.column, f.value);
        else if (f.op === "not.is") query = query.not(f.column, "is", f.value);
        else if (f.op === "gte")    query = query.gte(f.column, f.value);
        else if (f.op === "lte")    query = query.lte(f.column, f.value);
      }

      if (this._or)    query = query.or(this._or);
      if (this._order) query = query.order(this._order.column, { ascending: this._order.ascending });
      if (this._range) query = query.range(this._range.from, this._range.to);
      if (this._limit) query = query.limit(this._limit);

      let result;
      if (this._single)       result = await query.single();
      else if (this._maybeSingle) result = await query.maybeSingle();
      else                    result = await query;

      return { data: result.data, error: result.error, count: result.count ?? null };
    };

    try {
      const result = await runQuery();
      if (result.error && AuthManager.isAuthTokenError(result.error)) {
        await AuthManager.ensureFreshSsoSession({ force: true });
        return await runQuery();
      }
      return result;
    } catch (err) {
      if (AuthManager.isAuthTokenError(err)) {
        try {
          await AuthManager.ensureFreshSsoSession({ force: true });
          return await runQuery();
        } catch (retryErr) {
          return { data: null, error: retryErr, count: null };
        }
      }
      return { data: null, error: err, count: null };
    }
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }
}

/**
 * Drop-in replacement untuk supabaseSimpelAdmin.
 * API kompatibel: .from('employees').select(...).eq(...)
 */
export const supabaseSimpelAdmin = {
  from(table) {
    return new SimpelQueryBuilder(table);
  },
};

export default supabaseSimpelAdmin;

/**
 * useTemplates - Shared hook untuk memuat template DOCX dari Supabase.
 * Menggunakan module-level cache agar template tidak dimuat ulang
 * setiap kali komponen di-mount.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AuthManager } from "@/lib/auth";

// Module-level cache â€“ bertahan selama sesi browser
let _cachedTemplates = null;
let _cacheTimestamp = null;
let _pendingFetch = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

function isCacheValid() {
  return (
    _cachedTemplates !== null &&
    _cacheTimestamp !== null &&
    Date.now() - _cacheTimestamp < CACHE_TTL_MS
  );
}

export function invalidateTemplateCache() {
  _cachedTemplates = null;
  _cacheTimestamp = null;
  _pendingFetch = null;
}

async function fetchTemplatesFromSupabase() {
  const currentUser = AuthManager.getUserSession();
  if (!currentUser) throw new Error("User not authenticated");

  let query = supabase.from("templates").select("*");

  if (currentUser.role === "admin_pusat") {
    // Admin pusat gets all global templates
    query = query.eq("template_scope", "global");
  } else if (currentUser.role === "admin_unit") {
    // Admin unit gets global templates AND their own unit templates
    const userUnit = currentUser.department;
    if (!userUnit) throw new Error("Admin unit must have a unit assigned");
    // Use .or to fetch both types
    query = query.or(`and(template_scope.eq.global),and(template_scope.eq.unit,unit_scope.eq.${userUnit})`);
  } else {
    throw new Error("Insufficient permissions to access templates");
  }

  const { data, error } = await query
    .eq("type", "docx")
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * @param {Object} options
 * @param {boolean} [options.autoFetch=true] - apakah langsung fetch saat mount
 */
export function useTemplates({ autoFetch = true } = {}) {
  const [templates, setTemplates] = useState(_cachedTemplates || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadTemplates = useCallback(async ({ force = false } = {}) => {
    // Gunakan cache jika masih valid dan tidak dipaksa refresh
    if (!force && isCacheValid()) {
      setTemplates(_cachedTemplates);
      return _cachedTemplates;
    }

    // Jika sudah ada fetch yang sedang berjalan, tunggu hasilnya
    if (_pendingFetch && !force) {
      try {
        const result = await _pendingFetch;
        setTemplates(result);
        return result;
      } catch {
        // biarkan fetch ulang di bawah
      }
    }

    setIsLoading(true);
    setError(null);

    _pendingFetch = fetchTemplatesFromSupabase()
      .then((data) => {
        _cachedTemplates = data;
        _cacheTimestamp = Date.now();
        _pendingFetch = null;
        setTemplates(data);
        return data;
      })
      .catch((err) => {
        _pendingFetch = null;
        setError(err);
        throw err;
      })
      .finally(() => {
        setIsLoading(false);
      });

    try {
      return await _pendingFetch;
    } catch (err) {
      console.error("useTemplates: failed to load templates", err);
      return [];
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      loadTemplates();
    }
  }, [autoFetch, loadTemplates]);

  return {
    templates,
    isLoading,
    error,
    loadTemplates,
    /** Refresh paksa (misal setelah upload/delete) */
    refreshTemplates: () => loadTemplates({ force: true }),
  };
}

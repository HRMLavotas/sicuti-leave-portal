import { createClient } from "@supabase/supabase-js";
import { PerformanceMonitor } from "./performance";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please check your .env file.",
  );
}

// Optimized Supabase client configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  db: {
    schema: "public",
  },
  global: {
    headers: {
      "x-application-name": "sistem-cuti",
    },
  },
  // Connection pooling and optimization
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Database query optimization helpers
export class DatabaseOptimizer {
  static queryCache = new Map();
  static cacheTimeout = 5 * 60 * 1000; // 5 minutes

  static async cachedQuery(key, queryFn, ttl = this.cacheTimeout) {
    const cached = this.queryCache.get(key);

    if (cached && Date.now() - cached.timestamp < ttl) {
      console.log(`ðŸ“‹ Cache hit for: ${key}`);
      return cached.data;
    }

    console.log(`ðŸ”„ Cache miss for: ${key}`);
    const startTime = Date.now();

    try {
      const result = await PerformanceMonitor.timeFunction(
        `db-query-${key}`,
        queryFn,
      );

      this.queryCache.set(key, {
        data: result,
        timestamp: Date.now(),
      });

      console.log(
        `ðŸ’¾ Cached query result for: ${key} (${Date.now() - startTime}ms)`,
      );
      return result;
    } catch (error) {
      console.error(`âŒ Query failed for: ${key}`, error);
      throw error;
    }
  }

  static invalidateCache(pattern = null) {
    if (pattern) {
      // Remove cache entries matching pattern
      for (const [key] of this.queryCache) {
        if (key.includes(pattern)) {
          this.queryCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.queryCache.clear();
    }
  }

  static getCacheStats() {
    const now = Date.now();
    const stats = {
      totalEntries: this.queryCache.size,
      validEntries: 0,
      expiredEntries: 0,
    };

    for (const [key, value] of this.queryCache) {
      if (now - value.timestamp < this.cacheTimeout) {
        stats.validEntries++;
      } else {
        stats.expiredEntries++;
      }
    }

    return stats;
  }

  // Cleanup expired cache entries
  static cleanupCache() {
    const now = Date.now();
    let removed = 0;

    for (const [key, value] of this.queryCache) {
      if (now - value.timestamp >= this.cacheTimeout) {
        this.queryCache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`ðŸ§¹ Cleaned up ${removed} expired cache entries`);
    }
  }
}

// Optimized query builders
export const OptimizedQueries = {
  // Get employees with minimal data for dropdowns
  async getEmployeesMinimal() {
    return DatabaseOptimizer.cachedQuery(
      "employees-minimal",
      async () => {
        const { data, error } = await supabase
          .from("employees")
          .select("id, name, nip, department")
          .order("name");

        if (error) throw error;
        return data;
      },
      10 * 60 * 1000, // Cache for 10 minutes
    );
  },

  // Get leave types (rarely changes)
  async getLeaveTypes() {
    return DatabaseOptimizer.cachedQuery(
      "leave-types",
      async () => {
        const { data, error } = await supabase
          .from("leave_types")
          .select("*")
          .order("name");

        if (error) throw error;
        return data;
      },
      30 * 60 * 1000, // Cache for 30 minutes
    );
  },

  // Get departments (rarely changes)
  async getDepartments() {
    return DatabaseOptimizer.cachedQuery(
      "departments",
      async () => {
        const { data, error } = await supabase
          .from("employees")
          .select("department")
          .not("department", "is", null);

        if (error) throw error;

        // Extract unique departments
        const departments = [...new Set(data.map((item) => item.department))];
        return departments.filter((dept) => dept && dept.trim()).sort();
      },
      30 * 60 * 1000, // Cache for 30 minutes
    );
  },

  // Paginated employee query with search
  async getEmployeesPaginated(options = {}) {
    const {
      page = 1,
      limit = 10,
      search = "",
      department = "",
      orderBy = "name",
      orderDirection = "asc",
    } = options;

    const offset = (page - 1) * limit;
    const cacheKey = `employees-page-${page}-${limit}-${search}-${department}-${orderBy}-${orderDirection}`;

    return DatabaseOptimizer.cachedQuery(
      cacheKey,
      async () => {
        let query = supabaseSimpelAdmin.from("employees").select("*", { count: "exact" });

        // Add search filter
        if (search) {
          query = query.or(`name.ilike.%${search}%,nip.ilike.%${search}%`);
        }

        // Add department filter
        if (department) {
          query = query.ilike("department", `%${department}%`);
        }

        // Add ordering and pagination
        query = query
          .order(orderBy, { ascending: orderDirection === "asc" })
          .range(offset, offset + limit - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        return {
          data,
          count,
          page,
          totalPages: Math.ceil(count / limit),
          hasMore: offset + limit < count,
        };
      },
      2 * 60 * 1000, // Cache for 2 minutes (shorter for paginated data)
    );
  },

  // Bulk operations
  async bulkInsert(table, records, options = {}) {
    const { chunkSize = 100 } = options;

    if (records.length <= chunkSize) {
      const { data, error } = await supabase.from(table).insert(records);

      if (error) throw error;
      return data;
    }

    // Process in chunks for large datasets
    const results = [];
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const { data, error } = await supabase.from(table).insert(chunk);

      if (error) throw error;
      results.push(...(data || []));
    }

    return results;
  },
};

// Connection health monitoring
export const ConnectionMonitor = {
  async checkHealth() {
    try {
      const start = Date.now();
      const { data, error } = await supabase
        .from("employees")
        .select("count")
        .limit(1)
        .single();

      const latency = Date.now() - start;

      return {
        healthy: !error,
        latency,
        error: error?.message,
      };
    } catch (error) {
      return {
        healthy: false,
        latency: 0,
        error: error.message,
      };
    }
  },

  async getConnectionInfo() {
    try {
      const { data } = await supabase.rpc("version");
      return {
        connected: true,
        version: data,
        url: supabaseUrl,
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
      };
    }
  },
};

// Cleanup interval for cache
if (typeof window !== "undefined") {
  setInterval(
    () => {
      DatabaseOptimizer.cleanupCache();
    },
    5 * 60 * 1000,
  ); // Every 5 minutes
}

// Export optimized client
export default supabase;

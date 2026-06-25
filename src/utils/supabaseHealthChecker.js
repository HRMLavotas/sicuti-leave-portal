import { supabase } from "@/lib/supabaseClient";

/**
 * Check if Supabase connection is working
 */
export const checkSupabaseConnection = async () => {
  try {
    console.log("🔍 Testing Supabase connection...");
    
    // Simple query to test connection
    const { data, error } = await supabase
      .from("employees")
      .select("id")
      .limit(1);
    
    if (error) {
      console.error("❌ Supabase connection error:", error);
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
    
    console.log("✅ Supabase connection successful");
    return {
      success: true,
      message: "Connection successful",
      sampleData: data
    };
  } catch (fetchError) {
    console.error("❌ Network error testing Supabase:", fetchError);
    return {
      success: false,
      error: "Network error: " + fetchError.message,
      details: fetchError
    };
  }
};

/**
 * Test specific table access
 */
export const testTableAccess = async (tableName, userSession = null) => {
  try {
    console.log(`🔍 Testing access to table: ${tableName}`);
    
    if (userSession) {
      console.log(`🔍 User context:`, {
        role: userSession.role,
        unit: userSession.department
      });
    }
    
    const { data, error, count } = await supabase
      .from(tableName)
      .select("*", { count: "exact", head: true });
    
    if (error) {
      console.error(`❌ Error accessing ${tableName}:`, error);
      return {
        success: false,
        table: tableName,
        error: error.message,
        details: error
      };
    }
    
    console.log(`✅ Table ${tableName} accessible, count: ${count}`);
    return {
      success: true,
      table: tableName,
      count: count,
      message: `Access successful, ${count} records found`
    };
  } catch (fetchError) {
    console.error(`❌ Network error accessing ${tableName}:`, fetchError);
    return {
      success: false,
      table: tableName,
      error: "Network error: " + fetchError.message,
      details: fetchError
    };
  }
};

/**
 * Debug function to run comprehensive Supabase tests
 */
export const runSupabaseHealthCheck = async (userSession = null) => {
  console.log("🔍 =================================");
  console.log("🔍 RUNNING SUPABASE HEALTH CHECK");
  console.log("🔍 =================================");
  
  const results = {
    connection: await checkSupabaseConnection(),
    tables: {}
  };
  
  // Test main tables
  const tablesToTest = ["employees", "leave_requests", "leave_types", "leave_balances"];
  
  for (const table of tablesToTest) {
    results.tables[table] = await testTableAccess(table, userSession);
  }
  
  console.log("🔍 Health check results:", results);
  
  // Summary
  const allSuccessful = results.connection.success && 
    Object.values(results.tables).every(result => result.success);
  
  if (allSuccessful) {
    console.log("✅ All Supabase health checks passed!");
  } else {
    console.log("❌ Some Supabase health checks failed!");
  }
  
  return results;
};

// Auto-run health check in development when module loads
if (import.meta.env.DEV) {
  setTimeout(() => {
    runSupabaseHealthCheck();
  }, 3000); // Run after 3 seconds to allow app to initialize
}

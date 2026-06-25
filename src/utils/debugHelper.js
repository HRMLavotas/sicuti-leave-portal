import { AuthManager } from "@/lib/auth";

/**
 * Debug helper to log current user session data
 */
export const debugUserSession = () => {
  const user = AuthManager.getUserSession();
  
  console.log("ðŸ” =================================");
  console.log("ðŸ” DEBUG USER SESSION DATA:");
  console.log("ðŸ” =================================");
  console.log("ðŸ” Raw user object:", user);
  console.log("ðŸ” User ID:", user?.id);
  console.log("ðŸ” User name:", user?.name);
  console.log("ðŸ” User role:", user?.role);
  console.log("ðŸ” User unit_kerja:", user?.unit_kerja);
  console.log("ðŸ” User unitKerja:", user?.unitKerja);
  console.log("ðŸ” User permissions:", user?.permissions);
  console.log("ðŸ” User status:", user?.status);
  console.log("ðŸ” =================================");
  
  // Test role checks
  console.log("ðŸ” Role checks:");
  console.log("ðŸ” - Is admin_unit:", user?.role === 'admin_unit');
  console.log("ðŸ” - Is master_admin:", user?.role === 'admin_pusat');
  console.log("ðŸ” - Has unit data:", !!(user?.unit_kerja || user?.unitKerja));
  console.log("ðŸ” =================================");
  
  return user;
};

// Debug button functionality removed for production

// Debug button removed - no longer auto-created

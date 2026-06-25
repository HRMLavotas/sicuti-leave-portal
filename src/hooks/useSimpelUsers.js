import { useState, useEffect } from "react";
import { supabaseSimpelAdmin } from "@/lib/supabaseSSO";
import { useToast } from "@/components/ui/use-toast";

/**
 * Hook untuk manage users dari SIMPEL (bukan SiCuti)
 * Query langsung ke profiles + user_roles di Supabase SIMPEL
 */
export const useSimpelUsers = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      // Query profiles dari SIMPEL
      const { data: profilesData, error: profilesError } = await supabaseSimpelAdmin
        .from("profiles")
        .select("id, email, full_name, department, nip")
        .order("full_name");

      if (profilesError) throw profilesError;

      // Query user_roles dari SIMPEL
      const { data: rolesData, error: rolesError } = await supabaseSimpelAdmin
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Merge profiles dengan roles
      const usersWithRoles = profilesData.map(profile => {
        const userRole = rolesData.find(r => r.user_id === profile.id);
        return {
          id: profile.id,
          email: profile.email,
          name: profile.full_name,
          unit_kerja: profile.department,
          nip: profile.nip,
          role: userRole?.role || "employee",
          status: "active", // SIMPEL tidak punya status field, default active
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error("[useSimpelUsers] Error:", error);
      toast({
        variant: "destructive",
        title: "Gagal Memuat Data User",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createUser = async (userData) => {
    try {
      // Tidak bisa create user dari SiCuti — harus via SIMPEL admin panel atau edge function
      throw new Error("Pembuatan user harus dilakukan melalui Portal SIMPEL oleh Admin Pusat");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal Membuat User",
        description: error.message,
      });
      throw error;
    }
  };

  const updateUser = async (userId, updates) => {
    try {
      // Update profiles di SIMPEL
      const { error: profileError } = await supabaseSimpelAdmin
        .from("profiles")
        .update({
          full_name: updates.name,
          department: updates.unit_kerja,
        })
        .eq("id", userId);

      if (profileError) throw profileError;

      // Update role di user_roles
      if (updates.role) {
        const { error: roleError } = await supabaseSimpelAdmin
          .from("user_roles")
          .upsert({
            user_id: userId,
            role: updates.role,
          }, {
            onConflict: "user_id"
          });

        if (roleError) throw roleError;
      }

      toast({
        title: "Berhasil",
        description: "Data user berhasil diperbarui",
      });

      await fetchUsers(); // Refresh
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal Update User",
        description: error.message,
      });
      throw error;
    }
  };

  const deleteUser = async (userId) => {
    try {
      // Tidak bisa delete user dari SiCuti — harus via SIMPEL
      throw new Error("Penghapusan user harus dilakukan melalui Portal SIMPEL oleh Admin Pusat");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal Menghapus User",
        description: error.message,
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return {
    users,
    isLoading,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
  };
};
import { useState, useEffect } from "react";
import { supabaseSimpelAdmin } from "@/lib/supabaseSSO";
import { AuthManager } from "@/lib/auth";
import { applyEmployeeScopeFilter } from "@/utils/employeeScope";

/**
 * Hook untuk mengambil daftar unit kerja (department) dari SIMPEL.
 * admin_unit hanya melihat unitnya sendiri; admin_pusat melihat semua.
 */
export const useDepartments = () => {
  const [departments, setDepartments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDepartments = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const currentUser = AuthManager.getUserSession();

        let query = supabaseSimpelAdmin
          .from("employees")
          .select("department")
          .not("department", "is", null);

        query = applyEmployeeScopeFilter(query, currentUser);

        const { data, error: qErr } = await query;
        if (qErr) throw qErr;

        const unique = [...new Set(data.map(d => d.department).filter(Boolean))].sort();

        const formattedOptions = [
          { value: "", label: "Semua Unit Kerja" },
          ...unique.map(d => ({ value: d, label: d })),
        ];

        setDepartments(formattedOptions);
      } catch (err) {
        console.error("useDepartments error:", err);
        setError(err.message);
        setDepartments([{ value: "", label: "Semua Unit Kerja" }]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDepartments();
  }, []);

  return {
    departments,
    isLoadingDepartments: isLoading,
    departmentsError: error,
  };
};


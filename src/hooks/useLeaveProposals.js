import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/use-toast";
import { AuthManager } from "@/lib/auth";

export const useLeaveProposals = () => {
  const { toast } = useToast();
  const [proposals, setProposals] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchProposals = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      let query = supabase
        .from("leave_proposals")
        .select("*")
        .order("created_at", { ascending: false });

      // Apply filtering based on role
      if (currentUser.role === 'admin_unit' && currentUser.department) {
        // Admin unit can only see proposals from their unit
        query = query.eq("proposer_unit", currentUser.department);
      } else if (currentUser.role === 'employee') {
        // Employee can see:
        // 1. Proposals they created (proposed_by)
        // 2. Proposals that include them as an employee (leave_proposal_items.employee_id)
        // First, fetch all proposal items that include the employee
        const { data: employeeItems, error: itemsError } = await supabase
          .from("leave_proposal_items")
          .select("proposal_id")
          .eq("employee_id", currentUser.employee_id || currentUser.id);

        if (itemsError) throw itemsError;

        const employeeProposalIds = employeeItems?.map(item => item.proposal_id) || [];

        // Then fetch all proposals where either:
        // - proposed_by = currentUser.id OR
        // - id is in employeeProposalIds
        if (employeeProposalIds.length > 0) {
          query = query.or(`proposed_by.eq.${currentUser.id},id.in.(${employeeProposalIds.join(",")})`);
        } else {
          query = query.eq("proposed_by", currentUser.id);
        }
      }
      // Master admin can see all proposals (no additional filter needed)

      const { data, error } = await query;

      if (error) throw error;

      // Get proposal items separately if proposals exist
      let proposalsWithItems = data || [];
      if (proposalsWithItems.length > 0) {
        const proposalIds = proposalsWithItems.map(p => p.id);

        const { data: proposalItems, error: itemsError } = await supabase
          .from("leave_proposal_items")
          .select("*")
          .in("proposal_id", proposalIds);

        if (!itemsError && proposalItems) {
          // Group items by proposal_id
          const itemsMap = {};
          proposalItems.forEach(item => {
            if (!itemsMap[item.proposal_id]) {
              itemsMap[item.proposal_id] = [];
            }
            itemsMap[item.proposal_id].push(item);
          });

          // Attach items to proposals
          proposalsWithItems = proposalsWithItems.map(proposal => ({
            ...proposal,
            leave_proposal_items: itemsMap[proposal.id] || []
          }));
        }
      }

      console.log("Fetched proposals:", proposalsWithItems);
      setProposals(proposalsWithItems);

    } catch (err) {
      console.error("Error fetching proposals:", err);
      setError(err.message);
      setProposals([]);

      toast({
        title: "Error",
        description: "Gagal mengambil data usulan cuti: " + err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const createProposal = useCallback(async (proposalData) => {
    try {
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      if (currentUser.role !== 'admin_unit' && currentUser.role !== 'employee') {
        throw new Error("Only admin unit and employee can create proposals");
      }

      const proposerUnit = currentUser.department || "Unknown";
      // Use employee_id if available (for SSO users from SIMPEL), otherwise use currentUser.id
      const proposerId = currentUser.employee_id || currentUser.id;

      const { data, error } = await supabase
        .from("leave_proposals")
        .insert({
          proposal_title: proposalData.title || `Pengajuan Cuti - ${currentUser.name}`,
          proposed_by: proposerId,
          proposer_name: currentUser.name,
          proposer_unit: proposerUnit,
          notes: proposalData.notes || "",
          total_employees: proposalData.employees?.length || 1,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      // If there are employees in proposalData, insert them into leave_proposal_items
      if (proposalData.employees && proposalData.employees.length > 0) {
        const proposalItems = proposalData.employees.map(emp => ({
          proposal_id: data.id,
          employee_id: emp.employee_id,
          employee_name: emp.employee_name,
          employee_nip: emp.employee_nip,
          employee_department: emp.employee_department,
          employee_position: emp.employee_position || "",
          employee_rank: emp.employee_rank || "",
          leave_type_id: emp.leave_type_id,
          leave_type_name: emp.leave_type_name,
          start_date: emp.start_date,
          end_date: emp.end_date,
          days_requested: emp.days_requested,
          leave_quota_year: emp.leave_quota_year,
          leave_period: emp.leave_period || emp.leave_quota_year,
          reason: emp.reason || "",
          address_during_leave: emp.address_during_leave || "",
          application_form_date: emp.application_form_date || null,
          status: "proposed",
        }));

        const { error: itemsError } = await supabase.from("leave_proposal_items").insert(proposalItems);
        if (itemsError) throw itemsError;
      }

      toast({
        title: "Success",
        description: "Usulan/Pengajuan cuti berhasil dibuat",
      });

      await fetchProposals();
      return data;
    } catch (err) {
      console.error("Error creating proposal:", err);
      toast({
        title: "Error", 
        description: "Gagal membuat usulan/pengajuan cuti: " + err.message,
        variant: "destructive",
      });
      throw err;
    }
  }, [toast, fetchProposals]);

  const updateProposalStatus = useCallback(async (proposalId, status, data = {}) => {
    try {
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      if (currentUser.role !== 'admin_pusat' && currentUser.role !== 'admin_unit') {
        throw new Error("Only master admin and admin unit can update proposal status");
      }

      // Fetch proposal items first if we are approving
      let proposalItems = [];
      if (status === 'approved') {
        const { data: items, error: itemsError } = await supabase
          .from("leave_proposal_items")
          .select("*")
          .eq("proposal_id", proposalId);
        
        if (itemsError) throw itemsError;
        proposalItems = items || [];
      }

      const updateData = {
        status,
        ...data,
      };

      if (status === 'approved') {
        // Don't set approved_by due to foreign key constraint with SIMPLE SSO
        updateData.approved_date = new Date().toISOString();
        
        // Process each item (insert leave request & deduct balance)
        for (const item of proposalItems) {
          const leaveRequestData = {
            employee_id: item.employee_id,
            leave_type_id: item.leave_type_id,
            start_date: item.start_date,
            end_date: item.end_date,
            days_requested: item.days_requested,
            reason: item.reason || "",
            leave_quota_year: item.leave_quota_year,
            leave_period: item.leave_period || item.leave_quota_year,
            submitted_date: new Date().toISOString(),
            address_during_leave: item.address_during_leave || "",
            application_form_date: item.application_form_date || null,
            signed_by: data.signed_by || "",
            leave_letter_number: data.letter_number || "",
            leave_letter_date: data.letter_date || null,
            proposal_id: proposalId,
          };

          // Insert into leave_requests
          const { error: insertErr } = await supabase
            .from("leave_requests")
            .insert([leaveRequestData]);
          if (insertErr) throw insertErr;

          // Deduct leave balance using the existing RPC function
          const { error: rpcErr } = await supabase.rpc(
            "update_leave_balance_with_splitting",
            {
              p_employee_id: item.employee_id,
              p_leave_type_id: item.leave_type_id,
              p_requested_year: item.leave_quota_year,
              p_days: item.days_requested,
            }
          );
          if (rpcErr) {
            console.error("Error updating balance:", rpcErr);
            throw rpcErr;
          }
          
          // Also update the item's status
          const { error: itemUpdateErr } = await supabase
            .from("leave_proposal_items")
            .update({ status: 'approved' })
            .eq("id", item.id);
          if (itemUpdateErr) throw itemUpdateErr;
        }
      }

      const { error } = await supabase
        .from("leave_proposals")
        .update(updateData)
        .eq("id", proposalId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Usulan berhasil ${status === 'approved' ? 'disetujui' : 'ditolak'}`,
      });

      // Refresh data
      await fetchProposals();
    } catch (err) {
      console.error("Error updating proposal status:", err);
      toast({
        title: "Error",
        description: "Gagal memperbarui status usulan: " + err.message,
        variant: "destructive",
      });
      throw err;
    }
  }, [toast, fetchProposals]);

  const approveEmployeeProposal = useCallback(async (proposalId, items, approvalData, approvalType = "issue_letter") => {
    try {
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) throw new Error("User not authenticated");
      if (currentUser.role !== 'admin_unit') throw new Error("Only admin unit can approve employee proposals");

      let finalStatus;
      if (approvalType === "issue_letter") {
        // 1. For each item in the proposal, insert a record into leave_requests
        for (const item of items) {
          const leaveRequestData = {
            employee_id: item.employee_id,
            leave_type_id: item.leave_type_id,
            start_date: item.start_date,
            end_date: item.end_date,
            days_requested: item.days_requested,
            reason: item.reason || "",
            leave_quota_year: item.leave_quota_year,
            leave_period: item.leave_period || item.leave_quota_year,
            submitted_date: new Date().toISOString(),
            address_during_leave: item.address_during_leave || "",
            application_form_date: item.application_form_date || null,
            signed_by: approvalData.signed_by,
            leave_letter_number: approvalData.letter_number,
            leave_letter_date: approvalData.letter_date,
            proposal_id: proposalId,
          };

          // Insert into leave_requests
          const { error: insertErr } = await supabase
            .from("leave_requests")
            .insert([leaveRequestData]);
          if (insertErr) throw insertErr;

          // Deduct leave balance using the existing RPC function
          const { error: rpcErr } = await supabase.rpc(
            "update_leave_balance_with_splitting",
            {
              p_employee_id: item.employee_id,
              p_leave_type_id: item.leave_type_id,
              p_requested_year: item.leave_quota_year,
              p_days: item.days_requested,
            }
          );
          if (rpcErr) {
            console.error("Error updating balance:", rpcErr);
            throw rpcErr;
          }
        }
        finalStatus = "approved";
      } else {
        // Just approve without issuing letter, mark as processed for batch letter
        finalStatus = "processed";
      }

      // 2. Build update data
      const updateData = {
        status: finalStatus,
        // Don't set approved_by due to foreign key constraint with SIMPLE SSO
        approved_date: new Date().toISOString(),
        notes: approvalData.notes || "",
      };

      // Only set letter fields if we're issuing a letter
      if (approvalType === "issue_letter") {
        updateData.letter_number = approvalData.letter_number;
        updateData.letter_date = approvalData.letter_date;
      }

      // Update the proposal status
      const { error: updateErr } = await supabase
        .from("leave_proposals")
        .update(updateData)
        .eq("id", proposalId);

      if (updateErr) throw updateErr;

      // 3. Update status of proposal items
      const { error: itemsUpdateErr } = await supabase
        .from("leave_proposal_items")
        .update({ status: finalStatus })
        .eq("proposal_id", proposalId);

      if (itemsUpdateErr) throw itemsUpdateErr;

      toast({
        title: "Success",
        description: approvalType === "issue_letter" 
          ? "Pengajuan cuti pegawai berhasil disetujui dan surat diterbitkan" 
          : "Pengajuan cuti pegawai berhasil disetujui dan siap dibuat surat keterangan",
      });

      await fetchProposals();
    } catch (err) {
      console.error("Error approving employee proposal:", err);
      const errorMsg = err?.message || err?.error_description || JSON.stringify(err);
      toast({
        title: "Error",
        description: "Gagal menyetujui pengajuan: " + errorMsg,
        variant: "destructive",
      });
      throw err;
    }
  }, [toast, fetchProposals]);

  const rejectEmployeeProposal = useCallback(async (proposalId, reason) => {
    try {
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) throw new Error("User not authenticated");
      if (currentUser.role !== 'admin_unit') throw new Error("Only admin unit can reject employee proposals");

      const { error: updateErr } = await supabase
        .from("leave_proposals")
        .update({
          status: 'rejected',
          rejection_reason: reason,
        })
        .eq("id", proposalId);

      if (updateErr) throw updateErr;

      const { error: itemsUpdateErr } = await supabase
        .from("leave_proposal_items")
        .update({ status: 'rejected' })
        .eq("proposal_id", proposalId);

      if (itemsUpdateErr) throw itemsUpdateErr;

      toast({
        title: "Berhasil",
        description: "Pengajuan cuti pegawai berhasil ditolak",
      });

      await fetchProposals();
    } catch (err) {
      console.error("Error rejecting employee proposal:", err);
      toast({
        title: "Error",
        description: "Gagal menolak pengajuan: " + err.message,
        variant: "destructive",
      });
      throw err;
    }
  }, [toast, fetchProposals]);

  /**
   * Admin unit meneruskan pengajuan pegawai ke Admin Pusat.
   * Status berubah menjadi 'forwarded' sehingga Admin Pusat dapat melihat dan memprosesnya.
   */
  const forwardToAdminPusat = useCallback(async (proposalId, forwardNote = "") => {
    try {
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) throw new Error("User not authenticated");
      if (currentUser.role !== 'admin_unit') throw new Error("Only admin unit can forward proposals");

      const { error } = await supabase
        .from("leave_proposals")
        .update({
          status: 'forwarded',
          notes: forwardNote || undefined,
          // Don't set forwarded_by due to foreign key constraint with SIMPLE SSO
          forwarded_date: new Date().toISOString(),
        })
        .eq("id", proposalId);

      if (error) throw error;

      toast({
        title: "Berhasil Diteruskan",
        description: "Pengajuan cuti diteruskan ke Admin Pusat untuk diproses lebih lanjut.",
      });

      await fetchProposals();
    } catch (err) {
      console.error("Error forwarding proposal:", err);
      toast({
        title: "Error",
        description: "Gagal meneruskan pengajuan: " + err.message,
        variant: "destructive",
      });
      throw err;
    }
  }, [toast, fetchProposals]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const deleteProposal = useCallback(async (proposalId) => {
    try {
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Delete proposal items first
      const { error: itemsError } = await supabase
        .from("leave_proposal_items")
        .delete()
        .eq("proposal_id", proposalId);

      if (itemsError) throw itemsError;

      // Delete the proposal itself
      const { error: proposalError } = await supabase
        .from("leave_proposals")
        .delete()
        .eq("id", proposalId);

      if (proposalError) throw proposalError;

      toast({
        title: "Berhasil",
        description: "Pengajuan cuti berhasil dihapus",
      });

      await fetchProposals();
    } catch (err) {
      console.error("Error deleting proposal:", err);
      toast({
        title: "Error",
        description: "Gagal menghapus pengajuan: " + err.message,
        variant: "destructive",
      });
      throw err;
    }
  }, [toast, fetchProposals]);

  const updateProposal = useCallback(async (proposalId, proposalData) => {
    try {
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // 1. Update main proposal
      const { error: proposalError } = await supabase
        .from("leave_proposals")
        .update({
          proposal_title: proposalData.title,
          notes: proposalData.notes || "",
          proposer_unit: proposalData.proposer_unit,
          total_employees: proposalData.employees.length,
          status: "pending", // Reset status to pending when edited
        })
        .eq("id", proposalId);

      if (proposalError) throw proposalError;

      // 2. Delete old proposal items
      const { error: deleteItemsError } = await supabase
        .from("leave_proposal_items")
        .delete()
        .eq("proposal_id", proposalId);

      if (deleteItemsError) throw deleteItemsError;

      // 3. Insert new proposal items
      const proposalItems = proposalData.employees.map(emp => ({
        proposal_id: proposalId,
        employee_id: emp.employee_id,
        employee_name: emp.employee_name,
        employee_nip: emp.employee_nip,
        employee_department: emp.employee_department,
        employee_position: emp.employee_position || "",
        employee_rank: emp.employee_rank || "",
        leave_type_id: emp.leave_type_id,
        leave_type_name: emp.leave_type_name,
        start_date: emp.start_date,
        end_date: emp.end_date,
        days_requested: emp.days_requested,
        leave_quota_year: emp.leave_quota_year,
        leave_period: emp.leave_period || emp.leave_quota_year,
        reason: emp.reason || "",
        address_during_leave: emp.address_during_leave || "",
          application_form_date: emp.application_form_date || null,
          status: "proposed",
      }));

      const { error: itemsError } = await supabase.from("leave_proposal_items").insert(proposalItems);
      if (itemsError) throw itemsError;

      toast({
        title: "Berhasil",
        description: "Pengajuan cuti berhasil diperbarui",
      });

      await fetchProposals();
    } catch (err) {
      console.error("Error updating proposal:", err);
      toast({
        title: "Error",
        description: "Gagal memperbarui pengajuan: " + err.message,
        variant: "destructive",
      });
      throw err;
    }
  }, [toast, fetchProposals]);

  return {
    proposals,
    isLoading,
    error,
    fetchProposals,
    createProposal,
    updateProposalStatus,
    approveEmployeeProposal,
    rejectEmployeeProposal,
    forwardToAdminPusat,
    deleteProposal,
    updateProposal,
  };
};

export default useLeaveProposals;

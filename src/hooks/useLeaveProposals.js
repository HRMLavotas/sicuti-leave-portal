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
      if (currentUser.role === 'admin_unit' && currentUser.unitKerja) {
        // Admin unit can only see proposals from their unit
        query = query.eq("proposer_unit", currentUser.unitKerja);
      } else if (currentUser.role === 'employee') {
        // Employee can only see their own proposals
        query = query.eq("proposed_by", currentUser.id);
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

      const proposerUnit = currentUser.unitKerja || currentUser.unit_kerja || "Unknown";

      const { data, error } = await supabase
        .from("leave_proposals")
        .insert({
          proposal_title: proposalData.title || `Pengajuan Cuti - ${currentUser.name}`,
          proposed_by: currentUser.id,
          proposer_name: currentUser.name,
          proposer_unit: proposerUnit,
          notes: proposalData.notes || "",
          total_employees: proposalData.total_employees || 1,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Success",
        description: "Usulan/Pengajuan cuti berhasil dibuat",
      });

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
  }, [toast]);

  const updateProposalStatus = useCallback(async (proposalId, status, data = {}) => {
    try {
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      if (currentUser.role !== 'master_admin' && currentUser.role !== 'admin_unit') {
        throw new Error("Only master admin and admin unit can update proposal status");
      }

      const updateData = {
        status,
        ...data,
      };

      if (status === 'approved') {
        updateData.approved_by = currentUser.id;
        updateData.approved_date = new Date().toISOString();
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

  const approveEmployeeProposal = useCallback(async (proposalId, items, approvalData) => {
    try {
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) throw new Error("User not authenticated");
      if (currentUser.role !== 'admin_unit') throw new Error("Only admin unit can approve employee proposals");

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
          leave_period: item.leave_quota_year, // default period
          submitted_date: new Date().toISOString(),
          address_during_leave: item.address_during_leave || "",
          signed_by: approvalData.signed_by,
          leave_letter_number: approvalData.letter_number,
          leave_letter_date: approvalData.letter_date,
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

      // 2. Update the proposal status to 'approved' or 'completed'
      const { error: updateErr } = await supabase
        .from("leave_proposals")
        .update({
          status: 'approved',
          approved_by: currentUser.id,
          approved_date: new Date().toISOString(),
          letter_number: approvalData.letter_number,
          letter_date: approvalData.letter_date,
          notes: approvalData.notes || "",
        })
        .eq("id", proposalId);

      if (updateErr) throw updateErr;

      // 3. Update status of proposal items to 'approved'
      const { error: itemsUpdateErr } = await supabase
        .from("leave_proposal_items")
        .update({ status: 'approved' })
        .eq("proposal_id", proposalId);

      if (itemsUpdateErr) throw itemsUpdateErr;

      toast({
        title: "Success",
        description: "Pengajuan cuti pegawai berhasil disetujui",
      });

      await fetchProposals();
    } catch (err) {
      console.error("Error approving employee proposal:", err);
      toast({
        title: "Error",
        description: "Gagal menyetujui pengajuan: " + err.message,
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
        title: "Success",
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

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  return {
    proposals,
    isLoading,
    error,
    fetchProposals,
    createProposal,
    updateProposalStatus,
    approveEmployeeProposal,
    rejectEmployeeProposal,
  };
};

export default useLeaveProposals;

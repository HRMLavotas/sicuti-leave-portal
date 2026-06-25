import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/use-toast';

export const useDashboardStats = (leaveTypes, isLoadingLeaveTypes, currentYear, selectedUnitPenempatan = '') => {
  const { toast } = useToast();
  const [dashboardStats, setDashboardStats] = useState({
    totalEmployees: 0,
    totalLeaveRequestsThisYear: 0,
    leaveRequestsByTypeThisYear: {},
    asnStatusCounts: {},
    mostFrequentLeaveTakersThisYear: [],
    mostPopularLeaveTypeThisYear: null,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    if (isLoadingLeaveTypes || !currentYear) return;
    setIsLoadingStats(true);
    try {
      // Check database stats first
      const { data: dbStats, error: dbError } = await supabase
        .from('employees')
        .select('asn_status, count(*)', { count: 'exact' })
        .select('asn_status')
        .neq('asn_status', null);
      
      if (dbError) throw dbError;
      
      console.log('Database Stats:', dbStats);
      console.log('Total employees in database:', dbStats?.length || 0);
      
      const statusCounts = dbStats.reduce((acc, emp) => {
        const status = emp.asn_status?.trim()?.toUpperCase() || 'Tidak Diketahui';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      
      console.log('Status distribution:', statusCounts);

      let employeeQuery = supabase.from('employees');
      if (selectedUnitPenempatan && selectedUnitPenempatan !== 'all') {
        employeeQuery = employeeQuery.eq('department', selectedUnitPenempatan);
      }
      const { count: totalEmployees, error: empError } = await employeeQuery.select('id', { count: 'exact', head: true });
      if (empError) throw empError;

      const yearStartDate = `${currentYear}-01-01`;
      const yearEndDate = `${currentYear}-12-31`;

      let leaveRequestsBaseQuery = supabase
        .from('leave_requests')
        .select('leave_type_id, employee_id, employees!inner(id, name, department)')
        .gte('start_date', yearStartDate)
        .lte('start_date', yearEndDate);
      
      if (selectedUnitPenempatan && selectedUnitPenempatan !== 'all') {
        leaveRequestsBaseQuery = leaveRequestsBaseQuery.eq('employees.department', selectedUnitPenempatan);
      }

      const { data: leaveRequestsDataThisYear, error: leaveDetailsError } = await leaveRequestsBaseQuery;
      if (leaveDetailsError) throw leaveDetailsError;
      
      const totalLeaveRequestsThisYear = leaveRequestsDataThisYear?.length || 0;

      const leaveRequestsByTypeThisYear = leaveRequestsDataThisYear.reduce((acc, req) => {
        const leaveType = leaveTypes.find(lt => lt.id === req.leave_type_id);
        const typeName = leaveType ? leaveType.name : 'Tidak Diketahui';
        acc[typeName] = (acc[typeName] || 0) + 1;
        return acc;
      }, {});

      let asnStatusBaseQuery = supabase.from('employees');
      if (selectedUnitPenempatan && selectedUnitPenempatan !== 'all') {
        asnStatusBaseQuery = asnStatusBaseQuery.eq('department', selectedUnitPenempatan);
      }
      const { data: asnStatusData, error: asnError } = await asnStatusBaseQuery.select('asn_status');
      if (asnError) throw asnError;
      
      const asnStatusCounts = asnStatusData.reduce((acc, emp) => {
        let status = emp.asn_status || 'Tidak Diketahui';
        status = typeof status === 'string' ? status.trim().toUpperCase() : status;
        if (status === 'PNS' || status === 'PPPK') {
          acc[status] = (acc[status] || 0) + 1;
        } else {
          acc['Tidak Diketahui'] = (acc['Tidak Diketahui'] || 0) + 1;
        }
        return acc;
      }, {});
      
      const employeeLeaveCountsThisYear = leaveRequestsDataThisYear.reduce((acc, req) => {
        if (req.employees) {
          acc[req.employees.name] = (acc[req.employees.name] || 0) + 1;
        }
        return acc;
      }, {});
      const sortedLeaveTakersThisYear = Object.entries(employeeLeaveCountsThisYear)
        .sort(([,a],[,b]) => b-a)
        .slice(0,3)
        .map(([name, count]) => ({name, count}));

      const leaveTypeCountsThisYear = Object.entries(leaveRequestsByTypeThisYear)
        .sort(([,a],[,b]) => b-a);
      const mostPopularLeaveTypeThisYear = leaveTypeCountsThisYear.length > 0 ? { name: leaveTypeCountsThisYear[0][0], count: leaveTypeCountsThisYear[0][1] } : null;

      setDashboardStats({
        totalEmployees: totalEmployees || 0,
        totalLeaveRequestsThisYear,
        leaveRequestsByTypeThisYear,
        asnStatusCounts,
        mostFrequentLeaveTakersThisYear: sortedLeaveTakersThisYear,
        mostPopularLeaveTypeThisYear
      });

    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      toast({ variant: "destructive", title: "Gagal memuat statistik", description: error.message });
    } finally {
      setIsLoadingStats(false);
    }
  }, [toast, leaveTypes, isLoadingLeaveTypes, currentYear, selectedUnitPenempatan]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return { dashboardStats, isLoadingStats, refreshStats: fetchDashboardData };
};

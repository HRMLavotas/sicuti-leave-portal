-- Migration 09: Fix SELECT policies so admin_unit can see proposals from their unit employees
-- This adds a SELECT policy with a fallback to the users table (not relying on JWT custom claims)

-- 1. Add SELECT policy for admin_unit using users table fallback
DROP POLICY IF EXISTS "Admin units can view unit proposals" ON public.leave_proposals;
CREATE POLICY "Admin units can view unit proposals" ON public.leave_proposals
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
            AND u.role = 'admin_unit'
            AND u.unit_kerja = leave_proposals.proposer_unit
        )
    );

-- 2. Add SELECT policy for master_admin using users table fallback
DROP POLICY IF EXISTS "Master admin can view all proposals via users" ON public.leave_proposals;
CREATE POLICY "Master admin can view all proposals via users" ON public.leave_proposals
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
            AND u.role = 'master_admin'
        )
    );

-- 3. Fix proposal items SELECT: admin_unit should see items for proposals in their unit
DROP POLICY IF EXISTS "Admin units can view unit proposal items" ON public.leave_proposal_items;
CREATE POLICY "Admin units can view unit proposal items" ON public.leave_proposal_items
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.leave_proposals lp
            JOIN public.users u ON u.id = auth.uid()
            WHERE lp.id = leave_proposal_items.proposal_id
            AND (
                (u.role = 'admin_unit' AND u.unit_kerja = lp.proposer_unit)
                OR u.role = 'master_admin'
            )
        )
    );

-- 4. Fix INSERT policy for leave_requests so admin_unit can insert on behalf of employees
-- This is needed when admin_unit approves an employee proposal and creates a leave_request
DROP POLICY IF EXISTS "Admin units can insert leave requests" ON public.leave_requests;
CREATE POLICY "Admin units can insert leave requests" ON public.leave_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
            AND u.role IN ('admin_unit', 'master_admin')
        )
    );

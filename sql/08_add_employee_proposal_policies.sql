-- Migration 08: Add Employee Proposal Policies

-- 1. Enable RLS on leave_proposals if not already enabled
ALTER TABLE public.leave_proposals ENABLE ROW LEVEL SECURITY;

-- 2. Allow authenticated users to INSERT their own proposals
DROP POLICY IF EXISTS "Employees can insert their own proposals" ON public.leave_proposals;
CREATE POLICY "Employees can insert their own proposals" ON public.leave_proposals
    FOR INSERT 
    TO authenticated
    WITH CHECK (proposed_by = auth.uid());

-- 3. Allow employees to SELECT/VIEW their own proposals
DROP POLICY IF EXISTS "Employees can view their own proposals" ON public.leave_proposals;
CREATE POLICY "Employees can view their own proposals" ON public.leave_proposals
    FOR SELECT
    TO authenticated
    USING (proposed_by = auth.uid());

-- 4. Allow employees to DELETE their own pending proposals
DROP POLICY IF EXISTS "Employees can delete their own pending proposals" ON public.leave_proposals;
CREATE POLICY "Employees can delete their own pending proposals" ON public.leave_proposals
    FOR DELETE
    TO authenticated
    USING (proposed_by = auth.uid() AND status = 'pending');

-- 5. Enable RLS on leave_proposal_items
ALTER TABLE public.leave_proposal_items ENABLE ROW LEVEL SECURITY;

-- 6. Allow authenticated users to INSERT proposal items for their own proposals
DROP POLICY IF EXISTS "Employees can insert their own proposal items" ON public.leave_proposal_items;
CREATE POLICY "Employees can insert their own proposal items" ON public.leave_proposal_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.leave_proposals lp
            WHERE lp.id = leave_proposal_items.proposal_id
            AND lp.proposed_by = auth.uid()
        )
    );

-- 7. Allow employees to SELECT/VIEW their own proposal items
DROP POLICY IF EXISTS "Employees can view their own proposal items" ON public.leave_proposal_items;
CREATE POLICY "Employees can view their own proposal items" ON public.leave_proposal_items
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.leave_proposals lp
            WHERE lp.id = leave_proposal_items.proposal_id
            AND (lp.proposed_by = auth.uid() OR leave_proposal_items.employee_id IN (
                SELECT e.id FROM public.employees e WHERE e.nip = (auth.jwt()->>'email') -- Fallback if email is NIP
                OR e.nip = (SELECT username FROM public.users WHERE id = auth.uid())
            ))
        )
    );

-- 8. Allow admin_unit to UPDATE (approve/reject) proposals belonging to their unit
DROP POLICY IF EXISTS "Admin units can update their proposals" ON public.leave_proposals;
CREATE POLICY "Admin units can update their proposals" ON public.leave_proposals
    FOR UPDATE
    TO authenticated
    USING (
        (auth.jwt()->>'role' = 'admin_unit' AND proposer_unit = auth.jwt()->>'unit_kerja')
        OR (EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
            AND u.role = 'admin_unit'
            AND u.unit_kerja = leave_proposals.proposer_unit
        ))
    );

-- 9. Allow admin_unit to UPDATE proposal items belonging to their unit's proposals
DROP POLICY IF EXISTS "Admin units can update their proposal items" ON public.leave_proposal_items;
CREATE POLICY "Admin units can update their proposal items" ON public.leave_proposal_items
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.leave_proposals lp
            WHERE lp.id = leave_proposal_items.proposal_id
            AND (
                (auth.jwt()->>'role' = 'admin_unit' AND lp.proposer_unit = auth.jwt()->>'unit_kerja')
                OR (EXISTS (
                    SELECT 1 FROM public.users u
                    WHERE u.id = auth.uid()
                    AND u.role = 'admin_unit'
                    AND u.unit_kerja = lp.proposer_unit
                ))
            )
        )
    );

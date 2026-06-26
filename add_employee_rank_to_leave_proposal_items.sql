-- Add employee_rank and leave_period columns to leave_proposal_items table
-- These columns store the employee's rank and leave period at the time of the proposal

ALTER TABLE leave_proposal_items 
ADD COLUMN IF NOT EXISTS employee_rank TEXT,
ADD COLUMN IF NOT EXISTS leave_period INTEGER;

-- Add comments
COMMENT ON COLUMN leave_proposal_items.employee_rank IS 'The employee''s rank at the time of proposal submission';
COMMENT ON COLUMN leave_proposal_items.leave_period IS 'The leave period year (e.g., 2024) for which the leave is requested';
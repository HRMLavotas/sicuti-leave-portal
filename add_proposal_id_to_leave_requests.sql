-- Add proposal_id column to leave_requests to link back to the original leave proposal
-- This allows us to delete the proposal when deleting the leave request

ALTER TABLE leave_requests 
ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES leave_proposals(id) ON DELETE SET NULL;

-- Create an index for performance
CREATE INDEX IF NOT EXISTS idx_leave_requests_proposal_id ON leave_requests(proposal_id);

-- Add comment
COMMENT ON COLUMN leave_requests.proposal_id IS 'Link to the original leave proposal that generated this leave request';

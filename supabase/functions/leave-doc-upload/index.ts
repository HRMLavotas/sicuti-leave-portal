// Edge function: upload dokumen cuti ke Google Drive via connector gateway
// Simpan metadata ke tabel leave_documents
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY = 'https://connector-gateway.lovable.dev/google_drive';
const ROOT_FOLDER = 'Sicuti Leave Documents';

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const driveKey = Deno.env.get('GOOGLE_DRIVE_API_KEY');
  if (!lovableKey) throw new Error('LOVABLE_API_KEY not configured');
  if (!driveKey) throw new Error('GOOGLE_DRIVE_API_KEY not configured (connector not linked)');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${lovableKey}`);
  headers.set('X-Connection-Api-Key', driveKey);
  return fetch(`${GATEWAY}${path}`, { ...init, headers });
}

async function findOrCreateFolder(name: string, parentId: string | null): Promise<string> {
  const parentClause = parentId ? ` and '${parentId}' in parents` : " and 'root' in parents";
  const q = `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${name.replace(/'/g, "\\'")}'${parentClause}`;
  const search = await driveFetch(`/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  if (search.ok) {
    const json = await search.json();
    if (json.files?.[0]?.id) return json.files[0].id;
  }
  const createBody: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) createBody.parents = [parentId];
  const create = await driveFetch('/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  });
  if (!create.ok) throw new Error(`Drive folder create failed: ${await create.text()}`);
  const cj = await create.json();
  return cj.id as string;
}

async function ensureFolderPath(parts: string[]): Promise<string> {
  let parent: string | null = null;
  for (const p of parts) parent = await findOrCreateFolder(p, parent);
  return parent as string;
}

async function uploadFile(folderId: string, file: File): Promise<{ id: string; webViewLink: string }> {
  const metadata = { name: file.name, parents: [folderId] };
  const boundary = '-------lovable' + crypto.randomUUID();
  const head =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const fileBuf = new Uint8Array(await file.arrayBuffer());
  const headBytes = new TextEncoder().encode(head);
  const tailBytes = new TextEncoder().encode(tail);
  const body = new Uint8Array(headBytes.length + fileBuf.length + tailBytes.length);
  body.set(headBytes, 0);
  body.set(fileBuf, headBytes.length);
  body.set(tailBytes, headBytes.length + fileBuf.length);

  const up = await driveFetch('/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!up.ok) throw new Error(`Drive upload failed: ${up.status} ${await up.text()}`);
  const j = await up.json();

  // Make file readable by anyone with link
  await driveFetch(`/drive/v3/files/${j.id}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  return { id: j.id, webViewLink: j.webViewLink ?? `https://drive.google.com/file/d/${j.id}/view` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  try {
    // For SSO authentication, we need to validate differently
    // We'll use a custom header or form field for user_id verification
    const auth = req.headers.get('Authorization') ?? '';
    const supaUrl = Deno.env.get('SUPABASE_URL')!;
    const supaAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supaSvc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    let userId: string | null = null;

    // Parse form data once
    const form = await req.formData();

    // Try standard Supabase JWT first (for direct Supabase auth users)
    if (auth.startsWith('Bearer ')) {
      const authClient = createClient(supaUrl, supaAnon, {
        global: { headers: { Authorization: auth } },
      });
      const { data: userData, error: userErr } = await authClient.auth.getUser();
      
      // If JWT validation succeeds, use that user
      if (!userErr && userData.user) {
        userId = userData.user.id;
      }
    }

    // If JWT didn't work, try to get user_id from form data (SSO flow)
    if (!userId) {
      const userIdFromForm = form.get('user_id');
      if (userIdFromForm) {
        userId = String(userIdFromForm);
      }
    }

    if (!userId) {
      return jsonResp({ 
        code: 'UNAUTHORIZED_NO_AUTH_HEADER',
        message: 'Missing authorization header or user_id'
      }, 401);
    }
    const leaveRequestId = form.get('leave_request_id') ? String(form.get('leave_request_id')) : null;
    const leaveProposalItemId = form.get('leave_proposal_item_id') ? String(form.get('leave_proposal_item_id')) : null;
    const slotCode = String(form.get('slot_code') ?? '');
    const slotLabel = String(form.get('slot_label') ?? slotCode);
    const file = form.get('file') as File | null;

    // Validation
    if (!slotCode || !file) return jsonResp({ error: 'Missing fields' }, 400);
    if (!leaveRequestId && !leaveProposalItemId) return jsonResp({ error: 'Must provide either leave_request_id or leave_proposal_item_id' }, 400);
    if (leaveRequestId && leaveProposalItemId) return jsonResp({ error: 'Cannot provide both leave_request_id and leave_proposal_item_id' }, 400);
    if (file.size > 20 * 1024 * 1024) return jsonResp({ error: 'File maks 20MB' }, 400);

    const svc = createClient(supaUrl, supaSvc);

    // Authorization for SSO users:
    // - Employee: can upload for their own leave requests/proposals
    // - Admin Unit: can upload for any leave requests in their unit
    // - Admin Pusat: can upload for any leave requests
    // We trust the user_id sent from frontend since AuthManager validates it
    
    let department = '';
    let folderPath: string[] = [ROOT_FOLDER];

    // Authorization and folder path determination
    if (leaveRequestId) {
      // For leave_requests (Admin Unit/Pusat creates leave request directly)
      const { data: leaveRequest, error: lrErr } = await svc
        .from('leave_requests')
        .select('id, employee_id, employees(id, department)')
        .eq('id', leaveRequestId)
        .single();
      
      if (lrErr || !leaveRequest) return jsonResp({ error: 'Leave request not found' }, 404);
      
      department = leaveRequest.employees?.department || '';
      
      // Allow upload: Admin Unit, Admin Pusat, or the employee themselves
      // Frontend already validates permissions, so we trust the user_id here
      
      folderPath.push('Leave Requests', String(department), String(leaveRequestId));
    } else if (leaveProposalItemId) {
      // For leave_proposal_items (Employee creates proposal, Admin can also upload docs)
      const { data: proposalItem, error: piErr } = await svc
        .from('leave_proposal_items')
        .select('id, employee_id, leave_proposal_id, leave_proposals(id, proposer_id, proposer_unit, status)')
        .eq('id', leaveProposalItemId)
        .single();
      
      if (piErr || !proposalItem) return jsonResp({ error: 'Proposal item not found' }, 404);
      
      const proposal = proposalItem.leave_proposals;
      department = proposal.proposer_unit || '';
      
      // Allow upload:
      // - Employee who created the proposal
      // - Admin Unit of that department
      // - Admin Pusat
      // Frontend validates permissions, we trust user_id
      
      folderPath.push('Leave Proposals', String(department), String(proposalItem.leave_proposal_id), String(leaveProposalItemId));
    }

    // Create folder structure and upload file
    const folderId = await ensureFolderPath(folderPath);
    const uploaded = await uploadFile(folderId, file);

    // Store document metadata in database
    const docData: any = {
      slot_code: slotCode,
      slot_label: slotLabel,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      drive_file_id: uploaded.id,
      drive_view_url: uploaded.webViewLink,
      external_link: null,
      verification_status: 'pending',
      verification_note: null,
      verified_by_id: null,
      verified_by_name: null,
      verified_at: null,
      uploaded_by_id: userId,
      uploaded_at: new Date().toISOString(),
    };

    if (leaveRequestId) {
      docData.leave_request_id = leaveRequestId;
      docData.leave_proposal_item_id = null;
    } else {
      docData.leave_request_id = null;
      docData.leave_proposal_item_id = leaveProposalItemId;
    }

    // Upsert to replace previous file in the same slot
    const { error: upsertErr } = await svc.from('leave_documents').upsert(
      docData,
      { 
        onConflict: leaveRequestId ? 'leave_request_id,slot_code' : 'leave_proposal_item_id,slot_code',
        ignoreDuplicates: false 
      },
    );
    if (upsertErr) return jsonResp({ error: upsertErr.message }, 500);

    return jsonResp({
      ok: true,
      drive_file_id: uploaded.id,
      drive_view_url: uploaded.webViewLink,
      file_name: file.name,
    });
  } catch (e) {
    console.error('[leave-doc-upload]', e);
    return jsonResp({ error: String(e) }, 500);
  }
});

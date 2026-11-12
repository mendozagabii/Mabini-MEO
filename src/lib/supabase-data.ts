// @mine — Translation layer: Supabase (normalized Postgres) <-> the record shapes
// the existing UI/API contract uses (which were designed around SQLite JSON blobs).
//
// Correlation (app concept -> Supabase):
//   App "LocalRoad" record  -> public.projects joined to roads + barangays +
//                              project_categories + contractors (id = projects.id)
//   App Inspection          -> public.inspections + inspection_items (id = inspections.id,
//                              localRoadId = inspections.project_id)
//   App Maintenance         -> public.maintenance_records (localRoadId = project_id)
//   App User                -> auth.users + public.profiles
//   Activity log            -> public.activity_logs (also auto-written by DB triggers)
//
// Known mappings/losses (documented in docs/SUPABASE-MIGRATION.md):
//   conditionRating 0-10 <-> overall_score; item ratings Good/Fair/... <-> good/fair/...
//   validation 'Validated' <-> approved, 'Return for Revision' <-> rejected
//   maintenance 'Deferred' <-> deferred (enum value added by migration)
//   attachments: files are uploaded to the `wblrms-files` Storage bucket and
//   tracked in public.attachments; reads return 1-hour signed URLs as dataUrl.
//   @mine (Phase 2): annual validation entries, annual follow-up generation,
//   Storage attachments, and AI run persistence were added on 2026-11-09.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ROLE_FROM_DB, ROLE_TO_DB } from '@/lib/supabase';
import { attachmentError, attachmentMime, matchesAttachmentSignature } from '@/lib/attachment-validation';

export type StoredRecord = Record<string, unknown> & { id: string };

const cap = (v: unknown): string => {
  const s = String(v ?? '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
};
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const numStr = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/* ---------------------------------- roads/projects ---------------------------------- */

type Joined = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function mapProject(p: Joined): StoredRecord {
  const road = (p.roads ?? {}) as Joined;
  const contractor = (p.contractors ?? {}) as Joined;
  const validation =
    p.validation_status === 'approved' ? 'Validated' : p.validation_status === 'rejected' ? 'Return for Revision' : undefined;
  return {
    id: p.id,
    roadId: p.road_id,
    name: road.road_name ?? p.project_name ?? '',
    roadName: road.road_name ?? '',
    projectName: p.project_name ?? '',
    type: p.project_categories?.name ?? p.category_other ?? '',
    projectCategory: p.project_categories?.name ?? p.category_other ?? '',
    location: p.barangays?.name ?? '',
    barangay: p.barangays?.name ?? '',
    dateBuilt: str(road.date_built),
    condition: cap(road.current_condition) || 'Good',
    lastInspection: str(road.last_inspection_date) || undefined,
    projectDescription: p.description ?? '',
    description: p.description ?? '',
    dateStarted: str(p.date_started),
    targetCompletionDate: str(p.target_completion_date),
    noOfExtensions: numStr(p.extensions_count ?? 0),
    actualCompletionDate: str(p.actual_completion_date),
    roadNetworkId: road.road_network_id ?? '',
    components: road.components ?? '',
    contractorName: contractor.name ?? '',
    contractorAddress: contractor.address ?? '',
    contactInformation: contractor.contact_information ?? '',
    pcadLicenseNo: contractor.pcab_license_no ?? '',
    sourceOfFunds: p.source_of_funds ?? '',
    appropriation: numStr(p.appropriation),
    contractedAmount: numStr(p.contracted_amount),
    adjustProjectCost: numStr(p.adjusted_project_cost),
    completionDate: str(p.completion_date),
    completionPercentage: numStr(p.completion_percentage ?? 0),
    turnoverDate: str(p.turnover_date),
    projectStatus: p.status ?? 'planned',
    ...(validation ? { validationResult: validation } : {}),
    validationRemarks: p.validation_remarks ?? '',
    validationValidatedAt: p.validated_at ?? undefined,
    archivedAt: p.archived_at ?? undefined,
    // @mine — filled in by attachRoadExtras() in the list functions below.
    attachments: [] as StoredRecord[],
    annualValidationEntries: [] as StoredRecord[],
    annualInspectionYears: [] as number[],
  };
}

const PROJECT_SELECT =
  '*, roads!projects_road_id_fkey(*), barangays!projects_barangay_id_fkey(name), project_categories(name), contractors!projects_contractor_id_fkey(*)';

/* --------------------- @mine: attachments (Supabase Storage) --------------------- */

const ATTACHMENT_BUCKET = 'wblrms-files';
const ATTACH_CATEGORY_TO_DB: Record<string, string> = {
  'Project Attachment': 'project_attachment',
  'Turnover Certificate': 'turnover_certificate',
  'Inspection Photo': 'inspection_photo',
  'Maintenance Document': 'maintenance_document',
};
const ATTACH_CATEGORY_FROM_DB: Record<string, string> = Object.fromEntries(
  Object.entries(ATTACH_CATEGORY_TO_DB).map(([a, b]) => [b, a]),
);

interface AttachmentInput {
  name?: unknown; type?: unknown; dataUrl?: unknown; category?: unknown; storagePath?: unknown; staged?: unknown; size?: unknown;
  stored?: unknown;
}

/** Upload one base64 data URL to Storage and record it in public.attachments. Best-effort. */
async function storeAttachment(
  db: SupabaseClient,
  link: { project_id?: string; inspection_id?: string; inspection_item_id?: string; maintenance_id?: string },
  input: AttachmentInput,
  userId: string,
): Promise<void> {
  const dataUrl = str(input.dataUrl);
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return;
  const mime = str(input.type) || match[1] || 'application/octet-stream';
  const bytes = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]), 'utf8');
  const problem = attachmentError({ name: str(input.name), type: mime, size: bytes.length });
  if (problem) throw new Error(problem);
  if (!matchesAttachmentSignature(str(input.name), bytes)) throw new Error('The attachment content does not match its file type.');
  const safeName = (str(input.name) || 'file').replace(/[^A-Za-z0-9._-]+/g, '_');
  const folder = link.project_id ?? link.inspection_id ?? link.maintenance_id ?? 'misc';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const { error: uploadError } = await db.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, { contentType: mime });
  if (uploadError) throw uploadError;
  const { error } = await db.from('attachments').insert({
    ...link,
    category: ATTACH_CATEGORY_TO_DB[str(input.category)] ?? 'project_attachment',
    file_name: str(input.name) || safeName,
    storage_path: path,
    mime_type: mime,
    file_size: bytes.length,
    uploaded_by: userId,
  });
  if (error) throw error;
}

/** Persist any newly-added (dataUrl, not yet stored) attachments of a project/inspection. */
async function syncAttachments(
  db: SupabaseClient,
  link: { project_id?: string; inspection_id?: string; inspection_item_id?: string },
  inputs: AttachmentInput[] | undefined,
  userId: string,
): Promise<void> {
  for (const input of inputs ?? []) {
    if (str(input.storagePath)) continue; // already in Storage
    if (!str(input.dataUrl).startsWith('data:')) continue;
    try {
      await storeAttachment(db, link, input, userId);
    } catch (error) {
      console.error('Failed to store attachment; continuing without it.', error);
    }
  }
}

/** Check staged project files before writing a road/project; never trust client metadata. */
async function prepareProjectAttachments(db: SupabaseClient, inputs: AttachmentInput[], userId: string) {
  const staged = inputs.filter(input => input.staged === true);
  const paths = new Set<string>();
  const prepared: Array<{ name: string; type: string; size: number; path: string }> = [];
  for (const input of staged) {
    const path = str(input.storagePath);
    const name = str(input.name);
    const type = str(input.type);
    const prefix = `project-uploads/${userId}/`;
    if (!path.startsWith(prefix) || !/^[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$/.test(path.slice(prefix.length)) || paths.has(path) || input.category !== 'Turnover Certificate') {
      throw new Error('Invalid project attachment upload.');
    }
    paths.add(path);
    const { data: info, error } = await db.storage.from(ATTACHMENT_BUCKET).info(path);
    if (error || !info || typeof info.size !== 'number') throw new Error('Attachment upload could not be verified. Please upload it again.');
    const problem = attachmentError({ name, type, size: info.size });
    if (problem || attachmentMime(name, type) !== info.contentType || info.size !== input.size || !path.endsWith(`.${name.split('.').pop()?.toLowerCase()}`)) {
      throw new Error(problem || 'Attachment type or size could not be verified.');
    }
    const { data: blob, error: downloadError } = await db.storage.from(ATTACHMENT_BUCKET).download(path);
    if (downloadError || !blob || !matchesAttachmentSignature(name, new Uint8Array(await blob.slice(0, 8).arrayBuffer()))) {
      throw new Error('The attachment content does not match its file type.');
    }
    const { data: linked, error: lookupError } = await db.from('attachments').select('id').eq('storage_path', path).limit(1);
    if (lookupError || linked?.length) throw new Error('Attachment has already been used or could not be verified.');
    prepared.push({ name, type, size: info.size, path });
  }
  // Project uploads must use the size-checked direct upload path, not an unbounded JSON body.
  if (inputs.some(input => !input.storagePath && str(input.dataUrl).startsWith('data:'))) {
    throw new Error('Please upload the project attachment again.');
  }
  return prepared;
}

/**
 * @mine — verify the per-category inspection uploads before a single row is written.
 * Same rules as project uploads: our own folder, a UUID file name, the declared size,
 * the declared MIME type, real file signature bytes, and "not already attached".
 */
const ITEM_UPLOAD_FOLDER = 'inspection-item-uploads';

async function prepareInspectionItemAttachments(
  db: SupabaseClient,
  uploaded: Record<string, AttachmentInput[]>,
  userId: string,
): Promise<Array<{ component: string; name: string; type: string; size: number; path: string }>> {
  const prefix = `${ITEM_UPLOAD_FOLDER}/${userId}/`;
  const seen = new Set<string>();
  const prepared: Array<{ component: string; name: string; type: string; size: number; path: string }> = [];
  for (const [component, inputs] of Object.entries(uploaded ?? {})) {
    if (!COMPONENT_TO_DB[component] || !Array.isArray(inputs)) continue;
    for (const input of inputs) {
      if (input.stored === true) continue; // already recorded against this inspection
      const path = str(input.storagePath);
      if (!path) continue; // legacy data-URL path is handled by syncAttachments
      const name = str(input.name);
      const type = str(input.type);
      if (!path.startsWith(prefix) || !/^[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$/.test(path.slice(prefix.length)) || seen.has(path)) {
        throw new Error('Invalid inspection attachment upload.');
      }
      seen.add(path);
      const { data: info, error } = await db.storage.from(ATTACHMENT_BUCKET).info(path);
      if (error || !info || typeof info.size !== 'number') throw new Error('Attachment upload could not be verified. Please upload it again.');
      const problem = attachmentError({ name, type, size: info.size });
      if (problem || attachmentMime(name, type) !== info.contentType || info.size !== Number(input.size) || !path.endsWith(`.${name.split('.').pop()?.toLowerCase()}`)) {
        throw new Error(problem || 'Attachment type or size could not be verified.');
      }
      const { data: blob, error: downloadError } = await db.storage.from(ATTACHMENT_BUCKET).download(path);
      if (downloadError || !blob || !matchesAttachmentSignature(name, new Uint8Array(await blob.slice(0, 8).arrayBuffer()))) {
        throw new Error('The attachment content does not match its file type.');
      }
      const { data: linked, error: lookupError } = await db.from('attachments').select('id').eq('storage_path', path).limit(1);
      if (lookupError || linked?.length) throw new Error('Attachment has already been used or could not be verified.');
      prepared.push({ component, name, type, size: info.size, path });
    }
  }
  return prepared;
}

/** Map an attachments row to the UI shape (signed URL in place of the old dataUrl). */
async function mapAttachmentRow(db: SupabaseClient, row: Joined): Promise<StoredRecord> {  const { data } = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(str(row.storage_path), 60 * 60);
  return {
    name: row.file_name ?? '',
    type: row.mime_type ?? '',
    dataUrl: data?.signedUrl ?? '',
    category: ATTACH_CATEGORY_FROM_DB[row.category] ?? 'Project Attachment',
    storagePath: row.storage_path,
    // @mine — distinguishes an already-recorded file from a freshly staged upload.
    stored: true,
    ...(row.inspection_item_id ? { inspectionItemId: row.inspection_item_id } : {}),
  } as unknown as StoredRecord;
}

/* ----------------- @mine: annual follow-ups & validation entries ----------------- */

const ANNUAL_RESULT_FROM_DB: Record<string, string> = {
  approved: 'Validated', rejected: 'Return for Revision', pending: 'Pending',
};

function anniversaryDueDate(completionIso: string, year: number, daysBefore = 30): string | null {
  const d = new Date(`${completionIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const due = new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate()));
  due.setUTCDate(due.getUTCDate() - daysBefore);
  return due.toISOString().slice(0, 10);
}

/**
 * @mine — Port of the old SQLite syncAnnualFollowUps(): for each completed,
 * non-archived project, make sure a pending annual_validation_entries row and
 * a scheduled annual follow-up inspection exist for every due year
 * (inspection: anniversary − 30 days; first validation: anniversary − 29 days).
 * Best-effort; writes go through `admin`
 * when provided so read-only roles still see generated rows.
 */
export async function ensureAnnualFollowUps(db: SupabaseClient, admin?: SupabaseClient): Promise<void> {
  const writer = admin ?? db;
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const { data: projects, error } = await db
    .from('projects')
    .select('id, actual_completion_date, completion_date')
    .is('archived_at', null)
    .not('actual_completion_date', 'is', null);
  if (error) throw error;
  if (!projects?.length) return;

  for (const project of projects as Joined[]) {
    const completed = str(project.actual_completion_date || project.completion_date);
    if (!completed) continue;
    const completionYear = Number(completed.slice(0, 4));
    if (!Number.isInteger(completionYear)) continue;
    const dueYears: Array<{ year: number; dueDate: string }> = [];
    for (let year = completionYear + 1; year <= currentYear + 1; year += 1) {
      const dueDate = anniversaryDueDate(completed, year);
      if (dueDate && dueDate <= today) dueYears.push({ year, dueDate });
    }
    if (!dueYears.length) continue;

    const [{ data: entries, error: entriesError }, { data: followUps }] = await Promise.all([
      db.from('annual_validation_entries').select('year').eq('project_id', project.id),
      db.from('inspections').select('annual_follow_up_year').eq('project_id', project.id).eq('inspection_type', 'follow_up').not('annual_follow_up_year', 'is', null),
    ]);
    if (entriesError) throw entriesError;
    const haveEntries = new Set((entries ?? []).map((e: Joined) => e.year));
    const haveFollowUps = new Set((followUps ?? []).map((e: Joined) => e.annual_follow_up_year));

    for (const { year, dueDate } of dueYears) {
      const validationDueDate = year === completionYear + 1 ? anniversaryDueDate(completed, year, 29) : dueDate;
      if (validationDueDate && validationDueDate <= today && !haveEntries.has(year)) {
        const { error: insertError } = await writer.from('annual_validation_entries')
          .upsert({ project_id: project.id, year, due_date: validationDueDate, result: 'pending' }, { onConflict: 'project_id,year', ignoreDuplicates: true });
        if (insertError) throw insertError;
      }
      if (!haveFollowUps.has(year)) {
        await writer.from('inspections')
          .insert({
            project_id: project.id,
            inspection_date: dueDate,
            inspection_type: 'follow_up',
            annual_follow_up_year: year,
            validation_status: 'pending',
            remarks: `Annual follow-up inspection due by ${dueDate}.`,
          })
          .then(undefined, () => undefined);
      }
    }
  }
}

/** Attach annual entries, follow-up years and signed-URL attachments to mapped projects. */
async function attachRoadExtras(db: SupabaseClient, records: StoredRecord[]): Promise<StoredRecord[]> {
  if (!records.length) return records;
  const ids = records.map((r) => r.id);
  const [{ data: entryRows, error: entriesError }, { data: followRows }, { data: attachRows }] = await Promise.all([
    db.from('annual_validation_entries').select('*').in('project_id', ids).order('year'),
    db.from('inspections').select('project_id, annual_follow_up_year').in('project_id', ids).eq('inspection_type', 'follow_up').not('annual_follow_up_year', 'is', null),
    db.from('attachments').select('*').in('project_id', ids).order('created_at'),
  ]);
  if (entriesError) throw entriesError;
  const signedByProject = new Map<string, StoredRecord[]>();
  for (const row of (attachRows ?? []) as Joined[]) {
    const mapped = await mapAttachmentRow(db, row);
    signedByProject.set(row.project_id, [...(signedByProject.get(row.project_id) ?? []), mapped]);
  }
  return records.map((record) => ({
    ...record,
    attachments: signedByProject.get(record.id) ?? [],
    annualValidationEntries: ((entryRows ?? []) as Joined[])
      .filter((e) => e.project_id === record.id)
      .map((e) => ({
        year: e.year,
        dueDate: str(e.due_date),
        result: ANNUAL_RESULT_FROM_DB[e.result] ?? 'Pending',
        remarks: e.remarks ?? '',
        ...(e.validated_at ? { validatedAt: e.validated_at } : {}),
      })),
    annualInspectionYears: ((followRows ?? []) as Joined[])
      .filter((f) => f.project_id === record.id)
      .map((f) => f.annual_follow_up_year as number)
      .sort((a, b) => a - b),
  }));
}

export async function listRoads(db: SupabaseClient, admin?: SupabaseClient): Promise<StoredRecord[]> {
  await ensureAnnualFollowUps(db, admin);
  const { data, error } = await db.from('projects').select(PROJECT_SELECT).is('archived_at', null).order('created_at', { ascending: false });
  if (error) throw error;
  return attachRoadExtras(db, (data ?? []).map(mapProject));
}

export async function listArchivedRoads(db: SupabaseClient): Promise<StoredRecord[]> {
  const { data, error } = await db.from('projects').select(PROJECT_SELECT).not('archived_at', 'is', null).order('archived_at', { ascending: false });
  if (error) throw error;
  return attachRoadExtras(db, (data ?? []).map(mapProject));
}

/** @mine — Save a validator's annual validation result for one project/year. */
export async function saveAnnualValidation(
  db: SupabaseClient,
  projectId: string,
  year: number,
  result: string,
  remarks: string,
  userId: string,
): Promise<void> {
  const { data, error } = await db.from('annual_validation_entries').update({
    result: VALIDATION_TO_DB[result], remarks: remarks.trim(),
    validated_by: userId, validated_at: new Date().toISOString(),
  }).eq('project_id', projectId).eq('year', year).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Could not update this annual validation.');
}

/** @mine — requeue the same returned annual decision, retaining its remarks. */
export async function requeueReturnedValidation(admin: SupabaseClient, projectId: string, year: number, validatedAt: string | undefined, remarks: string): Promise<boolean> {
  let query = admin.from('annual_validation_entries').update({ result: 'pending' }).eq('project_id', projectId).eq('year', year).eq('result', 'rejected').eq('remarks', remarks);
  query = validatedAt ? query.eq('validated_at', validatedAt) : query.is('validated_at', null);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  return !!data;
}

async function resolveBarangayId(db: SupabaseClient, name: string): Promise<number | null> {
  const clean = name.trim();
  if (!clean) return null;
  const { data } = await db.from('barangays').select('id').ilike('name', clean).maybeSingle();
  if (data) return data.id as number;
  const { data: created, error } = await db.from('barangays').insert({ name: clean }).select('id').single();
  // @mine — returning null here used to hide the real cause: roads.barangay_id is NOT NULL,
  // so the insert failed later with an opaque 'your role may not permit it'.
  if (error) {
    console.error('Could not create barangay.', error);
    throw new Error(`Could not save the barangay "${clean}". Ask a Head Engineer to add it, then try again.`);
  }
  return created.id as number;
}

async function resolveCategoryId(db: SupabaseClient, name: string): Promise<number | null> {
  const clean = name.trim();
  if (!clean) return null;
  const { data } = await db.from('project_categories').select('id').ilike('name', clean).maybeSingle();
  if (data) return data.id as number;
  const { data: created, error } = await db.from('project_categories').insert({ name: clean }).select('id').single();
  if (error || !created) throw new Error('Could not save the project category.');
  return created.id as number;
}

async function resolveContractorId(db: SupabaseClient, rec: StoredRecord): Promise<string | null> {
  const name = str(rec.contractorName).trim();
  if (!name) return null;
  const payload = {
    name,
    address: str(rec.contractorAddress) || null,
    // @mine — blank optional contact information does not erase a shared contractor's value.
    ...(str(rec.contactInformation).trim() ? { contact_information: str(rec.contactInformation).trim() } : {}),
    // @mine — never overwrite the hidden license on an existing shared contractor.
  };
  const { data } = await db.from('contractors').select('id').ilike('name', name).maybeSingle();
  if (data) {
    const { data: updated, error: updateError } = await db.from('contractors').update(payload).eq('id', data.id).select('id').maybeSingle();
    if (updateError || !updated) throw new Error('Could not update the contractor information.');
    return data.id as string;
  }
  const { data: created, error } = await db.from('contractors').insert(payload).select('id').single();
  if (error || !created) throw new Error('Could not save the contractor information.');
  return created.id as string;
}

function deriveProjectStatus(rec: StoredRecord): string {
  const explicit = str(rec.projectStatus);
  if (['planned', 'on_track', 'delayed', 'completed', 'turned_over'].includes(explicit)) return explicit;
  if (str(rec.turnoverDate)) return 'turned_over';
  if (str(rec.actualCompletionDate)) return 'completed';
  const pct = Number(rec.completionPercentage ?? 0);
  if (pct >= 100) return 'completed';
  if (pct > 0) return 'on_track';
  return 'planned';
}

const VALIDATION_TO_DB: Record<string, string> = {
  Validated: 'approved',
  'Return for Revision': 'rejected',
  'Pending Validation': 'pending',
  Pending: 'pending',
};

/** Create or update a road+project pair from the app's combined record. Returns the mapped record. */
export async function saveRoad(db: SupabaseClient, rec: StoredRecord, userId: string): Promise<StoredRecord> {
  const stagedAttachments = await prepareProjectAttachments(db, Array.isArray(rec.attachments) ? rec.attachments as AttachmentInput[] : [], userId);
  const barangayId = await resolveBarangayId(db, str(rec.barangay || rec.location));
  const categoryId = await resolveCategoryId(db, str(rec.projectCategory || rec.type));
  const contractorId = await resolveContractorId(db, rec);

  const existing = rec.id
    ? (await db.from('projects').select('id, road_id').eq('id', rec.id).maybeSingle()).data
    : null;

  // @mine — roads.barangay_id is NOT NULL, so a missing barangay used to bubble up as an
  // opaque 500 ("your role may not permit it") instead of telling the user what to fix.
  if (!barangayId) {
    throw new Error('A barangay is required for a road project.');
  }
  const roadPayload = {
    road_name: str(rec.roadName || rec.name) || 'Unnamed Road',
    // @mine — omit blank optional IDs, preserving an existing road's value.
    ...(str(rec.roadNetworkId).trim() ? { road_network_id: str(rec.roadNetworkId).trim() } : {}),
    barangay_id: barangayId,
    components: str(rec.components) || null,
    description: str(rec.description || rec.projectDescription) || null,
    date_built: str(rec.dateBuilt) || null,
    current_condition: (str(rec.condition).toLowerCase() || 'good') as string,
  };

  let roadId = (existing?.road_id as string) || str(rec.roadId);
  if (roadId) {
    const { data, error } = await db.from('roads').update(roadPayload).eq('id', roadId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Could not update this road. Check your permissions.');
  } else {
    const { data, error } = await db.from('roads').insert({ ...roadPayload, created_by: userId }).select('id').single();
    if (error) throw error;
    roadId = data.id as string;
  }

  const projectPayload = {
    project_name: str(rec.projectName || rec.name) || roadPayload.road_name,
    road_id: roadId,
    category_id: categoryId,
    category_other: null,
    description: str(rec.projectDescription || rec.description) || null,
    barangay_id: barangayId,
    date_started: str(rec.dateStarted) || null,
    target_completion_date: str(rec.targetCompletionDate) || null,
    extensions_count: Number(rec.noOfExtensions ?? 0) || 0,
    actual_completion_date: str(rec.actualCompletionDate) || null,
    status: deriveProjectStatus(rec),
    contractor_id: contractorId,
    source_of_funds: str(rec.sourceOfFunds) || null,
    appropriation: rec.appropriation === '' || rec.appropriation == null ? null : Number(rec.appropriation),
    contracted_amount: rec.contractedAmount === '' || rec.contractedAmount == null ? null : Number(rec.contractedAmount),
    // @mine — preserve the hidden actual project cost when saving.
    completion_date: str(rec.completionDate) || null,
    // @mine — preserve existing completion percentage; new rows use the database default.
    turnover_date: str(rec.turnoverDate) || null,

  };

  let projectId = existing?.id as string | undefined;
  if (projectId) {
    const { data, error } = await db.from('projects').update(projectPayload).eq('id', projectId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Could not update this project. Check your permissions.');
  } else {
    const { data, error } = await db.from('projects').insert({ ...projectPayload, created_by: userId }).select('id').single();
    if (error) throw error;
    projectId = data.id as string;
  }

  // The project already exists here; report attachment failures without inviting a duplicate create.
  let attachmentWarning = '';
  const linkedRows: Joined[] = [];
  for (const attachment of stagedAttachments) {
    const { error } = await db.from('attachments').insert({
      project_id: projectId, category: 'turnover_certificate', file_name: attachment.name,
      storage_path: attachment.path, mime_type: attachment.type, file_size: attachment.size, uploaded_by: userId,
    });
    if (error) {
      console.error('Project saved but attachment registration failed.', error);
      attachmentWarning = 'The project was saved, but an attachment could not be linked. Please edit the project and upload it again.';
    } else {
      linkedRows.push({ file_name: attachment.name, mime_type: attachment.type, storage_path: attachment.path, category: 'turnover_certificate' });
    }
  }

  // @mine — the road and the project are already committed at this point. A failure in this
  // follow-up read (joins, signed URLs, extras) must NOT surface as 'unable to create',
  // otherwise the user sees an error for a project that is sitting in the list.
  try {
    const { data: joined, error } = await db.from('projects').select(PROJECT_SELECT).eq('id', projectId!).single();
    if (error) throw error;
    const [mapped] = await attachRoadExtras(db, [mapProject(joined as Joined)]);
    return { ...mapped, ...(attachmentWarning ? { attachmentWarning } : {}) };
  } catch (error) {
    console.error('Project was saved but could not be re-read; returning the stored values.', error);
    const existingAttachments = Array.isArray(rec.attachments)
      ? (rec.attachments as AttachmentInput[]).filter(attachment => attachment.staged !== true) : [];
    const linkedAttachments = await Promise.all(linkedRows.map(async row => {
      try { return await mapAttachmentRow(db, row); }
      catch { return { name: row.file_name, type: row.mime_type, storagePath: row.storage_path, category: 'Turnover Certificate', dataUrl: '' }; }
    }));
    return {
      ...rec,
      attachments: [...existingAttachments, ...linkedAttachments],
      id: projectId,
      roadId: roadId ?? rec.roadId,
      projectName: projectPayload.project_name,
      name: projectPayload.project_name,
      ...(attachmentWarning ? { attachmentWarning } : {}),
    } as StoredRecord;
  }
}

export async function archiveRoad(db: SupabaseClient, id: string): Promise<boolean> {
  const { error, count } = await db.from('projects').update({ archived_at: new Date().toISOString() }, { count: 'exact' }).eq('id', id).is('archived_at', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}
export async function restoreRoad(db: SupabaseClient, id: string): Promise<boolean> {
  const { error, count } = await db.from('projects').update({ archived_at: null }, { count: 'exact' }).eq('id', id).not('archived_at', 'is', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}
export async function permanentlyDeleteRoad(db: SupabaseClient, id: string): Promise<boolean> {
  const { error, count } = await db.from('projects').delete({ count: 'exact' }).eq('id', id).not('archived_at', 'is', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/* ---------------------------------- inspections ---------------------------------- */

const INSPECTION_TYPE_TO_DB: Record<string, string> = {
  'Acceptance Inspection': 'type_acceptance',
  Routine: 'routine', 'Routine Inspection': 'routine',
  'Follow-up': 'follow_up', 'Follow-Up Inspection': 'follow_up', 'Annual Follow-Up': 'follow_up',
  Initial: 'initial', 'Initial Inspection': 'initial',
};
const INSPECTION_TYPE_FROM_DB: Record<string, string> = {
  type_acceptance: 'Acceptance Inspection', routine: 'Routine', follow_up: 'Follow-up', initial: 'Initial',
};
const RATING_TO_DB: Record<string, string> = { Good: 'good', Fair: 'fair', Poor: 'poor', Bad: 'bad', 'N/A': 'n/a' };
const COMPONENT_TO_DB: Record<string, string> = {
  Concrete: 'concrete', Asphalt: 'asphalt', Gravel: 'gravel', Earth: 'earth',
  Shoulder: 'shoulder', 'Side Drain': 'side_drain', Sidewalk: 'sidewalk',
  // @mine 2026-11-11 — four owner-requested categories (migration
  // 20261111_inspection_item_attachments.sql adds the enum values).
  Drainage: 'drainage', 'Solar Lights': 'solar_lights',
  'Slope Protection': 'slope_protection', 'Retaining Wall': 'retaining_wall',
};
const COMPONENT_FROM_DB: Record<string, string> = Object.fromEntries(Object.entries(COMPONENT_TO_DB).map(([a, b]) => [b, a]));

function mapInspection(i: Joined): StoredRecord {
  const items = (i.inspection_items ?? []) as Joined[];
  const conditionRatings: Record<string, string> = {};
  // @mine 2026-11-11 — per-category remark (inspection_items.remarks already existed).
  const conditionRemarks: Record<string, string> = {};
  for (const item of items) {
    const label = COMPONENT_FROM_DB[item.component] ?? item.component;
    conditionRatings[label] = str(item.rating).toLowerCase() === 'n/a' ? 'N/A' : cap(item.rating);
    const remark = str(item.remarks);
    if (remark) conditionRemarks[label] = remark;
  }
  return {
    id: i.id,
    localRoadId: i.project_id,
    localRoadName: i.projects?.project_name ?? i.projects?.roads?.road_name ?? '',
    projectName: i.projects?.project_name ?? '',
    projectCategory: '',
    location: '',
    date: str(i.inspection_date),
    conditionRating: i.overall_score == null ? 0 : Number(i.overall_score),
    conditionRatings,
    conditionRemarks,
    // @mine 2026-11-11 — per-category files, filled by the list functions below.
    conditionAttachments: {} as Record<string, StoredRecord[]>,
    remarks: i.remarks ?? '',
    inspector: i.profiles?.full_name ?? i.profiles?.name ?? '',
    inspectorId: i.inspector_id ?? undefined,
    inspectionType: i.inspection_purpose || INSPECTION_TYPE_FROM_DB[i.inspection_type] || 'Routine',
    // @mine — annual follow-up markers (scheduled rows have no score yet).
    ...(i.annual_follow_up_year
      ? {
          annualFollowUpYear: i.annual_follow_up_year as number,
          isAnnualFollowUp: true,
          isScheduledAnnualFollowUp: i.overall_score == null && i.validation_status === 'pending',
        }
      : {}),
    validationStatus:
      i.validation_status === 'approved' ? 'Validated' : i.validation_status === 'rejected' ? 'Return for Revision' : 'Pending Validation',
    archivedAt: i.archived_at ?? undefined,
  };
}

const INSPECTION_SELECT = '*, inspection_items(*), profiles!inspections_inspector_id_fkey(full_name, name), projects!inspections_project_id_fkey(project_name)';

/**
 * @mine 2026-11-11 — attach stored files to mapped inspections:
 *   * one inspection-level file  -> `attachment`  (unchanged behaviour)
 *   * item-level files           -> `conditionAttachments[<category label>]`
 */
async function attachInspectionAttachments(db: SupabaseClient, records: StoredRecord[]): Promise<void> {
  if (!records.length) return;
  const ids = records.map((r) => r.id);
  const { data: attachRows } = await db.from('attachments').select('*')
    .in('inspection_id', ids).is('inspection_item_id', null).order('created_at');
  for (const row of (attachRows ?? []) as Joined[]) {
    const target = records.find((r) => r.id === row.inspection_id);
    if (target && !target.attachment) target.attachment = await mapAttachmentRow(db, row);
  }
  const { data: itemRows } = await db.from('inspection_items').select('id, component').in('inspection_id', ids);
  const labelByItem = new Map<string, string>();
  for (const item of (itemRows ?? []) as Joined[]) {
    labelByItem.set(str(item.id), COMPONENT_FROM_DB[str(item.component)] ?? str(item.component));
  }
  const { data: itemAttachRows } = await db.from('attachments').select('*')
    .in('inspection_id', ids).not('inspection_item_id', 'is', null).order('created_at');
  for (const row of (itemAttachRows ?? []) as Joined[]) {
    const label = labelByItem.get(str(row.inspection_item_id));
    const target = records.find((r) => r.id === row.inspection_id);
    if (!label || !target) continue;
    const bucket = (target.conditionAttachments ?? {}) as Record<string, StoredRecord[]>;
    bucket[label] = [...(bucket[label] ?? []), await mapAttachmentRow(db, row)];
    target.conditionAttachments = bucket;
  }
}

async function listInspectionsWhere(db: SupabaseClient, archived: boolean, admin?: SupabaseClient): Promise<StoredRecord[]> {
  if (!archived) await ensureAnnualFollowUps(db, admin).catch(() => undefined);
  let q = db.from('inspections').select(INSPECTION_SELECT).order('inspection_date', { ascending: false });
  q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  const { data, error } = await q;
  if (error) throw error;
  const records = (data ?? []).map(mapInspection);
  await attachInspectionAttachments(db, records);
  return records;
}
export const listInspections = (db: SupabaseClient, admin?: SupabaseClient) => listInspectionsWhere(db, false, admin);
export const listArchivedInspections = (db: SupabaseClient) => listInspectionsWhere(db, true);

export async function saveInspection(db: SupabaseClient, rec: StoredRecord, projectId: string, userId: string): Promise<StoredRecord> {
  const idValue = str(rec.id);
  const lookup = idValue ? await db.from('inspections').select('id, inspection_type, remarks').eq('id', idValue).maybeSingle() : null;
  if (lookup?.error) throw lookup.error;
  const existing = lookup?.data ?? null;
  // The original enum continues to identify annual follow-ups. The user-facing
  // type is stored separately so recording an annual inspection cannot generate duplicates.
  const newPurpose = str(rec.inspectionType) === 'Monitoring and Maintenance Inspection' ? str(rec.inspectionType) : undefined;
  // Validate staged files before modifying the inspection or its items.
  const itemAttachments = (rec.conditionAttachments ?? {}) as Record<string, AttachmentInput[]>;
  const preparedItemFiles = await prepareInspectionItemAttachments(db, itemAttachments, userId);
  const payload = {
    project_id: projectId,
    inspection_date: str(rec.date) || new Date().toISOString().slice(0, 10),
    inspection_type: existing?.inspection_type ?? INSPECTION_TYPE_TO_DB[str(rec.inspectionType)] ?? 'routine',
    ...(newPurpose ? { inspection_purpose: newPurpose } : {}),
    inspector_id: userId,
    overall_score: rec.conditionRating == null || rec.conditionRating === '' ? null : Number(rec.conditionRating),
    remarks: existing?.remarks ?? (str(rec.remarks) || null),
    validation_status: VALIDATION_TO_DB[str(rec.validationStatus)] ?? 'pending',
    annual_follow_up_year: rec.annualFollowUpYear ? Number(rec.annualFollowUpYear) : null,
  };
  let id = idValue;
  if (existing) {
    const { error } = await db.from('inspections').update(payload).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await db.from('inspections').insert(payload).select('id').single();
    if (error) throw error;
    id = data.id as string;
  }
  const ratings = (rec.conditionRatings ?? {}) as Record<string, string>;
  // @mine 2026-11-11 — per-category remarks travel with each item row.
  const remarks = (rec.conditionRemarks ?? {}) as Record<string, string>;
  const entries = Object.entries(ratings).filter(([component]) => COMPONENT_TO_DB[component]);
  if (entries.length) {
    // @mine 2026-11-11 — update in place instead of delete+insert: deleting an item
    // cascades to its attachments (attachments.inspection_item_id ON DELETE CASCADE),
    // so a re-save would silently drop every photo already recorded for that category.
    const { data: existingItems } = await db.from('inspection_items')
      .select('id, component').eq('inspection_id', id);
    const idByComponent = new Map<string, string>();
    for (const item of (existingItems ?? []) as Joined[]) idByComponent.set(str(item.component), str(item.id));
    for (const [component, rating] of entries) {
      const componentDb = COMPONENT_TO_DB[component];
      const row = {
        rating: RATING_TO_DB[rating] ?? 'n/a',
        remarks: str(remarks[component]) || null,
      };
      const existingId = idByComponent.get(componentDb);
      if (existingId) {
        const { error } = await db.from('inspection_items').update(row).eq('id', existingId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await db.from('inspection_items')
          .insert({ inspection_id: id, component: componentDb, ...row }).select('id').single();
        if (error) throw error;
      }
    }
    // Keep older or unrecognized component rows and their attachments intact.

  }
  // @mine — persist the inspection's file attachment to Storage (best-effort).
  const attachment = rec.attachment as AttachmentInput | undefined;
  if (attachment && !str(attachment.storagePath) && str(attachment.dataUrl).startsWith('data:')) {
    await syncAttachments(
      db,
      { inspection_id: id },
      [{ ...attachment, category: attachment.category ?? 'Inspection Photo' }],
      userId,
    );
  }
  // @mine 2026-11-11 — per-category attachments. Staged uploads are verified against
  // Storage before any row is written; already-stored files are left untouched.
  if (preparedItemFiles.length) {
    const { data: currentItems } = await db.from('inspection_items').select('id, component').eq('inspection_id', id);
    const itemIdByComponent = new Map<string, string>();
    for (const item of (currentItems ?? []) as Joined[]) itemIdByComponent.set(str(item.component), str(item.id));
    for (const file of preparedItemFiles) {
      const inspectionItemId = itemIdByComponent.get(COMPONENT_TO_DB[file.component]);
      if (!inspectionItemId) throw new Error('Save the category ratings before adding their attachments.');
      const { error } = await db.from('attachments').insert({
        inspection_id: id,
        inspection_item_id: inspectionItemId,
        category: 'inspection_photo',
        file_name: file.name,
        storage_path: file.path,
        mime_type: file.type,
        file_size: file.size,
        uploaded_by: userId,
      });
      if (error) throw error;
    }
  }

  const { data, error } = await db.from('inspections').select(INSPECTION_SELECT).eq('id', id).single();
  if (error) throw error;
  const mapped = mapInspection(data as Joined);
  await attachInspectionAttachments(db, [mapped]);
  return mapped;
}

export async function archiveInspection(db: SupabaseClient, id: string): Promise<boolean> {
  const { error, count } = await db.from('inspections').update({ archived_at: new Date().toISOString() }, { count: 'exact' }).eq('id', id).is('archived_at', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}
export async function restoreInspection(db: SupabaseClient, id: string): Promise<boolean> {
  const { error, count } = await db.from('inspections').update({ archived_at: null }, { count: 'exact' }).eq('id', id).not('archived_at', 'is', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}
export async function permanentlyDeleteInspection(db: SupabaseClient, id: string): Promise<boolean> {
  const { error, count } = await db.from('inspections').delete({ count: 'exact' }).eq('id', id).not('archived_at', 'is', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/* ---------------------------------- maintenance ---------------------------------- */

const MAINT_STATUS_TO_DB: Record<string, string> = {
  Scheduled: 'scheduled', 'In Progress': 'in_progress', Completed: 'completed', Deferred: 'deferred',
};
const MAINT_STATUS_FROM_DB: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed', deferred: 'Deferred',
};
const MAINT_TYPE_TO_DB: Record<string, string> = {
  Corrective: 'corrective', 'Corrective Type': 'corrective', 'Corrective Maintenance': 'corrective', Preventive: 'preventive', Routine: 'routine', Emergency: 'emergency',
};
const MAINT_TYPE_FROM_DB: Record<string, string> = Object.fromEntries(Object.entries(MAINT_TYPE_TO_DB).map(([a, b]) => [b, a]));

function mapMaintenance(m: Joined): StoredRecord {
  return {
    id: m.id,
    localRoadId: m.project_id,
    inspectionId: m.inspection_id ?? undefined,
    localRoadName: m.projects?.project_name ?? '',
    type: MAINT_TYPE_FROM_DB[m.maintenance_type] ?? cap(m.maintenance_type),
    scheduledDate: str(m.scheduled_date),
    dateStarted: str(m.start_date),
    completedDate: str(m.completed_date) || undefined,
    cost: m.cost == null ? 0 : Number(m.cost),
    status: MAINT_STATUS_FROM_DB[m.status] ?? 'Scheduled',
    description: m.activities ?? '',
    remarks: m.remarks ?? '',
    archivedAt: m.archived_at ?? undefined,
  };
}

const MAINT_SELECT = '*, projects!maintenance_records_project_id_fkey(project_name)';
async function listMaintenanceWhere(db: SupabaseClient, archived: boolean): Promise<StoredRecord[]> {
  let q = db.from('maintenance_records').select(MAINT_SELECT).order('scheduled_date', { ascending: false });
  q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapMaintenance);
}
export const listMaintenance = (db: SupabaseClient) => listMaintenanceWhere(db, false);
export const listArchivedMaintenance = (db: SupabaseClient) => listMaintenanceWhere(db, true);

export async function saveMaintenance(db: SupabaseClient, rec: StoredRecord, projectId: string, userId: string): Promise<StoredRecord> {
  const payload = {
    project_id: projectId,
    ...(rec.inspectionId !== undefined ? { inspection_id: str(rec.inspectionId) || null } : {}),
    maintenance_type: MAINT_TYPE_TO_DB[str(rec.type)] ?? 'routine',
    activities: str(rec.description) || null,
    ...(rec.remarks !== undefined ? { remarks: str(rec.remarks) || null } : {}),
    scheduled_date: str(rec.scheduledDate) || null,
    start_date: str(rec.dateStarted) || null,
    completed_date: str(rec.completedDate) || null,
    cost: Number(rec.cost ?? 0) || 0,
    status: MAINT_STATUS_TO_DB[str(rec.status)] ?? 'scheduled',
    created_by: userId,
  };
  let id = str(rec.id);
  const existing = id ? (await db.from('maintenance_records').select('id').eq('id', id).maybeSingle()).data : null;
  if (existing) {
    const { created_by: _ignored, ...update } = payload;
    const { error } = await db.from('maintenance_records').update(update).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await db.from('maintenance_records').insert(payload).select('id').single();
    if (error) throw error;
    id = data.id as string;
  }
  const { data, error } = await db.from('maintenance_records').select(MAINT_SELECT).eq('id', id).single();
  if (error) throw error;
  return mapMaintenance(data as Joined);
}

export async function archiveMaintenance(db: SupabaseClient, id: string): Promise<boolean> {
  const { error, count } = await db.from('maintenance_records').update({ archived_at: new Date().toISOString() }, { count: 'exact' }).eq('id', id).is('archived_at', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}
export async function restoreMaintenance(db: SupabaseClient, id: string): Promise<boolean> {
  const { error, count } = await db.from('maintenance_records').update({ archived_at: null }, { count: 'exact' }).eq('id', id).not('archived_at', 'is', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}
export async function permanentlyDeleteMaintenance(db: SupabaseClient, id: string): Promise<boolean> {
  const { error, count } = await db.from('maintenance_records').delete({ count: 'exact' }).eq('id', id).not('archived_at', 'is', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/* ---------------------------------- users / activity ---------------------------------- */

export interface AppUser {
  userId: string;
  name: string;
  email: string;
  username: string;
  role: string;
  status: 'Active' | 'Inactive';
  createdDate?: string;
  archivedAt?: string;
}

export function mapProfile(p: Joined): AppUser {
  return {
    userId: p.id,
    name: p.full_name || p.name || p.username,
    email: p.email,
    username: p.username,
    role: ROLE_FROM_DB[p.role] ?? p.role,
    status: p.status === 'inactive' || p.status === 'locked' ? 'Inactive' : 'Active',
    createdDate: str(p.created_at).slice(0, 10),
    ...(p.archived_at ? { archivedAt: p.archived_at } : {}),
  };
}

export async function listUsers(admin: SupabaseClient): Promise<AppUser[]> {
  const { data, error } = await admin.from('profiles').select('*').is('archived_at', null).order('created_at');
  if (error) throw error;
  return (data ?? []).map(mapProfile);
}
export async function listArchivedUsers(admin: SupabaseClient): Promise<AppUser[]> {
  const { data, error } = await admin.from('profiles').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapProfile);
}

export async function addActivityLog(
  admin: SupabaseClient,
  input: { userId?: string; user: string; action: string; details: string },
): Promise<void> {
  // @mine — logging is best-effort: it runs after the write and must never fail the request.
  try {
    await admin.from('activity_logs').insert({
      user_id: input.userId ?? null,
      user_name: input.user,
      action: input.action,
      entity_type: 'app',
      details: { message: input.details },
    });
  } catch (error) {
    console.error('Could not write the activity log entry.', error);
  }
}

export async function listActivityLogs(admin: SupabaseClient): Promise<Array<{ id: string; user: string; action: string; timestamp: string; details: string }>> {
  const { data, error } = await admin.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []).map((row: Joined) => ({
    id: String(row.id),
    user: row.user_name ?? 'system',
    action: row.action,
    timestamp: row.created_at,
    details:
      typeof row.details === 'string'
        ? row.details
        : str((row.details as Joined)?.message ?? JSON.stringify(row.details ?? {})),
  }));
}

/* --------------------- @mine: AI priority run persistence --------------------- */

export interface AiPredictionRow {
  localRoadId: string;
  riskLevel: 'High' | 'Medium' | 'Low';
  priorityScore: number;
  justification: string;
  recommendation: string;
}

const RISK_TO_DB: Record<string, string> = { High: 'high', Medium: 'medium', Low: 'low' };
const RISK_FROM_DB: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** Save one AI generation as an ai_analysis_runs row + ai_priority_results rows. */
export async function saveAiRun(
  admin: SupabaseClient,
  input: {
    userId: string;
    model: string;
    predictions: AiPredictionRow[];
    factorsByProjectId?: Record<string, Record<string, unknown>>;
  },
): Promise<string | null> {
  if (!input.predictions.length) return null;
  const { data: run, error } = await admin
    .from('ai_analysis_runs')
    .insert({ run_by: input.userId, model: input.model, total_projects: input.predictions.length })
    .select('id')
    .single();
  if (error) throw error;
  const runId = run.id as string;
  const rows = input.predictions.map((p) => ({
    run_id: runId,
    project_id: p.localRoadId,
    risk_level: RISK_TO_DB[p.riskLevel] ?? 'low',
    priority_score: p.priorityScore,
    justification: p.justification,
    recommendation: p.recommendation,
    factors: input.factorsByProjectId?.[p.localRoadId] ?? {},
    decision: 'pending',
  }));
  const { error: insertError } = await admin.from('ai_priority_results').insert(rows);
  if (insertError) throw insertError;
  return runId;
}

/** Latest saved AI run, mapped to the UI's PredictionResult shape. */
export async function getLatestAiPredictions(admin: SupabaseClient): Promise<StoredRecord[]> {
  const { data: run } = await admin
    .from('ai_analysis_runs')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return [];
  const { data, error } = await admin
    .from('ai_priority_results')
    .select('*, projects!ai_priority_results_project_id_fkey(project_name, roads!projects_road_id_fkey(road_name, current_condition, last_inspection_date), project_categories(name))')
    .eq('run_id', run.id)
    .order('priority_score', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Joined) => {
    const project = (row.projects ?? {}) as Joined;
    const road = (project.roads ?? {}) as Joined;
    const factors = (row.factors ?? {}) as Joined;
    return {
      localRoadId: row.project_id,
      localRoadName: str(factors.name) || road.road_name || project.project_name || '',
      type: str(factors.type) || project.project_categories?.name || '',
      lastInspection: str(factors.lastInspection) || str(road.last_inspection_date) || 'N/A',
      condition: str(factors.condition) || cap(road.current_condition) || 'Good',
      riskLevel: RISK_FROM_DB[row.risk_level] ?? 'Low',
      priorityScore: Number(row.priority_score ?? 0),
      justification: row.justification ?? '',
      recommendation: row.recommendation ?? '',
    } as unknown as StoredRecord;
  });
}

export { ROLE_TO_DB, ROLE_FROM_DB };

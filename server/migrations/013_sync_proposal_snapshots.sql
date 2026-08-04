-- Atomically keep contract and Fresh Award proposal snapshots aligned with
-- their canonical opportunity. The workflow runs as the authenticated user,
-- whose RLS policy may intentionally deny direct writes to downstream tables;
-- this narrow function exposes only the two linked attachment columns.

\set ON_ERROR_STOP on

begin;

create or replace function private.proposal_attachment_file_metadata(
  target_paths text[]
)
returns table (
  storage_path text,
  object_key text,
  content_available boolean,
  size_bytes bigint,
  attachment_id text,
  original_name text,
  content_type text,
  attached_at timestamptz,
  uploader_name text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, app_files
set row_security = off
as $proposal_file_metadata$
begin
  if not (
    private.has_permission('opportunity:submitProposal')
    or private.has_permission('opportunity:edit')
    or private.has_permission('admin:manageUsers')
  ) then
    raise exception 'You do not have permission to inspect proposal files.'
      using errcode = '42501';
  end if;

  if target_paths is null
     or cardinality(target_paths) > 100
     or exists (
       select 1
         from unnest(target_paths) requested_path
        where requested_path is null
           or btrim(requested_path) = ''
           or length(requested_path) > 1024
           or requested_path not like 'proposals/%'
           or position(chr(10) in requested_path) > 0
           or position(chr(13) in requested_path) > 0
     ) then
    raise exception 'Proposal file paths are invalid.'
      using errcode = '23514';
  end if;

  return query
  select object_file.storage_path,
         object_file.object_key::text,
         object_file.content_available,
         object_file.size_bytes,
         object_file.attachment_id,
         object_file.original_name,
         object_file.content_type,
         object_file.attached_at,
         coalesce(profile.username, profile.name, '')::text as uploader_name
    from app_files.objects object_file
    left join public.users profile
      on profile.auth_user_id = object_file.uploaded_by
   where object_file.storage_path = any(target_paths)
     and object_file.storage_path like 'proposals/%'
     for key share of object_file;
end
$proposal_file_metadata$;

revoke all on function private.proposal_attachment_file_metadata(text[])
  from public, app_runtime;
grant execute on function private.proposal_attachment_file_metadata(text[])
  to authenticated;

create or replace function private.sync_opportunity_proposal_attachments(
  target_opportunity_id text,
  target_attachments jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, app_files
set row_security = off
as $sync_proposal_snapshots$
declare
  current_attachments jsonb;
begin
  if not (
    private.has_permission('opportunity:submitProposal')
    or private.has_permission('opportunity:edit')
    or private.has_permission('admin:manageUsers')
  ) then
    raise exception 'You do not have permission to update proposal snapshots.'
      using errcode = '42501';
  end if;

  if target_opportunity_id is null
     or btrim(target_opportunity_id) = ''
     or target_attachments is null
     or jsonb_typeof(target_attachments) is distinct from 'array' then
    raise exception 'Proposal snapshot input is invalid.'
      using errcode = '23514';
  end if;

  if jsonb_array_length(target_attachments) > 100 then
    raise exception 'Proposal snapshot input is invalid.'
      using errcode = '23514';
  end if;

  select opportunity.proposal_attachments
    into current_attachments
    from public.opportunities opportunity
   where opportunity.id = target_opportunity_id
   for update;

  if not found then
    raise exception 'The opportunity could not be found.'
      using errcode = 'P0002';
  end if;

  -- This function is intentionally only a downstream snapshot synchronizer.
  -- The authenticated workflow must first persist the same canonical list on
  -- the opportunity through its ordinary RLS-protected update.
  if current_attachments is distinct from target_attachments then
    raise exception 'The proposal snapshot does not match the opportunity.'
      using errcode = '23514';
  end if;

  -- Hold every canonical file row through the surrounding workflow
  -- transaction. API uploads are immutable, so a validated path cannot be
  -- replaced between this check and the downstream snapshot updates.
  perform 1
    from app_files.objects object_file
   where object_file.storage_path in (
     select attachment->>'storagePath'
       from jsonb_array_elements(target_attachments) attachment
   )
   for key share;

  if exists (
    select 1
      from jsonb_array_elements(target_attachments) attachment
     where jsonb_typeof(attachment) <> 'object'
        or coalesce(attachment->>'storagePath', '') = ''
        or attachment->>'storagePath' not like 'proposals/%'
        or not exists (
          select 1
            from app_files.objects object_file
            left join public.users profile
              on profile.auth_user_id = object_file.uploaded_by
           where object_file.storage_path = attachment->>'storagePath'
             and object_file.content_available
             and object_file.attachment_id = attachment->>'id'
             and object_file.original_name = attachment->>'name'
             and object_file.size_bytes::text = attachment->>'size'
             and to_char(
                   object_file.attached_at at time zone 'UTC',
                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                 ) = attachment->>'attachedAt'
             and coalesce(profile.username, profile.name, '') = attachment->>'uploadedBy'
             and object_file.content_type is not distinct from attachment->>'mimeType'
        )
  ) then
    raise exception 'A proposal attachment is not available in private storage.'
      using errcode = '23503';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(target_attachments) attachment
     group by attachment->>'storagePath'
    having count(*) > 1
  ) then
    raise exception 'A proposal attachment is repeated.'
      using errcode = '23514';
  end if;

  update public.contracts
     set proposal_attachments = target_attachments
   where opportunity_id = target_opportunity_id;

  update public.fresh_awards
     set proposal_attachments = target_attachments
   where opportunity_id = target_opportunity_id;
end
$sync_proposal_snapshots$;

revoke all on function private.sync_opportunity_proposal_attachments(text, jsonb)
  from public, app_runtime;
grant execute on function private.sync_opportunity_proposal_attachments(text, jsonb)
  to authenticated;

commit;

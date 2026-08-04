-- Replace one verified stale contract proposal snapshot with the healthy
-- native attachment already stored on its linked opportunity.
--
-- This is deliberately narrow: filename, size, MIME type, record ids, paths,
-- and native file availability must all match. Other historical references
-- remain untouched because their original bytes cannot be reconstructed.

\set ON_ERROR_STOP on

begin;

set local lock_timeout = '5s';

do $repair$
declare
  stale_rows integer;
  eligible_rows integer;
  repaired_rows integer;
begin
  -- Freeze every row used by the eligibility decision until the transaction
  -- commits. This prevents the audited metadata from changing after the check
  -- but before the contract snapshot is replaced.
  perform 1
    from public.contracts c
   where c.id = 'c1785334021365'
   for update;

  perform 1
    from public.opportunities o
   where o.id = 'o1783017612509'
   for update;

  perform 1
    from app_files.objects f
   where f.storage_path in (
     'proposals/1b06f2a7-3b92-4cc2-907e-57d5dd609719-CE_Solution_Plus_Corp._140P8626Q0040_N--REPLACE_THREE_3_HVAC_SYSTEMS_SAMO.pdf',
     'proposals/74747b7a-1c87-4857-8bee-8bebdbc5ec5c-CE_Solution_Plus_Corp._140P8626Q0040_N--REPLACE_THREE_3_HVAC_SYSTEMS_SAMO.pdf'
   )
   order by f.storage_path
   for update;

  select count(*)
    into stale_rows
    from public.contracts c
   where c.id = 'c1785334021365'
     and c.opportunity_id = 'o1783017612509'
     and jsonb_typeof(c.proposal_attachments) = 'array'
     and jsonb_array_length(c.proposal_attachments) = 1
     and c.proposal_attachments->0->>'id' = '1b06f2a7-3b92-4cc2-907e-57d5dd609719'
     and c.proposal_attachments->0->>'storagePath' = 'proposals/1b06f2a7-3b92-4cc2-907e-57d5dd609719-CE_Solution_Plus_Corp._140P8626Q0040_N--REPLACE_THREE_3_HVAC_SYSTEMS_SAMO.pdf';

  if stale_rows = 0 then
    return;
  end if;

  select count(*)
    into eligible_rows
    from public.contracts c
    join public.opportunities o on o.id = c.opportunity_id
   where c.id = 'c1785334021365'
     and c.opportunity_id = 'o1783017612509'
     and jsonb_typeof(c.proposal_attachments) = 'array'
     and jsonb_array_length(c.proposal_attachments) = 1
     and c.proposal_attachments->0->>'id' = '1b06f2a7-3b92-4cc2-907e-57d5dd609719'
     and c.proposal_attachments->0->>'storagePath' = 'proposals/1b06f2a7-3b92-4cc2-907e-57d5dd609719-CE_Solution_Plus_Corp._140P8626Q0040_N--REPLACE_THREE_3_HVAC_SYSTEMS_SAMO.pdf'
     and jsonb_typeof(o.proposal_attachments) = 'array'
     and jsonb_array_length(o.proposal_attachments) = 1
     and o.proposal_attachments->0->>'id' = '74747b7a-1c87-4857-8bee-8bebdbc5ec5c'
     and o.proposal_attachments->0->>'storagePath' = 'proposals/74747b7a-1c87-4857-8bee-8bebdbc5ec5c-CE_Solution_Plus_Corp._140P8626Q0040_N--REPLACE_THREE_3_HVAC_SYSTEMS_SAMO.pdf'
     and c.proposal_attachments->0->>'name' = o.proposal_attachments->0->>'name'
     and c.proposal_attachments->0->>'size' = o.proposal_attachments->0->>'size'
     and c.proposal_attachments->0->>'mimeType' is not distinct from
         o.proposal_attachments->0->>'mimeType'
     and not exists (
       select 1
         from app_files.objects f
        where f.storage_path = c.proposal_attachments->0->>'storagePath'
     )
     and exists (
       select 1
         from app_files.objects f
         left join public.users uploader
           on uploader.auth_user_id = f.uploaded_by
        where f.storage_path = o.proposal_attachments->0->>'storagePath'
          and f.content_available
          and f.attachment_id = o.proposal_attachments->0->>'id'
          and f.original_name = o.proposal_attachments->0->>'name'
          and f.size_bytes::text = o.proposal_attachments->0->>'size'
          and f.content_type is not distinct from o.proposal_attachments->0->>'mimeType'
          and to_char(
                f.attached_at at time zone 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
              ) = o.proposal_attachments->0->>'attachedAt'
          and coalesce(uploader.username, uploader.name, '') =
              o.proposal_attachments->0->>'uploadedBy'
     );

  if eligible_rows <> 1 then
    raise exception 'Verified contract proposal repair expected one eligible row, found %', eligible_rows;
  end if;

  update public.contracts c
     set proposal_attachments = o.proposal_attachments
    from public.opportunities o
   where c.id = 'c1785334021365'
     and c.opportunity_id = 'o1783017612509'
     and o.id = c.opportunity_id
     and c.proposal_attachments->0->>'id' = '1b06f2a7-3b92-4cc2-907e-57d5dd609719'
     and o.proposal_attachments->0->>'id' = '74747b7a-1c87-4857-8bee-8bebdbc5ec5c';

  get diagnostics repaired_rows = row_count;
  if repaired_rows <> 1 then
    raise exception 'Verified contract proposal repair updated % rows', repaired_rows;
  end if;
end
$repair$;

commit;

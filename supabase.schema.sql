-- Synapse Academia - Supabase Storage setup
-- Ejecuta este archivo en el SQL Editor de Supabase.
-- Convex guarda las referencias de documentos; Supabase solo guarda los PDFs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materials',
  'materials',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Synapse can upload material PDFs" on storage.objects;
drop policy if exists "Synapse can upload material files" on storage.objects;
drop policy if exists "Synapse can create signed material URLs" on storage.objects;
drop policy if exists "Synapse authenticated uploads" on storage.objects;
drop policy if exists "Synapse authenticated reads" on storage.objects;

-- No direct anon/authenticated policy is created. Convex validates the signed-in
-- account, admin role, ownership and active plan before asking Supabase (with a
-- server-only secret key) for a short-lived upload or download URL.

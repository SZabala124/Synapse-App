import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

const TABLE = "documents";

export async function fetchDocuments() {
  if (!isSupabaseConfigured) return { data: [], error: null, skipped: true };

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("updated_at", { ascending: false });

  return { data: data ?? [], error, skipped: false };
}

export async function createDocument(document) {
  if (!isSupabaseConfigured) return { data: null, error: null, skipped: true };

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      title: document.title,
      subject: document.subject,
      format: document.format,
      level: document.level,
      source: document.source,
      saved: Boolean(document.saved),
      metadata: document.metadata ?? {},
    })
    .select()
    .single();

  return { data, error, skipped: false };
}

export async function updateDocument(id, patch) {
  if (!isSupabaseConfigured) return { data: null, error: null, skipped: true };

  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  return { data, error, skipped: false };
}

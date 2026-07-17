import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

const BUCKET = import.meta.env.VITE_SUPABASE_MATERIALS_BUCKET || "materials";
const PDF_SIGNED_URL_TTL_SECONDS = 60;
const IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 10;
const SIGNED_URL_CACHE_PREFIX = "synapse-signed-pdf-url-v1";
const IMAGE_URL_CACHE_PREFIX = "synapse-signed-material-image-url-v1";
const PDF_BLOB_CACHE_LIMIT = 3;
const IMAGE_BLOB_CACHE_LIMIT = 40;
const pdfBlobCache = new Map();
const imageBlobCache = new Map();

export async function uploadMaterialPdf(file, ownerEmail) {
  if (!isSupabaseConfigured) throw new Error("El almacenamiento de archivos no esta configurado.");
  if (file.type !== "application/pdf") throw new Error("Por ahora solo se aceptan archivos PDF.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${ownerEmail}/pdf/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw normalizeStorageError(error);
  return {
    bucket: BUCKET,
    path,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

export async function uploadMaterialImage(file, ownerEmail) {
  if (!file || file.size === 0) return null;
  if (!isSupabaseConfigured) throw new Error("El almacenamiento de imagenes no esta configurado.");
  if (!file.type.startsWith("image/")) throw new Error("La portada debe ser una imagen.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${ownerEmail}/images/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "86400",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw normalizeStorageError(error);
  return {
    bucket: BUCKET,
    path,
    fileName: file.name,
  };
}

export async function getMaterialPdfUrl(storagePath) {
  const cached = readSignedUrlCache(storagePath);
  if (cached) return cached;
  if (!isSupabaseConfigured) throw new Error("El almacenamiento de archivos no esta configurado.");

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, PDF_SIGNED_URL_TTL_SECONDS);
  if (error) throw normalizeStorageError(error);
  writeSignedUrlCache(storagePath, data.signedUrl, SIGNED_URL_CACHE_PREFIX, PDF_SIGNED_URL_TTL_SECONDS);
  return data.signedUrl;
}

export async function getMaterialPdfObjectUrl(storagePath) {
  const pdfBlob = await getMaterialPdfBlob(storagePath);
  return URL.createObjectURL(pdfBlob);
}

export async function getMaterialPdfBlob(storagePath) {
  const cachedBlob = readPdfBlob(storagePath);
  if (cachedBlob) {
    logFileCacheHit("PDF", storagePath, cachedBlob.size);
    return cachedBlob;
  }
  const signedUrl = await createMaterialPdfSignedUrl(storagePath);
  const response = await fetch(signedUrl, {
    method: "GET",
    cache: "force-cache",
    credentials: "omit",
  });
  if (!response.ok) throw new Error("No se pudo abrir el PDF protegido.");
  const blob = await response.blob();
  const pdfBlob = new Blob([blob], { type: "application/pdf" });
  logFileDownload("PDF", storagePath, pdfBlob.size);
  writePdfBlob(storagePath, pdfBlob);
  return pdfBlob;
}

export async function getMaterialImageUrl(storagePath) {
  const cachedBlob = readImageBlob(storagePath);
  if (cachedBlob) {
    logFileCacheHit("imagen", storagePath, cachedBlob.size);
    return URL.createObjectURL(cachedBlob);
  }

  const signedUrl = await createMaterialImageSignedUrl(storagePath);
  const response = await fetch(signedUrl, {
    method: "GET",
    cache: "force-cache",
    credentials: "omit",
  });
  if (!response.ok) throw new Error("No se pudo abrir la portada del material.");
  const blob = await response.blob();
  logFileDownload("imagen", storagePath, blob.size);
  writeImageBlob(storagePath, blob);
  return URL.createObjectURL(blob);
}

export async function deleteMaterialFile(storagePath) {
  if (!storagePath) return;
  if (!isSupabaseConfigured) return;

  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) throw normalizeStorageError(error);
  sessionStorage.removeItem(`${SIGNED_URL_CACHE_PREFIX}:${storagePath}`);
  sessionStorage.removeItem(`${IMAGE_URL_CACHE_PREFIX}:${storagePath}`);
  pdfBlobCache.delete(storagePath);
  imageBlobCache.delete(storagePath);
}

function normalizeStorageError(error) {
  const message = [error?.message, error?.error, error?.statusCode].filter(Boolean).join(" ");
  const bucketMissing = /bucket|not found|404/i.test(message);
  const policyMissing = /row-level security|policy|permission|unauthorized|403|401/i.test(message);

  if (bucketMissing) {
    return new Error(`No existe el bucket privado "${BUCKET}" para guardar archivos. Ejecuta el setup de Storage de Supabase y vuelve a intentar.`);
  }

  if (policyMissing) {
    return new Error(`El bucket "${BUCKET}" existe, pero faltan permisos de Storage para subir o abrir archivos.`);
  }

  return error instanceof Error ? error : new Error("No se pudo procesar el PDF en el almacenamiento.");
}

async function createMaterialPdfSignedUrl(storagePath) {
  if (!isSupabaseConfigured) throw new Error("El almacenamiento de archivos no esta configurado.");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, PDF_SIGNED_URL_TTL_SECONDS);
  if (error) throw normalizeStorageError(error);
  return data.signedUrl;
}

async function createMaterialImageSignedUrl(storagePath) {
  const cached = readSignedUrlCache(storagePath, IMAGE_URL_CACHE_PREFIX);
  if (cached) return cached;
  if (!isSupabaseConfigured) throw new Error("El almacenamiento de imagenes no esta configurado.");

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, IMAGE_SIGNED_URL_TTL_SECONDS);
  if (error) throw normalizeStorageError(error);
  writeSignedUrlCache(storagePath, data.signedUrl, IMAGE_URL_CACHE_PREFIX, IMAGE_SIGNED_URL_TTL_SECONDS);
  return data.signedUrl;
}

function readSignedUrlCache(storagePath, prefix = SIGNED_URL_CACHE_PREFIX) {
  let entry = null;
  try {
    entry = JSON.parse(sessionStorage.getItem(`${prefix}:${storagePath}`) ?? "null");
  } catch {
    entry = null;
  }
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.url;
}

function writeSignedUrlCache(storagePath, url, prefix = SIGNED_URL_CACHE_PREFIX, ttlSeconds = PDF_SIGNED_URL_TTL_SECONDS) {
  sessionStorage.setItem(`${prefix}:${storagePath}`, JSON.stringify({
    url,
    expiresAt: Date.now() + Math.max(5, ttlSeconds - 30) * 1000,
  }));
}

function readPdfBlob(storagePath) {
  const blob = pdfBlobCache.get(storagePath);
  if (!blob) return null;
  // Refresh recency without persisting protected file bytes to local storage.
  pdfBlobCache.delete(storagePath);
  pdfBlobCache.set(storagePath, blob);
  return blob;
}

function writePdfBlob(storagePath, blob) {
  pdfBlobCache.delete(storagePath);
  pdfBlobCache.set(storagePath, blob);
  while (pdfBlobCache.size > PDF_BLOB_CACHE_LIMIT) {
    const oldestPath = pdfBlobCache.keys().next().value;
    pdfBlobCache.delete(oldestPath);
  }
}

function readImageBlob(storagePath) {
  const blob = imageBlobCache.get(storagePath);
  if (!blob) return null;
  imageBlobCache.delete(storagePath);
  imageBlobCache.set(storagePath, blob);
  return blob;
}

function writeImageBlob(storagePath, blob) {
  imageBlobCache.delete(storagePath);
  imageBlobCache.set(storagePath, blob);
  while (imageBlobCache.size > IMAGE_BLOB_CACHE_LIMIT) {
    const oldestPath = imageBlobCache.keys().next().value;
    imageBlobCache.delete(oldestPath);
  }
}

function logFileDownload(kind, storagePath, bytes) {
  console.info(`[Synapse files] Descarga ${kind}: ${shortPath(storagePath)}, ${formatBytes(bytes)} aprox.`);
}

function logFileCacheHit(kind, storagePath, bytes) {
  console.info(`[Synapse files] Cache en memoria ${kind}: ${shortPath(storagePath)}, ${formatBytes(bytes)}. No se descargo de nuevo.`);
}

function shortPath(storagePath) {
  const value = String(storagePath ?? "");
  if (value.length <= 56) return value;
  return `${value.slice(0, 24)}...${value.slice(-24)}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

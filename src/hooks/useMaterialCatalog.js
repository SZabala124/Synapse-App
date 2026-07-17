import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { readMaterialCatalog, writeMaterialCatalog } from "../utils/materialCatalogDb";

const STATUS = {
  LOADING: "LoadingFirstPage",
  READY: "Exhausted",
};

export function useMaterialCatalog({ userEmail, scopeKey, serverRevision = 0, enabled = true }) {
  const [rows, setRows] = useState([]);
  const [localRevision, setLocalRevision] = useState(null);
  const [localReady, setLocalReady] = useState(false);
  const [needsManifest, setNeedsManifest] = useState(false);
  const rowsRef = useRef(rows);
  const revisionRef = useRef(localRevision);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    revisionRef.current = localRevision;
  }, [localRevision]);

  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setLocalRevision(null);
    setLocalReady(false);
    setNeedsManifest(false);

    if (!enabled) {
      setLocalReady(true);
      return () => {
        cancelled = true;
      };
    }

    readMaterialCatalog(scopeKey)
      .then((catalog) => {
        if (cancelled) return;
        if (Array.isArray(catalog?.rows) && typeof catalog.revision === "number") {
          logCatalogReuse(catalog);
          setRows(catalog.rows);
          setLocalRevision(catalog.revision);
          setNeedsManifest(false);
        } else {
          setNeedsManifest(true);
        }
      })
      .catch(() => {
        if (!cancelled) setNeedsManifest(true);
      })
      .finally(() => {
        if (!cancelled) setLocalReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, scopeKey]);

  const manifest = useQuery(
    api.documents.metadataManifest,
    enabled && localReady && needsManifest && userEmail ? { userEmail } : "skip",
  );

  const changes = useQuery(
    api.documents.changesSince,
    enabled && localReady && !needsManifest && userEmail && typeof localRevision === "number" && localRevision < serverRevision
      ? { userEmail, revision: localRevision, limit: 300 }
      : "skip",
  );

  useEffect(() => {
    if (!manifest) return;
    logCatalogDownload("manifest", manifest, manifest.rows?.length ?? 0);
    const nextRows = manifest.rows ?? [];
    const nextRevision = manifest.revision ?? serverRevision;
    rowsRef.current = nextRows;
    revisionRef.current = nextRevision;
    setRows(nextRows);
    setLocalRevision(nextRevision);
    setNeedsManifest(false);
    writeMaterialCatalog(scopeKey, { revision: nextRevision, rows: nextRows }).catch((error) => {
      console.warn("No se pudo guardar el catalogo local de materiales.", error);
    });
  }, [manifest, scopeKey, serverRevision]);

  useEffect(() => {
    if (!changes) return;
    if (changes.resetRequired) {
      console.info("[Synapse catalog] Los cambios acumulados requieren resincronizar el catalogo completo.");
      setNeedsManifest(true);
      return;
    }

    logCatalogDownload("deltas", changes, changes.changes?.length ?? 0);
    const nextRows = applyCatalogChanges(rowsRef.current, changes.changes ?? []);
    const nextRevision = changes.currentRevision ?? serverRevision;
    rowsRef.current = nextRows;
    revisionRef.current = nextRevision;
    setRows(nextRows);
    setLocalRevision(nextRevision);
    writeMaterialCatalog(scopeKey, { revision: nextRevision, rows: nextRows }).catch((error) => {
      console.warn("No se pudieron guardar los cambios locales del catalogo.", error);
    });
  }, [changes, scopeKey, serverRevision]);

  const persistRows = useCallback((nextRows) => {
    rowsRef.current = nextRows;
    setRows(nextRows);
    const revision = revisionRef.current ?? serverRevision;
    writeMaterialCatalog(scopeKey, { revision, rows: nextRows }).catch((error) => {
      console.warn("No se pudo actualizar el catalogo local de materiales.", error);
    });
  }, [scopeKey, serverRevision]);

  const updateRow = useCallback((id, updater) => {
    let changed = false;
    const nextRows = rowsRef.current.map((row) => {
      if (row._id !== id) return row;
      changed = true;
      return updater(row);
    });
    if (changed) persistRows(nextRows);
  }, [persistRows]);

  const upsertRow = useCallback((row) => {
    persistRows([row, ...rowsRef.current.filter((item) => item._id !== row._id)]);
  }, [persistRows]);

  const removeRow = useCallback((id) => {
    persistRows(rowsRef.current.filter((row) => row._id !== id));
  }, [persistRows]);

  return useMemo(() => ({
    results: rows,
    status: enabled && (!localReady || (needsManifest && manifest === undefined)) ? STATUS.LOADING : STATUS.READY,
    localRevision,
    updateRow,
    upsertRow,
    removeRow,
  }), [enabled, localReady, localRevision, manifest, needsManifest, removeRow, rows, updateRow, upsertRow]);
}

function applyCatalogChanges(rows, changes) {
  if (!changes.length) return rows;
  const byId = new Map(rows.map((row) => [row._id, row]));
  for (const change of changes) {
    if (change.operation === "delete") {
      byId.delete(change.documentId);
    } else if (change.row?._id) {
      byId.set(change.row._id, change.row);
    }
  }
  return Array.from(byId.values());
}

function logCatalogReuse(catalog) {
  const count = catalog.rows?.length ?? 0;
  console.info(`[Synapse catalog] Cache local reutilizado: ${count} metadatos, revision ${catalog.revision}. No se descargo el catalogo completo.`);
}

function logCatalogDownload(kind, payload, count) {
  const bytes = estimateJsonBytes(payload);
  console.info(`[Synapse catalog] Descarga ${kind}: ${count} ${kind === "manifest" ? "metadatos" : "cambios"}, ${formatBytes(bytes)} aprox.`);
}

function estimateJsonBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

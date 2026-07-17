import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getMaterialImageUrl, getMaterialPdfBlob } from "../services/materialFiles";

const MATERIAL_FORMAT_OPTIONS = ["Guia", "Formulario", "Resumen", "Parcial", "Quiz", "Taller", "Cuaderno de Ejercicios", "PDF", "Presentacion", "Video"];

export function MaterialsView({
  materials,
  subjects,
  remoteStatus,
  search,
  format,
  level = "Todos",
  subject = "Todas",
  sort = "Recientes",
  savedOnly = false,
  canAddMaterial = false,
  onSearchChange,
  onFormatChange,
  onLevelChange,
  onSubjectChange,
  onSortChange,
  onSavedOnlyChange,
  onAddMaterial,
  onEditMaterial,
  onDeleteMaterial,
  onToggleSaved,
  onRateMaterial,
  onClearMaterialRating,
  onMaterialOpen,
  onBeforeOpenMaterial,
  getMaterialAccessBadge,
  watermarkText = "",
  countMaterials = materials,
  countStats = null,
  hasMore = false,
  isLoadingFirst = false,
  isLoadingMore = false,
  onLoadMore,
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewerMaterial, setViewerMaterial] = useState(null);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [accessPrompt, setAccessPrompt] = useState(null);
  const [searchDraft, setSearchDraft] = useState(search);
  const loadMoreRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const formatCounts = countStats ? objectToMap(countStats.formats) : countBy(countMaterials, "format");
  const levelCounts = countStats ? objectToMap(countStats.levels) : countBy(countMaterials, "level");
  const subjectCounts = countStats ? objectToMap(countStats.subjects) : countByMany(countMaterials, materialSubjectIds);
  const totalMaterials = countStats?.total ?? countMaterials.length;
  const levelTotal = countStats?.levelTotal ?? totalMaterials;
  const formatTotal = countStats?.formatTotal ?? totalMaterials;
  const visibleSubjectTotal = subjects.length;
  const formatOptions = ["Todos", ...MATERIAL_FORMAT_OPTIONS];
  const levelOptions = ["Todos", "Gratis", "Pro"];
  const subjectOptions = [
    { value: "Todas", label: "Todas las materias", count: visibleSubjectTotal },
    ...subjects.map((item) => ({ value: item.id, label: subjectName(subjects, item.id), count: subjectCounts.get(item.id) ?? 0 })),
  ];
  const sortOptions = ["Recientes", "Mas vistos"];

  const [isSentinelIntersecting, setIsSentinelIntersecting] = useState(false);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  useEffect(() => {
    if (searchDraft === search) return undefined;
    const timeout = window.setTimeout(() => onSearchChange?.(searchDraft), 160);
    return () => window.clearTimeout(timeout);
  }, [onSearchChange, search, searchDraft]);

  useEffect(() => {
    loadingMoreRef.current = false;
  }, [search, format, level, subject, sort, savedOnly]);

  useEffect(() => {
    const isModalOpen = uploadOpen || Boolean(viewerMaterial) || Boolean(editingMaterial) || Boolean(accessPrompt);
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [uploadOpen, viewerMaterial, editingMaterial]);

  useEffect(() => {
    if (!hasMore || !onLoadMore || !loadMoreRef.current) {
      setIsSentinelIntersecting(false);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      const isIntersecting = entries.some((entry) => entry.isIntersecting);
      setIsSentinelIntersecting(isIntersecting);
      if (!isIntersecting) {
        loadingMoreRef.current = false;
        return;
      }
      if (loadingMoreRef.current || isLoadingMore) return;
      loadingMoreRef.current = true;
      onLoadMore();
    }, { rootMargin: "80px 0px", threshold: 0.2 });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  useEffect(() => {
    if (!isLoadingMore) {
      loadingMoreRef.current = false;
      if (hasMore && isSentinelIntersecting) {
        loadingMoreRef.current = true;
        onLoadMore();
      }
    }
  }, [isLoadingMore, hasMore, isSentinelIntersecting, onLoadMore]);

  async function openMaterial(material, displaySubject) {
    if (!material.storagePath && !material.externalUrl) return;
    const access = await onBeforeOpenMaterial?.(material);
    if (access && !access.allowed) {
      setAccessPrompt({ ...access, material: { ...material, displaySubject } });
      return;
    }
    onMaterialOpen?.(material);
    setViewerMaterial({ ...material, displaySubject });
  }

  function openMaterialFromKeyboard(event, material, displaySubject) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openMaterial(material, displaySubject);
  }

  return (
    <section className="workspace">
      <div className="workspace-header">
        <div className="materials-heading-copy">
          <p className="eyebrow">Biblioteca privada</p>
          <h1>Materiales de estudio</h1>
          <p>Encuentra guias, evaluaciones y recursos clave en segundos con filtros por materia, formato y nivel.</p>
        </div>
        <div className="library-search">
          <label className="library-search-field library-search-field-wide library-search-field-search">
            <span>Busqueda</span>
            <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} type="search" placeholder="Buscar material..." aria-label="Buscar material" />
          </label>
          <div className="library-search-field">
            <span>Nivel</span>
            <CustomSelect
              ariaLabel="Filtrar por nivel"
              value={level}
              options={levelOptions.map((item) => ({ value: item, label: item, count: item === "Todos" ? levelTotal : levelCounts.get(item) ?? 0 }))}
              onChange={onLevelChange}
            />
          </div>
          <div className="library-search-field">
            <span>Tipo</span>
            <CustomSelect
              ariaLabel="Filtrar por formato"
              value={format}
              options={formatOptions.map((item) => ({ value: item, label: item, count: item === "Todos" ? formatTotal : formatCounts.get(item) ?? 0 }))}
              onChange={onFormatChange}
            />
          </div>
          <div className="library-search-field library-search-field-subject">
            <span>Materia</span>
            <CustomSelect
              ariaLabel="Filtrar por materia"
              value={subject}
              options={subjectOptions}
              onChange={onSubjectChange}
              searchable
              searchPlaceholder="Buscar materia o codigo..."
            />
          </div>
          <div className="library-search-field">
            <span>Orden</span>
            <CustomSelect
              ariaLabel="Ordenar materiales"
              value={sort}
              options={sortOptions.map((item) => ({ value: item, label: item }))}
              onChange={onSortChange}
            />
          </div>
        </div>
      </div>

      <div className="material-control-row">
        <div className="cache-note material-status-note">{remoteStatus}</div>
        <div className="material-control-actions">
          <button
            className={savedOnly ? "secondary-action material-saved-filter is-active" : "secondary-action material-saved-filter"}
            type="button"
            onClick={() => onSavedOnlyChange?.(!savedOnly)}
            aria-pressed={savedOnly}
          >
            {savedOnly ? "Ver todos" : "Guardados"}
          </button>
          {canAddMaterial && (
            <button className="primary-action material-add-button" type="button" onClick={() => setUploadOpen(true)}>
              Agregar material
            </button>
          )}
        </div>
      </div>

      <section className="material-grid" aria-label="Materiales guardados">
        {isLoadingFirst && (
          <>
            <div className="material-initial-loader" role="status" aria-live="polite">
              <span className="material-loader-orbit" aria-hidden="true"><i /></span>
              <span>Preparando tu biblioteca</span>
            </div>
            {Array.from({ length: 6 }).map((_, index) => (
              <article className="material-card material-card-skeleton" key={`skeleton-${index}`} aria-hidden="true">
                <div className="skeleton-image" />
                <div className="material-card-main">
                  <div className="skeleton-pill" />
                  <div className="skeleton-title" />
                  <div className="skeleton-meta" />
                </div>
              </article>
            ))}
          </>
        )}
        {!isLoadingFirst && materials.length === 0 && (
          <article className="material-empty-state">
            <h3>{savedOnly ? "No tienes materiales guardados" : "No hay materiales disponibles"}</h3>
            <p>
              {savedOnly
                ? "Marca materiales como guardados para volver a ellos rapidamente desde esta vista."
                : "Cuando se agreguen materiales, apareceran aqui para encontrarlos rapidamente y guardarlos en tu biblioteca."}
            </p>
          </article>
        )}
        {materials.map((material) => {
          const materialSubjects = materialSubjectIds(material);
          const displaySubject = subjectNames(subjects, materialSubjects);
          const accessBadge = getMaterialAccessBadge?.(material) ?? null;

          return (
          <article
            className={["material-card", "is-clickable", accessBadge?.className].filter(Boolean).join(" ")}
            key={material.id}
            role="button"
            tabIndex={material.storagePath || material.externalUrl ? 0 : -1}
            aria-label={`Abrir ${material.title}`}
            onClick={() => openMaterial(material, displaySubject)}
            onKeyDown={(event) => openMaterialFromKeyboard(event, material, displaySubject)}
          >
            {accessBadge && (
              <span className="material-access-badge" title={accessBadge.title} aria-label={accessBadge.title}>
                <span aria-hidden="true">{accessBadge.icon}</span>
                {accessBadge.label}
              </span>
            )}
            <MaterialImagePreview storagePath={material.imageStoragePath} title={material.title} subject={displaySubject} />
            <div className="material-card-main">
              <span className={`format-pill level-${material.level?.toLowerCase()}`}>{material.format}</span>
              <h3>{material.title}</h3>
              <div className="material-meta">
                <AutoScrollSubjectChip text={displaySubject} compact={materialSubjects.length <= 1} />
                <span className="material-level-chip">{material.level}</span>
              </div>
              <div className="material-insights">
                <RatingSummary average={material.ratingAverage} count={material.ratingCount} />
                <span>{material.viewCount ?? 0} vistas</span>
              </div>
            </div>
            <div className="material-actions">
              {canAddMaterial && (
                <button className="small-action" type="button" onClick={(event) => {
                  event.stopPropagation();
                  setEditingMaterial(material);
                }}>
                  Editar
                </button>
              )}
              <button className={material.saved ? "small-action is-saved" : "small-action"} type="button" disabled={!onToggleSaved} onClick={(event) => {
                event.stopPropagation();
                onToggleSaved?.(material);
              }}>
                {material.saved ? "Guardado" : "Marcar"}
              </button>
            </div>
          </article>
          );
        })}
        {hasMore && (
          <div className="material-load-sentinel" ref={loadMoreRef} aria-live="polite">
            {isLoadingMore ? (
              <>
                <span className="material-loader-orbit" aria-hidden="true"><i /></span>
                <span className="material-loader-copy">Cargando más materiales</span>
              </>
            ) : (
              "Sigue bajando para cargar más"
            )}
          </div>
        )}
      </section>

      {uploadOpen && createPortal(
        <UploadMaterialModal subjects={subjects} onClose={() => setUploadOpen(false)} onSubmit={onAddMaterial} />,
        document.body,
      )}
      {editingMaterial && createPortal(
        <EditMaterialModal
          material={editingMaterial}
          subjects={subjects}
          onClose={() => setEditingMaterial(null)}
          onSubmit={onEditMaterial}
          onDelete={onDeleteMaterial}
        />,
        document.body,
      )}
      {viewerMaterial && createPortal(
        <MaterialViewerModal
          material={viewerMaterial}
          onClose={() => setViewerMaterial(null)}
          onRate={(rating) => onRateMaterial?.(viewerMaterial, rating)}
          onClearRating={() => onClearMaterialRating?.(viewerMaterial)}
          watermarkText={watermarkText}
        />,
        document.body,
      )}
      {accessPrompt && createPortal(
        <FeatureLimitModal
          prompt={accessPrompt}
          onClose={() => setAccessPrompt(null)}
          onContinue={async () => {
            if (accessPrompt.needsConfirmation) {
              await accessPrompt.onConfirm?.();
              onMaterialOpen?.(accessPrompt.material);
              setViewerMaterial(accessPrompt.material);
              setAccessPrompt(null);
              return;
            }
            accessPrompt.onAction?.();
            setAccessPrompt(null);
          }}
        />,
        document.body,
      )}
    </section>
  );
}

function FeatureLimitModal({ prompt, onClose, onContinue }) {
  const [busy, setBusy] = useState(false);

  async function handleContinue() {
    setBusy(true);
    try {
      await onContinue?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal feature-limit-modal">
        <header>
          <div>
            <p className="eyebrow">Uso limitado</p>
            <h2>{prompt.title}</h2>
          </div>
        </header>
        <div className="feature-limit-body">
          <p>{prompt.message}</p>
        </div>
        <footer className="feature-limit-actions">
          <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="primary-action" type="button" onClick={handleContinue} disabled={busy}>
            {busy ? "Procesando..." : prompt.confirmLabel ?? prompt.actionLabel ?? "Continuar"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function CustomSelect({ ariaLabel, value, options, onChange, searchable = false, searchPlaceholder = "Buscar..." }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value) ?? (value ? { value, label: value } : options[0]);
  const visibleOptions = searchable && query.trim()
    ? options.filter((option) => normalizeSelectSearch([option.label, option.value].join(" ")).includes(normalizeSelectSearch(query)))
    : options;

  function selectOption(nextValue) {
    onChange?.(nextValue);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className={open ? "custom-select is-open" : "custom-select"}>
      <button
        className="custom-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <span className="custom-select-label">{selected?.label}</span>
        {selected?.count !== undefined && <span className="custom-select-count">{selected.count}</span>}
        <span className="custom-select-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" tabIndex={-1} aria-label={ariaLabel}>
          {searchable && (
            <div className="custom-select-search" role="presentation">
              <input
                type="search"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                onChange={(event) => setQuery(event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
              />
            </div>
          )}
          <div className="custom-select-options">
          {visibleOptions.map((option) => (
            <button
              className={option.value === selected?.value ? "custom-select-option is-selected" : "custom-select-option"}
              type="button"
              role="option"
              aria-selected={option.value === selected?.value}
              key={option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option.value)}
            >
              <span className="custom-select-label">{option.label}</span>
              {option.count !== undefined && <span className="custom-select-count">{option.count}</span>}
            </button>
          ))}
          {visibleOptions.length === 0 && (
            <div className="custom-select-empty">No hay materias con ese nombre.</div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeSelectSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item?.[key];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function countByMany(items, getter) {
  const counts = new Map();
  for (const item of items) {
    for (const value of getter(item)) {
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

function objectToMap(value) {
  return new Map(Object.entries(value ?? {}));
}

function AutoScrollSubjectChip({ text, compact = false }) {
  const chipRef = useRef(null);
  const textRef = useRef(null);
  const [scrollDistance, setScrollDistance] = useState(0);

  useEffect(() => {
    function measureOverflow() {
    if (compact) {
      setScrollDistance(0);
      return undefined;
    }

    const chip = chipRef.current;
      const textNode = textRef.current;
      if (!chip || !textNode) return;
      setScrollDistance(Math.max(0, textNode.scrollWidth - chip.clientWidth + 18));
    }

    measureOverflow();
    window.addEventListener("resize", measureOverflow);
    return () => window.removeEventListener("resize", measureOverflow);
  }, [text, compact]);

  const duration = Math.max(7, Math.min(18, scrollDistance / 24));

  return (
    <span
      className={[
        "material-subject-chip",
        "material-subject-chip-scroll",
        compact ? "is-compact" : "",
        scrollDistance > 0 ? "is-scrolling" : "",
      ].filter(Boolean).join(" ")}
      ref={chipRef}
      style={{ "--subject-scroll-distance": `${scrollDistance}px`, "--subject-scroll-duration": `${duration}s` }}
      title={text}
    >
      <span ref={textRef}>{text}</span>
    </span>
  );
}

function RatingStars({ average = 0, userRating = 0, onRate }) {
  return (
    <div className="material-rating" aria-label="Calificar material">
      <div className="material-stars" role="group" aria-label="Calificar material">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            className={star <= (userRating || Math.round(average)) ? "is-active" : ""}
            type="button"
            aria-label={`Calificar con ${star} estrellas`}
            disabled={!onRate}
            onClick={() => onRate?.(star)}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

function MaterialImagePreview({ storagePath, title, subject }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const previewRef = useRef(null);

  useEffect(() => {
    if (!storagePath || shouldLoad) {
      if (!storagePath) setShouldLoad(false);
      return undefined;
    }
    const preview = previewRef.current;
    if (!preview) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: "180px 0px" });
    observer.observe(preview);
    return () => observer.disconnect();
  }, [storagePath, shouldLoad]);

  useEffect(() => {
    if (!storagePath || !shouldLoad) {
      setImageUrl("");
      return undefined;
    }
    let cancelled = false;
    let activeObjectUrl = "";
    getMaterialImageUrl(storagePath)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        activeObjectUrl = url;
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setImageUrl("");
      });
    return () => {
      cancelled = true;
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    };
  }, [storagePath, shouldLoad]);

  if (!imageUrl) {
    return (
      <div className="material-card-image material-card-cover-fallback" ref={previewRef} aria-label={`Portada academica de ${subject}`}>
        <span className="cover-page cover-page-a" aria-hidden="true" />
        <span className="cover-page cover-page-b" aria-hidden="true" />
        <span className="cover-mark cover-mark-a" aria-hidden="true" />
        <span className="cover-mark cover-mark-b" aria-hidden="true" />
        <span className="cover-mark cover-mark-c" aria-hidden="true" />
        <span className="cover-line cover-line-a" aria-hidden="true" />
        <span className="cover-line cover-line-b" aria-hidden="true" />
        <span className="cover-line cover-line-c" aria-hidden="true" />
        <span className="cover-dot cover-dot-a" aria-hidden="true" />
        <span className="cover-dot cover-dot-b" aria-hidden="true" />
        <span className="cover-dot cover-dot-c" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="material-card-image">
      <img src={imageUrl} alt={`Portada de ${title}`} />
    </div>
  );
}

export function RatingSummary({ average = 0, count }) {
  const roundedAverage = average ? average.toFixed(1) : "0.0";
  const filledStars = Math.round(average);

  return (
    <span className="rating-summary">
      <span className="rating-summary-stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <span className={star <= filledStars ? "is-filled" : ""} key={star}>★</span>
        ))}
      </span>
      <span>{roundedAverage}{count !== undefined ? ` (${count})` : ""}</span>
    </span>
  );
}

function EditMaterialModal({ material, subjects, onClose, onSubmit, onDelete }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState(material.format ?? MATERIAL_FORMAT_OPTIONS[0]);
  const [sourceType, setSourceType] = useState(getInitialSourceType(material));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingSubjects, setEditingSubjects] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState(() => {
    const ids = materialSubjectIds(material);
    return ids.length ? ids : subjects[0]?.id ? [subjects[0].id] : [];
  });
  const hasStoredPdf = Boolean(material.storagePath);
  const subjectPicker = buildSubjectPicker(subjects, selectedSubjectIds, subjectSearch);

  useEffect(() => {
    if (selectedSubjectIds.length === 0 && subjects[0]?.id) {
      setSelectedSubjectIds([subjects[0].id]);
    }
  }, [selectedSubjectIds.length, subjects]);

  function addSubject(subjectId) {
    setSelectedSubjectIds((current) => current.includes(subjectId) ? current : [...current, subjectId]);
  }

  function removeSubject(subjectId) {
    setSelectedSubjectIds((current) => current.length <= 1 ? current : current.filter((id) => id !== subjectId));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const nextTitle = String(form.get("title")).trim();
    const file = form.get("file");
    const imageFile = form.get("imageFile");
    const externalUrl = String(form.get("externalUrl")).trim();

    if (!nextTitle) {
      setError("El material necesita un nombre.");
      return;
    }

    if (selectedSubjectIds.length === 0) {
      setError("Selecciona al menos una materia.");
      return;
    }

    if ((sourceType === "drive" || sourceType === "youtube") && !externalUrl) {
      setError("Agrega el link del material.");
      return;
    }

    if (sourceType === "youtube" && !getYouTubeEmbedUrl(externalUrl)) {
      setError("Agrega un link valido de YouTube.");
      return;
    }

    if (sourceType === "pdf" && !hasStoredPdf && (!file || file.size === 0)) {
      setError("Selecciona un PDF para este material.");
      return;
    }

    try {
      setBusy(true);
      await onSubmit({
        ...material,
        title: nextTitle,
        subject: selectedSubjectIds[0],
        subjects: selectedSubjectIds,
        format: sourceType === "youtube" ? "Video" : format,
        level: String(form.get("level")),
        sourceType,
        externalUrl,
        file,
        imageFile,
      });
      onClose();
    } catch (editError) {
      setError(editError?.message ?? "No se pudo actualizar el material.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    try {
      setBusy(true);
      setError("");
      await onDelete(material);
      onClose();
    } catch (deleteError) {
      setError(deleteError?.message ?? "No se pudo borrar el material.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section
        className="course-detail-modal material-edit-modal"
        onWheel={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>Editar material</h2>
            <span>Datos visibles en la biblioteca</span>
          </div>
          <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
        </header>
        <form className="material-upload-form material-edit-form" onSubmit={handleSubmit}>
          <section className="material-upload-panel material-edit-panel">
            <p className="material-upload-section-title">Informacion del recurso</p>
            <label>Titulo<input name="title" type="text" defaultValue={material.title} required /></label>
            <div className="material-edit-grid">
              <label>Tipo de material<select name="format" value={format} onChange={(event) => {
                const nextFormat = event.target.value;
                setFormat(nextFormat);
                if (nextFormat === "Video" && sourceType === "pdf") setSourceType("youtube");
              }} required>
                {MATERIAL_FORMAT_OPTIONS.map((item) => <option key={item}>{item}</option>)}
              </select></label>
              <label>Rango<select name="level" defaultValue={material.level} required>
                {["Gratis", "Pro"].map((item) => <option key={item}>{item}</option>)}
              </select></label>
            </div>
            <label>Origen<select name="sourceType" value={sourceType} onChange={(event) => {
              const nextSourceType = event.target.value;
              setSourceType(nextSourceType);
              if (nextSourceType === "youtube") setFormat("Video");
              if (nextSourceType === "pdf" && format === "Video") setFormat(MATERIAL_FORMAT_OPTIONS[0]);
              setConfirmDelete(false);
            }}>
              <option value="pdf">PDF protegido</option>
              <option value="drive">Link de Drive</option>
              <option value="youtube">Video de YouTube</option>
            </select></label>
            {sourceType === "pdf" ? (
              <div className="material-upload-file-panel material-edit-file-panel">
                <label>Reemplazar PDF<input name="file" type="file" accept="application/pdf" required={!hasStoredPdf} /></label>
                <p>{hasStoredPdf ? `PDF actual: ${material.fileName ?? material.source ?? "archivo guardado"}. Puedes dejarlo vacio para conservarlo.` : "Selecciona el PDF que se abrira dentro de Synapse."}</p>
                <label>Reemplazar imagen<input name="imageFile" type="file" accept="image/*" /></label>
              </div>
            ) : (
              <div className="material-upload-file-panel material-edit-file-panel">
                <label>{sourceType === "youtube" ? "Link de YouTube" : "Link del material"}<input name="externalUrl" type="url" defaultValue={material.externalUrl ?? ""} placeholder={sourceType === "youtube" ? "https://www.youtube.com/watch?v=..." : "https://drive.google.com/..."} required /></label>
                <p>{sourceType === "youtube" ? "El video se reproducira dentro de Synapse con un reproductor de YouTube." : "Este link reemplazara el archivo PDF como origen principal del material."}</p>
                <label>Reemplazar imagen<input name="imageFile" type="file" accept="image/*" /></label>
              </div>
            )}
            <div className="material-edit-subjects">
              <div className="material-edit-subjects-head">
                <p className="material-upload-section-title">Materias</p>
                <button type="button" className="small-action" onClick={() => setEditingSubjects((current) => !current)}>
                  {editingSubjects ? "Ocultar lista" : "Editar materias"}
                </button>
              </div>
              <div className="material-edit-subject-list">
                {subjectPicker.selectedSubjects.map((subject) => (
                  <span className="material-subject-chip" key={subject.id}>{subject.name}</span>
                ))}
              </div>
              {editingSubjects && (
                <SubjectMultiPicker
                  title="Seleccionar materias"
                  subjectSearch={subjectSearch}
                  onSubjectSearchChange={setSubjectSearch}
                  selectedSubjects={subjectPicker.selectedSubjects}
                  visibleSubjects={subjectPicker.visibleSubjects}
                  onAddSubject={addSubject}
                  onRemoveSubject={removeSubject}
                />
              )}
            </div>
          </section>
          {error && <p className="auth-error">{error}</p>}
          <div className="material-edit-actions">
            <button className="primary-action form-submit" type="submit" disabled={busy}>{busy ? "Guardando..." : "Guardar cambios"}</button>
            {onDelete && (
              <div className={confirmDelete ? "material-delete-zone is-confirming" : "material-delete-zone"}>
                {confirmDelete ? (
                  <>
                    <p>Borrar este material tambien quitara sus favoritos y calificaciones.</p>
                    <div className="material-delete-actions">
                      <button className="quiet-button" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</button>
                      <button className="danger-action" type="button" disabled={busy} onClick={handleDelete}>{busy ? "Borrando..." : "Borrar material"}</button>
                    </div>
                  </>
                ) : (
                  <button className="danger-link-button" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>Borrar material</button>
                )}
              </div>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function UploadMaterialModal({ subjects, onClose, onSubmit }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sourceType, setSourceType] = useState("pdf");
  const [format, setFormat] = useState(MATERIAL_FORMAT_OPTIONS[0]);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState(() => subjects[0]?.id ? [subjects[0].id] : []);
  const subjectPicker = buildSubjectPicker(subjects, selectedSubjectIds, subjectSearch);

  useEffect(() => {
    if (selectedSubjectIds.length === 0 && subjects[0]?.id) {
      setSelectedSubjectIds([subjects[0].id]);
    }
  }, [selectedSubjectIds.length, subjects]);

  function addSubject(subjectId) {
    setSelectedSubjectIds((current) => current.includes(subjectId) ? current : [...current, subjectId]);
  }

  function removeSubject(subjectId) {
    setSelectedSubjectIds((current) => current.length <= 1 ? current : current.filter((id) => id !== subjectId));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const imageFile = form.get("imageFile");
    const externalUrl = String(form.get("externalUrl")).trim();
    if (sourceType === "pdf" && (!file || file.size === 0)) {
      setError("Selecciona un PDF.");
      return;
    }
    if ((sourceType === "drive" || sourceType === "youtube") && !externalUrl) {
      setError(sourceType === "youtube" ? "Agrega el link de YouTube." : "Agrega el link de Drive.");
      return;
    }
    if (sourceType === "youtube" && !getYouTubeEmbedUrl(externalUrl)) {
      setError("Agrega un link valido de YouTube.");
      return;
    }
    if (selectedSubjectIds.length === 0) {
      setError("Selecciona al menos una materia.");
      return;
    }
    try {
      setBusy(true);
      await onSubmit({
        title: String(form.get("title")).trim(),
        subject: selectedSubjectIds[0],
        subjects: selectedSubjectIds,
        level: String(form.get("level")),
        format: sourceType === "youtube" ? "Video" : format,
        sourceType,
        externalUrl,
        file,
        imageFile,
      });
      onClose();
    } catch (uploadError) {
      setError(uploadError?.message ?? "No se pudo guardar el material.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal material-upload-modal">
        <header>
          <div>
            <h2>Agregar material</h2>
            <span>PDF protegido o link externo</span>
          </div>
          <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
        </header>
        <form className="material-upload-form" onSubmit={handleSubmit}>
          <div className="material-upload-main">
            <section className="material-upload-panel material-upload-basics">
              <p className="material-upload-section-title">Datos del recurso</p>
              <label className="material-upload-title">Titulo<input name="title" type="text" placeholder="Guia de estudio" required /></label>
              <label>Origen<select name="sourceType" value={sourceType} onChange={(event) => {
                const nextSourceType = event.target.value;
                setSourceType(nextSourceType);
                if (nextSourceType === "youtube") setFormat("Video");
                if (nextSourceType === "pdf" && format === "Video") setFormat(MATERIAL_FORMAT_OPTIONS[0]);
              }}>
                <option value="pdf">PDF protegido</option>
                <option value="drive">Link de Drive</option>
                <option value="youtube">Video de YouTube</option>
              </select></label>
              <label>Tipo<select name="format" value={format} onChange={(event) => {
                const nextFormat = event.target.value;
                setFormat(nextFormat);
                if (nextFormat === "Video" && sourceType === "pdf") setSourceType("youtube");
              }} required>{MATERIAL_FORMAT_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Nivel<select name="level" required>{["Gratis", "Pro"].map((item) => <option key={item}>{item}</option>)}</select></label>
            </section>

            <SubjectMultiPicker
              title="Materias"
              subjectSearch={subjectSearch}
              onSubjectSearchChange={setSubjectSearch}
              selectedSubjects={subjectPicker.selectedSubjects}
              visibleSubjects={subjectPicker.visibleSubjects}
              onAddSubject={addSubject}
              onRemoveSubject={removeSubject}
            />
          </div>

          <div className="material-upload-footer">
            <div className="material-upload-file-panel">
              {sourceType === "pdf" ? (
                <label>Archivo PDF<input name="file" type="file" accept="application/pdf" required /></label>
              ) : sourceType === "youtube" ? (
                <label>Link de YouTube<input name="externalUrl" type="url" placeholder="https://www.youtube.com/watch?v=..." required /></label>
              ) : (
                <label>Link de Drive<input name="externalUrl" type="url" placeholder="https://drive.google.com/..." required /></label>
              )}
              <label>Imagen opcional<input name="imageFile" type="file" accept="image/*" /></label>
              <p>{sourceType === "pdf" ? "El PDF se abrira dentro de Synapse con acceso protegido." : sourceType === "youtube" ? "El video se reproducira dentro de Synapse sin salir de la pagina." : "El link se mostrara dentro de Synapse antes de salir a Drive."}</p>
            </div>
            <button className="primary-action form-submit material-upload-submit" type="submit" disabled={busy}>{busy ? "Guardando..." : "Guardar material"}</button>
          </div>
          {error && <p className="auth-error">{error}</p>}
        </form>
      </section>
    </div>
  );
}

function SubjectMultiPicker({
  title,
  subjectSearch,
  onSubjectSearchChange,
  selectedSubjects,
  visibleSubjects,
  onAddSubject,
  onRemoveSubject,
}) {
  return (
    <section className="material-upload-panel material-subject-picker" aria-label="Seleccionar materias">
      <div className="material-subject-picker-head">
        <p className="material-upload-section-title">{title}</p>
        <label><span>Buscar</span><input value={subjectSearch} onChange={(event) => onSubjectSearchChange(event.target.value)} type="search" placeholder="Codigo, nombre o carrera..." /></label>
      </div>
      <div className="material-selected-subjects" aria-label="Materias seleccionadas">
        {selectedSubjects.map((subject) => (
          <div className="material-selected-subject" key={subject.id}>
            <div>
              <span>{subject.name}</span>
              <small>{formatSubjectMeta(subject)}</small>
            </div>
            <button type="button" disabled={selectedSubjects.length <= 1} onClick={() => onRemoveSubject(subject.id)}>
              Quitar
            </button>
          </div>
        ))}
      </div>
      <div className="material-subject-results" role="listbox">
        {visibleSubjects.map((subject) => (
          <button
            className="material-subject-option"
            type="button"
            key={`${subject.id}-${subject.name}`}
            onClick={() => onAddSubject(subject.id)}
          >
            <span>{subject.name}</span>
            <small>{formatSubjectMeta(subject)}</small>
          </button>
        ))}
        {visibleSubjects.length === 0 && <p className="material-subject-empty">No hay mas materias con esa busqueda.</p>}
      </div>
    </section>
  );
}

export function MaterialViewerModal({ material, onClose, onRate, onClearRating, watermarkText = "" }) {
  const [pdfBlob, setPdfBlob] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [privacyShield, setPrivacyShield] = useState(false);
  const [selectedRating, setSelectedRating] = useState(material.userRating ?? 0);
  const [ratingSummary, setRatingSummary] = useState({
    average: material.ratingAverage ?? 0,
    count: material.ratingCount ?? 0,
  });
  const frameRef = useRef(null);
  const pendingScrollRef = useRef(null);
  const privacyShieldTimerRef = useRef(null);
  const youtubeEmbedUrl = getYouTubeEmbedUrl(material.externalUrl);
  const isProtectedPdf = !material.externalUrl;

  async function handleRate(rating) {
    setRatingSummary((current) => localRatingPatch(current, selectedRating, rating));
    setSelectedRating(rating);
    await onRate?.(rating);
  }

  async function handleClearRating() {
    setRatingSummary((current) => localRemoveRatingPatch(current, selectedRating));
    setSelectedRating(0);
    await onClearRating?.();
  }

  useEffect(() => {
    if (material.externalUrl) return;
    let cancelled = false;
    setPdfBlob(null);
    getMaterialPdfBlob(material.storagePath)
      .then((blob) => {
        if (!cancelled) setPdfBlob(blob);
      })
      .catch((viewerError) => {
        if (!cancelled) setError(viewerError?.message ?? "No se pudo abrir el PDF.");
      });
    return () => {
      cancelled = true;
    };
  }, [material.externalUrl, material.storagePath]);

  useEffect(() => {
    if (!isProtectedPdf) return undefined;

    function showPrivacyShield(duration = 0) {
      setPrivacyShield(true);
      if (privacyShieldTimerRef.current) window.clearTimeout(privacyShieldTimerRef.current);
      if (duration > 0) {
        privacyShieldTimerRef.current = window.setTimeout(() => {
          setPrivacyShield(false);
          privacyShieldTimerRef.current = null;
        }, duration);
      }
    }

    function hidePrivacyShield() {
      if (privacyShieldTimerRef.current) {
        window.clearTimeout(privacyShieldTimerRef.current);
        privacyShieldTimerRef.current = null;
      }
      if (!document.hidden && document.hasFocus()) setPrivacyShield(false);
    }

    function handleKeyDown(event) {
      const shieldKeys = new Set(["PrintScreen", "Shift", "Control", "Alt", "Meta", "Fn", "FnLock"]);
      const isScreenshotLikeCombo = (
        event.key?.toLowerCase() === "s" &&
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey
      );
      const isPrintLikeCombo = (
        event.key?.toLowerCase() === "p" &&
        (event.metaKey || event.ctrlKey)
      );

      if (shieldKeys.has(event.key) || isScreenshotLikeCombo || isPrintLikeCombo) {
        showPrivacyShield(2200);
      }
    }

    function handleKeyUp(event) {
      if (["PrintScreen", "Shift", "Control", "Alt", "Meta", "Fn", "FnLock"].includes(event.key)) {
        showPrivacyShield(900);
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        showPrivacyShield();
      } else {
        hidePrivacyShield();
      }
    }

    function handleBlur() {
      showPrivacyShield();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", hidePrivacyShield);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", hidePrivacyShield);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (privacyShieldTimerRef.current) window.clearTimeout(privacyShieldTimerRef.current);
    };
  }, [isProtectedPdf]);

  useEffect(() => {
    if (!material.imageStoragePath) return;
    let cancelled = false;
    let activeObjectUrl = "";
    getMaterialImageUrl(material.imageStoragePath)
      .then((nextImageUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(nextImageUrl);
          return;
        }
        activeObjectUrl = nextImageUrl;
        if (!cancelled) setImageUrl(nextImageUrl);
      })
      .catch(() => {
        if (!cancelled) setImageUrl("");
      });
    return () => {
      cancelled = true;
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    };
  }, [material.imageStoragePath]);

  function updateZoom(nextZoom) {
    const clampedZoom = Math.min(200, Math.max(60, nextZoom));
    const frame = frameRef.current;
    if (frame && clampedZoom !== zoom) {
      pendingScrollRef.current = {
        leftRatio: (frame.scrollLeft + frame.clientWidth / 2) / Math.max(frame.scrollWidth, 1),
        topRatio: (frame.scrollTop + frame.clientHeight / 2) / Math.max(frame.scrollHeight, 1),
      };
    }
    setZoom(clampedZoom);
  }

  function zoomIn() {
    updateZoom(zoom < 100 ? Math.min(100, zoom + 25) : zoom + 25);
  }

  function zoomOut() {
    updateZoom(zoom > 100 ? Math.max(100, zoom - 25) : zoom - 25);
  }

  useEffect(() => {
    const frame = frameRef.current;
    const pendingScroll = pendingScrollRef.current;
    if (!frame || !pendingScroll) return;
    pendingScrollRef.current = null;
    requestAnimationFrame(() => {
      frame.scrollLeft = zoom < 100
        ? (frame.scrollWidth - frame.clientWidth) / 2
        : pendingScroll.leftRatio * frame.scrollWidth - frame.clientWidth / 2;
      frame.scrollTop = pendingScroll.topRatio * frame.scrollHeight - frame.clientHeight / 2;
    });
  }, [zoom]);

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal material-viewer-modal">
        <header>
          <div>
            <h2>{material.title}</h2>
            <div className="material-viewer-meta" aria-label="Datos del material">
              <span className="material-subject-chip">{material.displaySubject ?? prettifySpanishSubject(material.subject ?? "Materia")}</span>
              <span className="format-pill">{material.format}</span>
              <span className="material-level-chip">{material.level}</span>
            </div>
          </div>
          <div className="material-viewer-actions">
            {isProtectedPdf && (
              <div className="material-zoom-controls" aria-label="Controles de zoom del PDF">
                <button type="button" onClick={zoomOut} aria-label="Alejar PDF">-</button>
                <span>{zoom}%</span>
                <button type="button" onClick={zoomIn} aria-label="Acercar PDF">+</button>
              </div>
            )}
            <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
          </div>
        </header>
        <div className="material-viewer-frame-wrap">
          <div className="material-viewer-frame" ref={frameRef}>
            {youtubeEmbedUrl && (
              <div className="material-youtube-viewer">
                <iframe
                  src={youtubeEmbedUrl}
                  title={material.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            )}
            {material.externalUrl && !youtubeEmbedUrl && (
              <div className="material-external-link-card">
                {imageUrl && (
                  <div className="material-external-cover">
                    <img src={imageUrl} alt={`Portada de ${material.title}`} />
                  </div>
                )}
                <span>Material alojado externamente</span>
                <p>Este archivo se abre desde Drive porque puede ser demasiado pesado para previsualizarlo aqui.</p>
                <a className="primary-action" href={material.externalUrl} target="_blank" rel="noreferrer">Ir al archivo en Drive</a>
              </div>
            )}
            {isProtectedPdf && !pdfBlob && !error && <p>Cargando PDF protegido...</p>}
            {error && <p className="auth-error">{error}</p>}
            {isProtectedPdf && pdfBlob && (
              <PdfCanvasViewer
                blob={pdfBlob}
                title={material.title}
                zoom={zoom}
                onError={(viewerError) => setError(viewerError?.message ?? "No se pudo renderizar el PDF.")}
              />
            )}
          </div>
          {isProtectedPdf && watermarkText && (
            <div className="material-watermark-layer" aria-hidden="true">
              {Array.from({ length: 48 }).map((_, index) => (
                <span key={`watermark-${index}`}>{watermarkText}</span>
              ))}
            </div>
          )}
          {isProtectedPdf && privacyShield && (
            <div className="material-privacy-shield" aria-live="polite">
              <strong>Vista protegida</strong>
              <span>El material se oculta cuando la ventana pierde el foco.</span>
            </div>
          )}
        </div>
        <footer className="material-viewer-footer">
          <div className="material-viewer-footer-stats">
            <div>
              <span className="material-viewer-footer-label">Vistas</span>
              <strong>{material.viewCount ?? 0}</strong>
            </div>
            <div>
              <span className="material-viewer-footer-label">Promedio</span>
              <RatingSummary average={ratingSummary.average} count={ratingSummary.count} />
            </div>
          </div>
          <div className="material-viewer-user-rating">
            <span className="material-viewer-footer-label">Tu calificación</span>
            <RatingStars
              average={ratingSummary.average}
              userRating={selectedRating}
              onRate={handleRate}
            />
            {selectedRating > 0 && (
              <button className="small-action material-clear-rating" type="button" onClick={handleClearRating}>
                Quitar
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

function subjectName(subjects, id) {
  const name = subjects.find((subject) => subject.id === id)?.name ?? id ?? "Materia";
  return prettifySpanishSubject(name);
}

function subjectNames(subjects, ids) {
  const names = materialSubjectIds({ subjects: ids }).map((id) => subjectName(subjects, id));
  return names.length ? names.join(", ") : "Materia";
}

function materialSubjectIds(material) {
  if (Array.isArray(material?.subjects) && material.subjects.length > 0) {
    return Array.from(new Set(material.subjects.filter(Boolean)));
  }
  return material?.subject ? [material.subject] : [];
}

function buildSubjectPicker(subjects, selectedSubjectIds, subjectSearch) {
  const normalizedSubjectSearch = normalizeSearchText(subjectSearch);
  const selectedIdSet = new Set(selectedSubjectIds);
  const selectedSubjects = selectedSubjectIds
    .map((id) => subjects.find((subject) => subject.id === id))
    .filter(Boolean);
  const visibleSubjects = subjects
    .filter((subject) => !selectedIdSet.has(subject.id))
    .filter((subject) => [subject.name, subject.code, subject.id, subject.careers?.map((career) => career.name).join(" ")]
      .join(" ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes(normalizedSubjectSearch))
    .slice(0, 80);
  return { selectedSubjects, visibleSubjects };
}

function PdfCanvasViewer({ blob, title, zoom, onError }) {
  const [pageCount, setPageCount] = useState(0);
  const canvasRefs = useRef([]);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    let pdfDocument = null;
    const renderTasks = [];

    async function renderPdf() {
      try {
        const [pdfjsLib, pdfjsWorker] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
        const data = await blob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data,
          disableAutoFetch: true,
          disableStream: true,
        });
        pdfDocument = await loadingTask.promise;
        if (cancelled) return;
        setPageCount(pdfDocument.numPages);

        await new Promise((resolve) => requestAnimationFrame(resolve));
        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await pdfDocument.getPage(pageNumber);
          const canvas = canvasRefs.current[pageNumber - 1];
          if (!canvas) continue;
          const viewport = page.getViewport({ scale: (zoom / 100) * 1.18 });
          const context = canvas.getContext("2d", { alpha: false });
          const pixelRatio = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * pixelRatio);
          canvas.height = Math.floor(viewport.height * pixelRatio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, viewport.width, viewport.height);
          const renderTask = page.render({ canvasContext: context, viewport });
          renderTasks.push(renderTask);
          await renderTask.promise;
        }
      } catch (error) {
        if (!cancelled) onErrorRef.current?.(error);
      }
    }

    renderPdf();

    return () => {
      cancelled = true;
      for (const task of renderTasks) {
        try {
          task.cancel();
        } catch {
          // Rendering may already be complete.
        }
      }
      if (pdfDocument) {
        if (typeof pdfDocument.cleanup === "function") {
          pdfDocument.cleanup();
        }
        if (typeof pdfDocument.destroy === "function") {
          pdfDocument.destroy().catch(() => {});
        }
      }
    };
  }, [blob, zoom]);

  return (
    <div className="material-pdf-canvas-viewer" aria-label={`Vista protegida de ${title}`}>
      {Array.from({ length: pageCount }).map((_, index) => (
        <canvas
          className="material-pdf-canvas-page"
          key={`pdf-page-${index + 1}`}
          ref={(element) => {
            canvasRefs.current[index] = element;
          }}
        />
      ))}
      {pageCount === 0 && <p>Preparando paginas protegidas...</p>}
    </div>
  );
}

function formatSubjectMeta(subject) {
  return `${subject.code ?? subject.id}${subject.careers?.length ? ` · ${subject.careers.map((career) => career.name.replace("Ingenieria ", "")).join(", ")}` : ""}`;
}

function getInitialSourceType(material) {
  if (!material.externalUrl) return "pdf";
  if (getYouTubeEmbedUrl(material.externalUrl)) return "youtube";
  return "drive";
}

function getYouTubeEmbedUrl(value) {
  const videoId = getYouTubeVideoId(value);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
}

function getYouTubeVideoId(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value).trim());
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return sanitizeYouTubeId(url.pathname.split("/").filter(Boolean)[0]);
    if (!host.endsWith("youtube.com")) return "";
    if (url.pathname === "/watch") return sanitizeYouTubeId(url.searchParams.get("v"));
    const [kind, id] = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live"].includes(kind)) return sanitizeYouTubeId(id);
    return "";
  } catch {
    return "";
  }
}

function sanitizeYouTubeId(value) {
  const cleanValue = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]{6,}$/.test(cleanValue) ? cleanValue : "";
}

function localRatingPatch(summary, previousUserRating, nextRating) {
  const previousCount = summary.count ?? 0;
  const previousAverage = summary.average ?? 0;
  const nextCount = previousUserRating ? previousCount : previousCount + 1;
  const previousTotal = previousAverage * previousCount;
  const nextTotal = previousUserRating
    ? previousTotal - previousUserRating + nextRating
    : previousTotal + nextRating;
  return {
    count: nextCount,
    average: nextCount ? nextTotal / nextCount : nextRating,
  };
}

function localRemoveRatingPatch(summary, previousUserRating) {
  if (!previousUserRating) return summary;
  const previousCount = summary.count ?? 0;
  const previousAverage = summary.average ?? 0;
  const nextCount = Math.max(0, previousCount - 1);
  const nextTotal = Math.max(0, previousAverage * previousCount - previousUserRating);
  return {
    count: nextCount,
    average: nextCount ? nextTotal / nextCount : 0,
  };
}

function prettifySpanishSubject(value) {
  const cleanValue = String(value).trim();
  const knownSubjects = new Map([
    ["matematica basica", "Matemática Básica"],
    ["matematicas i", "Matemáticas I"],
    ["matematicas ii", "Matemáticas II"],
    ["matematicas iii", "Matemáticas III"],
    ["matematicas iv", "Matemáticas IV"],
    ["matematicas v", "Matemáticas V"],
    ["calculo numerico", "Cálculo Numérico"],
    ["optimizacion i", "Optimización I"],
    ["optimizacion ii", "Optimización II"],
    ["estadistica para ingenieros i", "Estadística para Ingenieros I"],
    ["estadistica para ingenieros ii", "Estadística para Ingenieros II"],
    ["algebra lineal", "Álgebra Lineal"],
    ["fisica i", "Física I"],
    ["fisica ii", "Física II"],
    ["fisica iii", "Física III"],
    ["quimica general", "Química General"],
    ["introduccion a la ingenieria", "Introducción a la Ingeniería"],
    ["pensamiento computacional", "Pensamiento Computacional"],
    ["algoritmos y programacion", "Algoritmos y Programación"],
    ["estructuras de datos", "Estructuras de Datos"],
    ["sistemas de informacion", "Sistemas de Información"],
    ["analisis de datos", "Análisis de Datos"],
    ["seguridad de la informacion", "Seguridad de la Información"],
    ["ingenieria economica", "Ingeniería Económica"],
    ["ingenieria ambiental", "Ingeniería Ambiental"],
  ]);
  return knownSubjects.get(cleanValue.toLowerCase()) ?? cleanValue;
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

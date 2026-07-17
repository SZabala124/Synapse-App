export const subjects = [
  { id: "sub-optimizacion", name: "Optimizacion II", term: "Trimestre 9", credits: 4, status: "Cursando" },
  { id: "sub-software", name: "Ingenieria de Software", term: "Trimestre 9", credits: 3, status: "Cursando" },
  { id: "sub-numerico", name: "Calculo Numerico", term: "Trimestre 9", credits: 4, status: "Cursando" },
  { id: "sub-operativos", name: "Sistemas Operativos", term: "Trimestre 8", credits: 4, status: "Aprobada" },
  { id: "sub-estadistica", name: "Estadistica II", term: "Trimestre 8", credits: 3, status: "Aprobada" },
  { id: "sub-arquitectura", name: "Arquitectura de Software", term: "Trimestre 10", credits: 3, status: "Planificada" },
];

export const activities = [
  { id: "act-jacobi", title: "Sesion de estudio: Jacobi y Gauss-Seidel", subject: "sub-numerico", date: "2026-06-02", progress: 35 },
  { id: "act-arquitectura", title: "Preparar dossier de patrones", subject: "sub-arquitectura", date: "2026-06-12", progress: 5 },
];

export const materials = [
  { id: "mat-simplex", title: "Guia premium de dualidad y sensibilidad", subject: "sub-optimizacion", format: "PDF", source: "Biblioteca/Optimizacion/dualidad-sensibilidad.pdf", level: "Pro", saved: true },
  { id: "mat-sprint", title: "Presentacion: Calidad del sprint y metricas", subject: "sub-software", format: "Presentacion", source: "Drive local/Software/calidad-sprint.pptx", level: "Avanzado", saved: true },
  { id: "mat-jacobi", title: "Video clase: Metodos iterativos", subject: "sub-numerico", format: "Video", source: "https://universidad.local/videos/metodos-iterativos", level: "Pro", saved: false },
  { id: "mat-os", title: "Resumen ejecutivo: Planificacion de procesos", subject: "sub-operativos", format: "Resumen", source: "Apuntes/Sistemas Operativos/procesos.md", level: "Gratis", saved: false },
  { id: "mat-regresion", title: "Set de ejercicios: regresion multiple", subject: "sub-estadistica", format: "Guia", source: "Biblioteca/Estadistica/regresion-multiple.xlsx", level: "Avanzado", saved: true },
  { id: "mat-patterns", title: "Catalogo de patrones de arquitectura", subject: "sub-arquitectura", format: "PDF", source: "Biblioteca/Arquitectura/patrones-arquitectura.pdf", level: "Pro", saved: false },
];

export const flowPeriods = [
  [
    { code: "FBTMM01", name: "Matematica Basica", status: "Cursada", credits: 3 },
    { code: "FBTPS03", name: "Introduccion a la Ingenieria", status: "Cursada", credits: 3 },
    { code: "FBTPS04", name: "Pensamiento Computacional", status: "Pendiente", credits: 3 },
  ],
  [
    { code: "BPTM01", name: "Matematicas I", status: "Cursada", credits: 3, prereq: "FBTMM01" },
    { code: "BPTPI07", name: "Diseno asistido por computador", status: "Pendiente", credits: 3 },
    { code: "BPTQI21", name: "Quimica General", status: "Pendiente", credits: 3, prereq: "FBTMM01" },
  ],
  [
    { code: "BPTM02", name: "Matematicas II", status: "Pendiente", credits: 3, prereq: "BPTM01" },
    { code: "BPTFI01", name: "Fisica I", status: "Pendiente", credits: 3, prereq: "BPTM01" },
    { code: "BPTPS05", name: "Algoritmos y Programacion", status: "Pendiente", credits: 3, prereq: "FBTPS04" },
  ],
  [
    { code: "BPTM03", name: "Matematicas III", status: "Pendiente", credits: 3, prereq: "BPTM02" },
    { code: "BPTFI02", name: "Fisica II", status: "Pendiente", credits: 3, prereq: "BPTFI01 + BPTM02" },
    { code: "BPTPS06", name: "Estructuras de Datos", status: "Pendiente", credits: 3, prereq: "BPTPS05" },
  ],
];

const STORAGE_KEY = "synapse-academia-cache-v1";
const TODAY = new Date();
const stateDefaults = {
  subjects: [
    {
      id: "sub-optimizacion",
      name: "Optimizacion II",
      term: "Trimestre 9",
      credits: 4,
      status: "Cursando",
      grade: "Meta 18/20",
      professor: "Dra. Herrera",
      focus: "Modelos lineales avanzados",
    },
    {
      id: "sub-software",
      name: "Ingenieria de Software",
      term: "Trimestre 9",
      credits: 3,
      status: "Cursando",
      grade: "Proyecto A",
      professor: "Prof. Rivas",
      focus: "Calidad, arquitectura y pruebas",
    },
    {
      id: "sub-numerico",
      name: "Calculo Numerico",
      term: "Trimestre 9",
      credits: 4,
      status: "Cursando",
      grade: "Meta 17/20",
      professor: "Prof. Galindo",
      focus: "Metodos iterativos y error",
    },
    {
      id: "sub-operativos",
      name: "Sistemas Operativos",
      term: "Trimestre 8",
      credits: 4,
      status: "Aprobada",
      grade: "18/20",
      professor: "Prof. Molina",
      focus: "Procesos, memoria y concurrencia",
    },
    {
      id: "sub-estadistica",
      name: "Estadistica II",
      term: "Trimestre 8",
      credits: 3,
      status: "Aprobada",
      grade: "17/20",
      professor: "Dra. Blanco",
      focus: "Inferencia y regresion",
    },
    {
      id: "sub-arquitectura",
      name: "Arquitectura de Software",
      term: "Trimestre 10",
      credits: 3,
      status: "Planificada",
      grade: "Meta 18/20",
      professor: "Por asignar",
      focus: "Diseño de sistemas escalables",
    },
  ],
  activities: [
    {
      id: "act-simplex",
      title: "Parcial: Metodo simplex y dualidad",
      subject: "sub-optimizacion",
      date: "2026-05-27",
      type: "Evaluacion",
      priority: "Alta",
      progress: 48,
    },
    {
      id: "act-testing",
      title: "Entrega: Plan de pruebas del sprint",
      subject: "sub-software",
      date: "2026-05-30",
      type: "Entrega",
      priority: "Alta",
      progress: 62,
    },
    {
      id: "act-jacobi",
      title: "Sesion de estudio: Jacobi y Gauss-Seidel",
      subject: "sub-numerico",
      date: "2026-06-02",
      type: "Sesion de estudio",
      priority: "Media",
      progress: 35,
    },
    {
      id: "act-retro",
      title: "Revision de retrospectiva academica",
      subject: "sub-software",
      date: "2026-06-06",
      type: "Lectura",
      priority: "Baja",
      progress: 15,
    },
    {
      id: "act-arquitectura",
      title: "Preparar dossier de patrones",
      subject: "sub-arquitectura",
      date: "2026-06-12",
      type: "Lectura",
      priority: "Media",
      progress: 5,
    },
  ],
  materials: [
    {
      id: "mat-simplex",
      title: "Guia premium de dualidad y sensibilidad",
      subject: "sub-optimizacion",
      format: "PDF",
      source: "Biblioteca/Optimizacion/dualidad-sensibilidad.pdf",
      level: "Pro",
      saved: true,
      updated: "2026-05-21",
    },
    {
      id: "mat-sprint",
      title: "Presentacion: Calidad del sprint y metricas",
      subject: "sub-software",
      format: "Presentacion",
      source: "Drive local/Software/calidad-sprint.pptx",
      level: "Avanzado",
      saved: true,
      updated: "2026-05-22",
    },
    {
      id: "mat-jacobi",
      title: "Video clase: Metodos iterativos",
      subject: "sub-numerico",
      format: "Video",
      source: "https://universidad.local/videos/metodos-iterativos",
      level: "Pro",
      saved: false,
      updated: "2026-05-18",
    },
    {
      id: "mat-os",
      title: "Resumen ejecutivo: Planificacion de procesos",
      subject: "sub-operativos",
      format: "Resumen",
      source: "Apuntes/Sistemas Operativos/procesos.md",
      level: "Gratis",
      saved: false,
      updated: "2026-05-10",
    },
    {
      id: "mat-regresion",
      title: "Set de ejercicios: regresion multiple",
      subject: "sub-estadistica",
      format: "Guia",
      source: "Biblioteca/Estadistica/regresion-multiple.xlsx",
      level: "Avanzado",
      saved: true,
      updated: "2026-05-13",
    },
    {
      id: "mat-patterns",
      title: "Catalogo de patrones de arquitectura",
      subject: "sub-arquitectura",
      format: "PDF",
      source: "Biblioteca/Arquitectura/patrones-arquitectura.pdf",
      level: "Pro",
      saved: false,
      updated: "2026-05-23",
    },
  ],
  selectedDegree: null,
  careerView: "list",
  flowStatuses: {},
};

const CURRICULA = {
  sistemas: {
    title: "Ingenieria de Sistemas",
    approved: "Aprobado en Consejo de Escuela 2025",
    updated: "Actualizado 01/12/2025",
    periods: 12,
    courses: [
      course(1, "FBTMM01", "Matematica Basica"),
      course(1, "FBTPS03", "Introduccion a la Ingenieria"),
      course(1, "FBTPS04", "Pensamiento Computacional"),
      course(1, "FBTEM01", "Competencias para emprender"),
      course(1, "FBTLI13", "Ingles IV"),
      course(2, "BPTM01", "Matematicas I", "FBTMM01"),
      course(2, "FBTHE05", "Investigacion y Sustentabilidad"),
      course(2, "BPTPI07", "Diseno asistido por computador"),
      course(2, "BPTQI21", "Quimica General", "FBTMM01"),
      course(2, "FBTLI14", "Ingles V", "FBTLI13"),
      course(3, "BPTM02", "Matematicas II", "BPTM01"),
      course(3, "BPTFI01", "Fisica I", "BPTM01"),
      course(3, "BPTPS05", "Algoritmos y Programacion", "FBTPS04"),
      course(3, "BPTQI22", "Laboratorio de Quimica General", "BPTQI21", 3, { l: 4 }),
      course(3, "FBTEM02", "Ideas emprendedoras"),
      course(4, "BPTM03", "Matematicas III", "BPTM02"),
      course(4, "BPTFI02", "Fisica II", "BPTFI01 + BPTM02"),
      course(4, "BPTPS06", "Estructuras de Datos", "BPTPS05"),
      course(4, "BPTM30", "Matematicas Discretas", "BPTM01"),
      course(4, "FBTHE11", "Venezuela, identidad y contexto"),
      course(5, "BPTM04", "Matematicas IV", "BPTM03"),
      course(5, "BPTFI05", "Laboratorio de Fisica aplicada", "BPTFI02", 3, { l: 4 }),
      course(5, "FPTSP04", "Sistemas de Informacion", "BPTPS06"),
      course(5, "BPTEN12", "Arquitectura del Computador", "BPTPS05"),
      course(5, "BPTMI31", "Algebra Lineal", "BPTM03"),
      course(6, "BPTM11", "Ecuaciones Diferenciales", "BPTM04"),
      course(6, "BPTMI03", "Estadistica para Ingenieros I", "BPTM03"),
      course(6, "FPTSP01", "Bases de Datos I", "BPTPS06"),
      course(6, "FPTSP03", "Organizacion del Computador", "BPTEN12"),
      course(6, "FGE", "Electiva general"),
      course(7, "BPTM05", "Matematicas V", "BPTM04"),
      course(7, "BPTMI07", "Estadistica para Ingenieros II", "BPTMI03"),
      course(7, "FPTSP26", "Bases de Datos II", "FPTSP01"),
      course(7, "FPTSP17", "Optimizacion I", "BPTM11"),
      course(7, "BPTPS04", "Sistemas Operativos", "FPTSP03 + FPTSP04"),
      course(8, "FPTPI09", "Gestion Cadena Suministro I", "FPTSP17"),
      course(8, "BPTMM91", "Calculo Numerico", "BPTM11"),
      course(8, "FPTSP04", "Ingenieria de Software", "FPTSP01 + FPTSP04"),
      course(8, "FPTSP19", "Optimizacion II", "FPTSP17"),
      course(8, "FGE", "Electiva general"),
      course(9, "FPTSP28", "Sistemas Distribuidos", "BPTSP03"),
      course(9, "FPTSP21", "Modelacion Sist. en Redes", "FPTSP19"),
      course(9, "FPTSP20", "Simulacion", "BPTMI06"),
      course(9, "FPTM21", "Modelos Estocasticos", "BPTMI06"),
      course(9, "FPTSP22", "Taller de trabajo de grado", "120 cr o 57 cr BP", 2, { a: 2, ps: 2, aa: 4 }),
      course(10, "FPTEN23", "Sistemas de Redes", "BPTFI02 o 57 BP"),
      course(10, "FPTSP27", "Analisis de Datos", "BPTMI07 o 57 BP"),
      course(10, "FPTSP23", "Sistemas de Apoyo", "BPTMI07 o 57 BP"),
      course(10, "FPS", "Seminario profesional I", "120 cr", 3, { a: 4, ps: 0, l: 0, aa: 4 }),
      course(10, "FGE", "Electiva general"),
      course(11, "FPTSP18", "Seguridad de la informacion", "FPTEN23 o 57 BP"),
      course(11, "FPTSP11", "Gerencia de Proyectos TIC", "FPTSP04 o 57 BP"),
      course(11, "FPTM25", "Computacion Emergente", "BPTMI31 o 57 cr BP"),
      course(11, "FPTEN27", "Robotica Industrial", "BPTPS05"),
      course(11, "FPS", "Seminario profesional II"),
      course(12, "FPTSP14", "Proyecto de Ingenieria", "150 cr o 57 cr BP"),
      course(12, "FPTSP15", "Ingenieria Economica", "150 cr o 57 cr BP"),
      course(12, "FPTCS16", "Ingenieria Ambiental", "150 cr o 57 cr BP"),
      course(12, "FGE", "Electiva general"),
      course(12, "FGE", "Electiva general"),
    ],
    termTotals: termTotals([
      [20, 0, 0, 20, 15], [16, 0, 4, 20, 15], [12, 0, 8, 20, 15], [16, 0, 4, 20, 15],
      [16, 0, 4, 20, 15], [20, 0, 0, 20, 15], [20, 0, 0, 20, 15], [20, 0, 0, 20, 15],
      [14, 2, 0, 16, 12], [18, 2, 0, 20, 15], [18, 0, 0, 20, 15], [20, 0, 0, 20, 15],
    ]),
    additional: [
      req("FGTHE01 / BPTHE71", "Servicio Comunitario", "90 creditos", 0),
      req("FPTSP22", "Defensa Trabajo de grado", "", 0),
    ],
  },
  civil: {
    title: "Ingenieria Civil",
    approved: "Aprobado en mayo 2026",
    updated: "Flujograma de componentes educativos obligatorios",
    periods: 12,
    courses: [
      course(1, "FBTMM01", "Matematica Basica"), course(1, "FBTPS03", "Introduccion a la Ingenieria"), course(1, "FBTLI13", "Ingles IV"), course(1, "FBTPS04", "Pensamiento Computacional"), course(1, "FBTEM01", "Competencias para Emprender"),
      course(2, "BPTM01", "Matematicas I", "FBTMM01"), course(2, "BPTPI07", "Diseno asistido por Computador"), course(2, "FBTLI14", "Ingles V", "FBTLI13"), course(2, "BPTQI21", "Quimica General", "FBTMM01"), course(2, "FBTHE05", "Investigacion y Sustentabilidad"),
      course(3, "BPTM02", "Matematicas II", "BPTM01"), course(3, "BPTFI01", "Fisica I", "BPTM01"), course(3, "BPTPS05", "Algoritmos y Programacion", "FBTPS04"), course(3, "BPTQI22", "Laboratorio de Quimica General", "BPTQI21", 3, { l: 4 }), course(3, "FBTEM02", "Ideas Emprendedoras"),
      course(4, "BPTM03", "Matematicas III", "BPTM02"), course(4, "BPTFI02", "Fisica II", "BPTFI01 + BPTM02"), course(4, "BPTPI02", "Mecanica I", "BPTFI01"), course(4, "BPTCS01", "Topografia", "BPTPI07"), course(4, "FBTHE11", "Vzla. Identidad y Contexto"),
      course(5, "BPTM04", "Matematicas IV", "BPTM03"), course(5, "BPTFI05", "Laboratorio Fisica Aplicada", "BPTFI02", 3, { l: 4 }), course(5, "BPTI04", "Mecanica de Solidos I", "BPTPI02"), course(5, "BPTMI31", "Algebra Lineal", "BPTM03"), course(5, "FGE", "Electiva general"),
      course(6, "BPTM11", "Ecuaciones Diferenciales", "BPTM04"), course(6, "FPTCS02", "Materiales y Ensayos", "BPTQI21"), course(6, "BPTI05", "Mecanica de Solidos II", "BPTI04"), course(6, "BPTMI06", "Estadistica para Ingenieros I", "BPTM02"), course(6, "FGE", "Electiva general"),
      course(7, "BPTM05", "Matematicas V", "BPTM04"), course(7, "FPTCS01", "Estructuras I", "BPTMI31 + BPTI04 + BPTI05"), course(7, "FPTCS04", "Geotecnia I", "BPTI04"), course(7, "BPTEN14", "Mecanica de Fluidos", "BPTM04"), course(7, "FGE", "Electiva general"),
      course(8, "FPTCS03", "Hidraulica", "BPTEN14"), course(8, "FPTCS02", "Estructuras II", "FPTCS01"), course(8, "FPTCS06", "Geotecnia II", "FPTCS04"), course(8, "FPTCS07", "Vias de Comunicacion I", "BPTCS01 + FPTCS04"), course(8, "FGE", "Electiva general"),
      course(9, "FPTCS05", "Hidrologia y Drenaje Vial", "FPTCS03"), course(9, "FPTCS18", "Concreto Armado I", "FPTCS02 + BPTCS02"), course(9, "FPTCS09", "Fundaciones y Muros", "FPTCS07 + FPTCS03"), course(9, "FPTCS10", "Proyectos Viales", "FPTCS10"), course(9, "FPTSP22", "Taller de Trabajo de Grado", "120 cred. o 57 cred. BP", 2, { a: 2, ps: 2, aa: 4 }),
      course(10, "FPTCS11", "Instalaciones para Edificios", "FPTCS03"), course(10, "FPTCS19", "Concreto Armado II", "FPTCS18"), course(10, "FPTCS14", "Acero", "FPTCS02 + BPTCS02"), course(10, "FPTCS12", "Proyectos Viales II", "FPTCS12"), course(10, "FPS", "Seminario Profesional I", "120 cred.", 3),
      course(11, "FPTCS21", "Acueductos y Cloacas", "FPTCS05"), course(11, "FPTCS22", "Modelos de Inform. Constructiva", "BPTPI07 + FPTCS11"), course(11, "FPTCS23", "Proyectos en Acero", "FPTCS14"), course(11, "FPTSP24", "Gerencia de la Construccion", "FPTSP18 o 57 cred BP"), course(11, "FPS", "Seminario Profesional II", "120 cred."),
      course(12, "FPTCS16", "Ingenieria Ambiental", "150 cred. o 57 cred BP"), course(12, "FPTCS20", "Proyectos en Concreto", "FPTCS18 + FPTCS19"), course(12, "FPTSP15", "Ingenieria Economica", "150 cred. o 57 cred BP"), course(12, "FPTSP14", "Proyectos de Ingenieria", "150 cred. o 57 cred BP"), course(12, "FGE", "Electiva general"),
    ],
    termTotals: termTotals([[20, 0, 0, 20, 15], [16, 0, 4, 20, 15], [12, 0, 8, 20, 15], [19, 1, 0, 20, 15], [16, 0, 4, 20, 15], [19, 1, 0, 20, 15], [19, 1, 0, 20, 15], [19, 1, 0, 20, 15], [18, 2, 0, 20, 15], [16, 0, 0, 20, 15], [16, 0, 0, 20, 15], [20, 0, 0, 20, 15]]),
    additional: [req("FGTHE01 / BPTHE71", "Servicio Comunitario", "90 creditos", 0), req("FPTSP22 / FPTIC04", "Defensa de Trabajo de Grado", "", 0)],
  },
  mecanica: {
    title: "Ingenieria Mecanica",
    approved: "Aprobado en marzo 2026",
    updated: "Flujograma de componentes educativos obligatorios",
    periods: 12,
    courses: [
      course(1, "FBTMM01", "Matematica Basica"), course(1, "FBTPS03", "Introduccion a la Ingenieria"), course(1, "FBTLI13", "Ingles IV"), course(1, "FBTPS04", "Pensamiento Computacional"), course(1, "FBTEM01", "Competencias para Emprender"),
      course(2, "BPTM01", "Matematicas I", "FBTMM01"), course(2, "BPTPI07", "Diseno Asistido por Computador"), course(2, "FBTLI14", "Ingles V", "FBTLI13"), course(2, "BPTQI21", "Quimica General", "FBTMM01"), course(2, "FBTHE05", "Investigacion y Sustentabilidad"),
      course(3, "BPTM02", "Matematicas II", "BPTM01"), course(3, "BPTFI01", "Fisica I", "BPTM01"), course(3, "BPTPS05", "Algoritmos y Programacion", "FBTPS04"), course(3, "BPTQI22", "Laboratorio Quimica General", "BPTQI21", 3, { l: 4 }), course(3, "FBTEM02", "Ideas Emprendedoras"),
      course(4, "BPTM03", "Matematicas III", "BPTM02"), course(4, "BPTFI02", "Fisica II", "BPTFI01 + BPTM02"), course(4, "BPTEN02", "Termodinamica I", "BPTFI01"), course(4, "BPTPI02", "Mecanica I", "BPTFI01"), course(4, "FBTHE11", "Vzla. Identidad y Contexto"),
      course(5, "BPTM04", "Matematicas IV", "BPTM03"), course(5, "BPTFI03", "Fisica III", "BPTFI02"), course(5, "BPTEN07", "Termodinamica II", "BPTEN02"), course(5, "BPTPI03", "Mecanica II", "BPTPI02"), course(5, "BPTPI04", "Mecanica de Solidos I", "BPTPI02"),
      course(6, "BPTM11", "Ecuaciones Diferenciales", "BPTM04"), course(6, "BPTFI04", "Laboratorio de Fisica", "BPTFI03", 3, { l: 4 }), course(6, "BPTMI06", "Estadistica para Ingenieros I", "BPTM02"), course(6, "BPTEN14", "Mecanica de Fluidos I", "BPTM04"), course(6, "BPTPI05", "Mecanica de Solidos II", "BPTPI04"),
      course(7, "BPTM05", "Matematicas V", "BPTM04"), course(7, "BPTEN03", "Electromecanica", "BPTFI03"), course(7, "BPTPI07", "Representacion de Conj. Mecanicos", "BPTPI07"), course(7, "BPTEN15", "Mecanica de Fluidos II", "BPTEN14"), course(7, "BPTEN13", "Transferencia de Calor", "BPTEN02 + BPTEN14"),
      course(8, "FPTEN05", "Lab. de Fluidos y Calor", "BPTEN13"), course(8, "BPTPI06", "Materiales", "BPTPI04"), course(8, "FPTEN22", "Instrumentacion y Control", "BPTPI04"), course(8, "FGE", "Electiva general"), course(8, "FGE", "Electiva general"),
      course(9, "FPTPI01", "Diseno de Elem. de Maquinas I", "BPTPI01 + BPTPI05"), course(9, "FPTEN11", "Turbomaquinas", "BPTEN07 + BPTEN15"), course(9, "FPTPI06", "Procesos de Fabricacion I", "BPTPI06"), course(9, "FPTPI02", "Mantenimiento", "BPTPI06"), course(9, "FPTSP22", "Taller de Trabajo de Grado", "120 cred.", 2, { a: 2, ps: 2, aa: 4 }),
      course(10, "FPTPI03", "Diseno de Elem. de Maquinas II", "FPTPI01"), course(10, "FPTPI04", "Vibraciones", "BPTPI03"), course(10, "FPTPI07", "Procesos de Fabricacion II", "FPTPI06"), course(10, "FPS", "Seminario Profesional I", "120 cred."), course(10, "FPTPI17", "Lab. de Ensayos Mecanicos", "FPTPI04"),
      course(11, "FPTPI18", "Diseno Conceptual", "FPTPI03"), course(11, "FPTPI05", "Laboratorio de Vibraciones", "FPTPI04"), course(11, "FPTEN28", "Conversion y Almacen. de Energia", "75 creditos"), course(11, "FPS", "Seminario Profesional II", "120 cred."), course(11, "FGE", "Electiva general"),
      course(12, "FPTCS16", "Ingenieria Ambiental", "150 cred. o 57 cred BP"), course(12, "FPTSP15", "Ingenieria Economica", "150 cred. o 57 cred BP"), course(12, "FPTSP14", "Proyectos de Ingenieria", "150 cred. o 57 cred BP"), course(12, "FGE", "Electiva general"), course(12, "FGE", "Electiva general"),
    ],
    termTotals: termTotals([[20, 0, 0, 20, 15], [16, 0, 4, 20, 15], [16, 0, 4, 20, 15], [20, 0, 0, 20, 15], [20, 0, 0, 20, 15], [16, 0, 4, 20, 15], [20, 0, 0, 20, 15], [15, 1, 4, 20, 15], [18, 2, 0, 20, 15], [16, 0, 0, 20, 15], [12, 0, 4, 20, 15], [20, 0, 0, 20, 15]]),
    additional: [req("FGTHE01 / BPTHE71", "Servicio Comunitario", "90 creditos", 0), req("FPTSP22 / FPTIM04", "Defensa Trabajo de Grado", "", 0)],
  },
};

Object.values(CURRICULA).forEach((curriculum) => {
  curriculum.courses = curriculum.courses.map((item, index) => ({
    ...item,
    id: `${item.period}-${index + 1}-${item.code}`,
  }));
});

const routes = {
  landing: renderLanding,
  career: renderCareer,
  materials: renderMaterials,
};

let appState = loadState();
let currentRoute = "landing";
let toastTimer = 0;

const root = document.querySelector("#view-root");
const toast = document.querySelector("#toast");

initCanvasScene();
window.addEventListener("hashchange", renderRoute);
renderRoute();
window.setTimeout(() => promptCareerSelection(false), 500);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return deepClone(stateDefaults);
    }

    const parsed = JSON.parse(raw);
    return {
      subjects: Array.isArray(parsed.subjects) ? parsed.subjects : deepClone(stateDefaults.subjects),
      activities: Array.isArray(parsed.activities) ? parsed.activities : deepClone(stateDefaults.activities),
      materials: Array.isArray(parsed.materials)
        ? parsed.materials.map((material) => ({
            ...material,
            level: normalizeMaterialLevel(material.level),
          }))
        : deepClone(stateDefaults.materials),
      selectedDegree: CURRICULA[parsed.selectedDegree] ? parsed.selectedDegree : stateDefaults.selectedDegree,
      careerView: ["list", "flow"].includes(parsed.careerView) ? parsed.careerView : stateDefaults.careerView,
      flowStatuses: parsed.flowStatuses && typeof parsed.flowStatuses === "object" ? parsed.flowStatuses : {},
    };
  } catch {
    return deepClone(stateDefaults);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function resetState() {
  appState = deepClone(stateDefaults);
  saveState();
  showToast("Cache local restaurada con datos demo.");
  renderRoute();
  window.setTimeout(() => promptCareerSelection(true), 220);
}

function renderRoute() {
  currentRoute = getRouteFromHash();
  const template = document.querySelector(`#${currentRoute}-template`);
  closeFlowStatusMenu();
  closeRequirementNotice(false);
  closeCourseDetailModal(false);
  closeDependencyConfirm(false);
  document.body.dataset.route = currentRoute;
  root.classList.remove("is-mounted");
  root.replaceChildren(template.content.cloneNode(true));
  updateActiveNav();
  routes[currentRoute]();
  requestAnimationFrame(() => root.classList.add("is-mounted"));
  root.focus({ preventScroll: true });
}

function getRouteFromHash() {
  const route = window.location.hash.replace("#", "");
  return routes[route] ? route : "landing";
}

function updateActiveNav() {
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.route === currentRoute);
  });
}

function renderLanding() {
  const upcoming = getUpcomingActivities()[0];
  const activeSubjects = appState.subjects.filter((subject) =>
    ["Cursando", "Planificada"].includes(subject.status),
  );

  setText("#next-event-label", upcoming ? `${upcoming.title} · ${formatShortDate(upcoming.date)}` : "Sin eventos pendientes");
  setText("#active-subjects-label", `${activeSubjects.length} materias`);
  setText("#materials-count-label", `${appState.materials.length} recursos`);

  const sessionList = document.querySelector("#study-session-list");
  sessionList.replaceChildren(
    ...getUpcomingActivities()
      .slice(0, 3)
      .map((activity, index) => {
        const subject = findSubject(activity.subject);
        const item = document.createElement("div");
        item.className = "session-item";
        item.style.setProperty("--index", String(index));
        item.innerHTML = `
          <strong>${escapeHtml(subject?.name ?? "Materia")}</strong>
          <span>${escapeHtml(activity.title)} · ${formatShortDate(activity.date)}</span>
          <div class="progress-track" aria-label="Progreso ${activity.progress}%">
            <span style="width: ${Number(activity.progress)}%"></span>
          </div>
        `;
        return item;
      }),
  );

  document.querySelectorAll(".feature-strip a").forEach((link, index) => {
    link.style.setProperty("--index", String(index));
  });
}

function promptCareerSelection(force) {
  if (!force && appState.selectedDegree) return;
  if (document.querySelector(".career-choice-overlay")) return;

  const overlay = document.createElement("div");
  overlay.className = "career-choice-overlay";
  overlay.innerHTML = `
    <section class="career-choice-modal" role="dialog" aria-modal="true" aria-labelledby="career-choice-title">
      <p class="eyebrow">Configura tu flujograma</p>
      <h2 id="career-choice-title">Que ingenieria estudias?</h2>
      <p>Esto define el flujograma, los requisitos adicionales y la lista de materias por periodo.</p>
      <div class="career-choice-grid">
        ${Object.entries(CURRICULA)
          .map(
            ([key, curriculum]) => `
              <button class="career-choice-card" type="button" data-degree-choice="${key}">
                <strong>${escapeHtml(curriculum.title)}</strong>
                <span>${curriculum.courses.length} materias · ${curriculum.periods} periodos</span>
                <small>${escapeHtml(curriculum.approved)}</small>
              </button>
            `,
          )
          .join("")}
      </div>
    </section>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add("is-modal-open");
  window.setTimeout(() => overlay.classList.add("is-visible"), 20);
  overlay.querySelectorAll("[data-degree-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.selectedDegree = button.dataset.degreeChoice;
      appState.flowStatuses[appState.selectedDegree] = appState.flowStatuses[appState.selectedDegree] || {};
      saveState();
      overlay.classList.remove("is-visible");
      window.setTimeout(() => {
        overlay.remove();
        document.body.classList.remove("is-modal-open");
        showToast(`Flujograma cargado: ${CURRICULA[appState.selectedDegree].title}.`);
        if (currentRoute === "career") {
          renderCareer();
        }
      }, 190);
    });
  });
}

function renderCareer() {
  const degreeKey = getSelectedDegreeKey();
  const degreeSelect = document.querySelector("#degree-select");
  degreeSelect.value = degreeKey;
  degreeSelect.addEventListener("change", () => {
    changeSelectedDegree(degreeSelect.value);
    renderCareerHeader();
    renderCareerBoard();
    renderFlowBoard();
    applyCareerView();
  });

  document.querySelectorAll("[data-career-view]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.careerView = button.dataset.careerView;
      saveState();
      applyCareerView();
    });
  });

  renderCareerHeader();
  renderCareerBoard();
  renderFlowBoard();
  applyCareerView();
}

function renderCareerBoard() {
  const board = document.querySelector("#term-board");
  const curriculum = getSelectedCurriculum();
  const groups = groupByPeriod(curriculum.courses);
  board.replaceChildren(
    ...groups.map(([term, subjects], groupIndex) => {
      const credits = subjects.reduce((sum, subject) => sum + Number(subject.credits || 0), 0);
      const section = document.createElement("article");
      section.className = "term-section";
      section.style.setProperty("--index", String(groupIndex));
      section.innerHTML = `
        <div class="term-heading">
          <h2>Periodo ${escapeHtml(toRoman(Number(term)))}</h2>
          <p>${subjects.length} materias · ${credits} creditos</p>
        </div>
        <div class="subject-grid">
          ${subjects
            .map(
              (subject, subjectIndex) => `
                <article class="subject-card ${isCourseLocked(subject) ? "is-locked" : ""}" data-list-course="${escapeHtml(subject.id)}" tabindex="0" role="button" style="--index: ${subjectIndex}">
                  <header>
                    <h3>${escapeHtml(subject.name)}</h3>
                    <span class="flow-status ${flowStatusClass(getCourseStatus(subject.id))}" data-list-status-trigger="${escapeHtml(subject.id)}">${escapeHtml(getCourseStatus(subject.id))}</span>
                  </header>
                  <p class="meta-line">${escapeHtml(subject.code)}${subject.prereq ? ` · Prel: ${escapeHtml(subject.prereq)}` : ""}</p>
                  <div class="subject-meta">
                    <span class="tag">${Number(subject.credits)} creditos</span>
                    <span class="tag">A ${subject.hours.a}</span>
                    <span class="tag">PS ${subject.hours.ps}</span>
                    <span class="tag">L ${subject.hours.l}</span>
                    <span class="tag">AA ${subject.hours.aa}</span>
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>
      `;
      return section;
    }),
  );

  board.querySelectorAll("[data-list-course]").forEach((card) => {
    card.addEventListener("click", (event) => handleListCourseClick(card, event));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleListCourseClick(card, event);
      }
    });
  });
}

function handleListCourseClick(card, event) {
  const subject = getSelectedCurriculum().courses.find((item) => item.id === card.dataset.listCourse);
  if (!subject) return;
  const statusTrigger = event.target.closest("[data-list-status-trigger]");

  if (statusTrigger) {
    if (isCourseLocked(subject)) {
      showRequirementNotice(subject);
      return;
    }
    openFlowStatusMenu(subject, statusTrigger, event);
    return;
  }

  openCourseDetailModal(subject);
}

function renderCareerHeader() {
  const curriculum = getSelectedCurriculum();
  const totalCredits = curriculum.courses.reduce((sum, subject) => sum + Number(subject.credits || 0), 0);
  const completedCredits = curriculum.courses
    .filter((subject) => getCourseStatus(subject.id) === "Cursada")
    .reduce((sum, subject) => sum + Number(subject.credits || 0), 0);
  const progress = totalCredits ? Math.round((completedCredits / totalCredits) * 100) : 0;

  setText("#career-title", curriculum.title);
  setText("#career-meta", `${curriculum.approved} · ${curriculum.updated}`);
  setText("#career-progress", `${progress}%`);
  setText("#career-credits", String(totalCredits));
}

function renderFlowBoard() {
  const board = document.querySelector("#flow-board");
  const requirements = document.querySelector("#additional-requirements");
  const curriculum = getSelectedCurriculum();
  const groups = groupByPeriod(curriculum.courses);

  board.replaceChildren(
    ...groups.map(([period, courses]) => {
      const total = curriculum.termTotals[Number(period) - 1];
      const column = document.createElement("section");
      column.className = "flow-period";
      column.innerHTML = `
        <header class="flow-period-header">
          <span>${escapeHtml(toRoman(Number(period)))}</span>
          <strong>Periodo ${Number(period)}</strong>
        </header>
        <div class="flow-course-list">
          ${courses.map((item, index) => flowCourseCard(item, index)).join("")}
        </div>
        ${total ? flowTermTotal(total) : ""}
      `;
      return column;
    }),
  );

  requirements.replaceChildren(
    ...curriculum.additional.map((item) => {
      const card = document.createElement("article");
      card.className = "requirement-card";
      card.innerHTML = `
        <strong>${escapeHtml(item.code)}</strong>
        <span>${escapeHtml(item.name)}</span>
        ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
        <em>${Number(item.credits)} creditos</em>
      `;
      return card;
    }),
  );

  board.querySelectorAll("[data-flow-course]").forEach((button) => {
    button.addEventListener("click", (event) => handleFlowCourseClick(button, event));
  });
  bindFlowDrag(board);
}

function flowCourseCard(item, index) {
  const status = getCourseStatus(item.id);
  const locked = isCourseLocked(item);
  return `
    <button class="flow-course-card ${flowStatusClass(status)} ${locked ? "is-locked" : ""}" type="button" data-flow-course="${escapeHtml(item.id)}" style="--index: ${index}" aria-label="${escapeHtml(item.name)}${locked ? ". Bloqueada por prelacion" : ""}">
      ${item.prereq ? `<span class="flow-prereq">${escapeHtml(item.prereq)}</span>` : `<span class="flow-prereq">Sin prelacion</span>`}
      <strong>${escapeHtml(item.code)}</strong>
      <span class="flow-course-name">${escapeHtml(item.name)}</span>
      <span class="flow-card-tags">
        <span class="flow-status ${flowStatusClass(status)}" data-flow-status-trigger="${escapeHtml(item.id)}">${escapeHtml(status)}</span>
        ${locked ? `<span class="flow-lock-note">Bloqueada</span>` : ""}
      </span>
      <span class="flow-hours">
        <span><b>A</b>${item.hours.a}</span>
        <span><b>PS</b>${item.hours.ps}</span>
        <span><b>L</b>${item.hours.l}</span>
        <span><b>AA</b>${item.hours.aa}</span>
        <span><b>C</b>${item.credits}</span>
      </span>
    </button>
  `;
}

function flowTermTotal(total) {
  return `
    <div class="flow-term-total" aria-label="Totales del periodo">
      <span><b>A</b>${total.a}</span>
      <span><b>PS</b>${total.ps}</span>
      <span><b>L</b>${total.l}</span>
      <span><b>AA</b>${total.aa}</span>
      <span><b>C</b>${total.c}</span>
    </div>
  `;
}

function applyCareerView() {
  const activeView = appState.careerView === "flow" ? "flow" : "list";
  document.querySelector("#career-list-panel").hidden = activeView !== "list";
  document.querySelector("#career-flow-panel").hidden = activeView !== "flow";
  document.querySelectorAll("[data-career-view]").forEach((button) => {
    button.classList.toggle("is-saved", button.dataset.careerView === activeView);
  });
}

function changeSelectedDegree(degreeKey) {
  if (!CURRICULA[degreeKey]) return;
  appState.selectedDegree = degreeKey;
  appState.flowStatuses[degreeKey] = appState.flowStatuses[degreeKey] || {};
  saveState();
  showToast(`Flujograma actualizado: ${CURRICULA[degreeKey].title}.`);
}

function handleFlowCourseClick(button, event) {
  const board = document.querySelector("#flow-board");
  if (board?.dataset.dragging === "true") return;

  const courseItem = getSelectedCurriculum().courses.find((item) => item.id === button.dataset.flowCourse);
  if (!courseItem) return;
  const statusTrigger = event.target.closest("[data-flow-status-trigger]");

  if (statusTrigger) {
    if (isCourseLocked(courseItem)) {
      showRequirementNotice(courseItem);
      return;
    }
    openFlowStatusMenu(courseItem, statusTrigger, event);
    return;
  }

  openCourseDetailModal(courseItem);
}

function openFlowStatusMenu(courseItem, anchor, event) {
  closeFlowStatusMenu();
  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "flow-status-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <span>Cambiar estado</span>
    ${["Pendiente", "Planificada", "En curso", "Cursada"]
      .map(
        (status) => `
          <button class="flow-status-option ${flowStatusClass(status)}" type="button" role="menuitem" data-set-status="${status}">
            ${escapeHtml(status)}
          </button>
        `,
      )
      .join("")}
  `;
  document.body.appendChild(menu);

  const menuWidth = menu.offsetWidth || 190;
  const menuHeight = menu.offsetHeight || 190;
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - menuWidth - 12);
  const top = Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 12);
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.max(12, top)}px`;

  window.setTimeout(() => menu.classList.add("is-visible"), 20);
  menu.querySelectorAll("[data-set-status]").forEach((button) => {
    button.addEventListener("click", () => {
      requestCourseStatusChange(courseItem, button.dataset.setStatus);
      closeFlowStatusMenu();
    });
  });

  window.setTimeout(() => {
    document.addEventListener("click", handleFlowStatusOutsideClick);
    document.addEventListener("keydown", handleFlowStatusKeydown);
  }, 0);
  event?.stopPropagation();
}

function closeFlowStatusMenu() {
  const menu = document.querySelector(".flow-status-menu");
  if (menu) menu.remove();
  document.removeEventListener("click", handleFlowStatusOutsideClick);
  document.removeEventListener("keydown", handleFlowStatusKeydown);
}

function handleFlowStatusOutsideClick(event) {
  if (!event.target.closest(".flow-status-menu")) {
    closeFlowStatusMenu();
  }
}

function handleFlowStatusKeydown(event) {
  if (event.key === "Escape") {
    closeFlowStatusMenu();
  }
}

function requestCourseStatusChange(courseItem, status) {
  const currentStatus = getCourseStatus(courseItem.id);
  if (currentStatus === "Cursada" && status !== "Cursada") {
    const affected = getAffectedDependentCourses(courseItem).filter((item) => getCourseStatus(item.id) !== "Pendiente");
    if (affected.length) {
      openDependencyConfirm(courseItem, status, affected);
      return;
    }
  }

  setCourseStatus(courseItem.id, status);
}

function setCourseStatus(courseId, status, dependentCourseIds = []) {
  const degreeKey = getSelectedDegreeKey();
  appState.flowStatuses[degreeKey] = appState.flowStatuses[degreeKey] || {};
  appState.flowStatuses[degreeKey][courseId] = status;
  dependentCourseIds.forEach((dependentId) => {
    appState.flowStatuses[degreeKey][dependentId] = "Pendiente";
  });
  saveState();
  renderCareerHeader();
  renderCareerBoard();
  renderFlowBoard();
  applyCareerView();
}

function getAffectedDependentCourses(parentCourse) {
  const curriculum = getSelectedCurriculum();
  const affected = new Map();
  const pendingCodes = new Set([parentCourse.code]);
  let changed = true;

  while (changed) {
    changed = false;
    curriculum.courses.forEach((courseItem) => {
      if (courseItem.id === parentCourse.id || affected.has(courseItem.id)) return;
      const dependsOnKnownCode = [...pendingCodes].some((code) => courseRequiresCode(courseItem, code));
      if (!dependsOnKnownCode) return;

      affected.set(courseItem.id, courseItem);
      pendingCodes.add(courseItem.code);
      changed = true;
    });
  }

  return [...affected.values()].sort((a, b) => a.period - b.period || a.name.localeCompare(b.name));
}

function courseRequiresCode(courseItem, code) {
  if (!courseItem.prereq || !code) return false;
  return new RegExp(`\\b${escapeRegExp(code)}\\b`).test(courseItem.prereq);
}

function openDependencyConfirm(parentCourse, nextStatus, affectedCourses) {
  closeDependencyConfirm(false);
  const overlay = document.createElement("div");
  overlay.className = "dependency-confirm-overlay";
  overlay.innerHTML = `
    <section class="dependency-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="dependency-confirm-title">
      <header>
        <div>
          <p class="eyebrow">Cambio con impacto</p>
          <h2 id="dependency-confirm-title">Esta materia desbloquea otras materias</h2>
        </div>
        <button class="icon-button dependency-confirm-close" type="button" aria-label="Cancelar cambio">×</button>
      </header>
      <p>
        Si cambias <strong>${escapeHtml(parentCourse.name)}</strong> de Cursada a
        <strong>${escapeHtml(nextStatus)}</strong>, estas materias volveran a Pendiente y quedaran bloqueadas hasta cumplir la prelacion.
      </p>
      <div class="dependency-impact-list">
        ${affectedCourses
          .map(
            (item) => `
              <article>
                <strong>${escapeHtml(item.code)}</strong>
                <span>${escapeHtml(item.name)}</span>
                <small>Periodo ${escapeHtml(toRoman(item.period))} · estado actual: ${escapeHtml(getCourseStatus(item.id))}</small>
              </article>
            `,
          )
          .join("")}
      </div>
      <div class="dependency-confirm-actions">
        <button class="secondary-action" type="button" data-dependency-cancel>Cancelar</button>
        <button class="primary-action" type="button" data-dependency-confirm>Aplicar cambio</button>
      </div>
    </section>
  `;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeDependencyConfirm();
    }
  });
  overlay.querySelector(".dependency-confirm-close").addEventListener("click", () => closeDependencyConfirm());
  overlay.querySelector("[data-dependency-cancel]").addEventListener("click", () => closeDependencyConfirm());
  overlay.querySelector("[data-dependency-confirm]").addEventListener("click", () => {
    setCourseStatus(
      parentCourse.id,
      nextStatus,
      affectedCourses.map((item) => item.id),
    );
    closeDependencyConfirm();
    showToast("Estado actualizado y materias dependientes bloqueadas.");
  });

  document.body.appendChild(overlay);
  document.body.classList.add("is-modal-open");
  window.setTimeout(() => overlay.classList.add("is-visible"), 20);
  document.addEventListener("keydown", handleDependencyConfirmKeydown);
}

function closeDependencyConfirm(animate = true) {
  const overlay = document.querySelector(".dependency-confirm-overlay");
  if (!overlay) return;
  document.removeEventListener("keydown", handleDependencyConfirmKeydown);
  document.body.classList.remove("is-modal-open");

  if (!animate) {
    overlay.remove();
    return;
  }

  overlay.classList.remove("is-visible");
  window.setTimeout(() => overlay.remove(), 190);
}

function handleDependencyConfirmKeydown(event) {
  if (event.key === "Escape") {
    closeDependencyConfirm();
  }
}

function openCourseDetailModal(courseItem) {
  closeCourseDetailModal(false);
  closeFlowStatusMenu();
  const status = getCourseStatus(courseItem.id);
  const locked = isCourseLocked(courseItem);
  const missing = locked ? getMissingRequirements(courseItem) : [];
  const overlay = document.createElement("div");
  overlay.className = "course-detail-overlay";
  overlay.innerHTML = `
    <section class="course-detail-modal" role="dialog" aria-modal="true" aria-labelledby="course-detail-title">
      <header>
        <div>
          <p class="eyebrow">Ficha de materia</p>
          <h2 id="course-detail-title">${escapeHtml(courseItem.name)}</h2>
          <span>${escapeHtml(courseItem.code)} · Periodo ${escapeHtml(toRoman(courseItem.period))}</span>
        </div>
        <button class="icon-button course-detail-close" type="button" aria-label="Cerrar detalle">×</button>
      </header>
      <div class="course-detail-body">
        <div class="course-detail-status">
          <span class="flow-status ${flowStatusClass(status)}">${escapeHtml(status)}</span>
          ${locked ? `<span class="flow-lock-note">Bloqueada</span>` : ""}
        </div>
        <dl class="course-detail-grid">
          <div><dt>Prelacion</dt><dd>${courseItem.prereq ? escapeHtml(courseItem.prereq) : "Sin prelacion"}</dd></div>
          <div><dt>Creditos</dt><dd>${Number(courseItem.credits)}</dd></div>
          <div><dt>Horas de aula</dt><dd>${Number(courseItem.hours.a)}</dd></div>
          <div><dt>Practicas supervisadas</dt><dd>${Number(courseItem.hours.ps)}</dd></div>
          <div><dt>Laboratorio</dt><dd>${Number(courseItem.hours.l)}</dd></div>
          <div><dt>Aprendizaje autonomo</dt><dd>${Number(courseItem.hours.aa)}</dd></div>
        </dl>
        ${
          locked
            ? `<div class="course-detail-requirements">
                <strong>Para desbloquearla necesitas:</strong>
                <ul>${missing.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
              </div>`
            : `<p class="meta-line">Para cambiar el estado, haz click directamente sobre el tag de estado en la tarjeta.</p>`
        }
      </div>
    </section>
  `;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeCourseDetailModal();
    }
  });
  overlay.querySelector(".course-detail-close").addEventListener("click", () => closeCourseDetailModal());
  document.body.appendChild(overlay);
  document.body.classList.add("is-modal-open");
  window.setTimeout(() => overlay.classList.add("is-visible"), 20);
  document.addEventListener("keydown", handleCourseDetailKeydown);
}

function closeCourseDetailModal(animate = true) {
  const overlay = document.querySelector(".course-detail-overlay");
  if (!overlay) return;
  document.removeEventListener("keydown", handleCourseDetailKeydown);
  document.body.classList.remove("is-modal-open");

  if (!animate) {
    overlay.remove();
    return;
  }

  overlay.classList.remove("is-visible");
  window.setTimeout(() => overlay.remove(), 190);
}

function handleCourseDetailKeydown(event) {
  if (event.key === "Escape") {
    closeCourseDetailModal();
  }
}

function bindFlowDrag(board) {
  if (board.dataset.dragReady === "true") return;
  board.dataset.dragReady = "true";
  let startX = 0;
  let startScroll = 0;
  let active = false;
  let dragging = false;

  board.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    active = true;
    dragging = false;
    startX = event.clientX;
    startScroll = board.scrollLeft;
  });

  board.addEventListener("pointermove", (event) => {
    if (!active) return;
    const delta = event.clientX - startX;
    if (Math.abs(delta) > 6) {
      if (!dragging) {
        dragging = true;
        board.classList.add("is-grabbing");
        board.dataset.dragging = "true";
        board.setPointerCapture?.(event.pointerId);
      }
      board.dataset.dragging = "true";
      board.scrollLeft = startScroll - delta;
    }
  });

  const stopDrag = (event) => {
    if (!active) return;
    active = false;
    board.classList.remove("is-grabbing");
    if (dragging) {
      board.releasePointerCapture?.(event.pointerId);
      window.setTimeout(() => {
        delete board.dataset.dragging;
      }, 90);
    }
    dragging = false;
  };

  board.addEventListener("pointerup", stopDrag);
  board.addEventListener("pointercancel", stopDrag);
  board.addEventListener("mouseleave", () => {
    active = false;
    dragging = false;
    board.classList.remove("is-grabbing");
  });

  board.addEventListener(
    "click",
    (event) => {
      if (board.dataset.dragging === "true") {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
}

function isCourseLocked(courseItem) {
  if (!courseItem.prereq || getCourseStatus(courseItem.id) !== "Pendiente") return false;
  return getMissingRequirements(courseItem).length > 0;
}

function getMissingRequirements(courseItem) {
  if (!courseItem.prereq) return [];
  const curriculum = getSelectedCurriculum();
  const completedCredits = getCompletedCredits();
  const alternatives = courseItem.prereq.split(/\s+o\s+/i).map((part) => part.trim()).filter(Boolean);
  const groups = alternatives.length ? alternatives : [courseItem.prereq];
  const evaluated = groups.map((group) => evaluateRequirementGroup(group, curriculum, completedCredits));

  if (evaluated.some((group) => group.satisfied)) {
    return [];
  }

  return evaluated.flatMap((group) => group.missing);
}

function evaluateRequirementGroup(group, curriculum, completedCredits) {
  const missing = [];
  const codeMatches = [...group.matchAll(/\b[A-Z]{2,}[A-Z0-9]*\d{2,}\b/g)].map((match) => match[0]);
  const uniqueCodes = [...new Set(codeMatches)];

  uniqueCodes.forEach((code) => {
    const matchingCourses = curriculum.courses.filter((item) => item.code === code);
    if (!matchingCourses.length) return;
    const satisfied = matchingCourses.some((item) => getCourseStatus(item.id) === "Cursada");
    if (!satisfied) {
      missing.push(`${code} · ${matchingCourses[0].name}`);
    }
  });

  const creditMatch = group.match(/(\d+)\s*(?:cred|cr)\b/i);
  if (creditMatch) {
    const requiredCredits = Number(creditMatch[1]);
    if (completedCredits < requiredCredits) {
      missing.push(`${requiredCredits} creditos aprobados`);
    }
  }

  if (/\bBP\b/i.test(group)) {
    missing.push(group.replace(/\s+/g, " "));
  }

  if (!uniqueCodes.length && !creditMatch && !/\bBP\b/i.test(group) && group.trim()) {
    missing.push(group.trim());
  }

  return {
    missing,
    satisfied: missing.length === 0,
  };
}

function getCompletedCredits() {
  return getSelectedCurriculum().courses
    .filter((item) => getCourseStatus(item.id) === "Cursada")
    .reduce((sum, item) => sum + Number(item.credits || 0), 0);
}

function showRequirementNotice(courseItem) {
  closeRequirementNotice(false);
  const missing = getMissingRequirements(courseItem);
  const overlay = document.createElement("div");
  overlay.className = "requirement-notice-overlay";
  overlay.innerHTML = `
    <section class="requirement-notice" role="dialog" aria-modal="true" aria-labelledby="requirement-title">
      <header>
        <div>
          <p class="eyebrow">Materia bloqueada</p>
          <h2 id="requirement-title">${escapeHtml(courseItem.name)}</h2>
        </div>
        <button class="icon-button requirement-close" type="button" aria-label="Cerrar aviso">×</button>
      </header>
      <p>Para cambiar el estado de esta materia primero debes cumplir:</p>
      <ul>
        ${missing.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  `;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeRequirementNotice();
    }
  });
  overlay.querySelector(".requirement-close").addEventListener("click", () => closeRequirementNotice());
  document.body.appendChild(overlay);
  document.body.classList.add("is-modal-open");
  window.setTimeout(() => overlay.classList.add("is-visible"), 20);
  document.addEventListener("keydown", handleRequirementNoticeKeydown);
}

function closeRequirementNotice(animate = true) {
  const overlay = document.querySelector(".requirement-notice-overlay");
  if (!overlay) return;
  document.removeEventListener("keydown", handleRequirementNoticeKeydown);
  document.body.classList.remove("is-modal-open");

  if (!animate) {
    overlay.remove();
    return;
  }

  overlay.classList.remove("is-visible");
  window.setTimeout(() => overlay.remove(), 190);
}

function handleRequirementNoticeKeydown(event) {
  if (event.key === "Escape") {
    closeRequirementNotice();
  }
}

function renderMaterials() {
  populateSubjectFilter("#material-form select[name='subject']", false);

  const search = document.querySelector("#material-search");
  const format = document.querySelector("#material-format-filter");
  search.addEventListener("input", renderMaterialGrid);
  format.addEventListener("change", renderMaterialGrid);

  document.querySelector("#material-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    appState.materials.unshift({
      id: createId("mat"),
      title: String(data.get("title")).trim(),
      subject: String(data.get("subject")),
      format: String(data.get("format")),
      source: String(data.get("source")).trim() || "Ruta local pendiente",
      level: String(data.get("level")),
      saved: false,
      updated: toDateInput(TODAY),
    });

    saveState();
    showToast("Recurso agregado a la biblioteca.");
    form.reset();
    renderMaterialGrid();
  });

  renderMaterialGrid();
}

function renderMaterialGrid() {
  const grid = document.querySelector("#material-grid");
  const query = document.querySelector("#material-search")?.value.trim().toLowerCase() ?? "";
  const selectedFormat = document.querySelector("#material-format-filter")?.value ?? "Todos";
  const materials = appState.materials.filter((material) => {
    const subject = findSubject(material.subject);
    const haystack = `${material.title} ${subject?.name ?? ""} ${material.level} ${material.format}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    const matchesFormat = selectedFormat === "Todos" || material.format === selectedFormat;
    return matchesQuery && matchesFormat;
  });

  if (!materials.length) {
    grid.innerHTML = `<div class="empty-state">No hay materiales que coincidan con la busqueda.</div>`;
    return;
  }

  grid.replaceChildren(
    ...materials.map((material, index) => {
      const subject = findSubject(material.subject);
      const card = document.createElement("article");
      card.className = `material-card ${materialLevelClass(material.level)}`;
      card.style.setProperty("--index", String(index));
      card.innerHTML = `
        <header class="material-card-header">
          <span class="format-pill">${escapeHtml(material.format)}</span>
          <span class="material-level ${materialLevelClass(material.level)}">${escapeHtml(normalizeMaterialLevel(material.level))}</span>
        </header>
        <div class="material-card-main">
          <h3>${escapeHtml(material.title)}</h3>
          <p class="material-subject">${escapeHtml(subject?.name ?? "Materia")}</p>
        </div>
        <p class="material-source">${escapeHtml(material.source)}</p>
        <div class="material-actions">
          <span class="material-updated">Actualizado ${formatShortDate(material.updated)}</span>
          ${sourceLink(material.source)}
          <button class="small-action ${material.saved ? "is-saved" : ""}" type="button" data-toggle-save="${escapeHtml(material.id)}">
            ${material.saved ? "Prioritario" : "Marcar"}
          </button>
        </div>
      `;
      return card;
    }),
  );

  grid.querySelectorAll("[data-toggle-save]").forEach((button) => {
    button.addEventListener("click", () => {
      const material = appState.materials.find((item) => item.id === button.dataset.toggleSave);
      if (!material) return;
      material.saved = !material.saved;
      saveState();
      showToast(material.saved ? "Material marcado como prioritario." : "Material removido de prioritarios.");
      renderMaterialGrid();
    });
  });
}

function populateSubjectFilter(selector, includeAll) {
  const select = document.querySelector(selector);
  if (!select) return;

  const options = appState.subjects.map((subject) => {
    const option = document.createElement("option");
    option.value = subject.id;
    option.textContent = subject.name;
    return option;
  });

  if (includeAll) {
    const all = document.createElement("option");
    all.value = "Todas";
    all.textContent = "Todas las materias";
    select.replaceChildren(all, ...options);
    return;
  }

  select.replaceChildren(...options);
}

function getUpcomingActivities() {
  const todayKey = toDateInput(TODAY);
  return [...appState.activities]
    .filter((activity) => activity.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function groupByTerm(subjects) {
  const map = new Map();
  subjects.forEach((subject) => {
    const items = map.get(subject.term) ?? [];
    items.push(subject);
    map.set(subject.term, items);
  });

  return [...map.entries()].sort(([a], [b]) => naturalTermNumber(a) - naturalTermNumber(b) || a.localeCompare(b));
}

function groupByPeriod(courses) {
  const map = new Map();
  courses.forEach((courseItem) => {
    const items = map.get(courseItem.period) ?? [];
    items.push(courseItem);
    map.set(courseItem.period, items);
  });

  return [...map.entries()].sort(([a], [b]) => Number(a) - Number(b));
}

function getSelectedDegreeKey() {
  return CURRICULA[appState.selectedDegree] ? appState.selectedDegree : "sistemas";
}

function getSelectedCurriculum() {
  return CURRICULA[getSelectedDegreeKey()];
}

function getCourseStatus(courseId) {
  const degreeKey = getSelectedDegreeKey();
  return appState.flowStatuses?.[degreeKey]?.[courseId] ?? "Pendiente";
}

function nextFlowStatus(status) {
  const statuses = ["Pendiente", "Planificada", "En curso", "Cursada"];
  const index = statuses.indexOf(status);
  return statuses[(index + 1) % statuses.length];
}

function flowStatusClass(status) {
  return {
    Cursada: "is-completed",
    "En curso": "is-current",
    Planificada: "is-planned",
    Pendiente: "is-pending",
  }[status] ?? "is-pending";
}

function naturalTermNumber(term) {
  const match = term.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function findSubject(id) {
  return appState.subjects.find((subject) => subject.id === id);
}

function nextStatus(status) {
  const statuses = ["Planificada", "Pendiente", "Cursando", "Aprobada"];
  const index = statuses.indexOf(status);
  return statuses[(index + 1) % statuses.length];
}

function statusClass(status) {
  return {
    Aprobada: "is-approved",
    Pendiente: "is-pending",
    Planificada: "is-planned",
  }[status] ?? "";
}

function priorityClass(priority) {
  return {
    Alta: "is-high",
    Media: "is-medium",
  }[priority] ?? "";
}

function priorityWeight(priority) {
  return {
    Alta: 0,
    Media: 1,
    Baja: 2,
  }[priority] ?? 3;
}

function normalizeMaterialLevel(level) {
  return {
    Premium: "Pro",
    Esencial: "Avanzado",
    Repaso: "Gratis",
    Pro: "Pro",
    Avanzado: "Avanzado",
    Gratis: "Gratis",
  }[level] ?? "Gratis";
}

function materialLevelClass(level) {
  return {
    Gratis: "is-free",
    Avanzado: "is-advanced",
    Pro: "is-pro",
  }[normalizeMaterialLevel(level)];
}

function sourceLink(source) {
  if (/^https?:\/\//i.test(source)) {
    return `<a class="small-action" href="${escapeHtml(source)}" target="_blank" rel="noreferrer">Abrir</a>`;
  }

  return "";
}

function setText(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2400);
}

function parseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(dateString) {
  return new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short" }).format(parseDate(dateString));
}

function formatFullDate(dateString) {
  return new Intl.DateTimeFormat("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseDate(dateString));
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("es-VE", { month: "short" }).format(date).replace(".", "");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toRoman(value) {
  return ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][value] ?? String(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function course(period, code, name, prereq = "", credits = 3, hours = {}) {
  return {
    period,
    code,
    name,
    prereq,
    credits,
    hours: {
      a: hours.a ?? 4,
      ps: hours.ps ?? 0,
      l: hours.l ?? 0,
      aa: hours.aa ?? 4,
    },
  };
}

function req(code, name, note, credits) {
  return { code, name, note, credits };
}

function termTotals(rows) {
  return rows.map(([a, ps, l, aa, c]) => ({ a, ps, l, aa, c }));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function initCanvasScene() {
  const canvas = document.querySelector("#study-canvas");
  const context = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let frame = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  };

  const drawDesk = () => {
    const deskX = Math.max(width * 0.54, width - 690);
    const deskWidth = width - deskX;
    context.fillStyle = "rgba(255, 253, 248, 0.56)";
    context.fillRect(deskX, 0, deskWidth, height);

    context.strokeStyle = "rgba(20, 32, 42, 0.08)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(deskX, 0);
    context.lineTo(deskX, height);
    context.stroke();

    context.strokeStyle = "rgba(20, 32, 42, 0.045)";
    for (let x = deskX + 34; x < width + 80; x += 74) {
      context.beginPath();
      context.moveTo(x, 22);
      context.lineTo(x + 92, height);
      context.stroke();
    }

    for (let y = 72; y < height; y += 74) {
      context.beginPath();
      context.moveTo(deskX, y);
      context.lineTo(width, y);
      context.stroke();
    }
  };

  const drawBook = (x, y, bookWidth, bookHeight, color, angle) => {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = "rgba(23, 32, 42, 0.12)";
    context.fillRect(10, 14, bookWidth, bookHeight);
    context.fillStyle = color;
    context.fillRect(0, 0, bookWidth, bookHeight);
    context.fillStyle = "rgba(255, 253, 248, 0.72)";
    context.fillRect(14, 14, bookWidth - 28, bookHeight - 28);
    context.fillStyle = "rgba(23, 32, 42, 0.12)";
    for (let line = 0; line < 7; line += 1) {
      context.fillRect(30, 36 + line * 16, bookWidth - 60, 2);
    }
    context.fillStyle = "rgba(178, 135, 71, 0.62)";
    context.fillRect(bookWidth - 25, 0, 8, bookHeight);
    context.restore();
  };

  const drawPen = (x, y, angle) => {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = "#26313b";
    context.fillRect(0, 0, 180, 9);
    context.fillStyle = "#b28747";
    context.fillRect(18, -2, 44, 13);
    context.beginPath();
    context.moveTo(180, 0);
    context.lineTo(212, 5);
    context.lineTo(180, 9);
    context.closePath();
    context.fillStyle = "#6f2438";
    context.fill();
    context.restore();
  };

  const drawNotes = () => {
    if (width < 760) return;
    context.save();
    context.translate(width * 0.71, height * 0.18);
    context.rotate(-0.05);
    context.fillStyle = "rgba(255, 253, 248, 0.72)";
    context.fillRect(0, 0, 178, 104);
    context.strokeStyle = "rgba(20, 32, 42, 0.12)";
    context.strokeRect(0, 0, 178, 104);
    context.fillStyle = "rgba(114, 35, 58, 0.35)";
    context.fillRect(18, 20, 92, 3);
    context.fillStyle = "rgba(20, 32, 42, 0.16)";
    for (let line = 0; line < 4; line += 1) {
      context.fillRect(18, 40 + line * 13, 138 - line * 12, 2);
    }
    context.restore();
  };

  const draw = () => {
    context.clearRect(0, 0, width, height);
    drawDesk();
    if (width > 760) {
      const drift = reduceMotion ? 0 : Math.sin(frame / 110) * 4;
      drawBook(width * 0.62, height * 0.52 + drift, 250, 320, "#254f3c", -0.09);
      drawBook(width * 0.76, height * 0.5 - drift, 180, 260, "#72233a", 0.12);
      drawPen(width * 0.68, height * 0.42, -0.36);
      drawNotes();
    }
    frame += 1;
  };

  const animate = () => {
    draw();
    if (!reduceMotion) {
      requestAnimationFrame(animate);
    }
  };

  window.addEventListener("resize", resize);
  resize();
  if (!reduceMotion) {
    requestAnimationFrame(animate);
  }
}

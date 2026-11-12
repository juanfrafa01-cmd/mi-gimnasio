/**
 * js/app.js — Capa de presentación para "Mi Gimnasio / IronTrack B2B2C"
 *
 * Incluye las dos interfaces completas:
 * 1. Interfaz de Teléfono (Mobile-First 390px en modo oscuro de alto contraste para el Alumno).
 * 2. Interfaz de PC / Escritorio (Widescreen Dashboard & CRM Clínico en modo claro para el Profesor,
 *    y versión PC Widescreen para el Alumno).
 * 3. Modo Pantalla Dividida (Split) para ver el Teléfono del Alumno y la PC del Profesor sincronizados en vivo.
 *
 * Reglas de oro:
 * - Cuentas nuevas inician sin rutinas ni entrenamientos precargados (100% limpias), pero cuentan con el
 *   catálogo completo de 28 ejercicios estandarizados de gimnasio al pulsar "+".
 * - Todos los cálculos provienen de Engine.compute...().
 * - Toda mutación pasa por Store.commit(...) o Store.commitForUser(...).
 * - Todo texto de usuario se escapa con h() antes de inyectarse en innerHTML.
 * - Eventos manejados exclusivamente por delegación data-action="...".
 */

(function () {
  'use strict';

  const APP_VERSION = '3.2.0';

  /** Número válido o valor por defecto (a diferencia de `|| def`, respeta el 0: RIR 0 = serie al fallo). */
  const numOr = (v, def) => (Number.isFinite(v) ? v : def);

  function getAutoLayoutMode() {
    const user = Store.user;
    if (!user) return 'auth';
    if (user.role === 'profesor') return 'pc-profesor';
    return window.innerWidth >= 960 ? 'pc-alumno' : 'phone-alumno';
  }

  // Modo de visualización en pantalla adaptado estrictamente según dispositivo
  let layoutMode = getAutoLayoutMode();
  let activeTab = 'hoy'; // 'hoy' | 'rutinas' | 'historico' | 'salud' | 'evolucion' | 'ajustes'
  let activeModal = null; // null | { type, ... }
  let previousModal = null; // Para volver al modal anterior al cerrar el visor de ejercicio
  let lastDeletedSerie = null;
  let lastDeletedBatchIds = null;
  let draftSugerenciaCapturas = [];
  let draftSugerenciaTexto = '';
  let isDictatingSugerencia = false;
  let activeSpeechRecognition = null;

  // Estado para edición simplificada, buzón de sugerencias, rutinas y vista de histórico
  let editingEjercicios = new Set();
  let historialBusqueda = '';
  let expandedHistorialEjIds = new Set();
  let historicoModo = 'clases'; // 'clases' | 'ejercicios'
  let rutinasSubTab = 'rutinas'; // 'rutinas' | 'catalogo'
  let showPhotoOptions = false;
  let isSaludLogsOpen = false;
  let isAjustesColorsOpen = false;

  // Estado persistente de formularios de Salud y Ficha Física para que guardar uno NUNCA modifique ni reinicie el otro
  let draftReadiness = {
    userKey: null,
    fecha: Engine.todayISO(),
    estadoGeneral: 'Bien',
    energia: '4',
    estres: '1',
    sueno: '5',
    alimentacion: '5',
    zonaDolor: '',
    observacionAlumno: ''
  };

  let isPerfilOpen = false;

  let draftPerfil = {
    userKey: null,
    edad: '',
    pesoKg: '',
    alturaCm: '',
    diasSemana: [],
    horarioHabitual: '19:00',
    lesiones: '',
    objetivoCorto: ''
  };

  function syncSaludDraftsWithState(state, user) {
    const uKey = user ? user.username : 'anon';
    const p = (state && state.perfil) || {};
    const hoyISO = Engine.todayISO();
    const targetFecha = draftReadiness.fecha || hoyISO;
    const logFecha = state && Array.isArray(state.readinessLogs)
      ? state.readinessLogs.find(r => r.fecha === targetFecha && !r.deleted)
      : null;
    const lastLog = logFecha || (state && Array.isArray(state.readinessLogs)
      ? state.readinessLogs.find(r => !r.deleted)
      : null);

    if (draftReadiness.userKey !== uKey) {
      draftReadiness = {
        userKey: uKey,
        fecha: hoyISO,
        estadoGeneral: lastLog ? (lastLog.estadoGeneral || lastLog.observacionAlumno || 'Bien') : 'Bien',
        energia: lastLog ? String(lastLog.energia || 4) : '4',
        estres: lastLog ? String(lastLog.estres || 1) : '1',
        sueno: lastLog ? String(lastLog.sueno || 5) : '5',
        alimentacion: lastLog ? String(lastLog.alimentacion || 5) : '5',
        zonaDolor: lastLog ? (lastLog.zonaDolor || '') : '',
        observacionAlumno: lastLog ? (lastLog.observacionAlumno || '') : ''
      };
    }

    if (draftPerfil.userKey !== uKey) {
      draftPerfil = {
        userKey: uKey,
        edad: p.edad != null ? String(p.edad) : '',
        pesoKg: p.pesoKg != null ? String(p.pesoKg) : '',
        alturaCm: p.alturaCm != null ? String(p.alturaCm) : '',
        diasSemana: Array.isArray(p.diasSemana) ? [...p.diasSemana] : [],
        horarioHabitual: p.horarioHabitual || '19:00',
        lesiones: p.lesiones || '',
        objetivoCorto: p.objetivoCorto || ''
      };
    }
  }

  function captureSaludDraftsFromDOM() {
    const rdFecha = document.getElementById('rd-fecha');
    const rdDolor = document.getElementById('rd-dolor');
    const rdObs = document.getElementById('rd-obs');
    const stepDolor = document.getElementById('step-psico-dolor');
    const stepObs = document.getElementById('step-psico-obs');

    if (rdFecha && rdFecha.value) draftReadiness.fecha = rdFecha.value;
    if (rdDolor) draftReadiness.zonaDolor = rdDolor.value.trim();
    if (rdObs) draftReadiness.observacionAlumno = rdObs.value.trim();
    if (stepDolor) draftReadiness.zonaDolor = stepDolor.value.trim();
    if (stepObs) draftReadiness.observacionAlumno = stepObs.value.trim();

    const pfEdad = document.getElementById('pf-edad');
    const pfPeso = document.getElementById('pf-peso');
    const pfAltura = document.getElementById('pf-altura');
    const pfHorario = document.getElementById('pf-horario');
    const pfLesiones = document.getElementById('pf-lesiones');
    const pfObjetivo = document.getElementById('pf-objetivo');

    if (pfEdad) draftPerfil.edad = pfEdad.value;
    if (pfPeso) draftPerfil.pesoKg = pfPeso.value;
    if (pfAltura) draftPerfil.alturaCm = pfAltura.value;
    if (pfHorario) draftPerfil.horarioHabitual = pfHorario.value;
    if (pfLesiones) draftPerfil.lesiones = pfLesiones.value;
    if (pfObjetivo) draftPerfil.objetivoCorto = pfObjetivo.value;
    // NOTA: draftPerfil.diasSemana se gestiona exclusivamente por toggle-perfil-dia
    // para evitar que el re-renderizado sobreescriba los clics del usuario.
  }

  // Selector de Tema: Modo Oscuro / Modo Claro / Sistema
  function renderThemeSelector() {
    const current = Store.getThemePreference ? Store.getThemePreference() : 'dark';
    return `
      <div class="theme-selector-group">
        <span class="theme-selector-label">Tema de Interfaz</span>
        <div class="theme-chips">
          <button type="button" class="theme-chip ${current === 'dark' ? 'active' : ''}" data-action="set-theme-pref" data-theme-val="dark" title="Modo Oscuro (Zinc / Negro)">
            Oscuro
          </button>
          <button type="button" class="theme-chip ${current === 'light' ? 'active' : ''}" data-action="set-theme-pref" data-theme-val="light" title="Modo Claro (Clínico)">
            Claro
          </button>
          <button type="button" class="theme-chip ${current === 'system' ? 'active' : ''}" data-action="set-theme-pref" data-theme-val="system" title="Automático según el sistema">
            Sistema
          </button>
        </div>
      </div>
    `;
  }

  // Estado temporal para el constructor de rutinas y selector de catálogo
  let draftRutina = {
    id: null,
    targetUsername: null,
    nombre: '',
    dias: ['Lunes', 'Miércoles', 'Viernes'],
    horario: '19:00',
    ejercicios: []
  };

  // Estado temporal para armar una rutina AMRAP (rutina dentro del día con múltiples ejercicios y tiempo)
  let draftAmrap = {
    nombre: 'Rutina AMRAP del Día',
    tiempoTrabajoSeg: 40,
    tiempoDescansoSeg: 20,
    rondasObjetivo: 4,
    ejercicios: [
      { ejercicioId: 'ej-amrap-kb-swing', nombre: 'Kettlebell Swing (Balanceo con Pesa Rusa - AMRAP)', repsObjetivo: '15 reps' },
      { ejercicioId: 'ej-amrap-thrusters', nombre: 'Thrusters con Mancuernas o Barra (AMRAP)', repsObjetivo: '12 reps' },
      { ejercicioId: 'ej-amrap-burpees', nombre: 'Burpees Atléticos Completos (AMRAP)', repsObjetivo: '10 reps' }
    ]
  };

  let catalogoFiltroGrupo = 'todos';
  let catalogoBusqueda = '';
  let activeGifPreviewId = null;

  // Estado del panel del Profesor (alumno seleccionado actualmente)
  let selectedAlumnoUsername = null;

  const BG_PATTERNS = [
    { id: 'none', nombre: 'Liso (Sin fondo)', preview: 'background: var(--bg-primary);' },
    { id: 'camo', nombre: 'Camuflaje', preview: 'background: linear-gradient(135deg, #1b2417 25%, #24311e 50%, #34442a 75%, #0e130c 100%);' },
    { id: 'basquet', nombre: 'Básquet', preview: 'background: radial-gradient(circle at center, rgba(249,115,22,0.45), #18181b);' },
    { id: 'pesas', nombre: 'Pesas', preview: 'background: linear-gradient(135deg, #27272a, #09090b);' },
    { id: 'carbon', nombre: 'Carbono', preview: 'background: repeating-linear-gradient(45deg, #111115, #111115 4px, #1f1f27 4px, #1f1f27 8px);' },
    { id: 'grid', nombre: 'Cuadrícula', preview: 'background: linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px), #18181b; background-size: 8px 8px;' },
    { id: 'hex', nombre: 'Malla Gym', preview: 'background: radial-gradient(circle, rgba(59,130,246,0.28), #09090b);' }
  ];

  function renderBackgroundPatternSelector(aesPref) {
    const pref = aesPref || (Store.getAestheticPreference ? Store.getAestheticPreference() : {});
    const activePat = pref.bgPattern || 'none';
    const nonePat = BG_PATTERNS[0];
    const restPats = BG_PATTERNS.slice(1);
    return `
      <div style="margin-top: 8px; padding-top: 10px; border-top: 1px dashed var(--border-subtle); display: flex; flex-direction: column; gap: 8px;">
        <span class="theme-selector-label">Tema de Fondo</span>
        <button type="button" class="pattern-chip ${activePat === nonePat.id ? 'active' : ''}" data-action="set-aesthetic-pattern" data-pattern="${nonePat.id}" style="flex-direction: row; justify-content: center; padding: 8px 10px;">
          <span style="width:14px;height:14px;border-radius:4px;border:1px solid var(--border-subtle);${nonePat.preview};display:inline-block;"></span>
          <span>${nonePat.nombre}</span>
        </button>
        <div class="pattern-chips-grid">
          ${restPats.map(p => `
            <button type="button" class="pattern-chip ${activePat === p.id ? 'active' : ''}" data-action="set-aesthetic-pattern" data-pattern="${p.id}">
              <div class="pattern-preview" style="${p.preview}"></div>
              <span>${h(p.nombre)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const GRUPOS_CATALOGO = ['todos', 'activacion', 'movilidad', 'pecho', 'espalda', 'piernas', 'hombros', 'brazos', 'core', 'amrap'];

  // ==========================================
  // SISTEMA DE ÍCONOS MONOCROMÁTICOS (ZINC-400 -> AZUL #2563EB)
  // ==========================================
  function renderIcon(name) {
    const svgs = {
      bolt: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
      clipboard: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>',
      activity: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>',
      chart: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
      settings: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
      bulb: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>',
      eye: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
      clock: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
      copy: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
      plus: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
      check: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
      x: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
      edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
      trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
      arrowLeft: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>',
      arrowRight: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>',
      repeat: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>',
      refresh: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>',
      download: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
      upload: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
      palette: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"></circle><circle cx="17.5" cy="10.5" r=".5"></circle><circle cx="8.5" cy="7.5" r=".5"></circle><circle cx="6.5" cy="12.5" r=".5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>',
      search: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
      calendar: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
      dumbbell: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5h11"></path><path d="M6.5 17.5h11"></path><path d="M6 20v-2a6 6 0 1 1 12 0v2"></path><line x1="3" y1="10" x2="3" y2="14"></line><line x1="21" y1="10" x2="21" y2="14"></line><line x1="7" y1="7" x2="7" y2="17"></line><line x1="17" y1="7" x2="17" y2="17"></line></svg>',
      user: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
      mic: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>',
      camera: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>',
      share: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>',
      sliders: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>',
      chevronDown: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>',
      chevronUp: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>',
      play: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
      shield: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>'
    };
    return `<span class="ui-icon">${svgs[name] || svgs.bolt}</span>`;
  }

  // ==========================================
  // BRANDING FITNESS MINIAPP & SELLO © JF DEVELOPMENT
  // ==========================================
  function renderAppBrand(subtitle = '') {
    return `
      <div class="app-brand-wrapper">
        <svg class="app-logo-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="6" width="88" height="88" rx="20" fill="var(--logo-box-bg, #18181B)" stroke="var(--logo-box-stroke, #2563EB)" stroke-width="4"/>
          <rect x="18" y="36" width="10" height="28" rx="4" fill="var(--logo-dumbbell, #3B82F6)"/>
          <rect x="30" y="28" width="8" height="44" rx="3" fill="var(--logo-dumbbell, #2563EB)"/>
          <rect x="38" y="46" width="24" height="8" rx="2" fill="var(--steel-silver, #A1A1AA)"/>
          <rect x="62" y="28" width="8" height="44" rx="3" fill="var(--logo-dumbbell, #2563EB)"/>
          <rect x="72" y="36" width="10" height="28" rx="4" fill="var(--logo-dumbbell, #3B82F6)"/>
        </svg>
        <div class="app-brand-text">
          <div class="app-brand-title">Fitness MiniApp</div>
          ${subtitle ? `<div class="app-brand-sub">${h(subtitle)}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderJFCopyrightSeal() {
    return `
      <div class="jf-copyright-seal">
        <span>© <strong>JF Development</strong> · Fitness MiniApp</span>
      </div>
    `;
  }

  // ==========================================
  // 1. UTILIDAD DE ESCAPE SEGURO h()
  // ==========================================
  function h(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ==========================================
  // 2. GENERADOR DE FOTOS CON MARCA DE AGUA (CANVAS)
  // ==========================================
  function generarImagenConMarcaDeAgua(file, fechaTexto, pesoKg, autorTexto, callback) {
    const reader = new FileReader();
    reader.onload = function (ev) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        const maxW = 720;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Banda inferior oscura translúcida para la marca de agua
        const bandH = Math.max(48, Math.round(canvas.height * 0.11));
        ctx.fillStyle = 'rgba(7, 9, 14, 0.78)';
        ctx.fillRect(0, canvas.height - bandH, canvas.width, bandH);

        // Sello cian metálico CER con Fecha + Peso
        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold ${Math.max(14, Math.round(bandH * 0.36))}px monospace`;
        const stamp = `${fechaTexto}  •  ${pesoKg ? pesoKg + ' kg' : 'S/P'}  •  ${autorTexto}`;
        ctx.fillText(stamp, 16, canvas.height - Math.round(bandH * 0.34));

        callback(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ==========================================
  // 3. TOASTS CON ACCIÓN "DESHACER"
  // ==========================================
  function showToast(mensaje, options = {}) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';

    let html = `<span>${h(mensaje)}</span>`;
    if (options.action && typeof options.fn === 'function') {
      html += `<button type="button" class="toast-action-btn" data-action="toast-undo">${h(options.action)}</button>`;
    }
    toast.innerHTML = html;

    if (options.action && typeof options.fn === 'function') {
      const btn = toast.querySelector('[data-action="toast-undo"]');
      if (btn) {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          options.fn();
          toast.remove();
        });
      }
    }

    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, options.duration || 4000);
  }

  // ==========================================
  // 4. GRÁFICO SVG DE EVOLUCIÓN HISTÓRICA (1RM vs ESTRÉS/SALUD)
  // ==========================================
  function renderGraficoEvolucionSVG(state, theme = null) {
    const activeTheme = theme || ((typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')) || 'dark');
    const puntos = Engine.computeEvolucionHistorica(state);

    if (puntos.length === 0) {
      return `
        <div style="padding: 20px; text-align: center; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); color: var(--text-dim); font-size: 13px;">
          Todavía no hay registros históricos.<br>
          A medida que guardes tus series o tu estado psicofísico diario, acá vas a ver la curva evolutiva de Fuerza (1RM) y Bienestar.
        </div>
      `;
    }

    const width = 560;
    const height = 210;
    const padL = 44;
    const padR = 40;
    const padT = 26;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const valoresRM = puntos.map(p => p.max1RM || 0);
    const minRM = Math.max(0, Math.min(...valoresRM) - 5);
    const maxRM = Math.max(50, Math.max(...valoresRM) + 10);

    const getX = idx =>
      puntos.length === 1 ? padL + plotW / 2 : padL + (idx / (puntos.length - 1)) * plotW;
    const getYRM = val =>
      padT + plotH - ((val - minRM) / Math.max(1, maxRM - minRM)) * plotH;
    const getYEstres = est => padT + plotH - (((est || 3) - 1) / 4) * plotH;

    const rmPolyline = puntos.map((p, i) => `${getX(i)},${getYRM(p.max1RM)}`).join(' ');
    const estresPolyline = puntos.map((p, i) => `${getX(i)},${getYEstres(p.estres)}`).join(' ');

    const colorRM = activeTheme === 'light' ? '#2563eb' : '#38bdf8';
    const colorEstres = '#ef4444';
    const colorGrid = activeTheme === 'light' ? '#e2e8f0' : '#27272a';
    const colorText = activeTheme === 'light' ? '#475569' : '#a1a1aa';

    return `
      <div style="width: 100%; overflow-x: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; gap: 16px;">
            <span style="color: ${colorRM}; font-weight: 800;">● Fuerza 1RM Estimado (kg)</span>
            <span style="color: ${colorEstres}; font-weight: 800;">--- Nivel de Estrés Diario (1-5)</span>
          </div>
          <span style="color: ${colorText}; font-size: 11px;">Fórmula Epley · Evolución Temporal</span>
        </div>
        <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; display: block;">
          ${[0, 0.5, 1].map(ratio => {
            const y = padT + ratio * plotH;
            const labelRM = Math.round(maxRM - ratio * (maxRM - minRM));
            const labelEst = Math.round(5 - ratio * 4);
            return `
              <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="${colorGrid}" stroke-dasharray="4 4" />
              <text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="${colorText}">${labelRM}kg</text>
              <text x="${width - padR + 6}" y="${y + 4}" text-anchor="start" font-size="10" fill="${colorEstres}">E:${labelEst}</text>
            `;
          }).join('')}
          ${puntos.length > 1 ? `
            <polyline fill="none" stroke="${colorEstres}" stroke-width="2" stroke-dasharray="5 4" points="${estresPolyline}" />
            <polyline fill="none" stroke="${colorRM}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${rmPolyline}" />
          ` : ''}
          ${puntos.map((p, i) => {
            const cx = getX(i);
            const cyRM = getYRM(p.max1RM);
            const cyEst = getYEstres(p.estres);
            return `
              <circle cx="${cx}" cy="${cyEst}" r="4" fill="${colorEstres}" />
              <circle cx="${cx}" cy="${cyRM}" r="5.5" fill="${theme === 'light' ? '#fff' : '#07090e'}" stroke="${colorRM}" stroke-width="2.5" />
              <text x="${cx}" y="${cyRM - 9}" text-anchor="middle" font-size="10" font-weight="800" fill="${theme === 'light' ? '#0f172a' : '#f8fafc'}">${p.max1RM > 0 ? p.max1RM + 'kg' : ''}</text>
              <text x="${cx}" y="${height - 10}" text-anchor="middle" font-size="10" fill="${colorText}">${h(p.fecha.slice(5))}</text>
            `;
          }).join('')}
        </svg>
      </div>
    `;
  }

  // ==========================================
  // 5. PANTALLA DE BIENVENIDA / LOGIN / REGISTRO LIMPIO
  // ==========================================
  function renderAuthView() {
    return `
      <div style="min-height: 94vh; display: flex; align-items: center; justify-content: center; padding: 16px;">
        <div style="width: 100%; max-width: 920px; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; align-items: stretch;">
          
          <!-- Columna 1: Iniciar Sesión o Crear Cuenta (Alumno / Docente) -->
          <div class="card">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
              ${renderAppBrand('Ingreso Personal · Alumno o Docente')}
              <span class="badge badge-blue">v${APP_VERSION}</span>
            </div>

            <p style="font-size: 13px; color: var(--text-muted); line-height: 1.45;">
              Ingresá con tu usuario y contraseña personal, o creá tu cuenta nueva eligiendo si sos <strong>Alumno</strong> o <strong>Docente / Profesor</strong>.
            </p>

            <form data-action="submit-login" style="display: flex; flex-direction: column; gap: 12px;">
              <div class="form-group">
                <label class="form-label" for="login-username">Usuario</label>
                <input type="text" id="login-username" class="form-input" placeholder="Ingresá tu nombre de usuario" required autocomplete="username" autocapitalize="none">
              </div>

              <div class="form-group">
                <label class="form-label" for="login-pin">Contraseña o PIN</label>
                <input type="password" id="login-pin" class="form-input" placeholder="Ingresá tu contraseña o PIN" required>
              </div>

              <button type="submit" class="btn-primary" style="margin-top: 2px;">
                Ingresar con mi Usuario y Contraseña
              </button>

              <button type="button" class="btn-secondary" data-action="login-biometrics" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;">
                ${renderIcon('bolt')} Ingresar con Face ID / Huella Digital
              </button>
            </form>

            <div style="border-top: 1px solid var(--border-subtle); padding-top: 14px; display: flex; flex-direction: column; gap: 8px;">
              <span style="font-size: 12px; font-weight: 700; color: var(--text-main); text-align: center;">
                ¿Sos nuevo o te compartieron este enlace? Elegí tu rol:
              </span>
              <button type="button" class="btn-primary" data-action="open-register-modal">
                + Crear Cuenta Nueva (Elegir Alumno o Docente)
              </button>
            </div>
          </div>

          <!-- Columna 2: Información de Roles y Acceso Rápido de Prueba -->
          <div class="card" style="justify-content: space-between;">
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div class="card-header">
                <h2 class="card-title">¿Cómo funciona Fitness MiniApp?</h2>
                <span class="badge badge-emerald">100% Offline</span>
              </div>

              <div style="display: flex; flex-direction: column; gap: 10px; font-size: 13px; color: var(--text-muted); line-height: 1.5;">
                <div style="background: var(--bg-elevated); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                  <strong style="color: var(--text-main); display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">${renderIcon('user')} Modo Alumno / Atleta (Móvil y PC)</strong>
                  Cada alumno tiene su sesión privada aislada y un <strong>Código Único (ej. GYM-1024)</strong>. Podés armar tu rutina del día con los ejercicios ilustrados (Posición Inicial y Final), editar o quitar cualquier ejercicio, cargar series y registrar tu estado psicofísico.
                </div>
                <div style="background: var(--bg-elevated); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                  <strong style="color: var(--text-main); display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">${renderIcon('clipboard')} Modo Docente / Profesor (Panel Clínico)</strong>
                  Vinculá a tus alumnos con su código único, supervisá su carga semanal, prescribí o editá sus rutinas y registrá observaciones clínicas.
                </div>
              </div>
            </div>

            <div style="border-top: 1px solid var(--border-subtle); padding-top: 12px; display: flex; flex-direction: column; gap: 8px;">
              <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-dim);">
                Cuentas Demo de Prueba Rápida (PIN: 1234):
              </span>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <button type="button" class="btn-secondary" data-action="quick-demo-login" data-username="juan" data-mode="phone-alumno">
                  Demo Alumno (Juan)
                </button>
                <button type="button" class="btn-secondary" data-action="quick-demo-login" data-username="profe" data-mode="pc-profesor">
                  Demo Docente (Profe)
                </button>
              </div>
              ${renderJFCopyrightSeal()}
            </div>
          </div>

        </div>
      </div>
    `;
  }

  // ==========================================
  // 6. SUB-VISTAS DEL ALUMNO (FUNCIONAN EN MÓVIL Y EN PC)
  // ==========================================

  // Helper para renderizar Bloque A, Bloque B o Cierre dentro de la sesión single-page
  function renderBloqueEntrenamientoStep(state, entActivo, cfg, bloqueKey, listaEjercicios, seriesEntreno) {
    const esBloqueCierre = bloqueKey === 'cierre';
    const bloqueCfg = esBloqueCierre
      ? { modalidad: 'horizontal', rondasObjetivo: 3 }
      : (cfg[bloqueKey] || { modalidad: 'horizontal', rondasObjetivo: 3 });
    const modalidad = esBloqueCierre ? 'horizontal' : (bloqueCfg.modalidad || 'horizontal');
    const esVertical = modalidad === 'vertical';
    const rondasObj = Number(bloqueCfg.rondasObjetivo) || 3;
    const ejIds = listaEjercicios.map(item => item.ejercicio.id);
    const progreso = Engine.computeBloqueProgreso(state, entActivo.id, ejIds, rondasObj);

    const catalogoCompleto = [...(state.ejercicios || []), ...(Engine.CATALOGO_EJERCICIOS || [])];
    const martilloEj = esBloqueCierre
      ? catalogoCompleto.find(e => !e.deleted && /martillo/i.test(e.nombre || ''))
      : null;
    const martilloYaAgregado = martilloEj && listaEjercicios.some(item => item.ejercicio.id === martilloEj.id);

    const prevStep = bloqueKey === 'A' ? 'rutina' : (bloqueKey === 'B' ? 'A' : 'B');
    const nextStep = bloqueKey === 'A' ? 'B' : (bloqueKey === 'B' ? 'cierre' : null);
    const prevLabel = bloqueKey === 'A' ? 'Previa' : (bloqueKey === 'B' ? 'Bloque A' : 'Bloque B');
    const nextLabel = bloqueKey === 'A' ? 'Bloque B' : 'Cierre';

    return `
      <div class="card" style="padding: 10px 12px; gap: 6px; flex-shrink: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <h2 class="card-title" style="font-size: 14.5px; margin: 0;">
              ${esBloqueCierre ? 'Cierre (opcional)' : `Bloque ${bloqueKey}`}
            </h2>
            <span class="badge" style="font-family: var(--font-mono); font-size: 10px;">${listaEjercicios.length} ej.</span>
          </div>
          <div style="display: flex; gap: 6px; flex-shrink: 0;">
            <button type="button" class="btn-primary btn-sm" data-action="open-catalog-picker" data-mode="workout" data-bloque="${bloqueKey}" data-filter-group="${esBloqueCierre ? 'brazos' : 'todos'}" style="min-height: 32px; padding: 4px 10px; font-size: 11.5px !important;">
              ${renderIcon('plus')} Catálogo
            </button>
            <button type="button" class="btn-create-ej-inline" data-action="open-create-custom-ejercicio" data-bloque="${bloqueKey}" data-grupo="${esBloqueCierre ? 'brazos' : 'pecho'}" style="min-height: 32px; padding: 4px 10px; font-size: 11.5px;">
              ${renderIcon('plus')} Crear
            </button>
          </div>
        </div>

        ${!esBloqueCierre ? `
          <div class="modulation-toggle">
            <button type="button" class="mod-btn ${!esVertical ? 'active' : ''}" data-action="set-bloque-modalidad" data-bloque="${bloqueKey}" data-modalidad="horizontal">
              <strong>Horizontal</strong>
              <span>Todas las series de 1 ejercicio</span>
            </button>
            <button type="button" class="mod-btn ${esVertical ? 'active' : ''}" data-action="set-bloque-modalidad" data-bloque="${bloqueKey}" data-modalidad="vertical">
              <strong>Vertical (Circuito)</strong>
              <span>1 serie de cada ejercicio por vuelta</span>
            </button>
          </div>

          ${esVertical ? `
            <div class="vertical-round-bar">
              <div style="display: flex; flex-direction: column;">
                <strong style="font-size: 12px; color: var(--accent-emerald);">
                  Vuelta ${progreso.rondaActual} de ${progreso.rondasObjetivo}
                </strong>
                <span style="font-size: 10.5px; color: var(--text-muted);">
                  ${progreso.vueltasCompletadas} completada${progreso.vueltasCompletadas === 1 ? '' : 's'}
                </span>
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                ${[2, 3, 4, 5].map(r => `
                  <button type="button" class="badge ${rondasObj === r ? 'badge-emerald' : ''}" data-action="set-bloque-rondas" data-bloque="${bloqueKey}" data-rondas="${r}" style="cursor: pointer; padding: 4px 8px;">
                    ${r}v
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}
        ` : ''}

        ${martilloEj && !martilloYaAgregado ? `
          <button type="button" class="btn-secondary btn-sm" data-action="quick-add-to-bloque" data-bloque="cierre" data-ejercicio-id="${h(martilloEj.id)}" style="width: 100% !important; min-height: 34px; font-size: 12px !important;">
            ${renderIcon('plus')} Sumar ${h(martilloEj.nombre)}
          </button>
        ` : ''}
      </div>

      <div class="onepage-scroll-list" data-drag-list="sesion">
        ${listaEjercicios.length === 0 ? `
          <div class="card" style="text-align: center; padding: 18px 14px;">
            <p style="font-size: 13px; font-weight: 700; color: var(--text-main);">
              Sin ejercicios en ${esBloqueCierre ? 'Cierre' : `Bloque ${bloqueKey}`}.
            </p>
            <p style="font-size: 11.5px; color: var(--text-dim); margin-top: 2px;">
              ${esBloqueCierre
                ? 'Podés sumar un accesorio final o tocar Terminar.'
                : 'Usá Catálogo o Crear para sumar ejercicios acá.'}
            </p>
          </div>
        ` : listaEjercicios.map((item, idx) => {
            const ej = item.ejercicio;
            const media = Engine.resolveEjercicioMedia(ej);
            const seriesDelEj = seriesEntreno.filter(s => s.ejercicioId === ej.id);
            const prev = Engine.getUltimaSesionEjercicio(state, ej.id, entActivo.id);
            const prevFechaDM = prev && prev.fecha ? `${prev.fecha.slice(8, 10)}/${prev.fecha.slice(5, 7)}` : '';
            const sug = Engine.sugerirProgresion(state, ej.id, { excluirEntrenamientoId: entActivo.id, repsObjetivo: item.targetReps, seriesObjetivo: item.targetSets, equipo: ej.equipo });
            const ultimaHoy = seriesDelEj[seriesDelEj.length - 1];
            const defaultPeso = ultimaHoy ? ultimaHoy.pesoKg : (sug.pesoKg != null ? sug.pesoKg : (prev ? prev.mejor.pesoKg : 20));
            const defaultReps = ultimaHoy ? ultimaHoy.reps : (sug.reps || (prev ? prev.mejor.reps : 10));
            const defaultSeriesCant = seriesDelEj.length > 0 ? seriesDelEj.length : (item.targetSets || ej.seriesSugeridas || 3);
            const yaGuardado = !esVertical && seriesDelEj.length > 0 && !editingEjercicios.has(ej.id);

            return `
              <div class="ej-step-card ${yaGuardado ? 'completo' : ''}" data-drag-id="${h(ej.id)}">
                <div class="ej-card-top">
                  <div class="ej-thumb" data-action="view-ejercicio" data-ejercicio-id="${h(ej.id)}" title="Ver técnica de ${h(ej.nombre)}">
                    ${media.illustrationUrl ? `
                      <img class="ej-thumb-img" src="${h(media.illustrationUrl)}" alt="${h(ej.nombre)}" loading="lazy">
                    ` : `
                      <div class="ej-thumb-fallback">${h((ej.nombre || 'EJ').slice(0, 2).toUpperCase())}</div>
                    `}
                  </div>
                  <div class="ej-info">
                    <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                      <h3 class="ej-title" style="margin: 0;">${idx + 1}. ${h(ej.nombre)}</h3>
                      <span class="badge badge-neon" style="font-size: 9px; padding: 2px 6px;">${h(ej.grupoMuscular)}</span>
                    </div>
                    <div class="ej-clase-anterior">
                      ${prev
                        ? `Última vez (${h(prevFechaDM)}): <strong>${h(prev.texto)}</strong>`
                        : '<span class="primera-vez">Sin registros previos</span>'}
                    </div>
                    ${item.notaProfesor ? `<p class="ej-nota" style="margin-top: 2px;">Nota profe: ${h(item.notaProfesor)}</p>` : ''}
                  </div>
                  <div class="ej-tools">
                    ${!esBloqueCierre ? `
                      <button type="button" class="badge" data-action="move-ej-bloque" data-ejercicio-id="${h(ej.id)}" data-entrenamiento-id="${h(entActivo.id)}" data-target-bloque="${bloqueKey === 'A' ? 'B' : 'A'}" title="Mover al otro bloque" style="cursor: pointer; font-size: 10px;">
                        ${bloqueKey === 'A' ? '→ B' : '→ A'}
                      </button>
                    ` : ''}
                    <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(ej.id)}" title="Ver técnica">${renderIcon('eye')}</button>
                    <button type="button" class="btn-icon-action danger" data-action="delete-sesion-ej" data-ejercicio-id="${h(ej.id)}" data-entrenamiento-id="${h(entActivo.id)}" title="Quitar de hoy">${renderIcon('x')}</button>
                  </div>
                </div>

                ${esVertical ? `
                  <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
                    ${Array.from({ length: Math.max(rondasObj, seriesDelEj.length) }, (_, rIdx) => {
                      const sDone = seriesDelEj[rIdx];
                      return sDone
                        ? `<span class="badge badge-emerald" style="font-size: 10px; font-family: var(--font-mono);">V${rIdx + 1}: ${sDone.pesoKg}x${sDone.reps}</span>`
                        : `<span class="badge" style="font-size: 10px; opacity: 0.65;">V${rIdx + 1}: pend.</span>`;
                    }).join('')}
                    ${seriesDelEj.length > 0 ? `
                      <button type="button" class="btn-link" data-action="delete-all-series-ej" data-ejercicio-id="${h(ej.id)}" data-entrenamiento-id="${h(entActivo.id)}" style="font-size: 10px; color: var(--accent-rose); padding: 0 4px;">
                        Borrar
                      </button>
                    ` : ''}
                  </div>

                  <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; align-items: end;">
                    <div class="ej-input-col">
                      <label class="ej-input-label" for="vert-peso-${bloqueKey}-${h(ej.id)}">KG</label>
                      <input type="number" step="0.5" id="vert-peso-${bloqueKey}-${h(ej.id)}" class="ej-val-input" value="${defaultPeso}" inputmode="decimal">
                    </div>
                    <div class="ej-input-col">
                      <label class="ej-input-label" for="vert-reps-${bloqueKey}-${h(ej.id)}">REPES</label>
                      <input type="number" id="vert-reps-${bloqueKey}-${h(ej.id)}" class="ej-val-input" value="${defaultReps}" inputmode="numeric">
                    </div>
                    <button type="button" class="btn-primary" data-action="save-serie-vertical" data-bloque="${bloqueKey}" data-ejercicio-id="${h(ej.id)}" data-entrenamiento-id="${h(entActivo.id)}" style="height: 40px; min-height: 40px; padding: 0 12px; width: auto; font-size: 12px !important;">
                      + V${seriesDelEj.length + 1}
                    </button>
                  </div>
                ` : `
                  ${yaGuardado ? `
                    <div class="ej-saved-box">
                      <div class="ej-saved-summary">
                        <span style="color: var(--accent-emerald);">${renderIcon('check')}</span>
                        <div class="ej-saved-data">
                          <span style="color: var(--accent-emerald);">Hoy: ${seriesDelEj.length} × ${ultimaHoy.pesoKg} kg</span>
                          <span style="color: var(--text-dim); margin: 0 3px;">·</span>
                          <span>${ultimaHoy.reps} reps</span>
                        </div>
                      </div>
                      <div class="ej-saved-actions">
                        <button type="button" class="btn-sm btn-secondary" data-action="edit-saved-exercise" data-ejercicio-id="${h(ej.id)}" title="Editar">${renderIcon('edit')}</button>
                        <button type="button" class="btn-sm btn-secondary danger" data-action="delete-all-series-ej" data-ejercicio-id="${h(ej.id)}" data-entrenamiento-id="${h(entActivo.id)}" title="Borrar series">${renderIcon('x')}</button>
                      </div>
                    </div>
                  ` : `
                    <div class="ej-input-box">
                      <div class="ej-inputs-3col">
                        <div class="ej-input-col">
                          <label class="ej-input-label" for="bulk-peso-${h(ej.id)}">KG</label>
                          <input type="number" step="0.5" id="bulk-peso-${h(ej.id)}" class="ej-val-input" value="${defaultPeso}" inputmode="decimal" placeholder="0">
                        </div>
                        <div class="ej-input-col">
                          <label class="ej-input-label" for="bulk-reps-${h(ej.id)}">REPES</label>
                          <input type="number" id="bulk-reps-${h(ej.id)}" class="ej-val-input" value="${defaultReps}" inputmode="numeric" placeholder="10">
                        </div>
                        <div class="ej-input-col">
                          <label class="ej-input-label" for="bulk-series-${h(ej.id)}">SERIES</label>
                          <input type="number" id="bulk-series-${h(ej.id)}" class="ej-val-input" value="${defaultSeriesCant}" inputmode="numeric" min="1" max="10">
                        </div>
                      </div>
                      <button type="button" class="btn-primary btn-save-bulk" data-action="save-ejercicio-completo" data-ejercicio-id="${h(ej.id)}" data-entrenamiento-id="${h(entActivo.id)}">
                        ${renderIcon('check')} Guardar series
                      </button>
                    </div>
                  `}
                `}
              </div>
            `;
          }).join('')}
      </div>

      <div style="display: flex; flex-direction: column; gap: 6px; flex-shrink: 0;">
        ${esVertical && listaEjercicios.length > 0 ? `
          <button type="button" class="btn-primary" data-action="complete-vuelta-vertical" data-bloque="${bloqueKey}" data-entrenamiento-id="${h(entActivo.id)}" style="background: var(--accent-emerald); min-height: 40px; font-size: 13px !important;">
            ${renderIcon('repeat')} Completar Vuelta #${progreso.vueltasCompletadas + 1} (1 serie c/u)
          </button>
        ` : ''}
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-secondary" data-action="set-workout-step" data-step="${prevStep}" style="flex: 1; min-height: 40px;">
            ${renderIcon('arrowLeft')} ${prevLabel}
          </button>
          ${nextStep ? `
            <button type="button" class="btn-primary" data-action="set-workout-step" data-step="${nextStep}" style="flex: 1.4; min-height: 40px;">
              ${nextLabel} ${renderIcon('arrowRight')}
            </button>
          ` : `
            <button type="button" class="btn-primary" data-action="finish-workout" data-entrenamiento-id="${h(entActivo.id)}" style="flex: 1.4; min-height: 40px; background: var(--accent-emerald);">
              ${renderIcon('check')} Terminar sesión
            </button>
          `}
        </div>
      </div>
    `;
  }

  // 6.1 Pestaña HOY / ENTRENAR (Check-in Minimalista + Flujo Single-Page)
  function renderAlumnoHoySection(state, user) {
    const activoId = state.entrenamientoActivoId;
    const entActivo = activoId
      ? (state.entrenamientos || []).find(t => t.id === activoId && !t.deleted)
      : null;
    const rutinasActivas = (state.rutinas || []).filter(r => !r.deleted);
    const observacionesRecientes = (state.observaciones || []).filter(o => !o.deleted).slice(0, 1);
    const hoyISO = Engine.todayISO();
    const readinessHoy = (state.readinessLogs || []).find(r => r.fecha === hoyISO && !r.deleted);
    const checkinHoy = Engine.getCheckinGymHoy ? Engine.getCheckinGymHoy(state, hoyISO) : null;

    // SIN SESIÓN ABIERTA: VISTA SINGLE-PAGE CON CHECK-IN LIMPIO + RUTINAS
    if (!entActivo) {
      const hoyInfo = Engine.rutinaParaHoy(state);
      const tieneFicha = Boolean(state.perfil && state.perfil.diasSemana && state.perfil.diasSemana.length > 0);
      const rutinaHoy = hoyInfo.rutina;

      return `
        <div class="onepage-view">
          <div class="hero-checkin-card">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim);">
                ${h(hoyInfo.dia)} · ${hoyInfo.esDiaDeGym ? 'Día de entrenamiento' : 'Día libre'}
              </span>
              ${checkinHoy
                ? `<span class="badge badge-emerald" style="font-size: 10px;">Ingresado ${h(checkinHoy.horaLlegada || '')} hs</span>`
                : (!tieneFicha ? `<button type="button" class="badge badge-blue" data-action="switch-tab" data-tab="salud" style="cursor: pointer; font-size: 10px;">Ficha de salud</button>` : '')}
            </div>

            <div>
              <h2 style="font-size: 18px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">Hola, ${h(user.displayName)}</h2>
              <p style="font-size: 12.5px; color: var(--text-muted); margin-top: 2px;">
                ${checkinHoy
                  ? 'Ya registraste tu ingreso hoy. Podés abrir una nueva sesión abajo.'
                  : 'Registrá tu llegada al gimnasio para empezar la sesión de hoy.'}
              </p>
            </div>

            <button type="button" class="hero-checkin-btn" data-action="checkin-gym-hoy" ${rutinaHoy ? `data-rutina-id="${h(rutinaHoy.id)}"` : ''}>
              ${renderIcon('play')}
              <span>${checkinHoy ? 'Nueva sesión de entrenamiento' : 'Llegué al gimnasio — Empezar sesión'}</span>
            </button>
          </div>

          ${observacionesRecientes.length > 0 ? `
            <div class="card" style="border-left: 3px solid var(--accent-blue); padding: 8px 12px; flex-shrink: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; gap: 8px;">
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>Nota del profe:</strong> ${h(observacionesRecientes[0].texto)}</span>
                <button type="button" class="badge badge-blue" data-action="switch-tab" data-tab="salud" style="flex-shrink: 0;">Ver</button>
              </div>
            </div>
          ` : ''}

          <div class="card" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding: 10px 12px; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-shrink: 0;">
              <span style="font-size: 12.5px; font-weight: 800;">Rutinas (${rutinasActivas.length})</span>
              <div style="display: flex; gap: 6px;">
                <button type="button" class="btn-create-ej-inline" data-action="open-create-custom-ejercicio" style="padding: 5px 9px; font-size: 11px;">
                  ${renderIcon('plus')} Crear ej.
                </button>
                <button type="button" class="btn-sm btn-secondary" data-action="open-rutina-builder" style="min-height: 30px; padding: 4px 9px; font-size: 11px !important;">
                  ${renderIcon('plus')} Rutina
                </button>
              </div>
            </div>

            <div class="onepage-scroll-list">
              ${rutinaHoy ? `
                <div class="rutina-row hoy" style="padding: 9px 10px;">
                  <div style="min-width: 0; flex: 1;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span class="badge badge-blue" style="font-size: 9.5px;">Hoy</span>
                      <h3 style="font-size: 13.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h(rutinaHoy.nombre)}</h3>
                    </div>
                    <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">
                      ${(rutinaHoy.ejercicios || []).length} ejercicios · ${h(rutinaHoy.horario || '19:00')} hs
                    </div>
                  </div>
                  <button type="button" class="btn-primary btn-sm" data-action="start-workout" data-rutina-id="${h(rutinaHoy.id)}" style="min-height: 34px; padding: 4px 12px;">
                    Iniciar
                  </button>
                </div>
              ` : ''}

              ${rutinasActivas.length > 0 ? rutinasActivas.filter(r => !rutinaHoy || r.id !== rutinaHoy.id).map(r => `
                <div class="rutina-row" style="padding: 8px 10px;">
                  <div style="min-width: 0; flex: 1;">
                    <h3 style="font-size: 13px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h(r.nombre)}</h3>
                    <div style="font-size: 11px; color: var(--text-dim);">
                      ${(r.dias || []).map(d => h(d.slice(0, 3))).join(' · ')} · ${(r.ejercicios || []).length} ej.
                    </div>
                  </div>
                  <div style="display: flex; gap: 5px; flex-shrink: 0;">
                    <button type="button" class="btn-icon-action" data-action="edit-rutina" data-rutina-id="${h(r.id)}" title="Editar">${renderIcon('edit')}</button>
                    <button type="button" class="btn-primary btn-sm" data-action="start-workout" data-rutina-id="${h(r.id)}" style="min-height: 32px; padding: 4px 10px;">Iniciar</button>
                  </div>
                </div>
              `).join('') : `
                <div style="padding: 14px; text-align: center; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); font-size: 12px; color: var(--text-muted);">
                  Tocá "Llegué al gimnasio" arriba para armar tu sesión paso a paso.
                </div>
              `}
            </div>
          </div>
        </div>
      `;
    }

    // SESIÓN ACTIVA: PSICOFÍSICO (1 PANTALLA SIN SCROLL) -> RUTINA DE HOY (PREVIA / A / B / CIERRE)
    const rawCfg = entActivo.modulosConfig || {};
    let pasoActual = rawCfg.pasoActual || 'psicofisico';
    if (pasoActual === 'activacion' || pasoActual === 'movilidad') pasoActual = 'rutina';
    const pasosValidos = ['psicofisico', 'rutina', 'A', 'B', 'cierre'];
    if (!pasosValidos.includes(pasoActual)) pasoActual = 'psicofisico';

    const cfg = {
      pasoActual,
      activacionActiva: rawCfg.activacionActiva !== false,
      movilidadActiva: rawCfg.movilidadActiva !== false,
      A: {
        modalidad: (rawCfg.A && rawCfg.A.modalidad) || 'horizontal',
        nombre: (rawCfg.A && rawCfg.A.nombre) || 'Bloque A',
        rondasObjetivo: Number(rawCfg.A && rawCfg.A.rondasObjetivo) || 3
      },
      B: {
        modalidad: (rawCfg.B && rawCfg.B.modalidad) || 'horizontal',
        nombre: (rawCfg.B && rawCfg.B.nombre) || 'Bloque B',
        rondasObjetivo: Number(rawCfg.B && rawCfg.B.rondasObjetivo) || 3
      },
      cierreActivo: rawCfg.cierreActivo !== false
    };

    // PASO 1 DEDICADO: PSICOFÍSICO ULTRA COMPACTO (ZERO SCROLL)
    if (cfg.pasoActual === 'psicofisico') {
      const estSel = draftReadiness.estadoGeneral || (readinessHoy && readinessHoy.estadoGeneral) || 'Bien';
      const estresVal = String(draftReadiness.estres || (readinessHoy && readinessHoy.estres) || '1');
      const suenoVal = String(draftReadiness.sueno || (readinessHoy && readinessHoy.sueno) || '5');
      const alimVal = String(draftReadiness.alimentacion || (readinessHoy && readinessHoy.alimentacion) || '5');

      return `
        <div class="onepage-view">
          <div class="card active-session-bar" style="padding: 10px 12px; flex-shrink: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
              <div>
                <span style="font-size: 10.5px; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em;">Estado psicofísico</span>
                <h2 style="font-size: 16px; font-weight: 800; margin: 1px 0 0 0;">¿Cómo estás hoy?</h2>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                ${readinessHoy ? '<span class="badge badge-emerald" style="font-size: 10px;">Guardado</span>' : ''}
                <button type="button" class="btn-secondary btn-sm" data-action="set-workout-step" data-step="rutina" style="min-height: 32px; padding: 4px 10px;">
                  Ir a rutina
                </button>
              </div>
            </div>
          </div>

          <div class="card" style="flex: 0 0 auto; display: flex; flex-direction: column; padding: 12px; gap: 12px;">
            <div style="display: flex; flex-direction: column; gap: 9px;">
              <div class="psico-compact-row">
                <span class="psico-compact-label">Estado</span>
                <div class="psico-chips">
                  ${[
                    { val: 'Bien', label: 'Bien' },
                    { val: 'Normal', label: 'Normal' },
                    { val: 'Mal', label: 'Mal' }
                  ].map(o => `
                    <button type="button" class="psico-chip ${estSel === o.val ? 'selected' : ''}" data-action="set-psico-chip" data-field="estadoGeneral" data-value="${o.val}">
                      ${o.label}
                    </button>
                  `).join('')}
                </div>
              </div>

              <div class="psico-compact-row">
                <span class="psico-compact-label">Estrés</span>
                <div class="psico-chips">
                  ${[
                    { val: '1', label: 'Bajo' },
                    { val: '3', label: 'Medio' },
                    { val: '5', label: 'Alto' }
                  ].map(o => `
                    <button type="button" class="psico-chip ${estresVal === o.val ? 'selected' : ''}" data-action="set-psico-chip" data-field="estres" data-value="${o.val}">
                      ${o.label}
                    </button>
                  `).join('')}
                </div>
              </div>

              <div class="psico-compact-row">
                <span class="psico-compact-label">Sueño</span>
                <div class="psico-chips">
                  ${[
                    { val: '5', label: 'Bien' },
                    { val: '3', label: 'Regular' },
                    { val: '1', label: 'Mal' }
                  ].map(o => `
                    <button type="button" class="psico-chip ${suenoVal === o.val ? 'selected' : ''}" data-action="set-psico-chip" data-field="sueno" data-value="${o.val}">
                      ${o.label}
                    </button>
                  `).join('')}
                </div>
              </div>

              <div class="psico-compact-row">
                <span class="psico-compact-label">Comida</span>
                <div class="psico-chips">
                  ${[
                    { val: '5', label: 'Bien' },
                    { val: '3', label: 'Regular' },
                    { val: '1', label: 'Mal' }
                  ].map(o => `
                    <button type="button" class="psico-chip ${alimVal === o.val ? 'selected' : ''}" data-action="set-psico-chip" data-field="alimentacion" data-value="${o.val}">
                      ${o.label}
                    </button>
                  `).join('')}
                </div>
              </div>

              <div class="psico-dual-inputs" style="margin-top: 2px;">
                <input type="text" id="step-psico-dolor" class="form-input" value="${h(draftReadiness.zonaDolor || '')}" placeholder="Molestia (opc.)">
                <input type="text" id="step-psico-obs" class="form-input" value="${h(draftReadiness.observacionAlumno || '')}" placeholder="Observación (opc.)">
              </div>
            </div>

            <button type="button" class="btn-primary" data-action="submit-step-psicofisico" style="min-height: 46px;">
              Continuar a la rutina ${renderIcon('arrowRight')}
            </button>
          </div>
        </div>
      `;
    }

    const rutinaAsociada = entActivo.rutinaId
      ? (state.rutinas || []).find(r => r.id === entActivo.rutinaId)
      : null;
    const seriesEntreno = (state.series || []).filter(
      s => s.entrenamientoId === entActivo.id && !s.deleted
    );
    const excluidosSesionMap = (state.ejerciciosExcluidosHoy && state.ejerciciosExcluidosHoy[entActivo.id]) || {};

    // 1. Módulo Activación
    const activacionesHoy = Engine.activacionesDe(state, entActivo.fecha || hoyISO);
    const activacionesExcluidas = state.activacionesExcluidas || {};
    const baseActivacion = (Engine.EJERCICIOS_ACTIVACION_BASE || []).filter(a => !activacionesExcluidas[a.id]);
    const extraActSesion = (state.ejerciciosSesionHoy || [])
      .filter(item => !item.deleted && (!item.entrenamientoId || item.entrenamientoId === entActivo.id) && (item.bloque === 'activacion' || item.segmento === 'activacion') && !activacionesExcluidas[item.ejercicioId])
      .map(item => {
        const ejObj = (state.ejercicios || []).find(e => e.id === item.ejercicioId) || (Engine.CATALOGO_EJERCICIOS || []).find(e => e.id === item.ejercicioId);
        return {
          id: item.ejercicioId,
          nombre: (ejObj && ejObj.nombre) || item.nombre || 'Activación',
          prescripcion: `${item.seriesObjetivo || 2} series × ${item.repsObjetivo || '12'}`,
          foco: (ejObj && ejObj.grupoMuscular) || 'Activación',
          completado: Boolean(item.completado),
          sesionItemId: item.id,
          esPersonalizadoEnSesion: true
        };
      });
    const mapActivacion = new Map();
    baseActivacion.forEach(a => mapActivacion.set(a.id, { ...a, completado: Boolean(activacionesHoy[a.id]) }));
    extraActSesion.forEach(a => {
      const done = Boolean(activacionesHoy[a.id] || a.completado);
      mapActivacion.set(a.id, { ...a, completado: done });
    });
    const listaActivacionHoy = Array.from(mapActivacion.values());
    const actDoneCount = listaActivacionHoy.filter(a => a.completado).length;

    // 2. Módulo Movilidad
    const movilidadHoy = Engine.movilidadDe(state, entActivo.fecha || hoyISO);
    const movIdsSeen = new Set(movilidadHoy.map(m => m.ejercicioId));
    const movExtraSesion = (state.ejerciciosSesionHoy || [])
      .filter(item => !item.deleted && (!item.entrenamientoId || item.entrenamientoId === entActivo.id) && (item.bloque === 'movilidad' || item.segmento === 'movilidad') && !excluidosSesionMap[item.ejercicioId] && !movIdsSeen.has(item.ejercicioId))
      .map(item => {
        const ejObj = (state.ejercicios || []).find(e => e.id === item.ejercicioId) || (Engine.CATALOGO_EJERCICIOS || []).find(e => e.id === item.ejercicioId);
        return {
          id: item.id,
          ejercicioId: item.ejercicioId,
          nombre: (ejObj && ejObj.nombre) || item.nombre || 'Movilidad',
          series: item.seriesObjetivo || 2,
          reps: item.repsObjetivo || '12',
          completado: Boolean(item.completado),
          esSesionItem: true
        };
      });
    const listaMovilidadHoy = [...movilidadHoy, ...movExtraSesion];
    const hayMovilidadPrevia = (state.movilidad || []).some(m => !m.deleted && m.fecha && m.fecha < (entActivo.fecha || hoyISO));

    // 3. Ejercicios principales (Bloque A, Bloque B, Cierre) + AMRAP
    const bloquesAmrapHoy = (state.bloquesAmrap || []).filter(b => !b.deleted);
    let ejerciciosList = [];
    if (rutinaAsociada && Array.isArray(rutinaAsociada.ejercicios)) {
      ejerciciosList = rutinaAsociada.ejercicios
        .filter(re => !excluidosSesionMap[re.ejercicioId])
        .map(re => {
          const ej = (state.ejercicios || []).find(e => e.id === re.ejercicioId)
            || Engine.CATALOGO_EJERCICIOS.find(e => e.id === re.ejercicioId);
          return {
            ejercicio: ej || { id: re.ejercicioId, nombre: re.nombre || 'Ejercicio', grupoMuscular: 'general', equipo: 'barra' },
            bloque: ['A', 'B', 'cierre'].includes(re.bloque) ? re.bloque : 'A',
            targetSets: re.seriesObjetivo || 3,
            targetReps: re.repsObjetivo || '8-10',
            notaProfesor: re.notaProfesor || '',
            sesionItemId: ''
          };
        });
    }

    const idsEnLista = new Set(ejerciciosList.map(item => item.ejercicio.id));
    (state.ejerciciosSesionHoy || [])
      .filter(item => !item.deleted && (!item.entrenamientoId || item.entrenamientoId === entActivo.id) && item.segmento !== 'activacion' && item.segmento !== 'movilidad' && item.bloque !== 'activacion' && item.bloque !== 'movilidad' && !excluidosSesionMap[item.ejercicioId])
      .forEach(item => {
        const resolvedBloque = ['A', 'B', 'cierre'].includes(item.bloque) ? item.bloque : 'A';
        const existingIdx = ejerciciosList.findIndex(x => x.ejercicio.id === item.ejercicioId);
        const ej = (state.ejercicios || []).find(e => e.id === item.ejercicioId)
          || Engine.CATALOGO_EJERCICIOS.find(e => e.id === item.ejercicioId);
        if (existingIdx >= 0 && ej) {
          ejerciciosList[existingIdx] = {
            ejercicio: ej,
            bloque: resolvedBloque,
            targetSets: item.seriesObjetivo || ejerciciosList[existingIdx].targetSets || 3,
            targetReps: item.repsObjetivo || ejerciciosList[existingIdx].targetReps || '8-10',
            notaProfesor: item.notas || ejerciciosList[existingIdx].notaProfesor || '',
            sesionItemId: item.id
          };
        } else if (!idsEnLista.has(item.ejercicioId) && ej) {
          idsEnLista.add(ej.id);
          ejerciciosList.push({
            ejercicio: ej,
            bloque: resolvedBloque,
            targetSets: item.seriesObjetivo || ej.seriesSugeridas || 3,
            targetReps: item.repsObjetivo || ej.repsSugeridas || '8-10',
            notaProfesor: item.notas || '',
            sesionItemId: item.id
          });
        }
      });

    seriesEntreno.forEach(s => {
      if (!idsEnLista.has(s.ejercicioId) && !excluidosSesionMap[s.ejercicioId]) {
        const ej = (state.ejercicios || []).find(e => e.id === s.ejercicioId)
          || Engine.CATALOGO_EJERCICIOS.find(e => e.id === s.ejercicioId);
        if (ej && ej.grupoMuscular !== 'movilidad' && ej.grupoMuscular !== 'activacion') {
          idsEnLista.add(ej.id);
          ejerciciosList.push({
            ejercicio: ej,
            bloque: 'A',
            targetSets: ej.seriesSugeridas || 3,
            targetReps: ej.repsSugeridas || '8-10',
            notaProfesor: '',
            sesionItemId: ''
          });
        }
      }
    });

    ejerciciosList = Engine.aplicarOrdenSesion(state, entActivo.id, ejerciciosList);
    const ejerciciosBloqueA = ejerciciosList.filter(x => x.bloque === 'A');
    const ejerciciosBloqueB = ejerciciosList.filter(x => x.bloque === 'B');
    const ejerciciosCierre = ejerciciosList.filter(x => x.bloque === 'cierre');
    const bloqueParaCrear = ['A', 'B', 'cierre'].includes(cfg.pasoActual) ? cfg.pasoActual : 'A';
    const estadoLabel = (readinessHoy && readinessHoy.estadoGeneral) || draftReadiness.estadoGeneral || 'Registrar';

    // Contenido de Rutina / Bloque A / Bloque B / Cierre
    let stepBodyHtml = '';
    if (cfg.pasoActual === 'rutina') {
      stepBodyHtml = `
        <div style="display: flex; flex-direction: column; gap: 6px; flex-shrink: 0;">
          <div class="toggle-pill-row">
            <div>
              <strong style="font-size: 13px;">Activación</strong>
              <div style="font-size: 11px; color: var(--text-dim);">Entrada en calor previa</div>
            </div>
            <div class="toggle-seg">
              <button type="button" class="toggle-seg-btn ${!cfg.activacionActiva ? 'active' : ''}" data-action="set-module-active" data-module="activacion" data-active="0">No</button>
              <button type="button" class="toggle-seg-btn ${cfg.activacionActiva ? 'active' : ''}" data-action="set-module-active" data-module="activacion" data-active="1">Sí</button>
            </div>
          </div>

          <div class="toggle-pill-row">
            <div>
              <strong style="font-size: 13px;">Movilidad</strong>
              <div style="font-size: 11px; color: var(--text-dim);">Movilidad articular inicial</div>
            </div>
            <div class="toggle-seg">
              <button type="button" class="toggle-seg-btn ${!cfg.movilidadActiva ? 'active' : ''}" data-action="set-module-active" data-module="movilidad" data-active="0">No</button>
              <button type="button" class="toggle-seg-btn ${cfg.movilidadActiva ? 'active' : ''}" data-action="set-module-active" data-module="movilidad" data-active="1">Sí</button>
            </div>
          </div>
        </div>

        <div class="onepage-scroll-list">
          ${!cfg.activacionActiva && !cfg.movilidadActiva ? `
            <div class="card" style="text-align: center; padding: 18px 14px;">
              <p style="font-size: 13px; font-weight: 700; color: var(--text-main);">Sin activación ni movilidad previa.</p>
              <p style="font-size: 11.5px; color: var(--text-dim); margin-top: 2px;">Podés pasar directo al Bloque A o activar alguno arriba.</p>
            </div>
          ` : ''}

          ${cfg.activacionActiva ? `
            <div class="card" style="padding: 10px 12px; gap: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                <strong style="font-size: 12.5px;">Activación (${actDoneCount}/${listaActivacionHoy.length})</strong>
                <div style="display: flex; gap: 5px;">
                  <button type="button" class="btn-primary btn-sm" data-action="open-catalog-picker" data-mode="workout" data-bloque="activacion" data-filter-group="activacion" style="min-height: 28px; padding: 3px 8px; font-size: 11px !important;">
                    ${renderIcon('plus')} Agregar
                  </button>
                  <button type="button" class="btn-create-ej-inline" data-action="open-create-custom-ejercicio" data-bloque="activacion" data-grupo="activacion" style="min-height: 28px; padding: 3px 8px; font-size: 11px;">
                    ${renderIcon('plus')} Crear
                  </button>
                </div>
              </div>
              ${listaActivacionHoy.length === 0 ? `
                <p style="font-size: 11.5px; color: var(--text-dim); margin: 4px 0;">Sin ejercicios de activación cargados.</p>
              ` : listaActivacionHoy.map(act => {
                const ejRef = (state.ejercicios || []).find(e => e.id === act.id) || (Engine.CATALOGO_EJERCICIOS || []).find(e => e.id === act.id);
                const media = ejRef ? Engine.resolveEjercicioMedia(ejRef) : {};
                return `
                  <div class="ej-step-card" style="padding: 7px 9px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <button type="button" class="badge ${act.completado ? 'badge-emerald' : ''}" data-action="toggle-act-mov-done" data-ejercicio-id="${h(act.id)}" data-entrenamiento-id="${h(entActivo.id)}" style="cursor: pointer; min-width: 28px; height: 28px; justify-content: center;">
                        ${act.completado ? renderIcon('check') : ''}
                      </button>
                      ${media.illustrationUrl ? `<img src="${h(media.illustrationUrl)}" alt="${h(act.nombre)}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover; flex-shrink: 0;">` : ''}
                      <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 12.5px; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h(act.nombre)}</div>
                        <div style="font-size: 10.5px; color: var(--text-dim);">${h(act.prescripcion || '')}</div>
                      </div>
                      <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(act.id)}" title="Ver técnica">${renderIcon('eye')}</button>
                      <button type="button" class="btn-icon-action danger" data-action="${act.esPersonalizadoEnSesion ? 'delete-sesion-ej' : 'delete-activacion'}" data-act-id="${h(act.id)}" data-ejercicio-id="${h(act.id)}" data-entrenamiento-id="${h(entActivo.id)}" title="Quitar">${renderIcon('x')}</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}

          ${cfg.movilidadActiva ? `
            <div class="card" style="padding: 10px 12px; gap: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                <strong style="font-size: 12.5px;">Movilidad (${listaMovilidadHoy.length})</strong>
                <div style="display: flex; gap: 5px;">
                  <button type="button" class="btn-primary btn-sm" data-action="open-catalog-picker" data-mode="workout" data-bloque="movilidad" data-filter-group="movilidad" style="min-height: 28px; padding: 3px 8px; font-size: 11px !important;">
                    ${renderIcon('plus')} Agregar
                  </button>
                  <button type="button" class="btn-create-ej-inline" data-action="open-create-custom-ejercicio" data-bloque="movilidad" data-grupo="movilidad" style="min-height: 28px; padding: 3px 8px; font-size: 11px;">
                    ${renderIcon('plus')} Crear
                  </button>
                </div>
              </div>
              ${hayMovilidadPrevia && listaMovilidadHoy.length === 0 ? `
                <button type="button" class="btn-secondary btn-sm" data-action="repeat-last-movilidad" style="width: 100% !important; min-height: 30px; font-size: 11.5px !important;">
                  ${renderIcon('refresh')} Repetir movilidad de la última sesión
                </button>
              ` : ''}
              ${listaMovilidadHoy.length === 0 ? `
                <p style="font-size: 11.5px; color: var(--text-dim); margin: 4px 0;">Sin ejercicios de movilidad cargados.</p>
              ` : listaMovilidadHoy.map(m => {
                const ejRef = (state.ejercicios || []).find(e => e.id === m.ejercicioId) || (Engine.CATALOGO_EJERCICIOS || []).find(e => e.id === m.ejercicioId);
                const media = ejRef ? Engine.resolveEjercicioMedia(ejRef) : {};
                return `
                  <div class="ej-step-card" style="padding: 7px 9px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <button type="button" class="badge ${m.completado ? 'badge-emerald' : ''}" data-action="toggle-act-mov-done" data-mov-id="${h(m.esSesionItem ? '' : m.id)}" data-ejercicio-id="${h(m.ejercicioId)}" data-entrenamiento-id="${h(entActivo.id)}" style="cursor: pointer; min-width: 28px; height: 28px; justify-content: center;">
                        ${m.completado ? renderIcon('check') : ''}
                      </button>
                      ${media.illustrationUrl ? `<img src="${h(media.illustrationUrl)}" alt="${h(m.nombre)}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover; flex-shrink: 0;">` : ''}
                      <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 12.5px; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h(m.nombre)}</div>
                        <div style="font-size: 10.5px; color: var(--text-dim);">${m.series || 2} series × ${h(m.reps || '12')} reps</div>
                      </div>
                      <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(m.ejercicioId)}" title="Ver técnica">${renderIcon('eye')}</button>
                      <button type="button" class="btn-icon-action danger" data-action="${m.esSesionItem ? 'delete-sesion-ej' : 'delete-movilidad'}" data-mov-id="${h(m.id)}" data-ejercicio-id="${h(m.ejercicioId)}" data-entrenamiento-id="${h(entActivo.id)}" title="Quitar">${renderIcon('x')}</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}

          ${bloquesAmrapHoy.map(b => `
            <div class="amrap-card" style="padding: 10px 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                <div>
                  <span class="badge badge-neon" style="font-size: 10px;">AMRAP</span>
                  <strong style="font-size: 13px; margin-left: 6px;">${h(b.nombre)} (${b.rondasCompletadas || 0}/${b.rondasObjetivo || 4})</strong>
                </div>
                <button type="button" class="btn-serie-completa btn-sm" data-action="complete-amrap-round" data-amrap-id="${h(b.id)}" style="min-height: 28px; padding: 3px 9px; font-size: 11px !important;">
                  +1 Ronda
                </button>
              </div>
            </div>
          `).join('')}
        </div>

        <div style="display: flex; gap: 8px; flex-shrink: 0;">
          <button type="button" class="btn-secondary" data-action="set-workout-step" data-step="psicofisico" style="flex: 1; min-height: 42px;">
            ${renderIcon('arrowLeft')} Psicofísico
          </button>
          <button type="button" class="btn-primary" data-action="set-workout-step" data-step="A" style="flex: 1.5; min-height: 42px;">
            Ir a Bloque A ${renderIcon('arrowRight')}
          </button>
        </div>
      `;
    } else if (cfg.pasoActual === 'A') {
      stepBodyHtml = renderBloqueEntrenamientoStep(state, entActivo, cfg, 'A', ejerciciosBloqueA, seriesEntreno);
    } else if (cfg.pasoActual === 'B') {
      stepBodyHtml = renderBloqueEntrenamientoStep(state, entActivo, cfg, 'B', ejerciciosBloqueB, seriesEntreno);
    } else if (cfg.pasoActual === 'cierre') {
      stepBodyHtml = renderBloqueEntrenamientoStep(state, entActivo, cfg, 'cierre', ejerciciosCierre, seriesEntreno);
    }

    return `
      <div class="onepage-view">
        <div class="card active-session-bar" style="padding: 9px 10px; gap: 8px; flex-shrink: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <h2 class="active-session-title" style="margin: 0; font-size: 15px; font-weight: 800; min-width: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${h(rutinaAsociada ? rutinaAsociada.nombre : 'Rutina de hoy')}
            </h2>
            <button type="button" class="badge ${readinessHoy ? 'badge-emerald' : 'badge-neon'}" data-action="set-workout-step" data-step="psicofisico" style="cursor: pointer; font-size: 10.5px; flex-shrink: 0;">
              Estado: ${h(estadoLabel)}
            </button>
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px;">
            <button type="button" class="btn-secondary btn-sm" data-action="open-create-custom-ejercicio" data-bloque="${h(bloqueParaCrear)}" title="Crear ejercicio nuevo" style="min-height: 32px; padding: 4px 6px; font-size: 11.5px !important; gap: 4px;">
              ${renderIcon('plus')} Crear ej.
            </button>
            <button type="button" class="btn-secondary btn-sm" data-action="save-today-as-routine" title="Guardar rutina" style="min-height: 32px; padding: 4px 6px; font-size: 11.5px !important;">
              Guardar rutina
            </button>
            <button type="button" class="btn-primary btn-sm" data-action="finish-workout" data-entrenamiento-id="${h(entActivo.id)}" style="min-height: 32px; padding: 4px 6px; font-size: 11.5px !important;">
              Terminar
            </button>
          </div>

          <div class="workout-stepper" role="tablist">
            <button type="button" class="step-pill ${cfg.pasoActual === 'rutina' ? 'active' : ''}" data-action="set-workout-step" data-step="rutina">
              <span class="step-pill-label">Previa</span>
              <span class="step-pill-sub">Inicio</span>
            </button>
            <button type="button" class="step-pill ${cfg.pasoActual === 'A' ? 'active' : ''} ${ejerciciosBloqueA.some(item => seriesEntreno.some(s => s.ejercicioId === item.ejercicio.id)) ? 'done' : ''}" data-action="set-workout-step" data-step="A">
              <span class="step-pill-label">Bloque A</span>
              <span class="step-pill-sub">${ejerciciosBloqueA.length} ej.</span>
            </button>
            <button type="button" class="step-pill ${cfg.pasoActual === 'B' ? 'active' : ''} ${ejerciciosBloqueB.some(item => seriesEntreno.some(s => s.ejercicioId === item.ejercicio.id)) ? 'done' : ''}" data-action="set-workout-step" data-step="B">
              <span class="step-pill-label">Bloque B</span>
              <span class="step-pill-sub">${ejerciciosBloqueB.length} ej.</span>
            </button>
            <button type="button" class="step-pill ${cfg.pasoActual === 'cierre' ? 'active' : ''} ${ejerciciosCierre.some(item => seriesEntreno.some(s => s.ejercicioId === item.ejercicio.id)) ? 'done' : ''}" data-action="set-workout-step" data-step="cierre">
              <span class="step-pill-label">Cierre</span>
              <span class="step-pill-sub">${ejerciciosCierre.length} ej.</span>
            </button>
          </div>
        </div>

        ${stepBodyHtml}
      </div>
    `;
  }

  // 6.2 Pestaña MIS RUTINAS & CATÁLOGO ESTANDARIZADO COMPLETO (One-Page con pestañas internas)
  function renderAlumnoRutinasSection(state) {
    const rutinas = (state.rutinas || []).filter(r => !r.deleted);
    const catalogo = (state.ejercicios || []).filter(e => !e.deleted);

    return `
      <div class="onepage-view">
        <div class="card onepage-card" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;">
          <div class="onepage-tabs-bar" style="flex-shrink: 0;">
            <button type="button" class="onepage-tab-btn ${rutinasSubTab === 'rutinas' ? 'active' : ''}" data-action="set-rutinas-subtab" data-subtab="rutinas">
              Mis Rutinas (${rutinas.length})
            </button>
            <button type="button" class="onepage-tab-btn ${rutinasSubTab === 'catalogo' ? 'active' : ''}" data-action="set-rutinas-subtab" data-subtab="catalogo">
              Catálogo (${catalogo.length})
            </button>
          </div>

          ${rutinasSubTab === 'rutinas' ? `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0;">
              <div>
                <h2 class="card-title" style="font-size: 15px; color: var(--text-main);">Mis Rutinas</h2>
                <p style="font-size: 11px; color: var(--text-dim);">Elegí días, horario y ejercicios.</p>
              </div>
              <div style="display: flex; gap: 6px;">
                <button type="button" class="btn-secondary btn-sm" data-action="open-amrap-builder">
                  + AMRAP
                </button>
                <button type="button" class="btn-primary btn-sm" data-action="open-rutina-builder">
                  ${renderIcon('plus')} Nueva Rutina
                </button>
              </div>
            </div>

            ${rutinas.length === 0 ? `
              <div style="padding: 18px; text-align: center; background: var(--bg-elevated); border-radius: var(--radius-md); color: var(--text-dim); font-size: 12.5px;">
                Todavía no tenés rutinas creadas. Tocá <strong>"Nueva Rutina"</strong> para armar tu plan.
              </div>
            ` : `
              <div class="onepage-scroll-list">
                ${rutinas.map(r => `
                  <div style="background: var(--bg-elevated); border-radius: var(--radius-md); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">
                      <div>
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                          <h3 style="font-size: 14.5px; font-weight: 800; color: var(--text-main);">${h(r.nombre)}</h3>
                          <span class="badge badge-neon">${h(r.horario || '19:00')} hs</span>
                        </div>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">
                          ${(r.dias || []).map(d => `<span class="badge" style="background: var(--bg-card); color: var(--text-muted); font-size: 9.5px; padding: 2px 6px;">${h(d.slice(0, 3))}</span>`).join('')}
                        </div>
                      </div>
                      <div style="display: flex; gap: 4px;">
                        <button type="button" class="btn-secondary btn-sm" data-action="open-catalog-picker" data-mode="append-to-rutina" data-rutina-id="${h(r.id)}">
                          + Ej.
                        </button>
                        <button type="button" class="btn-secondary btn-sm" data-action="edit-rutina" data-rutina-id="${h(r.id)}" title="Editar">
                          ${renderIcon('edit')}
                        </button>
                        <button type="button" class="btn-secondary btn-sm" data-action="delete-rutina" data-rutina-id="${h(r.id)}" title="Borrar">
                          ${renderIcon('x')}
                        </button>
                      </div>
                    </div>

                    ${(r.ejercicios || []).length === 0 ? `
                      <p style="font-size: 11.5px; color: var(--text-dim);">Sin ejercicios todavía. Tocá "+ Ej." para elegir del catálogo.</p>
                    ` : `
                      <div style="display: flex; flex-direction: column; gap: 4px;">
                        ${r.ejercicios.map((re, idx) => {
                          const ej = (state.ejercicios || []).find(e => e.id === re.ejercicioId)
                            || Engine.CATALOGO_EJERCICIOS.find(e => e.id === re.ejercicioId)
                            || { nombre: re.nombre || re.ejercicioId, grupoMuscular: '', equipo: '' };
                          return `
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; background: var(--bg-card); padding: 6px 10px; border-radius: var(--radius-sm);">
                              <div style="min-width: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                <strong style="color: var(--text-main);">${idx + 1}. ${h(ej ? ej.nombre : re.ejercicioId)}</strong>
                              </div>
                              <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); font-weight: 700;">
                                  ${re.seriesObjetivo}×${h(re.repsObjetivo)}
                                </span>
                                <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(re.ejercicioId)}" title="Ver técnica">${renderIcon('eye')}</button>
                                <button type="button" data-action="remove-ej-from-rutina" data-rutina-id="${h(r.id)}" data-index="${idx}" style="color: var(--text-dim); padding: 0 4px;" title="Quitar">${renderIcon('x')}</button>
                              </div>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    `}
                  </div>
                `).join('')}
              </div>
            `}
          ` : `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0;">
              <h3 class="card-title" style="font-size: 15px; color: var(--text-main);">Catálogo de Ejercicios</h3>
              <button type="button" class="btn-create-ej-inline" data-action="open-create-custom-ejercicio">
                ${renderIcon('plus')} Crear Ejercicio
              </button>
            </div>

          <div class="day-chips" style="overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px;">
            ${GRUPOS_CATALOGO.map(g => `
              <button type="button" class="day-chip ${catalogoFiltroGrupo === g ? 'selected' : ''}" data-action="filter-catalog-group" data-group="${g}" style="flex-shrink: 0; padding: 5px 10px; font-size: 11px !important;">
                ${g.toUpperCase()}
              </button>
            `).join('')}
          </div>

          <div class="onepage-scroll-list">
            ${catalogo
              .filter(e => catalogoFiltroGrupo === 'todos' || e.grupoMuscular === catalogoFiltroGrupo)
              .map(e => {
                const media = Engine.resolveEjercicioMedia(e);
                return `
                  <div style="background: var(--bg-elevated); border-radius: var(--radius-md); padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                    <div class="ej-thumb" data-action="view-ejercicio" data-ejercicio-id="${h(e.id)}" style="width: 42px; height: 42px;">
                      ${media.illustrationUrl ? `<img class="ej-thumb-img" src="${h(media.illustrationUrl)}" alt="${h(e.nombre)}" loading="lazy">` : `<div class="ej-thumb-fallback">${h((e.nombre || 'EJ').slice(0, 2).toUpperCase())}</div>`}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                      <h4 style="font-size: 13px; font-weight: 800; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h(e.nombre)}</h4>
                      <span style="font-size: 10.5px; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">${h(e.grupoMuscular)} · ${h(e.equipo)}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                      <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(e.id)}" title="Ver técnica">${renderIcon('eye')}</button>
                      <button type="button" class="badge badge-neon" data-action="add-catalog-to-today" data-ejercicio-id="${h(e.id)}" style="cursor: pointer; padding: 5px 9px;">
                        + Hoy
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
          </div>
        `}
        </div>
      </div>
    `;
  }

  // 6.2b Pestaña HISTÓRICO: ORGANIZADO POR CLASE Y POR EJERCICIO (SOLO EJERCICIOS REALIZADOS)
  function renderAlumnoHistoricoSection(state, user) {
    const todosEjerciciosMap = new Map();
    [...(state.ejercicios || []), ...Engine.CATALOGO_EJERCICIOS].forEach(e => {
      if (e && e.id && !e.deleted && !todosEjerciciosMap.has(e.id)) {
        todosEjerciciosMap.set(e.id, e);
      }
    });

    const seriesActivas = (state.series || []).filter(s => !s.deleted && s.completada);
    const volumenTotal = seriesActivas.reduce((acc, s) => acc + Engine.computeVolumenSerie(s), 0);

    // 1. Construir lista de EJERCICIOS REALIZADOS (jamás mostrar ejercicios que nunca hizo)
    const ejerciciosRealizados = [];
    todosEjerciciosMap.forEach(ej => {
      const historial = Engine.getHistorialCompletoEjercicio(state, ej.id);
      if (historial && historial.length > 0) {
        const prev = Engine.getUltimaSesionEjercicio(state, ej.id);
        const totalSeries = historial.reduce((acc, hItem) => acc + (hItem.series ? hItem.series.length : 0), 0);
        let mejorPeso = 0;
        let mejorReps = 0;
        historial.forEach(hItem => {
          if (hItem.mejorSerie && (hItem.mejorSerie.pesoKg > mejorPeso || (hItem.mejorSerie.pesoKg === mejorPeso && hItem.mejorSerie.reps > mejorReps))) {
            mejorPeso = hItem.mejorSerie.pesoKg;
            mejorReps = hItem.mejorSerie.reps;
          }
        });
        ejerciciosRealizados.push({
          ej,
          historial,
          prev,
          totalClases: historial.length,
          totalSeries,
          mejorPeso,
          mejorReps,
          ultimaFecha: (prev && prev.fecha) || (historial[0] && historial[0].fecha) || ''
        });
      }
    });

    // Ordenar ejercicios realizados: primero los más recientes y con más clases
    ejerciciosRealizados.sort((a, b) => {
      const cmp = (b.ultimaFecha || '').localeCompare(a.ultimaFecha || '');
      if (cmp !== 0) return cmp;
      return b.totalClases - a.totalClases;
    });

    // 2. Construir lista de CLASES REALIZADAS (con los ejercicios hechos en cada clase)
    const entrenamientosMap = new Map();
    (state.entrenamientos || []).filter(t => !t.deleted).forEach(t => entrenamientosMap.set(t.id, t));

    const seriesPorEntreno = new Map();
    seriesActivas.forEach(s => {
      if (!seriesPorEntreno.has(s.entrenamientoId)) {
        seriesPorEntreno.set(s.entrenamientoId, []);
      }
      seriesPorEntreno.get(s.entrenamientoId).push(s);
    });

    const clasesRealizadas = [];
    seriesPorEntreno.forEach((sList, entId) => {
      const ent = entrenamientosMap.get(entId);
      const fecha = (ent && ent.fecha) || (sList[0] && sList[0].fecha) || Engine.todayISO();
      const rutina = ent && ent.rutinaId ? (state.rutinas || []).find(r => r.id === ent.rutinaId) : null;
      const nombreClase = (ent && ent.nombre) || (rutina && rutina.nombre) || 'Sesión de entrenamiento';

      // Agrupar por ejercicio dentro de esta clase
      const porEjMap = new Map();
      sList.forEach(s => {
        if (!porEjMap.has(s.ejercicioId)) porEjMap.set(s.ejercicioId, []);
        porEjMap.get(s.ejercicioId).push(s);
      });

      const detalleEjercicios = [];
      porEjMap.forEach((ejSeries, ejId) => {
        const ejObj = todosEjerciciosMap.get(ejId) || { id: ejId, nombre: 'Ejercicio', grupoMuscular: 'fuerza', equipo: 'peso' };
        const mejor = ejSeries.reduce((best, cur) => {
          if (!best) return cur;
          return Engine.compute1RM(cur.pesoKg, cur.reps) >= Engine.compute1RM(best.pesoKg, best.reps) ? cur : best;
        }, ejSeries[0]);
        detalleEjercicios.push({
          ej: ejObj,
          cantidadSeries: ejSeries.length,
          pesoKg: mejor ? mejor.pesoKg : 0,
          reps: mejor ? mejor.reps : 0
        });
      });

      const volClase = sList.reduce((acc, s) => acc + Engine.computeVolumenSerie(s), 0);
      clasesRealizadas.push({
        id: entId,
        fecha,
        hora: (ent && ent.inicio) || '',
        nombre: nombreClase,
        totalSeries: sList.length,
        volumen: volClase,
        ejercicios: detalleEjercicios
      });
    });

    clasesRealizadas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    const q = (historialBusqueda || '').toLowerCase().trim();
    const ejerciciosFiltrados = ejerciciosRealizados.filter(item => {
      if (!q) return true;
      return (item.ej.nombre || '').toLowerCase().includes(q) || (item.ej.grupoMuscular || '').toLowerCase().includes(q);
    });

    const clasesFiltradas = clasesRealizadas.filter(cl => {
      if (!q) return true;
      if ((cl.nombre || '').toLowerCase().includes(q) || (cl.fecha || '').includes(q)) return true;
      return cl.ejercicios.some(d => (d.ej.nombre || '').toLowerCase().includes(q) || (d.ej.grupoMuscular || '').toLowerCase().includes(q));
    });

    return `
      <div class="onepage-view">
        <div class="card onepage-card" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;">
          <!-- Cabecera Compacta con KPIs en línea -->
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0;">
            <div>
              <h2 class="card-title" style="font-size: 16px; color: var(--text-main);">Mi Histórico</h2>
              <p style="font-size: 11px; color: var(--text-dim);">Solo tus clases y ejercicios realizados.</p>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <span class="badge badge-neon">${clasesRealizadas.length} clases</span>
              <span class="badge badge-blue" style="font-family: var(--font-mono);">${Math.round(volumenTotal).toLocaleString()} kg</span>
            </div>
          </div>

        <!-- Selector Organizar por Clase vs Ver por Ejercicio -->
        <div class="onepage-tabs-bar" style="flex-shrink: 0;">
          <button type="button" class="onepage-tab-btn ${historicoModo === 'clases' ? 'active' : ''}" data-action="set-historico-modo" data-modo="clases">
            Por Clase (${clasesRealizadas.length})
          </button>
          <button type="button" class="onepage-tab-btn ${historicoModo === 'ejercicios' ? 'active' : ''}" data-action="set-historico-modo" data-modo="ejercicios">
            Por Ejercicio (${ejerciciosRealizados.length})
          </button>
        </div>

        <!-- Buscador instantáneo -->
        <div style="position: relative; flex-shrink: 0;">
          <input type="text" id="historial-search-input" class="form-input" placeholder="${historicoModo === 'clases' ? 'Filtrar clase o ejercicio...' : 'Buscar ejercicio realizado...'}" value="${h(historialBusqueda)}" data-action="search-historial" style="min-height: 36px; font-size: 16px; padding: 6px 32px 6px 10px;">
          ${historialBusqueda ? `
            <button type="button" data-action="clear-historial-search" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 2px 6px;">${renderIcon('x')}</button>
          ` : ''}
        </div>

        <!-- Listado según modo elegido -->
        <div class="onepage-scroll-list">
          ${historicoModo === 'clases' ? (
            clasesFiltradas.length === 0 ? `
              <div style="text-align: center; padding: 20px 12px; color: var(--text-dim); font-size: 12.5px;">
                ${clasesRealizadas.length === 0
                  ? 'Todavía no tenés clases registradas. Cuando guardes series en Entrenar, aparecerán acá organizadas por clase.'
                  : `No se encontraron clases con "${h(historialBusqueda)}".`}
              </div>
            ` : clasesFiltradas.map(cl => {
              const fechaFmt = cl.fecha ? cl.fecha.split('-').reverse().join('/') : 'Clase';
              return `
                <div class="historico-ej-card" style="padding: 10px 12px; gap: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div>
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <strong style="font-size: 13.5px; color: var(--text-main);">${h(fechaFmt)}</strong>
                        <span class="badge badge-neon">${cl.ejercicios.length} ej. · ${cl.totalSeries} series</span>
                      </div>
                      <div style="font-size: 12px; color: var(--text-muted); font-weight: 600; margin-top: 2px;">
                        ${h(cl.nombre)}
                      </div>
                    </div>
                    <span class="badge badge-blue" style="font-family: var(--font-mono); font-size: 11px;">
                      ${Math.round(cl.volumen).toLocaleString()} kg
                    </span>
                  </div>

                  <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px dashed var(--border-subtle); padding-top: 6px;">
                    ${cl.ejercicios.map(det => {
                      const media = Engine.resolveEjercicioMedia(det.ej);
                      return `
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--bg-elevated); padding: 6px 8px; border-radius: var(--radius-sm); font-size: 12px;">
                          <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                            <div class="ej-thumb" data-action="view-ejercicio" data-ejercicio-id="${h(det.ej.id)}" style="width: 32px; height: 32px; border-radius: 6px;">
                              ${media.illustrationUrl ? `<img class="ej-thumb-img" src="${h(media.illustrationUrl)}" alt="${h(det.ej.nombre)}" loading="lazy">` : `<div class="ej-thumb-fallback" style="font-size: 12px;">${h((det.ej.nombre || 'EJ').slice(0, 2).toUpperCase())}</div>`}
                            </div>
                            <strong style="color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h(det.ej.nombre)}</strong>
                          </div>
                          <span style="font-family: var(--font-mono); font-weight: 800; color: var(--cta-blue-light); flex-shrink: 0;">
                            ${det.cantidadSeries} × ${det.pesoKg} kg × ${det.reps}
                          </span>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')
          ) : (
            ejerciciosFiltrados.length === 0 ? `
              <div style="text-align: center; padding: 20px 12px; color: var(--text-dim); font-size: 12.5px;">
                ${ejerciciosRealizados.length === 0
                  ? 'Todavía no registraste ningún ejercicio. Los ejercicios que hagas en tus clases aparecerán acá con su conteo total.'
                  : `No se encontraron ejercicios realizados con "${h(historialBusqueda)}".`}
              </div>
            ` : ejerciciosFiltrados.map(item => {
              const { ej, historial, prev, totalClases, totalSeries, mejorPeso, mejorReps } = item;
              const media = Engine.resolveEjercicioMedia(ej);
              const isExpanded = expandedHistorialEjIds.has(ej.id);

              return `
                <div class="historico-ej-card" style="padding: 10px 12px; gap: 6px;">
                  <div class="ej-card-top" style="align-items: center;">
                    <div class="ej-thumb" data-action="view-ejercicio" data-ejercicio-id="${h(ej.id)}" title="${h(ej.nombre)}" style="width: 44px; height: 44px;">
                      ${media.illustrationUrl ? `
                        <img class="ej-thumb-img" src="${h(media.illustrationUrl)}" alt="${h(ej.nombre)}" loading="lazy">
                      ` : `
                        <div class="ej-thumb-fallback">${h((ej.nombre || 'EJ').slice(0, 2).toUpperCase())}</div>
                      `}
                    </div>
                    <div class="ej-info">
                      <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                        <span class="badge badge-blue">${totalClases} ${totalClases === 1 ? 'clase' : 'clases'} · ${totalSeries} series</span>
                        <span class="badge badge-neon" style="font-size: 9.5px; padding: 2px 6px;">${h(ej.grupoMuscular)}</span>
                      </div>
                      <h3 class="ej-title" style="font-size: 14px; margin: 2px 0 1px 0;">${h(ej.nombre)}</h3>
                      <div class="ej-clase-anterior" style="font-size: 11.5px;">
                        ${prev ? `Última (${h(prev.fecha.slice(5).split('-').reverse().join('/'))}): <strong>${h(prev.texto)}</strong> · Mejor: <strong>${mejorPeso}kg×${mejorReps}</strong>` : ''}
                      </div>
                    </div>
                    <div class="ej-tools">
                      <button type="button" class="btn-sm btn-secondary" data-action="toggle-expand-historial-ej" data-ejercicio-id="${h(ej.id)}" title="Ver detalle por clase">
                        ${isExpanded ? 'Ocultar' : 'Clases'}
                      </button>
                    </div>
                  </div>

                  ${isExpanded ? `
                    <div class="historico-clases-list">
                      ${historial.map(sesion => `
                        <div class="historico-clase-item" style="padding: 6px 8px; font-size: 11.5px;">
                          <div>
                            <strong>${h(sesion.fecha ? sesion.fecha.split('-').reverse().join('/') : 'Clase')}</strong>
                            <span style="color: var(--text-dim); margin-left: 6px;">
                              ${sesion.series.length} series · <strong>${sesion.mejorSerie.pesoKg} kg × ${sesion.mejorSerie.reps} reps</strong>
                            </span>
                          </div>
                          <span class="badge badge-neon" style="font-family: var(--font-mono); font-size: 10.5px;">
                            ${Math.round(sesion.volumenTotal).toLocaleString()} kg
                          </span>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')
          )}
          </div>
        </div>
      </div>
    `;
  }

  // 6.3 Pestaña SALUD FÍSICA Y PSICOLÓGICA (SIMPLIFICADA, RÁPIDA, A DEMANDA Y ONE-PAGE)
  function renderAlumnoSaludSection(state) {
    syncSaludDraftsWithState(state, Store.user);
    const diasSeleccionados = Array.isArray(draftPerfil.diasSemana) ? draftPerfil.diasSemana : [];
    const logs = (state.readinessLogs || []).filter(r => !r.deleted);
    const observaciones = (state.observaciones || []).filter(o => !o.deleted);

    const hoyISO = Engine.todayISO();
    const ayerDate = new Date(Date.now() - 86400000);
    const ayerISO = `${ayerDate.getFullYear()}-${String(ayerDate.getMonth() + 1).padStart(2, '0')}-${String(ayerDate.getDate()).padStart(2, '0')}`;

    const selFecha = draftReadiness.fecha || hoyISO;
    const logDeEstaFecha = logs.find(l => l.fecha === selFecha);

    const selEnergia = String(draftReadiness.energia || '4');
    const selEstres = String(draftReadiness.estres || '2');
    const selSueno = String(draftReadiness.sueno || '4');
    const selEstado = draftReadiness.estadoGeneral || (logDeEstaFecha ? logDeEstaFecha.observacionAlumno : 'Excelente');

    const fechaDisplay = selFecha === hoyISO ? 'Hoy' : (selFecha === ayerISO ? 'Ayer' : selFecha.split('-').reverse().join('/'));

    return `
      <div class="onepage-view">
        <!-- Tarjeta Principal: Registro Psicofísico Rápido (One-Page, sin scroll) -->
        <div class="card" style="padding: 10px 12px; gap: 8px; flex-shrink: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap;">
            <div>
              <h2 class="card-title" style="font-size: 15px; color: var(--text-main);">Estado Psicofísico</h2>
              <p style="font-size: 11px; color: var(--text-dim);">Registrá cómo estás el día que quieras.</p>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              ${logDeEstaFecha ? `<span class="badge badge-blue" style="font-size: 10px;">Guardado</span>` : ''}
              <button type="button" class="btn-sm btn-secondary ${selFecha === hoyISO ? 'btn-primary' : ''}" data-action="set-readiness-date" data-date="${hoyISO}" style="min-height: 30px; padding: 3px 8px;">
                Hoy
              </button>
              <button type="button" class="btn-sm btn-secondary ${selFecha === ayerISO ? 'btn-primary' : ''}" data-action="set-readiness-date" data-date="${ayerISO}" style="min-height: 30px; padding: 3px 8px;">
                Ayer
              </button>
              <input type="date" id="rd-fecha" class="form-input" value="${h(selFecha)}" data-action="change-readiness-date" style="width: 154px; min-height: 32px; padding: 2px 6px; font-size: 16px; font-family: var(--font-mono); flex-shrink: 0;">
            </div>
          </div>

          <!-- 1. Sensación General en 1 Fila -->
          <div class="salud-status-grid">
            <button type="button" class="salud-chip ${selEstado === 'Excelente' ? 'selected' : ''}" data-action="pick-salud-estado" data-estado="Excelente" data-energia="5" data-estres="1" data-sueno="5">
              <strong>Excelente</strong>
            </button>
            <button type="button" class="salud-chip ${selEstado === 'Con energía' ? 'selected' : ''}" data-action="pick-salud-estado" data-estado="Con energía" data-energia="4" data-estres="1" data-sueno="4">
              <strong>Energía</strong>
            </button>
            <button type="button" class="salud-chip ${selEstado === 'Normal' ? 'selected' : ''}" data-action="pick-salud-estado" data-estado="Normal" data-energia="3" data-estres="2" data-sueno="3">
              <strong>Normal</strong>
            </button>
            <button type="button" class="salud-chip ${selEstado === 'Cansado' ? 'selected' : ''}" data-action="pick-salud-estado" data-estado="Cansado" data-energia="2" data-estres="3" data-sueno="2">
              <strong>Cansado</strong>
            </button>
            <button type="button" class="salud-chip ${selEstado === 'Con molestia' ? 'selected' : ''}" data-action="pick-salud-estado" data-estado="Con molestia" data-energia="2" data-estres="4" data-sueno="3">
              <strong>Molestia</strong>
            </button>
          </div>

          <!-- 2. Ajuste Fino Compacto -->
          <div class="salud-submetrics">
            <div class="salud-submetric-inline">
              <span class="salud-metric-label">Energía</span>
              <div class="salud-metric-chips">
                ${[1, 2, 3, 4, 5].map(v => `
                  <button type="button" class="salud-m-chip ${Number(selEnergia) === v ? 'selected' : ''}" data-action="set-salud-metric" data-metric="energia" data-val="${v}">
                    ${v}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="salud-submetric-inline">
              <span class="salud-metric-label">Estrés</span>
              <div class="salud-metric-chips">
                <button type="button" class="salud-m-chip ${Number(selEstres) <= 1 ? 'selected' : ''}" data-action="set-salud-metric" data-metric="estres" data-val="1">Bajo</button>
                <button type="button" class="salud-m-chip ${Number(selEstres) === 2 || Number(selEstres) === 3 ? 'selected' : ''}" data-action="set-salud-metric" data-metric="estres" data-val="2">Normal</button>
                <button type="button" class="salud-m-chip ${Number(selEstres) >= 4 ? 'selected' : ''}" data-action="set-salud-metric" data-metric="estres" data-val="4">Alto</button>
              </div>
            </div>

            <div class="salud-submetric-inline">
              <span class="salud-metric-label">Sueño</span>
              <div class="salud-metric-chips">
                <button type="button" class="salud-m-chip ${Number(selSueno) >= 4 ? 'selected' : ''}" data-action="set-salud-metric" data-metric="sueno" data-val="5">+7h</button>
                <button type="button" class="salud-m-chip ${Number(selSueno) === 3 ? 'selected' : ''}" data-action="set-salud-metric" data-metric="sueno" data-val="3">6h</button>
                <button type="button" class="salud-m-chip ${Number(selSueno) <= 2 ? 'selected' : ''}" data-action="set-salud-metric" data-metric="sueno" data-val="2">&lt;5h</button>
              </div>
            </div>

            <div class="psico-dual-inputs">
              <input type="text" id="rd-dolor" class="form-input" value="${h(draftReadiness.zonaDolor || '')}" placeholder="Molestia (opc.)">
              <input type="text" id="rd-obs" class="form-input" value="${h(draftReadiness.observacionAlumno || '')}" placeholder="Nota (opc.)">
            </div>
          </div>

          <button type="button" class="btn-primary" data-action="submit-readiness" style="min-height: 40px;">
            ${renderIcon('check')} Guardar Estado (${fechaDisplay})
          </button>
        </div>

        <!-- Barra inferior de desplegables -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; flex-shrink: 0;">
          <button type="button" class="btn-secondary btn-sm" data-action="toggle-salud-logs" style="width: 100% !important; min-height: 34px !important;">
            Bitácora (${logs.length}) ${isSaludLogsOpen ? renderIcon('chevronUp') : renderIcon('chevronDown')}
          </button>
          <button type="button" class="btn-secondary btn-sm" data-action="toggle-perfil-collapse" style="width: 100% !important; min-height: 34px !important;">
            Ficha Física ${isPerfilOpen ? renderIcon('chevronUp') : renderIcon('chevronDown')}
          </button>
        </div>

        <div class="onepage-scroll-list">
          ${isSaludLogsOpen ? `
            <div class="card" style="padding: 10px 12px; gap: 6px;">
              ${logs.length === 0 ? `
                <div style="padding: 8px; text-align: center; color: var(--text-dim); font-size: 12px;">
                  Sin registros todavía.
                </div>
              ` : logs.map(l => `
                <div style="background: var(--bg-elevated); padding: 6px 10px; border-radius: var(--radius-sm); font-size: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                  <div style="flex: 1; min-width: 0;">
                    <strong>${h(l.fecha.split('-').reverse().join('/'))}</strong>
                    <span class="badge badge-blue" style="margin-left: 4px;">E:${l.energia}/5</span>
                    ${l.zonaDolor ? `<span class="badge badge-amber">${h(l.zonaDolor)}</span>` : ''}
                    ${l.observacionAlumno ? `<span style="color: var(--text-muted); margin-left: 4px;">· ${h(l.observacionAlumno)}</span>` : ''}
                  </div>
                  <div style="display: flex; gap: 4px; flex-shrink: 0;">
                    <button type="button" class="btn-sm btn-secondary" data-action="set-readiness-date" data-date="${h(l.fecha)}" title="Editar">${renderIcon('edit')}</button>
                    <button type="button" class="btn-sm btn-secondary danger" data-action="delete-readiness-log" data-log-id="${h(l.id)}" title="Borrar">${renderIcon('x')}</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${isPerfilOpen ? `
            <div class="card" style="padding: 10px 12px;">
              <form data-action="save-perfil-fisico" style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                  <div>
                    <label class="form-label" style="font-size: 10px;">Edad</label>
                    <input type="number" id="pf-edad" class="form-input" value="${h(draftPerfil.edad || '')}" placeholder="28" style="min-height: 36px;">
                  </div>
                  <div>
                    <label class="form-label" style="font-size: 10px;">Peso (kg)</label>
                    <input type="number" step="0.1" id="pf-peso" class="form-input" value="${h(draftPerfil.pesoKg || '')}" placeholder="78.5" style="min-height: 36px;">
                  </div>
                  <div>
                    <label class="form-label" style="font-size: 10px;">Altura (cm)</label>
                    <input type="number" id="pf-altura" class="form-input" value="${h(draftPerfil.alturaCm || '')}" placeholder="176" style="min-height: 36px;">
                  </div>
                </div>

                <div class="day-chips" id="pf-dias-container">
                  ${DIAS_SEMANA.map(d => `
                    <button type="button" class="day-chip ${diasSeleccionados.includes(d) ? 'selected' : ''}" data-action="toggle-perfil-dia" data-dia="${d}" style="padding: 5px 8px; font-size: 11px !important;">
                      ${d.slice(0, 3)}
                    </button>
                  `).join('')}
                </div>

                <div style="display: grid; grid-template-columns: 110px 1fr; gap: 6px;">
                  <input type="time" id="pf-horario" class="form-input" value="${h(draftPerfil.horarioHabitual || '19:00')}" style="min-height: 36px;">
                  <input type="text" id="pf-lesiones" class="form-input" value="${h(draftPerfil.lesiones || '')}" placeholder="Lesiones / Antecedentes" style="min-height: 36px;">
                </div>

                <button type="button" class="btn-primary btn-sm" data-action="save-perfil-fisico" style="width: 100% !important; min-height: 38px !important;">
                  ${renderIcon('check')} Guardar Ficha Física
                </button>
              </form>
            </div>
          ` : ''}

          ${observaciones.length > 0 ? `
            <div class="card" style="padding: 8px 12px;">
              <strong style="font-size: 12px; color: var(--text-main);">Nota Profesor: ${h(observaciones[0].texto)}</strong>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // 6.4 Pestaña EVOLUCIÓN HISTÓRICA + FOTOS CON MARCA DE AGUA DE FECHA Y PESO
  function renderAlumnoEvolucionSection(state) {
    const entrenamientos = (state.entrenamientos || []).filter(t => !t.deleted);
    const fotos = (state.fotos || []).filter(f => !f.deleted);
    const prs = Engine.computePRs(state);
    const volumenTotalHistorico = (state.series || [])
      .filter(s => !s.deleted)
      .reduce((acc, s) => acc + Engine.computeVolumenSerie(s), 0);

    return `
      <!-- KPIs Generales -->
      <div class="pc-grid-3">
        <div class="card">
          <span class="form-label">Volumen Total Histórico</span>
          <p style="font-size: 26px; font-weight: 800; font-family: var(--font-mono); color: var(--cta-blue-light);">
            ${Math.round(volumenTotalHistorico).toLocaleString()} kg
          </p>
          <span style="font-size: 12px; color: var(--text-dim);">Calculado por Engine sobre tus series</span>
        </div>

        <div class="card">
          <span class="form-label">Sesiones Registradas</span>
          <p style="font-size: 26px; font-weight: 800; font-family: var(--font-mono); color: var(--text-main);">
            ${entrenamientos.length} entrenamientos
          </p>
          <span style="font-size: 12px; color: var(--text-dim);">Historial 100% persistente</span>
        </div>

        <div class="card">
          <span class="form-label">Ejercicios con Récord (PR)</span>
          <p style="font-size: 26px; font-weight: 800; font-family: var(--font-mono); color: var(--cta-blue-light);">
            ${Object.keys(prs).length} ejercicios
          </p>
          <span style="font-size: 12px; color: var(--text-dim);">1RM estimado por fórmula Epley</span>
        </div>
      </div>

      <!-- Gráfico de Líneas Evolutivo -->
      <div class="card">
        <h2 class="card-title" style="color: var(--text-main);">Curva Histórica de Evolución (Fuerza 1RM vs. Estrés Diario)</h2>
        ${renderGraficoEvolucionSVG(state, 'dark')}
      </div>

      <!-- Galería de Fotos con Sello de Agua Automático de Fecha y Peso -->
      <div class="card">
        <div class="card-header">
          <div>
            <span class="badge badge-neon">Sello de Agua Automático</span>
            <h2 class="card-title" style="margin-top: 4px; color: var(--text-main);">Bitácora Fotográfica con Marca de Agua de Fecha</h2>
            <p style="font-size: 12px; color: var(--text-dim);">
              Subí una foto desde tu teléfono o PC: la aplicación estampa automáticamente la marca de agua con la fecha local y tu peso corporal.
            </p>
          </div>
        </div>

        <div style="background: var(--bg-elevated); padding: 14px; border-radius: var(--radius-md); display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; align-items: end;">
          <div class="form-group">
            <label class="form-label">Peso Corporal Hoy (kg)</label>
            <input type="number" step="0.1" id="foto-peso-input" class="form-input" value="${h((state.perfil && state.perfil.pesoKg) || '')}" placeholder="Ej: 78.5">
          </div>
          <div class="form-group">
            <label class="form-label">Nota / Observación de la Foto</label>
            <input type="text" id="foto-nota-input" class="form-input" placeholder="Ej: Fin de semana 4, postura espalda...">
          </div>
          <div>
            <label class="btn-primary" style="cursor: pointer;">
              Seleccionar Foto y Estampar Fecha
              <input type="file" accept="image/*" style="display: none;" data-action="upload-watermarked-photo" data-target-user="">
            </label>
          </div>
        </div>

        ${fotos.length === 0 ? `
          <div style="padding: 20px; text-align: center; background: var(--bg-elevated); border-radius: var(--radius-md); color: var(--text-dim); font-size: 13px;">
            Todavía no subiste fotos a tu bitácora evolutiva.
          </div>
        ` : `
          <div class="photo-grid">
            ${fotos.map(f => `
              <div class="photo-card">
                <img src="${f.dataUrl}" alt="Foto evolutiva" />
                <div class="photo-watermark">
                  <span class="watermark-stamp">${h(f.fecha)} • ${f.pesoKg ? f.pesoKg + ' kg' : 'S/P'}</span>
                  ${f.nota ? `<p style="font-size: 11px; margin-top: 4px;">${h(f.nota)}</p>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `}
        </div>
      </div>
    `;
  }

  // 6.5 Pestaña CUENTA Y AJUSTES (Compacta One-Page, sin descanso entre series, estilo colapsado)
  function renderAlumnoAjustesSection(state, user) {
    const aesPref = Store.getAestheticPreference ? Store.getAestheticPreference() : {};
    return `
      <div class="onepage-view">
        <div class="card" style="flex-shrink: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
            <div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <h2 class="card-title" style="font-size: 16px; color: var(--text-main);">${h(user.displayName)} (@${h(user.username)})</h2>
                <span class="badge badge-emerald">v${APP_VERSION}</span>
              </div>
              <p style="font-size: 11.5px; color: var(--text-dim); font-family: var(--font-mono); margin-top: 2px;">
                Código alumno: <strong style="color: var(--text-main);">${h(state.codigoAlumno)}</strong>
              </p>
            </div>
            <button type="button" class="btn-logout" data-action="logout">
              Cerrar Sesión
            </button>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
            <button type="button" class="btn-secondary btn-sm" data-action="open-sugerencias-modal" style="width: 100% !important;">
              ${renderIcon('bulb')} Sugerencias
            </button>
            <button type="button" class="btn-secondary btn-sm" data-action="check-app-update" style="width: 100% !important;">
              ${renderIcon('refresh')} Actualizar App
            </button>
            <button type="button" class="btn-secondary btn-sm" data-action="export-backup" style="width: 100% !important;">
              ${renderIcon('download')} Exportar JSON
            </button>
            <label class="btn-secondary btn-sm" style="cursor: pointer; width: 100% !important;">
              ${renderIcon('upload')} Importar JSON
              <input type="file" accept=".json" style="display: none;" data-action="import-backup">
            </label>
          </div>
        </div>

        <div class="card" style="flex: ${isAjustesColorsOpen ? '1' : '0 0 auto'}; min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding: 10px 12px; gap: 8px;">
          <button type="button" data-action="toggle-ajustes-colors" style="display: flex; justify-content: space-between; align-items: center; width: 100%; background: none; border: none; padding: 2px 0; cursor: pointer; color: var(--text-main); flex-shrink: 0;">
            <span style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 800;">
              ${renderIcon('palette')} Estilo visual y tema
            </span>
            <span class="badge" style="font-size: 10.5px;">
              ${isAjustesColorsOpen ? 'Ocultar' : 'Personalizar'} ${isAjustesColorsOpen ? renderIcon('chevronUp') : renderIcon('chevronDown')}
            </span>
          </button>

          ${isAjustesColorsOpen ? `
            <div class="onepage-scroll-list" style="border-top: 1px dashed var(--border-subtle); padding-top: 8px; gap: 10px;">
              ${renderThemeSelector()}
              ${renderBackgroundPatternSelector(aesPref)}

              <div style="border-top: 1px dashed var(--border-subtle); padding-top: 8px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span class="form-label" style="font-size: 10px;">Superficie y Color de Acento</span>
                  <button type="button" class="btn-link" data-action="reset-aesthetic-pref" style="font-size: 11px; padding: 0;">Restablecer</button>
                </div>
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                  <button type="button" class="theme-chip ${aesPref.bgStyle === 'zinc' ? 'active' : ''}" data-action="set-aesthetic-bg" data-bg="zinc">Zinc</button>
                  <button type="button" class="theme-chip ${aesPref.bgStyle === 'oled' ? 'active' : ''}" data-action="set-aesthetic-bg" data-bg="oled">OLED</button>
                  <button type="button" class="theme-chip ${aesPref.bgStyle === 'navy' ? 'active' : ''}" data-action="set-aesthetic-bg" data-bg="navy">Navy</button>
                  <button type="button" class="theme-chip ${aesPref.bgStyle === 'steel' ? 'active' : ''}" data-action="set-aesthetic-bg" data-bg="steel">Acero</button>
                </div>
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                  <button type="button" class="theme-chip ${aesPref.accentColor === '#3B82F6' ? 'active' : ''}" data-action="set-aesthetic-accent" data-color="#3B82F6"><span style="width:9px;height:9px;border-radius:99px;background:#3B82F6;display:inline-block;"></span> Azul</button>
                  <button type="button" class="theme-chip ${aesPref.accentColor === '#22C55E' ? 'active' : ''}" data-action="set-aesthetic-accent" data-color="#22C55E"><span style="width:9px;height:9px;border-radius:99px;background:#22C55E;display:inline-block;"></span> Verde</button>
                  <button type="button" class="theme-chip ${aesPref.accentColor === '#F97316' ? 'active' : ''}" data-action="set-aesthetic-accent" data-color="#F97316"><span style="width:9px;height:9px;border-radius:99px;background:#F97316;display:inline-block;"></span> Naranja</button>
                  <button type="button" class="theme-chip ${aesPref.accentColor === '#8B5CF6' ? 'active' : ''}" data-action="set-aesthetic-accent" data-color="#8B5CF6"><span style="width:9px;height:9px;border-radius:99px;background:#8B5CF6;display:inline-block;"></span> Violeta</button>
                  <button type="button" class="theme-chip ${aesPref.accentColor === '#EF4444' ? 'active' : ''}" data-action="set-aesthetic-accent" data-color="#EF4444"><span style="width:9px;height:9px;border-radius:99px;background:#EF4444;display:inline-block;"></span> Rojo</button>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ==========================================
  // 7. INTERFAZ DEL PROFESOR (PC DESKTOP CRM CLÍNICO EN MODO CLARO)
  // ==========================================
  function renderTrainerPCInterface() {
    const todosAlumnos = Store.getTodosLosAlumnos();
    const vinculados = Store.getAlumnosVinculados();

    // Seleccionar por defecto el primer alumno vinculado o disponible
    const listaAlumnos = vinculados.length > 0 ? vinculados : todosAlumnos.map(u => ({
      username: u.username,
      displayName: u.displayName,
      codigoAlumno: u.codigoAlumno,
      state: Store.getUserState(u.username)
    }));

    if (!selectedAlumnoUsername && listaAlumnos.length > 0) {
      selectedAlumnoUsername = listaAlumnos[0].username;
    }

    const alumnoActivo = listaAlumnos.find(a => a.username === selectedAlumnoUsername) || listaAlumnos[0] || null;
    const stAlumno = alumnoActivo ? Store.getUserState(alumnoActivo.username) : null;

    return `
      <div class="layout-pc-shell">
        <!-- Sidebar Izquierdo del Profesor: Vinculación por Código y Directorio de Alumnos -->
        <aside class="pc-sidebar">
          <div style="display: flex; flex-direction: column; gap: 16px;">
            ${renderAppBrand('Panel del Profesor · CRM')}

            <!-- Formulario para Vincular Alumno por Código Único -->
            <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); padding: 12px; border-radius: var(--radius-md);">
              <label class="form-label" style="color: var(--steel-blue);">+ Vincular Alumno por Código</label>
              <p style="font-size: 11px; color: var(--text-muted); margin: 3px 0 8px;">
                Pedile a tu alumno su código único (ej: <strong>GYM-1024</strong>) para gestionar su cuenta:
              </p>
              <form data-action="trainer-link-alumno" style="display: flex; flex-direction: column; gap: 6px;">
                <input type="text" id="trainer-code-input" class="form-input" placeholder="Código ej: GYM-1024" required style="font-family: var(--font-mono); font-weight: 800;">
                <input type="text" id="trainer-name-input" class="form-input" placeholder="Nombre (si es código nuevo)">
                <button type="submit" class="btn-primary" style="min-height: 38px;">
                  Vincular Cuenta de Alumno
                </button>
              </form>
            </div>

            <!-- Lista de Alumnos Vinculados -->
            <div>
              <span class="form-label">Directorio de Alumnos (${listaAlumnos.length})</span>
              <div class="pc-nav-list" style="margin-top: 8px;">
                ${listaAlumnos.map(al => {
                  const isSel = alumnoActivo && al.username === alumnoActivo.username;
                  const lastReadiness = (al.state.readinessLogs || [])[0];
                  const tieneAlerta = lastReadiness && (lastReadiness.estres >= 4 || lastReadiness.energia <= 2 || lastReadiness.dolorArticular);
                  return `
                    <button type="button" class="pc-nav-btn ${isSel ? 'active' : ''}" data-action="trainer-select-alumno" data-username="${h(al.username)}" style="justify-content: space-between;">
                      <div>
                        <div style="font-weight: 800; font-size: 13px;">${h(al.displayName)}</div>
                        <div style="font-size: 11px; font-family: var(--font-mono); opacity: 0.8;">${h(al.codigoAlumno)}</div>
                      </div>
                      ${tieneAlerta ? `<span class="badge badge-rose">Alerta</span>` : `<span class="badge badge-emerald">Activo</span>`}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <button type="button" class="pc-nav-btn" data-action="open-sugerencias-modal">
              ${renderIcon('bulb')}<span>Sugerencias</span>
            </button>

            ${renderThemeSelector()}
          </div>

          <div style="border-top: 1px solid var(--border-subtle); padding-top: 12px; font-size: 12px; color: var(--text-muted);">
            <div>Sesión activa: <strong>${h(Store.user ? Store.user.displayName : 'Profesor')}</strong></div>
            <button type="button" data-action="logout" style="color: var(--accent-rose); font-weight: 800; margin-top: 6px;">
              Cerrar Sesión
            </button>
            ${renderJFCopyrightSeal()}
          </div>
        </aside>

        <!-- Área Principal de Trabajo del Profesor sobre el Alumno Seleccionado -->
        <main class="pc-main-workspace">
          ${!alumnoActivo || !stAlumno ? `
            <div class="card" style="text-align: center; padding: 40px;">
              <h2>Vinculá tu primer alumno ingresando su código único en el panel izquierdo</h2>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 22px;">
              <!-- Cabecera Clínica del Alumno Vinculado -->
              <div class="card" style="border-left: 5px solid var(--steel-blue);">
                <div class="card-header">
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <span class="badge badge-blue" style="font-family: var(--font-mono); font-size: 12px;">CÓDIGO: ${h(stAlumno.codigoAlumno)}</span>
                      <h2 style="font-size: 20px; font-weight: 800; color: var(--text-main);">Ficha Clínica de ${h(alumnoActivo.displayName)}</h2>
                    </div>
                    <p style="font-size: 13px; color: var(--text-muted); margin-top: 6px; line-height: 1.6;">
                      Peso: <strong>${h(stAlumno.perfil.pesoKg || 'Sin cargar')} kg</strong> ·
                      Altura: <strong>${h(stAlumno.perfil.alturaCm || 'Sin cargar')} cm</strong> ·
                      Días que asiste: <strong>${(stAlumno.perfil.diasSemana || []).length > 0 ? stAlumno.perfil.diasSemana.join(', ') : 'A definir'}</strong> ·
                      Horario: <strong>${h(stAlumno.perfil.horarioHabitual || '19:00')} hs</strong>
                    </p>
                    ${stAlumno.perfil.lesiones ? `<p style="font-size: 12px; color: var(--accent-rose); font-weight: 700; margin-top: 2px;">Lesiones/Antecedentes: ${h(stAlumno.perfil.lesiones)}</p>` : ''}
                  </div>

                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button type="button" class="btn-primary" data-action="open-rutina-builder" data-target-username="${h(alumnoActivo.username)}" style="width: auto;">
                      + Crear / Establecer Nueva Rutina al Alumno
                    </button>
                  </div>
                </div>
              </div>

              <!-- Fila Superior: Gestión de Rutinas del Alumno + Check-in Psicofísico Reciente -->
              <div class="pc-grid-2">
                <!-- Columna 1: Rutinas Asignadas al Alumno (Ver, Editar, Agregar Ejercicios del Catálogo) -->
                <div class="card">
                  <div class="card-header">
                    <div>
                      <span class="badge badge-blue">Sincronización Directa</span>
                      <h3 class="card-title" style="margin-top: 4px;">Rutinas del Alumno (${(stAlumno.rutinas || []).filter(r => !r.deleted).length})</h3>
                    </div>
                    <button type="button" class="btn-secondary" data-action="open-rutina-builder" data-target-username="${h(alumnoActivo.username)}" style="width: auto;">
                      + Nueva Rutina
                    </button>
                  </div>

                  ${(stAlumno.rutinas || []).filter(r => !r.deleted).length === 0 ? `
                    <div style="padding: 24px; text-align: center; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); color: var(--text-muted); font-size: 13px;">
                      Este alumno todavía no tiene rutinas cargadas.<br>
                      Hacé clic en <strong>"+ Nueva Rutina"</strong> para armarle su plan seleccionando ejercicios del catálogo estandarizado.
                    </div>
                  ` : `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                      ${(stAlumno.rutinas || []).filter(r => !r.deleted).map(r => `
                        <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; display: flex; flex-direction: column; gap: 8px;">
                          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
                            <div>
                              <h4 style="font-size: 15px; font-weight: 800; color: var(--text-main);">${h(r.nombre)}</h4>
                              <p style="font-size: 12px; color: var(--text-muted);">
                                ${(r.dias || []).join(', ')} · Turno ${h(r.horario || '19:00')} hs
                              </p>
                            </div>
                            <div style="display: flex; gap: 6px;">
                              <button type="button" class="btn-secondary" data-action="open-catalog-picker" data-mode="append-to-rutina" data-rutina-id="${h(r.id)}" data-target-username="${h(alumnoActivo.username)}" style="width: auto; min-height: 32px; padding: 0 10px;">
                                + Sumar Ejercicio
                              </button>
                              <button type="button" class="btn-secondary" data-action="edit-rutina" data-rutina-id="${h(r.id)}" data-target-username="${h(alumnoActivo.username)}" style="width: auto; min-height: 32px; padding: 0 10px;">
                                ${renderIcon('edit')} Editar
                              </button>
                              <button type="button" class="btn-secondary" data-action="delete-rutina" data-rutina-id="${h(r.id)}" data-target-username="${h(alumnoActivo.username)}" style="width: auto; min-height: 32px; padding: 0 10px; color: var(--accent-rose);">
                                ${renderIcon('trash')}
                              </button>
                            </div>
                          </div>

                          <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border-subtle); padding-top: 8px;">
                            ${(r.ejercicios || []).map((re, idx) => {
                              const ej = (stAlumno.ejercicios || []).find(e => e.id === re.ejercicioId)
                                || Engine.CATALOGO_EJERCICIOS.find(e => e.id === re.ejercicioId)
                                || { nombre: re.nombre || re.ejercicioId };
                              return `
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 6px 8px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                                  <span><strong style="color: var(--text-main);">${idx + 1}. ${h(ej ? ej.nombre : re.ejercicioId)}</strong></span>
                                  <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-family: var(--font-mono); font-weight: 700; color: var(--steel-blue);">${re.seriesObjetivo}×${h(re.repsObjetivo)}</span>
                                    <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(re.ejercicioId)}" title="Ver ejercicio">${renderIcon('eye')}</button>
                                    <button type="button" data-action="remove-ej-from-rutina" data-rutina-id="${h(r.id)}" data-index="${idx}" data-target-username="${h(alumnoActivo.username)}" style="color: var(--accent-rose); font-weight: 800;">${renderIcon('x')}</button>
                                  </div>
                                </div>
                              `;
                            }).join('')}
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  `}
                </div>

                <!-- Columna 2: Crear y Establecer Observaciones Clínicas + Estado Psicofísico del Alumno -->
                <div style="display: flex; flex-direction: column; gap: 18px;">
                  <div class="card">
                    <span class="badge badge-amber">Seguimiento Clínico y Biomecánico</span>
                    <h3 class="card-title">Establecer Observación para ${h(alumnoActivo.displayName)}</h3>
                    <form data-action="trainer-add-observacion" data-target-username="${h(alumnoActivo.username)}" style="display: flex; flex-direction: column; gap: 10px;">
                      <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px;">
                        <select id="trainer-obs-cat" class="form-input">
                          <option value="Ajuste Biomecánico">Ajuste Biomecánico</option>
                          <option value="Alerta Clínica">Alerta Clínica</option>
                          <option value="Planificación de Carga">Planificación de Carga</option>
                          <option value="Nutrición / Descanso">Nutrición / Descanso</option>
                        </select>
                        <input type="text" id="trainer-obs-text" class="form-input" placeholder="Ej: Bajar 5kg en sentadilla y cuidar rodilla derecha..." required>
                      </div>
                      <button type="submit" class="btn-primary">
                        + Guardar Observación en la Ficha del Alumno
                      </button>
                    </form>

                    ${(stAlumno.observaciones || []).filter(o => !o.deleted).length > 0 ? `
                      <div class="timeline" style="margin-top: 8px; max-height: 220px; overflow-y: auto;">
                        ${(stAlumno.observaciones || []).filter(o => !o.deleted).map(o => `
                          <div class="timeline-item">
                            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim);">
                              <strong>${h(o.autor)} · ${h(o.categoria)}</strong>
                              <span>${h(o.fecha)} ${h(o.hora)}</span>
                            </div>
                            <p style="font-size: 13px; margin-top: 4px;">${h(o.texto)}</p>
                          </div>
                        `).join('')}
                      </div>
                    ` : `<p style="font-size: 12px; color: var(--text-dim);">Aún no hay observaciones clínicas registradas para este alumno.</p>`}
                  </div>

                  <!-- Estado de Salud Física y Psicológica reportado por el Alumno -->
                  <div class="card">
                    <h3 class="card-title">Reportes de Salud Física y Psicológica</h3>
                    ${(stAlumno.readinessLogs || []).filter(r => !r.deleted).length === 0 ? `
                      <p style="font-size: 12px; color: var(--text-dim);">El alumno aún no cargó su registro psicofísico diario.</p>
                    ` : `
                      <div style="display: flex; flex-direction: column; gap: 8px; max-height: 190px; overflow-y: auto;">
                        ${(stAlumno.readinessLogs || []).filter(r => !r.deleted).map(l => `
                          <div style="background: var(--bg-elevated); border-left: 4px solid ${l.estres >= 4 || l.dolorArticular ? 'var(--accent-rose)' : 'var(--accent-emerald)'}; padding: 10px 12px; border-radius: var(--radius-sm); font-size: 12px;">
                            <div style="display: flex; justify-content: space-between; font-weight: 800;">
                              <span>${h(l.fecha)} (${h(l.hora)})</span>
                              <span>Energía ${l.energia}/5 · Estrés ${l.estres}/5 · Sueño ${l.sueno || 4}/5</span>
                            </div>
                            ${l.zonaDolor ? `<p style="color: var(--accent-rose); font-weight: 700; margin-top: 2px;">Dolor reportado: ${h(l.zonaDolor)}</p>` : ''}
                            ${l.observacionAlumno ? `<p style="color: var(--text-muted); margin-top: 2px;">Nota del alumno: "${h(l.observacionAlumno)}"</p>` : ''}
                          </div>
                        `).join('')}
                      </div>
                    `}
                  </div>
                </div>
              </div>

              <!-- Fila Inferior: Curva Histórica del Alumno + Bitácora de Fotos (el Profesor también puede adjuntar fotos) -->
              <div class="pc-grid-2">
                <div class="card">
                  <h3 class="card-title">Evolución Histórica del Alumno (Fuerza 1RM vs. Estrés)</h3>
                  ${renderGraficoEvolucionSVG(stAlumno)}
                </div>

                <div class="card">
                  <div class="card-header">
                    <div>
                      <h3 class="card-title">Fotos Evolutivas y Posturales del Alumno</h3>
                      <p style="font-size: 12px; color: var(--text-muted);">
                        Podés ver las fotos subidas por el alumno o adjuntar fotos de evaluación postural con sello de fecha automático.
                      </p>
                    </div>
                  </div>

                  <div style="display: flex; gap: 8px; align-items: center; background: var(--bg-elevated); padding: 10px; border-radius: var(--radius-md); flex-wrap: wrap;">
                    <input type="text" id="trainer-foto-nota" class="form-input" placeholder="Nota clínica de la foto (ej: Control postural sentadilla)" style="flex: 1; min-width: 180px;">
                    <label class="btn-primary" style="width: auto; cursor: pointer;">
                      ${renderIcon('camera')} Adjuntar Foto con Fecha
                      <input type="file" accept="image/*" style="display: none;" data-action="upload-watermarked-photo" data-target-user="${h(alumnoActivo.username)}">
                    </label>
                  </div>

                  ${(stAlumno.fotos || []).filter(f => !f.deleted).length === 0 ? `
                    <p style="font-size: 12px; color: var(--text-dim);">Sin fotos registradas todavía.</p>
                  ` : `
                    <div class="photo-grid">
                      ${(stAlumno.fotos || []).filter(f => !f.deleted).map(f => `
                        <div class="photo-card">
                          <img src="${f.dataUrl}" alt="Evaluación alumno" />
                          <div class="photo-watermark">
                            <span class="watermark-stamp">${h(f.fecha)} • ${f.pesoKg ? f.pesoKg + ' kg' : ''} • ${h(f.autor)}</span>
                            ${f.nota ? `<p style="font-size: 11px; margin-top: 4px;">${h(f.nota)}</p>` : ''}
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  `}
                </div>
              </div>
            </div>
          `}
        </main>
      </div>
    `;
  }

  // ==========================================
  // 8. CONTENEDORES DE LAYOUT (TELÉFONO vs PC ALUMNO)
  // ==========================================

  function renderTraineePhoneLayout(state, user) {
    let content = '';
    if (activeTab === 'hoy') content = renderAlumnoHoySection(state, user);
    else if (activeTab === 'rutinas') content = renderAlumnoRutinasSection(state);
    else if (activeTab === 'historico' || activeTab === 'evolucion') content = renderAlumnoHistoricoSection(state, user);
    else if (activeTab === 'salud') content = renderAlumnoSaludSection(state);
    else content = renderAlumnoAjustesSection(state, user);

    return `
      <div class="layout-phone-shell">
        <header class="app-header">
          ${renderAppBrand(`Alumno: @${h(user.username)}`)}
          <div style="display: flex; align-items: center; gap: 6px;">
            <button type="button" class="btn-eye-icon" data-action="open-sugerencias-modal" title="Enviar Sugerencia">
              ${renderIcon('bulb')}
            </button>
            <button type="button" class="code-pill" data-action="copy-alumno-code" data-code="${h(state.codigoAlumno)}" title="Copiar mi código para el profesor">
              ${h(state.codigoAlumno)} · Copiar
            </button>
          </div>
        </header>

        <main class="view-container" style="flex: 1;">
          ${content}
          ${renderJFCopyrightSeal()}
        </main>

        <nav class="bottom-nav">
          <button type="button" class="nav-item ${activeTab === 'hoy' ? 'active' : ''}" data-action="switch-tab" data-tab="hoy">
            <span class="nav-icon">${renderIcon('bolt')}</span><span>Entrenar</span>
          </button>
          <button type="button" class="nav-item ${activeTab === 'rutinas' ? 'active' : ''}" data-action="switch-tab" data-tab="rutinas">
            <span class="nav-icon">${renderIcon('clipboard')}</span><span>Rutinas</span>
          </button>
          <button type="button" class="nav-item ${activeTab === 'historico' || activeTab === 'evolucion' ? 'active' : ''}" data-action="switch-tab" data-tab="historico">
            <span class="nav-icon">${renderIcon('chart')}</span><span>Histórico</span>
          </button>
          <button type="button" class="nav-item ${activeTab === 'salud' ? 'active' : ''}" data-action="switch-tab" data-tab="salud">
            <span class="nav-icon">${renderIcon('activity')}</span><span>Salud</span>
          </button>
          <button type="button" class="nav-item ${activeTab === 'ajustes' ? 'active' : ''}" data-action="switch-tab" data-tab="ajustes">
            <span class="nav-icon">${renderIcon('settings')}</span><span>Cuenta</span>
          </button>
        </nav>
      </div>
    `;
  }

  function renderTraineePCLayout(state, user) {
    let content = '';
    if (activeTab === 'hoy') content = renderAlumnoHoySection(state, user);
    else if (activeTab === 'rutinas') content = renderAlumnoRutinasSection(state);
    else if (activeTab === 'historico' || activeTab === 'evolucion') content = renderAlumnoHistoricoSection(state, user);
    else if (activeTab === 'salud') content = renderAlumnoSaludSection(state);
    else content = renderAlumnoAjustesSection(state, user);

    return `
      <div class="layout-pc-shell">
        <aside class="pc-sidebar">
          <div style="display: flex; flex-direction: column; gap: 18px;">
            ${renderAppBrand('Panel de Entrenamiento')}

            <div style="background: var(--bg-card); padding: 14px; border-radius: var(--radius-md);">
              <span class="form-label" style="font-size: 10px; color: var(--text-dim);">Tu Código Único para el Profesor</span>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <strong style="font-family: var(--font-mono); font-size: 16px; color: var(--text-main);">${h(state.codigoAlumno)}</strong>
                <button type="button" class="code-pill" data-action="copy-alumno-code" data-code="${h(state.codigoAlumno)}" style="cursor: pointer;">Copiar</button>
              </div>
            </div>

            <nav class="pc-nav-list">
              <button type="button" class="pc-nav-btn ${activeTab === 'hoy' ? 'active' : ''}" data-action="switch-tab" data-tab="hoy">
                ${renderIcon('bolt')}<span>Entrenamiento de Hoy</span>
              </button>
              <button type="button" class="pc-nav-btn ${activeTab === 'rutinas' ? 'active' : ''}" data-action="switch-tab" data-tab="rutinas">
                ${renderIcon('clipboard')}<span>Mis Rutinas & Catálogo (+)</span>
              </button>
              <button type="button" class="pc-nav-btn ${activeTab === 'historico' || activeTab === 'evolucion' ? 'active' : ''}" data-action="switch-tab" data-tab="historico">
                ${renderIcon('chart')}<span>Histórico de Clases & Ejercicios</span>
              </button>
              <button type="button" class="pc-nav-btn ${activeTab === 'salud' ? 'active' : ''}" data-action="switch-tab" data-tab="salud">
                ${renderIcon('activity')}<span>Salud Física/Psicológica & Días</span>
              </button>
              <button type="button" class="pc-nav-btn ${activeTab === 'ajustes' ? 'active' : ''}" data-action="switch-tab" data-tab="ajustes">
                ${renderIcon('settings')}<span>Cuenta & Respaldo Offline</span>
              </button>
              <button type="button" class="pc-nav-btn" data-action="open-sugerencias-modal">
                ${renderIcon('bulb')}<span>Sugerencias</span>
              </button>
            </nav>

            ${renderThemeSelector()}
          </div>

          <div style="padding-top: 12px; font-size: 12px; color: var(--text-dim);">
            <div>Alumno: <strong style="color: var(--text-muted);">${h(user.displayName)}</strong></div>
            <div style="margin-top: 4px;">
              <button type="button" class="btn-logout" data-action="logout">Cerrar Sesión</button>
            </div>
            ${renderJFCopyrightSeal()}
          </div>
        </aside>

        <main class="pc-main-workspace" style="display: flex; flex-direction: column; gap: 20px;">
          ${content}
        </main>
      </div>
    `;
  }

  // ==========================================
  // 9. MODALES: CONSTRUCTOR DE RUTINAS, AMRAP, SUGERENCIAS Y CATÁLOGO TOTAL (+)
  // ==========================================
  let scrollPosBeforeModal = 0;
  function renderModals() {
    let overlay = document.getElementById('modal-overlay');
    if (!activeModal) {
      if (overlay) overlay.remove();
      if (document.body.style.position === 'fixed') {
        const top = document.body.style.top;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        document.body.classList.remove('modal-open');
        const scrollY = parseInt(top || '0', 10) * -1;
        window.scrollTo(0, scrollY || scrollPosBeforeModal);
      }
      return;
    }

    if (document.body.style.position !== 'fixed') {
      scrollPosBeforeModal = window.pageYOffset || document.documentElement.scrollTop;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollPosBeforeModal}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.body.classList.add('modal-open');
    }

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-overlay';
      overlay.className = 'modal-overlay';
      overlay.addEventListener('touchmove', e => {
        if (e.target === overlay) e.preventDefault();
      }, { passive: false });
      document.body.appendChild(overlay);
    }

    const state = draftRutina.targetUsername
      ? Store.getUserState(draftRutina.targetUsername)
      : Store.getState();

    // MODAL 1: Crear Cuenta Nueva Limpia (Alumno o Profesor)
    if (activeModal.type === 'register') {
      overlay.innerHTML = `
        <div class="modal-card">
          <div class="modal-header-sticky">
            <div>
              <span class="badge badge-blue">Registro Personal</span>
              <h2 class="card-title" style="margin-top: 4px;">Crear Cuenta Nueva</h2>
            </div>
            <button type="button" class="btn-close-modal" data-action="close-modal" title="Cerrar">✕</button>
          </div>
          <p style="font-size: 13px; color: var(--text-dim);">
            Elegí si ingresás como <strong>Alumno</strong> o como <strong>Docente / Profesor</strong> y creá tu usuario y contraseña.
          </p>
          <form data-action="submit-register" style="display: flex; flex-direction: column; gap: 12px;">
            <div class="form-group">
              <label class="form-label">¿Sos Alumno o Docente / Profesor?</label>
              <select id="reg-role" class="form-input">
                <option value="alumno" selected>Soy Alumno / Atleta (Recibe Código Único GYM-XXXX)</option>
                <option value="profesor">Soy Docente / Profesor (Panel Clínico de Alumnos)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Nombre de usuario (sin espacios)</label>
              <input type="text" id="reg-username" class="form-input" placeholder="Ej: martin" required autocapitalize="none">
            </div>
            <div class="form-group">
              <label class="form-label">Tu Nombre y Apellido</label>
              <input type="text" id="reg-display" class="form-input" placeholder="Ej: Martín Gómez" required>
            </div>
            <div class="form-group">
              <label class="form-label">Contraseña o PIN</label>
              <input type="password" id="reg-pin" class="form-input" placeholder="Creá tu contraseña o PIN" required>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 6px;">
              <button type="button" class="btn-secondary" data-action="close-modal">Cancelar</button>
              <button type="submit" class="btn-primary">Crear Cuenta e Ingresar</button>
            </div>
          </form>
        </div>
      `;
      return;
    }

    // MODAL 2: Constructor de Rutina (Nombre, Días de Semana, Horario y Botón + para Catálogo - SIN TIEMPO)
    if (activeModal.type === 'rutina-builder') {
      overlay.innerHTML = `
        <div class="modal-card">
          <div class="card-header">
            <div>
              <span class="badge badge-neon">${draftRutina.targetUsername ? 'Modo Profesor → Alumno' : 'Constructor de Rutina'}</span>
              <h2 class="card-title" style="margin-top: 4px; color: var(--text-main);">
                ${draftRutina.id ? 'Editar Rutina' : 'Armar Rutina desde Cero'}
              </h2>
            </div>
            <button type="button" class="btn-close-modal" data-action="close-modal" title="Cerrar">✕</button>
          </div>

          <div class="form-group">
            <label class="form-label">Nombre de la Rutina</label>
            <input type="text" id="builder-rutina-nombre" class="form-input" value="${h(draftRutina.nombre)}" placeholder="Ej: Torso / Pierna o Full Body Lunes-Miércoles-Viernes">
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Días de la semana para esta rutina</label>
              <div class="day-chips">
                ${DIAS_SEMANA.map(d => `
                  <button type="button" class="day-chip ${draftRutina.dias.includes(d) ? 'selected' : ''}" data-action="toggle-builder-dia" data-dia="${d}">
                    ${d}
                  </button>
                `).join('')}
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Horario de Gimnasio</label>
              <input type="time" id="builder-rutina-horario" class="form-input" value="${h(draftRutina.horario || '19:00')}">
            </div>
          </div>

          <!-- Lista de ejercicios agregados al borrador y botón "+" para abrir el Catálogo -->
          <div style="padding-top: 12px; display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="form-label">Ejercicios de la Rutina (${draftRutina.ejercicios.length})</span>
              <button type="button" class="btn-primary" data-action="open-catalog-from-builder" style="width: auto; min-height: 36px; padding: 0 12px; font-size: 12px !important;">
                + Agregar Ejercicio del Catálogo
              </button>
            </div>

            ${draftRutina.ejercicios.length === 0 ? `
              <div style="padding: 18px; text-align: center; background: var(--bg-elevated); border-radius: var(--radius-md); font-size: 12px; color: var(--text-dim);">
                Todavía no agregaste ejercicios. Tocá <strong>"+ Agregar Ejercicio del Catálogo"</strong> arriba a la derecha.
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto;">
                ${draftRutina.ejercicios.map((re, idx) => {
                  const ej = (state.ejercicios || []).find(e => e.id === re.ejercicioId)
                    || Engine.CATALOGO_EJERCICIOS.find(e => e.id === re.ejercicioId)
                    || { nombre: re.nombre || re.ejercicioId };
                  return `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-elevated); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 13px;">
                      <div>
                        <strong style="color: var(--text-main);">${idx + 1}. ${h(ej ? ej.nombre : re.ejercicioId)}</strong>
                        <div style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">
                          ${re.seriesObjetivo} series × ${h(re.repsObjetivo)} reps
                        </div>
                      </div>
                      <button type="button" data-action="remove-draft-ej" data-index="${idx}" style="color: var(--text-dim); font-weight: 900;">✕</button>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>

          <div style="display: flex; gap: 10px; margin-top: 6px;">
            <button type="button" class="btn-secondary" data-action="close-modal">Cancelar</button>
            <button type="button" class="btn-primary" data-action="save-built-rutina">
              ✓ Guardar Rutina Completa
            </button>
          </div>
        </div>
      `;
      return;
    }

    // MODAL 3: Catálogo Total de Ejercicios (Activación, Movilidad, Fuerza y AMRAP)
    if (activeModal.type === 'catalog-picker') {
      const ejercicios = (state.ejercicios || []).filter(e => !e.deleted);
      const filtrados = ejercicios.filter(e => {
        const matchGrupo = catalogoFiltroGrupo === 'todos' || e.grupoMuscular === catalogoFiltroGrupo;
        const matchTexto = !catalogoBusqueda || e.nombre.toLowerCase().includes(catalogoBusqueda.toLowerCase());
        return matchGrupo && matchTexto;
      });

      const esModoMovilidad = activeModal.mode === 'workout-movilidad' || activeModal.bloque === 'movilidad' || catalogoFiltroGrupo === 'movilidad';
      const esModoAmrap = activeModal.mode === 'append-to-amrap';
      const bloqueLabelMap = {
        activacion: 'Módulo Activación',
        movilidad: 'Módulo Movilidad',
        A: 'Bloque A',
        B: 'Bloque B',
        cierre: 'Cierre (Optativo)'
      };
      const destinoBadge = esModoAmrap
        ? 'Sumar Ejercicio dentro de tu Rutina AMRAP'
        : (activeModal.bloque && bloqueLabelMap[activeModal.bloque]
            ? `Sumando a: ${bloqueLabelMap[activeModal.bloque]}`
            : 'Catálogo Total (Activación · Movilidad · Fuerza · AMRAP)');

      overlay.innerHTML = `
        <div class="modal-card" style="max-width: 680px;">
          <div class="card-header">
            <div>
              <span class="badge badge-neon">${h(destinoBadge)}</span>
              <h2 class="card-title" style="margin-top: 4px; color: var(--text-main);">Seleccioná un Ejercicio para Añadir</h2>
            </div>
            <button type="button" class="btn-close-modal" data-action="close-modal" title="Cerrar">✕</button>
          </div>

          <button type="button" class="btn-create-ej-inline" data-action="open-create-custom-ejercicio" data-bloque="${h(activeModal.bloque || '')}" data-grupo="${h(catalogoFiltroGrupo !== 'todos' ? catalogoFiltroGrupo : '')}" data-from-picker="true" style="width: 100%; padding: 11px 12px;">
            ${renderIcon('plus')} ¿No está en la lista? Crear Ejercicio Nuevo
          </button>

          <!-- Buscador y Filtros por Segmento -->
          <input type="text" id="catalog-search-input" class="form-input" value="${h(catalogoBusqueda)}" placeholder="Buscar ejercicio (ej: Gato, Puente glúteo, Press Banca, Sentadilla...)" data-action="search-catalog">

          <div class="day-chips">
            ${GRUPOS_CATALOGO.map(g => `
              <button type="button" class="day-chip ${catalogoFiltroGrupo === g ? 'selected' : ''}" data-action="filter-catalog-modal" data-group="${g}">
                ${g.toUpperCase()}
              </button>
            `).join('')}
          </div>

          <!-- Parámetros de Series, Repeticiones y Peso -->
          <div style="background: var(--bg-elevated); padding: 10px 12px; border-radius: var(--radius-md); display: grid; grid-template-columns: ${esModoMovilidad ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)'}; gap: 8px;">
            <div>
              <label class="form-label" style="font-size: 10px;">Series Objetivo</label>
              <input type="number" id="picker-series" class="form-input" value="${esModoMovilidad ? '2' : '3'}" min="1" max="12" style="min-height: 36px;">
            </div>
            <div>
              <label class="form-label" style="font-size: 10px;">Repeticiones / Meta</label>
              <input type="text" id="picker-reps" class="form-input" value="${esModoMovilidad ? '15' : (esModoAmrap ? '12 reps' : '8-10')}" style="min-height: 36px;">
            </div>
            ${esModoMovilidad ? `
              <div>
                <label class="form-label" style="font-size: 10px;">Peso opcional (kg)</label>
                <input type="number" step="0.5" id="picker-peso" class="form-input" value="15" style="min-height: 36px;">
              </div>
            ` : ''}
          </div>

          <!-- Lista de Ejercicios con vista previa y botón "+ Añadir" -->
          <div style="display: flex; flex-direction: column; gap: 8px; max-height: 340px; overflow-y: auto;">
            ${filtrados.map(e => {
              const media = Engine.resolveEjercicioMedia(e);
              return `
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; background: var(--bg-elevated); padding: 10px 12px; border-radius: var(--radius-md);">
                <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                  <div class="catalog-item-thumb">
                    ${media.illustrationUrl ? `
                      <img class="catalog-thumb-img" src="${h(media.illustrationUrl)}" alt="${h(e.nombre)}" loading="lazy">
                    ` : `
                      <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: var(--text-dim); background: var(--bg-surface);">${h((e.nombre || 'EJ').slice(0, 2).toUpperCase())}</div>
                    `}
                  </div>
                  <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                      <span class="badge badge-neon">${h(e.grupoMuscular)}</span>
                      <span style="font-size: 10px; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">${h(e.equipo)}</span>
                      ${e.esAmrap || e.grupoMuscular === 'amrap' ? `<span class="badge badge-amber">${e.tiempoTrabajoSeg || 40}s / ${e.tiempoDescansoSeg || 20}s</span>` : ''}
                    </div>
                    <div style="font-size: 13.5px; font-weight: 800; margin-top: 2px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h(e.nombre)}</div>
                    <div style="font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h(e.notas || '')}</div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                  <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(e.id)}" title="Ver técnica e ilustración">
                    ${renderIcon('eye')}
                  </button>
                  <button type="button" class="btn-primary" data-action="pick-catalog-exercise" data-ejercicio-id="${h(e.id)}" style="width: auto; min-height: 36px; padding: 0 14px;">
                    + Añadir
                  </button>
                </div>
              </div>
            `;}).join('')}
          </div>
        </div>
      `;
      return;
    }

    // MODAL 4: Crear un Ejercicio Personalizado Nuevo en el Catálogo
    if (activeModal.type === 'create-custom-ejercicio') {
      const defGrupo = activeModal.defaultGrupo || (activeModal.targetBloque === 'activacion' ? 'activacion' : (activeModal.targetBloque === 'movilidad' ? 'movilidad' : (activeModal.targetBloque === 'cierre' ? 'brazos' : 'pecho')));
      const tieneDestino = Boolean(activeModal.targetBloque || activeModal.returnContext);
      const opcionesGrupo = [
        ['activacion', 'Activación'],
        ['movilidad', 'Movilidad'],
        ['pecho', 'Pecho'],
        ['espalda', 'Espalda'],
        ['piernas', 'Piernas'],
        ['hombros', 'Hombros'],
        ['brazos', 'Brazos'],
        ['core', 'Core'],
        ['amrap', 'AMRAP']
      ];
      overlay.innerHTML = `
        <div class="modal-card">
          <div class="card-header">
            <div>
              ${activeModal.targetBloque ? `<span class="badge badge-neon">Se sumará automático a: ${h(activeModal.targetBloque === 'cierre' ? 'Cierre (Optativo)' : activeModal.targetBloque)}</span>` : ''}
              <h2 class="card-title" style="margin-top: 4px;">+ Crear Ejercicio Nuevo</h2>
            </div>
            <button type="button" class="btn-close-modal" data-action="close-modal" title="Cerrar">✕</button>
          </div>
          <form data-action="submit-custom-ejercicio" style="display: flex; flex-direction: column; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Nombre del Ejercicio</label>
              <input type="text" id="custom-ej-nombre" class="form-input" placeholder="Ej: Sentadilla Hack en Máquina" required>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div class="form-group">
                <label class="form-label">Segmento / Grupo Muscular</label>
                <select id="custom-ej-grupo" class="form-input">
                  ${opcionesGrupo.map(([v, lbl]) => `<option value="${v}" ${defGrupo === v ? 'selected' : ''}>${lbl}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Equipo</label>
                <select id="custom-ej-equipo" class="form-input">
                  <option value="barra">Barra</option>
                  <option value="mancuerna">Mancuerna</option>
                  <option value="kettlebell">Pesa Rusa / Kettlebell</option>
                  <option value="polea">Polea</option>
                  <option value="maquina">Máquina</option>
                  <option value="corporal">Corporal</option>
                  <option value="banda">Banda</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Notas técnicas (opcional)</label>
              <input type="text" id="custom-ej-notas" class="form-input" placeholder="Indicaciones de postura o recorrido">
            </div>
            <button type="submit" class="btn-primary">${tieneDestino ? '✓ Guardar y Sumar Ahora' : '✓ Guardar en el Catálogo'}</button>
          </form>
        </div>
      `;
      return;
    }

    // MODAL 5: Visor de Posición Inicial y Final (100% libre de GIFs externos y sin costos)
    if (activeModal.type === 'view-ejercicio') {
      const legacyIdMap = {
        'ej-act-cat-camel': 'ej-act-gato-camello',
        'ej-press-banca-plano': 'ej-press-banca',
        'ej-amrap-kettlebell-swing': 'ej-amrap-kb-swing'
      };
      const lookupId = legacyIdMap[activeModal.ejercicioId] || activeModal.ejercicioId;
      const ejCatalog = Engine.CATALOGO_EJERCICIOS.find(e => e.id === lookupId);
      const ejState = (state.ejercicios || []).find(e => e.id === lookupId || e.id === activeModal.ejercicioId);
      const ej = ejState
        ? { ...ejCatalog, ...ejState }
        : (ejCatalog || { id: lookupId, nombre: 'Ejercicio', grupoMuscular: 'pecho', equipo: 'barra', notas: '' });

      const media = Engine.resolveEjercicioMedia(ej);

      overlay.innerHTML = `
        <div class="modal-card" style="max-width: 680px;">
          <div class="card-header">
            <div>
              <span class="badge badge-blue">Posición Inicial y Final</span>
              <h2 class="card-title" style="margin-top: 4px; color: var(--text-main); font-size: 18px;">${h(ej.nombre)}</h2>
              <div style="display: flex; gap: 6px; margin-top: 4px; font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 700; flex-wrap: wrap;">
                <span>Segmento: ${h(ej.grupoMuscular)}</span> • <span>Equipo: ${h(ej.equipo)}</span> • <span>Músculo activo: ${h(ej.musculoActivo || ej.grupoMuscular)}</span>
              </div>
            </div>
            <button type="button" class="btn-close-modal" data-action="close-modal" title="Cerrar (Esc)">✕</button>
          </div>

          <!-- Lámina Anatómica de Posición Inicial y Posición Final -->
          <div class="exercise-illustration-card">
            ${media.illustrationUrl ? `
              <img src="${h(media.illustrationUrl)}" alt="${h(ej.nombre)} - Posición Inicial y Final" class="exercise-illustration-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
              <div style="display: none; width: 100%; min-height: 180px; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; text-align: center; color: #1e293b; background: #ffffff; border-radius: var(--radius-md);">
                <div style="margin-bottom: 8px; color: #2563eb;">${renderIcon('dumbbell')}</div>
                <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">${h(ej.nombre)}</div>
                <div style="font-size: 12px; color: #64748b;">Demostración de postura inicial y final guiada por tu profesor de sala.</div>
              </div>
            ` : `
              <div style="display: flex; width: 100%; min-height: 180px; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; text-align: center; color: #1e293b; background: #ffffff; border-radius: var(--radius-md);">
                <div style="margin-bottom: 8px; color: #2563eb;">${renderIcon('dumbbell')}</div>
                <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">${h(ej.nombre)}</div>
                <div style="font-size: 12px; color: #64748b;">Demostración de postura inicial y final guiada por tu profesor de sala.</div>
              </div>
            `}
          </div>

          <!-- Pautas Técnicas -->
          <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px; font-size: 12px;">
            <div style="font-weight: 800; color: var(--text-main); margin-bottom: 4px; text-transform: uppercase; font-size: 11px;">
              Ejecución Técnica:
            </div>
            <p style="color: var(--text-muted); line-height: 1.5; margin: 0;">
              ${h(ej.notas || 'Control estricto de la fase excéntrica y recorrido completo manteniendo estabilidad central.')}
            </p>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
            <span style="font-size: 11px; color: var(--text-dim);">Presioná <strong>Esc</strong> para cerrar</span>
            <button type="button" class="btn-primary" data-action="close-modal" style="width: auto; min-height: 38px;">
              Cerrar (Esc)
            </button>
          </div>
        </div>
      `;
      return;
    }

    // MODAL 6: Prescripción de Movilidad Articular Específica
    if (activeModal.type === 'add-movilidad') {
      const catalogoMovilidad = (state.ejercicios || []).filter(e => !e.deleted && e.grupoMuscular === 'movilidad');
      overlay.innerHTML = `
        <div class="modal-card">
          <div class="card-header">
            <div>
              <span class="badge badge-neon">Segmento Movilidad</span>
              <h2 class="card-title" style="margin-top: 4px; color: var(--text-main);">+ Añadir Movilidad a la Rutina de Hoy</h2>
            </div>
            <button type="button" class="btn-close-modal" data-action="close-modal" title="Cerrar">✕</button>
          </div>
          <form data-action="submit-movilidad" style="display: flex; flex-direction: column; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Elegir del Catálogo de Movilidad (o editar nombre abajo)</label>
              <select id="mov-catalogo-select" class="form-input" data-action="select-movilidad-preset">
                ${catalogoMovilidad.map(m => `
                  <option value="${h(m.id)}" data-nombre="${h(m.nombre)}" data-series="${m.seriesSugeridas || 2}" data-reps="${h(m.repsSugeridas || '15')}" data-peso="${m.pesoSugerido || 0}" data-notas="${h(m.notas || '')}">
                    ${h(m.nombre)} (${m.seriesSugeridas || 2}×${h(m.repsSugeridas || '15')}${m.pesoSugerido ? ` · ${m.pesoSugerido}kg` : ''})
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Nombre del Ejercicio de Movilidad</label>
              <input type="text" id="mov-nombre" class="form-input" placeholder="Ej: Puente de glúteo uni, Gato - Camello..." value="Puente de Glúteo Unilateral" required>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
              <div class="form-group">
                <label class="form-label">Series</label>
                <input type="number" id="mov-series" class="form-input" value="2" min="1" max="10">
              </div>
              <div class="form-group">
                <label class="form-label">Repeticiones</label>
                <input type="text" id="mov-reps" class="form-input" value="15" placeholder="Ej: 15">
              </div>
              <div class="form-group">
                <label class="form-label">Carga / Peso (kg)</label>
                <input type="number" step="0.5" id="mov-peso" class="form-input" value="15" placeholder="Ej: 15">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Indicación / Detalle de Ejecución</label>
              <input type="text" id="mov-notas" class="form-input" value="Mantener 2 seg arriba contrayendo glúteo fuerte" placeholder="Ej: Mantener 2 seg arriba contrayendo glúteo">
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;">
              <button type="button" class="btn-secondary" data-action="close-modal">Cancelar</button>
              <button type="submit" class="btn-primary" style="width: auto;">+ Añadir Movilidad a Hoy</button>
            </div>
          </form>
        </div>
      `;
      return;
    }

    // MODAL 7: Constructor de Rutina AMRAP (Rutina dentro del día con múltiples ejercicios y tiempo)
    if (activeModal.type === 'amrap-builder') {
      const todosEjercicios = (state.ejercicios || []).filter(e => !e.deleted);
      overlay.innerHTML = `
        <div class="modal-card" style="max-width: 640px;">
          <div class="card-header">
            <div>
              <span class="badge badge-neon">Rutina AMRAP dentro del Día</span>
              <h2 class="card-title" style="margin-top: 4px; color: var(--text-main);">Armar Rutina AMRAP (Varios Ejercicios)</h2>
              <p style="font-size: 12px; color: var(--text-dim);">
                Agregá todos los ejercicios que componen tu bloque AMRAP de hoy y definí el tiempo de trabajo por ejercicio y el descanso entre ellos.
              </p>
            </div>
            <button type="button" class="btn-close-modal" data-action="close-modal" title="Cerrar">✕</button>
          </div>

          <div class="form-group">
            <label class="form-label">Nombre de la Rutina AMRAP</label>
            <input type="text" id="amrap-nombre" class="form-input" value="${h(draftAmrap.nombre)}" placeholder="Ej: Rutina AMRAP Metabólica del Día">
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            <div class="form-group">
              <label class="form-label">Tiempo por Ejercicio (seg)</label>
              <input type="number" id="amrap-trabajo-seg" class="form-input" value="${draftAmrap.tiempoTrabajoSeg}" step="5" min="10">
            </div>
            <div class="form-group">
              <label class="form-label">Descanso entre ellos (seg)</label>
              <input type="number" id="amrap-descanso-seg" class="form-input" value="${draftAmrap.tiempoDescansoSeg}" step="5" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">Rondas Objetivo</label>
              <input type="number" id="amrap-rondas" class="form-input" value="${draftAmrap.rondasObjetivo}" min="1" max="20">
            </div>
          </div>

          <!-- Agregar ejercicio al circuito AMRAP -->
          <div style="background: var(--bg-elevated); padding: 12px; border-radius: var(--radius-md); display: flex; gap: 8px; align-items: end; flex-wrap: wrap;">
            <div style="flex: 2; min-width: 180px;">
              <label class="form-label" style="font-size: 10px;">Sumar ejercicio del catálogo al AMRAP</label>
              <select id="amrap-add-ej-select" class="form-input" style="min-height: 38px;">
                ${todosEjercicios.map(e => `
                  <option value="${h(e.id)}" ${e.grupoMuscular === 'amrap' ? 'selected' : ''}>
                    [${h(e.grupoMuscular.toUpperCase())}] ${h(e.nombre)}
                  </option>
                `).join('')}
              </select>
            </div>
            <div style="flex: 1; min-width: 100px;">
              <label class="form-label" style="font-size: 10px;">Reps / Meta</label>
              <input type="text" id="amrap-add-ej-reps" class="form-input" value="12 reps" style="min-height: 38px;">
            </div>
            <button type="button" class="btn-primary" data-action="add-ej-to-draft-amrap" style="width: auto; min-height: 38px; padding: 0 14px;">
              + Sumar al AMRAP
            </button>
          </div>

          <!-- Lista de ejercicios en el AMRAP -->
          <div style="display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto;">
            ${draftAmrap.ejercicios.length === 0 ? `
              <p style="font-size: 12px; color: var(--text-dim); text-align: center; padding: 12px;">Sin ejercicios en el AMRAP. Sumá todos los ejercicios que quieras arriba.</p>
            ` : draftAmrap.ejercicios.map((ae, idx) => `
              <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-elevated); padding: 10px 12px; border-radius: var(--radius-sm); font-size: 13px;">
                <div>
                  <strong style="color: var(--text-main);">${idx + 1}. ${h(ae.nombre)}</strong>
                  <span style="font-size: 11.5px; color: var(--text-dim); font-family: var(--font-mono); margin-left: 8px;">${h(ae.repsObjetivo)}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(ae.ejercicioId)}" title="Ver posición inicial y final">${renderIcon('eye')}</button>
                  <button type="button" data-action="remove-draft-amrap-ej" data-index="${idx}" style="color: var(--text-dim); font-weight: 900;">✕</button>
                </div>
              </div>
            `).join('')}
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;">
            <button type="button" class="btn-secondary" data-action="close-modal" style="width: auto;">Cancelar</button>
            <button type="button" class="btn-primary" data-action="save-amrap-block" style="width: auto;">
              ✓ Guardar Rutina AMRAP en Hoy
            </button>
          </div>
        </div>
      `;
      return;
    }

    // MODAL 8: Editar o Reemplazar un Ejercicio de la Sesión de Hoy
    if (activeModal.type === 'edit-sesion-ej') {
      const todosEjercicios = (state.ejercicios || []).filter(e => !e.deleted);
      overlay.innerHTML = `
        <div class="modal-card">
          <div class="modal-header-sticky">
            <div>
              <span class="badge badge-blue">Modificar Ejercicio de Hoy</span>
              <h2 class="card-title" style="margin-top: 4px; color: var(--text-main);">Cambiar o Editar Ejercicio</h2>
            </div>
            <button type="button" class="btn-close-modal" data-action="close-modal" title="Cerrar">✕</button>
          </div>

          <form data-action="submit-edit-sesion-ej" style="display: flex; flex-direction: column; gap: 12px;">
            <input type="hidden" id="edit-sesion-tr-id" value="${h(activeModal.entrenamientoId || '')}">
            <input type="hidden" id="edit-sesion-old-ej-id" value="${h(activeModal.ejercicioId || '')}">

            <div class="form-group">
              <label class="form-label">Elegir Ejercicio (podés cambiarlo por otro del catálogo)</label>
              <select id="edit-sesion-new-ej-id" class="form-input">
                ${todosEjercicios.map(e => `
                  <option value="${h(e.id)}" ${e.id === activeModal.ejercicioId ? 'selected' : ''}>
                    [${h(e.grupoMuscular.toUpperCase())}] ${h(e.nombre)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div class="form-group">
                <label class="form-label">Series Objetivo</label>
                <input type="number" id="edit-sesion-series" class="form-input" value="${h(activeModal.series || '3')}" min="1" max="15">
              </div>
              <div class="form-group">
                <label class="form-label">Repeticiones / Meta</label>
                <input type="text" id="edit-sesion-reps" class="form-input" value="${h(activeModal.reps || '8-12')}" placeholder="Ej: 8-12">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Nota o Indicación Personal</label>
              <input type="text" id="edit-sesion-notas" class="form-input" value="${h(activeModal.notas || '')}" placeholder="Ej: Controlar bajada 2 segundos">
            </div>

            <div style="display: flex; justify-content: space-between; gap: 8px; margin-top: 4px; flex-wrap: wrap;">
              <button type="button" class="btn-secondary" data-action="delete-sesion-ej" data-ejercicio-id="${h(activeModal.ejercicioId || '')}" data-entrenamiento-id="${h(activeModal.entrenamientoId || '')}" style="width: auto; color: var(--accent-rose); border-color: rgba(239,68,68,0.4);">
                ✕ Quitar de Hoy
              </button>
              <div style="display: flex; gap: 8px;">
                <button type="button" class="btn-secondary" data-action="close-modal" style="width: auto;">Cancelar</button>
                <button type="submit" class="btn-primary" style="width: auto;">✓ Guardar Cambios</button>
              </div>
            </div>
          </form>
        </div>
      `;
      return;
    }

    // MODAL 8b: Resumen al terminar la sesión
    if (activeModal.type === 'resumen-sesion') {
      const r = Engine.resumenEntrenamiento(state, activeModal.entrenamientoId);
      if (!r) { activeModal = null; overlay.remove(); return; }
      const dur = r.duracionMin != null ? `${r.duracionMin} min` : '—';
      const textoShare = `Entrenamiento ${r.fecha}\n${dur} · ${r.series} series · ${Math.round(r.volumen).toLocaleString('es-AR')} kg movidos` +
        (r.prs.length ? `\nRécords: ${r.prs.map(p => `${p.nombre} ${p.pesoKg} kg × ${p.reps}`).join(', ')}` : '') +
        `\n${r.ejercicios.map(e => `• ${e.nombre}: ${e.series} series${e.mejor ? ` · mejor ${e.mejor.pesoKg} kg × ${e.mejor.reps}` : ''}`).join('\n')}\n— Fitness MiniApp`;
      overlay.innerHTML = `
        <div class="modal-card resumen-card">
          <div class="modal-header-sticky">
            <div>
              <span class="badge badge-emerald">Sesión guardada</span>
              <h2 class="card-title" style="margin-top: 4px;">${r.prs.length ? 'Excelente sesión' : 'Buen trabajo'}</h2>
            </div>
            <button type="button" class="btn-close-modal" data-action="close-modal" title="Cerrar">${renderIcon('x')}</button>
          </div>
          <div class="resumen-kpis">
            <div><span>Duración</span><strong>${h(dur)}</strong></div>
            <div><span>Series</span><strong>${r.series}</strong></div>
            <div><span>Volumen</span><strong>${Math.round(r.volumen).toLocaleString('es-AR')} <small>kg</small></strong></div>
          </div>
          ${r.prs.length ? `<div class="resumen-prs">${r.prs.map(p => `<div><strong>PR · ${h(p.nombre)}</strong>: ${p.tipo === 'peso' ? `nuevo peso máximo ${p.pesoKg} kg × ${p.reps}${p.previo ? ` (antes ${p.previo} kg)` : ''}` : `${p.pesoKg} kg × ${p.reps} → 1RM estimado ${p.rm} kg${p.previo ? ` (antes ${p.previo})` : ' (primer registro)'}`}</div>`).join('')}</div>` : ''}
          <div class="resumen-list">
            ${r.ejercicios.length ? r.ejercicios.map(e => `
              <div class="resumen-row">
                <span>${h(e.nombre)}${e.pr ? ' (PR)' : ''}</span>
                <span class="mono">${e.series} × ${e.mejor ? `${e.mejor.pesoKg} kg · ${e.mejor.reps} reps` : '—'}</span>
              </div>`).join('') : '<p style="font-size: 13px; color: var(--text-dim);">No se registraron series en esta sesión.</p>'}
          </div>
          <div class="form-group" style="margin-top: 8px;">
            <label class="form-label" for="resumen-nota">¿Cómo te sentiste? (opcional)</label>
            <textarea id="resumen-nota" class="form-input" rows="2" placeholder="Ej: hombro derecho molestó en el press, bajar peso la próxima">${h(r.entrenamiento.notas || '')}</textarea>
          </div>
          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <button type="button" class="btn-secondary" data-action="share-resumen" data-texto="${h(textoShare)}">Compartir</button>
            <button type="button" class="btn-primary" data-action="save-session-note" data-entrenamiento-id="${h(r.entrenamiento.id)}">Listo</button>
          </div>
        </div>
      `;
      return;
    }

    // MODAL 9: Buzón de Sugerencias (Simplificado, sin listado inferior ni botón WhatsApp, y botón unificado de Foto)
    if (activeModal.type === 'sugerencias') {
      overlay.innerHTML = `
        <div class="modal-card" style="max-width: 460px; padding: 16px; gap: 12px;">
          <div class="modal-header-sticky" style="padding: 2px 0 8px 0;">
            <div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span class="badge badge-neon">Sincronización Nube</span>
                <span class="online-status-indicator" style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: ${navigator.onLine ? '#22C55E' : '#F97316'};">
                  <span style="width: 7px; height: 7px; border-radius: 50%; background: ${navigator.onLine ? '#22C55E' : '#F97316'}; display: inline-block;"></span>
                  ${navigator.onLine ? 'Online' : 'Offline'}
                </span>
              </div>
              <h2 class="card-title" style="font-size: 17px; margin-top: 3px; color: var(--text-main);">Enviar Sugerencia</h2>
            </div>
            <button type="button" class="btn-close-modal" data-action="close-modal" title="Cerrar ventana">${renderIcon('x')}</button>
          </div>

          <form data-action="submit-sugerencia" style="display: flex; flex-direction: column; gap: 10px;">
            <div class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <label class="form-label" for="sug-mensaje">¿Qué te gustaría mejorar o agregar?</label>
                <button type="button" class="btn-dictar ${isDictatingSugerencia ? 'listening' : ''}" data-action="dictar-sugerencia" style="padding: 5px 10px; font-size: 12px !important; display:inline-flex; align-items:center; gap:5px;">
                  ${renderIcon('mic')} ${isDictatingSugerencia ? 'Detener' : 'Dictar'}
                </button>
              </div>
              <textarea id="sug-mensaje" class="form-input" rows="3" placeholder="Escribí o dictá tu sugerencia acá..." required>${h(draftSugerenciaTexto)}</textarea>
            </div>

            <!-- Botón Único de Foto (despliega las 2 opciones: Adjuntar o Pegar) -->
            <div class="form-group">
              <button type="button" class="btn-secondary" data-action="toggle-photo-options" style="justify-content: center; gap: 6px;">
                ${renderIcon('camera')} Foto: Adjuntar o Pegar${draftSugerenciaCapturas.length > 0 ? ` (${draftSugerenciaCapturas.length})` : ''} ${showPhotoOptions ? renderIcon('chevronUp') : renderIcon('chevronDown')}
              </button>

              ${showPhotoOptions ? `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: var(--bg-elevated); padding: 8px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                  <label class="btn-secondary btn-sm" style="cursor: pointer; width: 100% !important; justify-content: center;">
                    ${renderIcon('camera')} Elegir / Cámara
                    <input type="file" accept="image/*" multiple data-action="upload-sugerencia-capturas" style="display: none;">
                  </label>
                  <button type="button" class="btn-secondary btn-sm" data-action="paste-clipboard-image" style="width: 100% !important; justify-content: center;">
                    ${renderIcon('clipboard')} Pegar Copiada
                  </button>
                </div>
              ` : ''}

              ${draftSugerenciaCapturas.length > 0 ? `
                <div class="sug-capturas-grid" style="margin-top: 6px;">
                  ${draftSugerenciaCapturas.map((cap, cIdx) => `
                    <div class="sug-captura-thumb">
                      <img src="${cap}" alt="Captura ${cIdx + 1}">
                      <button type="button" class="sug-captura-remove" data-action="remove-draft-sug-captura" data-index="${cIdx}" title="Quitar captura">✕</button>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px;">
              <button type="button" class="btn-secondary" data-action="close-modal" style="width: auto;">Cancelar</button>
              <button type="submit" class="btn-primary" style="width: auto;">✓ Enviar Sugerencia</button>
            </div>
          </form>
        </div>
      `;
      return;
    }
  }

  // ==========================================
  // 10. RENDER PRINCIPAL ADAPTATIVO (SIN SELECTOR MANUAL)
  // ==========================================
  function render() {
    const root = document.getElementById('app-root');
    if (!root) return;

    const user = Store.user;
    const state = Store.getState();

    if (!user) {
      root.innerHTML = renderAuthView() + `<div id="toast-container"></div>`;
      renderModals();
      return;
    }

    // Preservar los borradores del Check-in y de la Ficha Física antes de re-renderizar
    captureSaludDraftsFromDOM();

    // Detección automática estricta: PC abre PC, Celular abre Celular
    layoutMode = getAutoLayoutMode();

    let bodyHtml = '';
    if (layoutMode === 'phone-alumno') {
      bodyHtml = renderTraineePhoneLayout(state, user);
    } else if (layoutMode === 'pc-alumno') {
      bodyHtml = renderTraineePCLayout(state, user);
    } else {
      bodyHtml = renderTrainerPCInterface();
    }

    root.innerHTML = `
      ${bodyHtml}
      <div id="floating-timer-container"></div>
      <div id="toast-container"></div>
    `;

    renderFloatingTimer();
    renderModals();
    initDragSort();
    syncWakeLock(Boolean(state && state.entrenamientoActivoId));
  }

  // ==========================================
  // 10b. PANTALLA ENCENDIDA DURANTE LA SESIÓN (Wake Lock)
  // ==========================================
  let wakeLock = null;
  async function syncWakeLock(activo) {
    try {
      if (!('wakeLock' in navigator)) return;
      if (activo && !wakeLock && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!activo && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (_) { wakeLock = null; /* el navegador puede negarlo (batería baja, pestaña oculta) */ }
  }
  document.addEventListener('visibilitychange', () => {
    const st = Store.getState && Store.getState();
    if (document.visibilityState === 'visible' && st && st.entrenamientoActivoId) syncWakeLock(true);
  });

  // ==========================================
  // 10c. ARRASTRAR PARA ORDENAR (⋮⋮) — movilidad y ejercicios de la sesión
  // ==========================================
  let dragState = null;
  function initDragSort() {
    document.querySelectorAll('[data-drag-handle]').forEach(handle => {
      if (handle.dataset.dragReady) return;
      handle.dataset.dragReady = '1';
      handle.addEventListener('pointerdown', onDragStart);
    });
  }
  function onDragStart(e) {
    const handle = e.currentTarget;
    const item = handle.closest('[data-drag-id]');
    const list = handle.closest('[data-drag-list]');
    if (!item || !list) return;
    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    const items = Array.from(list.querySelectorAll(':scope > [data-drag-id]'));
    dragState = { handle, item, list, items, startY: e.clientY, fromIndex: items.indexOf(item), toIndex: items.indexOf(item), moved: false, lastY: e.clientY };
    item.classList.add('dragging');
    document.body.classList.add('drag-active');
    if (navigator.vibrate) { try { navigator.vibrate(20); } catch (_) {} }
    handle.addEventListener('pointermove', onDragMove);
    handle.addEventListener('pointerup', onDragEnd);
    handle.addEventListener('pointercancel', onDragEnd);
  }
  function onDragMove(e) {
    if (!dragState) return;
    e.preventDefault();
    const dy = e.clientY - dragState.startY;
    dragState.lastY = e.clientY;
    if (Math.abs(dy) > 4) dragState.moved = true;
    dragState.item.style.transform = `translateY(${dy}px)`;
    // ¿Sobre qué ítem está el centro del que arrastro?
    const rect = dragState.item.getBoundingClientRect();
    const centro = rect.top + rect.height / 2;
    let to = dragState.fromIndex;
    dragState.items.forEach((other, i) => {
      if (other === dragState.item) return;
      const r = other.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (i < dragState.fromIndex && centro < mid) to = Math.min(to, i);
      if (i > dragState.fromIndex && centro > mid) to = Math.max(to, i);
    });
    if (to !== dragState.toIndex) {
      dragState.toIndex = to;
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
    }
    dragState.items.forEach((other, i) => {
      if (other === dragState.item) return;
      let shift = 0;
      if (dragState.fromIndex < to && i > dragState.fromIndex && i <= to) shift = -rect.height - 8;
      if (dragState.fromIndex > to && i >= to && i < dragState.fromIndex) shift = rect.height + 8;
      other.style.transform = shift ? `translateY(${shift}px)` : '';
    });
    // Auto-scroll suave cerca de los bordes
    const margen = 70;
    if (e.clientY < margen) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - margen) window.scrollBy(0, 12);
  }
  function onDragEnd() {
    if (!dragState) return;
    const { handle, item, list, items, fromIndex, toIndex, moved } = dragState;
    handle.removeEventListener('pointermove', onDragMove);
    handle.removeEventListener('pointerup', onDragEnd);
    handle.removeEventListener('pointercancel', onDragEnd);
    items.forEach(x => { x.style.transform = ''; x.classList.remove('dragging'); });
    document.body.classList.remove('drag-active');
    dragState = null;
    if (!moved || toIndex === fromIndex) return;
    const tipo = list.getAttribute('data-drag-list');
    const id = item.getAttribute('data-drag-id');
    if (tipo === 'movilidad') {
      Store.commit(s => Engine.moverMovilidad(s, id, toIndex));
    } else if (tipo === 'sesion') {
      const orden = items.map(x => x.getAttribute('data-drag-id'));
      orden.splice(fromIndex, 1);
      orden.splice(toIndex, 0, id);
      const entId = Store.getState().entrenamientoActivoId;
      Store.commit(s => Engine.ordenarEjerciciosSesion(s, entId, orden));
    }
    render();
  }

  function renderFloatingTimer() {
    const container = document.getElementById('floating-timer-container');
    if (container) container.innerHTML = '';
  }

  // ==========================================
  // 11. ACCIONES POR DELEGACIÓN (PROHIBIDO ONCLICK INLINE)
  // ==========================================
  const actions = {
    'set-layout-mode': el => {
      const mode = el.getAttribute('data-mode');
      if (mode) {
        layoutMode = mode;
        render();
      }
    },

    'switch-tab': el => {
      const tab = el.getAttribute('data-tab');
      if (tab) {
        captureSaludDraftsFromDOM();
        activeTab = tab;
        render();
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
    },

    'set-theme-pref': el => {
      const val = el.getAttribute('data-theme-val') || 'dark';
      if (Store.setThemePreference) {
        Store.setThemePreference(val);
      }
      render();
    },

    'set-aesthetic-bg': el => {
      const bg = el.getAttribute('data-bg') || 'zinc';
      Store.setAestheticPreference({ bgStyle: bg });
      render();
    },

    'set-aesthetic-pattern': el => {
      const pattern = el.getAttribute('data-pattern') || 'none';
      Store.setAestheticPreference({ bgPattern: pattern });
      showToast('✓ Fondo actualizado');
      render();
    },

    'set-aesthetic-accent': el => {
      const color = el.getAttribute('data-color') || '#3B82F6';
      Store.setAestheticPreference({ accentColor: color });
      render();
    },

    'set-aesthetic-logo-dumbbell': el => {
      const color = el.getAttribute('data-color') || '#3B82F6';
      Store.setAestheticPreference({ logoDumbbell: color });
      render();
    },

    'set-aesthetic-logo-bg': el => {
      const color = el.getAttribute('data-color') || '#18181B';
      Store.setAestheticPreference({ logoBg: color });
      render();
    },

    'reset-aesthetic-pref': () => {
      Store.setAestheticPreference({
        bgStyle: 'zinc',
        bgPattern: 'none',
        accentColor: '#3B82F6',
        accentName: 'Azul Eléctrico',
        logoBg: '#18181B',
        logoDumbbell: '#3B82F6'
      });
      showToast('✓ Colores y fondo restablecidos');
      render();
    },

    'check-app-update': () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) {
            reg.update().then(() => {
              showToast(`✓ Versión actual v${APP_VERSION}. Buscando si hay nuevas versiones en GitHub/Vercel...`);
            });
          } else {
            showToast(`Versión v${APP_VERSION} al día.`);
          }
        }).catch(() => {
          showToast(`Versión v${APP_VERSION} instalada.`);
        });
      } else {
        showToast(`Versión v${APP_VERSION} al día.`);
      }
    },

    'quick-demo-login': el => {
      const username = el.getAttribute('data-username');
      const mode = el.getAttribute('data-mode');
      const res = Store.login(username, '1234', true);
      if (res.ok) {
        syncSaludDraftsWithState(Store.getState(), true);
        layoutMode = mode || (res.user.role === 'profesor' ? 'pc-profesor' : 'phone-alumno');
        showToast(`Sesión iniciada como ${res.user.displayName}`);
        render();
      }
    },

    'submit-login': () => {
      const u = document.getElementById('login-username').value;
      const p = document.getElementById('login-pin').value;
      const res = Store.login(u, p);
      if (res.ok) {
        syncSaludDraftsWithState(Store.getState(), true);
        layoutMode = res.user.role === 'profesor'
          ? 'pc-profesor'
          : (window.innerWidth >= 960 ? 'pc-alumno' : 'phone-alumno');
        showToast(`¡Bienvenido, ${res.user.displayName}!`);
        render();
      } else {
        showToast(res.error || 'Error al iniciar sesión');
      }
    },

    'login-biometrics': async () => {
      const u = document.getElementById('login-username')?.value || 'juan';
      const res = await Store.loginWithBiometrics(u);
      if (res.ok) {
        syncSaludDraftsWithState(Store.getState(), true);
        showToast('✓ Acceso biométrico verificado');
        render();
      } else {
        showToast(res.error);
      }
    },

    'open-register-modal': () => {
      activeModal = { type: 'register' };
      renderModals();
    },

    'close-modal': () => {
      if (activeSpeechRecognition) {
        try { activeSpeechRecognition.abort(); } catch (_) {}
        try { activeSpeechRecognition.stop(); } catch (_) {}
        activeSpeechRecognition = null;
      }
      isDictatingSugerencia = false;
      if (activeModal && activeModal.type === 'view-ejercicio' && previousModal) {
        activeModal = previousModal;
        previousModal = null;
      } else {
        activeModal = null;
        previousModal = null;
      }
      renderModals();
    },

    'submit-register': () => {
      const role = document.getElementById('reg-role').value;
      const username = document.getElementById('reg-username').value;
      const displayName = document.getElementById('reg-display').value;
      const password = document.getElementById('reg-pin').value;

      const res = Store.register({ username, displayName, email: '', password, role });
      if (res.ok) {
        activeModal = null;
        syncSaludDraftsWithState(Store.getState(), true);
        layoutMode = role === 'profesor'
          ? 'pc-profesor'
          : (window.innerWidth >= 960 ? 'pc-alumno' : 'phone-alumno');
        showToast(`¡Cuenta limpia creada! Código: ${res.user.codigoAlumno}`);
        render();
      } else {
        showToast(res.error);
      }
    },

    'logout': () => {
      Store.logout();
      // Que los borradores de Salud no queden con los datos del usuario anterior
      draftReadiness.userKey = null;
      draftPerfil.userKey = null;
      render();
    },

    'copy-alumno-code': el => {
      const code = el.getAttribute('data-code');
      if (navigator.clipboard && code) {
        navigator.clipboard.writeText(code);
      }
      showToast(`Código ${code} copiado. Pasáselo a tu profesor para vincular tu cuenta.`);
    },

    // --- CONSTRUCTOR DE RUTINAS CON CATÁLOGO ---
    'open-rutina-builder': el => {
      const targetUser = el.getAttribute('data-target-username') || null;
      draftRutina = {
        id: null,
        targetUsername: targetUser,
        nombre: '',
        dias: ['Lunes', 'Miércoles', 'Viernes'],
        horario: '19:00',
        ejercicios: []
      };
      activeModal = { type: 'rutina-builder' };
      renderModals();
    },

    'edit-rutina': el => {
      const rutinaId = el.getAttribute('data-rutina-id');
      const targetUser = el.getAttribute('data-target-username') || null;
      const st = targetUser ? Store.getUserState(targetUser) : Store.getState();
      const r = (st.rutinas || []).find(item => item.id === rutinaId);
      if (!r) return;

      draftRutina = {
        id: r.id,
        targetUsername: targetUser,
        nombre: r.nombre,
        dias: Array.isArray(r.dias) ? [...r.dias] : ['Lunes'],
        horario: r.horario || '19:00',
        ejercicios: Array.isArray(r.ejercicios) ? [...r.ejercicios] : []
      };
      activeModal = { type: 'rutina-builder' };
      renderModals();
    },

    'toggle-builder-dia': el => {
      const dia = el.getAttribute('data-dia');
      const nombreInput = document.getElementById('builder-rutina-nombre');
      const horarioInput = document.getElementById('builder-rutina-horario');
      if (nombreInput) draftRutina.nombre = nombreInput.value;
      if (horarioInput) draftRutina.horario = horarioInput.value;

      if (draftRutina.dias.includes(dia)) {
        draftRutina.dias = draftRutina.dias.filter(d => d !== dia);
      } else {
        draftRutina.dias.push(dia);
      }
      renderModals();
    },

    'open-catalog-from-builder': () => {
      const nombreInput = document.getElementById('builder-rutina-nombre');
      const horarioInput = document.getElementById('builder-rutina-horario');
      if (nombreInput) draftRutina.nombre = nombreInput.value;
      if (horarioInput) draftRutina.horario = horarioInput.value;

      activeModal = { type: 'catalog-picker', returnToBuilder: true };
      renderModals();
    },

    'remove-draft-ej': el => {
      const idx = Number(el.getAttribute('data-index'));
      draftRutina.ejercicios = draftRutina.ejercicios.filter((_, i) => i !== idx);
      renderModals();
    },

    'save-built-rutina': () => {
      const nombreInput = document.getElementById('builder-rutina-nombre');
      const horarioInput = document.getElementById('builder-rutina-horario');
      if (nombreInput) draftRutina.nombre = nombreInput.value.trim();
      if (horarioInput) draftRutina.horario = horarioInput.value;

      const payload = {
        id: draftRutina.id,
        nombre: draftRutina.nombre || 'Rutina Personalizada',
        dias: draftRutina.dias.length > 0 ? draftRutina.dias : ['Lunes'],
        horario: draftRutina.horario || '19:00',
        creadaPor: draftRutina.targetUsername ? 'Profesor' : 'Alumno',
        ejercicios: draftRutina.ejercicios
      };

      const mutator = st =>
        draftRutina.id ? Engine.actualizarRutina(st, payload) : Engine.crearRutina(st, payload);

      if (draftRutina.targetUsername) {
        Store.commitForUser(draftRutina.targetUsername, mutator);
        showToast('✓ Rutina establecida en la cuenta del alumno.');
      } else {
        Store.commit(mutator);
        showToast('✓ Rutina guardada con éxito.');
      }

      activeModal = null;
      render();
    },

    'open-catalog-picker': el => {
      const mode = el.getAttribute('data-mode') || 'workout';
      const filterGroup = el.getAttribute('data-filter-group');
      if (filterGroup) {
        catalogoFiltroGrupo = filterGroup;
      }
      const bloque = el.getAttribute('data-bloque') || null;
      const rutinaId = el.getAttribute('data-rutina-id') || null;
      const amrapId = el.getAttribute('data-amrap-id') || null;
      const targetUser = el.getAttribute('data-target-username') || null;
      draftRutina.targetUsername = targetUser;
      activeModal = { type: 'catalog-picker', mode, bloque, rutinaId, amrapId, targetUser };
      renderModals();
    },

    'open-catalog-for-workout': () => {
      catalogoFiltroGrupo = 'todos';
      activeModal = { type: 'catalog-picker', mode: 'workout' };
      renderModals();
    },

    'save-today-as-routine': () => {
      const st = Store.getState();
      const entActivo = Engine.getEntrenamientoActivo(st);
      if (!entActivo) {
        showToast('No tenés un entrenamiento activo.');
        return;
      }
      const nombre = `Rutina de ${Engine.diaDeLaSemana(Engine.todayISO())}`;
      Store.commit(s => Engine.guardarSesionComoRutina(s, nombre));
      showToast('✓ Rutina guardada');
      render();
    },

    'filter-catalog-modal': el => {
      catalogoFiltroGrupo = el.getAttribute('data-group') || 'todos';
      renderModals();
    },

    'filter-catalog-group': el => {
      catalogoFiltroGrupo = el.getAttribute('data-group') || 'todos';
      render();
    },

    'pick-catalog-exercise': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const seriesObj = Number(document.getElementById('picker-series')?.value) || 3;
      const repsObj = document.getElementById('picker-reps')?.value || '8-12';
      const pesoObj = parseFloat(document.getElementById('picker-peso')?.value) || 0;

      const st = Store.getState();
      const ejObj = (st.ejercicios || []).find(e => e.id === ejId)
        || Engine.CATALOGO_EJERCICIOS.find(e => e.id === ejId)
        || { id: ejId, nombre: 'Ejercicio', grupoMuscular: 'pecho', equipo: 'barra', notas: '' };

      // Caso 1: Veníamos del constructor de rutina
      if (activeModal && activeModal.returnToBuilder) {
        draftRutina.ejercicios.push({
          ejercicioId: ejId,
          nombre: ejObj.nombre,
          seriesObjetivo: seriesObj,
          repsObjetivo: repsObj
        });
        activeModal = { type: 'rutina-builder' };
        renderModals();
        showToast('+ Ejercicio sumado a la rutina');
        return;
      }

      // Caso 2: Agregar directo a una rutina ya creada (Alumno o Profesor)
      if (activeModal && activeModal.mode === 'append-to-rutina' && activeModal.rutinaId) {
        const rId = activeModal.rutinaId;
        const tUser = activeModal.targetUser;
        const mutator = s =>
          Engine.agregarEjercicioARutina(s, rId, {
            ejercicioId: ejId,
            nombre: ejObj.nombre,
            seriesObjetivo: seriesObj,
            repsObjetivo: repsObj
          });

        if (tUser) {
          Store.commitForUser(tUser, mutator);
        } else {
          Store.commit(mutator);
        }
        activeModal = null;
        showToast('✓ Ejercicio del catálogo agregado a la rutina.');
        render();
        return;
      }

      // Caso 2B: Agregar ejercicio dentro de una rutina AMRAP activa del día
      if (activeModal && activeModal.mode === 'append-to-amrap' && activeModal.amrapId) {
        const targetAmrapId = activeModal.amrapId;
        Store.commit(s =>
          Engine.agregarEjercicioABloqueAmrap(s, targetAmrapId, {
            ejercicioId: ejObj.id,
            nombre: ejObj.nombre,
            repsObjetivo: repsObj || ejObj.repsSugeridas || '12 reps'
          })
        );
        activeModal = null;
        showToast(`✓ "${ejObj.nombre}" sumado a la rutina AMRAP del día.`);
        render();
        return;
      }

      // Caso 3: Agregar a la rutina/módulo de hoy
      const targetBloque = (activeModal && activeModal.bloque)
        || (ejObj.grupoMuscular === 'activacion' ? 'activacion' : (ejObj.grupoMuscular === 'movilidad' ? 'movilidad' : 'A'));
      const targetSeg = targetBloque === 'activacion' ? 'activacion' : (targetBloque === 'movilidad' ? 'movilidad' : 'entrenamiento');

      Store.commit(s => {
        let next = s;
        if (!next.entrenamientoActivoId) {
          next = Engine.iniciarEntrenamiento(next, null);
        }

        next = Engine.agregarEjercicioASesion(next, next.entrenamientoActivoId, {
          ejercicioId: ejObj.id,
          segmento: targetSeg,
          bloque: targetBloque,
          seriesObjetivo: seriesObj || ejObj.seriesSugeridas || 3,
          repsObjetivo: repsObj || ejObj.repsSugeridas || '8-10',
          pesoObjetivo: pesoObj || 0,
          notas: ejObj.notas || ''
        });
        return next;
      });

      activeModal = null;
      activeTab = 'hoy';
      showToast(`✓ "${ejObj.nombre}" añadido.`);
      render();
    },

    'add-catalog-to-today': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const st = Store.getState();
      const ejObj = (st.ejercicios || []).find(e => e.id === ejId)
        || Engine.CATALOGO_EJERCICIOS.find(e => e.id === ejId);
      if (!ejObj) return;

      Store.commit(s => {
        let next = s;
        if (!next.entrenamientoActivoId) {
          next = Engine.iniciarEntrenamiento(next, null);
        }
        if (ejObj.grupoMuscular === 'amrap' || ejObj.esAmrap) {
          return Engine.agregarBloqueAmrap(next, {
            nombre: `Rutina AMRAP · ${ejObj.nombre}`,
            tiempoTrabajoSeg: ejObj.tiempoTrabajoSeg || 40,
            tiempoDescansoSeg: ejObj.tiempoDescansoSeg || 20,
            rondasObjetivo: 4,
            ejercicios: [{ ejercicioId: ejObj.id, nombre: ejObj.nombre, repsObjetivo: ejObj.repsSugeridas || 'Máx reps' }]
          });
        }
        return Engine.agregarEjercicioASesion(next, next.entrenamientoActivoId, {
          ejercicioId: ejObj.id,
          segmento: 'entrenamiento',
          seriesObjetivo: ejObj.seriesSugeridas || 3,
          repsObjetivo: ejObj.repsSugeridas || '8-10',
          notas: ejObj.notas || ''
        });
      });

      activeTab = 'hoy';
      showToast(`✓ "${ejObj.nombre}" añadido a la rutina de hoy.`);
      render();
    },

    'remove-ej-from-rutina': el => {
      const rId = el.getAttribute('data-rutina-id');
      const idx = Number(el.getAttribute('data-index'));
      const tUser = el.getAttribute('data-target-username');
      if (tUser) {
        Store.commitForUser(tUser, s => Engine.quitarEjercicioDeRutina(s, rId, idx));
      } else {
        Store.commit(s => Engine.quitarEjercicioDeRutina(s, rId, idx));
      }
      showToast('Ejercicio quitado de la rutina.');
      render();
    },

    'delete-rutina': el => {
      const rId = el.getAttribute('data-rutina-id');
      const tUser = el.getAttribute('data-target-username');
      if (tUser) {
        Store.commitForUser(tUser, s => Engine.borrarRutina(s, rId));
      } else {
        Store.commit(s => Engine.borrarRutina(s, rId));
      }
      showToast('Rutina eliminada.');
      render();
    },

    'open-create-custom-ejercicio': el => {
      const targetBloque = (el && el.getAttribute('data-bloque')) || (activeModal && activeModal.bloque) || null;
      const defaultGrupo = (el && el.getAttribute('data-grupo')) || '';
      const fromPicker = el && el.getAttribute('data-from-picker') === 'true';
      const returnContext = (fromPicker && activeModal && activeModal.type === 'catalog-picker')
        ? { ...activeModal }
        : null;
      activeModal = { type: 'create-custom-ejercicio', targetBloque, defaultGrupo, returnContext };
      renderModals();
    },

    'submit-custom-ejercicio': () => {
      const nombre = document.getElementById('custom-ej-nombre').value.trim();
      if (!nombre) return;
      const grupoMuscular = document.getElementById('custom-ej-grupo').value;
      const equipo = document.getElementById('custom-ej-equipo').value;
      const notas = document.getElementById('custom-ej-notas').value;

      const ctx = activeModal && activeModal.returnContext;
      const targetBloqueAttr = activeModal && activeModal.targetBloque;

      Store.commit(s => Engine.crearEjercicio(s, { nombre, grupoMuscular, equipo, notas }));
      const stAfter = Store.getState();
      const newEjId = stAfter.lastCreatedEjercicioId || ((stAfter.ejercicios && stAfter.ejercicios[stAfter.ejercicios.length - 1]) || {}).id;

      // Si veníamos de un constructor, rutina, AMRAP o bloque de entrenamiento, sumarlo automáticamente
      if (newEjId && ctx && ctx.returnToBuilder) {
        draftRutina.ejercicios.push({
          ejercicioId: newEjId,
          nombre,
          seriesObjetivo: 3,
          repsObjetivo: '8-12'
        });
        activeModal = { type: 'rutina-builder' };
        showToast(`✓ "${nombre}" creado y sumado a la rutina.`);
        renderModals();
        return;
      }

      if (newEjId && ctx && ctx.mode === 'append-to-rutina' && ctx.rutinaId) {
        const mutator = s => Engine.agregarEjercicioARutina(s, ctx.rutinaId, {
          ejercicioId: newEjId,
          nombre,
          seriesObjetivo: 3,
          repsObjetivo: '8-12'
        });
        if (ctx.targetUser) Store.commitForUser(ctx.targetUser, mutator);
        else Store.commit(mutator);
        activeModal = null;
        showToast(`✓ "${nombre}" creado y agregado a la rutina.`);
        render();
        return;
      }

      if (newEjId && ctx && ctx.mode === 'append-to-amrap' && ctx.amrapId) {
        Store.commit(s => Engine.agregarEjercicioABloqueAmrap(s, ctx.amrapId, {
          ejercicioId: newEjId,
          nombre,
          repsObjetivo: '12 reps'
        }));
        activeModal = null;
        showToast(`✓ "${nombre}" creado y agregado al AMRAP.`);
        render();
        return;
      }

      const bloqueDestino = targetBloqueAttr || (ctx && ctx.bloque);
      if (newEjId && (bloqueDestino || (ctx && ctx.mode === 'workout'))) {
        const resolvedB = bloqueDestino || (grupoMuscular === 'activacion' ? 'activacion' : (grupoMuscular === 'movilidad' ? 'movilidad' : 'A'));
        const resolvedSeg = resolvedB === 'activacion' ? 'activacion' : (resolvedB === 'movilidad' ? 'movilidad' : 'entrenamiento');
        Store.commit(s => {
          let next = s;
          if (!next.entrenamientoActivoId) {
            next = Engine.iniciarEntrenamiento(next, null);
          }
          return Engine.agregarEjercicioASesion(next, next.entrenamientoActivoId, {
            ejercicioId: newEjId,
            segmento: resolvedSeg,
            bloque: resolvedB,
            seriesObjetivo: resolvedB === 'activacion' || resolvedB === 'movilidad' ? 2 : 3,
            repsObjetivo: resolvedB === 'activacion' || resolvedB === 'movilidad' ? '12' : '8-12',
            notas
          });
        });
        activeModal = null;
        activeTab = 'hoy';
        showToast(`✓ "${nombre}" creado y sumado.`);
        render();
        return;
      }

      activeModal = null;
      showToast(`✓ "${nombre}" creado en el catálogo.`);
      render();
    },

    // --- EJECUCIÓN DE ENTRENAMIENTO ---
    'start-today-session': () => {
      Store.commit(s => Engine.iniciarEntrenamiento(s, null));
      activeTab = 'hoy';
      showToast('Sesión iniciada. Sumá ejercicios y guardá cada serie.');
      render();
    },

    'repeat-last-movilidad': () => {
      Store.commit(s => Engine.repetirUltimaMovilidad(s));
      showToast('↻ Movilidad de la última vez copiada a hoy');
      render();
    },

    'set-rir': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const v = parseInt(el.getAttribute('data-value'), 10);
      const hidden = document.getElementById(`select-rir-${ejId}`);
      const rpe = document.getElementById(`select-rpe-${ejId}`);
      if (hidden) hidden.value = String(v);
      if (rpe) rpe.value = String(10 - v); // RPE ≈ 10 − RIR
      el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    },

    'quick-add-reps': el => {
      const input = document.getElementById(el.getAttribute('data-target-input'));
      if (!input) return;
      const amount = parseInt(el.getAttribute('data-amount'), 10) || 0;
      input.value = String(Math.max(1, (parseInt(input.value, 10) || 0) + amount));
    },

    'apply-sugerencia': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const peso = el.getAttribute('data-peso'), reps = el.getAttribute('data-reps');
      const ip = document.getElementById(`input-peso-${ejId}`), ir = document.getElementById(`input-reps-${ejId}`);
      if (ip && peso !== 'null') { ip.value = peso; ip.dispatchEvent(new Event('input', { bubbles: true })); }
      if (ir && reps) ir.value = reps;
      showToast(el.getAttribute('title') || 'Sugerencia aplicada');
    },

    'set-descanso': el => {
      const seg = parseInt(el.getAttribute('data-seconds'), 10);
      Store.commit(s => Engine.setKV(s, 'descansoSeg', seg));
      render();
    },
    'toggle-descanso-auto': () => {
      const actual = Engine.getDescanso(Store.getState()).automatico;
      Store.commit(s => Engine.setKV(s, 'descansoAuto', !actual));
      render();
    },

    'save-session-note': el => {
      const id = el.getAttribute('data-entrenamiento-id');
      const nota = (document.getElementById('resumen-nota') || {}).value || '';
      Store.commit(s => ({ ...s, entrenamientos: (s.entrenamientos || []).map(t => t.id === id ? { ...t, notas: nota.trim(), updatedAt: Date.now() } : t), updatedAt: Date.now() }));
      activeModal = null;
      showToast('Sesión guardada en tu historial.');
      render();
    },
    'share-resumen': async el => {
      const texto = el.getAttribute('data-texto') || '';
      try {
        if (navigator.share) { await navigator.share({ title: 'Mi entrenamiento', text: texto }); return; }
        await navigator.clipboard.writeText(texto);
        showToast('Resumen copiado. Pegalo donde quieras.');
      } catch (_) { /* cancelado */ }
    },

    'start-workout': el => {
      const rutinaId = el.getAttribute('data-rutina-id') || null;
      Store.commit(s => Engine.iniciarEntrenamiento(s, rutinaId));
      activeTab = 'hoy';
      showToast('¡Entrenamiento en marcha!');
      render();
    },

    'finish-workout': el => {
      const id = el.getAttribute('data-entrenamiento-id');
      const seriesHoy = (Store.getState().series || []).filter(x => x.entrenamientoId === id && !x.deleted).length;
      if (!seriesHoy && !window.confirm('No guardaste ninguna serie en esta sesión. ¿Cerrarla igual?')) return;
      Store.commit(s => Engine.finalizarEntrenamiento(s, id));
      editingEjercicios.clear();
      Timer.stop();
      syncWakeLock(false);
      activeModal = { type: 'resumen-sesion', entrenamientoId: id };
      render();
    },

    'view-ejercicio': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      if (activeModal && activeModal.type !== 'view-ejercicio') {
        previousModal = { ...activeModal };
      }
      activeModal = { type: 'view-ejercicio', ejercicioId: ejId, fullSheet: false };
      renderModals();
    },

    'toggle-ejercicio-vista-modo': () => {
      if (activeModal && activeModal.type === 'view-ejercicio') {
        activeModal.fullSheet = !activeModal.fullSheet;
        renderModals();
      }
    },

    'toggle-activacion': el => {
      const actId = el.getAttribute('data-act-id');
      Store.commit(s => Engine.toggleActivacion(s, actId));
    },

    'open-add-movilidad': () => {
      activeModal = { type: 'add-movilidad' };
      renderModals();
    },

    'submit-movilidad': () => {
      const selectEl = document.getElementById('mov-catalogo-select');
      const ejercicioId = selectEl?.value || 'ej-mov-puente-gluteo-uni';
      const nombre = document.getElementById('mov-nombre')?.value?.trim() || 'Movilidad';
      const series = parseInt(document.getElementById('mov-series')?.value, 10) || 2;
      const reps = document.getElementById('mov-reps')?.value?.trim() || '15';
      const pesoKg = parseFloat(document.getElementById('mov-peso')?.value) || 0;
      const notas = document.getElementById('mov-notas')?.value?.trim() || '';

      Store.commit(s => Engine.guardarMovilidad(s, { ejercicioId, nombre, series, reps, pesoKg, notas }));
      activeModal = null;
      showToast(`✓ "${nombre}" añadido al segmento Movilidad de hoy`);
      render();
    },

    'save-movilidad-serie-completa': el => {
      const movId = el.getAttribute('data-mov-id');
      const trId = el.getAttribute('data-entrenamiento-id');
      const st = Store.getState();
      const mov = (st.movilidad || []).find(m => m.id === movId && !m.deleted);
      if (!mov) return;

      const cantSeries = Number(mov.series) || 2;
      const repsNum = parseInt(mov.reps, 10) || 15;
      const pesoNum = parseFloat(mov.pesoKg) || 0;
      const ejId = mov.ejercicioId || 'ej-mov-puente-gluteo-uni';

      Store.commit(s =>
        Engine.guardarMultiplesSeries(s, {
          entrenamientoId: trId,
          ejercicioId: ejId,
          cantidadSeries: cantSeries,
          pesoKg: pesoNum,
          reps: repsNum,
          rir: 2,
          rpe: 7,
          tipo: 'efectiva'
        })
      );
      showToast(`✓✓ Serie completa de ${mov.nombre} registrada (${cantSeries} series × ${repsNum} reps)`);
      render();
    },

    'delete-movilidad': el => {
      const movId = el.getAttribute('data-mov-id');
      Store.commit(s => Engine.borrarMovilidad(s, movId));
      showToast('Ejercicio de movilidad eliminado');
      render();
    },

    'reorder-movilidad': el => {
      const movId = el.getAttribute('data-mov-id');
      const dir = el.getAttribute('data-dir');
      if (!movId || !dir) return;
      Store.commit(s => Engine.reordenarMovilidad(s, movId, dir));
      render();
    },

    'delete-activacion': el => {
      const actId = el.getAttribute('data-act-id');
      if (!actId) return;
      Store.commit(s => Engine.quitarActivacion(s, actId));
      showToast('Ejercicio quitado de activación.');
      render();
    },

    // --- ACCIONES DE BLOQUES AMRAP (RUTINA DEL DÍA CON VARIOS EJERCICIOS) ---
    'open-amrap-builder': () => {
      activeModal = { type: 'amrap-builder' };
      renderModals();
    },

    'add-ej-to-draft-amrap': () => {
      const sel = document.getElementById('amrap-add-ej-select');
      const repsInput = document.getElementById('amrap-add-ej-reps');
      const nomInput = document.getElementById('amrap-nombre');
      const trabInput = document.getElementById('amrap-trabajo-seg');
      const descInput = document.getElementById('amrap-descanso-seg');
      const rondInput = document.getElementById('amrap-rondas');

      if (nomInput) draftAmrap.nombre = nomInput.value;
      if (trabInput) draftAmrap.tiempoTrabajoSeg = Number(trabInput.value) || 40;
      if (descInput) draftAmrap.tiempoDescansoSeg = Number(descInput.value) || 20;
      if (rondInput) draftAmrap.rondasObjetivo = Number(rondInput.value) || 4;

      const ejId = sel?.value;
      if (!ejId) return;
      const st = Store.getState();
      const ej = (st.ejercicios || []).find(e => e.id === ejId)
        || Engine.CATALOGO_EJERCICIOS.find(e => e.id === ejId);

      draftAmrap.ejercicios.push({
        ejercicioId: ejId,
        nombre: ej ? ej.nombre : ejId,
        repsObjetivo: repsInput?.value?.trim() || '12 reps'
      });
      renderModals();
    },

    'remove-draft-amrap-ej': el => {
      const idx = Number(el.getAttribute('data-index'));
      draftAmrap.ejercicios = draftAmrap.ejercicios.filter((_, i) => i !== idx);
      renderModals();
    },

    'remove-ej-from-live-amrap': el => {
      const amrapId = el.getAttribute('data-amrap-id');
      const idx = Number(el.getAttribute('data-index'));
      Store.commit(s => Engine.quitarEjercicioDeBloqueAmrap(s, amrapId, idx));
      showToast('Ejercicio quitado de la rutina AMRAP.');
      render();
    },

    'save-amrap-block': () => {
      const nombre = document.getElementById('amrap-nombre')?.value?.trim() || 'Rutina AMRAP del Día';
      const tiempoTrabajoSeg = Number(document.getElementById('amrap-trabajo-seg')?.value) || 40;
      const tiempoDescansoSeg = Number(document.getElementById('amrap-descanso-seg')?.value) || 20;
      const rondasObjetivo = Number(document.getElementById('amrap-rondas')?.value) || 4;

      Store.commit(s => {
        let next = s;
        if (!next.entrenamientoActivoId) {
          next = Engine.iniciarEntrenamiento(next, null);
        }
        return Engine.agregarBloqueAmrap(next, {
          nombre,
          tiempoTrabajoSeg,
          tiempoDescansoSeg,
          rondasObjetivo,
          ejercicios: draftAmrap.ejercicios.map(ae => ({
            ...ae,
            tiempoTrabajoSeg,
            tiempoDescansoSeg
          }))
        });
      });

      activeModal = null;
      activeTab = 'hoy';
      showToast(`✓ Rutina AMRAP "${nombre}" agregada al día (${tiempoTrabajoSeg}s trabajo / ${tiempoDescansoSeg}s descanso)`);
      render();
    },

    'delete-amrap': el => {
      const amrapId = el.getAttribute('data-amrap-id');
      Store.commit(s => Engine.borrarBloqueAmrap(s, amrapId));
      showToast('Rutina AMRAP quitada del día');
      render();
    },

    'start-amrap-timer': el => {
      const seconds = parseInt(el.getAttribute('data-seconds'), 10) || 40;
      const label = el.getAttribute('data-label') || 'AMRAP';
      Timer.start(seconds);
      showToast(`Cronómetro iniciado: ${label}`);
      renderFloatingTimer();
    },

    'complete-amrap-round': el => {
      const amrapId = el.getAttribute('data-amrap-id');
      Store.commit(s => Engine.registrarRondaAmrap(s, amrapId));
      showToast('✓ ¡Ronda de AMRAP registrada!');
      render();
    },

    // --- EDITAR / QUITAR EJERCICIO DE LA SESIÓN DE HOY ---
    'open-edit-sesion-ej': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const trId = el.getAttribute('data-entrenamiento-id');
      const series = Number(el.getAttribute('data-series')) || 3;
      const reps = el.getAttribute('data-reps') || '8-10';
      const notas = el.getAttribute('data-notas') || '';
      activeModal = {
        type: 'edit-sesion-ej',
        ejercicioId: ejId,
        entrenamientoId: trId,
        series,
        reps,
        notas
      };
      renderModals();
    },

    'submit-edit-sesion-ej': () => {
      const trId = document.getElementById('edit-sesion-tr-id')?.value;
      const oldEjId = document.getElementById('edit-sesion-old-ej-id')?.value;
      const newEjId = document.getElementById('edit-sesion-new-ej-id')?.value || oldEjId;
      const seriesObjetivo = Number(document.getElementById('edit-sesion-series')?.value) || 3;
      const repsObjetivo = document.getElementById('edit-sesion-reps')?.value?.trim() || '8-10';
      const notas = document.getElementById('edit-sesion-notas')?.value?.trim() || '';

      Store.commit(s =>
        Engine.editarEjercicioDeSesion(s, trId, oldEjId, {
          newEjercicioId: newEjId,
          seriesObjetivo,
          repsObjetivo,
          notas
        })
      );
      activeModal = null;
      showToast('✓ Ejercicio actualizado en tu rutina de hoy.');
      render();
    },

    'delete-sesion-ej': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const trId = el.getAttribute('data-entrenamiento-id');
      if (!ejId) return;

      Store.commit(s => Engine.quitarEjercicioDeSesion(s, trId, ejId));
      editingEjercicios.delete(ejId);
      if (activeModal && activeModal.type === 'edit-sesion-ej') {
        activeModal = null;
      }
      showToast('Ejercicio quitado de tu rutina de hoy.', {
        action: 'Deshacer',
        fn: () => {
          Store.commit(s => Engine.agregarEjercicioASesion(s, trId, { ejercicioId: ejId, segmento: 'entrenamiento' }));
          render();
        }
      });
      render();
    },

    // --- SUGERENCIAS (CON VOZ, CAPTURAS Y NUBE SUPABASE) ---
    'open-sugerencias-modal': () => {
      activeModal = { type: 'sugerencias' };
      renderModals();
      if (typeof Store.sincronizarSugerenciasNube === 'function') {
        Store.sincronizarSugerenciasNube().then(() => {
          if (activeModal && activeModal.type === 'sugerencias') {
            renderModals();
          }
        }).catch(() => {});
      }
    },

    'dictar-sugerencia': () => {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        const textarea = document.getElementById('sug-mensaje');
        if (textarea) textarea.focus();
        showToast('Tu navegador no soporta dictado directo: tocá el micrófono del teclado de tu teléfono.');
        return;
      }

      if (isDictatingSugerencia && activeSpeechRecognition) {
        try {
          activeSpeechRecognition.abort();
          activeSpeechRecognition.stop();
        } catch (_) {}
        isDictatingSugerencia = false;
        activeSpeechRecognition = null;
        renderModals();
        return;
      }

      const rec = new SpeechRec();
      rec.lang = 'es-AR';
      rec.continuous = true;
      rec.interimResults = true;
      activeSpeechRecognition = rec;
      isDictatingSugerencia = true;

      const curTextarea = document.getElementById('sug-mensaje');
      const baseText = curTextarea ? curTextarea.value.trim() : draftSugerenciaTexto.trim();
      draftSugerenciaTexto = baseText;
      renderModals();

      rec.onresult = ev => {
        let transcript = '';
        for (let i = 0; i < ev.results.length; i++) {
          transcript += ev.results[i][0].transcript + ' ';
        }
        const cleaned = transcript.trim();
        if (cleaned) {
          draftSugerenciaTexto = (baseText ? baseText + ' ' : '') + cleaned;
          const ta = document.getElementById('sug-mensaje');
          if (ta) {
            ta.value = draftSugerenciaTexto;
            ta.scrollTop = ta.scrollHeight;
          }
        }
      };

      rec.onerror = () => {
        try { rec.abort(); } catch (_) {}
        isDictatingSugerencia = false;
        activeSpeechRecognition = null;
        renderModals();
      };

      rec.onend = () => {
        try { rec.abort(); } catch (_) {}
        isDictatingSugerencia = false;
        activeSpeechRecognition = null;
        renderModals();
        const ta = document.getElementById('sug-mensaje');
        if (ta) ta.focus();
      };

      try {
        rec.start();
      } catch (_) {
        isDictatingSugerencia = false;
        activeSpeechRecognition = null;
        renderModals();
      }
    },

    'remove-draft-sug-captura': el => {
      const curTextarea = document.getElementById('sug-mensaje');
      if (curTextarea) draftSugerenciaTexto = curTextarea.value;
      const idx = Number(el.getAttribute('data-index'));
      draftSugerenciaCapturas = draftSugerenciaCapturas.filter((_, i) => i !== idx);
      renderModals();
    },

    'toggle-photo-options': () => {
      const curTextarea = document.getElementById('sug-mensaje');
      if (curTextarea) draftSugerenciaTexto = curTextarea.value;
      showPhotoOptions = !showPhotoOptions;
      renderModals();
    },

    'paste-clipboard-image': async () => {
      const curTextarea = document.getElementById('sug-mensaje');
      if (curTextarea) draftSugerenciaTexto = curTextarea.value;

      if (!navigator.clipboard || !navigator.clipboard.read) {
        showToast('Para pegar capturas, mantené presionado el cuadro de texto y elegí Pegar.');
        return;
      }
      try {
        const items = await navigator.clipboard.read();
        let pasted = false;
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              await procesarYGuardarCaptura(blob);
              pasted = true;
              break;
            }
          }
          if (pasted) break;
        }
        if (pasted) {
          showPhotoOptions = false;
          showToast('✓ Captura pegada desde el portapapeles');
          renderModals();
        } else {
          showToast('No se encontró ninguna imagen en el portapapeles.', { isError: true });
        }
      } catch (err) {
        console.warn('Error leyendo portapapeles:', err);
        showToast('Mantené presionado el cuadro de texto para pegar tu imagen.');
      }
    },

    'submit-sugerencia': () => {
      if (activeSpeechRecognition) {
        try { activeSpeechRecognition.abort(); } catch (_) {}
        try { activeSpeechRecognition.stop(); } catch (_) {}
        activeSpeechRecognition = null;
        isDictatingSugerencia = false;
      }
      const mensaje = document.getElementById('sug-mensaje')?.value?.trim() || draftSugerenciaTexto.trim();
      if (!mensaje && draftSugerenciaCapturas.length === 0) {
        showToast('Escribí o dictá tu sugerencia antes de enviar.');
        return;
      }

      const capturasCopy = [...draftSugerenciaCapturas];
      Store.commit(s =>
        Engine.agregarSugerencia(s, {
          mensaje: mensaje || '(Captura adjunta)',
          autor: Store.user?.displayName || 'Usuario',
          rol: Store.user?.role || 'alumno',
          capturas: capturasCopy
        })
      );
      draftSugerenciaTexto = '';
      draftSugerenciaCapturas = [];
      showPhotoOptions = false;

      const latestSug = (Store.getState().sugerencias || [])[0];
      if (latestSug && typeof Store.enviarSugerenciaNube === 'function') {
        Store.enviarSugerenciaNube(latestSug).catch(() => {});
      }

      activeModal = null;
      renderModals();
      showToast('✓ ¡Sugerencia enviada y sincronizada en la nube!');
    },

    'delete-sugerencia': el => {
      const sugId = el.getAttribute('data-sug-id');
      if (!sugId) return;
      const curTextarea = document.getElementById('sug-mensaje');
      if (curTextarea) draftSugerenciaTexto = curTextarea.value;
      Store.commit(s => Engine.borrarSugerencia(s, sugId));
      if (typeof Store.enviarSugerenciaNube === 'function') {
        Store.enviarSugerenciaNube({ id: sugId, deleted: true }).catch(() => {});
      }
      showToast('Sugerencia eliminada.');
      renderModals();
    },

    'share-sugerencias': async () => {
      const st = Store.getState();
      const sugs = (st.sugerencias || []).filter(s => !s.deleted);
      if (sugs.length === 0) {
        showToast('No hay sugerencias guardadas para enviar.');
        return;
      }
      const textoExport = sugs
        .map((s, idx) => `${idx + 1}. [${s.fecha || Engine.todayISO()}] (${s.autor || 'Usuario'}): ${s.mensaje || s.texto || ''}${Array.isArray(s.capturas) && s.capturas.length ? ` [${s.capturas.length} captura(s)]` : ''}`)
        .join('\n');

      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Sugerencias Fitness MiniApp',
            text: textoExport
          });
          showToast('✓ Sugerencias compartidas.');
          return;
        } catch (_) {}
      }

      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(textoExport);
          showToast('✓ Sugerencias copiadas al portapapeles. ¡Ya podés pegarlas!');
          return;
        } catch (_) {}
      }
      showToast('Sugerencias listas.');
    },

    'toggle-gif-preview': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      activeGifPreviewId = activeGifPreviewId === ejId ? null : ejId;
      render();
    },

    'quick-add-weight': el => {
      const targetId = el.getAttribute('data-target-input');
      const amount = parseFloat(el.getAttribute('data-amount')) || 0;
      const input = document.getElementById(targetId);
      if (input) {
        const curr = parseFloat(input.value) || 0;
        input.value = Math.max(0, Math.round((curr + amount) * 100) / 100).toString();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },

    // --- CHECK-IN DE GIMNASIO Y FLUJO MODULAR PASO A PASO (v3.2.0) ---
    'checkin-gym-hoy': el => {
      const rutinaId = (el && el.getAttribute('data-rutina-id')) || null;
      Store.commit(state => Engine.registrarCheckinGym(state, {
        rutinaId,
        pasoInicial: 'psicofisico'
      }));
      activeTab = 'hoy';
      showToast('Sesión iniciada. Completá tu estado psicofísico.');
      render();
    },

    'set-workout-step': el => {
      const step = el.getAttribute('data-step');
      if (!step) return;
      const curState = Store.getState();
      const curEnt = Engine.getEntrenamientoActivo(curState);
      if (curEnt && curEnt.modulosConfig && curEnt.modulosConfig.pasoActual === 'psicofisico') {
        captureSaludDraftsFromDOM();
      }
      Store.commit(state => {
        const ent = Engine.getEntrenamientoActivo(state);
        if (!ent) return state;
        return Engine.setConfigBloqueSesion(state, ent.id, { pasoActual: step });
      });
      render();
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (_) {}
    },

    'set-psico-chip': el => {
      captureSaludDraftsFromDOM();
      const field = el.getAttribute('data-field');
      const value = el.getAttribute('data-value');
      if (!field || value === null) return;
      draftReadiness[field] = value;
      if (field === 'estadoGeneral') {
        draftReadiness.energia = value === 'Bien' ? '5' : (value === 'Normal' ? '4' : '2');
      }
      render();
    },

    'submit-step-psicofisico': () => {
      captureSaludDraftsFromDOM();
      const estadoMapEnergia = { Bien: 5, Normal: 4, Mal: 2 };
      const estGen = draftReadiness.estadoGeneral || 'Bien';
      const energiaNum = Number(draftReadiness.energia) || estadoMapEnergia[estGen] || 4;
      const estresNum = Number(draftReadiness.estres) || 1;
      const suenoNum = Number(draftReadiness.sueno) || 5;
      const alimNum = Number(draftReadiness.alimentacion) || 5;

      Store.commit(state => {
        let next = Engine.registrarReadiness(state, {
          fecha: Engine.todayISO(),
          estadoGeneral: estGen,
          energia: energiaNum,
          estres: estresNum,
          sueno: suenoNum,
          alimentacion: alimNum,
          zonaDolor: draftReadiness.zonaDolor || '',
          observacionAlumno: draftReadiness.observacionAlumno || estGen
        });
        const ent = Engine.getEntrenamientoActivo(next);
        if (ent) {
          next = Engine.setConfigBloqueSesion(next, ent.id, { pasoActual: 'rutina' });
        }
        return next;
      });
      showToast('Estado guardado. Elegí tu rutina de hoy.');
      render();
    },

    'set-module-active': el => {
      const mod = el.getAttribute('data-module');
      const active = el.getAttribute('data-active') === '1';
      if (mod !== 'activacion' && mod !== 'movilidad') return;
      Store.commit(state => {
        const ent = Engine.getEntrenamientoActivo(state);
        if (!ent) return state;
        const key = mod === 'activacion' ? 'activacionActiva' : 'movilidadActiva';
        return Engine.setConfigBloqueSesion(state, ent.id, { [key]: active });
      });
      render();
    },

    'toggle-module-enabled': el => {
      const mod = el.getAttribute('data-module');
      if (mod !== 'activacion' && mod !== 'movilidad') return;
      Store.commit(state => {
        const ent = Engine.getEntrenamientoActivo(state);
        if (!ent) return state;
        const cfg = ent.modulosConfig || {};
        const key = mod === 'activacion' ? 'activacionActiva' : 'movilidadActiva';
        return Engine.setConfigBloqueSesion(state, ent.id, { [key]: cfg[key] === false });
      });
      render();
    },

    'toggle-act-mov-done': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const entId = el.getAttribute('data-entrenamiento-id');
      const movId = el.getAttribute('data-mov-id');
      if (movId) {
        Store.commit(state => {
          const mv = (state.movilidad || []).map(x => x.id === movId ? { ...x, completado: !x.completado, updatedAt: Date.now() } : x);
          return { ...state, movilidad: mv, movilidadSesion: mv, updatedAt: Date.now() };
        });
        render();
        return;
      }
      if (!ejId) return;
      Store.commit(state => Engine.toggleEjercicioActivacionOMovilidad(state, entId, ejId));
      render();
    },

    'set-bloque-modalidad': el => {
      const bloque = el.getAttribute('data-bloque');
      const modalidad = el.getAttribute('data-modalidad');
      if (!['A', 'B'].includes(bloque) || !['vertical', 'horizontal'].includes(modalidad)) return;
      Store.commit(state => {
        const ent = Engine.getEntrenamientoActivo(state);
        if (!ent) return state;
        return Engine.setConfigBloqueSesion(state, ent.id, { [bloque]: { modalidad } });
      });
      showToast(modalidad === 'vertical'
        ? `Bloque ${bloque}: Modulación Vertical (Circuito)`
        : `Bloque ${bloque}: Modulación Horizontal (Tradicional)`);
      render();
    },

    'set-bloque-rondas': el => {
      const bloque = el.getAttribute('data-bloque');
      const rondas = Number(el.getAttribute('data-rondas')) || 3;
      if (!['A', 'B'].includes(bloque)) return;
      Store.commit(state => {
        const ent = Engine.getEntrenamientoActivo(state);
        if (!ent) return state;
        return Engine.setConfigBloqueSesion(state, ent.id, { [bloque]: { rondasObjetivo: rondas } });
      });
      render();
    },

    'move-ej-bloque': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const entId = el.getAttribute('data-entrenamiento-id');
      const targetBloque = el.getAttribute('data-target-bloque');
      if (!ejId || !entId || !targetBloque) return;
      Store.commit(state => Engine.moverEjercicioDeBloque(state, entId, ejId, targetBloque));
      showToast(`✓ Ejercicio movido a Bloque ${targetBloque}`);
      render();
    },

    'quick-add-to-bloque': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const bloque = el.getAttribute('data-bloque') || 'cierre';
      const st = Store.getState();
      const ejObj = (st.ejercicios || []).find(e => e.id === ejId)
        || (Engine.CATALOGO_EJERCICIOS || []).find(e => e.id === ejId);
      if (!ejObj) return;
      Store.commit(s => {
        const ent = Engine.getEntrenamientoActivo(s);
        if (!ent) return s;
        return Engine.agregarEjercicioASesion(s, ent.id, {
          ejercicioId: ejObj.id,
          segmento: 'entrenamiento',
          bloque,
          seriesObjetivo: ejObj.seriesSugeridas || 3,
          repsObjetivo: ejObj.repsSugeridas || '10-12',
          notas: ejObj.notas || ''
        });
      });
      showToast(`✓ "${ejObj.nombre}" sumado.`);
      render();
    },

    'save-serie-vertical': el => {
      const bloque = el.getAttribute('data-bloque') || 'A';
      const ejId = el.getAttribute('data-ejercicio-id');
      const entId = el.getAttribute('data-entrenamiento-id');
      const pesoEl = document.getElementById(`vert-peso-${bloque}-${ejId}`);
      const repsEl = document.getElementById(`vert-reps-${bloque}-${ejId}`);
      const pesoKg = pesoEl ? parseFloat(pesoEl.value) || 0 : 0;
      const reps = repsEl ? parseInt(repsEl.value, 10) || 0 : 0;
      if (reps <= 0) {
        showToast('Indicá al menos 1 repetición');
        if (repsEl) repsEl.focus();
        return;
      }
      Store.commit(state => {
        const previas = (state.series || []).filter(
          s => s.entrenamientoId === entId && s.ejercicioId === ejId && !s.deleted
        );
        return Engine.guardarSerie(state, {
          entrenamientoId: entId,
          ejercicioId: ejId,
          numeroSerie: previas.length + 1,
          tipo: 'efectiva',
          pesoKg,
          reps
        });
      });
      if (navigator.vibrate) {
        try { navigator.vibrate([45]); } catch (_) {}
      }
      showToast(`✓ Serie registrada (${pesoKg} kg × ${reps} reps)`);
      render();
    },

    'complete-vuelta-vertical': el => {
      const bloque = el.getAttribute('data-bloque') || 'A';
      const entId = el.getAttribute('data-entrenamiento-id');
      const prefix = `vert-reps-${bloque}-`;
      const repsInputs = Array.from(document.querySelectorAll(`input[id^="${prefix}"]`));
      const registros = repsInputs.map(rInput => {
        const ejId = rInput.id.slice(prefix.length);
        const pInput = document.getElementById(`vert-peso-${bloque}-${ejId}`);
        return {
          ejercicioId: ejId,
          pesoKg: pInput ? parseFloat(pInput.value) || 0 : 0,
          reps: parseInt(rInput.value, 10) || 0,
          tipo: 'efectiva'
        };
      }).filter(r => r.reps > 0 || r.pesoKg > 0);

      if (registros.length === 0) {
        showToast('Cargá al menos 1 repetición en los ejercicios del bloque');
        return;
      }

      Store.commit(state => Engine.completarVueltaVerticalBloque(state, entId, bloque, registros));
      if (navigator.vibrate) {
        try { navigator.vibrate([60, 40, 60]); } catch (_) {}
      }
      showToast(`Vuelta del Bloque ${bloque} guardada (${registros.length} series)`);
      render();
    },

    // --- CHECK-IN RÁPIDO AL LLEGAR AL GYM ---
    'quick-checkin': el => {
      const estado = el.getAttribute('data-estado');
      const energia = Number(el.getAttribute('data-energia')) || 4;
      const estres = Number(el.getAttribute('data-estres')) || 2;
      Store.commit(state => Engine.registrarReadiness(state, {
        energia,
        estres,
        observacionAlumno: estado
      }));
      showToast(`✓ Estado registrado: ${estado}`);
      render();
    },

    // --- GUARDAR SERIES JUNTAS (SOLO KG Y REPES) ---
    'save-ejercicio-completo': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const entId = el.getAttribute('data-entrenamiento-id');
      const pesoEl = document.getElementById(`bulk-peso-${ejId}`);
      const repsEl = document.getElementById(`bulk-reps-${ejId}`);
      const seriesEl = document.getElementById(`bulk-series-${ejId}`);

      const pesoKg = pesoEl ? parseFloat(pesoEl.value) || 0 : 0;
      const reps = repsEl ? parseInt(repsEl.value, 10) || 0 : 0;
      const seriesCant = seriesEl ? parseInt(seriesEl.value, 10) || 3 : 3;

      if (reps <= 0) {
        showToast('Indicá al menos 1 repetición');
        if (repsEl) repsEl.focus();
        return;
      }

      Store.commit(state => {
        const seriesPrevias = (state.series || []).filter(
          s => s.entrenamientoId === entId && s.ejercicioId === ejId && !s.deleted
        );
        let curState = state;
        if (seriesPrevias.length > 0) {
          curState = Engine.borrarMultiplesSeries(state, seriesPrevias.map(s => s.id));
        }
        return Engine.guardarMultiplesSeries(curState, {
          entrenamientoId: entId,
          ejercicioId: ejId,
          cantidadSeries: seriesCant,
          pesoKg,
          reps,
          tipo: 'efectiva'
        });
      });

      editingEjercicios.delete(ejId);
      if (navigator.vibrate) {
        try { navigator.vibrate([60, 30, 60]); } catch (_) {}
      }
      showToast(`✓ ${seriesCant} series guardadas (${pesoKg} kg × ${reps} reps)`);
      render();
    },

    'edit-saved-exercise': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      if (ejId) {
        editingEjercicios.add(ejId);
        render();
      }
    },

    'delete-all-series-ej': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const entId = el.getAttribute('data-entrenamiento-id');
      Store.commit(state => {
        const seriesDelEj = (state.series || []).filter(
          s => s.entrenamientoId === entId && s.ejercicioId === ejId && !s.deleted
        );
        if (!seriesDelEj.length) return state;
        return Engine.borrarMultiplesSeries(state, seriesDelEj.map(s => s.id));
      });
      editingEjercicios.delete(ejId);
      showToast('Series eliminadas');
      render();
    },

    // --- HISTÓRICO Y BUSCADOR DE EJERCICIOS / CLASES ---
    'set-historico-modo': el => {
      const modo = el.getAttribute('data-modo');
      if (modo === 'clases' || modo === 'ejercicios') {
        historicoModo = modo;
        render();
      }
    },

    'set-rutinas-subtab': el => {
      const subtab = el.getAttribute('data-subtab');
      if (subtab === 'rutinas' || subtab === 'catalogo') {
        rutinasSubTab = subtab;
        render();
      }
    },

    'toggle-salud-logs': () => {
      captureSaludDraftsFromDOM();
      isSaludLogsOpen = !isSaludLogsOpen;
      render();
    },

    'toggle-ajustes-colors': () => {
      isAjustesColorsOpen = !isAjustesColorsOpen;
      render();
    },

    'search-historial': el => {
      historialBusqueda = (el.value || '').trim();
      render();
      const input = document.getElementById('historial-search-input');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    },

    'clear-historial-search': () => {
      historialBusqueda = '';
      render();
    },

    'toggle-expand-historial-ej': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      if (!ejId) return;
      if (expandedHistorialEjIds.has(ejId)) {
        expandedHistorialEjIds.delete(ejId);
      } else {
        expandedHistorialEjIds.add(ejId);
      }
      render();
    },

    // --- CARGAR 1 SERIE (SIN CRONÓMETRO DE DESCANSO) ---
    'save-serie': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const trId = el.getAttribute('data-entrenamiento-id');

      const peso = parseFloat(document.getElementById(`input-peso-${ejId}`)?.value) || 0;
      const reps = parseInt(document.getElementById(`input-reps-${ejId}`)?.value, 10) || 0;
      const rir = numOr(parseInt(document.getElementById(`select-rir-${ejId}`)?.value, 10), 2);
      const rpe = numOr(parseInt(document.getElementById(`select-rpe-${ejId}`)?.value, 10), 8);
      const tipo = document.getElementById(`select-tipo-${ejId}`)?.value || 'efectiva';

      const prCheck = Engine.checkIfNewPR(Store.getState(), ejId, peso, reps);

      Store.commit(s => {
        const previas = (s.series || []).filter(
          item => item.entrenamientoId === trId && item.ejercicioId === ejId && !item.deleted
        );
        return Engine.guardarSerie(s, {
          entrenamientoId: trId,
          ejercicioId: ejId,
          pesoKg: peso,
          reps,
          rir,
          rpe,
          tipo,
          numeroSerie: previas.length + 1
        });
      });

      if (navigator.vibrate) {
        try { navigator.vibrate([80, 40, 80]); } catch (_) {}
      }

      if (prCheck.isNew1RMPR && prCheck.previous1RM > 0) {
        showToast(`Nuevo récord: 1RM estimado ${prCheck.new1RM} kg (antes ${prCheck.previous1RM})`, { duration: 5000 });
      } else {
        showToast(`${peso} kg × ${reps} · RIR ${rir}`);
      }
      render();
    },

    // --- CARGAR SERIE COMPLETA (TODAS LAS SERIES CON LOS MISMOS DATOS DE UNA VEZ) ---
    'save-serie-completa': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const trId = el.getAttribute('data-entrenamiento-id');

      const cantSeries = Math.max(1, parseInt(document.getElementById(`input-cant-series-${ejId}`)?.value, 10) || 3);
      const peso = parseFloat(document.getElementById(`input-peso-${ejId}`)?.value) || 0;
      const reps = parseInt(document.getElementById(`input-reps-${ejId}`)?.value, 10) || 0;
      const rir = numOr(parseInt(document.getElementById(`select-rir-${ejId}`)?.value, 10), 2);
      const rpe = numOr(parseInt(document.getElementById(`select-rpe-${ejId}`)?.value, 10), 8);
      const tipo = document.getElementById(`select-tipo-${ejId}`)?.value || 'efectiva';

      const beforeIds = new Set((Store.getState().series || []).map(s => s.id));

      Store.commit(s =>
        Engine.guardarMultiplesSeries(s, {
          entrenamientoId: trId,
          ejercicioId: ejId,
          cantidadSeries: cantSeries,
          pesoKg: peso,
          reps,
          rir,
          rpe,
          tipo
        })
      );

      const afterSeries = Store.getState().series || [];
      lastDeletedBatchIds = afterSeries.filter(s => !beforeIds.has(s.id)).map(s => s.id);

      if (navigator.vibrate) {
        try { navigator.vibrate([100, 50, 100]); } catch (_) {}
      }

      showToast(`✓ ${cantSeries} serie${cantSeries === 1 ? '' : 's'} guardada${cantSeries === 1 ? '' : 's'}: ${peso} kg × ${reps}`, {
        action: 'Deshacer',
        fn: () => {
          if (lastDeletedBatchIds && lastDeletedBatchIds.length > 0) {
            Store.commit(s => Engine.borrarMultiplesSeries(s, lastDeletedBatchIds));
            render();
          }
        }
      });
      render();
    },

    'delete-serie': el => {
      const sId = el.getAttribute('data-serie-id');
      const st = Store.getState();
      lastDeletedSerie = (st.series || []).find(s => s.id === sId);
      Store.commit(s => Engine.borrarSerie(s, sId));

      showToast('Serie borrada', {
        action: 'Deshacer',
        fn: () => {
          if (lastDeletedSerie) {
            Store.commit(s => Engine.restaurarSerie(s, lastDeletedSerie.id));
            render();
          }
        }
      });
      render();
    },

    // --- SALUD PSICOFÍSICA, PERFIL DE DÍAS/HORARIOS Y OBSERVACIONES (AISLADOS) ---
    'set-readiness-date': el => {
      captureSaludDraftsFromDOM();
      const date = el.getAttribute('data-date');
      if (!date) return;
      draftReadiness.fecha = date;
      const state = Store.getState();
      const log = (state.readinessLogs || []).find(r => r.fecha === date && !r.deleted);
      if (log) {
        draftReadiness.energia = String(log.energia || 4);
        draftReadiness.estres = String(log.estres || 2);
        draftReadiness.sueno = String(log.sueno || 4);
        draftReadiness.alimentacion = String(log.alimentacion || 4);
        draftReadiness.zonaDolor = log.zonaDolor || '';
        draftReadiness.observacionAlumno = log.observacionAlumno || '';
        draftReadiness.estadoGeneral = log.observacionAlumno || 'Excelente';
      }
      render();
    },

    'change-readiness-date': el => {
      captureSaludDraftsFromDOM();
      const date = el.value;
      if (!date) return;
      draftReadiness.fecha = date;
      const state = Store.getState();
      const log = (state.readinessLogs || []).find(r => r.fecha === date && !r.deleted);
      if (log) {
        draftReadiness.energia = String(log.energia || 4);
        draftReadiness.estres = String(log.estres || 2);
        draftReadiness.sueno = String(log.sueno || 4);
        draftReadiness.alimentacion = String(log.alimentacion || 4);
        draftReadiness.zonaDolor = log.zonaDolor || '';
        draftReadiness.observacionAlumno = log.observacionAlumno || '';
        draftReadiness.estadoGeneral = log.observacionAlumno || 'Excelente';
      }
      render();
    },

    'pick-salud-estado': el => {
      captureSaludDraftsFromDOM();
      const estado = el.getAttribute('data-estado');
      const energia = el.getAttribute('data-energia');
      const estres = el.getAttribute('data-estres');
      const sueno = el.getAttribute('data-sueno');

      draftReadiness.estadoGeneral = estado;
      if (energia) draftReadiness.energia = energia;
      if (estres) draftReadiness.estres = estres;
      if (sueno) draftReadiness.sueno = sueno;
      if (!draftReadiness.observacionAlumno || ['Excelente', 'Con energía', 'Normal', 'Cansado', 'Con molestia'].includes(draftReadiness.observacionAlumno)) {
        draftReadiness.observacionAlumno = estado;
      }
      render();
    },

    'set-salud-metric': el => {
      captureSaludDraftsFromDOM();
      const metric = el.getAttribute('data-metric');
      const val = el.getAttribute('data-val');
      if (metric && val) {
        draftReadiness[metric] = val;
        render();
      }
    },

    'submit-readiness': () => {
      captureSaludDraftsFromDOM();
      const fecha = draftReadiness.fecha || Engine.todayISO();

      Store.commit(s =>
        Engine.registrarReadiness(s, {
          fecha,
          energia: draftReadiness.energia,
          estres: draftReadiness.estres,
          sueno: draftReadiness.sueno,
          alimentacion: draftReadiness.alimentacion || 4,
          dolorArticular: Boolean(draftReadiness.zonaDolor),
          zonaDolor: draftReadiness.zonaDolor,
          observacionAlumno: draftReadiness.observacionAlumno || draftReadiness.estadoGeneral || ''
        })
      );
      const formattedDate = fecha.split('-').reverse().join('/');
      showToast(`✓ Estado psicofísico guardado (${formattedDate}).`);
      render();
    },

    'delete-readiness-log': el => {
      const logId = el.getAttribute('data-log-id');
      if (!logId) return;
      Store.commit(s => Engine.borrarReadiness(s, logId));
      showToast('Registro de salud eliminado.');
      render();
    },

    'toggle-perfil-collapse': () => {
      isPerfilOpen = !isPerfilOpen;
      render();
    },

    'toggle-perfil-dia': el => {
      // Capturamos los campos de texto del DOM actual para no perder nada del Check-in ni de la Ficha Física
      captureSaludDraftsFromDOM();

      const dia = el.getAttribute('data-dia');
      if (!dia) return;

      if (!Array.isArray(draftPerfil.diasSemana)) {
        draftPerfil.diasSemana = [];
      }
      if (draftPerfil.diasSemana.includes(dia)) {
        draftPerfil.diasSemana = draftPerfil.diasSemana.filter(d => d !== dia);
      } else {
        draftPerfil.diasSemana = [...draftPerfil.diasSemana, dia];
      }

      Store.commit(s =>
        Engine.actualizarPerfilFisico(s, {
          ...draftPerfil
        })
      );
      render();
    },

    'save-perfil-fisico': () => {
      // Capturamos primero los valores actuales del Check-in para que jamás se modifiquen ni reseteen
      captureSaludDraftsFromDOM();

      Store.commit(s =>
        Engine.actualizarPerfilFisico(s, {
          edad: draftPerfil.edad,
          pesoKg: draftPerfil.pesoKg,
          alturaCm: draftPerfil.alturaCm,
          diasSemana: draftPerfil.diasSemana,
          horarioHabitual: draftPerfil.horarioHabitual,
          lesiones: draftPerfil.lesiones,
          objetivoCorto: draftPerfil.objetivoCorto
        })
      );
      showToast('✓ Ficha física, días y horario guardados con éxito.');
      render();
    },

    'add-alumno-observacion': () => {
      captureSaludDraftsFromDOM();
      const inputEl = document.getElementById('alumno-obs-input');
      const texto = inputEl ? inputEl.value.trim() : '';
      if (!texto) return;
      Store.commit(s =>
        Engine.agregarObservacion(s, {
          autor: Store.user.displayName,
          rolAutor: 'alumno',
          categoria: 'Nota del Alumno',
          texto
        })
      );
      showToast('✓ Observación agregada a tu historial.');
      render();
    },

    // --- ACCIONES EXCLUSIVAS DEL PROFESOR ---
    'trainer-link-alumno': () => {
      const code = document.getElementById('trainer-code-input').value.trim();
      const name = document.getElementById('trainer-name-input').value.trim();
      const res = Store.vincularAlumnoPorCodigo(code, name);
      if (res.ok) {
        selectedAlumnoUsername = res.alumno.username;
        showToast(res.mensaje);
        render();
      } else {
        showToast(res.error);
      }
    },

    'trainer-select-alumno': el => {
      selectedAlumnoUsername = el.getAttribute('data-username');
      render();
    },

    'trainer-add-observacion': el => {
      const targetUser = el.getAttribute('data-target-username');
      const categoria = document.getElementById('trainer-obs-cat').value;
      const texto = document.getElementById('trainer-obs-text').value.trim();
      if (!texto || !targetUser) return;

      Store.commitForUser(targetUser, s =>
        Engine.agregarObservacion(s, {
          autor: Store.user ? Store.user.displayName : 'Profesor',
          rolAutor: 'profesor',
          categoria,
          texto
        })
      );
      showToast('✓ Observación clínica registrada en la cuenta del alumno.');
      render();
    },

    // --- CUENTA Y BACKUP ---
    'reset-account-zero': () => {
      Store.resetCurrentAccountToZero();
      syncSaludDraftsWithState(Store.getState(), true);
      showToast('Cuenta reiniciada a cero (Catálogo de ejercicios conservado).');
      render();
    },

    'export-backup': () => {
      const jsonStr = Store.exportBackupJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fitness_miniapp_${Store.user.username}_${Engine.todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('✓ Backup descargado.');
    },

    'timer-add': el => {
      Timer.addSeconds(parseInt(el.getAttribute('data-seconds'), 10) || 30);
    },

    'timer-stop': () => {
      Timer.stop();
      renderFloatingTimer();
    }
  };

  // ==========================================
  // 12. LISTENERS DELEGADOS GLOBALES (CLICK, SUBMIT, INPUT, CHANGE, ESCAPE)
  // ==========================================
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeModal) {
      e.preventDefault();
      if (activeModal.type === 'view-ejercicio' && previousModal) {
        activeModal = previousModal;
        previousModal = null;
      } else {
        activeModal = null;
        previousModal = null;
      }
      renderModals();
    }
  });

  document.addEventListener('click', e => {
    // Cerrar modal si se hace clic en el fondo oscuro (overlay)
    if (e.target && e.target.id === 'modal-overlay' && activeModal) {
      if (activeModal.type === 'view-ejercicio' && previousModal) {
        activeModal = previousModal;
        previousModal = null;
      } else {
        activeModal = null;
        previousModal = null;
      }
      renderModals();
      return;
    }

    const target = e.target.closest('[data-action]');
    if (!target) return;
    if (target.tagName === 'FORM' || target.tagName === 'INPUT' || target.tagName === 'SELECT') return;

    const actionName = target.getAttribute('data-action');
    if (typeof actions[actionName] === 'function') {
      e.preventDefault();
      actions[actionName](target, e);
    }
  });

  document.addEventListener('submit', e => {
    const target = e.target.closest('form[data-action]');
    if (!target) return;
    e.preventDefault();
    const actionName = target.getAttribute('data-action');
    if (typeof actions[actionName] === 'function') {
      actions[actionName](target, e);
    }
  });

  document.addEventListener('input', e => {
    if (e.target && e.target.dataset && e.target.dataset.discosFor) {
      const box = document.getElementById(`discos-${e.target.dataset.discosFor}`);
      if (box) box.textContent = Engine.calcularDiscos(parseFloat(e.target.value) || 0).texto;
      return;
    }
    if (e.target && e.target.id === 'sug-mensaje') {
      draftSugerenciaTexto = e.target.value;
      return;
    }
    const target = e.target.closest('input[data-action="search-catalog"]');
    if (target) {
      catalogoBusqueda = target.value;
      renderModals();
      const input = document.getElementById('catalog-search-input');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      return;
    }

    const histTarget = e.target.closest('input[data-action="search-historial"]');
    if (histTarget) {
      historialBusqueda = histTarget.value;
      render();
      const histInput = document.getElementById('historial-search-input');
      if (histInput) {
        histInput.focus();
        histInput.setSelectionRange(histInput.value.length, histInput.value.length);
      }
      return;
    }
  });

  /** Comprime una imagen (archivo o portapapeles) y la suma a las capturas del borrador de sugerencia. */
  function procesarYGuardarCaptura(blobOrFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 720;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
          draftSugerenciaCapturas.push(dataUrl);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = ev.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(blobOrFile);
    });
  }

  document.addEventListener('paste', async e => {
    if (!activeModal || activeModal.type !== 'sugerencias') return;
    const items = (e.clipboardData || window.clipboardData)?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          const curTextarea = document.getElementById('sug-mensaje');
          if (curTextarea) draftSugerenciaTexto = curTextarea.value;
          await procesarYGuardarCaptura(file);
          showToast('✓ Captura pegada desde el portapapeles');
          renderModals();
          break;
        }
      }
    }
  });

  document.addEventListener('change', e => {
    const dateInput = e.target.closest('input[data-action="change-readiness-date"]');
    if (dateInput) {
      if (actions['change-readiness-date']) actions['change-readiness-date'](dateInput);
      return;
    }

    const movSelect = e.target.closest('select[data-action="select-movilidad-preset"]');
    if (movSelect) {
      const opt = movSelect.options[movSelect.selectedIndex];
      if (opt) {
        const nomEl = document.getElementById('mov-nombre');
        const serEl = document.getElementById('mov-series');
        const repEl = document.getElementById('mov-reps');
        const pesEl = document.getElementById('mov-peso');
        const notEl = document.getElementById('mov-notas');
        if (nomEl) nomEl.value = opt.getAttribute('data-nombre') || '';
        if (serEl) serEl.value = opt.getAttribute('data-series') || '2';
        if (repEl) repEl.value = opt.getAttribute('data-reps') || '15';
        if (pesEl) pesEl.value = opt.getAttribute('data-peso') || '0';
        if (notEl) notEl.value = opt.getAttribute('data-notas') || '';
      }
      return;
    }


    const fileInput = e.target.closest('input[type="file"][data-action]');
    if (!fileInput) return;
    const actionName = fileInput.getAttribute('data-action');

    if (actionName === 'upload-sugerencia-capturas') {
      const files = Array.from(fileInput.files || []);
      if (files.length === 0) return;
      const curTextarea = document.getElementById('sug-mensaje');
      if (curTextarea) draftSugerenciaTexto = curTextarea.value;

      let processed = 0;
      files.slice(0, 4).forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 720;
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            draftSugerenciaCapturas.push(canvas.toDataURL('image/jpeg', 0.78));
            processed++;
            if (processed === Math.min(files.length, 4)) {
              showPhotoOptions = false;
              showToast(`✓ ${processed} captura(s) adjuntada(s).`);
              renderModals();
            }
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
      return;
    }

    if (actionName === 'upload-watermarked-photo') {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const targetUser = fileInput.getAttribute('data-target-user') || '';
      const st = targetUser ? Store.getUserState(targetUser) : Store.getState();
      const pesoInput = document.getElementById('foto-peso-input');
      const notaInput = targetUser
        ? document.getElementById('trainer-foto-nota')
        : document.getElementById('foto-nota-input');

      const pesoKg = pesoInput ? pesoInput.value : (st.perfil && st.perfil.pesoKg) || '';
      const nota = notaInput ? notaInput.value.trim() : '';
      const autor = targetUser ? 'Profesor' : 'Alumno';

      generarImagenConMarcaDeAgua(file, Engine.todayISO(), pesoKg, autor, dataUrl => {
        const mutator = s => Engine.agregarFoto(s, { pesoKg, nota, autor, dataUrl });
        if (targetUser) {
          Store.commitForUser(targetUser, mutator);
        } else {
          Store.commit(mutator);
        }
        showToast('✓ Foto guardada con sello de agua de fecha y peso.');
        render();
      });
    } else if (actionName === 'import-backup') {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const res = Store.importBackupJSON(ev.target.result);
        if (res.ok) {
          syncSaludDraftsWithState(Store.getState(), true);
          showToast('✓ Respaldo restaurado.');
          render();
        } else {
          showToast(res.error);
        }
      };
      reader.readAsText(file);
    }
  });

  // ==========================================
  // 13. INICIALIZACIÓN
  // ==========================================
  Store.subscribe(() => {
    render();
  });

  Timer.subscribe(() => {
    renderFloatingTimer();
  });

  window.addEventListener('resize', () => {
    if (Store.user) {
      const newMode = getAutoLayoutMode();
      if (newMode !== layoutMode) {
        captureSaludDraftsFromDOM();
        layoutMode = newMode;
        render();
      }
    }
  });

  window.addEventListener('DOMContentLoaded', () => {
    Store.init();
    layoutMode = getAutoLayoutMode();
    render();

    // Notificación automática al actualizarse la versión
    const LAST_SEEN_VERSION_KEY = 'gimnasio_last_seen_version';
    try {
      const lastVer = localStorage.getItem(LAST_SEEN_VERSION_KEY);
      if (lastVer !== APP_VERSION) {
        localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
        if (lastVer) {
          setTimeout(() => {
            showToast(`Fitness MiniApp actualizada a v${APP_VERSION}.`, { duration: 5000 });
          }, 800);
        }
      }
    } catch (_) {}

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        showToast(`✓ ¡Fitness MiniApp actualizada a v${APP_VERSION}!`, { duration: 5000 });
      });
    }
  });
})();

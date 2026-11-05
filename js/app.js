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

  const APP_VERSION = '2.5.1';

  function getAutoLayoutMode() {
    const user = Store.user;
    if (!user) return 'auth';
    if (user.role === 'profesor') return 'pc-profesor';
    return window.innerWidth >= 960 ? 'pc-alumno' : 'phone-alumno';
  }

  // Modo de visualización en pantalla adaptado estrictamente según dispositivo
  let layoutMode = getAutoLayoutMode();
  let activeTab = 'hoy'; // 'hoy' | 'rutinas' | 'salud' | 'evolucion' | 'ajustes'
  let activeModal = null; // null | { type, ... }
  let previousModal = null; // Para volver al modal anterior al cerrar el visor (👁️)
  let lastDeletedSerie = null;
  let lastDeletedBatchIds = null;
  let draftSugerenciaCapturas = [];
  let draftSugerenciaTexto = '';
  let isDictatingSugerencia = false;
  let activeSpeechRecognition = null;

  // Estado persistente de formularios de Salud y Ficha Física para que guardar uno NUNCA modifique ni reinicie el otro
  let draftReadiness = {
    userKey: null,
    energia: '4',
    estres: '2',
    sueno: '4',
    alimentacion: '4',
    zonaDolor: '',
    observacionAlumno: ''
  };

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
    const lastLog = state && Array.isArray(state.readinessLogs)
      ? state.readinessLogs.find(r => !r.deleted)
      : null;

    if (draftReadiness.userKey !== uKey) {
      draftReadiness = {
        userKey: uKey,
        energia: lastLog ? String(lastLog.energia) : '4',
        estres: lastLog ? String(lastLog.estres) : '2',
        sueno: lastLog ? String(lastLog.sueno || 4) : '4',
        alimentacion: lastLog ? String(lastLog.alimentacion || 4) : '4',
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
    const rdEnergia = document.getElementById('rd-energia');
    const rdEstres = document.getElementById('rd-estres');
    const rdSueno = document.getElementById('rd-sueno');
    const rdAlim = document.getElementById('rd-alimentacion');
    const rdDolor = document.getElementById('rd-dolor');
    const rdObs = document.getElementById('rd-obs');

    if (rdEnergia) draftReadiness.energia = rdEnergia.value;
    if (rdEstres) draftReadiness.estres = rdEstres.value;
    if (rdSueno) draftReadiness.sueno = rdSueno.value;
    if (rdAlim) draftReadiness.alimentacion = rdAlim.value;
    if (rdDolor) draftReadiness.zonaDolor = rdDolor.value;
    if (rdObs) draftReadiness.observacionAlumno = rdObs.value;

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

  const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const GRUPOS_CATALOGO = ['todos', 'activacion', 'movilidad', 'pecho', 'espalda', 'piernas', 'hombros', 'brazos', 'core', 'amrap'];

  // ==========================================
  // SISTEMA DE ÍCONOS MONOCROMÁTICOS (ZINC-400 -> AZUL #2563EB)
  // ==========================================
  function renderIcon(name) {
    const svgs = {
      bolt: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
      clipboard: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>',
      activity: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>',
      chart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
      settings: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
      bulb: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>',
      eye: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
      clock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
      copy: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
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
          <rect x="6" y="6" width="88" height="88" rx="20" fill="#18181B" stroke="#2563EB" stroke-width="4"/>
          <rect x="18" y="36" width="10" height="28" rx="4" fill="#3B82F6"/>
          <rect x="30" y="28" width="8" height="44" rx="3" fill="#2563EB"/>
          <rect x="38" y="46" width="24" height="8" rx="2" fill="#A1A1AA"/>
          <rect x="62" y="28" width="8" height="44" rx="3" fill="#2563EB"/>
          <rect x="72" y="36" width="10" height="28" rx="4" fill="#3B82F6"/>
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
        const stamp = `📅 ${fechaTexto}  •  ⚖️ ${pesoKg ? pesoKg + ' kg' : 'S/P'}  •  ${autorTexto}`;
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
        <div style="padding: 24px; text-align: center; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); color: var(--text-dim); font-size: 13px;">
          📊 Todavía no hay registros históricos.<br>
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
              ${getAppBrandHTML('Ingreso Personal · Alumno o Docente')}
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

              <button type="button" class="btn-secondary" data-action="login-biometrics">
                ⚡ Ingresar con Face ID / Huella Digital
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
                  <strong style="color: var(--text-main); display: block; margin-bottom: 4px;">🏃 Modo Alumno / Atleta (Móvil y PC)</strong>
                  Cada alumno tiene su sesión privada aislada y un <strong>Código Único (ej. GYM-1024)</strong>. Podés armar tu rutina del día con los 49 ejercicios ilustrados (Posición Inicial y Final), editar o quitar cualquier ejercicio, cargar series y registrar tu estado psicofísico.
                </div>
                <div style="background: var(--bg-elevated); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                  <strong style="color: var(--text-main); display: block; margin-bottom: 4px;">📋 Modo Docente / Profesor (Panel Clínico)</strong>
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
                  🏃 Demo Alumno (Juan)
                </button>
                <button type="button" class="btn-secondary" data-action="quick-demo-login" data-username="profe" data-mode="pc-profesor">
                  📋 Demo Docente (Profe)
                </button>
              </div>
              ${getCopyrightSealHTML()}
            </div>
          </div>

        </div>
      </div>
    `;
  }

  // ==========================================
  // 6. SUB-VISTAS DEL ALUMNO (FUNCIONAN EN MÓVIL Y EN PC)
  // ==========================================

  // 6.1 Pestaña HOY / ENTRENAR
  function renderAlumnoHoySection(state, user) {
    const activoId = state.entrenamientoActivoId;
    const entActivo = activoId
      ? (state.entrenamientos || []).find(t => t.id === activoId && !t.deleted)
      : null;
    const rutinasActivas = (state.rutinas || []).filter(r => !r.deleted);
    const observacionesRecientes = (state.observaciones || []).filter(o => !o.deleted).slice(0, 2);

    // Si NO hay un entrenamiento en curso
    if (!entActivo) {
      return `
        <!-- Banner de Identidad y Código Único -->
        <div class="card" style="border-left: 4px solid var(--steel-blue);">
          <div class="card-header">
            <div>
              <span class="badge badge-neon">Fitness MiniApp · Panel de Entrenamiento</span>
              <h2 style="font-size: 19px; font-weight: 800; margin-top: 4px;">¡Hola, ${h(user.displayName)}!</h2>
              <p style="font-size: 12px; color: var(--text-muted);">
                Organizá tu entrenamiento de hoy en: <strong>1. Activación</strong>, <strong>2. Movilidad</strong> y <strong>3. Entrenamiento Principal / AMRAP</strong>.
              </p>
            </div>
            <button type="button" class="code-pill" data-action="copy-alumno-code" data-code="${h(state.codigoAlumno)}" title="Clic para copiar tu código">
              <span>🔑 ${h(state.codigoAlumno)}</span>
              <span style="font-size: 10px;">📋 Copiar</span>
            </button>
          </div>

          ${state.perfil && state.perfil.diasSemana && state.perfil.diasSemana.length > 0 ? `
            <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding-top: 6px; border-top: 1px dashed var(--border-subtle); font-size: 12px; color: var(--text-muted);">
              <span>📅 <strong>Días de gym:</strong> ${state.perfil.diasSemana.map(d => h(d)).join(', ')}</span>
              <span>•</span>
              <span>⏰ <strong>Horario habitual:</strong> ${h(state.perfil.horarioHabitual || '19:00')} hs</span>
            </div>
          ` : `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--bg-elevated); padding: 10px 12px; border-radius: var(--radius-md); font-size: 12px;">
              <span>📝 Configurá tus días de gimnasio, horario y datos físicos.</span>
              <button type="button" class="badge badge-neon" data-action="switch-tab" data-tab="salud" style="cursor: pointer;">
                Completar Ficha →
              </button>
            </div>
          `}
        </div>

        <!-- Botón Central para Cargar Rutina Realizada Hoy -->
        <div class="card" style="background: var(--bg-elevated); border: 1px solid var(--border-focus);">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap;">
            <div>
              <span class="badge badge-neon">⚡ Registro Diario</span>
              <h3 style="font-size: 18px; font-weight: 800; margin-top: 4px;">Carga tu Rutina de Hoy</h3>
              <p style="font-size: 12px; color: var(--text-muted); max-width: 520px; margin-top: 3px;">
                Seleccioná del catálogo completo tus ejercicios de <strong>Activación</strong>, <strong>Movilidad</strong> y <strong>Entrenamiento</strong> (con carga serie por serie o <strong>Cargar Serie Completa</strong>, y armado de circuito <strong>AMRAP</strong> con tiempo).
              </p>
            </div>
            <button type="button" class="btn-primary" data-action="start-today-session" style="width: auto; min-height: 44px; padding: 0 20px; font-size: 13px !important;">
              ▶ Cargar Rutina Realizada Hoy
            </button>
          </div>
        </div>

        <!-- Indicaciones del Docente / Profesor si las hay -->
        ${observacionesRecientes.length > 0 ? `
          <div class="card" style="border-left: 4px solid var(--accent-blue);">
            <div class="card-header">
              <span class="card-title" style="font-size: 14px;">🩺 Indicaciones de tu Profesor</span>
              <button type="button" class="badge badge-blue" data-action="switch-tab" data-tab="salud">Ver todas</button>
            </div>
            ${observacionesRecientes.map(obs => `
              <div style="background: var(--bg-elevated); padding: 10px 12px; border-radius: var(--radius-sm); font-size: 13px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim);">
                  <strong>${h(obs.autor)} (${h(obs.categoria)})</strong>
                  <span>${h(obs.fecha)} · ${h(obs.hora)}</span>
                </div>
                <p style="margin-top: 4px; color: var(--text-main);">${h(obs.texto)}</p>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Mis Rutinas Fijas -->
        <div class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">📋 Mis Rutinas Guardadas</h2>
              <p style="font-size: 12px; color: var(--text-muted);">
                ${rutinasActivas.length === 0
                  ? 'Podés armar plantillas de rutinas con el botón "+ Nueva Rutina", o pulsar "▶ Cargar Rutina Realizada Hoy" arriba.'
                  : `Tenés ${rutinasActivas.length} rutina(s) guardada(s).`}
              </p>
            </div>
            <button type="button" class="btn-secondary" data-action="open-rutina-builder" style="width: auto; min-height: 36px; padding: 0 12px; font-size: 12px !important;">
              + Nueva Rutina desde Catálogo
            </button>
          </div>

          ${rutinasActivas.length === 0 ? `
            <div style="padding: 22px 14px; text-align: center; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); font-size: 13px; color: var(--text-muted);">
              No tenés rutinas fijas guardadas. Tocá <strong>"+ Nueva Rutina desde Catálogo"</strong> o comenzá pulsando <strong>"▶ Cargar Rutina Realizada Hoy"</strong>.
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${rutinasActivas.map(r => `
                <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                      <h3 style="font-size: 16px; font-weight: 800;">${h(r.nombre)}</h3>
                      <span class="badge badge-neon">⏰ ${h(r.horario || '19:00')} hs</span>
                      ${r.creadaPor === 'Profesor' ? `<span class="badge badge-blue">Dictaminada por Profe</span>` : ''}
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">
                      ${(r.dias || []).map(d => `<span class="badge" style="background: var(--bg-card); color: var(--text-muted);">${h(d)}</span>`).join('')}
                      <span class="badge" style="background: var(--bg-card); color: var(--steel-blue-light);">${(r.ejercicios || []).length} ejercicios</span>
                    </div>
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <button type="button" class="btn-secondary" data-action="edit-rutina" data-rutina-id="${h(r.id)}" style="width: auto; min-height: 38px;">
                      ✏️ Editar
                    </button>
                    <button type="button" class="btn-primary" data-action="start-workout" data-rutina-id="${h(r.id)}" style="width: auto; min-height: 38px;">
                      ▶ Entrenar Esta
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;
    }

    // SI HAY UN ENTRENAMIENTO ACTIVO EN CURSO ("CARGA TU RUTINA DE HOY")
    const rutinaAsociada = entActivo.rutinaId
      ? (state.rutinas || []).find(r => r.id === entActivo.rutinaId)
      : null;
    const seriesEntreno = (state.series || []).filter(
      s => s.entrenamientoId === entActivo.id && !s.deleted
    );
    const volumenTotal = Engine.computeVolumenEntrenamiento(state.series, entActivo.id);

    // 1. Segmento Activación (Base + agregados hoy del catálogo, excluyendo los eliminados)
    const activacionesHoy = state.activacionesHoy || {};
    const activacionesExcluidas = state.activacionesExcluidas || {};
    const baseActivacion = (Engine.EJERCICIOS_ACTIVACION_BASE || []).filter(
      a => !activacionesExcluidas[a.id]
    );
    const extraActSesion = (state.ejerciciosSesionHoy || [])
      .filter(item => !item.deleted && item.segmento === 'activacion' && !activacionesExcluidas[item.ejercicioId])
      .map(item => ({
        id: item.ejercicioId,
        nombre: item.nombre,
        prescripcion: `${item.seriesObjetivo || 2} series × ${item.repsObjetivo || '12'}`,
        foco: item.grupoMuscular || 'Activación',
        sesionItemId: item.id
      }));
    const mapActivacion = new Map();
    baseActivacion.forEach(a => mapActivacion.set(a.id, a));
    extraActSesion.forEach(a => {
      if (!mapActivacion.has(a.id)) mapActivacion.set(a.id, a);
    });
    const listaActivacionHoy = Array.from(mapActivacion.values());

    // 2. Segmento Movilidad
    const movilidadHoy = (state.movilidad || []).filter(m => !m.deleted);

    // 3. Segmento Entrenamiento & AMRAP
    const bloquesAmrapHoy = (state.bloquesAmrap || []).filter(b => !b.deleted);

    const excluidosSesionMap = (state.ejerciciosExcluidosHoy && state.ejerciciosExcluidosHoy[entActivo.id]) || {};

    let ejerciciosList = [];
    if (rutinaAsociada && Array.isArray(rutinaAsociada.ejercicios)) {
      ejerciciosList = rutinaAsociada.ejercicios
        .filter(re => !excluidosSesionMap[re.ejercicioId])
        .map(re => {
          const ej = (state.ejercicios || []).find(e => e.id === re.ejercicioId)
            || Engine.CATALOGO_EJERCICIOS.find(e => e.id === re.ejercicioId);
          return {
            ejercicio: ej || { id: re.ejercicioId, nombre: 'Ejercicio', grupoMuscular: 'general', equipo: 'barra' },
            targetSets: re.seriesObjetivo || 3,
            targetReps: re.repsObjetivo || '8-10',
            notaProfesor: re.notaProfesor || '',
            sesionItemId: ''
          };
        });
    }

    // Ejercicios agregados del catálogo a la sesión de hoy (segmento entrenamiento)
    const idsEnLista = new Set(ejerciciosList.map(item => item.ejercicio.id));
    (state.ejerciciosSesionHoy || [])
      .filter(item => !item.deleted && (!item.entrenamientoId || item.entrenamientoId === entActivo.id) && item.segmento !== 'activacion' && item.segmento !== 'movilidad' && !excluidosSesionMap[item.ejercicioId])
      .forEach(item => {
        const existingIdx = ejerciciosList.findIndex(x => x.ejercicio.id === item.ejercicioId);
        const ej = (state.ejercicios || []).find(e => e.id === item.ejercicioId)
          || Engine.CATALOGO_EJERCICIOS.find(e => e.id === item.ejercicioId);
        if (existingIdx >= 0 && ej) {
          ejerciciosList[existingIdx] = {
            ejercicio: ej,
            targetSets: item.seriesObjetivo || ejerciciosList[existingIdx].targetSets || 3,
            targetReps: item.repsObjetivo || ejerciciosList[existingIdx].targetReps || '8-10',
            notaProfesor: item.notas || ejerciciosList[existingIdx].notaProfesor || '',
            sesionItemId: item.id
          };
        } else if (!idsEnLista.has(item.ejercicioId) && ej) {
          idsEnLista.add(ej.id);
          ejerciciosList.push({
            ejercicio: ej,
            targetSets: item.seriesObjetivo || ej.seriesSugeridas || 3,
            targetReps: item.repsObjetivo || ej.repsSugeridas || '8-10',
            notaProfesor: item.notas || '',
            sesionItemId: item.id
          });
        }
      });

    // Incluir cualquier ejercicio que ya tenga series registradas en esta sesión (si no fue excluido)
    seriesEntreno.forEach(s => {
      if (!idsEnLista.has(s.ejercicioId) && !excluidosSesionMap[s.ejercicioId]) {
        const ej = (state.ejercicios || []).find(e => e.id === s.ejercicioId)
          || Engine.CATALOGO_EJERCICIOS.find(e => e.id === s.ejercicioId);
        if (ej && ej.grupoMuscular !== 'movilidad') {
          idsEnLista.add(ej.id);
          ejerciciosList.push({
            ejercicio: ej,
            targetSets: ej.seriesSugeridas || 3,
            targetReps: ej.repsSugeridas || '8-10',
            notaProfesor: '',
            sesionItemId: ''
          });
        }
      }
    });

    return `
        <!-- Encabezado de Sesión Activa -->
      <div class="card">
        <div class="card-header">
          <div>
            <span class="badge badge-neon">● SESIÓN EN CURSO · Inicio ${h(entActivo.inicio)} hs</span>
            <h2 style="font-size: 20px; font-weight: 800; margin-top: 4px; color: var(--text-main);">
              ${h(rutinaAsociada ? rutinaAsociada.nombre : 'Carga tu Rutina de Hoy')}
            </h2>
          </div>
          <button type="button" class="btn-primary" data-action="finish-workout" data-entrenamiento-id="${h(entActivo.id)}" style="width: auto;">
            ✓ Finalizar y Guardar Sesión
          </button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: var(--bg-elevated); padding: 12px; border-radius: var(--radius-md); text-align: center;">
          <div>
            <span style="font-size: 10px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Volumen Hoy</span>
            <p style="font-size: 16px; font-weight: 800; font-family: var(--font-mono); color: var(--cta-blue-light);">${volumenTotal.toLocaleString()} kg</p>
          </div>
          <div>
            <span style="font-size: 10px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Series Totales</span>
            <p style="font-size: 16px; font-weight: 800; font-family: var(--font-mono); color: var(--text-main);">${seriesEntreno.length}</p>
          </div>
          <div>
            <span style="font-size: 10px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Fecha Local</span>
            <p style="font-size: 14px; font-weight: 800; font-family: var(--font-mono); color: var(--text-main);">${h(entActivo.fecha)}</p>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- DIVISIÓN 1: ACTIVACIÓN & MOVILIDAD                       -->
      <!-- ======================================================== -->
      <div class="training-section-header">
        <span class="training-section-title">${renderIcon('bolt')} 1. Activación & Movilidad</span>
        <span class="badge badge-neon">Segmentos Activación y Movilidad</span>
      </div>

      <!-- Bloque A: Segmento Activación -->
      <div class="card">
        <div class="card-header">
          <div>
            <span class="badge badge-neon">Segmento Activación</span>
            <h3 class="card-title" style="font-size: 16px; margin-top: 4px; color: var(--text-main);">Activación Neuromuscular y Core</h3>
            <p style="font-size: 12px; color: var(--text-dim);">
              Marcá con un toque los ejercicios realizados o añadí más desde el catálogo de activación:
            </p>
          </div>
          <button type="button" class="btn-secondary" data-action="open-catalog-picker" data-mode="workout-activacion" data-filter-group="activacion" style="width: auto; min-height: 36px; padding: 0 12px; font-size: 12px !important;">
            + Catálogo Activación
          </button>
        </div>

        ${listaActivacionHoy.length === 0 ? `
          <div style="padding: 16px; text-align: center; background: var(--bg-elevated); border-radius: var(--radius-md); font-size: 12px; color: var(--text-dim);">
            No tenés ejercicios en activación hoy. Tocá <strong>"+ Catálogo Activación"</strong> para añadir los que vas a realizar.
          </div>
        ` : `
          <div class="act-checklist">
            ${listaActivacionHoy.map(item => {
              const checked = Boolean(activacionesHoy[item.id]);
              return `
                <div class="act-item ${checked ? 'checked' : ''}">
                  <div class="act-item-left" data-action="toggle-activacion" data-act-id="${h(item.id)}">
                    <span class="act-checkbox">${checked ? '✓' : ''}</span>
                    <div>
                      <div style="font-weight: 700; font-size: 13.5px; color: var(--text-main);">${h(item.nombre)}</div>
                      <div style="font-size: 11.5px; color: var(--text-dim);">${h(item.prescripcion)} · ${h(item.foco)}</div>
                    </div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(item.id)}" title="Ver posición inicial y final">
                      ${renderIcon('eye')}
                    </button>
                    <button type="button" data-action="delete-activacion" data-act-id="${h(item.id)}" title="Quitar de mi activación" style="color: var(--text-dim); font-weight: 800; padding: 4px 8px; cursor: pointer; background: transparent; border: none; font-size: 16px;">
                      ✕
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <!-- Bloque B: Segmento Movilidad -->
      <div class="card">
        <div class="card-header">
          <div>
            <span class="badge badge-blue">Segmento Movilidad</span>
            <h3 class="card-title" style="font-size: 16px; margin-top: 4px; color: var(--text-main);">Movilidad Articular del Día</h3>
            <p style="font-size: 12px; color: var(--text-dim);">
              Elegí ejercicios del catálogo de movilidad o cargá el prescripto por tu profesor (ej: <strong>Puente de glúteo uni, 2×15 con 15 kg</strong>):
            </p>
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button type="button" class="btn-secondary" data-action="open-catalog-picker" data-mode="workout-movilidad" data-filter-group="movilidad" style="width: auto; min-height: 36px; padding: 0 12px; font-size: 12px !important;">
              + Catálogo Movilidad
            </button>
            <button type="button" class="btn-primary" data-action="open-add-movilidad" style="width: auto; min-height: 36px; padding: 0 12px; font-size: 12px !important;">
              + Cargar Movilidad Manual
            </button>
          </div>
        </div>

        ${movilidadHoy.length === 0 ? `
          <div style="padding: 16px; text-align: center; background: var(--bg-elevated); border-radius: var(--radius-md); font-size: 12px; color: var(--text-dim);">
            No tenés movilidad cargada hoy. Tocá <strong>"+ Catálogo Movilidad"</strong> o <strong>"+ Cargar Movilidad Manual"</strong> para añadir los que realizás hoy.
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${movilidadHoy.map(m => {
              const ejMovId = m.ejercicioId || 'ej-mov-puente-gluteo-uni';
              const seriesMovCargadas = seriesEntreno.filter(s => s.ejercicioId === ejMovId).length;
              return `
                <div class="mobility-card" style="flex-wrap: wrap;">
                  <div style="flex: 1; min-width: 190px;">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                      <strong style="font-size: 14px; font-weight: 700; color: var(--text-main);">${h(m.nombre)}</strong>
                      <span class="badge badge-neon">${m.series} series × ${h(m.reps)} reps ${m.pesoKg ? `• ${m.pesoKg} kg` : ''}</span>
                      ${seriesMovCargadas > 0 ? `<span class="badge badge-emerald">✓ ${seriesMovCargadas} series registradas</span>` : ''}
                    </div>
                    ${m.notas ? `<p style="font-size: 11.5px; color: var(--text-dim); margin-top: 3px;">${h(m.notas)}</p>` : ''}
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <button type="button" class="btn-secondary" data-action="save-movilidad-serie-completa" data-mov-id="${h(m.id)}" data-entrenamiento-id="${h(entActivo.id)}" style="width: auto; min-height: 34px; padding: 0 10px; font-size: 11px !important;" title="Registrar todas las series de esta movilidad con los mismos datos">
                      ✓✓ Cargar Serie Completa (${m.series}×${h(m.reps)})
                    </button>
                    <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(ejMovId)}" title="Ver posición inicial y final">
                      ${renderIcon('eye')}
                    </button>
                    <button type="button" data-action="delete-movilidad" data-mov-id="${h(m.id)}" style="color: var(--text-dim); font-weight: 800; padding: 4px 8px; cursor: pointer;" title="Quitar">
                      ✕
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <!-- ======================================================== -->
      <!-- DIVISIÓN 2: ENTRENAMIENTO PRINCIPAL & RUTINA AMRAP       -->
      <!-- ======================================================== -->
      <div class="training-section-header">
        <span class="training-section-title">${renderIcon('activity')} 2. Entrenamiento Principal & Rutina AMRAP</span>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button type="button" class="btn-secondary" data-action="open-amrap-builder" style="width: auto; min-height: 36px; padding: 0 12px; font-size: 12px !important;">
            ${renderIcon('clock')} + Armar Rutina AMRAP
          </button>
          <button type="button" class="btn-primary" data-action="open-catalog-picker" data-mode="workout" data-filter-group="todos" style="width: auto; min-height: 36px; padding: 0 12px; font-size: 12px !important;">
            + Añadir Ejercicio del Catálogo
          </button>
        </div>
      </div>

      <!-- Rutinas AMRAP dentro del Día (con múltiples ejercicios y tiempos de trabajo/descanso) -->
      ${bloquesAmrapHoy.length > 0 ? `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${bloquesAmrapHoy.map(b => `
            <div class="amrap-card">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
                <div>
                  <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span class="badge badge-neon">RUTINA AMRAP DEL DÍA</span>
                    <span class="badge badge-amber">Trabajo: ${b.tiempoTrabajoSeg}s / ejercicio</span>
                    <span class="badge badge-amber">Descanso: ${b.tiempoDescansoSeg}s</span>
                    <span class="badge badge-blue">Rondas: ${b.rondasCompletadas || 0} / ${b.rondasObjetivo || 4}</span>
                  </div>
                  <h3 style="font-size: 17px; font-weight: 800; margin-top: 6px; color: var(--text-main);">${h(b.nombre)}</h3>
                  <p style="font-size: 12px; color: var(--text-dim); margin-top: 2px;">
                    Rutina AMRAP dentro de tu sesión de hoy (${(b.ejercicios || []).length} ejercicios en circuito). Podés sumar todos los ejercicios que quieras dentro de este AMRAP:
                  </p>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button type="button" class="btn-secondary" data-action="open-catalog-picker" data-mode="append-to-amrap" data-amrap-id="${h(b.id)}" data-filter-group="todos" style="width: auto; min-height: 34px; padding: 0 12px; font-size: 12px !important;">
                    + Agregar Ejercicio al AMRAP
                  </button>
                  <button type="button" data-action="delete-amrap" data-amrap-id="${h(b.id)}" style="color: var(--text-dim); font-weight: 800; padding: 4px 8px;" title="Quitar rutina AMRAP">✕</button>
                </div>
              </div>

              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${(b.ejercicios || []).map((ae, aIdx) => `
                  <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); padding: 10px 12px; border-radius: var(--radius-sm); font-size: 13px;">
                    <div>
                      <strong style="color: var(--text-main);">${aIdx + 1}. ${h(ae.nombre)}</strong>
                      <div style="font-size: 11.5px; color: var(--text-dim); font-family: var(--font-mono); margin-top: 2px;">
                        ${h(ae.repsObjetivo || 'Máx reps')} · ${ae.tiempoTrabajoSeg || b.tiempoTrabajoSeg}s trabajo · ${ae.tiempoDescansoSeg || b.tiempoDescansoSeg}s descanso
                      </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(ae.ejercicioId)}" title="Ver posición inicial y final">
                        ${renderIcon('eye')}
                      </button>
                      <button type="button" data-action="remove-ej-from-live-amrap" data-amrap-id="${h(b.id)}" data-index="${aIdx}" style="color: var(--text-dim); font-weight: 800; padding: 4px 6px;" title="Quitar del AMRAP">
                        ✕
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>

              <div style="display: flex; gap: 8px; flex-wrap: wrap; padding-top: 6px;">
                <button type="button" class="btn-primary" data-action="start-amrap-timer" data-seconds="${b.tiempoTrabajoSeg}" data-label="Trabajo AMRAP (${b.tiempoTrabajoSeg}s)" style="width: auto; flex: 1; min-height: 40px;">
                  ▶ Iniciar Tiempo Ejercicio (${b.tiempoTrabajoSeg}s)
                </button>
                <button type="button" class="btn-secondary" data-action="start-amrap-timer" data-seconds="${b.tiempoDescansoSeg}" data-label="Descanso AMRAP (${b.tiempoDescansoSeg}s)" style="width: auto; flex: 1; min-height: 40px;">
                  ⏸ Descanso entre Ejercicios (${b.tiempoDescansoSeg}s)
                </button>
                <button type="button" class="btn-serie-completa" data-action="complete-amrap-round" data-amrap-id="${h(b.id)}" style="width: auto; flex: 1; min-height: 40px;">
                  ✓ +1 Ronda Completada (${(b.rondasCompletadas || 0) + 1}/${b.rondasObjetivo || 4})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Tarjetas de Ejecución de cada Ejercicio (Con botones para Ver 👁️, Editar/Cambiar ✏️ y Quitar ✕) -->
      ${ejerciciosList.length === 0 ? `
        <div class="card" style="text-align: center; padding: 24px 16px;">
          <p style="font-size: 14px; font-weight: 700; color: var(--text-main);">
            Aún no hay ejercicios de fuerza cargados en tu sesión de hoy.
          </p>
          <p style="font-size: 12.5px; color: var(--text-dim); margin-top: 4px;">
            Elegí libremente los ejercicios que hiciste hoy desde el catálogo sin ninguno impuesto por defecto.
          </p>
          <div style="margin-top: 10px; display: flex; justify-content: center;">
            <button type="button" class="btn-primary" data-action="open-catalog-for-workout" style="width: auto;">
              + Añadir Ejercicio del Catálogo a Hoy
            </button>
          </div>
        </div>
      ` : ejerciciosList.map((item, idx) => {
        const ej = item.ejercicio;
        const seriesDelEj = seriesEntreno.filter(s => s.ejercicioId === ej.id);
        const ultimaSerie = Engine.getUltimaSerieEjercicio(state, ej.id);
        const defaultPeso = ultimaSerie ? ultimaSerie.pesoKg : 30;
        const defaultReps = ultimaSerie ? ultimaSerie.reps : 8;
        const defaultSeriesCant = item.targetSets || ej.seriesSugeridas || 3;

        return `
          <div class="card">
            <div class="card-header">
              <div style="flex: 1; min-width: 190px;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span class="badge badge-neon">#${idx + 1} · ${h(ej.grupoMuscular)}</span>
                  <span class="badge badge-amber">${h(ej.equipo)}</span>
                  <span class="badge badge-blue">Objetivo: ${item.targetSets} series × ${h(item.targetReps)} reps</span>
                </div>
                <h3 style="font-size: 17px; font-weight: 800; margin-top: 6px; color: var(--text-main);">${h(ej.nombre)}</h3>
                <p style="font-size: 12px; color: var(--text-dim); margin-top: 2px;">
                  Última marca: <strong style="color: var(--text-muted);">${ultimaSerie ? `${ultimaSerie.pesoKg} kg × ${ultimaSerie.reps} reps (1RM: ${Engine.compute1RM(ultimaSerie.pesoKg, ultimaSerie.reps)} kg)` : 'Sin marca previa'}</strong>
                </p>
                ${item.notaProfesor ? `<p style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">Indicación: ${h(item.notaProfesor)}</p>` : ''}
              </div>

              <div style="display: flex; gap: 6px; align-items: center;">
                <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(ej.id)}" title="Ver posición inicial y final">
                  ${renderIcon('eye')}
                </button>
                <button type="button" class="btn-icon-action" data-action="open-edit-sesion-ej" data-ejercicio-id="${h(ej.id)}" data-entrenamiento-id="${h(entActivo.id)}" data-series="${item.targetSets}" data-reps="${h(item.targetReps)}" data-notas="${h(item.notaProfesor || ej.notas || '')}" title="Cambiar o editar este ejercicio">
                  ✏️
                </button>
                <button type="button" class="btn-icon-action danger" data-action="delete-sesion-ej" data-ejercicio-id="${h(ej.id)}" data-entrenamiento-id="${h(entActivo.id)}" title="Quitar este ejercicio de la rutina de hoy">
                  ✕
                </button>
              </div>
            </div>

            ${seriesDelEj.length > 0 ? `
              <table class="series-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tipo</th>
                    <th>Peso</th>
                    <th>Reps</th>
                    <th>RIR / RPE</th>
                    <th>1RM Est.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${seriesDelEj.map((s, sIdx) => `
                    <tr>
                      <td><span class="serie-num">${sIdx + 1}</span></td>
                      <td><span class="badge badge-neon">${h(s.tipo.slice(0, 4))}</span></td>
                      <td style="font-family: var(--font-mono); font-weight: 800; color: var(--text-main);">${s.pesoKg} kg</td>
                      <td style="font-family: var(--font-mono); font-weight: 800; color: var(--text-main);">${s.reps}</td>
                      <td style="font-family: var(--font-mono); color: var(--text-muted);">RIR ${s.rir ?? 2} · RPE ${s.rpe ?? 8}</td>
                      <td style="font-family: var(--font-mono); color: var(--cta-blue-light); font-weight: 800;">${Engine.compute1RM(s.pesoKg, s.reps)} kg</td>
                      <td>
                        <button type="button" data-action="delete-serie" data-serie-id="${h(s.id)}" style="color: var(--text-dim); font-weight: 800; padding: 2px 6px;">✕</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}

            <!-- Controles de Carga Rápida: Grilla 3x2 en móvil para máxima legibilidad -->
            <div style="padding-top: 10px;">
              <div class="serie-inputs-grid">
                <div>
                  <label class="form-label" style="font-size: 10px;">Series</label>
                  <input type="number" min="1" max="15" id="input-cant-series-${h(ej.id)}" class="serie-input" value="${defaultSeriesCant}" inputmode="numeric" title="Cantidad de series para Cargar Serie Completa">
                </div>
                <div>
                  <label class="form-label" style="font-size: 10px;">Peso (kg)</label>
                  <input type="number" step="0.5" id="input-peso-${h(ej.id)}" class="serie-input" value="${defaultPeso}" inputmode="decimal">
                </div>
                <div>
                  <label class="form-label" style="font-size: 10px;">Reps</label>
                  <input type="number" id="input-reps-${h(ej.id)}" class="serie-input" value="${defaultReps}" inputmode="numeric">
                </div>
                <div>
                  <label class="form-label" style="font-size: 10px;">RIR (0-4)</label>
                  <select id="select-rir-${h(ej.id)}" class="serie-input">
                    <option value="0">0 (Fallo)</option>
                    <option value="1">1 rep</option>
                    <option value="2" selected>2 reps</option>
                    <option value="3">3 reps</option>
                    <option value="4">4+ reps</option>
                  </select>
                </div>
                <div>
                  <label class="form-label" style="font-size: 10px;">RPE (6-10)</label>
                  <select id="select-rpe-${h(ej.id)}" class="serie-input">
                    <option value="6">RPE 6</option>
                    <option value="7">RPE 7</option>
                    <option value="8" selected>RPE 8</option>
                    <option value="9">RPE 9</option>
                    <option value="10">RPE 10</option>
                  </select>
                </div>
                <div>
                  <label class="form-label" style="font-size: 10px;">Tipo</label>
                  <select id="select-tipo-${h(ej.id)}" class="serie-input">
                    <option value="efectiva" selected>Efectiva</option>
                    <option value="calentamiento">Calent.</option>
                    <option value="dropset">Dropset</option>
                    <option value="fallo">Al Fallo</option>
                  </select>
                </div>
              </div>

              <div class="quick-steppers">
                <button type="button" class="btn-stepper" data-action="quick-add-weight" data-target-input="input-peso-${h(ej.id)}" data-amount="-2.5">-2.5 kg</button>
                <button type="button" class="btn-stepper" data-action="quick-add-weight" data-target-input="input-peso-${h(ej.id)}" data-amount="1.25">+1.25 kg</button>
                <button type="button" class="btn-stepper" data-action="quick-add-weight" data-target-input="input-peso-${h(ej.id)}" data-amount="2.5">+2.5 kg</button>
                <button type="button" class="btn-stepper" data-action="quick-add-weight" data-target-input="input-peso-${h(ej.id)}" data-amount="5">+5 kg</button>
              </div>

              <div class="series-actions-row">
                <button type="button" class="btn-complete-serie" data-action="save-serie" data-ejercicio-id="${h(ej.id)}" data-entrenamiento-id="${h(entActivo.id)}">
                  + Cargar 1 Serie (#${seriesDelEj.length + 1})
                </button>
                <button type="button" class="btn-serie-completa" data-action="save-serie-completa" data-ejercicio-id="${h(ej.id)}" data-entrenamiento-id="${h(entActivo.id)}" title="Registra todas las series indicadas en 'Series' con el mismo peso y repeticiones">
                  ✓✓ Cargar Serie Completa
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('')}

      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 14px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <button type="button" class="btn-secondary" data-action="open-catalog-picker" data-mode="workout" data-filter-group="todos">
            + Añadir Ejercicio del Catálogo
          </button>
          <button type="button" class="btn-secondary" data-action="open-amrap-builder">
            ${renderIcon('clock')} + Armar Rutina AMRAP
          </button>
        </div>

        <button type="button" class="btn-primary" data-action="finish-workout" data-entrenamiento-id="${h(entActivo.id)}" style="min-height: 48px; font-size: 15px !important;">
          ✓ Finalizar y Guardar Sesión de Hoy
        </button>
      </div>
    `;
  }

  // 6.2 Pestaña MIS RUTINAS & CATÁLOGO ESTANDARIZADO COMPLETO
  function renderAlumnoRutinasSection(state) {
    const rutinas = (state.rutinas || []).filter(r => !r.deleted);
    const catalogo = (state.ejercicios || []).filter(e => !e.deleted);

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <span class="badge badge-neon">Armador de Rutinas & Horarios</span>
            <h2 class="card-title" style="font-size: 20px; margin-top: 4px; color: var(--text-main);">Mis Rutinas de Gimnasio</h2>
            <p style="font-size: 12px; color: var(--text-dim);">
              Elegí los días de la semana que vas al gimnasio, tu horario y sumá ejercicios del catálogo con el signo <strong>+</strong>, o armá un circuito <strong>AMRAP</strong> con tiempo.
            </p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn-secondary" data-action="open-amrap-builder" style="width: auto;">
              ${renderIcon('clock')} + Crear Rutina AMRAP
            </button>
            <button type="button" class="btn-primary" data-action="open-rutina-builder" style="width: auto;">
              + Crear Nueva Rutina
            </button>
          </div>
        </div>

        ${rutinas.length === 0 ? `
          <div style="padding: 24px; text-align: center; background: var(--bg-elevated); border-radius: var(--radius-md); color: var(--text-dim); font-size: 13px;">
            Todavía no tenés rutinas creadas. Tocá <strong>"+ Crear Nueva Rutina"</strong> para armar tu plan eligiendo ejercicios del catálogo total.
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 14px;">
            ${rutinas.map(r => `
              <div style="background: var(--bg-elevated); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <h3 style="font-size: 17px; font-weight: 800; color: var(--text-main);">${h(r.nombre)}</h3>
                      <span class="badge badge-neon">Turno ${h(r.horario || '19:00')} hs</span>
                      <span class="badge badge-amber">Por: ${h(r.creadaPor || 'Alumno')}</span>
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
                      ${(r.dias || []).map(d => `<span class="badge" style="background: var(--bg-card); color: var(--text-muted);">${h(d)}</span>`).join('')}
                    </div>
                  </div>
                  <div style="display: flex; gap: 6px;">
                    <button type="button" class="btn-secondary" data-action="open-catalog-picker" data-mode="append-to-rutina" data-rutina-id="${h(r.id)}" style="width: auto; min-height: 34px; padding: 0 10px;">
                      + Agregar Ejercicio
                    </button>
                    <button type="button" class="btn-secondary" data-action="edit-rutina" data-rutina-id="${h(r.id)}" style="width: auto; min-height: 34px; padding: 0 10px;">
                      Editar
                    </button>
                    <button type="button" class="btn-secondary" data-action="delete-rutina" data-rutina-id="${h(r.id)}" style="width: auto; min-height: 34px; padding: 0 10px;">
                      ✕
                    </button>
                  </div>
                </div>

                ${(r.ejercicios || []).length === 0 ? `
                  <p style="font-size: 12px; color: var(--text-dim);">Sin ejercicios todavía. Tocá "+ Agregar Ejercicio" para elegir del catálogo.</p>
                ` : `
                  <div style="display: flex; flex-direction: column; gap: 6px; padding-top: 8px;">
                    ${r.ejercicios.map((re, idx) => {
                      const ej = (state.ejercicios || []).find(e => e.id === re.ejercicioId);
                      return `
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; background: var(--bg-card); padding: 8px 12px; border-radius: var(--radius-sm);">
                          <div>
                            <strong style="color: var(--text-main);">${idx + 1}. ${h(ej ? ej.nombre : re.ejercicioId)}</strong>
                            <span style="font-size: 11px; color: var(--text-dim); margin-left: 6px;">(${h(ej ? ej.grupoMuscular : '')} · ${h(ej ? ej.equipo : '')})</span>
                          </div>
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); font-weight: 700;">
                              ${re.seriesObjetivo} series × ${h(re.repsObjetivo)} reps
                            </span>
                            <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(re.ejercicioId)}" title="Ver posición inicial y final">${renderIcon('eye')}</button>
                            <button type="button" data-action="remove-ej-from-rutina" data-rutina-id="${h(r.id)}" data-index="${idx}" style="color: var(--text-dim); font-weight: 800;">✕</button>
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
      </div>

      <!-- Catálogo Total Estandarizado (Activación, Movilidad, Fuerza y AMRAP) -->
      <div class="card">
        <div class="card-header">
          <div>
            <span class="badge badge-blue">Catálogo Total (${catalogo.length} ejercicios)</span>
            <h3 class="card-title" style="margin-top: 4px; color: var(--text-main);">Catálogo Completo: Activación, Movilidad, Fuerza y AMRAP</h3>
            <p style="font-size: 12px; color: var(--text-dim);">
              Explorá cada segmento, mirá la postura inicial y final con el ícono de ojo o añadilo directo a tu rutina de hoy.
            </p>
          </div>
          <button type="button" class="btn-secondary" data-action="open-create-custom-ejercicio" style="width: auto;">
            + Crear Ejercicio Propio
          </button>
        </div>

        <div class="day-chips">
          ${GRUPOS_CATALOGO.map(g => `
            <button type="button" class="day-chip ${catalogoFiltroGrupo === g ? 'selected' : ''}" data-action="filter-catalog-group" data-group="${g}">
              ${g.toUpperCase()}
            </button>
          `).join('')}
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px;">
          ${catalogo
            .filter(e => catalogoFiltroGrupo === 'todos' || e.grupoMuscular === catalogoFiltroGrupo)
            .map(e => `
              <div style="background: var(--bg-elevated); border-radius: var(--radius-md); padding: 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 8px;">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-dim);">
                    <span>${h(e.grupoMuscular)} · ${h(e.equipo)}</span>
                    <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(e.id)}" title="Ver posición inicial y final">${renderIcon('eye')}</button>
                  </div>
                  <h4 style="font-size: 14px; font-weight: 800; margin-top: 4px; color: var(--text-main);">${h(e.nombre)}</h4>
                  <p style="font-size: 11.5px; color: var(--text-dim); margin-top: 2px;">${h(e.notas)}</p>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">
                  ${e.esAmrap || e.grupoMuscular === 'amrap'
                    ? `<span>${e.tiempoTrabajoSeg || 40}s trabajo / ${e.tiempoDescansoSeg || 20}s desc.</span>`
                    : `<span>Sugerido: ${e.seriesSugeridas || 3}×${h(e.repsSugeridas || '8-12')}</span>`
                  }
                  <button type="button" class="badge badge-neon" data-action="add-catalog-to-today" data-ejercicio-id="${h(e.id)}" style="cursor: pointer;">
                    + Añadir a Hoy
                  </button>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    `;
  }

  // 6.3 Pestaña SALUD FÍSICA Y PSICOLÓGICA + PERFIL DE DÍAS/HORARIOS + OBSERVACIONES
  function renderAlumnoSaludSection(state) {
    syncSaludDraftsWithState(state, Store.user);
    const diasSeleccionados = Array.isArray(draftPerfil.diasSemana) ? draftPerfil.diasSemana : [];
    const logs = (state.readinessLogs || []).filter(r => !r.deleted);
    const observaciones = (state.observaciones || []).filter(o => !o.deleted);

    const selEnergia = String(draftReadiness.energia || '4');
    const selEstres = String(draftReadiness.estres || '2');
    const selSueno = String(draftReadiness.sueno || '4');
    const selAlim = String(draftReadiness.alimentacion || '4');

    return `
      <div class="pc-grid-2">
        <!-- Columna 1: Check-in de Salud Física y Psicológica de Hoy -->
        <div class="card">
          <div class="card-header">
            <div>
              <span class="badge badge-neon">Check-in Diario Psicofísico</span>
              <h2 class="card-title" style="margin-top: 4px; color: var(--text-main);">¿Cómo te encontrás hoy física y psicológicamente?</h2>
            </div>
          </div>

          <form data-action="submit-readiness" style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div class="form-group">
                <label class="form-label">Energía Física (1 a 5)</label>
                <select id="rd-energia" class="form-input">
                  <option value="5" ${selEnergia === '5' ? 'selected' : ''}>5 — Excelente / Tope de fuerza</option>
                  <option value="4" ${selEnergia === '4' ? 'selected' : ''}>4 — Muy buena energía</option>
                  <option value="3" ${selEnergia === '3' ? 'selected' : ''}>3 — Normal / Estándar</option>
                  <option value="2" ${selEnergia === '2' ? 'selected' : ''}>2 — Cansado / Fatigado</option>
                  <option value="1" ${selEnergia === '1' ? 'selected' : ''}>1 — Agotamiento extremo</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Estrés Mental / Laboral (1 a 5)</label>
                <select id="rd-estres" class="form-input">
                  <option value="1" ${selEstres === '1' ? 'selected' : ''}>1 — Totalmente relajado</option>
                  <option value="2" ${selEstres === '2' ? 'selected' : ''}>2 — Tranquilo</option>
                  <option value="3" ${selEstres === '3' ? 'selected' : ''}>3 — Estrés moderado</option>
                  <option value="4" ${selEstres === '4' ? 'selected' : ''}>4 — Estrés alto (Alerta Profe)</option>
                  <option value="5" ${selEstres === '5' ? 'selected' : ''}>5 — Estrés crítico / Ansiedad</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Calidad de Sueño (1 a 5)</label>
                <select id="rd-sueno" class="form-input">
                  <option value="5" ${selSueno === '5' ? 'selected' : ''}>5 — Dormí +8 hs profundo</option>
                  <option value="4" ${selSueno === '4' ? 'selected' : ''}>4 — Buen descanso (7 hs)</option>
                  <option value="3" ${selSueno === '3' ? 'selected' : ''}>3 — Regular (6 hs)</option>
                  <option value="2" ${selSueno === '2' ? 'selected' : ''}>2 — Cortado / Poco sueño</option>
                  <option value="1" ${selSueno === '1' ? 'selected' : ''}>1 — Insomnio / Mal descanso</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Nutrición e Hidratación (1 a 5)</label>
                <select id="rd-alimentacion" class="form-input">
                  <option value="5" ${selAlim === '5' ? 'selected' : ''}>5 — Óptima pre-entreno</option>
                  <option value="4" ${selAlim === '4' ? 'selected' : ''}>4 — Bien alimentado</option>
                  <option value="3" ${selAlim === '3' ? 'selected' : ''}>3 — Normal</option>
                  <option value="2" ${selAlim === '2' ? 'selected' : ''}>2 — Comí poco hoy</option>
                  <option value="1" ${selAlim === '1' ? 'selected' : ''}>1 — En ayunas / Deshidratado</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">¿Tenés alguna molestia articular o muscular hoy?</label>
              <input type="text" id="rd-dolor" class="form-input" value="${h(draftReadiness.zonaDolor || '')}" placeholder="Dejá vacío si estás sin dolor, o escribí ej: Molestia hombro derecho...">
            </div>

            <div class="form-group">
              <label class="form-label">Observación personal del día (Opcional)</label>
              <textarea id="rd-obs" class="form-input" rows="2" placeholder="Cómo te sentís de ánimo, motivación, sensaciones...">${h(draftReadiness.observacionAlumno || '')}</textarea>
            </div>

            <button type="submit" class="btn-primary">
              ✓ Registrar Estado Físico y Psicológico de Hoy
            </button>
          </form>

          ${logs.length > 0 ? `
            <div style="padding-top: 12px;">
              <h4 style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-dim); margin-bottom: 8px;">
                Últimos Check-ins Registrados (${logs.length})
              </h4>
              <div style="display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto;">
                ${logs.map(l => `
                  <div style="background: var(--bg-elevated); padding: 10px 12px; border-radius: var(--radius-sm); font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; font-weight: 700; color: var(--text-main);">
                      <span>${h(l.fecha)} (${h(l.hora)})</span>
                      <span style="color: var(--cta-blue-light);">Energía ${l.energia}/5 · Estrés ${l.estres}/5</span>
                    </div>
                    ${l.zonaDolor ? `<p style="color: var(--text-muted); margin-top: 2px;">Molestia: ${h(l.zonaDolor)}</p>` : ''}
                    ${l.observacionAlumno ? `<p style="color: var(--text-dim); margin-top: 2px;">"${h(l.observacionAlumno)}"</p>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Columna 2: Datos Físicos, Días de Semana, Horarios y Observaciones -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div class="card">
            <span class="badge badge-blue">Mi Ficha Física y Asistencia</span>
            <h2 class="card-title" style="color: var(--text-main);">Días que voy al Gimnasio, Horarios y Biometría</h2>

            <form data-action="save-perfil-fisico" style="display: flex; flex-direction: column; gap: 12px;">
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                <div class="form-group">
                  <label class="form-label">Edad</label>
                  <input type="number" id="pf-edad" class="form-input" value="${h(draftPerfil.edad || '')}" placeholder="Ej: 28">
                </div>
                <div class="form-group">
                  <label class="form-label">Peso Actual (kg)</label>
                  <input type="number" step="0.1" id="pf-peso" class="form-input" value="${h(draftPerfil.pesoKg || '')}" placeholder="Ej: 78.5">
                </div>
                <div class="form-group">
                  <label class="form-label">Altura (cm)</label>
                  <input type="number" id="pf-altura" class="form-input" value="${h(draftPerfil.alturaCm || '')}" placeholder="Ej: 176">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">¿Qué días de la semana vas al gimnasio?</label>
                <div class="day-chips" id="pf-dias-container">
                  ${DIAS_SEMANA.map(d => `
                    <button type="button" class="day-chip ${diasSeleccionados.includes(d) ? 'selected' : ''}" data-action="toggle-perfil-dia" data-dia="${d}">
                      ${d}
                    </button>
                  `).join('')}
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="form-group">
                  <label class="form-label">Horario Habitual de Entreno</label>
                  <input type="time" id="pf-horario" class="form-input" value="${h(draftPerfil.horarioHabitual || '19:00')}">
                </div>
                <div class="form-group">
                  <label class="form-label">Lesiones o Antecedentes</label>
                  <input type="text" id="pf-lesiones" class="form-input" value="${h(draftPerfil.lesiones || '')}" placeholder="Ej: Ninguna / Lumbar">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Objetivo Principal</label>
                <input type="text" id="pf-objetivo" class="form-input" value="${h(draftPerfil.objetivoCorto || '')}" placeholder="Ej: Ganar masa muscular y fuerza en básicos">
              </div>

              <button type="button" class="btn-primary" data-action="save-perfil-fisico">
                ✓ Guardar Ficha Física, Días y Horario
              </button>
            </form>
          </div>

          <!-- Bitácora de Observaciones (Alumno + Profesor) -->
          <div class="card">
            <h3 class="card-title" style="color: var(--text-main);">Bitácora de Observaciones Clínicas y Notas</h3>
            <form data-action="add-alumno-observacion" style="display: flex; gap: 8px;">
              <input type="text" id="alumno-obs-input" class="form-input" placeholder="Agregar nota u observación sobre tu entrenamiento..." required>
              <button type="submit" class="btn-secondary" style="width: auto; white-space: nowrap;">+ Guardar Nota</button>
            </form>

            ${observaciones.length === 0 ? `
              <p style="font-size: 12px; color: var(--text-dim);">No hay observaciones cargadas todavía.</p>
            ` : `
              <div class="timeline">
                ${observaciones.map(o => `
                  <div class="timeline-item">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim);">
                      <strong>${h(o.autor)} · ${h(o.categoria)}</strong>
                      <span>${h(o.fecha)} ${h(o.hora)}</span>
                    </div>
                    <p style="font-size: 13px; margin-top: 4px; color: var(--text-main);">${h(o.texto)}</p>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
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
    `;
  }

  // 6.5 Pestaña AJUSTES Y BACKUP
  function renderAlumnoAjustesSection(state, user) {
    return `
      <div class="pc-grid-2">
        <div class="card">
          <div class="card-header">
            <div>
              <span class="badge badge-blue">Cuenta Aislada Multiusuario</span>
              <h2 class="card-title" style="margin-top: 4px; color: var(--text-main);">${h(user.displayName)} (@${h(user.username)})</h2>
              <p style="font-size: 12px; color: var(--text-dim); font-family: var(--font-mono); margin-top: 2px;">
                Código de vinculación: <strong style="color: var(--text-main);">${h(state.codigoAlumno)}</strong>
              </p>
            </div>
            <button type="button" class="btn-logout" data-action="logout">
              Cerrar Sesión
            </button>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn-secondary" data-action="open-sugerencias-modal" style="width: auto;">
              ${renderIcon('bulb')} Enviar Sugerencia
            </button>
            <button type="button" class="btn-secondary" data-action="reset-account-zero" style="width: auto;">
              Vaciar mis rutinas/series y dejar cuenta en cero
            </button>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title" style="color: var(--text-main);">Tema de la Interfaz</h3>
          <p style="font-size: 12px; color: var(--text-dim);">
            Elegí cómo querés ver la aplicación: modo oscuro (zinc/negro), modo claro clínico de alto contraste o automático según tu sistema.
          </p>
          ${renderThemeSelector()}
        </div>

        <div class="card">
          <h3 class="card-title" style="color: var(--text-main);">Exportar / Importar Respaldo JSON Offline</h3>
          <p style="font-size: 12px; color: var(--text-dim);">
            Guardá una copia completa de tus rutinas, entrenamientos y fotos en tu dispositivo.
          </p>
          <div style="display: flex; gap: 10px;">
            <button type="button" class="btn-secondary" data-action="export-backup">Descargar JSON</button>
            <label class="btn-secondary" style="cursor: pointer;">
              Importar JSON
              <input type="file" accept=".json" style="display: none;" data-action="import-backup">
            </label>
          </div>
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
                  🔗 Vincular Cuenta de Alumno
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
                        <div style="font-size: 11px; font-family: var(--font-mono); opacity: 0.8;">🔑 ${h(al.codigoAlumno)}</div>
                      </div>
                      ${tieneAlerta ? `<span class="badge badge-rose">⚠️ Alerta</span>` : `<span class="badge badge-emerald">Activo</span>`}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <button type="button" class="pc-nav-btn" data-action="open-sugerencias-modal">
              <span>💡</span><span>Sugerencias</span>
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
                      <span class="badge badge-blue" style="font-family: var(--font-mono); font-size: 12px;">🔑 CÓDIGO: ${h(stAlumno.codigoAlumno)}</span>
                      <h2 style="font-size: 20px; font-weight: 800; color: var(--text-main);">Ficha Clínica de ${h(alumnoActivo.displayName)}</h2>
                    </div>
                    <p style="font-size: 13px; color: var(--text-muted); margin-top: 6px; line-height: 1.6;">
                      Peso: <strong>${h(stAlumno.perfil.pesoKg || 'Sin cargar')} kg</strong> ·
                      Altura: <strong>${h(stAlumno.perfil.alturaCm || 'Sin cargar')} cm</strong> ·
                      Días que asiste: <strong>${(stAlumno.perfil.diasSemana || []).length > 0 ? stAlumno.perfil.diasSemana.join(', ') : 'A definir'}</strong> ·
                      Horario: <strong>${h(stAlumno.perfil.horarioHabitual || '19:00')} hs</strong>
                    </p>
                    ${stAlumno.perfil.lesiones ? `<p style="font-size: 12px; color: var(--accent-rose); font-weight: 700; margin-top: 2px;">⚠️ Lesiones/Antecedentes: ${h(stAlumno.perfil.lesiones)}</p>` : ''}
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
                      <h3 class="card-title" style="margin-top: 4px;">📋 Rutinas del Alumno (${(stAlumno.rutinas || []).filter(r => !r.deleted).length})</h3>
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
                                📅 ${(r.dias || []).join(', ')} · ⏰ Turno ${h(r.horario || '19:00')} hs
                              </p>
                            </div>
                            <div style="display: flex; gap: 6px;">
                              <button type="button" class="btn-secondary" data-action="open-catalog-picker" data-mode="append-to-rutina" data-rutina-id="${h(r.id)}" data-target-username="${h(alumnoActivo.username)}" style="width: auto; min-height: 32px; padding: 0 10px;">
                                + Sumar Ejercicio
                              </button>
                              <button type="button" class="btn-secondary" data-action="edit-rutina" data-rutina-id="${h(r.id)}" data-target-username="${h(alumnoActivo.username)}" style="width: auto; min-height: 32px; padding: 0 10px;">
                                ✏️ Editar
                              </button>
                              <button type="button" class="btn-secondary" data-action="delete-rutina" data-rutina-id="${h(r.id)}" data-target-username="${h(alumnoActivo.username)}" style="width: auto; min-height: 32px; padding: 0 10px; color: var(--accent-rose);">
                                🗑️
                              </button>
                            </div>
                          </div>

                          <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border-subtle); padding-top: 8px;">
                            ${(r.ejercicios || []).map((re, idx) => {
                              const ej = (stAlumno.ejercicios || []).find(e => e.id === re.ejercicioId);
                              return `
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 6px 8px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                                  <span><strong style="color: var(--text-main);">${idx + 1}. ${h(ej ? ej.nombre : re.ejercicioId)}</strong></span>
                                  <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-family: var(--font-mono); font-weight: 700; color: var(--steel-blue);">${re.seriesObjetivo}×${h(re.repsObjetivo)}</span>
                                    <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(re.ejercicioId)}" title="Ver ejercicio">👁️</button>
                                    <button type="button" data-action="remove-ej-from-rutina" data-rutina-id="${h(r.id)}" data-index="${idx}" data-target-username="${h(alumnoActivo.username)}" style="color: var(--accent-rose); font-weight: 800;">✕</button>
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
                    <h3 class="card-title">🩺 Establecer Observación para ${h(alumnoActivo.displayName)}</h3>
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
                    <h3 class="card-title">🧠 Reportes de Salud Física y Psicológica (Readiness)</h3>
                    ${(stAlumno.readinessLogs || []).filter(r => !r.deleted).length === 0 ? `
                      <p style="font-size: 12px; color: var(--text-dim);">El alumno aún no cargó su check-in psicofísico diario.</p>
                    ` : `
                      <div style="display: flex; flex-direction: column; gap: 8px; max-height: 190px; overflow-y: auto;">
                        ${(stAlumno.readinessLogs || []).filter(r => !r.deleted).map(l => `
                          <div style="background: var(--bg-elevated); border-left: 4px solid ${l.estres >= 4 || l.dolorArticular ? 'var(--accent-rose)' : 'var(--accent-emerald)'}; padding: 10px 12px; border-radius: var(--radius-sm); font-size: 12px;">
                            <div style="display: flex; justify-content: space-between; font-weight: 800;">
                              <span>📅 ${h(l.fecha)} (${h(l.hora)})</span>
                              <span>⚡ Energía ${l.energia}/5 · 🧠 Estrés ${l.estres}/5 · 😴 Sueño ${l.sueno || 4}/5</span>
                            </div>
                            ${l.zonaDolor ? `<p style="color: var(--accent-rose); font-weight: 700; margin-top: 2px;">⚠️ Dolor reportado: ${h(l.zonaDolor)}</p>` : ''}
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
                  <h3 class="card-title">📈 Evolución Histórica del Alumno (Fuerza 1RM vs. Estrés)</h3>
                  ${renderGraficoEvolucionSVG(stAlumno)}
                </div>

                <div class="card">
                  <div class="card-header">
                    <div>
                      <h3 class="card-title">📷 Fotos Evolutivas y Posturales del Alumno</h3>
                      <p style="font-size: 12px; color: var(--text-muted);">
                        Podés ver las fotos subidas por el alumno o adjuntar fotos de evaluación postural con sello de fecha automático.
                      </p>
                    </div>
                  </div>

                  <div style="display: flex; gap: 8px; align-items: center; background: var(--bg-elevated); padding: 10px; border-radius: var(--radius-md); flex-wrap: wrap;">
                    <input type="text" id="trainer-foto-nota" class="form-input" placeholder="Nota clínica de la foto (ej: Control postural sentadilla)" style="flex: 1; min-width: 180px;">
                    <label class="btn-primary" style="width: auto; cursor: pointer;">
                      📷 Adjuntar Foto con Fecha
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
    else if (activeTab === 'salud') content = renderAlumnoSaludSection(state);
    else if (activeTab === 'evolucion') content = renderAlumnoEvolucionSection(state);
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
          <button type="button" class="nav-item ${activeTab === 'salud' ? 'active' : ''}" data-action="switch-tab" data-tab="salud">
            <span class="nav-icon">${renderIcon('activity')}</span><span>Salud & Días</span>
          </button>
          <button type="button" class="nav-item ${activeTab === 'evolucion' ? 'active' : ''}" data-action="switch-tab" data-tab="evolucion">
            <span class="nav-icon">${renderIcon('chart')}</span><span>Evolución</span>
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
    else if (activeTab === 'salud') content = renderAlumnoSaludSection(state);
    else if (activeTab === 'evolucion') content = renderAlumnoEvolucionSection(state);
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
              <button type="button" class="pc-nav-btn ${activeTab === 'salud' ? 'active' : ''}" data-action="switch-tab" data-tab="salud">
                ${renderIcon('activity')}<span>Salud Física/Psicológica & Días</span>
              </button>
              <button type="button" class="pc-nav-btn ${activeTab === 'evolucion' ? 'active' : ''}" data-action="switch-tab" data-tab="evolucion">
                ${renderIcon('chart')}<span>Histórico Evolutivo & Fotos</span>
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
  function renderModals() {
    let overlay = document.getElementById('modal-overlay');
    if (!activeModal) {
      if (overlay) overlay.remove();
      return;
    }

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-overlay';
      overlay.className = 'modal-overlay';
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
                <option value="alumno" selected>🏃 Soy Alumno / Atleta (Recibe Código Único GYM-XXXX)</option>
                <option value="profesor">📋 Soy Docente / Profesor (Panel Clínico de Alumnos)</option>
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
                  const ej = (state.ejercicios || []).find(e => e.id === re.ejercicioId);
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

      const esModoMovilidad = activeModal.mode === 'workout-movilidad' || catalogoFiltroGrupo === 'movilidad';
      const esModoAmrap = activeModal.mode === 'append-to-amrap';

      overlay.innerHTML = `
        <div class="modal-card" style="max-width: 680px;">
          <div class="card-header">
            <div>
              <span class="badge badge-neon">${esModoAmrap ? 'Sumar Ejercicio dentro de tu Rutina AMRAP' : 'Catálogo Total (Activación · Movilidad · Fuerza · AMRAP)'}</span>
              <h2 class="card-title" style="margin-top: 4px; color: var(--text-main);">Seleccioná un Ejercicio para Añadir</h2>
            </div>
            <button type="button" class="btn-close-modal" data-action="close-modal" title="Cerrar">✕</button>
          </div>

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

          <!-- Lista de Ejercicios con 👁️ y botón "+ Añadir" -->
          <div style="display: flex; flex-direction: column; gap: 8px; max-height: 340px; overflow-y: auto;">
            ${filtrados.map(e => `
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; background: var(--bg-elevated); padding: 12px 14px; border-radius: var(--radius-md);">
                <div style="flex: 1;">
                  <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                    <span class="badge badge-neon">${h(e.grupoMuscular)}</span>
                    <span style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">${h(e.equipo)}</span>
                    ${e.esAmrap || e.grupoMuscular === 'amrap' ? `<span class="badge badge-amber">${e.tiempoTrabajoSeg || 40}s / ${e.tiempoDescansoSeg || 20}s</span>` : ''}
                  </div>
                  <div style="font-size: 14px; font-weight: 800; margin-top: 3px; color: var(--text-main);">${h(e.nombre)}</div>
                  <div style="font-size: 11.5px; color: var(--text-dim);">${h(e.notas)}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button type="button" class="btn-eye-icon" data-action="view-ejercicio" data-ejercicio-id="${h(e.id)}" title="Ver posición inicial y final">
                    ${renderIcon('eye')}
                  </button>
                  <button type="button" class="btn-primary" data-action="pick-catalog-exercise" data-ejercicio-id="${h(e.id)}" style="width: auto; min-height: 36px; padding: 0 14px;">
                    + Añadir
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      return;
    }

    // MODAL 4: Crear un Ejercicio Personalizado Nuevo en el Catálogo
    if (activeModal.type === 'create-custom-ejercicio') {
      overlay.innerHTML = `
        <div class="modal-card">
          <div class="card-header">
            <h2 class="card-title">+ Sumar Ejercicio Personalizado al Catálogo</h2>
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
                  <option value="activacion">Activación</option>
                  <option value="movilidad">Movilidad</option>
                  <option value="pecho" selected>Pecho</option>
                  <option value="espalda">Espalda</option>
                  <option value="piernas">Piernas</option>
                  <option value="hombros">Hombros</option>
                  <option value="brazos">Brazos</option>
                  <option value="core">Core</option>
                  <option value="amrap">AMRAP</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Equipo</label>
                <select id="custom-ej-equipo" class="form-input">
                  <option value="barra">Barra</option>
                  <option value="mancuerna">Mancuerna</option>
                  <option value="polea">Polea</option>
                  <option value="maquina">Máquina</option>
                  <option value="corporal">Corporal</option>
                  <option value="banda">Banda</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Notas técnicas</label>
              <input type="text" id="custom-ej-notas" class="form-input" placeholder="Indicaciones de postura o recorrido">
            </div>
            <button type="submit" class="btn-primary">Guardar en el Catálogo</button>
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
                <div style="font-size: 32px; margin-bottom: 8px;">🏋️</div>
                <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">${h(ej.nombre)}</div>
                <div style="font-size: 12px; color: #64748b;">Demostración de postura inicial y final guiada por tu profesor de sala.</div>
              </div>
            ` : `
              <div style="display: flex; width: 100%; min-height: 180px; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; text-align: center; color: #1e293b; background: #ffffff; border-radius: var(--radius-md);">
                <div style="font-size: 32px; margin-bottom: 8px;">🏋️</div>
                <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">${h(ej.nombre)}</div>
                <div style="font-size: 12px; color: #64748b;">Demostración de postura inicial y final guiada por tu profesor de sala.</div>
              </div>
            `}
          </div>

          <!-- Pautas Técnicas -->
          <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px; font-size: 12px;">
            <div style="font-weight: 800; color: var(--text-main); margin-bottom: 4px; text-transform: uppercase; font-size: 11px;">
              📋 Ejecución Técnica:
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

    // MODAL 9: Buzón de Sugerencias (Con Dictado por Voz, Adjunto de Capturas y Botón ✕ Visible)
    if (activeModal.type === 'sugerencias') {
      const sugerencias = (state.sugerencias || []).filter(s => !s.deleted);
      overlay.innerHTML = `
        <div class="modal-card">
          <div class="modal-header-sticky">
            <div>
              <span class="badge badge-neon">Mejora Continua · JF Development</span>
              <h2 class="card-title" style="margin-top: 4px; color: var(--text-main);">Buzón de Sugerencias</h2>
              <p style="font-size: 12px; color: var(--text-dim);">
                Escribí o dictá por voz tu sugerencia y adjuntá capturas de pantalla si lo necesitás.
              </p>
            </div>
            <button type="button" class="btn-close-modal" data-action="close-modal" title="Cerrar ventana">✕</button>
          </div>

          <form data-action="submit-sugerencia" style="display: flex; flex-direction: column; gap: 12px;">
            <div class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                <label class="form-label" for="sug-mensaje">Tu Sugerencia</label>
                <button type="button" class="btn-dictar ${isDictatingSugerencia ? 'listening' : ''}" data-action="dictar-sugerencia">
                  ${isDictatingSugerencia ? '🔴 Escuchando... Tocar para detener' : '🎤 Dictar por voz'}
                </button>
              </div>
              <textarea id="sug-mensaje" class="form-input" rows="4" placeholder="Escribí o tocá 'Dictar por voz' (o el micrófono de tu teclado) para dictar tu sugerencia..." required>${h(draftSugerenciaTexto)}</textarea>
            </div>

            <!-- Adjuntar capturas de pantalla -->
            <div class="form-group">
              <label class="btn-secondary" style="cursor: pointer; width: 100%; justify-content: center;">
                📷 Adjuntar Captura(s) de Pantalla (${draftSugerenciaCapturas.length})
                <input type="file" accept="image/*" multiple data-action="upload-sugerencia-capturas" style="display: none;">
              </label>

              ${draftSugerenciaCapturas.length > 0 ? `
                <div class="sug-capturas-grid">
                  ${draftSugerenciaCapturas.map((cap, cIdx) => `
                    <div class="sug-captura-thumb">
                      <img src="${cap}" alt="Captura ${cIdx + 1}">
                      <button type="button" class="sug-captura-remove" data-action="remove-draft-sug-captura" data-index="${cIdx}" title="Quitar captura">✕</button>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px;">
              <button type="button" class="btn-secondary" data-action="close-modal" style="width: auto;">Cerrar</button>
              <button type="submit" class="btn-primary" style="width: auto;">✓ Guardar Sugerencia</button>
            </div>
          </form>

          ${sugerencias.length > 0 ? `
            <div style="padding-top: 10px; border-top: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 8px;">
              <div style="background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: var(--radius-sm); padding: 10px 12px; font-size: 12px; color: var(--text-main); line-height: 1.4;">
                💾 <strong>Modo Offline:</strong> Estas sugerencias están guardadas en la memoria de este teléfono. Tocá el botón verde de abajo para copiarlas y pegarlas en el chat para que el asistente las aplique:
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span class="form-label" style="margin: 0;">Sugerencias Guardadas (${sugerencias.length})</span>
                <button type="button" class="btn-primary" data-action="share-sugerencias" style="width: auto; min-height: 34px; padding: 6px 14px; font-size: 12px !important; background: var(--accent-neon); color: #000; font-weight: 700;">
                  📋 Copiar todas para el Chat / WhatsApp
                </button>
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto;">
                ${sugerencias.map(s => `
                  <div style="background: var(--bg-elevated); padding: 10px 12px; border-radius: var(--radius-sm); font-size: 12.5px; border: 1px solid var(--border-subtle);">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-dim);">
                      <strong>${h(s.autor || 'Usuario')} · ${h(s.fecha)} ${h(s.hora)}</strong>
                      <button type="button" data-action="delete-sugerencia" data-sug-id="${h(s.id)}" style="color: var(--text-dim); font-weight: 800; padding: 2px 6px;" title="Borrar sugerencia">✕</button>
                    </div>
                    <p style="margin-top: 4px; color: var(--text-main); white-space: pre-wrap;">${h(s.mensaje || s.texto || '')}</p>
                    ${Array.isArray(s.capturas) && s.capturas.length > 0 ? `
                      <div class="sug-capturas-grid" style="margin-top: 8px;">
                        ${s.capturas.map((imgUrl, idx) => `
                          <div class="sug-captura-thumb">
                            <img src="${imgUrl}" alt="Adjunto ${idx + 1}">
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
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
  }

  function renderFloatingTimer() {
    const container = document.getElementById('floating-timer-container');
    if (!container) return;
    if (!Timer.isRunning) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <div class="floating-timer">
        <span>${renderIcon('clock')} Descanso</span>
        <span class="timer-digits">${Timer.format()}</span>
        <button type="button" class="timer-btn" data-action="timer-add" data-seconds="30">+30s</button>
        <button type="button" class="timer-btn" data-action="timer-stop" style="color: var(--danger);">✕</button>
      </div>
    `;
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
      }
    },

    'set-theme-pref': el => {
      const val = el.getAttribute('data-theme-val') || 'dark';
      if (Store.setThemePreference) {
        Store.setThemePreference(val);
      }
      render();
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
      draftSaludUser = null;
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
      const rutinaId = el.getAttribute('data-rutina-id') || null;
      const amrapId = el.getAttribute('data-amrap-id') || null;
      const targetUser = el.getAttribute('data-target-username') || null;
      draftRutina.targetUsername = targetUser;
      activeModal = { type: 'catalog-picker', mode, rutinaId, amrapId, targetUser };
      renderModals();
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

      // Caso 3: Agregar a la rutina de hoy (Activación, Movilidad o Entrenamiento)
      const mode = activeModal ? activeModal.mode : 'workout';

      Store.commit(s => {
        let next = s;
        if (!next.entrenamientoActivoId) {
          next = Engine.iniciarEntrenamiento(next, null);
        }

        if (mode === 'workout-movilidad' || ejObj.grupoMuscular === 'movilidad') {
          return Engine.guardarMovilidad(next, {
            ejercicioId: ejObj.id,
            nombre: ejObj.nombre,
            series: seriesObj || ejObj.seriesSugeridas || 2,
            reps: repsObj || ejObj.repsSugeridas || '15',
            pesoKg: pesoObj || ejObj.pesoSugerido || 0,
            notas: ejObj.notas || ''
          });
        }

        if (mode === 'workout-activacion' || ejObj.grupoMuscular === 'activacion') {
          return Engine.agregarEjercicioASesion(next, next.entrenamientoActivoId, {
            ejercicioId: ejObj.id,
            segmento: 'activacion',
            seriesObjetivo: seriesObj || ejObj.seriesSugeridas || 2,
            repsObjetivo: repsObj || ejObj.repsSugeridas || '12',
            notas: ejObj.notas || ''
          });
        }

        return Engine.agregarEjercicioASesion(next, next.entrenamientoActivoId, {
          ejercicioId: ejObj.id,
          segmento: 'entrenamiento',
          seriesObjetivo: seriesObj || ejObj.seriesSugeridas || 3,
          repsObjetivo: repsObj || ejObj.repsSugeridas || '8-10',
          notas: ejObj.notas || ''
        });
      });

      activeModal = null;
      activeTab = 'hoy';
      showToast(`✓ "${ejObj.nombre}" añadido a tu rutina de hoy.`);
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
        if (ejObj.grupoMuscular === 'movilidad') {
          return Engine.guardarMovilidad(next, {
            ejercicioId: ejObj.id,
            nombre: ejObj.nombre,
            series: ejObj.seriesSugeridas || 2,
            reps: ejObj.repsSugeridas || '15',
            pesoKg: ejObj.pesoSugerido || 0,
            notas: ejObj.notas || ''
          });
        }
        if (ejObj.grupoMuscular === 'activacion') {
          return Engine.agregarEjercicioASesion(next, next.entrenamientoActivoId, {
            ejercicioId: ejObj.id,
            segmento: 'activacion',
            seriesObjetivo: ejObj.seriesSugeridas || 2,
            repsObjetivo: ejObj.repsSugeridas || '12',
            notas: ejObj.notas || ''
          });
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

    'open-create-custom-ejercicio': () => {
      activeModal = { type: 'create-custom-ejercicio' };
      renderModals();
    },

    'submit-custom-ejercicio': () => {
      const nombre = document.getElementById('custom-ej-nombre').value;
      const grupoMuscular = document.getElementById('custom-ej-grupo').value;
      const equipo = document.getElementById('custom-ej-equipo').value;
      const notas = document.getElementById('custom-ej-notas').value;

      Store.commit(s => Engine.crearEjercicio(s, { nombre, grupoMuscular, equipo, notas }));
      activeModal = null;
      showToast('✓ Ejercicio personalizado sumado al catálogo.');
      render();
    },

    // --- EJECUCIÓN DE ENTRENAMIENTO ---
    'start-today-session': () => {
      Store.commit(s => Engine.iniciarEntrenamiento(s, null));
      activeTab = 'hoy';
      showToast('Sesión de hoy iniciada: cargá tu Activación, Movilidad y Entrenamiento');
      render();
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
      Store.commit(s => Engine.finalizarEntrenamiento(s, id));
      Timer.stop();
      showToast('¡Sesión completada! Tu histórico evolutivo se actualizó.');
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

    // --- SUGERENCIAS (CON VOZ, CAPTURAS Y COMPARTIR) ---
    'open-sugerencias-modal': () => {
      activeModal = { type: 'sugerencias' };
      renderModals();
    },

    'dictar-sugerencia': () => {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        const textarea = document.getElementById('sug-mensaje');
        if (textarea) textarea.focus();
        showToast('Tu navegador no soporta dictado directo: tocá el micrófono 🎤 del teclado de tu teléfono.');
        return;
      }

      if (isDictatingSugerencia && activeSpeechRecognition) {
        try { activeSpeechRecognition.stop(); } catch (_) {}
        isDictatingSugerencia = false;
        activeSpeechRecognition = null;
        renderModals();
        return;
      }

      const rec = new SpeechRec();
      rec.lang = 'es-AR';
      rec.continuous = false;
      rec.interimResults = false;
      activeSpeechRecognition = rec;
      isDictatingSugerencia = true;

      const curTextarea = document.getElementById('sug-mensaje');
      if (curTextarea) draftSugerenciaTexto = curTextarea.value;
      renderModals();

      rec.onresult = ev => {
        let transcript = '';
        for (let i = 0; i < ev.results.length; i++) {
          transcript += ev.results[i][0].transcript + ' ';
        }
        const cleaned = transcript.trim();
        if (cleaned) {
          draftSugerenciaTexto = (draftSugerenciaTexto ? draftSugerenciaTexto.trim() + ' ' : '') + cleaned;
        }
      };

      rec.onerror = () => {
        isDictatingSugerencia = false;
        activeSpeechRecognition = null;
        showToast('No se pudo escuchar el audio. También podés usar el micrófono de tu teclado.');
        renderModals();
      };

      rec.onend = () => {
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

    'submit-sugerencia': () => {
      const mensaje = document.getElementById('sug-mensaje')?.value?.trim() || draftSugerenciaTexto.trim();
      if (!mensaje && draftSugerenciaCapturas.length === 0) {
        showToast('Escribí o dictá tu sugerencia antes de guardar.');
        return;
      }

      const capturasCopy = [...draftSugerenciaCapturas];
      Store.enviarFeedback({ mensaje: mensaje || '(Captura adjunta)', tipo: 'Sugerencia' });
      Store.commit(s =>
        Engine.agregarSugerencia(s, {
          mensaje: mensaje || '(Captura adjunta)',
          autor: Store.user?.displayName || 'Usuario',
          rol: Store.user?.role || 'alumno',
          capturas: capturasCopy
        })
      );
      if (navigator.clipboard && navigator.clipboard.writeText && mensaje) {
        try { navigator.clipboard.writeText(mensaje); } catch (_) {}
      }
      draftSugerenciaTexto = '';
      draftSugerenciaCapturas = [];
      showToast('✓ Sugerencia guardada y copiada al portapapeles. ¡Pegala en el chat!');
      renderModals();
    },

    'delete-sugerencia': el => {
      const sugId = el.getAttribute('data-sug-id');
      if (!sugId) return;
      const curTextarea = document.getElementById('sug-mensaje');
      if (curTextarea) draftSugerenciaTexto = curTextarea.value;
      Store.commit(s => Engine.borrarSugerencia(s, sugId));
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
      }
    },

    // --- CARGAR 1 SERIE (SIN CRONÓMETRO DE DESCANSO) ---
    'save-serie': el => {
      const ejId = el.getAttribute('data-ejercicio-id');
      const trId = el.getAttribute('data-entrenamiento-id');

      const peso = parseFloat(document.getElementById(`input-peso-${ejId}`)?.value) || 0;
      const reps = parseInt(document.getElementById(`input-reps-${ejId}`)?.value, 10) || 0;
      const rir = parseInt(document.getElementById(`select-rir-${ejId}`)?.value, 10) || 2;
      const rpe = parseInt(document.getElementById(`select-rpe-${ejId}`)?.value, 10) || 8;
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

      if (prCheck.isNew1RMPR) {
        showToast(`¡NUEVO RÉCORD 1RM! ${prCheck.new1RM} kg`, { duration: 5000 });
      } else {
        showToast(`✓ Serie registrada: ${peso} kg × ${reps} reps (RIR ${rir} · RPE ${rpe})`);
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
      const rir = parseInt(document.getElementById(`select-rir-${ejId}`)?.value, 10) || 2;
      const rpe = parseInt(document.getElementById(`select-rpe-${ejId}`)?.value, 10) || 8;
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

      showToast(`✓✓ Serie completa cargada: ${cantSeries} series × ${reps} reps con ${peso} kg`, {
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
    'submit-readiness': () => {
      // Capturamos primero ambos formularios del DOM para no alterar la Ficha Física
      captureSaludDraftsFromDOM();

      Store.commit(s =>
        Engine.registrarReadiness(s, {
          energia: draftReadiness.energia,
          estres: draftReadiness.estres,
          sueno: draftReadiness.sueno,
          alimentacion: draftReadiness.alimentacion,
          dolorArticular: Boolean(draftReadiness.zonaDolor),
          zonaDolor: draftReadiness.zonaDolor,
          observacionAlumno: draftReadiness.observacionAlumno
        })
      );
      showToast('✓ Estado físico y psicológico de hoy guardado.');
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
    if (e.target && e.target.id === 'sug-mensaje') {
      draftSugerenciaTexto = e.target.value;
      return;
    }
    const target = e.target.closest('input[data-action="search-catalog"]');
    if (!target) return;
    catalogoBusqueda = target.value;
    renderModals();
    const input = document.getElementById('catalog-search-input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  document.addEventListener('change', e => {
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
  });
})();

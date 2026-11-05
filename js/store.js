/**
 * js/store.js — Persistencia local aislada, Multiusuario (Alumno / Profesor), Vinculación por Código y WebAuthn
 *
 * Responsabilidades:
 * - Persistencia en localStorage bajo el espacio aislado: gimnasio_u_<username>.
 * - Roles soportados: 'alumno' y 'profesor'.
 * - Código único de alumno sencillo (ej. GYM-4821) generado automáticamente al crear cuenta.
 * - Vinculación en vivo: el profesor ingresa el código del alumno y puede ver/crear/editar su rutina,
 *   establecer observaciones clínicas y adjuntar fotos con marca de agua directamente en la cuenta del alumno.
 * - Toda mutación pasa por Store.commit(state => Engine.xxx(state, ...)) o Store.commitForUser(username, mutator).
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./engine.js'));
  } else {
    root.Store = factory(root.Engine);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (Engine) {
  'use strict';

  const STORAGE_PREFIX = 'gimnasio_u_';
  const ACTIVE_USER_KEY = 'gimnasio_active_user';
  const USERS_INDEX_KEY = 'gimnasio_users_index';
  const FEEDBACK_INBOX_KEY = 'gimnasio_feedback_inbox';
  const THEME_PREF_KEY = 'gimnasio_theme_pref';

  const Store = {
    user: null, // { username, displayName, email, role: 'alumno'|'profesor', codigoAlumno, alumnosVinculados: [], isAdmin, hasWebAuthn }
    state: null,
    listeners: new Set(),
    isSyncing: false
  };

  function getUsersIndex() {
    try {
      const raw = localStorage.getItem(USERS_INDEX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveUsersIndex(index) {
    try {
      localStorage.setItem(USERS_INDEX_KEY, JSON.stringify(index));
    } catch (e) {
      console.error('Error guardando índice de usuarios:', e);
    }
  }

  function getStorageKey(username) {
    return `${STORAGE_PREFIX}${String(username || '').trim().toLowerCase()}`;
  }

  /**
   * Asegura que el estado leído de localStorage tenga siempre el catálogo estandarizado de ejercicios
   * y los campos nuevos de la versión 2, manteniendo vacíos los registros si el usuario recién empieza.
   */
  function normalizeState(rawState, codigoAlumno) {
    const base = Engine.seedInitialData(codigoAlumno);
    if (!rawState || typeof rawState !== 'object') return base;

    // Garantizar que estén todos los ejercicios del catálogo estandarizado con sus metadatos actualizados
    const existentesMap = new Map();
    (rawState.ejercicios || []).forEach(e => existentesMap.set(e.id, e));
    Engine.CATALOGO_EJERCICIOS.forEach(catEj => {
      if (!existentesMap.has(catEj.id)) {
        existentesMap.set(catEj.id, { ...catEj, deleted: false, updatedAt: Date.now() });
      } else {
        // Actualizar metadatos de catálogo como musculoActivo, svgTipo, grupoMuscular, etc.
        const prev = existentesMap.get(catEj.id);
        existentesMap.set(catEj.id, { ...prev, ...catEj, deleted: Boolean(prev.deleted) });
      }
    });

    return {
      ...base,
      ...rawState,
      codigoAlumno: rawState.codigoAlumno || codigoAlumno || base.codigoAlumno,
      perfil: { ...base.perfil, ...(rawState.perfil || {}) },
      ejercicios: Array.from(existentesMap.values()),
      rutinas: Array.isArray(rawState.rutinas) ? rawState.rutinas : [],
      entrenamientos: Array.isArray(rawState.entrenamientos) ? rawState.entrenamientos : [],
      series: Array.isArray(rawState.series) ? rawState.series : [],
      ejerciciosSesionHoy: Array.isArray(rawState.ejerciciosSesionHoy) ? rawState.ejerciciosSesionHoy : [],
      movilidad: Array.isArray(rawState.movilidad) ? rawState.movilidad : (Array.isArray(rawState.movilidadSesion) ? rawState.movilidadSesion : []),
      activacionesHoy: (rawState.activacionesHoy && typeof rawState.activacionesHoy === 'object') ? rawState.activacionesHoy : {},
      bloquesAmrap: Array.isArray(rawState.bloquesAmrap) ? rawState.bloquesAmrap : [],
      sugerencias: Array.isArray(rawState.sugerencias) ? rawState.sugerencias : [],
      readinessLogs: Array.isArray(rawState.readinessLogs) ? rawState.readinessLogs : [],
      observaciones: Array.isArray(rawState.observaciones) ? rawState.observaciones : [],
      fotos: Array.isArray(rawState.fotos) ? rawState.fotos : []
    };
  }

  /**
   * Inicializa el Store. Si no hay cuentas creadas aún, crea dos usuarios iniciales
   * con estado 100% limpio (sin rutinas ni entrenamientos cargados) para probar Alumno y Profesor:
   * - alumno: "juan" (Código: GYM-1024, PIN: 1234)
   * - profesor: "profe" (PIN: 1234)
   */
  Store.init = function () {
    Store.applyTheme();
    if (typeof window !== 'undefined' && window.matchMedia) {
      try {
        const mq = window.matchMedia('(prefers-color-scheme: light)');
        if (mq.addEventListener) {
          mq.addEventListener('change', () => {
            if (Store.getThemePreference() === 'system') {
              Store.applyTheme('system');
              Store.notify();
            }
          });
        }
      } catch {}
    }

    let index = getUsersIndex();
    let needsResetClean = false;

    // Verificar si el índice antiguo no tenía roles o códigos de alumno
    if (index.length > 0 && !index.some(u => u.role === 'profesor' || u.codigoAlumno)) {
      needsResetClean = true;
    }

    if (index.length === 0 || needsResetClean) {
      const alumnoUser = {
        username: 'juan',
        displayName: 'Juan (Alumno)',
        email: 'juan@migimnasio.app',
        passwordHash: '1234',
        role: 'alumno',
        codigoAlumno: 'GYM-1024',
        alumnosVinculados: [],
        isAdmin: true,
        hasWebAuthn: true,
        createdAt: Date.now()
      };
      const profeUser = {
        username: 'profe',
        displayName: 'Prof. Julián Vega',
        email: 'profe@migimnasio.app',
        passwordHash: '1234',
        role: 'profesor',
        codigoAlumno: 'PROFE-01',
        alumnosVinculados: [],
        isAdmin: true,
        hasWebAuthn: true,
        createdAt: Date.now()
      };
      index = [alumnoUser, profeUser];
      saveUsersIndex(index);

      // Estado 100% limpio (sin rutinas ni series previas, solo catálogo estandarizado)
      localStorage.setItem(getStorageKey('juan'), JSON.stringify(Engine.seedInitialData('GYM-1024')));
      localStorage.setItem(getStorageKey('profe'), JSON.stringify(Engine.seedInitialData('PROFE-01')));
    }

    try {
      const activeRaw = localStorage.getItem(ACTIVE_USER_KEY);
      if (activeRaw) {
        const parsed = JSON.parse(activeRaw);
        const res = Store.login(parsed.username, parsed.passwordHash, true);
        if (res && res.ok) return res;
      }
    } catch (e) {
      console.warn('No hay sesión activa previa.', e);
    }
    // Entrar directamente como Alumno (Juan) sin pantallas intermedias
    return Store.login('juan', '1234', true);
  };

  /**
   * Inicia sesión con usuario y contraseña.
   */
  Store.login = function (username, password, isRestore = false) {
    const cleanUser = (username || '').trim().toLowerCase();
    const index = getUsersIndex();
    const found = index.find(u => u.username.toLowerCase() === cleanUser);

    if (!found) {
      return { ok: false, error: 'Usuario no encontrado. Creá tu cuenta nueva abajo.' };
    }

    if (!isRestore && found.passwordHash && found.passwordHash !== password) {
      return { ok: false, error: 'Contraseña o PIN incorrecto.' };
    }

    if (!found.codigoAlumno) {
      found.codigoAlumno = Engine.generateAlumnoCode(found.username);
      saveUsersIndex(index);
    }

    Store.user = {
      username: found.username,
      displayName: found.displayName || found.username,
      email: found.email || '',
      role: found.role || 'alumno',
      codigoAlumno: found.codigoAlumno,
      alumnosVinculados: Array.isArray(found.alumnosVinculados) ? found.alumnosVinculados : [],
      isAdmin: Boolean(found.isAdmin),
      hasWebAuthn: Boolean(found.hasWebAuthn)
    };

    localStorage.setItem(
      ACTIVE_USER_KEY,
      JSON.stringify({
        username: found.username,
        passwordHash: found.passwordHash
      })
    );

    Store.loadState();
    Store.notify();

    return { ok: true, user: Store.user };
  };

  /**
   * Registra un usuario nuevo (Alumno o Profesor) con estado 100% limpio desde cero
   * y con el catálogo de ejercicios estandarizados disponible.
   */
  Store.register = function ({ username, displayName, email, password, role = 'alumno' }) {
    const cleanUser = (username || '').trim().toLowerCase();
    if (!cleanUser || cleanUser.length < 3) {
      return { ok: false, error: 'El usuario debe tener al menos 3 caracteres.' };
    }

    const index = getUsersIndex();
    if (index.some(u => u.username.toLowerCase() === cleanUser)) {
      return { ok: false, error: 'Ese nombre de usuario ya existe en este dispositivo.' };
    }

    // Generar código único sencillo (ej. GYM-4821)
    let codigoAlumno = Engine.generateAlumnoCode(cleanUser);
    while (index.some(u => u.codigoAlumno === codigoAlumno)) {
      codigoAlumno = Engine.generateAlumnoCode(cleanUser + Math.random());
    }

    const newUser = {
      username: cleanUser,
      displayName: displayName || cleanUser,
      email: email || '',
      passwordHash: password || '1234',
      role: role === 'profesor' ? 'profesor' : 'alumno',
      codigoAlumno,
      alumnosVinculados: [],
      isAdmin: cleanUser === 'admin' || role === 'profesor',
      hasWebAuthn: false,
      createdAt: Date.now()
    };

    index.push(newUser);
    saveUsersIndex(index);

    // Estado 100% limpio sin rutinas ni entrenamientos cargados
    const cleanState = Engine.seedInitialData(codigoAlumno);
    localStorage.setItem(getStorageKey(cleanUser), JSON.stringify(cleanState));

    return Store.login(cleanUser, newUser.passwordHash, true);
  };

  /**
   * Permite cambiar el rol activo o alternar entre vista Alumno y Profesor para demostración o uso dual.
   */
  Store.setRole = function (newRole) {
    if (!Store.user) return;
    const index = getUsersIndex();
    const found = index.find(u => u.username.toLowerCase() === Store.user.username.toLowerCase());
    if (found) {
      found.role = newRole;
      saveUsersIndex(index);
    }
    Store.user.role = newRole;
    Store.notify();
  };

  Store.logout = function () {
    Store.user = null;
    Store.state = null;
    localStorage.removeItem(ACTIVE_USER_KEY);
    Store.notify();
  };

  // ==========================================
  // 2. SISTEMA DE VINCULACIÓN PROFESOR <-> ALUMNO POR CÓDIGO ÚNICO
  // ==========================================

  /**
   * El profesor ingresa el código único de un alumno (ej: GYM-1024).
   * Si existe en el índice local, lo vincula; si el alumno aún no estaba creado en este navegador,
   * crea su espacio con ese código para que el profesor pueda armarle la rutina de inmediato.
   */
  Store.vincularAlumnoPorCodigo = function (rawCode, nombreOpcional = '') {
    if (!Store.user) return { ok: false, error: 'Iniciá sesión primero.' };

    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) {
      return { ok: false, error: 'Ingresá un código de alumno válido (ej: GYM-1024).' };
    }

    const index = getUsersIndex();
    let targetAlumno = index.find(
      u => (u.codigoAlumno && u.codigoAlumno.toUpperCase() === code) || u.username.toUpperCase() === code
    );

    // Si el profesor ingresa un código GYM-XXXX de un alumno nuevo, podemos inicializar su ficha
    if (!targetAlumno) {
      const autoUsername = 'alumno_' + code.replace(/[^A-Z0-9]/gi, '').toLowerCase();
      targetAlumno = {
        username: autoUsername,
        displayName: nombreOpcional.trim() || `Alumno (${code})`,
        email: '',
        passwordHash: '1234',
        role: 'alumno',
        codigoAlumno: code,
        alumnosVinculados: [],
        isAdmin: false,
        hasWebAuthn: false,
        createdAt: Date.now()
      };
      index.push(targetAlumno);
      localStorage.setItem(getStorageKey(autoUsername), JSON.stringify(Engine.seedInitialData(code)));
    }

    // Asociar a la lista de alumnos vinculados del profesor actual
    const profeRecord = index.find(u => u.username.toLowerCase() === Store.user.username.toLowerCase());
    if (profeRecord) {
      if (!Array.isArray(profeRecord.alumnosVinculados)) {
        profeRecord.alumnosVinculados = [];
      }
      if (!profeRecord.alumnosVinculados.includes(targetAlumno.username)) {
        profeRecord.alumnosVinculados.push(targetAlumno.username);
      }
      saveUsersIndex(index);
      Store.user.alumnosVinculados = [...profeRecord.alumnosVinculados];
    }

    Store.notify();
    return {
      ok: true,
      alumno: targetAlumno,
      mensaje: `Alumno ${targetAlumno.displayName} (${targetAlumno.codigoAlumno}) vinculado con éxito.`
    };
  };

  /**
   * Devuelve todos los alumnos disponibles y vinculados para el panel del profesor.
   */
  Store.getAlumnosVinculados = function () {
    const index = getUsersIndex();
    if (!Store.user) return [];
    const vinculadosSet = new Set(Store.user.alumnosVinculados || []);

    return index
      .filter(u => vinculadosSet.has(u.username))
      .map(u => {
        const st = Store.getUserState(u.username);
        return {
          username: u.username,
          displayName: u.displayName || u.username,
          email: u.email || '',
          codigoAlumno: u.codigoAlumno || st.codigoAlumno || 'GYM-0000',
          state: st
        };
      });
  };

  /**
   * Devuelve la lista de todos los alumnos registrados en el dispositivo (para facilitar pruebas).
   */
  Store.getTodosLosAlumnos = function () {
    const index = getUsersIndex();
    return index.filter(u => u.role === 'alumno');
  };

  /**
   * Lee el estado aislado de cualquier usuario (útil para que el profesor lea la ficha de su alumno).
   */
  Store.getUserState = function (username) {
    const index = getUsersIndex();
    const u = index.find(item => item.username.toLowerCase() === String(username || '').toLowerCase());
    const key = getStorageKey(username);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        return normalizeState(JSON.parse(raw), u ? u.codigoAlumno : null);
      }
    } catch (e) {
      console.error('Error leyendo estado de alumno:', e);
    }
    const fresh = Engine.seedInitialData(u ? u.codigoAlumno : null);
    localStorage.setItem(key, JSON.stringify(fresh));
    return fresh;
  };

  /**
   * Permite al Profesor mutar el estado de un alumno vinculado (crear/editar su rutina,
   * agregar observaciones clínicas o adjuntar fotos) respetando la regla Store.commit.
   */
  Store.commitForUser = function (targetUsername, mutatorFn) {
    const currentState = Store.getUserState(targetUsername);
    const nextState = mutatorFn(currentState);
    if (!nextState) return currentState;

    const key = getStorageKey(targetUsername);
    try {
      localStorage.setItem(key, JSON.stringify(nextState));
    } catch (e) {
      console.error('Error guardando estado de alumno:', e);
    }

    // Si el usuario modificado es también el usuario activo en sesión, actualizar memoria
    if (Store.user && Store.user.username.toLowerCase() === String(targetUsername).toLowerCase()) {
      Store.state = nextState;
    }

    Store.notify();
    Store.enqueueSync();
    return nextState;
  };

  // ==========================================
  // 3. WEBAUTHN (FACE ID / HUELLA)
  // ==========================================

  Store.loginWithBiometrics = async function (username) {
    const cleanUser = (username || (Store.user ? Store.user.username : 'juan')).trim().toLowerCase();
    const index = getUsersIndex();
    const found = index.find(u => u.username.toLowerCase() === cleanUser);

    if (!found) {
      return { ok: false, error: 'Ingresá tu nombre de usuario primero para usar huella/Face ID.' };
    }

    try {
      if (window.PublicKeyCredential && found.hasWebAuthn && window.isSecureContext) {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        await navigator.credentials.get({
          publicKey: {
            challenge,
            timeout: 60000,
            userVerification: 'preferred'
          }
        });
      } else {
        await new Promise(res => setTimeout(res, 300));
        if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
      }
      return Store.login(found.username, found.passwordHash, true);
    } catch {
      return Store.login(found.username, found.passwordHash, true);
    }
  };

  Store.enableBiometrics = function () {
    if (!Store.user) return false;
    const index = getUsersIndex();
    const item = index.find(u => u.username.toLowerCase() === Store.user.username.toLowerCase());
    if (item) {
      item.hasWebAuthn = true;
      saveUsersIndex(index);
      Store.user.hasWebAuthn = true;
      Store.notify();
      return true;
    }
    return false;
  };

  // ==========================================
  // 4. PERSISTENCIA Y REGLA DE ORO STORE.COMMIT()
  // ==========================================

  Store.loadState = function () {
    if (!Store.user) {
      Store.state = null;
      return null;
    }

    const key = getStorageKey(Store.user.username);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        Store.state = normalizeState(JSON.parse(raw), Store.user.codigoAlumno);
      } else {
        Store.state = Engine.seedInitialData(Store.user.codigoAlumno);
      }
      localStorage.setItem(key, JSON.stringify(Store.state));
    } catch (e) {
      console.error('Error leyendo estado de localStorage:', e);
      Store.state = Engine.seedInitialData(Store.user.codigoAlumno);
    }
    return Store.state;
  };

  Store.getState = function () {
    if (!Store.state && Store.user) {
      Store.loadState();
    }
    return Store.state;
  };

  /**
   * Regla de oro #2: Toda mutación del usuario activo pasa por Store.commit(state => Engine.xxx(state, ...))
   */
  Store.commit = function (mutatorFn) {
    if (!Store.user) return null;
    return Store.commitForUser(Store.user.username, mutatorFn);
  };

  /**
   * Permite reiniciar la cuenta actual a cero (conservando únicamente el catálogo de ejercicios).
   */
  Store.resetCurrentAccountToZero = function () {
    if (!Store.user) return;
    const codigo = Store.user.codigoAlumno;
    Store.commit(() => Engine.seedInitialData(codigo));
  };

  Store.subscribe = function (listener) {
    Store.listeners.add(listener);
    return () => Store.listeners.delete(listener);
  };

  Store.notify = function () {
    for (const listener of Store.listeners) {
      try {
        listener(Store.state, Store.user);
      } catch (e) {
        console.error('Error en listener de Store:', e);
      }
    }
  };

  // ==========================================
  // 5. BACKUP OFFLINE & BUZÓN DE FEEDBACK
  // ==========================================

  Store.exportBackupJSON = function () {
    return JSON.stringify(
      {
        app: 'MiGimnasio',
        version: 2,
        exportedAt: new Date().toISOString(),
        user: Store.user,
        state: Store.getState()
      },
      null,
      2
    );
  };

  Store.importBackupJSON = function (jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || !parsed.state) {
        return { ok: false, error: 'El archivo JSON no tiene un formato válido.' };
      }
      Store.commit(() => normalizeState(parsed.state, Store.user ? Store.user.codigoAlumno : null));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'JSON inválido: ' + e.message };
    }
  };

  Store.enqueueSync = function () {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      Store.isSyncing = true;
      setTimeout(() => {
        Store.isSyncing = false;
        Store.notify();
      }, 450);
    }
  };

  Store.enviarFeedback = function ({ mensaje, tipo = 'sugerencia' }) {
    try {
      const raw = localStorage.getItem(FEEDBACK_INBOX_KEY);
      const inbox = raw ? JSON.parse(raw) : [];
      const item = {
        id: 'fb-' + Date.now(),
        fecha: Engine.todayISO(),
        hora: Engine.timeNow(),
        usuario: Store.user ? Store.user.username : 'anónimo',
        tipo,
        mensaje,
        leido: false
      };
      inbox.unshift(item);
      localStorage.setItem(FEEDBACK_INBOX_KEY, JSON.stringify(inbox));
      return { ok: true, item };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  Store.getFeedbackInbox = function () {
    if (!Store.user || !Store.user.isAdmin) return [];
    try {
      const raw = localStorage.getItem(FEEDBACK_INBOX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  // ==========================================
  // 6. GESTIÓN DE TEMA (MODO OSCURO / CLARO / SISTEMA)
  // ==========================================

  Store.getThemePreference = function () {
    try {
      return localStorage.getItem(THEME_PREF_KEY) || 'dark';
    } catch {
      return 'dark';
    }
  };

  Store.applyTheme = function (pref) {
    const p = pref || Store.getThemePreference();
    let effective = p;
    if (p === 'system') {
      if (typeof window !== 'undefined' && window.matchMedia) {
        effective = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      } else {
        effective = 'dark';
      }
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', effective);
      document.documentElement.setAttribute('data-theme-pref', p);
    }
    return effective;
  };

  Store.setThemePreference = function (pref) {
    const valid = ['dark', 'light', 'system'].includes(pref) ? pref : 'dark';
    try {
      localStorage.setItem(THEME_PREF_KEY, valid);
    } catch {}
    Store.applyTheme(valid);
    Store.notify();
    return valid;
  };

  return Store;
});

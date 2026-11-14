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

  // --- CONFIGURACIÓN SUPABASE EN LA NUBE (SINCRONIZACIÓN DE SUGERENCIAS Y BUZÓN) ---
  const SUPABASE_URL = 'https://sktscjrrtvjwsgbtkrse.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrdHNjanJydHZqd3NnYnRrcnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzODc0MjUsImV4cCI6MjEwODk2MzQyNX0.Ko6K6eOY20-nJj0qAX8F6VS8stE1s3p-cghouSvmscg';
  const SUGERENCIAS_SYNC_KEY = 'gym_vault_sugerencias_master_key_2026';

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
    Store.applyAestheticPreference();
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
    // Si no hay sesión iniciada en este dispositivo/navegador, pedir usuario, contraseña y rol (Alumno o Profesor)
    Store.user = null;
    Store.state = null;
    Store.sincronizarSugerenciasNube().catch(() => {});
    return null;
  };

  /**
   * Hash determinístico con sal por usuario (formato h1$<hex>) para no guardar PINs/contraseñas en texto plano.
   * Compatible hacia atrás con cuentas existentes ('1234').
   */
  Store.hashPin = function (username, rawPin) {
    const cleanPin = String(rawPin || '');
    if (cleanPin.startsWith('h1$')) return cleanPin;
    const str = `jf_gym_v3::${String(username || '').trim().toLowerCase()}::${cleanPin}`;
    let h1 = 0xdeadbeef ^ str.length;
    let h2 = 0x41c6ce57 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'h1$' + (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
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

    const inputHash = Store.hashPin(found.username, password);
    const storedHash = String(found.passwordHash || '');
    const passwordMatches = storedHash === password || storedHash === inputHash;

    if (!isRestore && storedHash && !passwordMatches) {
      return { ok: false, error: 'Contraseña o PIN incorrecto.' };
    }

    let indexUpdated = false;
    if (storedHash && !storedHash.startsWith('h1$') && password && !String(password).startsWith('h1$')) {
      found.passwordHash = inputHash;
      indexUpdated = true;
    }

    if (!found.codigoAlumno) {
      found.codigoAlumno = Engine.generateAlumnoCode(found.username);
      indexUpdated = true;
    }
    if (indexUpdated) {
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

    // Sincronizar sugerencias y bóveda en la nube en segundo plano
    Store.sincronizarSugerenciasNube().catch(() => {});
    if (typeof Store.sincronizarVaultUsuarioNube === 'function') {
      Store.sincronizarVaultUsuarioNube().catch(() => {});
    }

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

    const rawPass = password || '1234';
    const newUser = {
      username: cleanUser,
      displayName: displayName || cleanUser,
      email: email || '',
      passwordHash: Store.hashPin(cleanUser, rawPass),
      role: role === 'profesor' ? 'profesor' : 'alumno',
      codigoAlumno,
      alumnosVinculados: [],
      isAdmin: cleanUser === 'admin' || role === 'profesor',
      hasWebAuthn: false,
      acceptedTermsAt: Date.now(),
      createdAt: Date.now()
    };

    index.push(newUser);
    saveUsersIndex(index);

    // Estado 100% limpio sin rutinas ni entrenamientos cargados
    const cleanState = Engine.seedInitialData(codigoAlumno);
    localStorage.setItem(getStorageKey(cleanUser), JSON.stringify(cleanState));

    return Store.login(cleanUser, rawPass, true);
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

    if (typeof Store.descargarAlumnoPorCodigoNube === 'function') {
      Store.descargarAlumnoPorCodigoNube(code, targetAlumno.username).catch(() => {});
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

  let vaultSyncTimer = null;
  Store.enqueueSync = function () {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      Store.isSyncing = true;
      if (vaultSyncTimer) clearTimeout(vaultSyncTimer);
      vaultSyncTimer = setTimeout(() => {
        if (typeof Store.sincronizarVaultUsuarioNube === 'function') {
          Store.sincronizarVaultUsuarioNube().catch(() => {});
        }
        Store.isSyncing = false;
        Store.notify();
      }, 450);
    }
  };

  /**
   * Respaldo en la nube de la bóveda personal por código de alumno (Supabase Vault).
   * Permite recuperar entrenamientos/rutinas y que un profesor sincronice al vincular el código GYM-XXXX.
   */
  Store.sincronizarVaultUsuarioNube = async function () {
    if (typeof fetch !== 'function' || !Store.user || !Store.user.codigoAlumno) return;
    try {
      const st = Store.getState();
      if (!st) return;
      const code = String(Store.user.codigoAlumno).trim().toUpperCase();
      const vaultId = 'vault_' + code.replace(/[^A-Z0-9]/gi, '').toLowerCase();
      const snapshot = {
        codigoAlumno: code,
        username: Store.user.username,
        displayName: Store.user.displayName,
        updatedAt: Date.now(),
        rutinas: Array.isArray(st.rutinas) ? st.rutinas : [],
        entrenamientos: Array.isArray(st.entrenamientos) ? st.entrenamientos.slice(0, 60) : [],
        series: Array.isArray(st.series) ? st.series.slice(-500) : [],
        registrosSalud: Array.isArray(st.registrosSalud) ? st.registrosSalud.slice(0, 60) : [],
        readiness: Array.isArray(st.readiness) ? st.readiness.slice(0, 60) : []
      };
      await fetch(`${SUPABASE_URL}/rest/v1/fin_records`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'x-sync-key': SUGERENCIAS_SYNC_KEY,
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          sync_key: SUGERENCIAS_SYNC_KEY,
          coleccion: 'user_vault',
          id: vaultId,
          data: snapshot,
          updated_at: Date.now(),
          deleted: false
        })
      });
    } catch (_) {}
  };

  Store.descargarAlumnoPorCodigoNube = async function (rawCode, targetUsername) {
    if (typeof fetch !== 'function' || !rawCode || !targetUsername) return null;
    try {
      const code = String(rawCode).trim().toUpperCase();
      const vaultId = 'vault_' + code.replace(/[^A-Z0-9]/gi, '').toLowerCase();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/fin_records?coleccion=eq.user_vault&id=eq.${encodeURIComponent(vaultId)}&deleted=eq.false&limit=1`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'x-sync-key': SUGERENCIAS_SYNC_KEY
        }
      });
      if (!res.ok) return null;
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows[0] || !rows[0].data) return null;
      const cloud = rows[0].data;
      Store.commitForUser(targetUsername, s => ({
        ...s,
        rutinas: Array.isArray(cloud.rutinas) && cloud.rutinas.length ? cloud.rutinas : s.rutinas,
        entrenamientos: Array.isArray(cloud.entrenamientos) && cloud.entrenamientos.length ? cloud.entrenamientos : s.entrenamientos,
        series: Array.isArray(cloud.series) && cloud.series.length ? cloud.series : s.series,
        registrosSalud: Array.isArray(cloud.registrosSalud) && cloud.registrosSalud.length ? cloud.registrosSalud : s.registrosSalud,
        readiness: Array.isArray(cloud.readiness) && cloud.readiness.length ? cloud.readiness : s.readiness
      }));
      return cloud;
    } catch (_) {
      return null;
    }
  };

  Store.enviarFeedback = function ({ mensaje, tipo = 'sugerencia' }) {
    try {
      const raw = localStorage.getItem(FEEDBACK_INBOX_KEY);
      const inbox = raw ? JSON.parse(raw) : [];
      const cleanMsg = String(mensaje || '').trim();
      const today = Engine.todayISO();
      const userKey = Store.user ? Store.user.username : 'anónimo';
      const dup = inbox.find(
        it => it.fecha === today && it.usuario === userKey && String(it.mensaje || '').trim().toLowerCase() === cleanMsg.toLowerCase()
      );
      if (dup) {
        return { ok: true, item: dup, deduplicated: true };
      }
      const item = {
        id: 'fb-' + Date.now(),
        fecha: today,
        hora: Engine.timeNow(),
        usuario: userKey,
        tipo,
        mensaje: cleanMsg,
        leido: false
      };
      inbox.unshift(item);
      localStorage.setItem(FEEDBACK_INBOX_KEY, JSON.stringify(inbox));

      // Sincronizar automáticamente en la nube de Supabase en segundo plano
      Store.enviarSugerenciaNube(item).catch(() => {});

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

  /**
   * Envía una sugerencia individual o estado de borrado a Supabase en la nube.
   */
  Store.enviarSugerenciaNube = async function (sugItem) {
    if (!sugItem) return;
    try {
      const payload = {
        sync_key: SUGERENCIAS_SYNC_KEY,
        coleccion: 'sugerencias',
        id: String(sugItem.id || ('sug-' + Date.now())),
        data: {
          id: String(sugItem.id || ('sug-' + Date.now())),
          mensaje: sugItem.mensaje || sugItem.texto || '',
          autor: sugItem.autor || (Store.user ? Store.user.displayName : 'Usuario'),
          rol: sugItem.rol || (Store.user ? Store.user.role : 'alumno'),
          fecha: sugItem.fecha || Engine.todayISO(),
          hora: sugItem.hora || Engine.timeNow(),
          capturas: Array.isArray(sugItem.capturas) ? sugItem.capturas : []
        },
        updated_at: Date.now(),
        deleted: Boolean(sugItem.deleted)
      };

      if (typeof fetch === 'function') {
        await fetch(`${SUPABASE_URL}/rest/v1/fin_records`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            'x-sync-key': SUGERENCIAS_SYNC_KEY,
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(payload)
        });
      }
    } catch (e) {
      console.warn('Sync sugerencia offline:', e);
    }
  };

  /**
   * Sincronización bidireccional de sugerencias con Supabase:
   * 1. Sube todas las sugerencias locales que aún no subieron a la nube.
   * 2. Descarga sugerencias de la nube para fusionarlas con el estado local.
   */
  Store.sincronizarSugerenciasNube = async function () {
    if (typeof fetch !== 'function') return;
    try {
      // 1. PUSH: Subir sugerencias locales a la nube
      const st = Store.getState();
      const localSugs = Array.isArray(st?.sugerencias) ? st.sugerencias : [];
      for (const s of localSugs) {
        if (!s.syncedCloud) {
          await Store.enviarSugerenciaNube(s);
          s.syncedCloud = true;
        }
      }

      // También revisar FEEDBACK_INBOX_KEY por sugerencias históricas
      try {
        const rawInbox = localStorage.getItem(FEEDBACK_INBOX_KEY);
        const inbox = rawInbox ? JSON.parse(rawInbox) : [];
        for (const item of inbox) {
          if (!item.syncedCloud) {
            await Store.enviarSugerenciaNube({
              id: item.id,
              mensaje: item.mensaje,
              autor: item.usuario,
              rol: 'alumno',
              fecha: item.fecha,
              hora: item.hora,
              capturas: []
            });
            item.syncedCloud = true;
          }
        }
        localStorage.setItem(FEEDBACK_INBOX_KEY, JSON.stringify(inbox));
      } catch (_) {}

      // 2. PULL: Descargar sugerencias de la nube
      const res = await fetch(`${SUPABASE_URL}/rest/v1/fin_records?coleccion=eq.sugerencias&deleted=eq.false&order=server_ts.desc&limit=100`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'x-sync-key': SUGERENCIAS_SYNC_KEY
        }
      });

      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const cloudSugs = rows.map(r => ({ ...r.data, syncedCloud: true, deleted: r.deleted }));
          Store.commit(s => {
            const current = Array.isArray(s.sugerencias) ? [...s.sugerencias] : [];
            const byId = new Map(current.map(item => [item.id, item]));
            const seenSignature = new Set(
              current.map(item => `${String(item.autor || '').trim().toLowerCase()}|${item.fecha || ''}|${String(item.mensaje || '').trim().toLowerCase()}`)
            );
            for (const cs of cloudSugs) {
              const sig = `${String(cs.autor || '').trim().toLowerCase()}|${cs.fecha || ''}|${String(cs.mensaje || '').trim().toLowerCase()}`;
              if (!byId.has(cs.id) && !seenSignature.has(sig)) {
                byId.set(cs.id, cs);
                seenSignature.add(sig);
              }
            }
            return {
              ...s,
              sugerencias: Array.from(byId.values()).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
            };
          });
        }
      }
    } catch (e) {
      console.warn('Sync sugerencias con Supabase:', e);
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
      if (typeof Store.applyAestheticPreference === 'function') Store.applyAestheticPreference();
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

  // ==========================================
  // 7. PERSONALIZACIÓN ESTÉTICA (ACENTO, FONDO, FOTO DE FONDO)
  // ==========================================
  // El CSS deriva todo de 3 variables: --accent, --on-accent y --bg-base.
  // Acá solo se guardan las elecciones y se publican esas variables: ningún color queda "pegado".
  const AESTHETIC_PREF_KEY = 'gimnasio_aesthetic_pref';
  const BG_PHOTO_KEY = 'gimnasio_bg_photo';
  const AESTHETIC_DEFAULTS = {
    accentColor: '#3B82F6',
    bgPattern: 'none',     // none | aurora | grid | dots | hex | pesas | foto
    bgColorDark: '',       // '' = grafito por defecto
    bgColorLight: '',      // '' = niebla por defecto
    bgDim: 55              // oscurecimiento de la foto de fondo (0-85)
  };
  const BG_PATTERNS_VALIDOS = ['none', 'aurora', 'grid', 'dots', 'hex', 'pesas', 'foto'];
  const LEGACY_BG_STYLE = { oled: '#000000', navy: '#070B14', steel: '#131316' };
  const LEGACY_PATTERN = { camo: 'aurora', basquet: 'aurora', carbon: 'dots' };

  function isHexColor(v) {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  }

  function hexToRgb(hex) {
    const num = parseInt(hex.slice(1), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  /** Luminancia relativa WCAG (0 = negro, 1 = blanco). */
  Store.colorLuminance = function (hex) {
    if (!isHexColor(hex)) return 0;
    const [r, g, b] = hexToRgb(hex).map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  Store.getAestheticPreference = function () {
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(AESTHETIC_PREF_KEY) || '{}') || {};
    } catch {
      raw = {};
    }
    const pref = { ...AESTHETIC_DEFAULTS, ...raw };
    // Migración de versiones anteriores (bgStyle zinc/oled/navy/steel y patrones retirados)
    if (raw.bgStyle && raw.bgColorDark === undefined && LEGACY_BG_STYLE[raw.bgStyle]) pref.bgColorDark = LEGACY_BG_STYLE[raw.bgStyle];
    if (LEGACY_PATTERN[pref.bgPattern]) pref.bgPattern = LEGACY_PATTERN[pref.bgPattern];
    if (!BG_PATTERNS_VALIDOS.includes(pref.bgPattern)) pref.bgPattern = 'none';
    if (!isHexColor(pref.accentColor)) pref.accentColor = AESTHETIC_DEFAULTS.accentColor;
    if (!isHexColor(pref.bgColorDark)) pref.bgColorDark = '';
    if (!isHexColor(pref.bgColorLight)) pref.bgColorLight = '';
    pref.bgDim = Math.min(85, Math.max(0, Number.isFinite(Number(pref.bgDim)) ? Number(pref.bgDim) : 55));
    if (pref.bgPattern === 'foto' && !Store.getBackgroundPhoto()) pref.bgPattern = 'none';
    return pref;
  };

  Store.getBackgroundPhoto = function () {
    try {
      return localStorage.getItem(BG_PHOTO_KEY) || '';
    } catch {
      return '';
    }
  };

  /** Guarda (o borra con '') la foto de fondo ya comprimida. Devuelve false si no entra en el almacenamiento. */
  Store.setBackgroundPhoto = function (dataUrl) {
    try {
      if (dataUrl) localStorage.setItem(BG_PHOTO_KEY, dataUrl);
      else localStorage.removeItem(BG_PHOTO_KEY);
      return true;
    } catch {
      return false;
    }
  };

  Store.applyAestheticPreference = function (prefs) {
    if (typeof document === 'undefined' || !document.documentElement) return;
    const p = prefs || Store.getAestheticPreference();
    const root = document.documentElement;
    const theme = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

    // 1. Acento: el CSS calcula hover, suaves, insignias y foco a partir de estas dos variables
    const accent = isHexColor(p.accentColor) ? p.accentColor : AESTHETIC_DEFAULTS.accentColor;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-rgb', hexToRgb(accent).join(', '));
    root.style.setProperty('--on-accent', Store.colorLuminance(accent) > 0.42 ? '#0A0A0C' : '#FFFFFF');

    // 2. Color de fondo propio del tema activo (las superficies se derivan en CSS)
    const bg = theme === 'light' ? p.bgColorLight : p.bgColorDark;
    if (bg) root.style.setProperty('--bg-base', bg);
    else root.style.removeProperty('--bg-base');

    // 3. Estilo de fondo y foto
    const pattern = BG_PATTERNS_VALIDOS.includes(p.bgPattern) ? p.bgPattern : 'none';
    const photo = pattern === 'foto' ? Store.getBackgroundPhoto() : '';
    root.setAttribute('data-bg-pattern', pattern === 'foto' && !photo ? 'none' : pattern);
    if (photo) root.style.setProperty('--bg-photo', `url("${photo}")`);
    else root.style.removeProperty('--bg-photo');
    root.style.setProperty('--bg-dim', `${p.bgDim}%`);

    // 4. Barra del navegador / PWA acompaña al fondo
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', bg || (theme === 'light' ? '#F4F4F6' : '#0B0B0D'));

    // Limpieza de variables que versiones anteriores dejaban fijas en el <html>
    ['--bg-primary', '--bg-surface', '--bg-card', '--bg-elevated', '--cta-blue', '--cta-blue-hover', '--cta-blue-light',
      '--cta-blue-soft', '--accent-blue', '--accent-neon', '--border-focus', '--badge-bg', '--badge-text', '--steel-blue',
      '--steel-blue-light', '--neon-lime', '--logo-box-stroke', '--logo-box-bg', '--logo-dumbbell'
    ].forEach(v => root.style.removeProperty(v));
  };

  Store.setAestheticPreference = function (patch) {
    const updated = { ...Store.getAestheticPreference(), ...patch };
    delete updated.bgStyle;
    try {
      localStorage.setItem(AESTHETIC_PREF_KEY, JSON.stringify(updated));
    } catch {}
    Store.applyAestheticPreference(updated);
    Store.notify();
    return updated;
  };

  Store.resetAestheticPreference = function () {
    try {
      localStorage.removeItem(AESTHETIC_PREF_KEY);
    } catch {}
    Store.setBackgroundPhoto('');
    Store.applyAestheticPreference();
    Store.notify();
  };

  // ==========================================
  // 8. PERFIL (NOMBRE VISIBLE)
  // ==========================================
  /** Cambia el nombre visible del usuario activo (el usuario de ingreso no cambia). */
  Store.updateDisplayName = function (displayName) {
    if (!Store.user) return { ok: false, error: 'No hay sesión activa.' };
    const clean = String(displayName || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!clean) return { ok: false, error: 'Escribí un nombre.' };
    const index = getUsersIndex();
    const found = index.find(u => u.username.toLowerCase() === Store.user.username.toLowerCase());
    if (found) {
      found.displayName = clean;
      saveUsersIndex(index);
    }
    Store.user.displayName = clean;
    Store.notify();
    return { ok: true, displayName: clean };
  };

  return Store;
});

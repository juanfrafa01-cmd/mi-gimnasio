/**
 * js/engine.js — Lógica de negocio pura de "Mi Gimnasio / IronTrack B2B2C"
 *
 * Responsabilidades:
 * - Catálogo completo de ejercicios estandarizados de gimnasio (con GIFs, equipo, grupo muscular y presets).
 * - Estado inicial 100% limpio para usuarios nuevos (sin rutinas ni series inventadas, listo para armar de cero).
 * - Cálculo de 1RM (Epley y Brzycki), volumen por serie/sesión y volumen semanal por grupo muscular.
 * - Cálculo de récords personales (PRs) y detección de nuevos récords.
 * - Gestión de Rutinas (días de semana, horarios de turno, ejercicios del catálogo).
 * - Check-in Psicofísico (Readiness: energía, estrés, alimentación, dolor articular, observaciones).
 * - Observaciones clínicas del profesor y Bitácora de fotos con sello de agua (fecha + peso).
 * - Soft deletes obligatorios ({ deleted: true, updatedAt: Date.now() }).
 *
 * Regla de oro: NO toca el DOM. Funciona en Node.js y en el navegador sin dependencias.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Engine = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const Engine = {};

  // ==========================================
  // 1. FECHAS LOCALES E IDENTIFICADORES
  // ==========================================

  /**
   * Fecha local actual en formato YYYY-MM-DD (evita el salto de día después de las 21h en Argentina).
   */
  Engine.todayISO = function (d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  /**
   * Hora local actual en formato HH:MM (24h).
   */
  Engine.timeNow = function (d = new Date()) {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  let idCounter = 0;
  /**
   * Generador de IDs estables con prefijo (ej: rt-, ej-, tr-, sr-, rd-, ob-, ph-).
   */
  Engine.generateId = function (prefix = 'id') {
    idCounter += 1;
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `${prefix}-${timestamp}-${idCounter}-${random}`;
  };

  /**
   * Genera un Código/ID único de vinculación de alumno sencillo y legible (Ej: GYM-4821).
   */
  Engine.generateAlumnoCode = function (seedStr = '') {
    let hash = 0;
    const base = seedStr + Date.now().toString();
    for (let i = 0; i < base.length; i++) {
      hash = (hash * 31 + base.charCodeAt(i)) % 9000;
    }
    const num = 1000 + Math.abs(hash);
    return `GYM-${num}`;
  };

  // ==========================================
  // 2. CATÁLOGO ESTANDARIZADO DE EJERCICIOS DE GIMNASIO
  // ==========================================

  Engine.CATALOGO_EJERCICIOS = [
    // PECHO
    {
      id: 'ej-press-banca',
      nombre: 'Press de Banca Plano con Barra',
      grupoMuscular: 'pecho',
      equipo: 'barra',
      seriesSugeridas: 4,
      repsSugeridas: '6-8',
      descansoSugerido: 120,
      gifSlug: 'bench-press',
      gifUrl: './icons/gifs/bench-press.gif',
      startImgUrl: './icons/gifs/bench-press-start.gif',
      endImgUrl: './icons/gifs/bench-press-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Bench-Press.gif',
      notas: 'Retracción escapular firme, pies apoyados con firmeza y bajada controlada al esternón.',
      orden: 1
    },
    {
      id: 'ej-press-inclinado-manc',
      nombre: 'Press Inclinado con Mancuernas (30°)',
      grupoMuscular: 'pecho',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '8-10',
      descansoSugerido: 90,
      gifSlug: 'incline-db-press',
      gifUrl: './icons/gifs/incline-db-press.gif',
      startImgUrl: './icons/gifs/incline-db-press-start.gif',
      endImgUrl: './icons/gifs/incline-db-press-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Incline-Dumbbell-Press.gif',
      notas: 'Codos a 45° del torso, máximo estiramiento pectoral abajo.',
      orden: 2
    },
    {
      id: 'ej-apertura-polea',
      nombre: 'Cruces en Polea Alta (Crossover)',
      grupoMuscular: 'pecho',
      equipo: 'polea',
      seriesSugeridas: 3,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'cable-crossover',
      gifUrl: './icons/gifs/cable-crossover.gif',
      startImgUrl: './icons/gifs/cable-crossover-start.gif',
      endImgUrl: './icons/gifs/cable-crossover-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Cable-Crossover.gif',
      notas: 'Pausa de 1 segundo juntando las manos frente al pecho bajo.',
      orden: 3
    },
    {
      id: 'ej-fondos-paralelas',
      nombre: 'Fondos en Paralelas (Dips)',
      grupoMuscular: 'pecho',
      equipo: 'corporal',
      seriesSugeridas: 3,
      repsSugeridas: '8-12',
      descansoSugerido: 90,
      gifSlug: 'chest-dips',
      gifUrl: './icons/gifs/chest-dips.gif',
      startImgUrl: './icons/gifs/chest-dips-start.gif',
      endImgUrl: './icons/gifs/chest-dips-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/06/Chest-Dips.gif',
      notas: 'Leve inclinación del torso hacia adelante para enfatizar el pectoral inferior.',
      orden: 4
    },
    {
      id: 'ej-peck-deck',
      nombre: 'Mariposa / Contractora Pectoral (Pec Deck)',
      grupoMuscular: 'pecho',
      equipo: 'maquina',
      seriesSugeridas: 3,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'pec-deck',
      gifUrl: './icons/gifs/pec-deck.gif',
      startImgUrl: './icons/gifs/pec-deck-start.gif',
      endImgUrl: './icons/gifs/pec-deck-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Pec-Deck-Fly.gif',
      notas: 'Mantener hombros bajos y pegados al respaldo en todo el recorrido.',
      orden: 5
    },
    {
      id: 'ej-aperturas-banco-plano',
      nombre: 'Aperturas de Pecho en Banco Plano con Mancuernas',
      grupoMuscular: 'pecho',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '10-12',
      descansoSugerido: 90,
      gifSlug: 'bench-press',
      gifUrl: './icons/gifs/bench-press.gif',
      startImgUrl: './icons/gifs/bench-press-start.gif',
      endImgUrl: './icons/gifs/bench-press-end.gif',
      illustrationUrl: './icons/ejercicios/ej-aperturas-banco-plano.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Fly.gif',
      notas: 'Codos ligeramente flexionados, abrir el pecho sintiendo el estiramiento pectoral sin bajar más allá de la línea de los hombros.',
      musculoActivo: 'Pectoral Mayor (Fibras Medias e Inferiores)',
      orden: 6
    },
    {
      id: 'ej-aperturas-banco-inclinado',
      nombre: 'Aperturas de Pecho en Banco Inclinado (30°)',
      grupoMuscular: 'pecho',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '10-12',
      descansoSugerido: 90,
      gifSlug: 'incline-db-press',
      gifUrl: './icons/gifs/incline-db-press.gif',
      startImgUrl: './icons/gifs/incline-db-press-start.gif',
      endImgUrl: './icons/gifs/incline-db-press-end.gif',
      illustrationUrl: './icons/ejercicios/ej-aperturas-banco-inclinado.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Incline-Dumbbell-Fly.gif',
      notas: 'Banco a 30°, arqueo torácico natural y foco en la porción clavicular superior del pecho.',
      musculoActivo: 'Pectoral Mayor Clavicular (Haz Superior)',
      orden: 7
    },
    {
      id: 'ej-press-plano-manc',
      nombre: 'Press Plano con Mancuernas',
      grupoMuscular: 'pecho',
      equipo: 'mancuerna',
      seriesSugeridas: 4,
      repsSugeridas: '8-10',
      descansoSugerido: 90,
      gifSlug: 'bench-press',
      gifUrl: './icons/gifs/bench-press.gif',
      startImgUrl: './icons/gifs/bench-press-start.gif',
      endImgUrl: './icons/gifs/bench-press-end.gif',
      illustrationUrl: './icons/ejercicios/ej-press-plano-manc.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Press.gif',
      notas: 'Mayor rango de recorrido que la barra. Conectar escápulas atrás y empujar en convergencia suave.',
      musculoActivo: 'Pectoral Mayor, Deltoides Anterior y Tríceps',
      orden: 8
    },
    {
      id: 'ej-flexiones-suelo',
      nombre: 'Flexiones de Brazos en Suelo (Push-Ups)',
      grupoMuscular: 'pecho',
      equipo: 'corporal',
      seriesSugeridas: 3,
      repsSugeridas: '12-20',
      descansoSugerido: 60,
      gifSlug: 'bench-press',
      gifUrl: './icons/gifs/bench-press.gif',
      startImgUrl: './icons/gifs/bench-press-start.gif',
      endImgUrl: './icons/gifs/bench-press-end.gif',
      illustrationUrl: './icons/ejercicios/ej-flexiones-suelo.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/06/Push-Up.gif',
      notas: 'Cuerpo en plancha rígida, codos a 45° del torso y pecho rozando el suelo en cada repetición.',
      musculoActivo: 'Pectoral Mayor, Tríceps Braquial y Core',
      orden: 9
    },

    // ESPALDA
    {
      id: 'ej-dominadas',
      nombre: 'Dominadas Pronas (Pull-Ups)',
      grupoMuscular: 'espalda',
      equipo: 'corporal',
      seriesSugeridas: 4,
      repsSugeridas: '6-10',
      descansoSugerido: 120,
      gifSlug: 'pull-up',
      gifUrl: './icons/gifs/pull-up.gif',
      startImgUrl: './icons/gifs/pull-up-start.gif',
      endImgUrl: './icons/gifs/pull-up-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Pull-up.gif',
      notas: 'Iniciar deprimiendo escápulas, pasar el mentón y extender brazos por completo.',
      orden: 6
    },
    {
      id: 'ej-jalon-pecho',
      nombre: 'Jalón al Pecho en Polea Alta',
      grupoMuscular: 'espalda',
      equipo: 'polea',
      seriesSugeridas: 4,
      repsSugeridas: '8-12',
      descansoSugerido: 90,
      gifSlug: 'lat-pulldown',
      gifUrl: './icons/gifs/lat-pulldown.gif',
      startImgUrl: './icons/gifs/lat-pulldown-start.gif',
      endImgUrl: './icons/gifs/lat-pulldown-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Lat-Pulldown.gif',
      notas: 'Traccionar hacia la clavícula superior sacando pecho sin columpiar la espalda.',
      orden: 7
    },
    {
      id: 'ej-remo-barra',
      nombre: 'Remo con Barra 45° (Pendlay / Prono)',
      grupoMuscular: 'espalda',
      equipo: 'barra',
      seriesSugeridas: 4,
      repsSugeridas: '8-10',
      descansoSugerido: 120,
      gifSlug: 'barbell-row',
      gifUrl: './icons/gifs/barbell-row.gif',
      startImgUrl: './icons/gifs/barbell-row-start.gif',
      endImgUrl: './icons/gifs/barbell-row-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Bent-Over-Row.gif',
      notas: 'Columna neutra, core firme y tracción hacia la boca del estómago.',
      orden: 8
    },
    {
      id: 'ej-remo-polea-baja',
      nombre: 'Remo Sentado en Polea Baja (Triángulo)',
      grupoMuscular: 'espalda',
      equipo: 'polea',
      seriesSugeridas: 3,
      repsSugeridas: '10-12',
      descansoSugerido: 90,
      gifSlug: 'seated-cable-row',
      gifUrl: './icons/gifs/seated-cable-row.gif',
      startImgUrl: './icons/gifs/seated-cable-row-start.gif',
      endImgUrl: './icons/gifs/seated-cable-row-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Seated-Cable-Row.gif',
      notas: 'Apretar escápulas atrás 1 segundo sin hiperextender la zona lumbar.',
      orden: 9
    },
    {
      id: 'ej-remo-mancuerna',
      nombre: 'Remo Unilateral con Mancuerna (Serrucho)',
      grupoMuscular: 'espalda',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '10-12',
      descansoSugerido: 75,
      gifSlug: 'dumbbell-row',
      gifUrl: './icons/gifs/dumbbell-row.gif',
      startImgUrl: './icons/gifs/dumbbell-row-start.gif',
      endImgUrl: './icons/gifs/dumbbell-row-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Row.gif',
      notas: 'Llevar la mancuerna en arco hacia el bolsillo de la cadera.',
      orden: 10
    },
    // VARIANTES DE DOMINADAS (PULL-UPS)
    {
      id: 'ej-dominadas-pronas',
      nombre: 'Dominadas Pronas (Pull-Ups Agarre Abierto)',
      grupoMuscular: 'espalda',
      equipo: 'corporal',
      seriesSugeridas: 4,
      repsSugeridas: '6-10',
      descansoSugerido: 120,
      gifSlug: 'pull-up',
      gifUrl: './icons/gifs/pull-up.gif',
      startImgUrl: './icons/gifs/pull-up-start.gif',
      endImgUrl: './icons/gifs/pull-up-end.gif',
      illustrationUrl: './icons/ejercicios/ej-dominadas-pronas.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Pull-up.gif',
      notas: 'Palmas mirando al frente, agarre algo más ancho que los hombros. Subir llevando el pecho a la barra.',
      musculoActivo: 'Dorsal Ancho (Porción Superior), Redondo Mayor y Trapecio Inferior',
      orden: 11
    },
    {
      id: 'ej-dominadas-supinas',
      nombre: 'Dominadas Supinas (Chin-Ups Agarre Cerrado)',
      grupoMuscular: 'espalda',
      equipo: 'corporal',
      seriesSugeridas: 4,
      repsSugeridas: '6-10',
      descansoSugerido: 120,
      gifSlug: 'pull-up',
      gifUrl: './icons/gifs/pull-up.gif',
      startImgUrl: './icons/gifs/pull-up-start.gif',
      endImgUrl: './icons/gifs/pull-up-end.gif',
      illustrationUrl: './icons/ejercicios/ej-dominadas-supinas.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Chin-up.gif',
      notas: 'Palmas hacia tu cara. Mayor palanca del bíceps y trabajo intenso del dorsal bajo.',
      musculoActivo: 'Bíceps Braquial, Dorsal Ancho y Braquial Anterior',
      orden: 12
    },
    {
      id: 'ej-dominadas-neutras',
      nombre: 'Dominadas Agarre Neutro (Palmas Enfrentadas)',
      grupoMuscular: 'espalda',
      equipo: 'corporal',
      seriesSugeridas: 4,
      repsSugeridas: '8-10',
      descansoSugerido: 120,
      gifSlug: 'pull-up',
      gifUrl: './icons/gifs/pull-up.gif',
      startImgUrl: './icons/gifs/pull-up-start.gif',
      endImgUrl: './icons/gifs/pull-up-end.gif',
      illustrationUrl: './icons/ejercicios/ej-dominadas-neutras.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Pull-up.gif',
      notas: 'Posición anatómica más segura para hombros y codos. Permite máxima carga y estabilidad articular.',
      musculoActivo: 'Dorsal Ancho, Braquiorradial y Romboides',
      orden: 13
    },
    {
      id: 'ej-dominadas-anillas',
      nombre: 'Dominadas en Anillas (Grip Rotacional)',
      grupoMuscular: 'espalda',
      equipo: 'corporal',
      seriesSugeridas: 3,
      repsSugeridas: '6-10',
      descansoSugerido: 120,
      gifSlug: 'pull-up',
      gifUrl: './icons/gifs/pull-up.gif',
      startImgUrl: './icons/gifs/pull-up-start.gif',
      endImgUrl: './icons/gifs/pull-up-end.gif',
      illustrationUrl: './icons/ejercicios/ej-dominadas-anillas.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Pull-up.gif',
      notas: 'Iniciar en prono y rotar naturalmente a supino arriba. Excelente para salud de muñeca y manguito rotador.',
      musculoActivo: 'Dorsal Ancho, Estabilizadores Escapulares y Core',
      orden: 14
    },
    {
      id: 'ej-dominadas-asistidas',
      nombre: 'Dominadas Asistidas (Banda Elástica o Máquina)',
      grupoMuscular: 'espalda',
      equipo: 'maquina',
      seriesSugeridas: 3,
      repsSugeridas: '8-12',
      descansoSugerido: 90,
      gifSlug: 'pull-up',
      gifUrl: './icons/gifs/pull-up.gif',
      startImgUrl: './icons/gifs/pull-up-start.gif',
      endImgUrl: './icons/gifs/pull-up-end.gif',
      illustrationUrl: './icons/ejercicios/ej-dominadas-asistidas.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Pull-up.gif',
      notas: 'Ideal para progresar hacia las dominadas libres manteniendo el patrón técnico estricto.',
      musculoActivo: 'Dorsal Ancho y Redondo Mayor',
      orden: 15
    },
    {
      id: 'ej-dominadas-lastradas',
      nombre: 'Dominadas Lastradas con Cinturón de Carga',
      grupoMuscular: 'espalda',
      equipo: 'corporal',
      seriesSugeridas: 4,
      repsSugeridas: '4-6',
      descansoSugerido: 150,
      gifSlug: 'pull-up',
      gifUrl: './icons/gifs/pull-up.gif',
      startImgUrl: './icons/gifs/pull-up-start.gif',
      endImgUrl: './icons/gifs/pull-up-end.gif',
      illustrationUrl: './icons/ejercicios/ej-dominadas-lastradas.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Pull-up.gif',
      notas: 'Colocar el disco entre las piernas con cinturón. Movimiento explosivo hacia arriba y bajada controlada.',
      musculoActivo: 'Dorsal Ancho, Bíceps y Trapecio',
      orden: 16
    },
    // VARIANTES DE REMO CON BARRA Y ESPALDA
    {
      id: 'ej-remo-barra-prono',
      nombre: 'Remo con Barra a 45° Agarre Prono',
      grupoMuscular: 'espalda',
      equipo: 'barra',
      seriesSugeridas: 4,
      repsSugeridas: '8-10',
      descansoSugerido: 120,
      gifSlug: 'barbell-row',
      gifUrl: './icons/gifs/barbell-row.gif',
      startImgUrl: './icons/gifs/barbell-row-start.gif',
      endImgUrl: './icons/gifs/barbell-row-end.gif',
      illustrationUrl: './icons/ejercicios/ej-remo-barra-prono.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Bent-Over-Row.gif',
      notas: 'Palmas mirando hacia las piernas, codos abiertos a 60°. Enfatiza espalda media, deltoides posterior y romboides.',
      musculoActivo: 'Espalda Alta, Romboides, Trapecio y Deltoides Posterior',
      orden: 17
    },
    {
      id: 'ej-remo-barra-supino',
      nombre: 'Remo con Barra Agarre Supino (Estilo Dorian Yates)',
      grupoMuscular: 'espalda',
      equipo: 'barra',
      seriesSugeridas: 4,
      repsSugeridas: '8-10',
      descansoSugerido: 120,
      gifSlug: 'barbell-row',
      gifUrl: './icons/gifs/barbell-row.gif',
      startImgUrl: './icons/gifs/barbell-row-start.gif',
      endImgUrl: './icons/gifs/barbell-row-end.gif',
      illustrationUrl: './icons/ejercicios/ej-remo-barra-supino.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Bent-Over-Row.gif',
      notas: 'Palmas hacia arriba, torso a 60-70°. Codos pegados a los costados traccionando al ombligo para activar el dorsal bajo.',
      musculoActivo: 'Dorsal Ancho (Inserción Iliolumbar) y Bíceps',
      orden: 18
    },
    {
      id: 'ej-remo-pendlay',
      nombre: 'Remo Pendlay con Barra (Desde el Suelo)',
      grupoMuscular: 'espalda',
      equipo: 'barra',
      seriesSugeridas: 4,
      repsSugeridas: '6-8',
      descansoSugerido: 150,
      gifSlug: 'barbell-row',
      gifUrl: './icons/gifs/barbell-row.gif',
      startImgUrl: './icons/gifs/barbell-row-start.gif',
      endImgUrl: './icons/gifs/barbell-row-end.gif',
      illustrationUrl: './icons/ejercicios/ej-remo-pendlay.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Bent-Over-Row.gif',
      notas: 'Espalda 100% paralela al piso. Cada repetición sale de peso muerto en el suelo con tirón explosivo al pecho.',
      musculoActivo: 'Cadena Posterior, Dorsal, Romboides y Erectores Espinales',
      orden: 19
    },
    {
      id: 'ej-remo-barra-t',
      nombre: 'Remo en Barra T (T-Bar Row)',
      grupoMuscular: 'espalda',
      equipo: 'barra',
      seriesSugeridas: 4,
      repsSugeridas: '8-12',
      descansoSugerido: 120,
      gifSlug: 'barbell-row',
      gifUrl: './icons/gifs/barbell-row.gif',
      startImgUrl: './icons/gifs/barbell-row-start.gif',
      endImgUrl: './icons/gifs/barbell-row-end.gif',
      illustrationUrl: './icons/ejercicios/ej-remo-barra-t.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/T-Bar-Row.gif',
      notas: 'Agarre neutro estrecho con maneral. Tracción profunda con codos pegados sintiendo la densidad de espalda.',
      musculoActivo: 'Dorsal Ancho, Romboides y Trapecio Medio',
      orden: 20
    },
    {
      id: 'ej-jalon-pecho-neutro',
      nombre: 'Jalón al Pecho Agarre Neutro Estrecho (Triángulo)',
      grupoMuscular: 'espalda',
      equipo: 'polea',
      seriesSugeridas: 4,
      repsSugeridas: '10-12',
      descansoSugerido: 90,
      gifSlug: 'lat-pulldown',
      gifUrl: './icons/gifs/lat-pulldown.gif',
      startImgUrl: './icons/gifs/lat-pulldown-start.gif',
      endImgUrl: './icons/gifs/lat-pulldown-end.gif',
      illustrationUrl: './icons/ejercicios/ej-jalon-pecho-neutro.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Lat-Pulldown.gif',
      notas: 'Llevar los codos directamente hacia los bolsillos laterales de la cadera apretando dorsales.',
      musculoActivo: 'Dorsal Ancho y Braquial Anterior',
      orden: 21
    },
    {
      id: 'ej-pullover-polea',
      nombre: 'Pullover de Dorsal en Polea Alta (Brazo Rígido)',
      grupoMuscular: 'espalda',
      equipo: 'polea',
      seriesSugeridas: 3,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'lat-pulldown',
      gifUrl: './icons/gifs/lat-pulldown.gif',
      startImgUrl: './icons/gifs/lat-pulldown-start.gif',
      endImgUrl: './icons/gifs/lat-pulldown-end.gif',
      illustrationUrl: './icons/ejercicios/ej-pullover-polea.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Straight-Arm-Pulldown.gif',
      notas: 'Codos casi extendidos pero no bloqueados. Bajar la barra en arco hacia los muslos apretando los dorsales.',
      musculoActivo: 'Dorsal Ancho y Redondo Mayor (Aislamiento Puro)',
      orden: 22
    },

    // PIERNAS & GLÚTEOS
    {
      id: 'ej-sentadilla',
      nombre: 'Sentadilla Libre con Barra (Back Squat)',
      grupoMuscular: 'piernas',
      equipo: 'barra',
      seriesSugeridas: 4,
      repsSugeridas: '5-8',
      descansoSugerido: 150,
      gifSlug: 'barbell-squat',
      gifUrl: './icons/gifs/barbell-squat.gif',
      startImgUrl: './icons/gifs/barbell-squat-start.gif',
      endImgUrl: './icons/gifs/barbell-squat-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/BARBELL-SQUAT.gif',
      notas: 'Bracing abdominal 360°, rodillas alineadas con la punta del pie y buena profundidad.',
      orden: 11
    },
    {
      id: 'ej-peso-muerto',
      nombre: 'Peso Muerto Rumano con Barra (RDL)',
      grupoMuscular: 'piernas',
      equipo: 'barra',
      seriesSugeridas: 4,
      repsSugeridas: '8-10',
      descansoSugerido: 120,
      gifSlug: 'romanian-deadlift',
      gifUrl: './icons/gifs/romanian-deadlift.gif',
      startImgUrl: './icons/gifs/romanian-deadlift-start.gif',
      endImgUrl: './icons/gifs/romanian-deadlift-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Romanian-Deadlift.gif',
      notas: 'Bisagra de cadera llevando glúteos atrás con barra pegada a los muslos.',
      orden: 12
    },
    {
      id: 'ej-prensa-inclinada',
      nombre: 'Prensa de Piernas 45°',
      grupoMuscular: 'piernas',
      equipo: 'maquina',
      seriesSugeridas: 4,
      repsSugeridas: '10-12',
      descansoSugerido: 120,
      gifSlug: 'leg-press',
      gifUrl: './icons/gifs/leg-press.gif',
      startImgUrl: './icons/gifs/leg-press-start.gif',
      endImgUrl: './icons/gifs/leg-press-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2015/11/Leg-Press.gif',
      notas: 'Bajar profundo sin despegar la cadera del respaldo ni bloquear rodillas al final.',
      orden: 13
    },
    {
      id: 'ej-hip-thrust',
      nombre: 'Hip Thrust con Barra Olímpica',
      grupoMuscular: 'piernas',
      equipo: 'barra',
      seriesSugeridas: 4,
      repsSugeridas: '8-12',
      descansoSugerido: 120,
      gifSlug: 'hip-thrust',
      gifUrl: './icons/gifs/hip-thrust.gif',
      startImgUrl: './icons/gifs/hip-thrust-start.gif',
      endImgUrl: './icons/gifs/hip-thrust-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Hip-Thrust.gif',
      notas: 'Mentón pegado al pecho, retroversión pélvica arriba y pausa de 1s en contracción.',
      orden: 14
    },
    {
      id: 'ej-sillon-cuadriceps',
      nombre: 'Sillón de Cuádriceps (Extensiones)',
      grupoMuscular: 'piernas',
      equipo: 'maquina',
      seriesSugeridas: 3,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'leg-extension',
      gifUrl: './icons/gifs/leg-extension.gif',
      startImgUrl: './icons/gifs/leg-extension-start.gif',
      endImgUrl: './icons/gifs/leg-extension-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/LEG-EXTENSION.gif',
      notas: 'Controlar el descenso en 2 segundos y sostener arriba medio segundo.',
      orden: 15
    },
    {
      id: 'ej-camilla-isquios',
      nombre: 'Camilla / Sillón de Isquiotibiales (Curl Femoral)',
      grupoMuscular: 'piernas',
      equipo: 'maquina',
      seriesSugeridas: 3,
      repsSugeridas: '10-15',
      descansoSugerido: 75,
      gifSlug: 'leg-curl',
      gifUrl: './icons/gifs/leg-curl.gif',
      startImgUrl: './icons/gifs/leg-curl-start.gif',
      endImgUrl: './icons/gifs/leg-curl-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Leg-Curl.gif',
      notas: 'Pelvis fija contra el asiento evitando arquear la cintura.',
      orden: 16
    },
    {
      id: 'ej-estocadas-bulgaras',
      nombre: 'Sentadilla Búlgara con Mancuernas',
      grupoMuscular: 'piernas',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '8-10',
      descansoSugerido: 90,
      gifSlug: 'bulgarian-split-squat',
      gifUrl: './icons/gifs/bulgarian-split-squat.gif',
      startImgUrl: './icons/gifs/bulgarian-split-squat-start.gif',
      endImgUrl: './icons/gifs/bulgarian-split-squat-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Dumbbell-Bulgarian-Split-Squat.gif',
      notas: 'Empujar el suelo con toda la planta del pie delantero.',
      orden: 17
    },
    {
      id: 'ej-estocadas-bulgaras-kb',
      nombre: 'Sentadilla Búlgara con Pesa Rusa (Kettlebell)',
      grupoMuscular: 'piernas',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '8-10',
      descansoSugerido: 90,
      gifSlug: 'bulgarian-split-squat',
      gifUrl: './icons/gifs/bulgarian-split-squat.gif',
      startImgUrl: './icons/gifs/bulgarian-split-squat-start.gif',
      endImgUrl: './icons/gifs/bulgarian-split-squat-end.gif',
      illustrationUrl: './icons/ejercicios/ej-estocadas-bulgaras-kb.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Dumbbell-Bulgarian-Split-Squat.gif',
      notas: 'Pie trasero en banco. Pesa rusa colgada o en rack. Bajar con torso erguido o leve inclinación para glúteo.',
      musculoActivo: 'Glúteo Mayor, Cuádriceps y Estabilizadores de Cadera',
      orden: 24
    },
    {
      id: 'ej-sentadilla-goblet-kb',
      nombre: 'Sentadilla Goblet con Pesa Rusa / Kettlebell',
      grupoMuscular: 'piernas',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '10-12',
      descansoSugerido: 90,
      gifSlug: 'barbell-squat',
      gifUrl: './icons/gifs/barbell-squat.gif',
      startImgUrl: './icons/gifs/barbell-squat-start.gif',
      endImgUrl: './icons/gifs/barbell-squat-end.gif',
      illustrationUrl: './icons/ejercicios/ej-sentadilla-goblet-kb.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Goblet-Squat.gif',
      notas: 'Sostener la pesa rusa pegada al pecho por las asas. Bajar profundo manteniendo torso erguido.',
      musculoActivo: 'Cuádriceps, Glúteos y Core',
      orden: 25
    },
    {
      id: 'ej-peso-muerto-kb',
      nombre: 'Peso Muerto Rumano con Pesas Rusas (Kettlebells)',
      grupoMuscular: 'piernas',
      equipo: 'mancuerna',
      seriesSugeridas: 4,
      repsSugeridas: '10-12',
      descansoSugerido: 90,
      gifSlug: 'romanian-deadlift',
      gifUrl: './icons/gifs/romanian-deadlift.gif',
      startImgUrl: './icons/gifs/romanian-deadlift-start.gif',
      endImgUrl: './icons/gifs/romanian-deadlift-end.gif',
      illustrationUrl: './icons/ejercicios/ej-peso-muerto-kb.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Romanian-Deadlift.gif',
      notas: 'Una pesa rusa en cada mano. Bisagra de cadera empujando glúteos atrás sintiendo el estiramiento de isquios.',
      musculoActivo: 'Isquiotibiales, Glúteo Mayor y Erectores Espinales',
      orden: 26
    },
    {
      id: 'ej-sentadilla-frontal',
      nombre: 'Sentadilla Frontal con Barra (Front Squat)',
      grupoMuscular: 'piernas',
      equipo: 'barra',
      seriesSugeridas: 4,
      repsSugeridas: '6-8',
      descansoSugerido: 150,
      gifSlug: 'barbell-squat',
      gifUrl: './icons/gifs/barbell-squat.gif',
      startImgUrl: './icons/gifs/barbell-squat-start.gif',
      endImgUrl: './icons/gifs/barbell-squat-end.gif',
      illustrationUrl: './icons/ejercicios/ej-sentadilla-frontal.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Front-Squat.gif',
      notas: 'Barra apoyada sobre los deltoides anteriores con codos altos. Torso completamente vertical.',
      musculoActivo: 'Cuádriceps (Énfasis Vasto Medial/Lateral) y Core',
      orden: 27
    },
    {
      id: 'ej-gemelos-pie',
      nombre: 'Elevación de Talones de Pie para Gemelos (Calf Raise)',
      grupoMuscular: 'piernas',
      equipo: 'maquina',
      seriesSugeridas: 4,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'jump-squat',
      gifUrl: './icons/gifs/jump-squat.gif',
      startImgUrl: './icons/gifs/jump-squat-start.gif',
      endImgUrl: './icons/gifs/jump-squat-end.gif',
      illustrationUrl: './icons/ejercicios/ej-gemelos-pie.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Calf-Raise.gif',
      notas: 'Bajar los talones al máximo estiramiento con pausa de 1s y subir explosivo en puntas de pie.',
      musculoActivo: 'Gastrocnemio (Gemelos) y Sóleo',
      orden: 28
    },

    // HOMBROS
    {
      id: 'ej-press-militar',
      nombre: 'Press Militar de Pie con Barra (OHP)',
      grupoMuscular: 'hombros',
      equipo: 'barra',
      seriesSugeridas: 4,
      repsSugeridas: '6-8',
      descansoSugerido: 120,
      gifSlug: 'military-press',
      gifUrl: './icons/gifs/military-press.gif',
      startImgUrl: './icons/gifs/military-press-start.gif',
      endImgUrl: './icons/gifs/military-press-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/07/Barbell-Standing-Military-Press.gif',
      notas: 'Glúteo y abdomen contraídos al máximo para estabilizar la columna.',
      orden: 18
    },
    {
      id: 'ej-press-hombro-manc',
      nombre: 'Press de Hombros Sentado con Mancuernas',
      grupoMuscular: 'hombros',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '8-12',
      descansoSugerido: 90,
      gifSlug: 'db-shoulder-press',
      gifUrl: './icons/gifs/db-shoulder-press.gif',
      startImgUrl: './icons/gifs/db-shoulder-press-start.gif',
      endImgUrl: './icons/gifs/db-shoulder-press-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Shoulder-Press.gif',
      notas: 'Codos ligeramente adelantados en el plano escapular (30°).',
      orden: 19
    },
    {
      id: 'ej-elevaciones-laterales',
      nombre: 'Vuelos / Elevaciones Laterales con Mancuernas',
      grupoMuscular: 'hombros',
      equipo: 'mancuerna',
      seriesSugeridas: 4,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'lateral-raise',
      gifUrl: './icons/gifs/lateral-raise.gif',
      startImgUrl: './icons/gifs/lateral-raise-start.gif',
      endImgUrl: './icons/gifs/lateral-raise-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Lateral-Raise.gif',
      notas: 'Elevar hacia afuera pensando en empujar las paredes laterales sin encoger trapecios.',
      orden: 20
    },
    {
      id: 'ej-face-pull',
      nombre: 'Face Pull en Polea Alta con Soga',
      grupoMuscular: 'hombros',
      equipo: 'polea',
      seriesSugeridas: 3,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'face-pull',
      gifUrl: './icons/gifs/face-pull.gif',
      startImgUrl: './icons/gifs/face-pull-start.gif',
      endImgUrl: './icons/gifs/face-pull-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Face-Pull.gif',
      notas: 'Llevar la soga hacia la frente rotando externamente los hombros.',
      orden: 21
    },
    {
      id: 'ej-elevaciones-laterales-polea',
      nombre: 'Elevaciones Laterales Unilaterales en Polea Baja',
      grupoMuscular: 'hombros',
      equipo: 'polea',
      seriesSugeridas: 4,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'lateral-raise',
      gifUrl: './icons/gifs/lateral-raise.gif',
      startImgUrl: './icons/gifs/lateral-raise-start.gif',
      endImgUrl: './icons/gifs/lateral-raise-end.gif',
      illustrationUrl: './icons/ejercicios/ej-elevaciones-laterales-polea.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Cable-Lateral-Raise.gif',
      notas: 'Polea a la altura de la rodilla pasando por detrás del cuerpo. Tensión constante en todo el recorrido.',
      musculoActivo: 'Deltoides Lateral (Porción Media)',
      orden: 30
    },
    {
      id: 'ej-pajaros-mancuerna',
      nombre: 'Pájaros / Vuelos Posteriores con Mancuernas (Rear Delts)',
      grupoMuscular: 'hombros',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'lateral-raise',
      gifUrl: './icons/gifs/lateral-raise.gif',
      startImgUrl: './icons/gifs/lateral-raise-start.gif',
      endImgUrl: './icons/gifs/lateral-raise-end.gif',
      illustrationUrl: './icons/ejercicios/ej-pajaros-mancuerna.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Rear-Lateral-Raise.gif',
      notas: 'Torso inclinado casi paralelo al suelo. Abrir los brazos guiando con los codos sin juntar excesivamente las escápulas.',
      musculoActivo: 'Deltoides Posterior e Infraespinoso',
      orden: 31
    },
    {
      id: 'ej-press-arnold',
      nombre: 'Press Arnold Sentado con Mancuernas',
      grupoMuscular: 'hombros',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '8-12',
      descansoSugerido: 90,
      gifSlug: 'db-shoulder-press',
      gifUrl: './icons/gifs/db-shoulder-press.gif',
      startImgUrl: './icons/gifs/db-shoulder-press-start.gif',
      endImgUrl: './icons/gifs/db-shoulder-press-end.gif',
      illustrationUrl: './icons/ejercicios/ej-press-arnold.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Arnold-Press.gif',
      notas: 'Comenzar con mancuernas frente a la barbilla en supino y rotar hacia afuera a prono mientras se empuja hacia arriba.',
      musculoActivo: 'Deltoides Anterior, Lateral y Tríceps',
      orden: 32
    },

    // BRAZOS (BÍCEPS & TRÍCEPS)
    {
      id: 'ej-curl-biceps',
      nombre: 'Curl de Bíceps con Barra Z o Recta',
      grupoMuscular: 'brazos',
      equipo: 'barra',
      seriesSugeridas: 3,
      repsSugeridas: '8-12',
      descansoSugerido: 75,
      gifSlug: 'barbell-curl',
      gifUrl: './icons/gifs/barbell-curl.gif',
      startImgUrl: './icons/gifs/barbell-curl-start.gif',
      endImgUrl: './icons/gifs/barbell-curl-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Curl.gif',
      notas: 'Codos fijos a los costados del torso sin balanceo lumbar.',
      orden: 22
    },
    {
      id: 'ej-curl-martillo',
      nombre: 'Curl Martillo con Mancuernas',
      grupoMuscular: 'brazos',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '10-12',
      descansoSugerido: 60,
      gifSlug: 'hammer-curl',
      gifUrl: './icons/gifs/hammer-curl.gif',
      startImgUrl: './icons/gifs/hammer-curl-start.gif',
      endImgUrl: './icons/gifs/hammer-curl-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Hammer-Curl.gif',
      notas: 'Agarre neutro trabajando braquial y braquiorradial.',
      orden: 23
    },
    {
      id: 'ej-triceps-polea',
      nombre: 'Extensión de Tríceps en Polea con Soga',
      grupoMuscular: 'brazos',
      equipo: 'polea',
      seriesSugeridas: 3,
      repsSugeridas: '10-15',
      descansoSugerido: 60,
      gifSlug: 'triceps-pushdown',
      gifUrl: './icons/gifs/triceps-pushdown.gif',
      startImgUrl: './icons/gifs/triceps-pushdown-start.gif',
      endImgUrl: './icons/gifs/triceps-pushdown-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Pushdown.gif',
      notas: 'Abrir la soga al final del recorrido bloqueando el tríceps.',
      orden: 24
    },
    {
      id: 'ej-press-frances',
      nombre: 'Press Francés / Rompecráneos con Barra Z',
      grupoMuscular: 'brazos',
      equipo: 'barra',
      seriesSugeridas: 3,
      repsSugeridas: '8-12',
      descansoSugerido: 75,
      gifSlug: 'triceps-extension',
      gifUrl: './icons/gifs/triceps-extension.gif',
      startImgUrl: './icons/gifs/triceps-extension-start.gif',
      endImgUrl: './icons/gifs/triceps-extension-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Triceps-Extension.gif',
      notas: 'Bajar la barra detrás de la frente manteniendo los codos cerrados.',
      orden: 25
    },
    // VARIANTES DE CURL MARTILLO Y BÍCEPS
    {
      id: 'ej-curl-martillo-inclinado',
      nombre: 'Curl Martillo en Banco Inclinado (60°)',
      grupoMuscular: 'brazos',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '10-12',
      descansoSugerido: 75,
      gifSlug: 'hammer-curl',
      gifUrl: './icons/gifs/hammer-curl.gif',
      startImgUrl: './icons/gifs/hammer-curl-start.gif',
      endImgUrl: './icons/gifs/hammer-curl-end.gif',
      illustrationUrl: './icons/ejercicios/ej-curl-martillo-inclinado.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Incline-Hammer-Curl.gif',
      notas: 'Respaldo a 60°. Brazos colgando detrás del cuerpo para estirar al máximo la cabeza larga del bíceps.',
      musculoActivo: 'Braquial Anterior, Braquiorradial y Cabeza Larga del Bíceps',
      orden: 34
    },
    {
      id: 'ej-curl-martillo-cruzado',
      nombre: 'Curl Martillo Cruzado al Pecho (Pinwheel Curl)',
      grupoMuscular: 'brazos',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '10-12',
      descansoSugerido: 60,
      gifSlug: 'hammer-curl',
      gifUrl: './icons/gifs/hammer-curl.gif',
      startImgUrl: './icons/gifs/hammer-curl-start.gif',
      endImgUrl: './icons/gifs/hammer-curl-end.gif',
      illustrationUrl: './icons/ejercicios/ej-curl-martillo-cruzado.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Hammer-Curl.gif',
      notas: 'Llevar la mancuerna en diagonal hacia el hombro opuesto. Aísla intensamente el músculo braquial.',
      musculoActivo: 'Braquial Anterior (Grosor del Brazo) y Braquiorradial',
      orden: 35
    },
    {
      id: 'ej-curl-martillo-polea',
      nombre: 'Curl Martillo en Polea Baja con Soga',
      grupoMuscular: 'brazos',
      equipo: 'polea',
      seriesSugeridas: 3,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'hammer-curl',
      gifUrl: './icons/gifs/hammer-curl.gif',
      startImgUrl: './icons/gifs/hammer-curl-start.gif',
      endImgUrl: './icons/gifs/hammer-curl-end.gif',
      illustrationUrl: './icons/ejercicios/ej-curl-martillo-polea.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Cable-Hammer-Curl.gif',
      notas: 'Tensión constante al inicio y final del recorrido. Mantener codos clavados a los costados del torso.',
      musculoActivo: 'Braquiorradial, Braquial y Bíceps Braquial',
      orden: 36
    },
    {
      id: 'ej-curl-inclinado-manc',
      nombre: 'Curl de Bíceps en Banco Inclinado con Mancuernas',
      grupoMuscular: 'brazos',
      equipo: 'mancuerna',
      seriesSugeridas: 3,
      repsSugeridas: '8-12',
      descansoSugerido: 75,
      gifSlug: 'barbell-curl',
      gifUrl: './icons/gifs/barbell-curl.gif',
      startImgUrl: './icons/gifs/barbell-curl-start.gif',
      endImgUrl: './icons/gifs/barbell-curl-end.gif',
      illustrationUrl: './icons/ejercicios/ej-curl-inclinado-manc.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Incline-Dumbbell-Curl.gif',
      notas: 'Máximo estiramiento previo de la cabeza larga. Supinar la muñeca al subir apretando en la cima.',
      musculoActivo: 'Cabeza Larga del Bíceps Braquial',
      orden: 37
    },
    {
      id: 'ej-curl-scott',
      nombre: 'Curl en Banco Scott / Predicador con Barra Z',
      grupoMuscular: 'brazos',
      equipo: 'barra',
      seriesSugeridas: 3,
      repsSugeridas: '10-12',
      descansoSugerido: 75,
      gifSlug: 'barbell-curl',
      gifUrl: './icons/gifs/barbell-curl.gif',
      startImgUrl: './icons/gifs/barbell-curl-start.gif',
      endImgUrl: './icons/gifs/barbell-curl-end.gif',
      illustrationUrl: './icons/ejercicios/ej-curl-scott.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Preacher-Curl.gif',
      notas: 'Brazos apoyados en la almohadilla impidiendo cualquier inercia o trampa corporal.',
      musculoActivo: 'Cabeza Corta del Bíceps Braquial (Pico del Bíceps)',
      orden: 38
    },
    // VARIANTES DE TRÍCEPS
    {
      id: 'ej-fondos-banco-triceps',
      nombre: 'Fondos de Tríceps en Banco (Bench Dips)',
      grupoMuscular: 'brazos',
      equipo: 'corporal',
      seriesSugeridas: 3,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'triceps-pushdown',
      gifUrl: './icons/gifs/triceps-pushdown.gif',
      startImgUrl: './icons/gifs/triceps-pushdown-start.gif',
      endImgUrl: './icons/gifs/triceps-pushdown-end.gif',
      illustrationUrl: './icons/ejercicios/ej-fondos-banco-triceps.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/06/Bench-Dips.gif',
      notas: 'Espalda cerca del banco, bajar hasta 90° de flexión de codo y extender con fuerza.',
      musculoActivo: 'Tríceps Braquial (Tres Cabezas)',
      orden: 39
    },
    {
      id: 'ej-press-cerrado-triceps',
      nombre: 'Press de Banca Agarre Cerrado para Tríceps',
      grupoMuscular: 'brazos',
      equipo: 'barra',
      seriesSugeridas: 4,
      repsSugeridas: '8-10',
      descansoSugerido: 90,
      gifSlug: 'bench-press',
      gifUrl: './icons/gifs/bench-press.gif',
      startImgUrl: './icons/gifs/bench-press-start.gif',
      endImgUrl: './icons/gifs/bench-press-end.gif',
      illustrationUrl: './icons/ejercicios/ej-press-cerrado-triceps.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Close-Grip-Bench-Press.gif',
      notas: 'Manos al ancho de los hombros (no más cerradas para proteger muñecas). Codos cerca del cuerpo.',
      musculoActivo: 'Tríceps Braquial (Cabeza Lateral y Medial) y Pectoral Interno',
      orden: 40
    },

    // CORE & ABDOMINALES
    {
      id: 'ej-plancha-abdominal',
      nombre: 'Plancha Abdominal Isométrica (Plank)',
      grupoMuscular: 'core',
      equipo: 'corporal',
      seriesSugeridas: 3,
      repsSugeridas: '45-60s',
      descansoSugerido: 60,
      gifSlug: 'plank',
      gifUrl: './icons/gifs/plank.gif',
      startImgUrl: './icons/gifs/plank-start.gif',
      endImgUrl: './icons/gifs/plank-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2023/07/High-Plank.gif',
      notas: 'Contraer glúteos y abdomen empujando el piso con los antebrazos.',
      orden: 26
    },
    {
      id: 'ej-rueda-abdominal',
      nombre: 'Rueda Abdominal (Ab Wheel Rollout)',
      grupoMuscular: 'core',
      equipo: 'corporal',
      seriesSugeridas: 3,
      repsSugeridas: '8-12',
      descansoSugerido: 75,
      gifSlug: 'rollout',
      gifUrl: './icons/gifs/rollout.gif',
      startImgUrl: './icons/gifs/rollout-start.gif',
      endImgUrl: './icons/gifs/rollout-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/08/swiss-ball-rollout.gif',
      notas: 'Mantener retroversión pélvica sin dejar caer la cadera.',
      orden: 27
    },
    {
      id: 'ej-crunch-polea',
      nombre: 'Crunch Abdominal Arrodillado en Polea Alta',
      grupoMuscular: 'core',
      equipo: 'polea',
      seriesSugeridas: 3,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'cable-crunch',
      gifUrl: './icons/gifs/cable-crunch.gif',
      startImgUrl: './icons/gifs/cable-crunch-start.gif',
      endImgUrl: './icons/gifs/cable-crunch-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Kneeling-Cable-Crunch.gif',
      notas: 'Flexionar la columna vertebral acercando las costillas a la pelvis.',
      orden: 28
    },
    {
      id: 'ej-elevaciones-piernas-colgado',
      nombre: 'Elevaciones de Piernas Colgado en Barra (Hanging Leg Raise)',
      grupoMuscular: 'core',
      equipo: 'corporal',
      seriesSugeridas: 3,
      repsSugeridas: '10-15',
      descansoSugerido: 60,
      gifSlug: 'cable-crunch',
      gifUrl: './icons/gifs/cable-crunch.gif',
      startImgUrl: './icons/gifs/cable-crunch-start.gif',
      endImgUrl: './icons/gifs/cable-crunch-end.gif',
      illustrationUrl: './icons/ejercicios/ej-elevaciones-piernas-colgado.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Hanging-Leg-Raise.gif',
      notas: 'Colgado de la barra, bascular la pelvis hacia arriba llevando los pies a 90° o tocando la barra sin balanceo.',
      musculoActivo: 'Recto Abdominal Inferior y Flexores de Cadera',
      orden: 42
    },
    {
      id: 'ej-ab-crunch-declinado',
      nombre: 'Crunch en Banco Declinado con Disco al Pecho',
      grupoMuscular: 'core',
      equipo: 'corporal',
      seriesSugeridas: 3,
      repsSugeridas: '12-15',
      descansoSugerido: 60,
      gifSlug: 'cable-crunch',
      gifUrl: './icons/gifs/cable-crunch.gif',
      startImgUrl: './icons/gifs/cable-crunch-start.gif',
      endImgUrl: './icons/gifs/cable-crunch-end.gif',
      illustrationUrl: './icons/ejercicios/ej-ab-crunch-declinado.jpg',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Decline-Crunch.gif',
      notas: 'Pies trabados en el banco declinado. Flexión torácica controlada subiendo hasta la mitad para mantener tensión continua.',
      musculoActivo: 'Recto Abdominal Superior y Oblicuos',
      orden: 43
    },

    // ==========================================
    // SEGMENTO: ACTIVACIÓN NEUROMUSCULAR Y CORE
    // ==========================================
    {
      id: 'ej-act-foam-roller',
      nombre: 'Liberación Miofascial con Foam Roller',
      grupoMuscular: 'activacion',
      equipo: 'corporal',
      seriesSugeridas: 1,
      repsSugeridas: '10 pasadas',
      gifSlug: 'rollout',
      gifUrl: './icons/gifs/rollout.gif',
      startImgUrl: './icons/gifs/rollout-start.gif',
      endImgUrl: './icons/gifs/rollout-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/08/swiss-ball-rollout.gif',
      notas: 'Pasadas longitudinales controladas sobre dorsal ancho, glúteos, cuádriceps e isquios.',
      musculoActivo: 'Fascia Toracolumbar, Cuádriceps y Glúteos',
      orden: 101
    },
    {
      id: 'ej-act-gato-camello',
      nombre: 'Gato - Camello (Cat-Cow en Cuadrupedia)',
      grupoMuscular: 'activacion',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '10',
      gifSlug: 'cat-cow',
      gifUrl: './icons/gifs/cat-cow.gif',
      startImgUrl: './icons/gifs/cat-cow-start.gif',
      endImgUrl: './icons/gifs/cat-cow-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2022/12/Pilates-Exercises-cat-cow.gif',
      notas: 'Articulación segmentaria vértebra a vértebra alternando extensión y flexión dorsal-lumbar.',
      musculoActivo: 'Recto Abdominal, Oblicuos y Erectores Espinales',
      orden: 102
    },
    {
      id: 'ej-act-rotacion-toracica',
      nombre: 'Rotación Torácica en Cuadrupedia (T-Spine)',
      grupoMuscular: 'activacion',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '8 por lado',
      gifSlug: 't-spine-rotation',
      gifUrl: './icons/gifs/t-spine-rotation.gif',
      startImgUrl: './icons/gifs/t-spine-rotation-start.gif',
      endImgUrl: './icons/gifs/t-spine-rotation-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2022/08/Kneeling-T-spine-Rotation.gif',
      notas: 'Mano tras la nuca, rotar el codo hacia el techo abriendo el tórax con pelvis estable.',
      musculoActivo: 'Oblicuos, Serrato Anterior y Romboides',
      orden: 103
    },
    {
      id: 'ej-act-deadbug',
      nombre: 'Deadbug / Bicho Muerto Contralateral',
      grupoMuscular: 'activacion',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '10 por lado',
      gifSlug: 'dead-bug',
      gifUrl: './icons/gifs/dead-bug.gif',
      startImgUrl: './icons/gifs/dead-bug-start.gif',
      endImgUrl: './icons/gifs/dead-bug-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Dead-Bug.gif',
      notas: 'Zona lumbar apoyada firme en el piso mientras se extienden brazo y pierna opuestos.',
      musculoActivo: 'Transverso Abdominal y Recto del Abdomen',
      orden: 104
    },
    {
      id: 'ej-act-birddog',
      nombre: 'Bird-Dog / Perro de Muestra (Estabilidad Espinal)',
      grupoMuscular: 'activacion',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '10 por lado',
      gifSlug: 'bird-dog',
      gifUrl: './icons/gifs/bird-dog.gif',
      startImgUrl: './icons/gifs/bird-dog-start.gif',
      endImgUrl: './icons/gifs/bird-dog-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2022/12/Pilates-Exercises-Bird-Dog.gif',
      notas: 'Extensión simultánea de brazo y pierna contraria en cuadrupedia sin rotar la cintura.',
      musculoActivo: 'Multífidos, Glúteo Mayor y Deltoides Anterior',
      orden: 105
    },
    {
      id: 'ej-act-puente-iso',
      nombre: 'Puente de Glúteo Bilateral de Activación',
      grupoMuscular: 'activacion',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '15',
      gifSlug: 'glute-bridge',
      gifUrl: './icons/gifs/glute-bridge.gif',
      startImgUrl: './icons/gifs/glute-bridge-start.gif',
      endImgUrl: './icons/gifs/glute-bridge-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Glute-Bridge-.gif',
      notas: 'Empujar con talones y sostener 2 segundos arriba activando glúteos sin arquear cintura.',
      musculoActivo: 'Glúteo Mayor e Isquiotibiales',
      orden: 106
    },
    {
      id: 'ej-act-monster-walk',
      nombre: 'Caminata Lateral con Banda (Monster Walk)',
      grupoMuscular: 'activacion',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '12 pasos por lado',
      gifSlug: 'barbell-squat',
      gifUrl: './icons/gifs/barbell-squat.gif',
      startImgUrl: './icons/gifs/barbell-squat-start.gif',
      endImgUrl: './icons/gifs/barbell-squat-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/BARBELL-SQUAT.gif',
      notas: 'Banda elástica sobre rodillas o tobillos, semiflexión de cadera y pasos cortos controlados.',
      musculoActivo: 'Glúteo Medio y Tensor de la Fascia Lata',
      orden: 107
    },
    {
      id: 'ej-act-pull-apart',
      nombre: 'Band Pull-Apart (Activación Escapular)',
      grupoMuscular: 'activacion',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '15',
      gifSlug: 'face-pull',
      gifUrl: './icons/gifs/face-pull.gif',
      startImgUrl: './icons/gifs/face-pull-start.gif',
      endImgUrl: './icons/gifs/face-pull-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Face-Pull.gif',
      notas: 'Brazos extendidos al frente, abrir la banda elástica juntando escápulas.',
      musculoActivo: 'Deltoides Posterior, Romboides y Trapecio Medio',
      orden: 108
    },

    // ==========================================
    // SEGMENTO: MOVILIDAD ARTICULAR Y CON CARGA
    // ==========================================
    {
      id: 'ej-mov-puente-gluteo-uni',
      nombre: 'Puente de Glúteo Unilateral',
      grupoMuscular: 'movilidad',
      equipo: 'mancuerna',
      seriesSugeridas: 2,
      repsSugeridas: '15',
      pesoSugerido: 15,
      gifSlug: 'glute-bridge',
      gifUrl: './icons/gifs/glute-bridge.gif',
      startImgUrl: './icons/gifs/glute-bridge-start.gif',
      endImgUrl: './icons/gifs/glute-bridge-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Glute-Bridge-.gif',
      notas: 'Empuje unilateral desde el talón manteniendo pelvis nivelada. Admite carga sobre cadera (ej. 15 kg).',
      musculoActivo: 'Glúteo Mayor, Glúteo Medio e Isquiotibiales',
      orden: 201
    },
    {
      id: 'ej-mov-sentadilla-cosaca',
      nombre: 'Sentadilla Cosaca (Cossack Squat)',
      grupoMuscular: 'movilidad',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '8 por lado',
      gifSlug: 'barbell-squat',
      gifUrl: './icons/gifs/barbell-squat.gif',
      startImgUrl: './icons/gifs/barbell-squat-start.gif',
      endImgUrl: './icons/gifs/barbell-squat-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/BARBELL-SQUAT.gif',
      notas: 'Descenso lateral profundo con pierna contraria extendida y talón de apoyo firme en el suelo.',
      musculoActivo: 'Aductores, Cuádriceps y Glúteo Mayor',
      orden: 202
    },
    {
      id: 'ej-mov-cadera-90-90',
      nombre: 'Movilidad de Cadera 90/90 (Rotación Interna y Externa)',
      grupoMuscular: 'movilidad',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '10',
      gifSlug: 'hip-90-90',
      gifUrl: './icons/gifs/hip-90-90.gif',
      startImgUrl: './icons/gifs/hip-90-90-start.gif',
      endImgUrl: './icons/gifs/hip-90-90-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2022/08/90-90-Hip-Stretch.gif',
      notas: 'Sentado con ambas rodillas a 90°, rotar caderas de lado a lado manteniendo el torso erguido.',
      musculoActivo: 'Rotadores de Cadera, Glúteo Medio y Piriforme',
      orden: 203
    },
    {
      id: 'ej-mov-dorsiflexion-tobillo',
      nombre: 'Dorsiflexión de Tobillo con Carga en Rodilla',
      grupoMuscular: 'movilidad',
      equipo: 'mancuerna',
      seriesSugeridas: 2,
      repsSugeridas: '12 por lado',
      gifSlug: 'bulgarian-split-squat',
      gifUrl: './icons/gifs/bulgarian-split-squat.gif',
      startImgUrl: './icons/gifs/bulgarian-split-squat-start.gif',
      endImgUrl: './icons/gifs/bulgarian-split-squat-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Dumbbell-Bulgarian-Split-Squat.gif',
      notas: 'Adelantar la rodilla superando la punta del pie sin despegar el talón del piso.',
      musculoActivo: 'Sóleo, Gastrocnemio y Tibial Anterior',
      orden: 204
    },
    {
      id: 'ej-mov-dislocaciones-banda',
      nombre: 'Dislocaciones de Hombros con Banda o Bastón',
      grupoMuscular: 'movilidad',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '12',
      gifSlug: 'lateral-raise',
      gifUrl: './icons/gifs/lateral-raise.gif',
      startImgUrl: './icons/gifs/lateral-raise-start.gif',
      endImgUrl: './icons/gifs/lateral-raise-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Lateral-Raise.gif',
      notas: 'Recorrido circular amplio de adelante hacia atrás con codos extendidos.',
      musculoActivo: 'Pectoral Menor, Deltoides y Manguito Rotador',
      orden: 205
    },
    {
      id: 'ej-mov-worlds-greatest',
      nombre: 'Apertura Torácica en Estocada (World’s Greatest Stretch)',
      grupoMuscular: 'movilidad',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '6 por lado',
      gifSlug: 't-spine-rotation',
      gifUrl: './icons/gifs/t-spine-rotation.gif',
      startImgUrl: './icons/gifs/t-spine-rotation-start.gif',
      endImgUrl: './icons/gifs/t-spine-rotation-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2022/08/Kneeling-T-spine-Rotation.gif',
      notas: 'Zancada larga adelante, apoyar mano interna y rotar el otro brazo hacia el techo.',
      musculoActivo: 'Psoas Ilíaco, Isquiotibiales y Columna Torácica',
      orden: 206
    },
    {
      id: 'ej-mov-psoas-caballero',
      nombre: 'Movilidad Dinámica de Psoas en Posición Caballero',
      grupoMuscular: 'movilidad',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '10 por lado',
      gifSlug: 'bulgarian-split-squat',
      gifUrl: './icons/gifs/bulgarian-split-squat.gif',
      startImgUrl: './icons/gifs/bulgarian-split-squat-start.gif',
      endImgUrl: './icons/gifs/bulgarian-split-squat-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Dumbbell-Bulgarian-Split-Squat.gif',
      notas: 'Rodilla en tierra, retroversión pélvica apretando glúteo trasero y avance suave de cadera.',
      musculoActivo: 'Psoas Ilíaco y Recto Femoral',
      orden: 207
    },
    {
      id: 'ej-mov-wall-slides',
      nombre: 'Deslizamiento Escapular en Pared (Wall Slides)',
      grupoMuscular: 'movilidad',
      equipo: 'corporal',
      seriesSugeridas: 2,
      repsSugeridas: '12',
      gifSlug: 'db-shoulder-press',
      gifUrl: './icons/gifs/db-shoulder-press.gif',
      startImgUrl: './icons/gifs/db-shoulder-press-start.gif',
      endImgUrl: './icons/gifs/db-shoulder-press-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Shoulder-Press.gif',
      notas: 'Espalda y antebrazos apoyados en pared deslizando en Y sin arquear la zona lumbar.',
      musculoActivo: 'Trapecio Inferior y Serrato Anterior',
      orden: 208
    },

    // ==========================================
    // SEGMENTO: AMRAP (POR TIEMPO DE TRABAJO Y DESCANSO)
    // ==========================================
    {
      id: 'ej-amrap-circuito',
      nombre: 'Bloque AMRAP (Circuito por Tiempo y Descanso)',
      grupoMuscular: 'amrap',
      equipo: 'corporal',
      seriesSugeridas: 4,
      repsSugeridas: 'Máx reps',
      esAmrap: true,
      tiempoTrabajoSeg: 40,
      tiempoDescansoSeg: 20,
      gifSlug: 'burpees',
      gifUrl: './icons/gifs/burpees.gif',
      startImgUrl: './icons/gifs/burpees-start.gif',
      endImgUrl: './icons/gifs/burpees-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/burpees.gif',
      notas: 'Completar la mayor cantidad de repeticiones o vueltas dentro del tiempo estipulado.',
      musculoActivo: 'Acondicionamiento Metabólico Cuerpo Completo',
      orden: 301
    },
    {
      id: 'ej-amrap-kb-swing',
      nombre: 'Kettlebell Swing (Balanceo con Pesa Rusa - AMRAP)',
      grupoMuscular: 'amrap',
      equipo: 'mancuerna',
      seriesSugeridas: 4,
      repsSugeridas: '15',
      esAmrap: true,
      tiempoTrabajoSeg: 40,
      tiempoDescansoSeg: 20,
      gifSlug: 'kettlebell-swing',
      gifUrl: './icons/gifs/kettlebell-swing.gif',
      startImgUrl: './icons/gifs/kettlebell-swing-start.gif',
      endImgUrl: './icons/gifs/kettlebell-swing-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/09/Kettlebell-Swings.gif',
      notas: 'Potente bisagra de cadera proyectando la pesa rusa hasta la altura del pecho.',
      musculoActivo: 'Glúteo Mayor, Isquiotibiales y Deltoides',
      orden: 302
    },
    {
      id: 'ej-amrap-thrusters',
      nombre: 'Thrusters con Mancuernas o Barra (AMRAP)',
      grupoMuscular: 'amrap',
      equipo: 'mancuerna',
      seriesSugeridas: 4,
      repsSugeridas: '12',
      esAmrap: true,
      tiempoTrabajoSeg: 45,
      tiempoDescansoSeg: 15,
      gifSlug: 'military-press',
      gifUrl: './icons/gifs/military-press.gif',
      startImgUrl: './icons/gifs/military-press-start.gif',
      endImgUrl: './icons/gifs/military-press-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/07/Barbell-Standing-Military-Press.gif',
      notas: 'Sentadilla frontal profunda seguida de empuje vertical sobre la cabeza en un solo tiempo.',
      musculoActivo: 'Cuádriceps, Glúteos y Deltoides',
      orden: 303
    },
    {
      id: 'ej-amrap-burpees',
      nombre: 'Burpees Atléticos Completos (AMRAP)',
      grupoMuscular: 'amrap',
      equipo: 'corporal',
      seriesSugeridas: 4,
      repsSugeridas: '10',
      esAmrap: true,
      tiempoTrabajoSeg: 40,
      tiempoDescansoSeg: 20,
      gifSlug: 'burpees',
      gifUrl: './icons/gifs/burpees.gif',
      startImgUrl: './icons/gifs/burpees-start.gif',
      endImgUrl: './icons/gifs/burpees-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2021/02/burpees.gif',
      notas: 'Apoyo de manos, extensión a plancha, pecho al piso y salto vertical con extensión de cadera.',
      musculoActivo: 'Pectorales, Core y Cadena Extensora de Piernas',
      orden: 304
    },
    {
      id: 'ej-amrap-box-jumps',
      nombre: 'Saltos al Cajón / Box Jumps (AMRAP)',
      grupoMuscular: 'amrap',
      equipo: 'corporal',
      seriesSugeridas: 4,
      repsSugeridas: '10',
      esAmrap: true,
      tiempoTrabajoSeg: 40,
      tiempoDescansoSeg: 20,
      gifSlug: 'jump-squat',
      gifUrl: './icons/gifs/jump-squat.gif',
      startImgUrl: './icons/gifs/jump-squat-start.gif',
      endImgUrl: './icons/gifs/jump-squat-end.gif',
      remoteGifUrl: 'https://fitnessprogramer.com/wp-content/uploads/2023/03/Bulgarian-Jump-Squat.gif',
      notas: 'Salto explosivo amortiguando suave con toda la planta del pie arriba del cajón.',
      musculoActivo: 'Cuádriceps, Glúteos y Gemelos',
      orden: 305
    }
  ];

  // Catálogo ampliado v3.3.1 (Movilidad clínica y deportiva + Fuerza completa para Alumno y Profesor)
  const CATALOGO_EXTRA = [
    // --- MOVILIDAD (incluye Dorsiflexión, AKE, 90/90, Cat-Camel, Open Book y más) ---
    { id: 'ej-mov-ake', nombre: 'Active Knee Extension (AKE) — Isquiotibiales', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '10 por lado', gifSlug: 'leg-curl', notas: 'Acostado boca arriba con cadera a 90°, extender la rodilla activamente hacia el techo sin despegar la zona lumbar.', musculoActivo: 'Isquiotibiales y Cápsula Posterior', orden: 209 },
    { id: 'ej-mov-cat-camel', nombre: 'Cat-Camel / Gato-Camello (Movilidad Espinal)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '10', gifSlug: 'cat-cow', notas: 'En cuadrupedia, alternar flexión dorsal redondeando la espalda y extensión suave movilizando vértebra por vértebra.', musculoActivo: 'Columna Dorsal, Lumbar y Pelvis', orden: 210 },
    { id: 'ej-mov-open-book', nombre: 'Open Book (Apertura Torácica Lateral)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '8 por lado', gifSlug: 't-spine-rotation', notas: 'De costado con rodilla superior apoyada al frente a 90°, abrir el brazo superior rotando el pecho hacia el otro lado.', musculoActivo: 'Columna Torácica, Pectoral y Oblicuos', orden: 211 },
    { id: 'ej-mov-dorsiflexion-pared', nombre: 'Dorsiflexión de Tobillo en Pared (Wall Ankle)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '12 por lado', gifSlug: 'bulgarian-split-squat', notas: 'Frente a la pared, llevar la rodilla a tocarla sin despegar el talón del piso, midiendo distancia progresiva.', musculoActivo: 'Sóleo, Tendón de Aquiles y Tobillo', orden: 212 },
    { id: 'ej-mov-90-90-elevacion', nombre: '90/90 con Elevación de Cadera (Shin Box)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '8 por lado', gifSlug: 'hip-90-90', notas: 'Desde posición 90/90, empujar con las tibias y extender caderas hacia arriba apretando glúteos.', musculoActivo: 'Rotadores de Cadera y Glúteo Medio', orden: 213 },
    { id: 'ej-mov-pigeon-stretch', nombre: 'Paloma Dinámica (Pigeon Stretch de Cadera)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '8 por lado', gifSlug: 'hip-90-90', notas: 'Pierna delantera flexionada al frente, pierna trasera extendida; bajar suave el torso controlando la cadera.', musculoActivo: 'Glúteo Mayor, Piriforme y Rotadores Externos', orden: 214 },
    { id: 'ej-mov-frog-stretch', nombre: 'Rana Dinámica (Frog Stretch — Aductores)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '10', gifSlug: 'hip-90-90', notas: 'Rodillas abiertas al máximo con pies hacia afuera y balanceo suave de cadera hacia atrás.', musculoActivo: 'Aductores y Cápsula de Cadera', orden: 215 },
    { id: 'ej-mov-prying-squat', nombre: 'Sentadilla Profunda con Empuje (Prying Squat)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '8', gifSlug: 'barbell-squat', notas: 'En sentadilla profunda sostener 2-3 s por lado abriendo rodillas con los codos y manteniendo el pecho alto.', musculoActivo: 'Cadera, Aductores y Tobillos', orden: 216 },
    { id: 'ej-mov-escorpion', nombre: 'Escorpión en Suelo (Rotación Lumbar y Psoas)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '8 por lado', gifSlug: 't-spine-rotation', notas: 'Boca abajo con brazos en cruz, llevar un talón hacia la mano contraria manteniendo hombros pegados al piso.', musculoActivo: 'Columna Lumbar, Psoas y Pectoral', orden: 217 },
    { id: 'ej-mov-thread-needle', nombre: 'Enhebrar la Aguja (Thread the Needle)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '8 por lado', gifSlug: 't-spine-rotation', notas: 'En cuadrupedia deslizar un brazo por debajo del torso apoyando hombro y luego abrir hacia el techo.', musculoActivo: 'Columna Torácica y Escápulas', orden: 218 },
    { id: 'ej-mov-ext-toracica-roller', nombre: 'Extensión Torácica sobre Foam Roller o Banco', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '10', gifSlug: 'cat-cow', notas: 'Apoyar zona dorsal sobre el rodillo o banco con manos detrás de la nuca y extender suave sin arquear lumbar.', musculoActivo: 'Columna Torácica y Dorsal Ancho', orden: 219 },
    { id: 'ej-mov-wall-angels', nombre: 'Ángeles en Pared (Wall Angels Escapulares)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '10', gifSlug: 'db-shoulder-press', notas: 'Espalda, cabeza y dorsos de manos apoyados en pared; subir y bajar brazos en W-Y sin despegar muñecas.', musculoActivo: 'Trapecio Inferior, Romboides y Manguito', orden: 220 },
    { id: 'ej-mov-couch-stretch', nombre: 'Couch Stretch (Cuádriceps y Psoas en Pared)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '30 s por lado', gifSlug: 'bulgarian-split-squat', notas: 'Empeine trasero apoyado contra pared o banco, pie delantero firme; apretar glúteo para abrir cadera.', musculoActivo: 'Recto Femoral y Psoas Ilíaco', orden: 221 },
    { id: 'ej-mov-jefferson-curl', nombre: 'Jefferson Curl Ligero (Columna e Isquios)', grupoMuscular: 'movilidad', equipo: 'mancuerna', seriesSugeridas: 2, repsSugeridas: '6', gifSlug: 'romanian-deadlift', notas: 'Desde elevación o piso, bajar lentamente enrollando mentón, dorsal y lumbar con carga muy liviana.', musculoActivo: 'Erectores Espinales e Isquiotibiales', orden: 222 },
    { id: 'ej-mov-cars-hombro', nombre: 'CARs de Hombro (Rotaciones Controladas)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '5 por lado', gifSlug: 'lateral-raise', notas: 'Círculo completo de brazo lento con máxima tensión corporal buscando el rango articular real sin compensar.', musculoActivo: 'Cápsula Glenohumeral y Deltoides', orden: 223 },
    { id: 'ej-mov-cars-cadera', nombre: 'CARs de Cadera en Cuadrupedia', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '6 por lado', gifSlug: 'bird-dog', notas: 'En cuatro apoyos, dibujar círculos amplios y lentos con la rodilla sin mover la zona lumbar.', musculoActivo: 'Cápsula de Cadera y Glúteo Medio', orden: 224 },
    { id: 'ej-mov-pancake-straddle', nombre: 'Apertura Sentado (Seated Straddle / Pancake)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '10', gifSlug: 'hip-90-90', notas: 'Sentado con piernas abiertas en V, inclinar pelvis hacia adelante manteniendo espalda neutra.', musculoActivo: 'Aductores e Isquiotibiales', orden: 225 },
    { id: 'ej-mov-munecas-cuadrupedia', nombre: 'Movilidad de Muñecas en Cuadrupedia', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '12', gifSlug: 'plank', notas: 'Balanceos suaves adelante, atrás y laterales con palmas firmes para preparar empujes y barras.', musculoActivo: 'Flexores y Extensores de Muñeca', orden: 226 },
    { id: 'ej-mov-bisagra-palo', nombre: 'Bisagra de Cadera con Bastón (3 Puntos)', grupoMuscular: 'movilidad', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '12', gifSlug: 'romanian-deadlift', notas: 'Bastón tocando nuca, dorsal y sacro mientras se empujan caderas atrás sin perder contacto.', musculoActivo: 'Isquiotibiales y Control Lumbopélvico', orden: 227 },

    // --- ACTIVACIÓN ---
    { id: 'ej-act-clamshell', nombre: 'Almeja Lateral con Banda (Clamshell)', grupoMuscular: 'activacion', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '15 por lado', gifSlug: 'glute-bridge', notas: 'De costado con rodillas flexionadas, abrir la rodilla superior contra banda sin rotar la pelvis.', musculoActivo: 'Glúteo Medio', orden: 109 },
    { id: 'ej-act-scapular-pushups', nombre: 'Flexiones Escapulares (Scapular Push-Ups)', grupoMuscular: 'activacion', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '12', gifSlug: 'plank', notas: 'En plancha con codos bloqueados, juntar y separar escápulas activando el serrato anterior.', musculoActivo: 'Serrato Anterior y Trapecio Medio', orden: 110 },
    { id: 'ej-act-pallof-banda', nombre: 'Press Pallof Anti-Rotación (Banda / Polea)', grupoMuscular: 'activacion', equipo: 'polea', seriesSugeridas: 2, repsSugeridas: '10 por lado', gifSlug: 'cable-crossover', notas: 'De perfil al anclaje, extender brazos al frente resistiendo la torsión del tronco.', musculoActivo: 'Oblicuos y Transverso Abdominal', orden: 111 },
    { id: 'ej-act-ytw-prono', nombre: 'Elevaciones Y-T-W Prono para Escápulas', grupoMuscular: 'activacion', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '8 c/letra', gifSlug: 'face-pull', notas: 'Boca abajo en banco o suelo, elevar brazos formando Y, T y W apretando escápulas.', musculoActivo: 'Trapecio Inferior y Manguito Rotador', orden: 112 },
    { id: 'ej-act-copenhagen', nombre: 'Plancha de Copenhague (Aductores)', grupoMuscular: 'activacion', equipo: 'corporal', seriesSugeridas: 2, repsSugeridas: '20 s por lado', gifSlug: 'plank', notas: 'Plancha lateral apoyando cara interna de pierna superior sobre banco.', musculoActivo: 'Aductores y Oblicuos', orden: 113 },

    // --- PECHO ---
    { id: 'ej-press-inclinado-barra', nombre: 'Press de Banca Inclinado con Barra (30°-45°)', grupoMuscular: 'pecho', equipo: 'barra', seriesSugeridas: 4, repsSugeridas: '6-10', gifSlug: 'incline-db-press', notas: 'Bajar la barra hacia la parte alta del pecho manteniendo codos a 45° y escápulas retraídas.', musculoActivo: 'Pectoral Clavicular y Deltoides Anterior', orden: 10 },
    { id: 'ej-press-declinado-barra', nombre: 'Press de Banca Declinado con Barra', grupoMuscular: 'pecho', equipo: 'barra', seriesSugeridas: 3, repsSugeridas: '8-10', gifSlug: 'bench-press', notas: 'Trayectoria hacia la línea inferior del pectoral con pies trabados.', musculoActivo: 'Pectoral Inferior y Tríceps', orden: 11 },
    { id: 'ej-press-pecho-maquina', nombre: 'Press de Pecho Sentado en Máquina (Chest Press)', grupoMuscular: 'pecho', equipo: 'maquina', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'bench-press', notas: 'Empuje guiado manteniendo hombros abajo y espalda firme en el respaldo.', musculoActivo: 'Pectoral Mayor y Tríceps', orden: 12 },
    { id: 'ej-press-inclinado-maquina', nombre: 'Press Inclinado en Máquina Convergente / Hammer', grupoMuscular: 'pecho', equipo: 'maquina', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'incline-db-press', notas: 'Empuje convergente hacia arriba juntando manos al final sin despegar hombros.', musculoActivo: 'Pectoral Superior', orden: 13 },
    { id: 'ej-cruces-polea-baja', nombre: 'Cruces en Polea Baja (Pecho Superior)', grupoMuscular: 'pecho', equipo: 'polea', seriesSugeridas: 3, repsSugeridas: '12-15', gifSlug: 'cable-crossover', notas: 'Llevar poleas desde abajo hacia arriba y al centro frente al rostro con codos semiflexionados.', musculoActivo: 'Pectoral Clavicular', orden: 14 },
    { id: 'ej-pullover-mancuerna', nombre: 'Pullover con Mancuerna en Banco Plano', grupoMuscular: 'pecho', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'bench-press', notas: 'Descender la mancuerna detrás de la cabeza estirando tórax y volver hasta la vertical del pecho.', musculoActivo: 'Pectoral Mayor, Serrato y Dorsal', orden: 15 },

    // --- ESPALDA ---
    { id: 'ej-peso-muerto-convencional', nombre: 'Peso Muerto Convencional con Barra', grupoMuscular: 'espalda', equipo: 'barra', seriesSugeridas: 3, repsSugeridas: '5-8', gifSlug: 'romanian-deadlift', notas: 'Barra pegada a las tibias, espalda neutra, empujar el piso con las piernas y bloquear cadera.', musculoActivo: 'Cadena Posterior, Erectores y Trapecio', orden: 28 },
    { id: 'ej-peso-muerto-sumo', nombre: 'Peso Muerto Sumo con Barra', grupoMuscular: 'espalda', equipo: 'barra', seriesSugeridas: 3, repsSugeridas: '5-8', gifSlug: 'romanian-deadlift', notas: 'Pies anchos en rotación externa y agarre interno; torso más vertical al despegar.', musculoActivo: 'Glúteos, Aductores y Espalda Baja', orden: 29 },
    { id: 'ej-remo-maquina-hammer', nombre: 'Remo en Máquina Convergente / Hammer', grupoMuscular: 'espalda', equipo: 'maquina', seriesSugeridas: 4, repsSugeridas: '10-12', gifSlug: 'seated-cable-row', notas: 'Pecho apoyado, traccionar codos atrás apretando dorsales y escápulas.', musculoActivo: 'Dorsal Ancho, Romboides y Trapecio Medio', orden: 30 },
    { id: 'ej-remo-pecho-apoyado', nombre: 'Remo Pecho Apoyado en Banco Inclinado', grupoMuscular: 'espalda', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'dumbbell-row', notas: 'Sin balanceo lumbar, traccionar mancuernas hacia la cadera.', musculoActivo: 'Dorsal Ancho y Deltoides Posterior', orden: 31 },
    { id: 'ej-jalon-supino', nombre: 'Jalón al Pecho Agarre Supino', grupoMuscular: 'espalda', equipo: 'polea', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'lat-pulldown', notas: 'Palmas mirando hacia vos al ancho de hombros, llevar barra al pecho superior.', musculoActivo: 'Dorsal Ancho Inferior y Bíceps', orden: 32 },
    { id: 'ej-jalon-unilateral', nombre: 'Jalón Unilateral en Polea Alta', grupoMuscular: 'espalda', equipo: 'polea', seriesSugeridas: 3, repsSugeridas: '10-12 por lado', gifSlug: 'lat-pulldown', notas: 'Tracción a una mano llevando el codo hacia el costado de la cintura.', musculoActivo: 'Dorsal Ancho Aislado', orden: 33 },
    { id: 'ej-encogimientos-trapecio', nombre: 'Encogimientos de Hombros (Shrugs)', grupoMuscular: 'espalda', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '12-15', gifSlug: 'dumbbell-row', notas: 'Elevar hombros verticalmente hacia las orejas sosteniendo 1 s arriba.', musculoActivo: 'Trapecio Superior', orden: 34 },
    { id: 'ej-hiperextensiones', nombre: 'Hiperextensiones Lumbares en Banco 45°', grupoMuscular: 'espalda', equipo: 'corporal', seriesSugeridas: 3, repsSugeridas: '12-15', gifSlug: 'romanian-deadlift', notas: 'Bisagra de cadera controlada subiendo hasta alinear el torso sin hiperextender.', musculoActivo: 'Erectores Espinales, Glúteos e Isquios', orden: 35 },

    // --- PIERNAS ---
    { id: 'ej-zancadas-caminando', nombre: 'Zancadas Caminando con Mancuernas (Walking Lunges)', grupoMuscular: 'piernas', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '10 por pierna', gifSlug: 'bulgarian-split-squat', notas: 'Pasos largos y estables bajando la rodilla trasera cerca del suelo.', musculoActivo: 'Cuádriceps y Glúteo Mayor', orden: 48 },
    { id: 'ej-estocadas-atras', nombre: 'Estocadas Hacia Atrás (Reverse Lunges)', grupoMuscular: 'piernas', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '10 por pierna', gifSlug: 'bulgarian-split-squat', notas: 'Paso atrás controlado manteniendo la tibia delantera estable y carga en el talón delantero.', musculoActivo: 'Glúteos y Cuádriceps', orden: 49 },
    { id: 'ej-sentadilla-hack', nombre: 'Sentadilla Hack en Máquina (Hack Squat)', grupoMuscular: 'piernas', equipo: 'maquina', seriesSugeridas: 4, repsSugeridas: '8-12', gifSlug: 'leg-press', notas: 'Espalda y glúteos pegados al carro bajando con máxima flexión de rodilla.', musculoActivo: 'Cuádriceps', orden: 50 },
    { id: 'ej-sentadilla-smith', nombre: 'Sentadilla en Máquina Smith / Multipower', grupoMuscular: 'piernas', equipo: 'maquina', seriesSugeridas: 4, repsSugeridas: '8-12', gifSlug: 'barbell-squat', notas: 'Pies levemente adelantados para mantener torso firme y bajar profundo.', musculoActivo: 'Cuádriceps y Glúteos', orden: 51 },
    { id: 'ej-rdl-unilateral', nombre: 'Peso Muerto a Una Pierna (Single-Leg RDL)', grupoMuscular: 'piernas', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '10 por lado', gifSlug: 'romanian-deadlift', notas: 'Bisagra unilateral llevando pierna libre atrás en línea con el torso.', musculoActivo: 'Isquiotibiales y Glúteo Medio', orden: 52 },
    { id: 'ej-curl-femoral-sentado', nombre: 'Curl Femoral Sentado en Máquina', grupoMuscular: 'piernas', equipo: 'maquina', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'leg-curl', notas: 'Rodillas alineadas al eje y flexión completa con excéntrica de 2-3 s.', musculoActivo: 'Isquiotibiales', orden: 53 },
    { id: 'ej-curl-femoral-tumbado', nombre: 'Curl Femoral Tumbado en Camilla', grupoMuscular: 'piernas', equipo: 'maquina', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'leg-curl', notas: 'Mantener cadera pegada al banco al flexionar talones hacia glúteos.', musculoActivo: 'Isquiotibiales', orden: 54 },
    { id: 'ej-nordic-curl', nombre: 'Curl Nórdico de Isquiotibiales', grupoMuscular: 'piernas', equipo: 'corporal', seriesSugeridas: 3, repsSugeridas: '5-8', gifSlug: 'leg-curl', notas: 'Tobillos fijados, descender el cuerpo en bloque frenando con isquios.', musculoActivo: 'Isquiotibiales (Excéntrico)', orden: 55 },
    { id: 'ej-abductores-maquina', nombre: 'Abducción de Cadera en Máquina', grupoMuscular: 'piernas', equipo: 'maquina', seriesSugeridas: 3, repsSugeridas: '15', gifSlug: 'glute-bridge', notas: 'Abrir rodillas controlando el retorno sin dar tirones.', musculoActivo: 'Glúteo Medio y Menor', orden: 56 },
    { id: 'ej-aductores-maquina', nombre: 'Aducción de Cadera en Máquina', grupoMuscular: 'piernas', equipo: 'maquina', seriesSugeridas: 3, repsSugeridas: '15', gifSlug: 'leg-press', notas: 'Cerrar piernas de forma controlada con pausa de 1 s en contracción.', musculoActivo: 'Aductores', orden: 57 },
    { id: 'ej-patada-gluteo-polea', nombre: 'Patada de Glúteo en Polea Baja', grupoMuscular: 'piernas', equipo: 'polea', seriesSugeridas: 3, repsSugeridas: '12-15 por lado', gifSlug: 'glute-bridge', notas: 'Extender la pierna atrás apretando glúteo sin arquear la espalda baja.', musculoActivo: 'Glúteo Mayor', orden: 58 },
    { id: 'ej-step-up-cajon', nombre: 'Subidas al Cajón con Mancuernas (Step-Up)', grupoMuscular: 'piernas', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '10 por pierna', gifSlug: 'bulgarian-split-squat', notas: 'Empujar exclusivamente con la pierna de arriba evitando impulsarse con el pie de apoyo.', musculoActivo: 'Cuádriceps y Glúteo Mayor', orden: 59 },
    { id: 'ej-gemelos-sentado', nombre: 'Gemelos Sentado en Máquina (Sóleo)', grupoMuscular: 'piernas', equipo: 'maquina', seriesSugeridas: 4, repsSugeridas: '15-20', gifSlug: 'leg-press', notas: 'Pausa abajo estirando 2 s y subida máxima en punta de pies.', musculoActivo: 'Sóleo', orden: 60 },
    { id: 'ej-gemelos-prensa', nombre: 'Empuje de Gemelos en Prensa 45°', grupoMuscular: 'piernas', equipo: 'maquina', seriesSugeridas: 4, repsSugeridas: '15', gifSlug: 'leg-press', notas: 'Apoyar metatarsos en el borde inferior de la plataforma con rodillas casi extendidas.', musculoActivo: 'Gastrocnemio', orden: 61 },

    // --- HOMBROS ---
    { id: 'ej-press-hombro-maquina', nombre: 'Press de Hombros en Máquina Sentado', grupoMuscular: 'hombros', equipo: 'maquina', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'db-shoulder-press', notas: 'Empuje vertical guiado bajando hasta la altura de las orejas.', musculoActivo: 'Deltoides Anterior y Medio', orden: 68 },
    { id: 'ej-elevaciones-frontales', nombre: 'Elevaciones Frontales con Mancuernas o Disco', grupoMuscular: 'hombros', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '12-15', gifSlug: 'lateral-raise', notas: 'Elevar al frente hasta la altura de los ojos sin balancear la espalda.', musculoActivo: 'Deltoides Anterior', orden: 69 },
    { id: 'ej-elevaciones-laterales-maquina', nombre: 'Elevaciones Laterales en Máquina', grupoMuscular: 'hombros', equipo: 'maquina', seriesSugeridas: 4, repsSugeridas: '12-15', gifSlug: 'lateral-raise', notas: 'Empujar con los codos hacia los costados con tensión constante.', musculoActivo: 'Deltoides Lateral', orden: 70 },
    { id: 'ej-pajaros-pec-deck', nombre: 'Pájaros Invertidos en Máquina (Reverse Pec Deck)', grupoMuscular: 'hombros', equipo: 'maquina', seriesSugeridas: 3, repsSugeridas: '12-15', gifSlug: 'pec-deck', notas: 'Pecho apoyado, abrir brazos atrás liderando con el dorso de las manos.', musculoActivo: 'Deltoides Posterior', orden: 71 },
    { id: 'ej-remo-al-menton', nombre: 'Remo al Mentón / Tirón Vertical (Barra / Polea)', grupoMuscular: 'hombros', equipo: 'barra', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'military-press', notas: 'Agarre al ancho de hombros llevando codos arriba y afuera hasta el pecho alto.', musculoActivo: 'Deltoides Lateral y Trapecio', orden: 72 },
    { id: 'ej-rotacion-externa-polea', nombre: 'Rotación Externa de Manguito en Polea', grupoMuscular: 'hombros', equipo: 'polea', seriesSugeridas: 3, repsSugeridas: '15 por lado', gifSlug: 'face-pull', notas: 'Codo pegado al costado a 90°, rotar el antebrazo hacia afuera con carga liviana.', musculoActivo: 'Infraespinoso y Redondo Menor', orden: 73 },

    // --- BRAZOS ---
    { id: 'ej-curl-alterno-manc', nombre: 'Curl Alterno con Mancuernas (Supinación)', grupoMuscular: 'brazos', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'barbell-curl', notas: 'Subir rotando la palma hacia arriba sin mover los codos hacia adelante.', musculoActivo: 'Bíceps Braquial', orden: 82 },
    { id: 'ej-curl-concentrado', nombre: 'Curl Concentrado Unilateral', grupoMuscular: 'brazos', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '12 por lado', gifSlug: 'barbell-curl', notas: 'Codo apoyado en cara interna del muslo para aislar el pico del bíceps.', musculoActivo: 'Bíceps Braquial', orden: 83 },
    { id: 'ej-curl-polea-baja', nombre: 'Curl de Bíceps en Polea Baja con Barra', grupoMuscular: 'brazos', equipo: 'polea', seriesSugeridas: 3, repsSugeridas: '12-15', gifSlug: 'barbell-curl', notas: 'Tensión continua en todo el recorrido evitando balanceos.', musculoActivo: 'Bíceps Braquial', orden: 84 },
    { id: 'ej-curl-arana', nombre: 'Curl Araña en Banco Inclinado (Spider Curl)', grupoMuscular: 'brazos', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'barbell-curl', notas: 'Pecho apoyado en banco a 45° dejando caer los brazos verticales para máxima tensión arriba.', musculoActivo: 'Cabeza Corta del Bíceps', orden: 85 },
    { id: 'ej-triceps-barra-polea', nombre: 'Extensión de Tríceps en Polea con Barra', grupoMuscular: 'brazos', equipo: 'polea', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'triceps-pushdown', notas: 'Codos fijos al torso empujando la barra recta o en V hasta extensión completa.', musculoActivo: 'Tríceps Lateral y Medial', orden: 86 },
    { id: 'ej-triceps-trasnuca-manc', nombre: 'Extensión de Tríceps Tras Nuca con Mancuerna', grupoMuscular: 'brazos', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '10-12', gifSlug: 'triceps-extension', notas: 'Codos apuntando arriba buscando máximo estiramiento detrás de la cabeza.', musculoActivo: 'Cabeza Larga del Tríceps', orden: 87 },
    { id: 'ej-triceps-trasnuca-polea', nombre: 'Extensión de Tríceps Overhead en Polea con Soga', grupoMuscular: 'brazos', equipo: 'polea', seriesSugeridas: 3, repsSugeridas: '12-15', gifSlug: 'triceps-extension', notas: 'De espaldas a la polea, extender codos hacia adelante y arriba separando la soga.', musculoActivo: 'Cabeza Larga del Tríceps', orden: 88 },
    { id: 'ej-patada-triceps', nombre: 'Patada de Tríceps (Mancuerna o Polea)', grupoMuscular: 'brazos', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '12-15', gifSlug: 'triceps-extension', notas: 'Torso paralelo al suelo, brazo paralelo al tronco y extensión completa atrás.', musculoActivo: 'Tríceps Braquial', orden: 89 },

    // --- CORE ---
    { id: 'ej-plancha-lateral', nombre: 'Plancha Lateral Isométrica (Side Plank)', grupoMuscular: 'core', equipo: 'corporal', seriesSugeridas: 3, repsSugeridas: '30-45 s por lado', gifSlug: 'plank', notas: 'Cuerpo alineado de pies a cabeza sin dejar caer la cadera.', musculoActivo: 'Oblicuos y Cuadrado Lumbar', orden: 96 },
    { id: 'ej-pallof-press', nombre: 'Press Pallof en Polea (Anti-Rotación)', grupoMuscular: 'core', equipo: 'polea', seriesSugeridas: 3, repsSugeridas: '12 por lado', gifSlug: 'cable-crossover', notas: 'Extender maneral desde el pecho hacia adelante sosteniendo 2 s sin girar el torso.', musculoActivo: 'Oblicuos y Transverso', orden: 97 },
    { id: 'ej-russian-twist', nombre: 'Giros Rusos con Disco o Kettlebell', grupoMuscular: 'core', equipo: 'mancuerna', seriesSugeridas: 3, repsSugeridas: '16-20', gifSlug: 'cable-crunch', notas: 'Torso inclinado atrás 45° rotando hombros de lado a lado con control.', musculoActivo: 'Oblicuos y Recto Abdominal', orden: 98 },
    { id: 'ej-hollow-body', nombre: 'Hollow Body Hold (Bote Isométrico)', grupoMuscular: 'core', equipo: 'corporal', seriesSugeridas: 3, repsSugeridas: '30 s', gifSlug: 'dead-bug', notas: 'Zona lumbar pegada al piso, hombros y piernas extendidas despegados del suelo.', musculoActivo: 'Recto Abdominal y Transverso', orden: 99 },
    { id: 'ej-woodchopper-polea', nombre: 'Leñador en Polea (Cable Woodchopper)', grupoMuscular: 'core', equipo: 'polea', seriesSugeridas: 3, repsSugeridas: '12 por lado', gifSlug: 'cable-crossover', notas: 'Rotación diagonal controlada desde hombro contrario hacia la cadera.', musculoActivo: 'Oblicuos y Rotadores de Tronco', orden: 100 },
    { id: 'ej-mountain-climbers', nombre: 'Escaladores Controlados (Mountain Climbers)', grupoMuscular: 'core', equipo: 'corporal', seriesSugeridas: 3, repsSugeridas: '20', gifSlug: 'plank', notas: 'En plancha alta llevar rodillas alternadas hacia el pecho sin elevar la cadera.', musculoActivo: 'Core Anterior y Flexores de Cadera', orden: 101 },

    // --- AMRAP / METABÓLICO ---
    { id: 'ej-amrap-jump-squat', nombre: 'Sentadillas con Salto (Jump Squats — AMRAP)', grupoMuscular: 'amrap', equipo: 'corporal', seriesSugeridas: 4, repsSugeridas: '15', esAmrap: true, tiempoTrabajoSeg: 40, tiempoDescansoSeg: 20, gifSlug: 'jump-squat', notas: 'Descenso controlado y salto explosivo amortiguando suave con rodillas alineadas.', musculoActivo: 'Cuádriceps, Glúteos y Gemelos', orden: 306 },
    { id: 'ej-amrap-wall-balls', nombre: 'Wall Balls / Lanzamiento de Balón (AMRAP)', grupoMuscular: 'amrap', equipo: 'mancuerna', seriesSugeridas: 4, repsSugeridas: '15', esAmrap: true, tiempoTrabajoSeg: 40, tiempoDescansoSeg: 20, gifSlug: 'barbell-squat', notas: 'Sentadilla profunda con balón al pecho y extensión explosiva lanzando arriba.', musculoActivo: 'Piernas, Hombros y Core', orden: 307 },
    { id: 'ej-amrap-clean-press', nombre: 'Cargada y Press con Mancuernas (Clean & Press)', grupoMuscular: 'amrap', equipo: 'mancuerna', seriesSugeridas: 4, repsSugeridas: '10', esAmrap: true, tiempoTrabajoSeg: 45, tiempoDescansoSeg: 15, gifSlug: 'military-press', notas: 'Impulso de cadera hasta hombros seguido de empuje sobre la cabeza.', musculoActivo: 'Cadena Posterior, Deltoides y Core', orden: 308 },
    { id: 'ej-amrap-farmer-walk', nombre: 'Caminata del Granjero Pesada (Farmer’s Walk)', grupoMuscular: 'amrap', equipo: 'mancuerna', seriesSugeridas: 4, repsSugeridas: '30 m', esAmrap: true, tiempoTrabajoSeg: 40, tiempoDescansoSeg: 20, gifSlug: 'romanian-deadlift', notas: 'Caminar erguido con mancuernas pesadas, hombros atrás y core firme.', musculoActivo: 'Antebrazos, Trapecio y Core', orden: 309 }
  ];

  CATALOGO_EXTRA.forEach(item => {
    Engine.CATALOGO_EJERCICIOS.push({
      ...item,
      gifUrl: `./icons/gifs/${item.gifSlug}.gif`,
      startImgUrl: `./icons/gifs/${item.gifSlug}-start.gif`,
      endImgUrl: `./icons/gifs/${item.gifSlug}-end.gif`
    });
  });

  /**
   * Resuelve siempre las 3 imágenes anatómicas (Postura Inicial, Postura Final y GIF en Movimiento)
   * incluso si el ejercicio provino de una sesión previa en localStorage sin los campos nuevos.
   */
  const AVAILABLE_ILLUSTRATIONS = {
    'ej-press-banca': './icons/ejercicios/ej-press-banca.jpg',
    'ej-press-inclinado-manc': './icons/ejercicios/ej-press-inclinado-manc.jpg',
    'ej-apertura-polea': './icons/ejercicios/ej-apertura-polea.jpg',
    'ej-fondos-paralelas': './icons/ejercicios/ej-fondos-paralelas.jpg',
    'ej-peck-deck': './icons/ejercicios/ej-peck-deck.jpg',
    'ej-dominadas': './icons/ejercicios/ej-dominadas.jpg',
    'ej-jalon-pecho': './icons/ejercicios/ej-jalon-pecho.jpg',
    'ej-remo-barra': './icons/ejercicios/ej-remo-barra.jpg',
    'ej-remo-polea-baja': './icons/ejercicios/ej-remo-polea-baja.jpg',
    'ej-remo-mancuerna': './icons/ejercicios/ej-remo-mancuerna.jpg',
    'ej-sentadilla': './icons/ejercicios/ej-sentadilla.jpg',
    'ej-peso-muerto': './icons/ejercicios/ej-peso-muerto.jpg',
    'ej-prensa-inclinada': './icons/ejercicios/ej-prensa-inclinada.jpg',
    'ej-hip-thrust': './icons/ejercicios/ej-hip-thrust.jpg',
    'ej-sillon-cuadriceps': './icons/ejercicios/ej-sillon-cuadriceps.jpg',
    'ej-camilla-isquios': './icons/ejercicios/ej-camilla-isquios.jpg',
    'ej-estocadas-bulgaras': './icons/ejercicios/ej-estocadas-bulgaras.jpg',
    'ej-press-militar': './icons/ejercicios/ej-press-militar.jpg',
    'ej-press-hombro-manc': './icons/ejercicios/ej-press-hombro-manc.jpg',
    'ej-elevaciones-laterales': './icons/ejercicios/ej-elevaciones-laterales.jpg',
    'ej-face-pull': './icons/ejercicios/ej-face-pull.jpg',
    'ej-curl-biceps': './icons/ejercicios/ej-curl-biceps.jpg',
    'ej-curl-martillo': './icons/ejercicios/ej-curl-martillo.jpg',
    'ej-triceps-polea': './icons/ejercicios/ej-triceps-polea.jpg',
    'ej-press-frances': './icons/ejercicios/ej-press-frances.jpg',
    'ej-plancha-abdominal': './icons/ejercicios/ej-plancha-abdominal.jpg',
    'ej-rueda-abdominal': './icons/ejercicios/ej-rueda-abdominal.jpg',
    'ej-crunch-polea': './icons/ejercicios/ej-crunch-polea.jpg',
    'ej-act-foam-roller': './icons/ejercicios/ej-act-foam-roller.jpg',
    'ej-act-gato-camello': './icons/ejercicios/ej-act-gato-camello.jpg',
    'ej-act-rotacion-toracica': './icons/ejercicios/ej-act-rotacion-toracica.jpg',
    'ej-act-deadbug': './icons/ejercicios/ej-act-deadbug.jpg',
    'ej-act-birddog': './icons/ejercicios/ej-act-birddog.jpg',
    'ej-act-puente-iso': './icons/ejercicios/ej-act-puente-iso.jpg',
    'ej-act-monster-walk': './icons/ejercicios/ej-act-monster-walk.jpg',
    'ej-act-pull-apart': './icons/ejercicios/ej-act-pull-apart.jpg',
    'ej-mov-puente-gluteo-uni': './icons/ejercicios/ej-mov-puente-gluteo-uni.jpg',
    'ej-mov-sentadilla-cosaca': './icons/ejercicios/ej-mov-sentadilla-cosaca.jpg',
    'ej-mov-cadera-90-90': './icons/ejercicios/ej-mov-cadera-90-90.jpg',
    'ej-mov-dorsiflexion-tobillo': './icons/ejercicios/ej-mov-dorsiflexion-tobillo.jpg',
    'ej-mov-dislocaciones-banda': './icons/ejercicios/ej-mov-dislocaciones-banda.jpg',
    'ej-mov-worlds-greatest': './icons/ejercicios/ej-mov-worlds-greatest.jpg',
    'ej-mov-psoas-caballero': './icons/ejercicios/ej-mov-psoas-caballero.jpg',
    'ej-mov-wall-slides': './icons/ejercicios/ej-mov-wall-slides.jpg',
    'ej-amrap-circuito': './icons/ejercicios/ej-amrap-circuito.jpg',
    'ej-amrap-kb-swing': './icons/ejercicios/ej-amrap-kb-swing.jpg',
    'ej-amrap-thrusters': './icons/ejercicios/ej-amrap-thrusters.jpg',
    'ej-amrap-burpees': './icons/ejercicios/ej-amrap-burpees.jpg',
    'ej-amrap-box-jumps': './icons/ejercicios/ej-amrap-box-jumps.jpg',
    'ej-dominadas-pronas': './icons/ejercicios/ej-dominadas-pronas.jpg',
    'ej-dominadas-supinas': './icons/ejercicios/ej-dominadas-supinas.jpg',
    'ej-dominadas-neutras': './icons/ejercicios/ej-dominadas-neutras.jpg',
    'ej-dominadas-anillas': './icons/ejercicios/ej-dominadas-anillas.jpg',
    'ej-dominadas-asistidas': './icons/ejercicios/ej-dominadas-asistidas.jpg',
    'ej-dominadas-lastradas': './icons/ejercicios/ej-dominadas-lastradas.jpg',
    'ej-estocadas-bulgaras-kb': './icons/ejercicios/ej-estocadas-bulgaras-kb.jpg',
    'ej-sentadilla-goblet-kb': './icons/ejercicios/ej-sentadilla-goblet-kb.jpg',
    'ej-peso-muerto-kb': './icons/ejercicios/ej-peso-muerto-kb.jpg',
    'ej-sentadilla-frontal': './icons/ejercicios/ej-sentadilla-frontal.jpg',
    'ej-aperturas-banco-plano': './icons/ejercicios/ej-aperturas-banco-plano.jpg',
    'ej-aperturas-banco-inclinado': './icons/ejercicios/ej-aperturas-banco-inclinado.jpg',
    'ej-press-plano-manc': './icons/ejercicios/ej-press-plano-manc.jpg',
    'ej-flexiones-suelo': './icons/ejercicios/ej-flexiones-suelo.jpg',
    'ej-remo-barra-prono': './icons/ejercicios/ej-remo-barra-prono.jpg',
    'ej-remo-barra-supino': './icons/ejercicios/ej-remo-barra-supino.jpg',
    'ej-remo-pendlay': './icons/ejercicios/ej-remo-pendlay.jpg',
    'ej-remo-barra-t': './icons/ejercicios/ej-remo-barra-t.jpg',
    'ej-jalon-pecho-neutro': './icons/ejercicios/ej-jalon-pecho-neutro.jpg',
    'ej-pullover-polea': './icons/ejercicios/ej-pullover-polea.jpg',
    'ej-curl-martillo-inclinado': './icons/ejercicios/ej-curl-martillo-inclinado.jpg',
    'ej-curl-martillo-cruzado': './icons/ejercicios/ej-curl-martillo-cruzado.jpg',
    'ej-curl-martillo-polea': './icons/ejercicios/ej-curl-martillo-polea.jpg',
    'ej-curl-inclinado-manc': './icons/ejercicios/ej-curl-inclinado-manc.jpg',
    'ej-curl-scott': './icons/ejercicios/ej-curl-scott.jpg',
    'ej-fondos-banco-triceps': './icons/ejercicios/ej-fondos-banco-triceps.jpg',
    'ej-press-cerrado-triceps': './icons/ejercicios/ej-press-cerrado-triceps.jpg',
    'ej-elevaciones-laterales-polea': './icons/ejercicios/ej-elevaciones-laterales-polea.jpg',
    'ej-pajaros-mancuerna': './icons/ejercicios/ej-pajaros-mancuerna.jpg',
    'ej-press-arnold': './icons/ejercicios/ej-press-arnold.jpg',
    'ej-elevaciones-piernas-colgado': './icons/ejercicios/ej-elevaciones-piernas-colgado.jpg',
    'ej-ab-crunch-declinado': './icons/ejercicios/ej-ab-crunch-declinado.jpg',
    'ej-gemelos-pie': './icons/ejercicios/ej-gemelos-pie.jpg'
  };

  /**
   * Resuelve los recursos visuales del ejercicio (Lámina de Posición Inicial y Final).
   */
  Engine.resolveEjercicioMedia = function (ej) {
    if (!ej) {
      return {
        illustrationUrl: null,
        startImgUrl: './icons/gifs/bench-press-start.gif',
        endImgUrl: './icons/gifs/bench-press-end.gif',
        gifUrl: './icons/gifs/bench-press.gif'
      };
    }

    const legacyIdMap = {
      'ej-act-cat-camel': 'ej-act-gato-camello',
      'ej-press-banca-plano': 'ej-press-banca',
      'ej-amrap-kettlebell-swing': 'ej-amrap-kb-swing'
    };
    const lookupId = legacyIdMap[ej.id] || ej.id;
    const illustrationUrl = AVAILABLE_ILLUSTRATIONS[lookupId] || null;

    const catMatch = Engine.CATALOGO_EJERCICIOS.find(c => c.id === lookupId);
    if (catMatch) {
      return {
        illustrationUrl: illustrationUrl || catMatch.illustrationUrl || null,
        startImgUrl: catMatch.startImgUrl,
        endImgUrl: catMatch.endImgUrl,
        gifUrl: catMatch.gifUrl
      };
    }

    const groupIllustrationMap = {
      pecho: './icons/ejercicios/ej-press-banca.jpg',
      espalda: './icons/ejercicios/ej-jalon-pecho.jpg',
      piernas: './icons/ejercicios/ej-sentadilla.jpg',
      hombros: './icons/ejercicios/ej-press-hombro-manc.jpg',
      brazos: './icons/ejercicios/ej-curl-biceps.jpg',
      core: './icons/ejercicios/ej-crunch-polea.jpg',
      activacion: './icons/ejercicios/ej-act-gato-camello.jpg',
      movilidad: './icons/ejercicios/ej-mov-puente-gluteo-uni.jpg',
      amrap: './icons/ejercicios/ej-amrap-burpees.jpg'
    };
    const groupSlugMap = {
      pecho: 'bench-press',
      espalda: 'lat-pulldown',
      piernas: 'barbell-squat',
      hombros: 'db-shoulder-press',
      brazos: 'barbell-curl',
      core: 'cable-crunch',
      activacion: 'cat-cow',
      movilidad: 'glute-bridge',
      amrap: 'burpees'
    };
    const slug = ej.gifSlug || groupSlugMap[ej.grupoMuscular] || 'bench-press';
    const fallbackIll = illustrationUrl || groupIllustrationMap[ej.grupoMuscular] || './icons/ejercicios/ej-press-banca.jpg';
    return {
      illustrationUrl: fallbackIll,
      startImgUrl: `./icons/gifs/${slug}-start.gif`,
      endImgUrl: `./icons/gifs/${slug}-end.gif`,
      gifUrl: `./icons/gifs/${slug}.gif`
    };
  };

  // Lista base de ejercicios de activación sugeridos (vinculados al catálogo)
  Engine.EJERCICIOS_ACTIVACION_BASE = [
    { id: 'ej-act-foam-roller', nombre: 'Liberación Miofascial con Foam Roller', prescripcion: '10 pasadas', foco: 'Fascia y tejido muscular' },
    { id: 'ej-act-gato-camello', nombre: 'Gato - Camello (Cat-Cow)', prescripcion: '2 × 10 reps', foco: 'Movilidad columna y pelvis' },
    { id: 'ej-act-rotacion-toracica', nombre: 'Rotación Torácica en Cuadrupedia', prescripcion: '2 × 8 por lado', foco: 'Apertura torácica' },
    { id: 'ej-act-deadbug', nombre: 'Deadbug / Bicho Muerto', prescripcion: '2 × 10 alternadas', foco: 'Estabilidad core anti-extensión' },
    { id: 'ej-act-birddog', nombre: 'Bird-Dog / Perro de Muestra', prescripcion: '2 × 10 por lado', foco: 'Control lumbopélvico' }
  ];

  // ==========================================
  // 3. FÓRMULAS DE 1RM Y VOLUMEN DE CARGA
  // ==========================================

  /**
   * Cálculo de 1RM estimado (Repetición Máxima).
   * - Epley: peso * (1 + reps / 30)
   * - Brzycki: peso * (36 / (37 - reps))
   */
  Engine.compute1RM = function (pesoKg, reps, formula = 'epley') {
    const p = Number(pesoKg) || 0;
    const r = Number(reps) || 0;

    if (p <= 0 || r <= 0) return 0;
    if (r === 1) return Math.round(p * 10) / 10;

    let rm = 0;
    if (formula === 'brzycki') {
      if (r >= 37) return Math.round(p * (1 + r / 30) * 10) / 10;
      rm = p * (36 / (37 - r));
    } else {
      rm = p * (1 + r / 30);
    }
    return Math.round(rm * 10) / 10;
  };

  /**
   * Volumen de carga de una serie (peso × repeticiones).
   */
  Engine.computeVolumenSerie = function (serie) {
    if (!serie || serie.deleted) return 0;
    const peso = Number(serie.pesoKg) || 0;
    const reps = Number(serie.reps) || 0;
    return Math.round(peso * reps * 100) / 100;
  };

  /**
   * Volumen total de un entrenamiento sumando todas sus series activas.
   */
  Engine.computeVolumenEntrenamiento = function (series, entrenamientoId) {
    if (!Array.isArray(series)) return 0;
    const filtradas = series.filter(s => s.entrenamientoId === entrenamientoId && !s.deleted);
    const total = filtradas.reduce((acc, s) => acc + Engine.computeVolumenSerie(s), 0);
    return Math.round(total * 10) / 10;
  };

  /**
   * Agrupa el volumen semanal por grupo muscular entre dos fechas ISO locales.
   */
  Engine.computeVolumenSemanalPorMusculo = function (state, fechaInicio, fechaFin) {
    const resultado = {
      pecho: 0,
      espalda: 0,
      piernas: 0,
      hombros: 0,
      brazos: 0,
      core: 0,
      total: 0
    };

    if (!state || !Array.isArray(state.entrenamientos) || !Array.isArray(state.series)) {
      return resultado;
    }

    const mapaEjercicios = new Map();
    (state.ejercicios || Engine.CATALOGO_EJERCICIOS).forEach(ej => {
      mapaEjercicios.set(ej.id, ej.grupoMuscular || 'core');
    });

    const entrenamientosRango = new Set(
      state.entrenamientos
        .filter(t => !t.deleted && t.fecha >= fechaInicio && t.fecha <= fechaFin)
        .map(t => t.id)
    );

    (state.series || []).forEach(serie => {
      if (serie.deleted) return;
      if (!entrenamientosRango.has(serie.entrenamientoId)) return;

      const grupo = mapaEjercicios.get(serie.ejercicioId) || 'core';
      const vol = Engine.computeVolumenSerie(serie);

      if (Object.prototype.hasOwnProperty.call(resultado, grupo)) {
        resultado[grupo] = Math.round((resultado[grupo] + vol) * 10) / 10;
      }
      resultado.total = Math.round((resultado.total + vol) * 10) / 10;
    });

    return resultado;
  };

  // ==========================================
  // 4. RÉCORDS PERSONALES (PRs) Y CURVA EVOLUTIVA
  // ==========================================

  /**
   * Computa los récords personales (PR de peso absoluto y PR de 1RM estimado)
   * para cada ejercicio que tenga series activas.
   */
  Engine.computePRs = function (state) {
    const prs = {};

    if (!state || !Array.isArray(state.series)) return prs;

    const mapaEntrenamientos = new Map();
    (state.entrenamientos || []).forEach(t => {
      mapaEntrenamientos.set(t.id, t);
    });

    state.series.forEach(serie => {
      if (serie.deleted || !serie.completada) return;
      const peso = Number(serie.pesoKg) || 0;
      const reps = Number(serie.reps) || 0;
      if (peso <= 0 || reps <= 0) return;

      const ejId = serie.ejercicioId;
      const ent = mapaEntrenamientos.get(serie.entrenamientoId);
      const fecha = serie.fecha || (ent ? ent.fecha : Engine.todayISO());
      const rm = Engine.compute1RM(peso, reps);

      if (!prs[ejId]) {
        prs[ejId] = {
          maxPeso: { pesoKg: peso, reps, fecha, serieId: serie.id },
          max1RM: { rm, pesoKg: peso, reps, fecha, serieId: serie.id }
        };
      } else {
        if (peso > prs[ejId].maxPeso.pesoKg) {
          prs[ejId].maxPeso = { pesoKg: peso, reps, fecha, serieId: serie.id };
        }
        if (rm > prs[ejId].max1RM.rm) {
          prs[ejId].max1RM = { rm, pesoKg: peso, reps, fecha, serieId: serie.id };
        }
      }
    });

    return prs;
  };

  /**
   * Comprueba si una nueva serie rompe el récord personal previo.
   */
  Engine.checkIfNewPR = function (state, ejercicioId, pesoKg, reps) {
    const peso = Number(pesoKg) || 0;
    const r = Number(reps) || 0;
    const nuevoRM = Engine.compute1RM(peso, r);
    const prs = Engine.computePRs(state);
    const actual = prs[ejercicioId];

    if (!actual) {
      return {
        isNewWeightPR: peso > 0,
        isNew1RMPR: nuevoRM > 0,
        previous1RM: 0,
        new1RM: nuevoRM,
        previousWeight: 0,
        newWeight: peso
      };
    }

    return {
      isNewWeightPR: peso > actual.maxPeso.pesoKg,
      isNew1RMPR: nuevoRM > actual.max1RM.rm,
      previous1RM: actual.max1RM.rm,
      new1RM: nuevoRM,
      previousWeight: actual.maxPeso.pesoKg,
      newWeight: peso
    };
  };

  /**
   * Obtiene la última serie registrada para un ejercicio dado ("El Fantasma").
   */
  Engine.getUltimaSerieEjercicio = function (state, ejercicioId) {
    if (!state || !Array.isArray(state.series)) return null;
    const seriesEj = state.series
      .filter(s => s.ejercicioId === ejercicioId && !s.deleted && s.completada)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    return seriesEj[0] || null;
  };

  /**
   * Construye los puntos de evolución histórica cruzando 1RM máximo del día con Estrés/Energía.
   */
  Engine.computeEvolucionHistorica = function (state, ejercicioId = null) {
    if (!state) return [];
    const mapaFechas = new Map();

    const mapaEnt = new Map();
    (state.entrenamientos || []).forEach(t => {
      if (!t.deleted) mapaEnt.set(t.id, t.fecha);
    });

    (state.series || []).forEach(s => {
      if (s.deleted || !s.completada) return;
      if (ejercicioId && s.ejercicioId !== ejercicioId) return;
      const fecha = s.fecha || mapaEnt.get(s.entrenamientoId) || Engine.todayISO();
      const rm = Engine.compute1RM(s.pesoKg, s.reps);
      const actual = mapaFechas.get(fecha);
      if (!actual || rm > actual.max1RM) {
        mapaFechas.set(fecha, {
          fecha,
          max1RM: rm,
          pesoKg: s.pesoKg,
          reps: s.reps,
          estres: 3,
          energia: 3
        });
      }
    });

    (state.readinessLogs || []).forEach(r => {
      if (r.deleted) return;
      const item = mapaFechas.get(r.fecha);
      if (item) {
        item.estres = r.estres;
        item.energia = r.energia;
      } else {
        mapaFechas.set(r.fecha, {
          fecha: r.fecha,
          max1RM: 0,
          pesoKg: 0,
          reps: 0,
          estres: r.estres,
          energia: r.energia
        });
      }
    });

    return Array.from(mapaFechas.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  };

  // ==========================================
  // 5. MUTACIONES PURAS DEL ESTADO
  // ==========================================

  /**
   * Actualiza los datos físicos, horarios y días de asistencia del perfil del alumno.
   */
  Engine.actualizarPerfilFisico = function (state, datos) {
    const ahora = Date.now();
    return {
      ...state,
      perfil: {
        ...(state.perfil || {}),
        ...datos,
        completado: true,
        updatedAt: ahora
      },
      updatedAt: ahora
    };
  };

  /**
   * Actualiza la identidad visual del perfil (foto y color del avatar) sin tocar la ficha física
   * ni marcarla como completada. `avatar` es un data URL ya comprimido o '' para quitar la foto.
   */
  Engine.actualizarPerfilVisual = function (state, datos) {
    const ahora = Date.now();
    const patch = {};
    if (datos && typeof datos.avatar === 'string') patch.avatar = datos.avatar;
    if (datos && typeof datos.avatarColor === 'string') patch.avatarColor = datos.avatarColor;
    return {
      ...state,
      perfil: { ...(state.perfil || {}), ...patch, updatedAt: ahora },
      updatedAt: ahora
    };
  };

  /** Iniciales para el avatar sin foto: "Juan Pérez" -> "JP", "juan" -> "JU". */
  Engine.inicialesDe = function (nombre) {
    const limpio = String(nombre || '').replace(/\([^)]*\)/g, ' ').trim();
    const partes = limpio.split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  };

  /**
   * Registra un Check-in de Salud Física y Psicológica (Readiness Diario).
   */
  Engine.registrarReadiness = function (state, data) {
    const ahora = Date.now();
    const fecha = data.fecha || Engine.todayISO();
    const prevLogs = (state.readinessLogs || []).filter(r => !(r.fecha === fecha && !r.deleted));
    const nuevoLog = {
      id: Engine.generateId('rd'),
      fecha: fecha,
      hora: data.hora || Engine.timeNow(),
      estadoGeneral: data.estadoGeneral || '',
      energia: Number(data.energia) || 3,
      estres: Number(data.estres) || 3,
      sueno: Number(data.sueno) || 3,
      alimentacion: Number(data.alimentacion) || 3,
      dolorArticular: Boolean(data.dolorArticular || (data.zonaDolor && data.zonaDolor.trim().length > 0)),
      zonaDolor: data.zonaDolor || '',
      observacionAlumno: data.observacionAlumno || '',
      deleted: false,
      updatedAt: ahora
    };

    return {
      ...state,
      readinessLogs: [nuevoLog, ...prevLogs],
      updatedAt: ahora
    };
  };

  /**
   * Soft delete de un registro psicofísico (Readiness).
   */
  Engine.borrarReadiness = function (state, logId) {
    const ahora = Date.now();
    return {
      ...state,
      readinessLogs: (state.readinessLogs || []).map(r => (
        r.id === logId ? { ...r, deleted: true, updatedAt: ahora } : r
      )),
      updatedAt: ahora
    };
  };

  /**
   * Obtiene el check-in de asistencia al gimnasio del día (o null si no se registró).
   */
  Engine.getCheckinGymHoy = function (state, fechaISO = Engine.todayISO()) {
    if (!state) return null;
    const reg = (state.checkinsGym || []).find(c => !c.deleted && c.fecha === fechaISO);
    if (reg) return reg;
    const trHoy = (state.entrenamientos || []).find(
      t => !t.deleted && t.fecha === fechaISO && t.checkinRealizado
    );
    return trHoy
      ? { id: `chk-${trHoy.id}`, fecha: fechaISO, horaLlegada: trHoy.horaLlegada || trHoy.inicio, entrenamientoId: trHoy.id, presente: true }
      : null;
  };

  /**
   * Registra que el alumno fue hoy al gimnasio ("Check-in de asistencia")
   * e inicia la sesión guiada si aún no hay una abierta.
   */
  Engine.registrarCheckinGym = function (state, opts = {}) {
    const ahora = Date.now();
    const fecha = opts.fecha || Engine.todayISO();
    const horaLlegada = opts.hora || Engine.timeNow();

    let next = state;
    if (!next.entrenamientoActivoId) {
      next = Engine.iniciarEntrenamiento(next, opts.rutinaId || null, fecha, {
        pasoInicial: opts.pasoInicial || 'psicofisico'
      });
    }

    const trId = next.entrenamientoActivoId;
    const entrenamientos = (next.entrenamientos || []).map(t =>
      t.id === trId
        ? {
            ...t,
            checkinRealizado: true,
            horaLlegada: t.horaLlegada || horaLlegada,
            modulosConfig: {
              ...(t.modulosConfig || {}),
              pasoActual: opts.pasoInicial || (t.modulosConfig && t.modulosConfig.pasoActual) || 'psicofisico'
            },
            updatedAt: ahora
          }
        : t
    );

    const prevCheckins = (next.checkinsGym || []).filter(c => !(c.fecha === fecha && !c.deleted));
    const nuevoCheckin = {
      id: Engine.generateId('chk'),
      fecha,
      horaLlegada,
      entrenamientoId: trId,
      presente: true,
      deleted: false,
      updatedAt: ahora
    };

    return {
      ...next,
      entrenamientos,
      checkinsGym: [nuevoCheckin, ...prevCheckins],
      updatedAt: ahora
    };
  };

  /**
   * Inicia un nuevo entrenamiento vinculado a una rutina (o libre).
   */
  Engine.iniciarEntrenamiento = function (state, rutinaId = null, fecha = Engine.todayISO(), opts = {}) {
    const nuevoId = Engine.generateId('tr');
    const ahora = Date.now();
    const rutina = rutinaId ? (state.rutinas || []).find(r => r.id === rutinaId && !r.deleted) : null;
    const rutBloques = (rutina && rutina.bloquesConfig) || {};

    const nuevoEntrenamiento = {
      id: nuevoId,
      fecha: fecha,
      rutinaId: rutinaId,
      inicio: Engine.timeNow(),
      horaLlegada: Engine.timeNow(),
      checkinRealizado: opts.checkinRealizado !== undefined ? Boolean(opts.checkinRealizado) : false,
      fin: null,
      notas: '',
      modulosConfig: {
        pasoActual: opts.pasoInicial || (rutinaId ? 'A' : 'psicofisico'),
        activacionActiva: opts.activacionActiva !== undefined ? Boolean(opts.activacionActiva) : true,
        movilidadActiva: opts.movilidadActiva !== undefined ? Boolean(opts.movilidadActiva) : true,
        A: {
          modalidad: (rutBloques.A && rutBloques.A.modalidad) || 'horizontal',
          nombre: (rutBloques.A && rutBloques.A.nombre) || 'Bloque A',
          rondasObjetivo: (rutBloques.A && rutBloques.A.rondasObjetivo) || 3
        },
        B: {
          modalidad: (rutBloques.B && rutBloques.B.modalidad) || 'horizontal',
          nombre: (rutBloques.B && rutBloques.B.nombre) || 'Bloque B',
          rondasObjetivo: (rutBloques.B && rutBloques.B.rondasObjetivo) || 3
        },
        cierreActivo: true
      },
      completado: false,
      deleted: false,
      updatedAt: ahora
    };

    return {
      ...state,
      entrenamientos: [nuevoEntrenamiento, ...(state.entrenamientos || [])],
      entrenamientoActivoId: nuevoId,
      updatedAt: ahora
    };
  };

  /**
   * Actualiza la configuración modular de la sesión activa (paso actual, modulación Vertical/Horizontal de Bloque A/B, etc.).
   */
  Engine.setConfigBloqueSesion = function (state, entrenamientoId, patch) {
    const ahora = Date.now();
    const entrenamientos = (state.entrenamientos || []).map(t => {
      if (t.id !== entrenamientoId) return t;
      const prevCfg = t.modulosConfig || {
        pasoActual: 'psicofisico',
        activacionActiva: true,
        movilidadActiva: true,
        A: { modalidad: 'horizontal', nombre: 'Bloque A', rondasObjetivo: 3 },
        B: { modalidad: 'horizontal', nombre: 'Bloque B', rondasObjetivo: 3 },
        cierreActivo: true
      };
      const nextCfg = {
        ...prevCfg,
        ...patch,
        A: patch.A ? { ...(prevCfg.A || {}), ...patch.A } : prevCfg.A,
        B: patch.B ? { ...(prevCfg.B || {}), ...patch.B } : prevCfg.B
      };
      return {
        ...t,
        modulosConfig: nextCfg,
        updatedAt: ahora
      };
    });
    return { ...state, entrenamientos, updatedAt: ahora };
  };

  /**
   * Guarda o actualiza una serie dentro de un entrenamiento.
   */
  Engine.guardarSerie = function (state, serieData) {
    const ahora = Date.now();
    const series = [...(state.series || [])];

    let nuevaSerie;
    if (serieData.id) {
      const index = series.findIndex(s => s.id === serieData.id);
      if (index !== -1) {
        nuevaSerie = {
          ...series[index],
          ...serieData,
          deleted: false,
          updatedAt: ahora
        };
        series[index] = nuevaSerie;
      }
    }

    if (!nuevaSerie) {
      const id = serieData.id || Engine.generateId('sr');
      nuevaSerie = {
        id: id,
        entrenamientoId: serieData.entrenamientoId,
        ejercicioId: serieData.ejercicioId,
        fecha: serieData.fecha || Engine.todayISO(),
        numeroSerie: serieData.numeroSerie || 1,
        tipo: serieData.tipo || 'efectiva',
        pesoKg: Number(serieData.pesoKg) || 0,
        reps: Number(serieData.reps) || 0,
        rir: serieData.rir !== undefined ? Number(serieData.rir) : 2,
        rpe: serieData.rpe !== undefined ? Number(serieData.rpe) : 8,
        completada: serieData.completada !== undefined ? serieData.completada : true,
        deleted: false,
        updatedAt: ahora
      };
      series.push(nuevaSerie);
    }

    return {
      ...state,
      series: series,
      updatedAt: ahora
    };
  };

  /**
   * Soft Delete de una serie.
   */
  Engine.borrarSerie = function (state, serieId) {
    const ahora = Date.now();
    const series = (state.series || []).map(s =>
      s.id === serieId ? { ...s, deleted: true, updatedAt: ahora } : s
    );
    return { ...state, series, updatedAt: ahora };
  };

  /**
   * Restaura una serie borrada con soft delete (para "Deshacer").
   */
  Engine.restaurarSerie = function (state, serieId) {
    const ahora = Date.now();
    const series = (state.series || []).map(s =>
      s.id === serieId ? { ...s, deleted: false, updatedAt: ahora } : s
    );
    return { ...state, series, updatedAt: ahora };
  };

  /**
   * Finaliza el entrenamiento activo.
   */
  Engine.finalizarEntrenamiento = function (state, entrenamientoId, notas = '') {
    const ahora = Date.now();
    const entrenamientos = (state.entrenamientos || []).map(t => {
      if (t.id === entrenamientoId) {
        return {
          ...t,
          fin: Engine.timeNow(),
          notas: notas || t.notas || '',
          completado: true,
          updatedAt: ahora
        };
      }
      return t;
    });

    return {
      ...state,
      entrenamientos,
      entrenamientoActivoId: state.entrenamientoActivoId === entrenamientoId ? null : state.entrenamientoActivoId,
      updatedAt: ahora
    };
  };

  /**
   * Crea una nueva rutina seleccionando días, horarios y ejercicios del catálogo.
   */
  Engine.crearRutina = function (state, rutinaData) {
    const ahora = Date.now();
    const nuevaRutina = {
      id: rutinaData.id || Engine.generateId('rt'),
      nombre: rutinaData.nombre || 'Mi Rutina',
      dias: Array.isArray(rutinaData.dias) && rutinaData.dias.length > 0 ? rutinaData.dias : ['Lunes', 'Miércoles', 'Viernes'],
      horario: rutinaData.horario || '19:00',
      creadaPor: rutinaData.creadaPor || 'Alumno',
      ejercicios: Array.isArray(rutinaData.ejercicios) ? rutinaData.ejercicios : [],
      deleted: false,
      updatedAt: ahora
    };

    return {
      ...state,
      rutinas: [...(state.rutinas || []), nuevaRutina],
      updatedAt: ahora
    };
  };

  /**
   * Actualiza una rutina existente (permite al alumno o al profesor agregar/quitar ejercicios o cambiar días/horarios).
   */
  Engine.actualizarRutina = function (state, rutinaData) {
    const ahora = Date.now();
    const rutinas = (state.rutinas || []).map(r =>
      r.id === rutinaData.id ? { ...r, ...rutinaData, updatedAt: ahora } : r
    );
    return { ...state, rutinas, updatedAt: ahora };
  };

  /**
   * Agrega un ejercicio del catálogo a una rutina existente.
   */
  Engine.agregarEjercicioARutina = function (state, rutinaId, itemEjercicio) {
    const ahora = Date.now();
    const catalogo = (state.ejercicios || []).concat(Engine.CATALOGO_EJERCICIOS || []);
    const matchedEj = catalogo.find(e => e.id === itemEjercicio.ejercicioId);
    const rutinas = (state.rutinas || []).map(r => {
      if (r.id !== rutinaId) return r;
      const ejerciciosActuales = Array.isArray(r.ejercicios) ? [...r.ejercicios] : [];
      ejerciciosActuales.push({
        ejercicioId: itemEjercicio.ejercicioId,
        nombre: itemEjercicio.nombre || (matchedEj ? matchedEj.nombre : ''),
        bloque: itemEjercicio.bloque || 'A',
        seriesObjetivo: Number(itemEjercicio.seriesObjetivo) || 3,
        repsObjetivo: itemEjercicio.repsObjetivo || '8-10',
        descansoSegundos: Number(itemEjercicio.descansoSegundos) || 90,
        notaProfesor: itemEjercicio.notaProfesor || ''
      });
      return { ...r, ejercicios: ejerciciosActuales, updatedAt: ahora };
    });
    return { ...state, rutinas, updatedAt: ahora };
  };

  /**
   * Obtiene el entrenamiento activo actual o null si no hay sesión en curso.
   */
  Engine.getEntrenamientoActivo = function (state) {
    if (!state) return null;
    if (state.entrenamientoActivoId) {
      return (state.entrenamientos || []).find(t => t.id === state.entrenamientoActivoId && !t.deleted) || null;
    }
    return (state.entrenamientos || []).find(t => !t.deleted && !t.completado) || null;
  };

  /**
   * Guarda los ejercicios de la sesión de hoy como una nueva rutina en "Mis Rutinas".
   */
  Engine.guardarSesionComoRutina = function (state, nombreRutina, dias = ['Lunes', 'Miércoles', 'Viernes']) {
    const ahora = Date.now();
    const entActivo = Engine.getEntrenamientoActivo(state);
    if (!entActivo) return state;

    const seriesEntreno = (state.series || []).filter(s => s.entrenamientoId === entActivo.id && !s.deleted);
    const sesionHoy = (state.ejerciciosSesionHoy || []).filter(e => (!e.entrenamientoId || e.entrenamientoId === entActivo.id) && !e.deleted);

    const ejIds = [];
    sesionHoy.forEach(e => {
      if (!ejIds.includes(e.ejercicioId)) ejIds.push(e.ejercicioId);
    });
    seriesEntreno.forEach(s => {
      if (!ejIds.includes(s.ejercicioId)) ejIds.push(s.ejercicioId);
    });

    const catalogo = (state.ejercicios || []).concat(Engine.CATALOGO_EJERCICIOS || []);
    const ejerciciosRutina = ejIds.map(id => {
      const ej = catalogo.find(c => c.id === id);
      const sesionItem = sesionHoy.find(s => s.ejercicioId === id);
      return {
        ejercicioId: id,
        nombre: ej ? ej.nombre : id,
        bloque: (sesionItem && sesionItem.bloque) || (sesionItem && sesionItem.segmento === 'activacion' ? 'activacion' : sesionItem && sesionItem.segmento === 'movilidad' ? 'movilidad' : 'A'),
        seriesObjetivo: sesionItem ? (sesionItem.seriesObjetivo || 3) : 3,
        repsObjetivo: sesionItem ? (sesionItem.repsObjetivo || '8-10') : '8-10',
        descansoSegundos: ej ? (ej.descansoSugerido || 90) : 90,
        notaProfesor: ''
      };
    });

    const cfg = entActivo.modulosConfig || null;
    const nuevaRutina = {
      id: Engine.generateId('rt'),
      nombre: nombreRutina || `Rutina ${Engine.todayISO()}`,
      dias: dias,
      horario: '19:00',
      creadaPor: 'Alumno',
      bloquesConfig: cfg ? { A: cfg.A, B: cfg.B } : null,
      ejercicios: ejerciciosRutina,
      deleted: false,
      updatedAt: ahora
    };

    const rutinas = [...(state.rutinas || []), nuevaRutina];
    return { ...state, rutinas, updatedAt: ahora };
  };

  /**
   * Quita un ejercicio de una rutina por su índice.
   */
  Engine.quitarEjercicioDeRutina = function (state, rutinaId, indexEjercicio) {
    const ahora = Date.now();
    const rutinas = (state.rutinas || []).map(r => {
      if (r.id !== rutinaId) return r;
      const nuevos = (r.ejercicios || []).filter((_, idx) => idx !== Number(indexEjercicio));
      return { ...r, ejercicios: nuevos, updatedAt: ahora };
    });
    return { ...state, rutinas, updatedAt: ahora };
  };

  /**
   * Soft delete de una rutina.
   */
  Engine.borrarRutina = function (state, rutinaId) {
    const ahora = Date.now();
    const rutinas = (state.rutinas || []).map(r =>
      r.id === rutinaId ? { ...r, deleted: true, updatedAt: ahora } : r
    );
    return { ...state, rutinas, updatedAt: ahora };
  };

  /**
   * Crea un ejercicio personalizado en el catálogo del usuario.
   */
  Engine.crearEjercicio = function (state, ejData) {
    const ahora = Date.now();
    const id = ejData.id || Engine.generateId('ej');
    const nuevoEjercicio = {
      id: id,
      nombre: String(ejData.nombre || 'Nuevo Ejercicio').trim(),
      grupoMuscular: ejData.grupoMuscular || 'pecho',
      equipo: ejData.equipo || 'barra',
      seriesSugeridas: Number(ejData.seriesSugeridas) || 3,
      repsSugeridas: ejData.repsSugeridas || '8-12',
      descansoSugerido: Number(ejData.descansoSugerido) || 90,
      gifUrl: ejData.gifUrl || '',
      notas: ejData.notas || '',
      esPersonalizado: true,
      orden: ejData.orden || 99,
      deleted: false,
      updatedAt: ahora
    };

    const existentes = state.ejercicios || [];
    const index = existentes.findIndex(e => e.id === id);
    const ejercicios = index !== -1
      ? existentes.map((e, i) => (i === index ? nuevoEjercicio : e))
      : [...existentes, nuevoEjercicio];

    return { ...state, ejercicios, lastCreatedEjercicioId: id, updatedAt: ahora };
  };

  /**
   * Agrega una observación clínica/deportiva (del alumno o del profesor).
   */
  Engine.agregarObservacion = function (state, obsData) {
    const ahora = Date.now();
    const nuevaObs = {
      id: Engine.generateId('ob'),
      fecha: obsData.fecha || Engine.todayISO(),
      hora: Engine.timeNow(),
      autor: obsData.autor || 'Profesor',
      rolAutor: obsData.rolAutor || 'profesor',
      categoria: obsData.categoria || 'Ajuste Técnico',
      texto: obsData.texto || '',
      deleted: false,
      updatedAt: ahora
    };

    return {
      ...state,
      observaciones: [nuevaObs, ...(state.observaciones || [])],
      updatedAt: ahora
    };
  };

  /**
   * Soft delete de una observación.
   */
  Engine.borrarObservacion = function (state, obsId) {
    const ahora = Date.now();
    const observaciones = (state.observaciones || []).map(o =>
      o.id === obsId ? { ...o, deleted: true, updatedAt: ahora } : o
    );
    return { ...state, observaciones, updatedAt: ahora };
  };

  /**
   * Agrega una foto a la bitácora visual con marca de agua de fecha, peso y autor.
   */
  Engine.agregarFoto = function (state, fotoData) {
    const ahora = Date.now();
    const nuevaFoto = {
      id: Engine.generateId('ph'),
      fecha: fotoData.fecha || Engine.todayISO(),
      hora: Engine.timeNow(),
      pesoKg: Number(fotoData.pesoKg) || (state.perfil ? state.perfil.pesoKg : 0) || 0,
      autor: fotoData.autor || 'Alumno',
      nota: fotoData.nota || '',
      dataUrl: fotoData.dataUrl || '',
      deleted: false,
      updatedAt: ahora
    };

    return {
      ...state,
      fotos: [nuevaFoto, ...(state.fotos || [])],
      updatedAt: ahora
    };
  };

  /**
   * Soft delete de una foto.
   */
  Engine.borrarFoto = function (state, fotoId) {
    const ahora = Date.now();
    const fotos = (state.fotos || []).map(f =>
      f.id === fotoId ? { ...f, deleted: true, updatedAt: ahora } : f
    );
    return { ...state, fotos, updatedAt: ahora };
  };

  // ==========================================
  // 6. ILUSTRACIÓN ANATÓMICA DUAL (FASE INICIAL Y FINAL CON MÚSCULO ACTIVO EN ROJO)
  // ==========================================

  /**
   * Genera una lámina anatómica en formato dual (Fase 1: Posición Inicial | Fase 2: Posición Final)
   * sobre lienzo claro, musculatura en escala de grises sombreada y el grupo muscular activo
   * resaltado en rojo anatómico (#d94838), tal como la imagen de referencia adjunta.
   */
  Engine.getMannequinSVG = function (ej) {
    if (!ej) return '';
    const tipo = ej.svgTipo || (ej.biomecanica && ej.biomecanica.svgTipo) || ej.id || ej.grupoMuscular || 'general';
    const musculoLabel = ej.musculoActivo || (ej.biomecanica && ej.biomecanica.focoPrincipal) || (ej.grupoMuscular || 'Músculo Objetivo').toUpperCase();

    const svgHeader = `
      <svg viewBox="0 0 540 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background: #ffffff; border-radius: 10px; font-family: 'Inter', system-ui, sans-serif;">
        <defs>
          <linearGradient id="grad-skin" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#e2e8f0" />
            <stop offset="50%" stop-color="#cbd5e1" />
            <stop offset="100%" stop-color="#94a3b8" />
          </linearGradient>
          <linearGradient id="grad-dark-grey" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#64748b" />
            <stop offset="100%" stop-color="#334155" />
          </linearGradient>
          <linearGradient id="grad-muscle-red" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ef4444" />
            <stop offset="55%" stop-color="#d94838" />
            <stop offset="100%" stop-color="#991b1b" />
          </linearGradient>
          <marker id="arrow-anat" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#d94838" />
          </marker>
        </defs>

        <!-- Etiquetas superiores de Fase 1 y Fase 2 -->
        <rect x="14" y="10" width="242" height="232" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" />
        <rect x="284" y="10" width="242" height="232" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" />
        <text x="26" y="28" fill="#475569" font-size="10" font-weight="800" letter-spacing="0.4">1. POSICIÓN INICIAL (EXCÉNTRICA)</text>
        <text x="296" y="28" fill="#b91c1c" font-size="10" font-weight="800" letter-spacing="0.4">2. POSICIÓN FINAL (CONTRACCIÓN)</text>
        <!-- Línea de suelo en ambas vistas -->
        <line x1="26" y1="220" x2="244" y2="220" stroke="#cbd5e1" stroke-width="2" />
        <line x1="296" y1="220" x2="514" y2="220" stroke="#cbd5e1" stroke-width="2" />
    `;

    let body = '';

    // 1. GATO - CAMELLO / CUADRUPEDIA / ROTACIÓN TORÁCICA / BIRD-DOG (Idéntico a la foto de referencia)
    if (tipo === 'gato-camello' || String(ej.id).includes('gato') || String(ej.id).includes('rotacion') || String(ej.id).includes('birddog')) {
      body = `
        <!-- FASE 1: Extensión espinal (Vaca) -->
        <!-- Piernas en cuadrupedia -->
        <path d="M 48 218 L 86 214 L 84 138 Q 84 114 68 122 L 66 206 Z" fill="url(#grad-skin)" stroke="#64748b" stroke-width="1.2" />
        <!-- Glúteo / Short -->
        <path d="M 66 125 Q 64 98 92 104 L 106 136 L 76 142 Z" fill="url(#grad-dark-grey)" />
        <!-- Abdomen y oblicuos en rojo anatómico (estiramiento activo) -->
        <path d="M 102 114 Q 134 128 162 112 L 158 140 Q 130 146 98 136 Z" fill="url(#grad-muscle-red)" stroke="#991b1b" stroke-width="1" />
        <line x1="112" y1="125" x2="152" y2="128" stroke="#fca5a5" stroke-width="0.9" />
        <line x1="110" y1="132" x2="150" y2="135" stroke="#fca5a5" stroke-width="0.9" />
        <!-- Línea espinal dorsal en rojo -->
        <path d="M 92 106 Q 132 124 174 102" fill="none" stroke="#b91c1c" stroke-width="4" stroke-linecap="round" />
        <!-- Tórax y hombro -->
        <path d="M 156 104 Q 180 98 188 120 L 166 140 L 154 128 Z" fill="url(#grad-dark-grey)" />
        <!-- Brazo de apoyo -->
        <path d="M 172 118 L 178 216 L 202 220 L 186 212 L 186 118 Z" fill="url(#grad-skin)" stroke="#64748b" stroke-width="1.2" />
        <!-- Cuello, cabeza y coleta -->
        <path d="M 182 108 L 198 100 L 194 116 L 180 120 Z" fill="url(#grad-skin)" />
        <circle cx="206" cy="100" r="14" fill="url(#grad-skin)" stroke="#64748b" stroke-width="1.2" />
        <path d="M 195 90 Q 208 82 220 96 Q 214 102 196 96 Z" fill="#334155" />
        <path d="M 195 88 Q 186 64 166 76 Q 180 84 192 92 Z" fill="#475569" />
        <path d="M 132 108 L 132 86" stroke="#d94838" stroke-width="1.8" stroke-dasharray="3,2" marker-end="url(#arrow-anat)" />

        <!-- FASE 2: Flexión espinal profunda (Gato) con arco dorsal y contracción abdominal en rojo -->
        <!-- Piernas en cuadrupedia -->
        <path d="M 318 218 L 356 214 L 356 140 Q 356 116 338 124 L 336 206 Z" fill="url(#grad-skin)" stroke="#64748b" stroke-width="1.2" />
        <!-- Glúteo / Short en retroversión -->
        <path d="M 338 128 Q 338 100 364 96 L 376 130 L 346 142 Z" fill="url(#grad-dark-grey)" />
        <!-- Pared abdominal y erectores contraídos en rojo intenso -->
        <path d="M 364 96 Q 402 72 436 94 L 426 126 Q 398 106 372 130 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1.2" />
        <line x1="376" y1="104" x2="422" y2="102" stroke="#fecaca" stroke-width="1" />
        <line x1="374" y1="113" x2="420" y2="112" stroke="#fecaca" stroke-width="1" />
        <!-- Arco dorsal superior en rojo -->
        <path d="M 362 94 Q 402 68 444 94" fill="none" stroke="#991b1b" stroke-width="4.5" stroke-linecap="round" />
        <!-- Tórax y deltoides -->
        <path d="M 426 92 Q 448 92 454 116 L 432 132 L 420 116 Z" fill="url(#grad-dark-grey)" />
        <!-- Brazo de apoyo vertical firme -->
        <path d="M 440 114 L 446 216 L 470 220 L 454 212 L 454 114 Z" fill="url(#grad-skin)" stroke="#64748b" stroke-width="1.2" />
        <!-- Cabeza relajada mirando hacia abajo y coleta -->
        <circle cx="470" cy="118" r="13" fill="url(#grad-skin)" stroke="#64748b" stroke-width="1.2" />
        <path d="M 460 108 Q 474 104 482 118 Q 472 122 460 114 Z" fill="#334155" />
        <path d="M 462 106 Q 458 82 438 88 Q 450 96 458 108 Z" fill="#475569" />
        <path d="M 402 128 L 402 82" stroke="#d94838" stroke-width="2" stroke-dasharray="3,2" marker-end="url(#arrow-anat)" />
      `;
    }
    // 2. PUENTE DE GLÚTEO / HIP THRUST (Unilateral o Bilateral)
    else if (tipo === 'puente-gluteo' || String(ej.id).includes('gluteo') || String(ej.id).includes('thrust')) {
      body = `
        <!-- FASE 1: Pelvis descendida próxima al suelo -->
        <circle cx="54" cy="202" r="12" fill="url(#grad-skin)" stroke="#64748b" stroke-width="1.2" />
        <path d="M 66 204 Q 100 206 130 208 L 132 192 Q 100 190 68 192 Z" fill="url(#grad-dark-grey)" />
        <!-- Glúteo e isquios en rojo (pre-estiramiento) -->
        <path d="M 126 192 Q 146 190 156 206 L 130 214 Z" fill="url(#grad-muscle-red)" stroke="#991b1b" />
        <!-- Muslo y pierna de apoyo flexionada -->
        <path d="M 148 198 L 184 152 L 194 158 L 156 208 Z" fill="url(#grad-skin)" stroke="#64748b" stroke-width="1.2" />
        <path d="M 184 152 L 192 218 L 210 218 L 196 210 L 194 154 Z" fill="url(#grad-skin)" stroke="#64748b" stroke-width="1.2" />

        <!-- FASE 2: Extensión completa de cadera (Glúteo e Isquiotibiales en rojo intenso) -->
        <circle cx="324" cy="198" r="12" fill="url(#grad-skin)" stroke="#64748b" stroke-width="1.2" />
        <path d="M 336 196 L 404 154 L 412 168 L 342 210 Z" fill="url(#grad-dark-grey)" />
        <!-- Glúteo Mayor + Isquiotibiales en contracción máxima (Rojo anatómico) -->
        <path d="M 398 152 Q 422 146 432 164 L 406 178 Q 394 170 398 152 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1.2" />
        <path d="M 424 152 L 464 156 L 460 170 L 420 168 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1" />
        <!-- Cuádriceps y tibia en gris anatómico -->
        <path d="M 424 144 L 466 150 L 464 158 L 420 154 Z" fill="url(#grad-skin)" stroke="#64748b" />
        <path d="M 460 150 L 466 218 L 484 218 L 470 210 L 470 152 Z" fill="url(#grad-skin)" stroke="#64748b" stroke-width="1.2" />
        <!-- Pierna libre proyectada (unilateral) -->
        <path d="M 424 148 L 488 106 L 494 114 L 430 156 Z" fill="url(#grad-skin)" stroke="#64748b" stroke-width="1" stroke-dasharray="3,2" />
        <path d="M 412 198 L 412 140" stroke="#d94838" stroke-width="2" stroke-dasharray="3,2" marker-end="url(#arrow-anat)" />
      `;
    }
    // 3. PECHO / PRESS DE BANCA / INCLINADO / FONDOS
    else if (ej.grupoMuscular === 'pecho' || tipo === 'press-banca') {
      body = `
        <!-- FASE 1: Barra al pecho (Estiramiento de Pectoral Mayor y Deltoides Anterior en rojo) -->
        <rect x="44" y="168" width="160" height="10" rx="3" fill="#64748b" />
        <line x1="68" y1="178" x2="68" y2="220" stroke="#475569" stroke-width="5" />
        <line x1="176" y1="178" x2="176" y2="220" stroke="#475569" stroke-width="5" />
        <circle cx="64" cy="154" r="11" fill="url(#grad-skin)" stroke="#64748b" />
        <!-- Torso con Pectoral Mayor en rojo anatómico -->
        <path d="M 78 152 Q 112 142 152 156 L 150 168 L 78 168 Z" fill="url(#grad-dark-grey)" />
        <path d="M 86 146 Q 112 138 128 152 L 122 164 L 86 162 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1.2" />
        <!-- Piernas apoyadas -->
        <path d="M 150 158 L 192 164 L 204 218 L 194 218 L 184 174 L 148 168 Z" fill="url(#grad-skin)" stroke="#64748b" />
        <!-- Brazo flexionado abajo y barra en esternón -->
        <path d="M 98 154 L 104 186 L 114 134" fill="none" stroke="url(#grad-muscle-red)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
        <line x1="82" y1="132" x2="146" y2="132" stroke="#1e293b" stroke-width="4" />
        <rect x="84" y="114" width="7" height="36" rx="2" fill="#334155" />
        <rect x="137" y="114" width="7" height="36" rx="2" fill="#334155" />

        <!-- FASE 2: Empuje completo (Contracción de Pectoral Mayor, Deltoides y Tríceps en rojo) -->
        <rect x="314" y="168" width="160" height="10" rx="3" fill="#64748b" />
        <line x1="338" y1="178" x2="338" y2="220" stroke="#475569" stroke-width="5" />
        <line x1="446" y1="178" x2="446" y2="220" stroke="#475569" stroke-width="5" />
        <circle cx="334" cy="154" r="11" fill="url(#grad-skin)" stroke="#64748b" />
        <path d="M 348 152 Q 382 142 422 156 L 420 168 L 348 168 Z" fill="url(#grad-dark-grey)" />
        <!-- Pectoral contraído en rojo intenso -->
        <path d="M 356 144 Q 380 134 396 150 L 392 164 L 356 162 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1.2" />
        <path d="M 420 158 L 462 164 L 474 218 L 464 218 L 454 174 L 418 168 Z" fill="url(#grad-skin)" stroke="#64748b" />
        <!-- Brazo extendido vertical con tríceps y deltoides en rojo -->
        <path d="M 372 150 L 378 82" fill="none" stroke="url(#grad-muscle-red)" stroke-width="9" stroke-linecap="round" />
        <line x1="346" y1="80" x2="410" y2="80" stroke="#1e293b" stroke-width="4" />
        <rect x="348" y="62" width="7" height="36" rx="2" fill="#334155" />
        <rect x="401" y="62" width="7" height="36" rx="2" fill="#334155" />
        <path d="M 418 134 L 418 82" stroke="#d94838" stroke-width="2" stroke-dasharray="3,2" marker-end="url(#arrow-anat)" />
      `;
    }
    // 4. ESPALDA / DOMINADAS / JALÓN / REMO
    else if (ej.grupoMuscular === 'espalda') {
      body = `
        <!-- FASE 1: Extensión escapular / Inicio de tracción -->
        <line x1="75" y1="44" x2="195" y2="44" stroke="#334155" stroke-width="5" stroke-linecap="round" />
        <circle cx="135" cy="96" r="12" fill="url(#grad-skin)" stroke="#64748b" />
        <!-- Torso de espaldas con Dorsal Ancho y Romboides en rojo -->
        <path d="M 108 112 L 162 112 L 150 176 L 120 176 Z" fill="url(#grad-dark-grey)" />
        <path d="M 110 116 L 132 122 L 124 168 L 114 156 Z" fill="url(#grad-muscle-red)" />
        <path d="M 160 116 L 138 122 L 146 168 L 156 156 Z" fill="url(#grad-muscle-red)" />
        <!-- Brazos extendidos arriba -->
        <path d="M 112 114 L 96 46" stroke="url(#grad-skin)" stroke-width="8" stroke-linecap="round" />
        <path d="M 158 114 L 174 46" stroke="url(#grad-skin)" stroke-width="8" stroke-linecap="round" />
        <path d="M 122 176 L 120 218 M 148 176 L 150 218" stroke="url(#grad-skin)" stroke-width="9" stroke-linecap="round" />

        <!-- FASE 2: Tracción completa (Dorsal Ancho, Trapecio Medio y Bíceps en rojo intenso) -->
        <line x1="345" y1="44" x2="465" y2="44" stroke="#334155" stroke-width="5" stroke-linecap="round" />
        <circle cx="405" cy="56" r="12" fill="url(#grad-skin)" stroke="#64748b" />
        <path d="M 374 72 L 436 72 L 420 142 L 390 142 Z" fill="url(#grad-dark-grey)" />
        <!-- Dorsal Ancho y Romboides contraídos en rojo -->
        <path d="M 376 74 L 403 80 L 394 134 L 380 120 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1" />
        <path d="M 434 74 L 407 80 L 416 134 L 430 120 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1" />
        <!-- Brazos en flexión traccionando codos abajo con bíceps en rojo -->
        <path d="M 376 78 L 356 96 L 368 46" fill="none" stroke="url(#grad-muscle-red)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M 434 78 L 454 96 L 442 46" fill="none" stroke="url(#grad-muscle-red)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M 392 142 L 390 212 M 418 142 L 420 212" stroke="url(#grad-skin)" stroke-width="9" stroke-linecap="round" />
        <path d="M 468 56 L 468 106" stroke="#d94838" stroke-width="2" stroke-dasharray="3,2" marker-end="url(#arrow-anat)" />
      `;
    }
    // 5. BISAGRA DE CADERA / PESO MUERTO RUMANO / KB SWING
    else if (tipo === 'peso-muerto' || String(ej.id).includes('peso-muerto') || String(ej.id).includes('swing')) {
      body = `
        <!-- FASE 1: Posición erguida inicial -->
        <circle cx="138" cy="56" r="12" fill="url(#grad-skin)" stroke="#64748b" />
        <path d="M 126 70 L 148 70 L 146 134 L 124 134 Z" fill="url(#grad-dark-grey)" />
        <!-- Glúteo e Isquiotibiales en rojo -->
        <path d="M 122 128 Q 112 142 124 154 L 138 154 L 138 128 Z" fill="url(#grad-muscle-red)" />
        <path d="M 124 150 L 126 184 L 142 184 L 142 148 Z" fill="url(#grad-muscle-red)" />
        <path d="M 128 184 L 130 218 M 138 184 L 140 218" stroke="url(#grad-skin)" stroke-width="8" stroke-linecap="round" />
        <path d="M 138 78 L 142 144" stroke="url(#grad-skin)" stroke-width="7" stroke-linecap="round" />
        <circle cx="144" cy="148" r="9" fill="#334155" />

        <!-- FASE 2: Bisagra de cadera (Isquiotibiales, Glúteos y Erectores en rojo intenso) -->
        <circle cx="446" cy="94" r="12" fill="url(#grad-skin)" stroke="#64748b" />
        <!-- Espalda neutra con erectores espinales en rojo -->
        <path d="M 366 130 L 432 98 L 438 114 L 374 146 Z" fill="url(#grad-dark-grey)" />
        <path d="M 368 128 L 430 98" stroke="#d94838" stroke-width="4" stroke-linecap="round" />
        <!-- Glúteo e Isquiotibiales estirados bajo tensión en rojo -->
        <path d="M 358 130 Q 344 144 360 158 L 378 154 L 374 132 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1.2" />
        <path d="M 362 154 L 378 186 L 392 182 L 378 148 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1" />
        <path d="M 382 182 L 384 218" stroke="url(#grad-skin)" stroke-width="9" stroke-linecap="round" />
        <!-- Brazo perpendicular al suelo sosteniendo carga pegada a tibias -->
        <path d="M 424 110 L 412 178" stroke="url(#grad-skin)" stroke-width="7" stroke-linecap="round" />
        <circle cx="412" cy="182" r="10" fill="#1e293b" stroke="#475569" stroke-width="2" />
        <path d="M 346 144 L 324 144" stroke="#d94838" stroke-width="2" stroke-dasharray="3,2" marker-end="url(#arrow-anat)" />
      `;
    }
    // 6. PIERNAS / SENTADILLA / PRENSA / COSACA / ESTOCADAS
    else if (ej.grupoMuscular === 'piernas' || tipo === 'sentadilla') {
      body = `
        <!-- FASE 1: Posición de pie inicial -->
        <circle cx="136" cy="54" r="12" fill="url(#grad-skin)" stroke="#64748b" />
        <path d="M 122 68 L 148 68 L 146 132 L 122 132 Z" fill="url(#grad-dark-grey)" />
        <!-- Cuádriceps y Glúteo en rojo -->
        <path d="M 122 132 L 146 132 L 144 176 L 124 176 Z" fill="url(#grad-muscle-red)" stroke="#991b1b" />
        <path d="M 128 176 L 128 218 M 140 176 L 140 218" stroke="url(#grad-skin)" stroke-width="8" stroke-linecap="round" />
        <line x1="100" y1="70" x2="172" y2="70" stroke="#334155" stroke-width="4" />

        <!-- FASE 2: Sentadilla Profunda (Cuádriceps y Glúteo Mayor en rojo anatómico) -->
        <circle cx="418" cy="86" r="12" fill="url(#grad-skin)" stroke="#64748b" />
        <path d="M 366 144 L 406 96 L 418 108 L 380 156 Z" fill="url(#grad-dark-grey)" />
        <!-- Glúteo Mayor en rojo -->
        <path d="M 358 144 Q 346 158 364 168 L 382 162 L 374 144 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1.2" />
        <!-- Cuádriceps en tensión máxima en rojo -->
        <path d="M 368 158 L 424 168 L 420 182 L 364 170 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1.2" />
        <!-- Tibia y pie apoyado completo -->
        <path d="M 420 172 L 398 218 L 418 218" fill="none" stroke="url(#grad-skin)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
        <line x1="376" y1="98" x2="440" y2="98" stroke="#1e293b" stroke-width="4" />
        <path d="M 342 108 L 342 164" stroke="#d94838" stroke-width="2" stroke-dasharray="3,2" marker-end="url(#arrow-anat)" />
      `;
    }
    // 7. HOMBROS Y BRAZOS (Deltoides / Bíceps / Tríceps)
    else if (ej.grupoMuscular === 'hombros' || ej.grupoMuscular === 'brazos' || tipo === 'hombros') {
      const esBrazos = ej.grupoMuscular === 'brazos';
      body = `
        <!-- FASE 1: Posición inicial -->
        <circle cx="135" cy="58" r="12" fill="url(#grad-skin)" stroke="#64748b" />
        <path d="M 116 74 L 154 74 L 150 142 L 120 142 Z" fill="url(#grad-dark-grey)" />
        <!-- Deltoides / Bíceps resaltados en rojo -->
        <circle cx="114" cy="80" r="8" fill="${esBrazos ? 'url(#grad-skin)' : 'url(#grad-muscle-red)'}" />
        <circle cx="156" cy="80" r="8" fill="${esBrazos ? 'url(#grad-skin)' : 'url(#grad-muscle-red)'}" />
        <path d="M 112 86 L 106 136 M 158 86 L 164 136" stroke="${esBrazos ? 'url(#grad-muscle-red)' : 'url(#grad-skin)'}" stroke-width="8" stroke-linecap="round" />
        <path d="M 124 142 L 122 218 M 146 142 L 148 218" stroke="url(#grad-skin)" stroke-width="9" stroke-linecap="round" />

        <!-- FASE 2: Contracción máxima (Deltoides o Bíceps/Tríceps en rojo intenso) -->
        <circle cx="405" cy="58" r="12" fill="url(#grad-skin)" stroke="#64748b" />
        <path d="M 386 74 L 424 74 L 420 142 L 390 142 Z" fill="url(#grad-dark-grey)" />
        <circle cx="382" cy="78" r="9" fill="url(#grad-muscle-red)" stroke="#7f1d1d" />
        <circle cx="428" cy="78" r="9" fill="url(#grad-muscle-red)" stroke="#7f1d1d" />
        ${esBrazos ? `
          <!-- Flexión de codo / contracción braquial en rojo -->
          <path d="M 382 82 L 376 114 L 392 88" fill="none" stroke="url(#grad-muscle-red)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 428 82 L 434 114 L 418 88" fill="none" stroke="url(#grad-muscle-red)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
        ` : `
          <!-- Elevación / Press sobre cabeza en rojo -->
          <path d="M 382 78 L 356 42 M 428 78 L 454 42" stroke="url(#grad-muscle-red)" stroke-width="8" stroke-linecap="round" />
        `}
        <path d="M 394 142 L 392 218 M 416 142 L 418 218" stroke="url(#grad-skin)" stroke-width="9" stroke-linecap="round" />
        <path d="M 464 112 L 464 58" stroke="#d94838" stroke-width="2" stroke-dasharray="3,2" marker-end="url(#arrow-anat)" />
      `;
    }
    // 8. CORE / DEADBUG / PLANCHA / FOAM ROLLER / AMRAP
    else {
      body = `
        <!-- FASE 1: Posición de control base en suelo -->
        <circle cx="62" cy="196" r="11" fill="url(#grad-skin)" stroke="#64748b" />
        <!-- Core / Recto abdominal y oblicuos en rojo anatómico -->
        <path d="M 76 192 L 144 192 L 144 210 L 76 210 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1" />
        <line x1="92" y1="192" x2="92" y2="210" stroke="#fecaca" stroke-width="1" />
        <line x1="110" y1="192" x2="110" y2="210" stroke="#fecaca" stroke-width="1" />
        <line x1="128" y1="192" x2="128" y2="210" stroke="#fecaca" stroke-width="1" />
        <!-- Piernas a 90 grados (Deadbug / Core) -->
        <path d="M 142 198 L 146 146 L 194 146" fill="none" stroke="url(#grad-skin)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M 88 194 L 88 136" stroke="url(#grad-skin)" stroke-width="7" stroke-linecap="round" />

        <!-- FASE 2: Extensión contralateral manteniendo zona lumbar firme (Core en rojo intenso) -->
        <circle cx="332" cy="196" r="11" fill="url(#grad-skin)" stroke="#64748b" />
        <path d="M 346 190 L 418 190 L 418 210 L 346 210 Z" fill="url(#grad-muscle-red)" stroke="#7f1d1d" stroke-width="1.2" />
        <line x1="364" y1="190" x2="364" y2="210" stroke="#fecaca" stroke-width="1" />
        <line x1="382" y1="190" x2="382" y2="210" stroke="#fecaca" stroke-width="1" />
        <line x1="400" y1="190" x2="400" y2="210" stroke="#fecaca" stroke-width="1" />
        <!-- Pierna extendida al ras del suelo + brazo extendido atrás -->
        <path d="M 416 198 L 496 184" stroke="url(#grad-skin)" stroke-width="9" stroke-linecap="round" />
        <path d="M 356 194 L 302 172" stroke="url(#grad-skin)" stroke-width="7" stroke-linecap="round" />
        <path d="M 442 152 L 494 172" stroke="#d94838" stroke-width="2" stroke-dasharray="3,2" marker-end="url(#arrow-anat)" />
      `;
    }

    const footer = `
        <!-- Pie de lámina con leyenda anatómica -->
        <circle cx="24" cy="256" r="5" fill="#d94838" />
        <text x="34" y="259" fill="#334155" font-size="11" font-weight="700">Músculo activo resaltado: ${musculoLabel}</text>
      </svg>
    `;

    return `${svgHeader}${body}${footer}`;
  };

  /**
   * Genera la lámina anatómica de una fase específica (1 = Inicial / Excéntrica, 2 = Final / Contracción)
   * recortada vectorialmente con fidelidad 100%, 0 dependencia de red y sin roturas de imagen.
   */
  Engine.getMannequinStageSVG = function (ej, stage = 1) {
    const full = Engine.getMannequinSVG(ej);
    if (!full) return '';
    const vb = Number(stage) === 2 ? 'viewBox="284 10 242 232"' : 'viewBox="14 10 242 232"';
    return full.replace('viewBox="0 0 540 270"', `${vb} preserveAspectRatio="xMidYMid meet"`);
  };

  // ==========================================
  // 7. GESTIÓN DE SERIES COMPLETAS, SESIÓN DE HOY, AMRAP Y SUGERENCIAS
  // ==========================================

  /**
   * Permite cargar TODAS las series de un ejercicio de una sola vez cuando el alumno
   * realiza todas las series con el mismo peso y repeticiones ("Cargar Serie Completa").
   */
  Engine.guardarMultiplesSeries = function (state, payload) {
    const ahora = Date.now();
    const cant = Math.max(1, Math.min(15, Number(payload.cantidadSeries) || 3));
    const series = [...(state.series || [])];
    const previas = series.filter(
      s => s.entrenamientoId === payload.entrenamientoId && s.ejercicioId === payload.ejercicioId && !s.deleted
    );

    const nuevasIds = [];
    for (let i = 0; i < cant; i++) {
      const id = Engine.generateId('sr');
      nuevasIds.push(id);
      series.push({
        id,
        entrenamientoId: payload.entrenamientoId,
        ejercicioId: payload.ejercicioId,
        fecha: payload.fecha || Engine.todayISO(),
        numeroSerie: previas.length + i + 1,
        tipo: payload.tipo || 'efectiva',
        pesoKg: Number(payload.pesoKg) || 0,
        reps: Number(payload.reps) || 0,
        rir: payload.rir !== undefined ? Number(payload.rir) : 2,
        rpe: payload.rpe !== undefined ? Number(payload.rpe) : 8,
        completada: true,
        deleted: false,
        updatedAt: ahora + i
      });
    }

    return {
      ...state,
      series,
      lastBatchSerieIds: nuevasIds,
      updatedAt: ahora
    };
  };

  /**
   * Soft delete de un lote de series (para deshacer "Cargar Serie Completa").
   */
  Engine.borrarMultiplesSeries = function (state, idsArray) {
    const ahora = Date.now();
    const idSet = new Set(idsArray || []);
    const series = (state.series || []).map(s =>
      idSet.has(s.id) ? { ...s, deleted: true, updatedAt: ahora } : s
    );
    return { ...state, series, updatedAt: ahora };
  };

  /**
   * Agrega un ejercicio del catálogo a la sesión de entrenamiento de hoy en su módulo/bloque
   * ('activacion' | 'movilidad' | 'A' | 'B' | 'cierre') sin crear series falsas.
   */
  Engine.agregarEjercicioASesion = function (state, entrenamientoId, item) {
    const ahora = Date.now();
    const lista = Array.isArray(state.ejerciciosSesionHoy) ? [...state.ejerciciosSesionHoy] : [];
    const excluidosHoy = { ...(state.ejerciciosExcluidosHoy || {}) };
    if (entrenamientoId && excluidosHoy[entrenamientoId]) {
      const copyMap = { ...excluidosHoy[entrenamientoId] };
      delete copyMap[item.ejercicioId];
      excluidosHoy[entrenamientoId] = copyMap;
    }

    const excluidas = { ...(state.activacionesExcluidas || {}) };
    if (excluidas[item.ejercicioId]) {
      delete excluidas[item.ejercicioId];
    }

    const resolvedSegmento = item.segmento || (item.bloque === 'activacion' ? 'activacion' : item.bloque === 'movilidad' ? 'movilidad' : 'entrenamiento');
    const resolvedBloque = item.bloque || (resolvedSegmento === 'activacion' ? 'activacion' : resolvedSegmento === 'movilidad' ? 'movilidad' : 'A');

    const idxExiste = lista.findIndex(
      x => x.entrenamientoId === entrenamientoId && x.ejercicioId === item.ejercicioId && !x.deleted
    );
    if (idxExiste !== -1) {
      if (item.bloque) {
        lista[idxExiste] = {
          ...lista[idxExiste],
          bloque: resolvedBloque,
          segmento: resolvedSegmento,
          updatedAt: ahora
        };
      }
      return {
        ...state,
        ejerciciosSesionHoy: lista,
        activacionesExcluidas: excluidas,
        ejerciciosExcluidosHoy: excluidosHoy,
        updatedAt: ahora
      };
    }

    lista.push({
      id: Engine.generateId('es'),
      entrenamientoId,
      ejercicioId: item.ejercicioId,
      segmento: resolvedSegmento,
      bloque: resolvedBloque,
      seriesObjetivo: Number(item.seriesObjetivo) || 3,
      repsObjetivo: item.repsObjetivo || '8-12',
      pesoObjetivo: Number(item.pesoObjetivo) || 0,
      notas: item.notas || '',
      completado: false,
      deleted: false,
      updatedAt: ahora
    });

    return {
      ...state,
      ejerciciosSesionHoy: lista,
      activacionesExcluidas: excluidas,
      ejerciciosExcluidosHoy: excluidosHoy,
      updatedAt: ahora
    };
  };

  /**
   * Mueve o asigna un ejercicio de la sesión activa a otro bloque ('activacion' | 'movilidad' | 'A' | 'B' | 'cierre').
   */
  Engine.moverEjercicioDeBloque = function (state, entrenamientoId, ejercicioId, nuevoBloque) {
    const ahora = Date.now();
    const bloqueValido = ['activacion', 'movilidad', 'A', 'B', 'cierre'].includes(nuevoBloque) ? nuevoBloque : 'A';
    const nuevoSeg = bloqueValido === 'activacion' ? 'activacion' : bloqueValido === 'movilidad' ? 'movilidad' : 'entrenamiento';
    const lista = Array.isArray(state.ejerciciosSesionHoy) ? [...state.ejerciciosSesionHoy] : [];
    const idx = lista.findIndex(x => x.entrenamientoId === entrenamientoId && x.ejercicioId === ejercicioId && !x.deleted);

    if (idx !== -1) {
      lista[idx] = { ...lista[idx], bloque: bloqueValido, segmento: nuevoSeg, updatedAt: ahora };
    } else {
      lista.push({
        id: Engine.generateId('es'),
        entrenamientoId,
        ejercicioId,
        segmento: nuevoSeg,
        bloque: bloqueValido,
        seriesObjetivo: 3,
        repsObjetivo: '8-12',
        pesoObjetivo: 0,
        notas: '',
        completado: false,
        deleted: false,
        updatedAt: ahora
      });
    }

    return { ...state, ejerciciosSesionHoy: lista, updatedAt: ahora };
  };

  /**
   * Registra una vuelta completa en modulación Vertical (circuito): 1 serie real por cada ejercicio del bloque.
   */
  Engine.completarVueltaVerticalBloque = function (state, entrenamientoId, bloque, registros = []) {
    if (!entrenamientoId || !Array.isArray(registros) || registros.length === 0) return state;
    const ahora = Date.now();
    let s = state;
    const nuevasIds = [];
    registros.forEach((reg, idx) => {
      if (!reg || !reg.ejercicioId) return;
      const repsNum = Number(reg.reps);
      const pesoNum = Number(reg.pesoKg);
      if (!(repsNum > 0 || pesoNum > 0)) return;
      const previas = (s.series || []).filter(
        sr => sr.entrenamientoId === entrenamientoId && sr.ejercicioId === reg.ejercicioId && !sr.deleted
      );
      s = Engine.guardarSerie(s, {
        entrenamientoId,
        ejercicioId: reg.ejercicioId,
        numeroSerie: previas.length + 1,
        tipo: reg.tipo || 'efectiva',
        pesoKg: pesoNum || 0,
        reps: repsNum || 0,
        rir: reg.rir !== undefined ? Number(reg.rir) : 2
      });
      if (s.series && s.series.length > 0) {
        const lastSr = s.series[s.series.length - 1];
        if (lastSr && lastSr.id) nuevasIds.push(lastSr.id);
      }
    });
    return {
      ...s,
      lastBatchSerieIds: nuevasIds,
      updatedAt: ahora
    };
  };

  /**
   * Marca o desmarca un ejercicio de Activación o Movilidad en la sesión de hoy.
   */
  Engine.toggleEjercicioActivacionOMovilidad = function (state, entrenamientoId, ejercicioId, fechaISO = Engine.todayISO()) {
    let s = state;
    const ahora = Date.now();
    const lista = Array.isArray(s.ejerciciosSesionHoy) ? [...s.ejerciciosSesionHoy] : [];
    const idx = lista.findIndex(x => x.entrenamientoId === entrenamientoId && x.ejercicioId === ejercicioId && !x.deleted);
    if (idx !== -1) {
      lista[idx] = { ...lista[idx], completado: !lista[idx].completado, updatedAt: ahora };
      s = { ...s, ejerciciosSesionHoy: lista, updatedAt: ahora };
    }
    const ej = (s.ejercicios || []).find(e => e.id === ejercicioId) || (Engine.CATALOGO_EJERCICIOS || []).find(e => e.id === ejercicioId);
    if (ej && ej.grupoMuscular === 'activacion') {
      s = Engine.toggleActivacion(s, ejercicioId, fechaISO);
    }
    return s;
  };

  /**
   * Calcula el progreso de vueltas/series de un bloque ('A' | 'B' | 'cierre') para mostrar en UI sin lógica ad-hoc.
   */
  Engine.computeBloqueProgreso = function (state, entrenamientoId, ejercicioIds = [], rondasObjetivo = 3) {
    const ids = Array.isArray(ejercicioIds) ? ejercicioIds : [];
    const counts = ids.map(ejId =>
      (state.series || []).filter(s => s.entrenamientoId === entrenamientoId && s.ejercicioId === ejId && !s.deleted).length
    );
    const totalSeries = counts.reduce((acc, n) => acc + n, 0);
    const vueltasCompletadas = counts.length > 0 ? Math.min(...counts) : 0;
    const objetivo = Math.max(1, Number(rondasObjetivo) || 3);
    return {
      totalEjercicios: ids.length,
      totalSeries,
      vueltasCompletadas,
      rondaActual: Math.min(objetivo, vueltasCompletadas + 1),
      rondasObjetivo: objetivo
    };
  };

  /**
   * Quita un ejercicio de la sesión de entrenamiento de hoy (ya sea agregado manualmente,
   * proveniente de una rutina del día o con series cargadas).
   */
  Engine.quitarEjercicioDeSesion = function (state, itemOrEntrenamientoId, maybeEjercicioId) {
    const ahora = Date.now();
    let entrenamientoId = maybeEjercicioId ? itemOrEntrenamientoId : state.entrenamientoActivoId;
    let ejercicioId = maybeEjercicioId || null;
    const itemId = maybeEjercicioId ? null : itemOrEntrenamientoId;

    const lista = (state.ejerciciosSesionHoy || []).map(x => {
      if (itemId && x.id === itemId) {
        entrenamientoId = x.entrenamientoId || entrenamientoId;
        ejercicioId = x.ejercicioId || ejercicioId;
        return { ...x, deleted: true, updatedAt: ahora };
      }
      if (ejercicioId && x.entrenamientoId === entrenamientoId && x.ejercicioId === ejercicioId) {
        return { ...x, deleted: true, updatedAt: ahora };
      }
      return x;
    });

    const series = (state.series || []).map(s => {
      if (ejercicioId && s.entrenamientoId === entrenamientoId && s.ejercicioId === ejercicioId && !s.deleted) {
        return { ...s, deleted: true, updatedAt: ahora };
      }
      return s;
    });

    const excluidosHoy = { ...(state.ejerciciosExcluidosHoy || {}) };
    if (entrenamientoId && ejercicioId) {
      excluidosHoy[entrenamientoId] = {
        ...(excluidosHoy[entrenamientoId] || {}),
        [ejercicioId]: true
      };
    }

    return {
      ...state,
      ejerciciosSesionHoy: lista,
      series,
      ejerciciosExcluidosHoy: excluidosHoy,
      updatedAt: ahora
    };
  };

  /**
   * Permite editar o reemplazar un ejercicio dentro de la sesión de hoy
   * (cambiarlo por otro ejercicio del catálogo, o ajustar seriesObjetivo, repsObjetivo y notas).
   */
  Engine.editarEjercicioDeSesion = function (state, entrenamientoId, oldEjercicioId, payload) {
    const ahora = Date.now();
    const newEjId = payload.newEjercicioId || oldEjercicioId;
    const seriesObjetivo = Number(payload.seriesObjetivo) || 3;
    const repsObjetivo = String(payload.repsObjetivo || '8-12').trim();
    const notas = payload.notas !== undefined ? String(payload.notas).trim() : '';

    let lista = Array.isArray(state.ejerciciosSesionHoy) ? [...state.ejerciciosSesionHoy] : [];
    let found = false;

    lista = lista.map(x => {
      if (x.entrenamientoId === entrenamientoId && x.ejercicioId === oldEjercicioId && !x.deleted) {
        found = true;
        return {
          ...x,
          ejercicioId: newEjId,
          seriesObjetivo,
          repsObjetivo,
          notas: notas || x.notas || '',
          updatedAt: ahora
        };
      }
      return x;
    });

    if (!found) {
      lista.push({
        id: Engine.generateId('es'),
        entrenamientoId,
        ejercicioId: newEjId,
        segmento: 'entrenamiento',
        seriesObjetivo,
        repsObjetivo,
        pesoObjetivo: 0,
        notas,
        completado: false,
        deleted: false,
        updatedAt: ahora
      });
    }

    // Si cambió de ejercicio, reasignar las series de esta sesión al nuevo ejercicio y excluir el anterior si venía de rutina
    const series = (state.series || []).map(s => {
      if (oldEjercicioId !== newEjId && s.entrenamientoId === entrenamientoId && s.ejercicioId === oldEjercicioId && !s.deleted) {
        return { ...s, ejercicioId: newEjId, updatedAt: ahora };
      }
      return s;
    });

    const excluidosHoy = { ...(state.ejerciciosExcluidosHoy || {}) };
    if (entrenamientoId) {
      const mapTr = { ...(excluidosHoy[entrenamientoId] || {}) };
      if (oldEjercicioId !== newEjId) {
        mapTr[oldEjercicioId] = true;
      }
      delete mapTr[newEjId];
      excluidosHoy[entrenamientoId] = mapTr;
    }

    // Si el usuario también editó las notas del ejercicio en su catálogo local
    const ejercicios = (state.ejercicios || []).map(e =>
      e.id === newEjId && notas ? { ...e, notas, updatedAt: ahora } : e
    );

    return {
      ...state,
      ejercicios,
      ejerciciosSesionHoy: lista,
      series,
      ejerciciosExcluidosHoy: excluidosHoy,
      updatedAt: ahora
    };
  };

  Engine.toggleEjercicioSesion = function (state, itemId) {
    const ahora = Date.now();
    const lista = (state.ejerciciosSesionHoy || []).map(x =>
      x.id === itemId ? { ...x, completado: !x.completado, updatedAt: ahora } : x
    );
    return { ...state, ejerciciosSesionHoy: lista, updatedAt: ahora };
  };

  Engine.guardarMovilidad = function (state, item) {
    const ahora = Date.now();
    const movilidad = Array.isArray(state.movilidad) ? [...state.movilidad] : [];
    const id = item.id || Engine.generateId('mov');
    const index = movilidad.findIndex(m => m.id === id);
    const nuevo = {
      id,
      ejercicioId: item.ejercicioId || 'ej-mov-puente-gluteo-uni',
      nombre: item.nombre || 'Movilidad',
      series: Number(item.series) || 2,
      reps: item.reps || '15',
      pesoKg: item.pesoKg != null ? Number(item.pesoKg) : 0,
      notas: item.notas || '',
      fecha: item.fecha || (index >= 0 && movilidad[index].fecha) || Engine.todayISO(),
      completado: true,
      deleted: false,
      updatedAt: ahora
    };
    if (index >= 0) movilidad[index] = nuevo;
    else movilidad.push(nuevo);

    return { ...state, movilidad, movilidadSesion: movilidad, updatedAt: ahora };
  };

  /** Movilidad que corresponde a una fecha (los ítems viejos sin fecha se consideran del día). */
  Engine.movilidadDe = function (state, fechaISO = Engine.todayISO()) {
    return (state.movilidad || []).filter(m => !m.deleted && (!m.fecha || m.fecha === fechaISO));
  };

  /** Copia a hoy la movilidad del último día en que se cargó algo (para repetirla con un toque). */
  Engine.repetirUltimaMovilidad = function (state, fechaISO = Engine.todayISO()) {
    const previas = (state.movilidad || []).filter(m => !m.deleted && m.fecha && m.fecha < fechaISO);
    if (!previas.length) return state;
    const ultimaFecha = previas.map(m => m.fecha).sort().pop();
    let s = state;
    previas.filter(m => m.fecha === ultimaFecha).forEach(m => {
      s = Engine.guardarMovilidad(s, { ...m, id: null, fecha: fechaISO });
    });
    return s;
  };

  Engine.borrarMovilidad = function (state, id) {
    const ahora = Date.now();
    const movilidad = (state.movilidad || []).map(m =>
      m.id === id ? { ...m, deleted: true, updatedAt: ahora } : m
    );
    return { ...state, movilidad, movilidadSesion: movilidad, updatedAt: ahora };
  };

  /**
   * Reordena los ejercicios de movilidad (subir o bajar en la lista).
   */
  Engine.reordenarMovilidad = function (state, id, direccion) {
    if (!state || !Array.isArray(state.movilidad)) return state;
    const activos = state.movilidad.filter(m => !m.deleted);
    const idx = activos.findIndex(m => m.id === id);
    if (idx === -1) return state;

    const targetIdx = direccion === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= activos.length) return state;

    const movActual = activos[idx];
    const movTarget = activos[targetIdx];

    const fullList = [...state.movilidad];
    const posA = fullList.findIndex(m => m.id === movActual.id);
    const posB = fullList.findIndex(m => m.id === movTarget.id);

    if (posA !== -1 && posB !== -1) {
      const temp = fullList[posA];
      fullList[posA] = fullList[posB];
      fullList[posB] = temp;
    }

    return {
      ...state,
      movilidad: fullList,
      movilidadSesion: fullList,
      updatedAt: Date.now()
    };
  };

  // ==========================================
  // 7b. SESIÓN INTELIGENTE (v2.6): rutina del día, "la vez pasada", progresión, resumen y discos
  // ==========================================

  const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  /** Nombre del día de la semana en español para una fecha ISO (o hoy). */
  Engine.nombreDia = function (fechaISO) {
    const f = fechaISO ? new Date(fechaISO + 'T12:00:00') : new Date();
    return DIAS_ES[f.getDay()];
  };

  /**
   * Rutina que toca hoy según los días elegidos en cada rutina. Si hay varias, la primera creada.
   * Devuelve { rutina, esDiaDeGym } (esDiaDeGym también mira perfil.diasSemana).
   */
  Engine.rutinaParaHoy = function (state, fechaISO = Engine.todayISO()) {
    const dia = Engine.nombreDia(fechaISO);
    const norm = (d) => String(d || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().slice(0, 3);
    const activas = (state.rutinas || []).filter(r => !r.deleted);
    const rutina = activas.find(r => (r.dias || []).some(d => norm(d) === norm(dia))) || null;
    const perfilDias = (state.perfil && state.perfil.diasSemana) || [];
    const esDiaDeGym = Boolean(rutina) || perfilDias.some(d => norm(d) === norm(dia));
    return { rutina, esDiaDeGym, dia };
  };

  /** Último entrenamiento terminado (no el activo), con su resumen corto. */
  Engine.ultimoEntrenamiento = function (state) {
    const lista = (state.entrenamientos || [])
      .filter(t => !t.deleted && t.completado && t.id !== state.entrenamientoActivoId)
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.updatedAt || 0) - (a.updatedAt || 0));
    const t = lista[0];
    if (!t) return null;
    const series = (state.series || []).filter(s => s.entrenamientoId === t.id && !s.deleted);
    const rutina = t.rutinaId ? (state.rutinas || []).find(r => r.id === t.rutinaId) : null;
    const hoy = new Date(Engine.todayISO() + 'T12:00:00'), f = new Date(t.fecha + 'T12:00:00');
    const dias = Math.round((hoy - f) / 86400000);
    return {
      entrenamiento: t,
      nombre: rutina ? rutina.nombre : 'Entrenamiento libre',
      series: series.length,
      volumen: Engine.computeVolumenEntrenamiento(state.series, t.id),
      haceDias: dias,
      haceTexto: dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`
    };
  };

  /**
   * Series del último entrenamiento (distinto al activo) en que se hizo este ejercicio: "la vez pasada".
   * Devuelve null si nunca se hizo, o { fecha, series: [...], texto: '60×8 · 60×8 · 60×7 · RIR 2', mejor: {pesoKg, reps} }.
   */
  Engine.getUltimaSesionEjercicio = function (state, ejercicioId, excluirEntrenamientoId = null) {
    const excluir = excluirEntrenamientoId || state.entrenamientoActivoId || null;
    const candidatas = (state.series || []).filter(s =>
      s.ejercicioId === ejercicioId && !s.deleted && s.completada && s.entrenamientoId !== excluir && s.tipo !== 'calentamiento'
    );
    if (!candidatas.length) return null;
    const porEnt = new Map();
    candidatas.forEach(s => { if (!porEnt.has(s.entrenamientoId)) porEnt.set(s.entrenamientoId, []); porEnt.get(s.entrenamientoId).push(s); });
    const fechaDe = (entId, serie) => {
      const t = (state.entrenamientos || []).find(x => x.id === entId);
      return (t && t.fecha) || serie.fecha || '';
    };
    let mejorEnt = null, mejorFecha = '';
    porEnt.forEach((lista, entId) => {
      const f = fechaDe(entId, lista[0]);
      if (!mejorEnt || f > mejorFecha || (f === mejorFecha && (lista[0].updatedAt || 0) > (mejorEnt[0].updatedAt || 0))) { mejorEnt = lista; mejorFecha = f; }
    });
    const series = mejorEnt.slice().sort((a, b) => (a.numeroSerie || 0) - (b.numeroSerie || 0) || (a.updatedAt || 0) - (b.updatedAt || 0));
    const rirs = series.map(s => Number.isFinite(Number(s.rir)) ? Number(s.rir) : 2);
    const rirMin = Math.min(...rirs);
    const mejor = series.reduce((a, s) => (Engine.compute1RM(s.pesoKg, s.reps) > Engine.compute1RM(a.pesoKg, a.reps) ? s : a), series[0]);
    return {
      fecha: mejorFecha,
      series,
      rirMin,
      mejor: { pesoKg: mejor.pesoKg, reps: mejor.reps },
      texto: series.map(s => `${s.pesoKg}×${s.reps}`).join(' · ') + ` · RIR ${rirMin}`
    };
  };

  /**
   * Obtiene todas las sesiones históricas donde se realizó este ejercicio, ordenadas por fecha descendente.
   */
  Engine.getHistorialCompletoEjercicio = function (state, ejercicioId) {
    if (!state) return [];
    const candidatas = (state.series || []).filter(s =>
      s.ejercicioId === ejercicioId && !s.deleted && s.tipo !== 'calentamiento'
    );
    if (!candidatas.length) return [];

    const porEnt = new Map();
    candidatas.forEach(s => {
      const entId = s.entrenamientoId || 'sin-id';
      if (!porEnt.has(entId)) porEnt.set(entId, []);
      porEnt.get(entId).push(s);
    });

    const resultado = [];
    porEnt.forEach((series, entId) => {
      const tr = (state.entrenamientos || []).find(x => x.id === entId);
      const fecha = (tr && tr.fecha) || series[0].fecha || '';
      const ordenadas = series.slice().sort((a, b) => (a.numeroSerie || 0) - (b.numeroSerie || 0));
      const mejor = ordenadas.reduce((a, s) => (
        Engine.compute1RM(s.pesoKg, s.reps) > Engine.compute1RM(a.pesoKg, a.reps) ? s : a
      ), ordenadas[0]);

      resultado.push({
        entrenamientoId: entId,
        fecha: fecha,
        series: ordenadas,
        mejorSerie: { pesoKg: mejor.pesoKg, reps: mejor.reps },
        volumenTotal: Engine.computeVolumenEntrenamiento(ordenadas, entId)
      });
    });

    return resultado.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  };

  /**
   * Progresión sugerida para hoy a partir de la vez pasada (doble progresión simple):
   * - Si completó las series objetivo con todas las reps ≥ tope del rango y RIR ≥ 2 → sube el peso.
   * - Si alguna serie quedó muy corta (RIR 0 y reps < piso) → baja un escalón.
   * - Si no → mismo peso, intentar una rep más.
   * repsObjetivo acepta '8-12', '8' o '10'.
   */
  Engine.sugerirProgresion = function (state, ejercicioId, opts = {}) {
    const prev = Engine.getUltimaSesionEjercicio(state, ejercicioId, opts.excluirEntrenamientoId);
    const ej = (state.ejercicios || []).find(e => e.id === ejercicioId) || (Engine.CATALOGO_EJERCICIOS || []).find(e => e.id === ejercicioId) || {};
    const equipo = String(opts.equipo || ej.equipo || '').toLowerCase();
    const paso = Number(opts.paso) || (equipo.includes('mancuerna') ? 2 : equipo.includes('polea') || equipo.includes('maquina') || equipo.includes('máquina') ? 5 : 2.5);
    const rango = String(opts.repsObjetivo || ej.repsSugeridas || '8-12').match(/(\d+)\s*(?:-\s*(\d+))?/);
    const piso = rango ? Number(rango[1]) : 8;
    const tope = rango ? Number(rango[2] || rango[1]) : 12;
    const seriesObj = Number(opts.seriesObjetivo) || ej.seriesSugeridas || 3;

    if (!prev) return { pesoKg: null, reps: tope === piso ? piso : Math.round((piso + tope) / 2), accion: 'nuevo', motivo: 'Primera vez: elegí un peso cómodo y anotá.' };

    const efectivas = prev.series.filter(s => s.tipo !== 'calentamiento');
    const pesoBase = Math.max(...efectivas.map(s => Number(s.pesoKg) || 0));
    const alTope = efectivas.filter(s => Number(s.pesoKg) === pesoBase);
    const completo = alTope.length >= seriesObj && alTope.every(s => Number(s.reps) >= tope);
    const conMargen = alTope.every(s => (Number.isFinite(Number(s.rir)) ? Number(s.rir) : 2) >= 2);
    const muyCorta = alTope.some(s => Number(s.reps) < piso && (Number.isFinite(Number(s.rir)) ? Number(s.rir) : 2) === 0);
    const redondear = (v) => Math.round(v / 0.25) * 0.25;

    if (completo && conMargen) {
      return { pesoKg: redondear(pesoBase + paso), reps: piso, accion: 'subir', motivo: `La vez pasada completaste ${alTope.length}×${tope} con RIR ${prev.rirMin}: probá +${paso} kg.` };
    }
    if (muyCorta) {
      return { pesoKg: redondear(Math.max(0, pesoBase - paso)), reps: piso, accion: 'bajar', motivo: 'La vez pasada quedaste corto al fallo: bajá un escalón y completá el rango.' };
    }
    const repsPrev = Math.max(...alTope.map(s => Number(s.reps) || 0));
    return { pesoKg: pesoBase, reps: Math.min(tope, repsPrev + 1), accion: 'mantener', motivo: `Mismo peso que la vez pasada (${pesoBase} kg): buscá ${Math.min(tope, repsPrev + 1)} reps.` };
  };

  /**
   * Resumen de una sesión para la pantalla final: duración, series, volumen, por ejercicio y récords logrados.
   */
  Engine.resumenEntrenamiento = function (state, entrenamientoId) {
    const t = (state.entrenamientos || []).find(x => x.id === entrenamientoId);
    if (!t) return null;
    const series = (state.series || []).filter(s => s.entrenamientoId === entrenamientoId && !s.deleted);
    const porEj = new Map();
    series.forEach(s => { if (!porEj.has(s.ejercicioId)) porEj.set(s.ejercicioId, []); porEj.get(s.ejercicioId).push(s); });

    // PR: mejor 1RM de esta sesión contra todo lo anterior (sin calentamientos)
    const anteriores = { ...state, series: (state.series || []).filter(s => s.entrenamientoId !== entrenamientoId) };
    const prsPrevios = Engine.computePRs(anteriores);
    const catalogo = (state.ejercicios || []).concat(Engine.CATALOGO_EJERCICIOS || []);
    const ejercicios = [];
    const prs = [];
    porEj.forEach((lista, ejId) => {
      const ej = catalogo.find(e => e.id === ejId) || { id: ejId, nombre: 'Ejercicio' };
      const efectivas = lista.filter(s => s.tipo !== 'calentamiento' && Number(s.pesoKg) > 0 && Number(s.reps) > 0);
      const mejor = efectivas.reduce((a, s) => (!a || Engine.compute1RM(s.pesoKg, s.reps) > Engine.compute1RM(a.pesoKg, a.reps) ? s : a), null);
      const vol = lista.reduce((acc, s) => acc + Engine.computeVolumenSerie(s), 0);
      const item = { ejercicioId: ejId, nombre: ej.nombre, series: lista.length, volumen: Math.round(vol), mejor: mejor ? { pesoKg: mejor.pesoKg, reps: mejor.reps, rm: Engine.compute1RM(mejor.pesoKg, mejor.reps) } : null, pr: false };
      if (mejor) {
        const prevRM = prsPrevios[ejId] ? prsPrevios[ejId].max1RM.rm : 0;
        const prevPeso = prsPrevios[ejId] ? prsPrevios[ejId].maxPeso.pesoKg : 0;
        const pesoMax = Math.max(...efectivas.map(x => Number(x.pesoKg) || 0));
        if (item.mejor.rm > prevRM) { item.pr = true; prs.push({ ejercicioId: ejId, nombre: ej.nombre, tipo: '1rm', pesoKg: mejor.pesoKg, reps: mejor.reps, rm: item.mejor.rm, previo: prevRM }); }
        else if (pesoMax > prevPeso && prevPeso > 0) { item.pr = true; prs.push({ ejercicioId: ejId, nombre: ej.nombre, tipo: 'peso', pesoKg: pesoMax, reps: efectivas.filter(x => Number(x.pesoKg) === pesoMax).reduce((m, x) => Math.max(m, Number(x.reps) || 0), 0), rm: item.mejor.rm, previo: prevPeso }); }
      }
      ejercicios.push(item);
    });

    let duracionMin = null;
    if (t.inicio && t.fin) {
      const [h1, m1] = String(t.inicio).split(':').map(Number), [h2, m2] = String(t.fin).split(':').map(Number);
      if ([h1, m1, h2, m2].every(Number.isFinite)) { let d = (h2 * 60 + m2) - (h1 * 60 + m1); if (d < 0) d += 1440; duracionMin = d; }
    }
    return {
      entrenamiento: t,
      fecha: t.fecha,
      duracionMin,
      series: series.length,
      volumen: Engine.computeVolumenEntrenamiento(state.series, entrenamientoId),
      ejercicios,
      prs,
      texto: `${t.fecha} · ${series.length} series · ${Math.round(Engine.computeVolumenEntrenamiento(state.series, entrenamientoId)).toLocaleString('es-AR')} kg` + (prs.length ? ` · ${prs.length} récord${prs.length > 1 ? 's' : ''} 🏆` : '')
    };
  };

  /**
   * Discos por lado para armar una barra: "60 kg = barra 20 + 20 por lado (15 + 5)".
   */
  Engine.calcularDiscos = function (pesoTotal, barraKg = 20, discos = [25, 20, 15, 10, 5, 2.5, 1.25]) {
    const total = Number(pesoTotal) || 0;
    const barra = Number(barraKg) || 0;
    if (total <= barra) return { porLado: [], restoKg: 0, texto: total > 0 ? `Barra sola (${barra} kg)` : '' };
    let porLado = Math.round(((total - barra) / 2) * 100) / 100;
    const usados = [];
    discos.slice().sort((a, b) => b - a).forEach(d => { while (porLado >= d - 1e-9) { usados.push(d); porLado = Math.round((porLado - d) * 100) / 100; } });
    return {
      porLado: usados,
      restoKg: porLado,
      texto: `Barra ${barra} + por lado: ${usados.length ? usados.join(' + ') : '—'}${porLado > 0 ? ` (faltan ${porLado} kg por lado)` : ''}`
    };
  };

  /** Mueve un ítem de movilidad a una posición concreta (arrastrar y soltar). */
  Engine.moverMovilidad = function (state, id, nuevoIndex) {
    if (!state || !Array.isArray(state.movilidad)) return state;
    const activos = state.movilidad.filter(m => !m.deleted);
    const idx = activos.findIndex(m => m.id === id);
    if (idx === -1) return state;
    const destino = Math.max(0, Math.min(activos.length - 1, Number(nuevoIndex)));
    if (destino === idx) return state;
    const [item] = activos.splice(idx, 1);
    activos.splice(destino, 0, item);
    const borrados = state.movilidad.filter(m => m.deleted);
    return { ...state, movilidad: activos.concat(borrados), movilidadSesion: activos.concat(borrados), updatedAt: Date.now() };
  };

  /**
   * Reordena, dentro de state[clave], solo los elementos cuyos id vienen en ordenIds,
   * dejándolos en ese orden y ocupando los mismos lugares que ya tenían. El resto no se mueve.
   * Sirve para ordenar lo visible de un día sin tocar el historial.
   */
  Engine.reordenarPorIds = function (state, clave, ordenIds) {
    if (!state || !Array.isArray(state[clave]) || !Array.isArray(ordenIds)) return state;
    const lista = state[clave];
    const porId = new Map(lista.map(x => [x.id, x]));
    const ids = ordenIds.filter(id => porId.has(id));
    if (ids.length < 2) return state;
    const enJuego = new Set(ids);
    let i = 0;
    const nueva = lista.map(x => (enJuego.has(x.id) ? porId.get(ids[i++]) : x));
    if (nueva.every((x, k) => x === lista[k])) return state;
    return { ...state, [clave]: nueva, updatedAt: Date.now() };
  };

  /** Orden manual de los ejercicios de la sesión activa (lista de ejercicioId). */
  Engine.ordenarEjerciciosSesion = function (state, entrenamientoId, ordenIds) {
    const mapa = { ...(state.ordenSesion || {}) };
    mapa[entrenamientoId] = (ordenIds || []).filter(Boolean);
    return { ...state, ordenSesion: mapa, updatedAt: Date.now() };
  };

  /** Aplica el orden manual guardado a una lista de ítems con .ejercicio.id (los nuevos van al final). */
  Engine.aplicarOrdenSesion = function (state, entrenamientoId, lista) {
    const orden = (state.ordenSesion && state.ordenSesion[entrenamientoId]) || [];
    if (!orden.length) return lista;
    const pos = new Map(orden.map((id, i) => [id, i]));
    return lista.slice().sort((a, b) => {
      const pa = pos.has(a.ejercicio.id) ? pos.get(a.ejercicio.id) : 1e6, pb = pos.has(b.ejercicio.id) ? pos.get(b.ejercicio.id) : 1e6;
      return pa - pb;
    });
  };

  /** Configuración de descanso automático guardada en kv. */
  Engine.getDescanso = function (state) {
    const kv = Array.isArray(state && state.kv) ? state.kv : [];
    const seg = kv.find(k => k.id === 'descansoSeg');
    const auto = kv.find(k => k.id === 'descansoAuto');
    return { segundos: seg ? Number(seg.valor) || 90 : 90, automatico: auto ? auto.valor !== false && auto.valor !== 'false' : true };
  };
  Engine.setKV = function (state, id, valor) {
    const kv = (Array.isArray(state.kv) ? state.kv : []).filter(k => k.id !== id).concat([{ id, valor }]);
    return { ...state, kv, updatedAt: Date.now() };
  };

  Engine.toggleActivacion = function (state, actId, fechaISO = Engine.todayISO()) {
    const ahora = Date.now();
    // Las tildes de activación son del día: si cambió la fecha, arrancan vacías y lo anterior queda en el historial
    const mapa = state.activacionesFecha === fechaISO ? { ...(state.activacionesHoy || {}) } : {};
    mapa[actId] = !mapa[actId];
    const log = (state.activacionesLog || []).filter(x => !(x.fecha === fechaISO && x.actId === actId));
    if (mapa[actId]) log.push({ fecha: fechaISO, actId, updatedAt: ahora });
    return { ...state, activacionesHoy: mapa, activacionesFecha: fechaISO, activacionesLog: log.slice(-500), updatedAt: ahora };
  };

  /** Tildes de activación vigentes para una fecha (vacío si son de otro día). */
  Engine.activacionesDe = function (state, fechaISO = Engine.todayISO()) {
    if (!state) return {};
    if (state.activacionesFecha && state.activacionesFecha !== fechaISO) {
      const m = {};
      (state.activacionesLog || []).forEach(x => { if (x.fecha === fechaISO) m[x.actId] = true; });
      return m;
    }
    return state.activacionesHoy || {};
  };

  /**
   * Quita un ejercicio de activación de la rutina diaria.
   */
  Engine.quitarActivacion = function (state, actId) {
    const ahora = Date.now();
    const excluidas = { ...(state.activacionesExcluidas || {}) };
    excluidas[actId] = true;
    const ejerciciosSesionHoy = (state.ejerciciosSesionHoy || []).filter(
      item => !(item.segmento === 'activacion' && (item.ejercicioId === actId || item.id === actId))
    );
    const activacionesHoy = { ...(state.activacionesHoy || {}) };
    delete activacionesHoy[actId];

    return {
      ...state,
      activacionesExcluidas: excluidas,
      ejerciciosSesionHoy,
      activacionesHoy,
      updatedAt: ahora
    };
  };

  /**
   * Crea y guarda un bloque de entrenamiento AMRAP (rutina dentro del día que permite múltiples ejercicios y tiempo de trabajo/descanso).
   */
  Engine.agregarBloqueAmrap = function (state, amrapData) {
    const ahora = Date.now();
    const bloques = Array.isArray(state.bloquesAmrap) ? [...state.bloquesAmrap] : [];
    const nuevo = {
      id: Engine.generateId('amrap'),
      entrenamientoId: amrapData.entrenamientoId || state.entrenamientoActivoId,
      fecha: Engine.todayISO(),
      nombre: amrapData.nombre || 'Rutina AMRAP del Día',
      tiempoTrabajoSeg: Number(amrapData.tiempoTrabajoSeg) || 40,
      tiempoDescansoSeg: Number(amrapData.tiempoDescansoSeg) || 20,
      rondasObjetivo: Number(amrapData.rondasObjetivo) || 4,
      rondasCompletadas: Number(amrapData.rondasCompletadas) || 0,
      ejercicios: Array.isArray(amrapData.ejercicios) ? amrapData.ejercicios : [],
      deleted: false,
      updatedAt: ahora
    };
    bloques.push(nuevo);
    return { ...state, bloquesAmrap: bloques, updatedAt: ahora };
  };

  /**
   * Agrega un ejercicio (del catálogo o personalizado) dentro de una rutina AMRAP existente del día.
   */
  Engine.agregarEjercicioABloqueAmrap = function (state, amrapId, ejercicioItem) {
    const ahora = Date.now();
    const bloques = (state.bloquesAmrap || []).map(b => {
      if (b.id !== amrapId) return b;
      const actuales = Array.isArray(b.ejercicios) ? [...b.ejercicios] : [];
      actuales.push({
        ejercicioId: ejercicioItem.ejercicioId || ejercicioItem.id || 'ej-amrap-burpees',
        nombre: ejercicioItem.nombre || 'Ejercicio AMRAP',
        repsObjetivo: ejercicioItem.repsObjetivo || '10-12 reps',
        pesoKg: Number(ejercicioItem.pesoKg) || 0
      });
      return { ...b, ejercicios: actuales, updatedAt: ahora };
    });
    return { ...state, bloquesAmrap: bloques, updatedAt: ahora };
  };

  /**
   * Quita un ejercicio de una rutina AMRAP por su índice.
   */
  Engine.quitarEjercicioDeBloqueAmrap = function (state, amrapId, indexEjercicio) {
    const ahora = Date.now();
    const bloques = (state.bloquesAmrap || []).map(b => {
      if (b.id !== amrapId) return b;
      const actuales = (b.ejercicios || []).filter((_, idx) => idx !== Number(indexEjercicio));
      return { ...b, ejercicios: actuales, updatedAt: ahora };
    });
    return { ...state, bloquesAmrap: bloques, updatedAt: ahora };
  };

  /**
   * Actualiza los tiempos de trabajo/descanso y rondas de una rutina AMRAP.
   */
  Engine.actualizarConfigBloqueAmrap = function (state, amrapId, config) {
    const ahora = Date.now();
    const bloques = (state.bloquesAmrap || []).map(b => {
      if (b.id !== amrapId) return b;
      return {
        ...b,
        nombre: config.nombre !== undefined ? config.nombre : b.nombre,
        tiempoTrabajoSeg: config.tiempoTrabajoSeg !== undefined ? Number(config.tiempoTrabajoSeg) : b.tiempoTrabajoSeg,
        tiempoDescansoSeg: config.tiempoDescansoSeg !== undefined ? Number(config.tiempoDescansoSeg) : b.tiempoDescansoSeg,
        rondasObjetivo: config.rondasObjetivo !== undefined ? Number(config.rondasObjetivo) : b.rondasObjetivo,
        updatedAt: ahora
      };
    });
    return { ...state, bloquesAmrap: bloques, updatedAt: ahora };
  };

  Engine.registrarRondaAmrap = function (state, amrapId, todasCompletas = false) {
    const ahora = Date.now();
    const bloques = (state.bloquesAmrap || []).map(b => {
      if (b.id !== amrapId) return b;
      const nuevasRondas = todasCompletas ? b.rondasObjetivo : (b.rondasCompletadas || 0) + 1;
      return { ...b, rondasCompletadas: nuevasRondas, updatedAt: ahora };
    });
    return { ...state, bloquesAmrap: bloques, updatedAt: ahora };
  };

  Engine.borrarBloqueAmrap = function (state, amrapId) {
    const ahora = Date.now();
    const bloques = (state.bloquesAmrap || []).map(b =>
      b.id === amrapId ? { ...b, deleted: true, updatedAt: ahora } : b
    );
    return { ...state, bloquesAmrap: bloques, updatedAt: ahora };
  };

  /**
   * Registra una sugerencia enviada desde el botón de Sugerencias (con soporte de capturas adjuntas y dictado por voz).
   */
  Engine.agregarSugerencia = function (state, data) {
    const ahora = Date.now();
    const sugerencias = Array.isArray(state.sugerencias) ? [...state.sugerencias] : [];
    const msg = (data.mensaje || data.texto || '').trim();
    sugerencias.unshift({
      id: Engine.generateId('sug'),
      fecha: Engine.todayISO(),
      hora: Engine.timeNow(),
      autor: data.autor || 'Usuario',
      rol: data.rol || 'alumno',
      mensaje: msg,
      texto: msg,
      capturas: Array.isArray(data.capturas) ? data.capturas : [],
      deleted: false,
      updatedAt: ahora
    });
    return { ...state, sugerencias, updatedAt: ahora };
  };

  Engine.borrarSugerencia = function (state, sugId) {
    const ahora = Date.now();
    const sugerencias = (state.sugerencias || []).map(s =>
      s.id === sugId ? { ...s, deleted: true, updatedAt: ahora } : s
    );
    return { ...state, sugerencias, updatedAt: ahora };
  };

  // ==========================================
  // 8. ESTADO INICIAL LIMPIO CON CATÁLOGO ESTANDARIZADO
  // ==========================================

  Engine.seedInitialData = function (codigoAlumno = null) {
    return {
      version: 2,
      codigoAlumno: codigoAlumno || Engine.generateAlumnoCode(),
      perfil: {
        edad: '',
        pesoKg: '',
        alturaCm: '',
        genero: '',
        diasSemana: [],
        horarioHabitual: '19:00',
        objetivoCorto: '',
        objetivoLargo: '',
        lesiones: '',
        emailRecordatorio: false,
        completado: false
      },
      // Catálogo completo de ejercicios estandarizados (Activación, Movilidad, Fuerza y AMRAP)
      ejercicios: Engine.CATALOGO_EJERCICIOS.map(e => ({ ...e, deleted: false, updatedAt: Date.now() })),
      rutinas: [],
      entrenamientos: [],
      checkinsGym: [],
      series: [],
      ejerciciosSesionHoy: [],
      movilidad: [],
      activacionesHoy: {},
      bloquesAmrap: [],
      sugerencias: [],
      readinessLogs: [],
      observaciones: [],
      fotos: [],
      entrenamientoActivoId: null,
      kv: [
        { id: 'unidad', valor: 'kg' },
        { id: 'formula1RM', valor: 'epley' }
      ],
      updatedAt: Date.now()
    };
  };

  return Engine;
});

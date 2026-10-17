import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { supabase } from './supabase'
import {
  Building2, Plus, Search, LogOut, Pencil, Trash2, X, ChevronRight,
  Shield, User, Save, Mail, Phone, AlertCircle, KeyRound, Download, CalendarClock, Send, FileSpreadsheet, Trophy,
  History, UserPlus, UserMinus, Inbox, MapPin, Star, AlertTriangle, CalendarCheck, Check, Lock, LockOpen,
  Lightbulb, PlaneTakeoff, PlaneLanding, ArrowUpDown, Clock, BarChart3, Sparkles,
} from 'lucide-react'

// ---------- Config ----------
const ESTADOS = [
  { id: 'sin_contactar', label: 'Sin contactar', color: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  { id: 'no_contesta', label: 'No lo cogen', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', dot: 'bg-cyan-500' },
  { id: 'mail_enviado', label: 'Mail enviado', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400' },
  { id: 'mas_adelante', label: 'Para más adelante', color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200', dot: 'bg-fuchsia-500' },
  { id: 'segundo_plazo', oculto: true, label: 'Segundo plazo', color: 'bg-amber-100 text-amber-900 border-amber-300', dot: 'bg-amber-700' },
  { id: 'otra_provincia', label: 'Otra comunidad', color: 'bg-neutral-100 text-neutral-600 border-neutral-300', dot: 'bg-neutral-400' },
  { id: 'interesados', label: 'Muy interesados', color: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  { id: 'beca', label: 'Beca conseguida', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  { id: 'no_existe', label: 'Ya no existe', color: 'bg-stone-100 text-stone-500 border-stone-300 line-through', dot: 'bg-stone-400' },
  { id: 'rechazada', label: 'No quieren', color: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
]
// Apartados de la lista de empresas: cada estado pertenece a uno
const GRUPOS = [
  { id: 'disponibles', label: 'Empresas disponibles', estados: ['sin_contactar'] },
  { id: 'activo', label: 'Seguimiento activo', estados: ['no_contesta', 'mail_enviado', 'segundo_plazo', 'interesados'] },
  // «Para más adelante» cuenta como cerrada: no se sigue llamando durante este curso
  { id: 'cerradas', label: 'Cerradas', estados: ['beca', 'rechazada', 'no_existe', 'otra_provincia', 'mas_adelante'] },
  { id: 'historicas', label: 'Históricas', estados: null, historicas: true, soloAdmin: true },
  { id: 'todas', label: 'Todas', estados: null },
]
// Para un miembro, todos los apartados salvo «Todas» muestran solo sus empresas
const enGrupo = (g, c, meId, admin = true) =>
  (!admin && g.id !== 'todas' && c.responsable !== meId) ? false
    : g.historicas ? !!c.historica : (!g.estados || g.estados.includes(c.estado))
// Normaliza un CIF para comparar: sin espacios, guiones ni puntos y en mayúsculas
const cifNorm = (cif) => String(cif || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
// Texto «2023 (3 prácticas) y 2024 (1 práctica)» a partir de las filas de la tabla practicas
// (año o número pueden venir vacíos en las históricas importadas del Excel)
const textoPracticas = (lista = []) => {
  const partes = [...lista].sort((a, b) => (a.anio || 0) - (b.anio || 0))
    .map((p) => `${p.anio || 'un año sin registrar'}${p.num_practicas ? ` (${p.num_practicas} práctica${p.num_practicas !== 1 ? 's' : ''})` : ''}`)
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : (partes[0] || '')
}
const aniosPracticas = (lista = []) => [...new Set(lista.map((p) => p.anio).filter(Boolean))].sort().join(', ')
const grupoDe = (id) => GRUPOS.find((g) => g.id === id) || GRUPOS[GRUPOS.length - 1]
// Los estados «oculto» ya no se pueden elegir; solo se muestran si alguna empresa sigue en ellos
const estadoDe = (id) => ESTADOS.find((e) => e.id === id) || ESTADOS[0]

// Cuántas empresas sin contactar se asignan de golpe y a partir de cuántas se avisa
const LOTE = 5
// Pestaña de empresas sin centro (bote común, compartido por todos los centros)
const BOTE = '__bote'
// Roles: admin = admin de centro (solo su centro); superadmin = admin general (todos los centros)
const ROLES = [['miembro', 'Miembro'], ['admin', 'Admin de centro'], ['superadmin', 'Admin general']]
const esAdminRol = (rol) => rol === 'admin' || rol === 'superadmin'
// <option> de personas; si hay gente de varios centros, agrupadas por centro
function OpcionesPersonas({ users }) {
  const porCentro = {}
  for (const u of users) (porCentro[u.centro || 'TLMA'] ||= []).push(u)
  const grupos = Object.entries(porCentro)
  if (grupos.length < 2) return users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)
  return grupos.map(([c, lista]) => (
    <optgroup key={c} label={c}>{lista.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</optgroup>
  ))
}
const AVISO_POCAS = 2

// Acciones del historial
const ACCIONES = {
  alta: { label: 'Alta', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  estado: { label: 'Estado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  nota: { label: 'Nota', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  agenda: { label: 'Agenda', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  responsable: { label: 'Responsable', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  datos: { label: 'Datos', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  quincena: { label: 'Quincena', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
}
const accionDe = (id) => ACCIONES[id] || { label: id, color: 'bg-slate-100 text-slate-600 border-slate-200' }

// Baremo de puntos: cada empresa vale según su estado ACTUAL. No se acumula: si una empresa cambia
// de estado, sus puntos pasan a ser los del estado nuevo. Los puntos son para la persona que tiene
// asignada la empresa. Las notas y las altas no puntúan.
// Cada centro puede tener su propio baremo (columna centros.puntos, se edita en Equipo); si no lo ha
// cambiado, usa este por defecto.
const PUNTOS_ESTADO = {
  sin_contactar: 0,
  no_contesta: 1, mail_enviado: 1, interesados: 1, segundo_plazo: 1,   // ya contactada
  mas_adelante: 3, otra_provincia: 3, no_existe: 3, rechazada: 3, beca: 3, // cerrada (3 en total)
}
// Una empresa puede dar más de una beca: cuenta el nº de prácticas registradas desde el año en que
// pasó a «Beca conseguida» (si no hay registro, las del último año apuntado; si no hay nada, 1).
// Cada beca suma los puntos de «Beca conseguida».
const becasDe = (c, cuando) => {
  const filas = (c.practicas || []).filter((p) => (p.num_practicas || 0) > 0)
  if (!filas.length) return 1
  const desde = cuando ? new Date(cuando).getFullYear() : Math.max(...filas.map((p) => p.anio || 0))
  const n = filas.filter((p) => (p.anio || 0) >= desde).reduce((t, p) => t + p.num_practicas, 0)
  return Math.max(1, n || filas.filter((p) => p.anio === Math.max(...filas.map((q) => q.anio || 0))).reduce((t, p) => t + p.num_practicas, 0))
}
// Un seguimiento con cambio de estado deja dos filas en el historial (estado + nota) con la misma
// hora, persona y empresa: así se emparejan en la ficha de la empresa.
const claveSeg = (h) => `${h.empresa_id}|${h.usuario_id}|${h.creado}`

const PUNTOS = {
  quincena: 10,       // seguimiento quincenal cumplido (ver QUINCENA); es aparte de las empresas
  reunion: 5,         // asistencia a una reunión (cada reunión puede tener otro valor)
}
const PUNTOS_DEFECTO = { estados: PUNTOS_ESTADO, quincena: PUNTOS.quincena, reunion: PUNTOS.reunion }
// Estados que cuentan como «contactada» en los resúmenes; el resto con puntos cuentan como «cerrada»
const CONTACTADAS = ['no_contesta', 'mail_enviado', 'interesados', 'segundo_plazo']
// Baremo de un centro: el suyo guardado en la tabla centros, completado con el de por defecto
const baremoDe = (centros = [], id) => {
  const p = centros.find((c) => c.id === id)?.puntos || {}
  return {
    estados: { ...PUNTOS_DEFECTO.estados, ...(p.estados || {}) },
    quincena: Number.isFinite(p.quincena) ? p.quincena : PUNTOS_DEFECTO.quincena,
    reunion: Number.isFinite(p.reunion) ? p.reunion : PUNTOS_DEFECTO.reunion,
    propio: !!centros.find((c) => c.id === id)?.puntos,
  }
}
// «sin contactar 0 · no lo cogen 1 · …» agrupando estados con los mismos puntos
const textoBaremo = (b) => {
  const porPts = {}
  for (const e of ESTADOS) {
    if (e.oculto) continue
    ;(porPts[b.estados[e.id] ?? 0] ||= []).push(e.label.toLowerCase())
  }
  return Object.entries(porPts).sort((x, y) => x[0] - y[0])
    .map(([pts, ls]) => `${ls.join(', ')}: ${pts} punto${Number(pts) !== 1 ? 's' : ''}`).join(' · ')
}
// ---------- Seguimiento quincenal ----------
// Cada 14 días, contados desde QUINCENA.inicio (iguales para todo el equipo), se revisa a cada
// persona: si ha vuelto a tocar TODAS las empresas que tenía en seguimiento al empezar la
// quincena, se lleva PUNTOS.quincena. No se guarda nada en la base de datos: se deduce del historial.
//  - «En seguimiento» = empresa asignada a esa persona cuyo estado, al empezar la quincena,
//    era uno de QUINCENA.activos. Las que siguen sin contactar, aparcadas o cerradas no cuentan.
//  - «La ha vuelto a tocar» = dentro de la quincena, esa persona ha escrito una nota o ha
//    cambiado el estado (incluido cerrarla como beca o «No quieren»).
//  - Quien no tenía ninguna empresa en seguimiento no cumple ni falla esa quincena.
const QUINCENA = {
  inicio: '2026-09-28',                                      // lunes en que arranca la primera
  dias: 14,
  activos: ['no_contesta', 'mail_enviado', 'interesados'],
  cuentan: ['nota', 'estado'],
}
// ---------- Aviso «Realizar seguimiento» ----------
// Una empresa en seguimiento (no cerrada) que lleva SIN_MOVER.dias sin una nota ni un cambio de
// estado se marca con un aviso. No cuentan las que tienen un próximo contacto programado a futuro.
const SIN_MOVER = {
  dias: 7,
  estados: ['no_contesta', 'mail_enviado', 'interesados', 'segundo_plazo'],
}
// «hace 12 días» a partir de la fecha del último contacto (nota o cambio de estado)
const haceCuanto = (iso) => {
  if (!iso) return 'sin contactos registrados'
  const d = Math.floor((new Date(isoDia(new Date())) - new Date(isoDia(new Date(iso)))) / 864e5)
  if (d <= 0) return 'contactada hoy'
  if (d === 1) return 'contactada ayer'
  if (d < 60) return `hace ${d} días`
  return `hace ${Math.round(d / 30)} meses`
}
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diaMas = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDia(d) }

// Quincenas que han empezado hasta `hastaIso` (incluido). fin es exclusivo.
function quincenasHasta(hastaIso) {
  const out = []
  for (let ini = QUINCENA.inicio; ini <= hastaIso; ini = diaMas(ini, QUINCENA.dias)) {
    out.push({ ini, fin: diaMas(ini, QUINCENA.dias) })
  }
  return out
}

// hist: filas del historial (empresa_id, usuario_id, accion, estado_nuevo, creado), en cualquier orden.
// companies: empresas actuales (id, nombre, responsable).
// Devuelve { [usuario_id]: [{ ini, fin, total, hechas, cumple, faltan: [empresa], enCurso }] }
function evaluarQuincenas(hist, companies, hastaIso) {
  const porEmpresa = {}
  for (const h of hist) (porEmpresa[h.empresa_id] ||= []).push(h)
  for (const k in porEmpresa) porEmpresa[k].sort((a, b) => new Date(a.creado) - new Date(b.creado))

  const ahora = new Date()
  const res = {}
  for (const q of quincenasHasta(hastaIso)) {
    const ini = new Date(q.ini + 'T00:00:00')
    const fin = new Date(q.fin + 'T00:00:00')
    const porPersona = {}
    for (const c of companies) {
      if (!c.responsable) continue
      const filas = porEmpresa[c.id] || []
      let estado = 'sin_contactar'
      for (const h of filas) {
        if (new Date(h.creado) >= ini) break
        if (h.accion === 'estado' && h.estado_nuevo) estado = h.estado_nuevo
      }
      if (!QUINCENA.activos.includes(estado)) continue
      const tocada = filas.some((h) => {
        const t = new Date(h.creado)
        return t >= ini && t < fin && h.usuario_id === c.responsable && QUINCENA.cuentan.includes(h.accion)
      })
      const p = (porPersona[c.responsable] ||= { total: 0, hechas: 0, faltan: [] })
      p.total++
      if (tocada) p.hechas++
      else p.faltan.push(c)
    }
    for (const [uid, p] of Object.entries(porPersona)) {
      ;(res[uid] ||= []).push({
        ...q, ...p,
        cumple: p.hechas === p.total,
        enCurso: fin > ahora,
      })
    }
  }
  return res
}

// Asistencias a reuniones de un centro, para los puntos: [{ usuario_id, titulo, fecha, puntos }].
// Si aún no se ha ejecutado migracion_reuniones.sql, devuelve [] y todo funciona como antes.
async function traerAsistencias(centro) {
  if (!centro) return []
  const { data: rs, error } = await supabase.from('reuniones').select('id, titulo, fecha, puntos').eq('centro', centro)
  if (error || !rs?.length) return []
  const porId = Object.fromEntries(rs.map((r) => [r.id, r]))
  const out = []
  for (let i = 0; i < rs.length; i += 100) {
    const { data } = await supabase.from('asistencias').select('reunion_id, usuario_id').in('reunion_id', rs.slice(i, i + 100).map((r) => r.id))
    for (const a of data || []) {
      const r = porId[a.reunion_id]
      out.push({ usuario_id: a.usuario_id, reunion_id: r.id, titulo: r.titulo, fecha: r.fecha, puntos: r.puntos })
    }
  }
  return out
}

// Supabase corta cada consulta en 1000 filas aunque pidas más: esto pagina hasta traerlo todo.
async function traerTodo(consulta) {
  const PAG = 1000
  const out = []
  for (let i = 0; ; i += PAG) {
    const { data, error } = await consulta().range(i, i + PAG - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAG) return out
  }
}

// El detalle de los cambios de estado viene con los ids crudos ("mail_enviado → beca")
const detalleLegible = (h) =>
  h.accion === 'estado' && h.estado_anterior && h.estado_nuevo
    ? `${estadoDe(h.estado_anterior).label} → ${estadoDe(h.estado_nuevo).label}`
    : h.detalle
const fecha = (iso) =>
  iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

const HOY = () => new Date().toISOString().slice(0, 10)
const sumarDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
// 1 de septiembre del curso en marcha (si estamos en enero-agosto, el del año anterior)
const INICIO_CURSO = () => {
  const h = new Date()
  return `${h.getMonth() >= 8 ? h.getFullYear() : h.getFullYear() - 1}-09-01`
}
const fechaCorta = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''

// Enlace a la ventana de redactar de Gmail (no depende de tener un cliente de correo configurado).
// Usa la cuenta /u/0/ (la primera sesión de Gmail abierta en el navegador).
const gmailUrl = (to, asunto = '', cuerpo = '') =>
  `https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=1&to=${encodeURIComponent(to || '')}` +
  (asunto ? `&su=${encodeURIComponent(asunto)}` : '') +
  (cuerpo ? `&body=${encodeURIComponent(cuerpo)}` : '')

// ---------- Plantilla de contacto (equipo de empresas) ----------
// Se copia al portapapeles como HTML (con formato y logo) y se abre Gmail con destinatario y asunto:
// el miembro solo tiene que pegar con Ctrl+V. Los adjuntos se añaden a mano en Gmail.
// El logo se sirve desde /public del propio CRM (crm-iaeste.vercel.app/logo-iaeste-madrid.png).
const LOGO_URL = 'https://crm-iaeste.vercel.app/logo-iaeste-madrid.png'
const AZUL = '#0b3d59'
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const SEP = '-'.repeat(108)

// Cada centro tiene su plantilla (columna centros.plantilla, se edita en Equipo). El cuerpo se escribe
// como texto sencillo: una línea en blanco separa párrafos, «- » al principio hace una viñeta,
// **así** va en negrita y «---» es una línea separadora. Se pueden usar {contacto}, {mi_nombre},
// {empresa}, {correo_centro} y {centro}. El aviso legal de IAESTE España es igual para todos.
const CUERPO_DEFECTO = `Buenos días {contacto},

Mi nombre es {mi_nombre} y trabajo como parte de la Asociación internacional IAESTE. Como comenté por teléfono, este correo contiene información básica acerca de nuestro programa de prácticas internacionales, así como una presentación visual adjunta. Si hiciese falta más información al respecto, estamos abiertos a tener una reunión para profundizar más:

**IAESTE** (International Association for the Exchange of Students for Technical Experience) es una organización internacional cuyo objetivo es promover la realización de prácticas remuneradas en empresas y entidades de diversos países para estudiantes de especialidades científico-técnicas, fomentando así la excelencia profesional y el desarrollo de las aptitudes personales en entornos multiculturales y pluridisciplinares.

Adjunto para su información:
- Presentación programa IAESTE
- Modelo convenio

Si están interesados en formalizar una oferta de prácticas a través del programa de movilidad IAESTE, el proceso sería el siguiente:

Cumplimentar y enviar a {correo_centro} la siguiente documentación:
- Formulario oferta prácticas (1 por plaza ofertada). En este documento se detalla el perfil buscado.
- Compromiso empresa
- Acuerdo corresponsabilidad tratamiento datos

**Características generales de la oferta de prácticas:**
- La empresa determina la duración y el periodo de la práctica, con duración mínima de 6 semanas y máximo 1 año.
- El becario trabajará un máximo de 40 horas semanales de lunes a viernes.
- El becario recibirá una remuneración mínima de 800 euros netos mensuales por parte de la empresa, de forma que pueda mantenerse durante la práctica en nuestro país (con la posibilidad de ofrecer alojamiento, manutención y transporte, en lugar de la remuneración).
- La empresa recibirá el perfil de un estudiante que cumpla los requisitos solicitados (un perfil por oferta). Se dispondrá del plazo de dos semanas para evaluar y/o entrevistar al estudiante de forma online si se considera necesario.
- Tras la evaluación del perfil proporcionado, la empresa aceptará o rechazará al estudiante. Si este es aceptado, se procederá a la firma de un convenio entre IAESTE España, becario y la empresa que permita la incorporación del estudiante. En ningún caso será necesario un contrato laboral.

---

Indicarles que en el caso de becarios o recién graduados extracomunitarios que vengan a España a realizar una práctica mediante convenio por un periodo superior a 90 días y en aplicación del Real Decreto Ley 11/2018 de 31 de agosto- Disposición adicional decimoctava deberán estar provistos de la Autorización de residencia para prácticas no laborales mediante convenio.

Para ello, la entidad que acoge al becario en prácticas (la empresa) debe solicitar de manera telemática a través de la plataforma MERCURIO https://sede.administracionespublicas.gob.es/mercurio/inicioMercurio.html esta Autorización de residencia para prácticas no laborales mediante convenio, en los términos que se indica en esta disposición.

A la recepción del convenio les remitiremos copia firmada por IAESTE y Estudiante junto con resto de documentación requerida por la Administración, para que procedan a la solicitud de autorización para estancia por prácticas no laborales.

La resolución de esta autorización se resolverá en el plazo máximo de 30 días. Si no se resuelve en dicho plazo, la autorización se entenderá estimada por silencio administrativo. Al día siguiente de que expire ese plazo la empresa deberá solicitar a la Administración el correspondiente Certificado de silencio.

---

Por último, informarles que deberán en su momento solicitar el nº de seguridad social y posterior alta en la TGSS como becario en prácticas externas.

A estos efectos, la Administración ha abierto la posibilidad de que los autorizados al sistema RED (las empresas) realicen dicha solicitud a través de CASIA en relación con los trabajadores respecto de los cuales van a comunicar con posterioridad su alta. Para ello, se ha creado un nuevo trámite, “Solicitud de número de Seguridad Social”, que se encuentra ya disponible dentro de las subcategorías correspondientes a los trámites de Afiliación, altas y bajas < Altas de trabajadores cuenta ajena.

La documentación que deberá acompañar a dicha solicitud será la siguiente:

TA.1 firmado por el becario, pasaporte o ID, NIE y convenio

**• ALTA**

Una vez la empresa disponga del CCC específico y del número de Seguridad Social del estudiante extranjero, el alta en el Régimen General de la Seguridad Social de los estudiantes se deberá realizar mediante el mismo procedimiento que el de un trabajador por cuenta ajena, realizando el trámite ante la Seguridad Social presencialmente o a través del Sistema Red.

Código de alta: 1
Exclusión cotización: 986 (programas de formación)
Y la Relación Laboral de Carácter Especial (RLCE) dependiendo de si las prácticas son curriculares o extracurriculares:
·  Curriculares: 9928
·  Extracurriculares: 9927

Quedamos a su disposición para cualquier consulta que tengan o para fijar una reunión. Gracias de antemano y un saludo,`

const PLANTILLA_DEFECTO = {
  asunto: 'IAESTE Madrid - Programa de prácticas internacionales para {empresa}',
  cuerpo: CUERPO_DEFECTO,
  equipo: 'Equipo de Empresas IAESTE {centro}',
  entidad: 'IAESTE Madrid',
  direccion: '',
  web: 'www.iaeste.es',
  correo: '',
}
// Lo que ya usaba TLMA, para que no cambie nada si no se toca
const PLANTILLA_CENTRO = {
  TLMA: {
    entidad: 'IAESTE Telecomunicación Madrid',
    direccion: 'E.T.S.I. Telecomunicación Madrid - Local 206 - L\nAvenida Complutense, 30, 28040, Madrid',
    correo: 'iaestetlmd@gmail.com',
  },
}
const plantillaDe = (centros = [], id) => {
  const guardada = centros.find((c) => c.id === id)?.plantilla
  return { ...PLANTILLA_DEFECTO, ...(PLANTILLA_CENTRO[id] || {}), ...(guardada || {}), centro: id, propia: !!guardada }
}

const rellenar = (t, vars, html) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? (html ? esc(vars[k]) : vars[k]) : m))
// Texto escapado → enlaces y negritas
const enlinea = (t) => t
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
  .replace(/(^|[\s(])([\w.+-]+@[\w-]+\.[\w.-]+)/g, '$1<a href="mailto:$2">$2</a>')
// Cuerpo en texto sencillo → HTML para Gmail
const cuerpoHtml = (texto) => {
  const p = (t) => `<p style="margin:0 0 12px 0">${t}</p>`
  return String(texto || '').replace(/\r/g, '').split(/\n\s*\n/).map((bloque) => {
    const lineas = bloque.split('\n').filter((l) => l.trim() !== '')
    if (!lineas.length) return ''
    if (lineas.length === 1 && /^-{3,}$/.test(lineas[0].trim())) return `<p style="margin:12px 0">${SEP}</p>`
    let out = '', normales = [], vinetas = []
    const vaciar = () => {
      if (normales.length) { out += p(normales.map((l) => enlinea(esc(l))).join('<br>')); normales = [] }
      if (vinetas.length) { out += `<ul style="margin:0 0 12px 0">${vinetas.map((l) => `<li>${enlinea(esc(l))}</li>`).join('')}</ul>`; vinetas = [] }
    }
    for (const l of lineas) {
      if (/^\s*[-*]\s+/.test(l)) { if (normales.length) vaciar(); vinetas.push(l.replace(/^\s*[-*]\s+/, '')) }
      else { if (vinetas.length) vaciar(); normales.push(l) }
    }
    vaciar()
    return out
  }).join('')
}

const variablesPlantilla = (emp, yo, pl) => ({
  contacto: emp.contacto || '',
  mi_nombre: yo || '(NOMBRE Y APELLIDO)',
  empresa: emp.nombre || 'su empresa',
  correo_centro: pl.correo || 'nuestro correo',
  centro: pl.centro || '',
})
const asuntoPlantilla = (emp, pl = PLANTILLA_DEFECTO) =>
  rellenar(pl.asunto, variablesPlantilla(emp, '', pl), false).replace(/\s+/g, ' ').trim()

const plantillaHtml = (emp, yo, pl = PLANTILLA_DEFECTO) => {
  const v = variablesPlantilla(emp, yo, pl)
  // «Buenos días ,» queda raro si no hay persona de contacto
  const cuerpo = cuerpoHtml(rellenar(pl.cuerpo, v, false).replace(/ +,/g, ','))
  const lineas = [rellenar(pl.equipo, v, false)].filter(Boolean).map(esc).join('<br>')
  const dir = String(pl.direccion || '').split('\n').map((l) => l.trim()).filter(Boolean).map(esc).join('<br>')
  const web = String(pl.web || '').trim()
  const legal = 'font-family:Tahoma,Verdana,sans-serif;font-size:11px;line-height:1.7;color:#002e7a;text-align:justify;margin:0'
  const firma = `
<div style="font-family:Tahoma,Verdana,sans-serif;font-size:13px;color:${AZUL};margin-top:24px">
  <b>${esc(yo || '(NOMBRE Y APELLIDO)')}</b><br>
  ${lineas}<br><br>
  ${pl.entidad ? `<b>${esc(pl.entidad)}</b><br>` : ''}
  ${dir ? `${dir}<br>` : ''}
  ${web ? `<a href="${esc(/^https?:/.test(web) ? web : 'https://' + web)}" style="color:#1155cc">${esc(web)}</a><br>` : ''}<br>
  <img src="${LOGO_URL}" alt="IAESTE Madrid" width="240" height="73" style="display:block;border:0"><br>
</div>
<p style="${legal}">${'-'.repeat(134)}</p>
<p style="${legal}"><b><u>Legal notice</u>:</b></p>
<p style="${legal}"><b><u>Data protection</u>.</b> IAESTE ESPAÑA informs you that your email address, as well as the rest of your personal data, will be used for contacting you and providing you with our services. This data is necessary to communicate with you, which allows us to use your information within legal limits. Additionally, entities which require access to your information so that we can provide our services may have access to it. We will keep your data during our relationship and for the period required by applicable law. You may contact us at any time to find out the information we have on you, correct it if it is incorrect and delete it once our relationship has ended. You also have the right to request the transfer of your information to another entity (portability). To request any of these rights, you must make a written request to our address, along with a photocopy of your DNI identity document: IAESTE ESPAÑA, UNIVERSIDAD POLITÉCNICA DE VALENCIA, EDIFICIO 8K, PLANTA BAJA, ALA OESTE, DESPACHOS 11-13,CP 46022 VALENCIA. In case of considering your rights to have been neglected, you can lodge a claim before the Spanish Data Protection Agency (<a href="https://www.agpd.es" style="color:#1155cc">www.agpd.es</a>).</p>
<p style="${legal}"><b><u>Confidentiality</u>.</b> - The content of this communication, as well as all documentation attached, is confidential and intended for its recipient. In the case of you not being the intended recipient, we request that you notify us and do not communicate its content to third parties, proceeding to delete it.</p>
<p style="${legal}"><b><u>Exemption from liability</u>.</b> - The sending of this communication does not entail the sender’s obligation to monitor the absence of viruses, worms, trojan horses and/or any other harmful computer program, the recipient having to have the necessary hardware and software tools to guarantee both the security of their information system and the detection and elimination of harmful computer programs. IAESTE ESPAÑA is not liable for liquidated damages that such computer programs may cause to the recipient.</p>`
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">${cuerpo}</div>${firma}`
}

// Versión en texto plano (por si el destino del pegado no acepta HTML)
const htmlATexto = (html) => {
  const d = document.createElement('div')
  d.innerHTML = html.replace(/<\/(p|li|div)>/g, '</$1>\n').replace(/<li>/g, '<li>- ')
  return d.innerText.replace(/\n{3,}/g, '\n\n').trim()
}

// Copia la plantilla con formato al portapapeles. Devuelve true si se ha podido.
const copiarPlantilla = async (emp, yo, pl) => {
  const html = plantillaHtml(emp, yo, pl)
  const texto = htmlATexto(html)
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([texto], { type: 'text/plain' }),
      })])
      return true
    }
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}

// ---------- UI básicos ----------
const Badge = ({ estadoId }) => {
  const e = estadoDe(estadoId)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${e.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${e.dot}`} />
      {e.label}
    </span>
  )
}

const Input = (props) => (
  <input
    {...props}
    className={`w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0e2d4d]/30 focus:border-[#0e2d4d] ${props.className || ''}`}
  />
)

const Label = ({ children }) => (
  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{children}</label>
)

const Btn = ({ children, variant = 'primary', ...props }) => {
  const styles = {
    primary: 'bg-[#0e2d4d] hover:bg-[#163d63] text-white shadow-sm',
    ghost: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300',
    danger: 'bg-white hover:bg-rose-50 text-rose-600 border border-rose-200',
  }
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 ${styles[variant]} ${props.className || ''}`}
    >
      {children}
    </button>
  )
}

// ---------- Seguridad de las cuentas ----------
// Dominios de correo temporal / desechable. Es solo una primera barrera para avisar al momento:
// el bloqueo de verdad lo hace Supabase con el hook «Before User Created» (auth_seguridad.sql),
// que usa su propia lista. Si añades un dominio aquí, añádelo también allí.
const DOMINIOS_DESECHABLES = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la', 'pokemail.net', 'spam4.me',
  '10minutemail.com', '10minutemail.net', '10minutemail.co.uk', '10minemail.com', '20minutemail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmail.dev',
  'tempmailo.com', 'tempmail.plus', 'tempr.email', 'tempail.com', 'temporary-mail.net', 'tmpmail.org', 'tmpmail.net', 'tmail.ws', 'throwawaymail.com', 'trashmail.com',
  'trashmail.net', 'trashmail.de', 'trash-mail.com', 'yopmail.com', 'yopmail.net', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx',
  'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf', 'dispostable.com', 'getnada.com', 'nada.email', 'maildrop.cc',
  'mailnesia.com', 'mailcatch.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'fakeinbox.com', 'fakemail.net', 'fake-mail.net', 'spamgourmet.com', 'spambox.us',
  'mytemp.email', 'mailpoof.com', 'moakt.com', 'moakt.cc', 'tempinbox.com', 'inboxkitten.com', 'burnermail.io', 'mail.tm', 'mail.gw', 'emailfake.com',
  'email-fake.com', 'crazymailing.com', 'disposablemail.com', 'discard.email', 'discardmail.com', 'discardmail.de', 'harakirimail.com', 'incognitomail.org', 'mailforspam.com', 'spamfree24.org',
  'mailtemp.net', 'luxusmail.org', 'tempmailaddress.com', 'emltmp.com', 'mailinator.net', 'mailinator2.com', 'binkmail.com', 'bobmail.info', 'chammy.info', 'devnullmail.com',
  'letthemeatspam.com', 'mailinater.com', 'notmailinator.com', 'reallymymail.com', 'safetymail.info', 'sogetthis.com', 'spamherelots.com', 'thisisnotmyrealemail.com', 'tradermail.info', 'veryrealemail.com',
  'zippymail.info', 'mailexpire.com', 'meltmail.com', 'spamex.com', 'anonbox.net', 'anonymbox.com', 'owlymail.com', 'tempmailer.com', 'temp-mail.ru', 'dropmail.me',
  'mailsac.com', 'inboxbear.com', 'linshiyouxiang.net', 'mail7.io', 'smailpro.com', 'byom.de', 'wegwerfmail.de', 'wegwerfmail.net', 'einrot.com', 'cuvox.de',
  'dayrep.com', 'fleckens.hu', 'gustr.com', 'jourrapide.com', 'rhyta.com', 'superrito.com', 'teleworm.us', 'armyspy.com', 'zetmail.com', 'vomoto.com',
])
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i
// Devuelve el motivo por el que un email no vale para registrarse, o '' si vale
const problemaEmail = (email) => {
  const e = String(email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(e) || e.length > 254) return 'Ese email no tiene un formato válido.'
  const dominio = e.split('@')[1]
  const partes = dominio.split('.')
  for (let i = 0; i < partes.length - 1; i++) {
    if (DOMINIOS_DESECHABLES.has(partes.slice(i).join('.'))) return 'No se admiten correos temporales o desechables. Usa tu email personal o el de la universidad.'
  }
  return ''
}
// Contraseñas: mínimo 8 caracteres, con letras y números (pon el mismo mínimo en Supabase)
const PASS_MIN = 8
const problemaPass = (p) =>
  p.length < PASS_MIN ? `La contraseña necesita al menos ${PASS_MIN} caracteres.`
    : !/[a-zA-Z]/.test(p) || !/[0-9]/.test(p) ? 'La contraseña tiene que llevar letras y números.'
      : ''
// Traduce los errores de Supabase Auth a mensajes claros (sin revelar si un email tiene cuenta)
const errorAuth = (e) => {
  const m = e?.message || ''
  const code = e?.code || ''
  if (code === 'invalid_credentials' || m === 'Invalid login credentials') return 'Email o contraseña incorrectos.'
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(m)) return 'NO_CONFIRMADO'
  if (code === 'user_already_exists' || /already registered/i.test(m)) return 'Ya hay una cuenta con ese email (el nombre da igual). Entra con «Iniciar sesión»; si no recuerdas la contraseña, usa «¿Has olvidado tu contraseña?» o pídesela a un admin.'
  if (e?.status === 429 || /rate limit|security purposes/i.test(m)) return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.'
  if (code === 'weak_password' || /password/i.test(m) && /weak|short|characters/i.test(m)) return `Contraseña demasiado débil: mínimo ${PASS_MIN} caracteres, con letras y números.`
  if (code === 'same_password') return 'La contraseña nueva tiene que ser distinta de la anterior.'
  // Mensaje del hook de Supabase que bloquea correos desechables
  if (/desechable|temporal/i.test(m)) return m
  return m || 'Ha habido un error. Inténtalo de nuevo.'
}
// Al volver de un enlace de email caducado o ya usado, Supabase añade #error=…&error_code=… a la URL
const leerErrorEnlace = () => {
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const q = new URLSearchParams(window.location.search)
  const code = h.get('error_code') || q.get('error_code')
  if (!code && !h.get('error') && !q.get('error')) return ''
  window.history.replaceState(null, '', window.location.pathname)
  return code === 'otp_expired'
    ? 'El enlace ha caducado o ya se ha usado. Pide uno nuevo.'
    : (h.get('error_description') || q.get('error_description') || 'El enlace no es válido.').replace(/\+/g, ' ')
}

// ---------- Cambiar mi contraseña (también al volver de un enlace de recuperación) ----------
function CambiarContrasena({ recuperacion, onClose }) {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const guardar = async () => {
    setErr('')
    const prob = problemaPass(p1)
    if (prob) { setErr(prob); return }
    if (p1 !== p2) { setErr('Las dos contraseñas no coinciden.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: p1 })
    setBusy(false)
    if (error) setErr(errorAuth(error))
    else setOk(true)
  }
  // Si se llega desde el enlace de recuperación y se cancela, se cierra la sesión: el enlace
  // solo sirve para poner una contraseña nueva, no para entrar sin ella.
  const cerrar = async () => {
    if (recuperacion && !ok) await supabase.auth.signOut()
    onClose()
  }
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" onClick={recuperacion ? undefined : cerrar}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><KeyRound className="w-4 h-4" />{recuperacion ? 'Elige una contraseña nueva' : 'Cambiar mi contraseña'}</h2>
        {ok ? (
          <>
            <p className="text-sm text-emerald-700">Contraseña cambiada ✓ La próxima vez entra con la nueva.</p>
            <Btn onClick={onClose} className="w-full">Cerrar</Btn>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500">Mínimo {PASS_MIN} caracteres, con letras y números.</p>
            <div><Label>Contraseña nueva</Label><Input type="password" autoComplete="new-password" autoFocus value={p1} onChange={(e) => setP1(e.target.value)} /></div>
            <div><Label>Repítela</Label><Input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && guardar()} /></div>
            {err && <p className="text-sm text-rose-600">{err}</p>}
            <div className="flex gap-2 justify-end">
              <Btn variant="ghost" onClick={cerrar}>{recuperacion ? 'Cancelar y salir' : 'Cancelar'}</Btn>
              <Btn onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------- Login / Registro / He olvidado mi contraseña ----------
function Auth() {
  // Con ?registro en el enlace (https://…/?registro) se abre directamente en «Crear cuenta»
  const [modo, setModo] = useState(() =>
    new URLSearchParams(window.location.search).has('registro') ? 'registro' : 'login'
  ) // login | registro | olvido
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [err, setErr] = useState(() => leerErrorEnlace())
  const [info, setInfo] = useState('')
  const [sinConfirmar, setSinConfirmar] = useState('') // email pendiente de confirmar (para reenviar)
  const [busy, setBusy] = useState(false)
  const [centros, setCentros] = useState([])
  const [centro, setCentro] = useState('')
  const volverA = window.location.origin

  // Lista de centros para el registro (la tabla se puede leer sin sesión)
  useEffect(() => {
    supabase.from('centros').select('id, nombre').order('orden').then(({ data }) => setCentros(data || []))
  }, [])

  const cambiarModo = (m) => { setModo(m); setErr(''); setInfo(''); setSinConfirmar(''); setPass(''); setPass2('') }

  // «He olvidado mi contraseña»: la respuesta es siempre la misma, exista o no la cuenta
  const recuperar = async () => {
    setErr(''); setInfo('')
    const e = email.trim().toLowerCase()
    if (!EMAIL_RE.test(e)) { setErr('Escribe un email válido.'); return }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo: volverA })
    setBusy(false)
    if (error && (error.status === 429 || /rate limit|security purposes/i.test(error.message))) {
      setErr('Has pedido varios enlaces seguidos. Espera unos minutos y vuelve a probar.')
      return
    }
    setInfo('Si el correo existe, se ha enviado un enlace para elegir una contraseña nueva. Caduca en 30 minutos y solo sirve una vez. Revisa también el spam.')
  }

  const reenviarConfirmacion = async () => {
    setErr(''); setInfo(''); setBusy(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email: sinConfirmar, options: { emailRedirectTo: volverA } })
    setBusy(false)
    if (error) setErr(errorAuth(error))
    else setInfo('Te hemos reenviado el email de confirmación. Revisa también el spam.')
  }

  const enviar = async () => {
    setErr(''); setInfo(''); setSinConfirmar('')
    const e = email.trim().toLowerCase()
    try {
      if (modo === 'registro') {
        if (!nombre.trim()) throw new Error('Indica tu nombre.')
        if (centros.length && !centro) throw new Error('Elige tu centro.')
        const probE = problemaEmail(e)
        if (probE) throw new Error(probE)
        const probP = problemaPass(pass)
        if (probP) throw new Error(probP)
        if (pass !== pass2) throw new Error('Las dos contraseñas no coinciden.')
        setBusy(true)
        const { data, error } = await supabase.auth.signUp({
          email: e,
          password: pass,
          options: { data: { nombre: nombre.trim(), ...(centro ? { centro } : {}) }, emailRedirectTo: volverA },
        })
        if (error) throw error
        // Con «Confirm email» activado en Supabase no hay sesión hasta pulsar el enlace del correo.
        // (Si el email ya tenía cuenta, Supabase responde igual: así no se revela quién está registrado.)
        if (!data.session) {
          setInfo(`Te hemos enviado un email a ${e}. Pulsa el enlace para activar tu cuenta y después entra aquí. Revisa también el spam.`)
          setPass(''); setPass2('')
        }
      } else {
        if (!e || !pass) throw new Error('Escribe tu email y tu contraseña.')
        setBusy(true)
        const { error } = await supabase.auth.signInWithPassword({ email: e, password: pass })
        if (error) throw error
      }
    } catch (x) {
      const m = errorAuth(x)
      if (m === 'NO_CONFIRMADO') {
        setSinConfirmar(e)
        setErr('Todavía no has confirmado tu email. Abre el enlace que te enviamos al registrarte.')
      } else setErr(m)
    } finally {
      setBusy(false)
    }
  }

  const alPulsarEnter = (ev) => ev.key === 'Enter' && (modo === 'olvido' ? recuperar() : enviar())

  return (
    <div className="min-h-screen bg-[#f4f6fa] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-700 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">CRM IAESTE</h1>
            <p className="text-xs text-slate-500">Gestión de empresas</p>
          </div>
        </div>
        {modo === 'olvido' ? (
          <div className="mb-5">
            <h2 className="font-semibold text-slate-900">¿Has olvidado tu contraseña?</h2>
            <p className="text-xs text-slate-500 mt-1">Escribe el email de tu cuenta y te enviaremos un enlace para elegir una nueva.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 bg-slate-100 rounded-lg p-0.5 mb-5">
            {[['login', 'Entrar'], ['registro', 'Crear cuenta']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => cambiarModo(id)}
                className={`py-1.5 rounded-md text-sm font-medium ${modo === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {modo === 'registro' && (
          <p className="text-xs text-slate-500 mb-3">
            Crea tu cuenta con tu nombre y un email real: te llegará un correo para activarla antes de poder entrar.
          </p>
        )}
        <div className="space-y-3">
          {modo === 'registro' && (
            <div><Label>Nombre</Label><Input value={nombre} autoComplete="name" onChange={(e) => setNombre(e.target.value)} placeholder="Mario" /></div>
          )}
          {modo === 'registro' && centros.length > 0 && (
            <div>
              <Label>Centro</Label>
              <select value={centro} onChange={(e) => setCentro(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0e2d4d]/30 ${centro ? 'border-slate-300 text-slate-900' : 'border-slate-300 text-slate-400'}`}>
                <option value="">Elige tu comité…</option>
                {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
          <div><Label>Email</Label><Input type="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={alPulsarEnter} /></div>
          {modo !== 'olvido' && (
            <div><Label>Contraseña</Label><Input type="password" autoComplete={modo === 'registro' ? 'new-password' : 'current-password'} value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={alPulsarEnter} /></div>
          )}
          {modo === 'registro' && (
            <>
              <div><Label>Repite la contraseña</Label><Input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} onKeyDown={alPulsarEnter} /></div>
              <p className="text-[11px] text-slate-400 -mt-1">Mínimo {PASS_MIN} caracteres, con letras y números.</p>
            </>
          )}
          {err && <p className="text-sm text-rose-600 flex items-start gap-1"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{err}</p>}
          {sinConfirmar && (
            <button onClick={reenviarConfirmacion} disabled={busy} className="w-full text-center text-xs font-medium text-blue-700 hover:underline">
              Reenviar el email de confirmación
            </button>
          )}
          {info && <p className="text-sm text-emerald-700">{info}</p>}
          {modo === 'olvido' ? (
            <>
              <Btn onClick={recuperar} disabled={busy} className="w-full">
                <Mail className="w-4 h-4" />{busy ? 'Un momento…' : 'Enviar enlace'}
              </Btn>
              <button onClick={() => cambiarModo('login')} className="w-full text-center text-xs text-slate-500 hover:text-[#0e2d4d] hover:underline">
                Volver a entrar
              </button>
            </>
          ) : (
            <>
              <Btn onClick={enviar} disabled={busy} className="w-full">
                <KeyRound className="w-4 h-4" />
                {busy ? 'Un momento…' : modo === 'login' ? 'Entrar' : 'Crear cuenta'}
              </Btn>
              {modo === 'login' && (
                <button onClick={() => cambiarModo('olvido')} disabled={busy} className="w-full text-center text-xs text-slate-500 hover:text-[#0e2d4d] hover:underline">
                  ¿Has olvidado tu contraseña?
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Acciones rápidas: llamar / email / plantilla ----------
function AccionesContacto({ emp, yo, plantilla = PLANTILLA_DEFECTO, onEmail }) {
  const [copiada, setCopiada] = useState(null) // null | 'ok' | 'error'
  if (!emp.telefono && !emp.email) return null
  const tel = String(emp.telefono || '').replace(/\s/g, '')
  const usarPlantilla = () => {
    // Se llama dentro del clic (antes de que se abra la pestaña de Gmail) para que el navegador permita copiar
    copiarPlantilla(emp, yo, plantilla).then((ok) => {
      setCopiada(ok ? 'ok' : 'error')
      setTimeout(() => setCopiada(null), 8000)
      // Al enviar el correo se marca la empresa y se cierra la ficha
      onEmail?.(ok ? 'plantilla' : 'plantilla_error')
    })
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {emp.telefono && (
          <a href={`tel:${tel}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Phone className="w-3.5 h-3.5" />Llamar
          </a>
        )}
        {emp.email && (
          <>
            <a href={gmailUrl(emp.email)} target="_blank" rel="noopener noreferrer"
              onClick={() => onEmail?.('email')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Mail className="w-3.5 h-3.5" />Email
            </a>
            <a href={gmailUrl(emp.email, asuntoPlantilla(emp, plantilla))} target="_blank" rel="noopener noreferrer"
              title="Copia la plantilla con formato y abre Gmail: pega con Ctrl+V en el cuerpo"
              onClick={usarPlantilla}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700 hover:bg-blue-100">
              <Send className="w-3.5 h-3.5" />Plantilla de contacto
            </a>
          </>
        )}
      </div>
      {copiada === 'ok' && (
        <p className="text-xs text-emerald-700">Plantilla copiada. En Gmail, haz clic en el cuerpo del correo y pega con Ctrl+V (Cmd+V en Mac). Recuerda adjuntar la presentación y el modelo de convenio.</p>
      )}
      {copiada === 'error' && (
        <p className="text-xs text-red-600">No se ha podido copiar la plantilla. Vuelve a pulsar el botón con esta pestaña en primer plano.</p>
      )}
    </div>
  )
}

// ---------- Modal de empresa ----------
function EmpresaModal({ empresa, users, asignables = users, centros = [], isAdmin, me, todas = [], onSaved, onDeleted, onClose }) {
  const nueva = !empresa
  const [fForm, setF] = useState(
    empresa || { nombre: '', cif: '', sector: '', contacto: '', email: '', telefono: '', direccion: '', responsable: null, estado: 'sin_contactar', notas: '', proximo_contacto: null }
  )
  const f = fForm
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [nuevaNota, setNuevaNota] = useState('')
  const [abrirNota, setAbrirNota] = useState(nueva)
  const [prac, setPrac] = useState({ anio: new Date().getFullYear(), num: 1 })
  const [addPrac, setAddPrac] = useState(false)
  const practicas = empresa?.practicas || []
  const [hist, setHist] = useState(null) // null = cargando

  useEffect(() => {
    if (nueva) { setHist([]); return }
    supabase
      .from('historial')
      .select('*')
      .eq('empresa_id', empresa.id)
      .order('creado', { ascending: false })
      .limit(50)
      .then(({ data }) => setHist(data || []))
  }, [nueva, empresa?.id])

  // Un miembro puede rellenar todos los campos al CREAR una empresa.
  // Al editar una existente puede tocar los datos de contacto (persona, teléfono,
  // email, dirección), el CIF, estado, notas y próximo contacto; nombre, sector y
  // responsable siguen siendo solo de admin.
  const camposEditables = isAdmin || nueva

  const guardar = async (cambios = {}, mensaje, notaAuto = '') => {
    const f = { ...fForm, ...cambios }
    if (camposEditables && !f.nombre.trim()) { setErr('La empresa necesita un nombre.'); return }
    if (cifDup) { setErr(`Ese CIF ya es de «${cifDup.nombre}». No se pueden repetir CIF en el CRM.`); return }
    // Cada seguimiento es una nota nueva; cambiar de estado obliga a escribirla
    const nota = (nuevaNota.trim() || notaAuto).slice(0, 500)
    // La nota es obligatoria al cambiar de estado, salvo en el primer paso desde «Sin contactar»
    if (!nueva && f.estado !== empresa.estado && empresa.estado !== 'sin_contactar' && !nota) {
      setAbrirNota(true)
      setErr('Para cambiar el estado añade una nota de seguimiento contando qué ha pasado.')
      return
    }
    const conNota = nota ? { notas: nota } : {}
    // Al pasar a «Beca conseguida» (o si un admin lo pide) se registran año y nº de prácticas
    const registrar = isAdmin && ((f.estado === 'beca' && (nueva || empresa.estado !== 'beca')) || addPrac)
    const anio = parseInt(prac.anio, 10), num = parseInt(prac.num, 10)
    if (registrar && (!(anio >= 1990 && anio <= 2100) || !(num > 0))) {
      setErr('Indica el año y el número de prácticas conseguidas.')
      return
    }
    setBusy(true); setErr('')
    try {
      let empresaId = f.id
      if (nueva) {
        const { data: creada, error } = await supabase.from('empresas').insert({
          nombre: f.nombre.trim(), cif: f.cif, sector: f.sector, contacto: f.contacto, email: f.email,
          telefono: f.telefono, direccion: f.direccion,
          responsable: isAdmin ? (f.responsable || null) : me.id,
          estado: f.estado,
          notas: nota || null, proximo_contacto: f.proximo_contacto || null, actualizado_por: me.nombre,
        }).select('id').single()
        if (error) throw error
        empresaId = creada.id
      } else {
        const patch = isAdmin
          ? { nombre: f.nombre.trim(), cif: f.cif, sector: f.sector, contacto: f.contacto, email: f.email, telefono: f.telefono, direccion: f.direccion, responsable: f.responsable || null, estado: f.estado, ...conNota, proximo_contacto: f.proximo_contacto || null, actualizado_por: me.nombre }
          : { cif: f.cif, contacto: f.contacto, email: f.email, telefono: f.telefono, direccion: f.direccion, estado: f.estado, ...conNota, proximo_contacto: f.proximo_contacto || null, actualizado_por: me.nombre }
        const { error } = await supabase.from('empresas').update(patch).eq('id', f.id)
        if (error) throw error
      }
      if (registrar) {
        // Si ese año ya tenía prácticas, las nuevas becas se suman a las que había
        const ya = practicas.find((p) => p.anio === anio)
        const { error } = ya
          ? await supabase.from('practicas').update({ num_practicas: (ya.num_practicas || 0) + num }).eq('id', ya.id)
          : await supabase.from('practicas').insert({ empresa_id: empresaId, anio, num_practicas: num, creado_por_nombre: me.nombre })
        if (error) {
          throw new Error(error.code === '23505'
            ? `La empresa se ha guardado, pero ya había prácticas registradas en ${anio}. Recarga la página y vuelve a probar.`
            : `La empresa se ha guardado, pero no se han podido registrar las becas: ${error.message}`)
        }
        const totalAnio = (ya?.num_practicas || 0) + num
        mensaje = mensaje || (ya
          ? `+${num} beca${num !== 1 ? 's' : ''} ✓ · ${totalAnio} en ${anio}`
          : `${num} beca${num !== 1 ? 's' : ''} en ${anio} registrada${num !== 1 ? 's' : ''} ✓ · ya es empresa histórica`)
      }
      onSaved(mensaje)
    } catch (e) {
      // La base de datos también impide CIF repetidos (por si la empresa no se ve desde esta cuenta)
      setErr(e.code === '23505' && /cif/i.test(e.message || '')
        ? 'Ya hay una empresa con ese CIF en el CRM. No se pueden repetir CIF.'
        : e.message)
    } finally {
      setBusy(false)
    }
  }

  const cifDup = cifNorm(f.cif).length > 5 && (nueva || cifNorm(f.cif) !== cifNorm(empresa.cif))
    ? todas.find((c) => c.id !== f.id && cifNorm(c.cif) === cifNorm(f.cif))
    : null
  const nombreResp = (id) => (id === me.id ? 'ti' : users.find((u) => u.id === id)?.nombre || null)

  const borrarPracticas = async (p) => {
    if (!confirm(`¿Quitar las prácticas de ${p.anio || 'año sin registrar'}? Si no le quedan otras, dejará de ser histórica.`)) return
    const { error } = await supabase.from('practicas').delete().eq('id', p.id)
    if (error) { setErr(error.message); return }
    onSaved('Registro de prácticas eliminado')
  }

  const cambiarNumBecas = async (p, delta) => {
    const n = (p.num_practicas || 0) + delta
    if (n < 1) { borrarPracticas(p); return }
    const { error } = await supabase.from('practicas').update({ num_practicas: n }).eq('id', p.id)
    if (error) { setErr(error.message); return }
    onSaved(`${p.anio || 'Ese año'}: ${n} beca${n !== 1 ? 's' : ''}`)
  }

  const eliminar = async () => {
    if (!confirm('¿Eliminar esta empresa?')) return
    const { error } = await supabase.from('empresas').delete().eq('id', f.id)
    if (error) { setErr(error.message); return }
    onDeleted()
  }

  // Al pulsar «Email» o «Plantilla de contacto» en una empresa existente: se guarda la ficha,
  // si estaba sin contactar / sin respuesta pasa a «Mail enviado» (cuenta como contacto) y se cierra.
  const alEnviarCorreo = (tipo) => {
    if (nueva) return
    const pasa = ['sin_contactar', 'no_contesta'].includes(f.estado)
    const cambios = pasa ? { estado: 'mail_enviado' } : {}
    const notaAuto = pasa ? (tipo === 'email' ? 'Mail enviado' : 'Mail enviado con la plantilla de contacto') : ''
    const msg = tipo === 'plantilla'
      ? 'Plantilla copiada: pégala en Gmail con Ctrl+V' + (pasa ? ' · marcada como Mail enviado' : '')
      : tipo === 'plantilla_error'
        ? 'No se pudo copiar la plantilla: escríbela a mano en Gmail' + (pasa ? ' · marcada como Mail enviado' : '')
        : (pasa ? 'Marcada como Mail enviado ✓' : 'Guardado ✓')
    guardar(cambios, msg, notaAuto)
  }

  // Línea de seguimientos: cada cambio de estado con su nota, cada nota suelta y el resto de movimientos
  const seguimientos = (() => {
    if (!hist) return null
    const notaDe = new Map(hist.filter((h) => h.accion === 'nota').map((h) => [claveSeg(h), h]))
    const usadas = new Set()
    const out = []
    for (const h of hist) {
      if (h.accion === 'estado') {
        const n = notaDe.get(claveSeg(h))
        if (n) usadas.add(n.id)
        out.push({ ...h, texto: n?.detalle || '' })
      } else if (h.accion === 'nota') {
        if (!usadas.has(h.id) && !hist.some((e) => e.accion === 'estado' && claveSeg(e) === claveSeg(h))) out.push({ ...h, texto: h.detalle })
      } else out.push(h)
    }
    return out
  })()
  const estadoCambiado = !nueva && f.estado !== empresa.estado
  const notaObligatoria = estadoCambiado && empresa.estado !== 'sin_contactar'

  const camposContacto = (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label>Persona de contacto</Label><Input value={f.contacto || ''} onChange={(e) => set('contacto', e.target.value)} /></div>
        <div><Label>Teléfono</Label><Input type="tel" inputMode="tel" autoComplete="off" value={f.telefono || ''} onChange={(e) => set('telefono', e.target.value)} placeholder="+34 600 000 000" /></div>
      </div>
      <div><Label>Email</Label><Input type="email" inputMode="email" autoCapitalize="none" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
      <div><Label>Dirección</Label><Input value={f.direccion || ''} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle, número, ciudad" /></div>
      {f.direccion && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.direccion)}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-blue-700 hover:underline"><MapPin className="w-3.5 h-3.5" />Ver en el mapa</a>
      )}
      <AccionesContacto emp={f} yo={me.nombre} plantilla={plantillaDe(centros, me.centro || 'TLMA')} onEmail={alEnviarCorreo} />
    </>
  )

  // Un miembro puede ver todas las empresas, pero solo editar las suyas
  if (!isAdmin && !nueva && empresa.responsable !== me.id) {
    const dato = (Icono, v, href) => v && (
      <p className="flex items-start gap-2"><Icono className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline break-all">{v}</a> : <span className="break-words">{v}</span>}</p>
    )
    return (
      <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
            <h2 className="font-bold text-slate-900">{f.nombre}</h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-4 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <span className="flex items-center gap-2"><User className="w-4 h-4 text-slate-400" />
                {empresa.responsable ? <>La lleva <strong>{nombreResp(empresa.responsable) || 'otra persona'}</strong></> : 'Sin asignar'}
                <span className="text-slate-400">· {empresa.centro ? (centros.find((c) => c.id === empresa.centro)?.id || empresa.centro) : 'Bote común'}</span></span>
              <Badge estadoId={f.estado} />
            </div>
            {empresa.historica && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
                <Star className="w-4 h-4 mt-0.5 shrink-0 fill-amber-500 text-amber-500" />
                <span><strong>Empresa histórica</strong>{practicas.length ? <>: nos firmó prácticas en {textoPracticas(practicas)}.</> : '.'}</span>
              </p>
            )}
            <div className="space-y-2">
              {f.cif && <p><span className="text-slate-400">CIF:</span> {f.cif}</p>}
              {f.sector && <p><span className="text-slate-400">Sector:</span> {f.sector}</p>}
              {dato(User, f.contacto)}
              {dato(Phone, f.telefono, f.telefono ? `tel:${String(f.telefono).replace(/\s/g, '')}` : null)}
              {dato(Mail, f.email)}
              {dato(MapPin, f.direccion, f.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.direccion)}` : null)}
            </div>
            <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
              Solo puede editarla {empresa.responsable ? 'su responsable' : 'quien la tenga asignada'} o un admin. Si quieres llevarla tú, pídeselo a un admin.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-bold text-slate-900">{nueva ? 'Nueva empresa' : f.nombre}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {practicas.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="flex items-start gap-2">
                <Star className="w-4 h-4 mt-0.5 shrink-0 fill-amber-500 text-amber-500" />
                <span><strong>Empresa histórica:</strong> nos firmó prácticas en {textoPracticas(practicas)}.</span>
              </p>
              {practicas.filter((p) => p.notas).map((p) => (
                <p key={`n${p.id}`} className="text-xs text-amber-800 mt-1 pl-6">{p.notas}</p>
              ))}
              {isAdmin && (
                <div className="flex flex-wrap gap-1.5 mt-2 pl-6">
                  {practicas.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-amber-200 text-xs">
                      {p.anio || '¿año?'} · {p.num_practicas || 0} beca{p.num_practicas !== 1 ? 's' : ''}
                      <button onClick={() => cambiarNumBecas(p, -1)} title="Una beca menos" className="px-1 rounded text-amber-600 hover:bg-amber-100 font-bold">−</button>
                      <button onClick={() => cambiarNumBecas(p, 1)} title="Una beca más" className="px-1 rounded text-amber-600 hover:bg-amber-100 font-bold">+</button>
                      <button onClick={() => borrarPracticas(p)} title="Quitar este año" className="text-amber-400 hover:text-rose-600"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {camposEditables ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Empresa</Label><Input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} /></div>
                <div><Label>CIF</Label><Input value={f.cif || ''} onChange={(e) => set('cif', e.target.value.toUpperCase())} placeholder="B12345678" /></div>
              </div>
              {cifDup && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Esta empresa ya está en el CRM: <strong>{cifDup.nombre}</strong>{cifDup.responsable ? <> (asignada a {nombreResp(cifDup.responsable) || 'otra persona'})</> : ' (sin asignar)'}. No se pueden repetir CIF.</span>
                </p>
              )}
              <div><Label>Sector</Label><Input value={f.sector} onChange={(e) => set('sector', e.target.value)} placeholder="Software, telecos…" /></div>
              {camposContacto}
              {isAdmin ? (
                <div>
                  <Label>Responsable</Label>
                  <select
                    value={f.responsable || ''}
                    onChange={(e) => set('responsable', e.target.value || null)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0e2d4d]/30"
                  >
                    <option value="">Sin asignar{f.historica ? '' : ' (bote común)'}</option>
                    <OpcionesPersonas users={asignables} />
                    {f.responsable && !asignables.some((u) => u.id === f.responsable) && (
                      <option value={f.responsable}>{nombreResp(f.responsable) || 'Otra persona'}</option>
                    )}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Se te asignará a ti como responsable. Después podrás actualizar los datos de contacto, estado, notas y próximo contacto; para cambiar nombre o sector, pídeselo a un admin.
                </p>
              )}
            </>
          ) : (
            <>
              {f.sector && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
                  <p><span className="text-slate-400">Sector:</span> {f.sector}</p>
                </div>
              )}
              <div><Label>CIF</Label><Input value={f.cif || ''} onChange={(e) => set('cif', e.target.value.toUpperCase())} placeholder="B12345678" /></div>
              {camposContacto}
            </>
          )}
          <div>
            <Label>Estado</Label>
            <div className="flex flex-wrap gap-2">
              {ESTADOS.filter((e) => !e.oculto || e.id === empresa?.estado).map((e) => (
                <button
                  key={e.id}
                  onClick={() => set('estado', e.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    f.estado === e.id ? `${e.color} ring-2 ring-offset-1 ring-[#0e2d4d]` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
          {isAdmin && ((f.estado === 'beca' && (nueva || empresa.estado !== 'beca')) || addPrac) ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900 mb-2">Becas conseguidas</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Año</Label><Input type="number" inputMode="numeric" min="1990" max="2100" value={prac.anio} onChange={(e) => setPrac((p) => ({ ...p, anio: e.target.value }))} /></div>
                <div><Label>Nº de becas</Label><Input type="number" inputMode="numeric" min="1" value={prac.num} onChange={(e) => setPrac((p) => ({ ...p, num: e.target.value }))} /></div>
              </div>
              <p className="text-xs text-emerald-800 mt-2">
                {practicas.some((p) => p.anio === parseInt(prac.anio, 10))
                  ? `Ya hay ${practicas.find((p) => p.anio === parseInt(prac.anio, 10)).num_practicas} en ${prac.anio}: estas se suman. Cada beca da sus puntos a quien lleva la empresa.`
                  : 'Al guardar, la empresa queda como histórica con este año. Cada beca da sus puntos a quien lleva la empresa.'}
              </p>
              {addPrac && (
                <button onClick={() => setAddPrac(false)} className="text-xs text-slate-500 hover:underline mt-1">Cancelar</button>
              )}
            </div>
          ) : !isAdmin && f.estado === 'beca' && empresa?.estado !== 'beca' ? (
            <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              ¡Enhorabuena! Un admin registrará el año y cuántas becas son (puede ser más de una): cada una te suma puntos.
            </p>
          ) : isAdmin && (
            <button onClick={() => setAddPrac(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 hover:underline">
              <Star className="w-3.5 h-3.5" />{f.estado === 'beca' || practicas.length ? 'Añadir más becas' : 'Marcar como histórica (registrar prácticas de un año)'}
            </button>
          )}
          <div>
            <Label>Próximo contacto</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={f.proximo_contacto || ''}
                onChange={(e) => set('proximo_contacto', e.target.value || null)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0e2d4d]/30"
              />
              {[['+1 sem', 7], ['+2 sem', 14], ['+1 mes', 30]].map(([t, n]) => (
                <button key={t} onClick={() => set('proximo_contacto', sumarDias(n))}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50">{t}</button>
              ))}
              {f.proximo_contacto && (
                <button onClick={() => set('proximo_contacto', null)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-400 hover:bg-slate-50">Quitar</button>
              )}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <History className="w-3.5 h-3.5" />Seguimiento
              </p>
              {!abrirNota && !estadoCambiado && (
                <button onClick={() => setAbrirNota(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700 hover:bg-blue-100">
                  <Plus className="w-3.5 h-3.5" />Añadir seguimiento
                </button>
              )}
            </div>
            {(abrirNota || estadoCambiado) && (
              <div className="mb-3">
                {estadoCambiado && (
                  <p className="text-xs text-slate-600 mb-1.5">
                    {estadoDe(empresa.estado).label} → <strong>{estadoDe(f.estado).label}</strong>: cuenta qué ha pasado {notaObligatoria ? <span className="text-rose-600">(obligatorio)</span> : <span className="text-slate-400">(opcional)</span>}
                  </p>
                )}
                <textarea
                  autoFocus
                  value={nuevaNota}
                  onChange={(e) => setNuevaNota(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Llamada del 3/7: interesados, enviar propuesta…"
                  className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#0e2d4d]/30 resize-none ${
                    notaObligatoria && !nuevaNota.trim() ? 'border-rose-300' : 'border-slate-300'
                  }`}
                />
                <p className="text-[11px] text-slate-400 text-right">{nuevaNota.length}/500</p>
              </div>
            )}
            {nueva ? null : seguimientos === null ? (
              <p className="text-xs text-slate-400">Cargando…</p>
            ) : seguimientos.length === 0 ? (
              <p className="text-xs text-slate-400">Sin seguimientos todavía.</p>
            ) : (
              <ol className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {seguimientos.map((h) => (h.accion === 'estado' || h.accion === 'nota') ? (
                  <li key={h.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      {h.accion === 'estado' && h.estado_nuevo ? (
                        <span className={`px-1.5 py-0.5 rounded border font-medium ${estadoDe(h.estado_nuevo).color}`}>
                          {h.estado_anterior ? `${estadoDe(h.estado_anterior).label} → ` : ''}{estadoDe(h.estado_nuevo).label}
                        </span>
                      ) : h.accion === 'estado' ? (
                        <span className="px-1.5 py-0.5 rounded border font-medium bg-emerald-50 text-emerald-700 border-emerald-200">{detalleLegible(h)}</span>
                      ) : null}
                      <span className="text-slate-400">{h.usuario_nombre} · {fecha(h.creado)}</span>
                    </div>
                    {h.texto ? <p className="text-slate-700 whitespace-pre-wrap break-words">{h.texto}</p>
                      : <p className="text-slate-400 italic">Sin nota</p>}
                  </li>
                ) : (
                  <li key={h.id} className="flex gap-2 text-xs px-1">
                    <span className={`shrink-0 px-1.5 py-0.5 rounded border font-medium ${accionDe(h.accion).color}`}>
                      {accionDe(h.accion).label}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-slate-600 break-words">{detalleLegible(h)}</span>
                      <span className="block text-slate-400">{h.usuario_nombre} · {fecha(h.creado)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {f.actualizado && !nueva && (
            <p className="text-xs text-slate-400">Última actualización: {fecha(f.actualizado)}{f.actualizado_por ? ` · ${f.actualizado_por}` : ''}</p>
          )}
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <div className="flex items-center justify-between pt-2">
            {isAdmin && !nueva ? (
              <Btn variant="danger" onClick={eliminar}><Trash2 className="w-4 h-4" />Eliminar</Btn>
            ) : <span />}
            <Btn onClick={() => guardar()} disabled={busy || !!cifDup}><Save className="w-4 h-4" />{busy ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Gráfica: nº de empresas por persona ----------
function GraficaEmpresas({ users, companies }) {
  const datos = users
    .map((u) => ({ id: u.id, nombre: u.nombre, n: companies.filter((c) => c.responsable === u.id).length }))
    .concat([{ id: 'na', nombre: 'Sin asignar', n: companies.filter((c) => !c.responsable).length }])
    .filter((d) => d.n > 0 || d.id !== 'na')
    .sort((a, b) => b.n - a.n)

  const max = Math.max(1, ...datos.map((d) => d.n))
  const hoy = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })

  const descargar = (blob, nombre) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportarCSV = () => {
    const filas = [['Persona', 'Empresas'], ...datos.map((d) => [d.nombre, d.n])]
    const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    descargar(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), 'empresas-por-persona.csv')
  }

  const exportarPNG = () => {
    const E = 2 // escala para que se vea nítido
    const F = 34, TOP = 96, PAD = 28, ANCHO = 900
    const alto = TOP + datos.length * F + 46
    const cv = document.createElement('canvas')
    cv.width = ANCHO * E
    cv.height = alto * E
    const g = cv.getContext('2d')
    g.scale(E, E)

    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, ANCHO, alto)

    g.fillStyle = '#0f172a'
    g.font = 'bold 20px system-ui, sans-serif'
    g.fillText('Empresas por persona', PAD, 42)
    g.fillStyle = '#64748b'
    g.font = '13px system-ui, sans-serif'
    g.fillText(`CRM IAESTE · ${companies.length} empresas · ${hoy}`, PAD, 66)

    const xNom = PAD, anchoNom = 190
    const xBar = xNom + anchoNom + 12
    const anchoBar = ANCHO - xBar - PAD - 50

    datos.forEach((d, i) => {
      const y = TOP + i * F
      g.fillStyle = d.id === 'na' ? '#94a3b8' : '#334155'
      g.font = (d.id === 'na' ? 'italic ' : '') + '14px system-ui, sans-serif'
      let nom = d.nombre
      while (g.measureText(nom).width > anchoNom && nom.length > 3) nom = nom.slice(0, -1)
      if (nom !== d.nombre) nom = nom.slice(0, -1) + '…'
      g.fillText(nom, xNom, y + 16)

      g.fillStyle = '#f1f5f9'
      g.fillRect(xBar, y + 2, anchoBar, 20)
      g.fillStyle = d.id === 'na' ? '#cbd5e1' : '#2563eb'
      g.fillRect(xBar, y + 2, Math.max(2, (d.n / max) * anchoBar), 20)

      g.fillStyle = '#0f172a'
      g.font = 'bold 14px system-ui, sans-serif'
      g.textAlign = 'right'
      g.fillText(String(d.n), ANCHO - PAD, y + 17)
      g.textAlign = 'left'
    })

    cv.toBlob((b) => descargar(b, 'empresas-por-persona.png'), 'image/png')
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] p-6">
      <div className="flex items-baseline justify-between mb-5 gap-3 flex-wrap">
        <h3 className="font-bold text-slate-900">Empresas por persona</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 mr-1">{companies.length} en total</span>
          <button onClick={exportarPNG} className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />PNG
          </button>
          <button onClick={exportarCSV} className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />CSV
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {datos.map((d) => (
          <div key={d.id} className="flex items-center gap-3">
            <span className={`w-32 shrink-0 text-sm truncate ${d.id === 'na' ? 'text-slate-400 italic' : 'text-slate-700'}`}>
              {d.nombre}
            </span>
            <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden">
              <div
                className={`h-full rounded-md ${d.id === 'na' ? 'bg-slate-300' : 'bg-blue-600'}`}
                style={{ width: `${(d.n / max) * 100}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-sm font-semibold text-slate-900 text-right tabular-nums">{d.n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Puntos por persona en [desde, hasta]. Lo usan el panel de admin (Actividad) y el Ranking.
// Cada empresa asignada suma PUNTOS_ESTADO de su estado actual, y cuenta en el periodo en el que
// llegó a ese estado (último cambio de estado del historial). Si no hay registro de cuándo,
// solo cuenta en periodos que empiezan a inicio de curso o antes.
// Además, las quincenas cerradas dentro del periodo suman PUNTOS.quincena si se cumplieron.
function calcularPuntos({ todo, companies, users, desde, hasta, baremo = PUNTOS_DEFECTO, asistencias = [] }) {
  const ini = new Date(desde + 'T00:00:00')
  const fin = new Date(diaMas(hasta, 1) + 'T00:00:00')
  const nombreDeUsuario = (id) => users.find((u) => u.id === id)?.nombre || '—'

  const llegada = {}
  for (const h of todo) {
    if (h.accion !== 'estado') continue
    const prev = llegada[h.empresa_id]
    if (!prev || new Date(h.creado) >= new Date(prev.creado)) llegada[h.empresa_id] = h
  }

  const resumen = {}
  const de = (id) => (resumen[id] ||= { id, nombre: nombreDeUsuario(id), contactadas: 0, cerradas: 0, becas: 0, quincenas: 0, reuniones: 0, puntos: 0, filas: [] })

  for (const c of companies) {
    const pts = baremo.estados[c.estado] ?? 0
    if (!c.responsable || !pts) continue
    const l = llegada[c.id]
    const cuando = l && l.estado_nuevo === c.estado ? l.creado : null
    const dentro = cuando ? new Date(cuando) >= ini && new Date(cuando) < fin : desde <= INICIO_CURSO()
    if (!dentro) continue
    const r = de(c.responsable)
    const nBecas = c.estado === 'beca' ? becasDe(c, cuando) : 0
    const total = nBecas > 1 ? pts * nBecas : pts
    r.puntos += total
    if (CONTACTADAS.includes(c.estado)) r.contactadas++; else r.cerradas++
    r.becas += nBecas
    r.filas.push({ id: `e-${c.id}`, tipo: 'empresa', empresa_nombre: c.nombre, estado: c.estado, creado: cuando, puntos: total,
      detalle: nBecas > 1 ? `${nBecas} becas` : '' })
  }

  // Si el centro ha puesto la quincena a 0, no hay bonus de quincena
  for (const [uid, qs] of Object.entries(baremo.quincena ? evaluarQuincenas(todo, companies, hasta) : {})) {
    for (const q of qs) {
      const ultimo = diaMas(q.fin, -1)
      if (q.enCurso || ultimo < desde || ultimo > hasta) continue
      const r = de(uid)
      if (q.cumple) { r.quincenas++; r.puntos += baremo.quincena }
      r.filas.push({
        id: `q-${uid}-${q.ini}`, tipo: 'quincena', creado: q.fin + 'T00:00:00', puntos: q.cumple ? baremo.quincena : 0,
        empresa_nombre: `Quincena ${fechaCorta(q.ini)} – ${fechaCorta(ultimo)}`,
        detalle: q.cumple ? `${q.hechas}/${q.total} empresas seguidas` : `${q.hechas}/${q.total} · faltó: ${q.faltan.map((c) => c.nombre).filter(Boolean).join(', ')}`,
      })
    }
  }

  // Reuniones: cuentan el día de la reunión
  for (const a of asistencias) {
    if (a.fecha < desde || a.fecha > hasta) continue
    const r = de(a.usuario_id)
    r.reuniones++
    r.puntos += a.puntos || 0
    r.filas.push({ id: `r-${a.reunion_id}-${a.usuario_id}`, tipo: 'reunion', empresa_nombre: a.titulo, creado: a.fecha + 'T12:00:00', puntos: a.puntos || 0 })
  }

  users.forEach((u) => de(u.id))
  for (const r of Object.values(resumen)) r.filas.sort((a, b) => new Date(b.creado || 0) - new Date(a.creado || 0))
  // Solo la gente que se ha pasado en «users» (la del centro): cada centro tiene sus propios puntos
  const ids = new Set(users.map((u) => u.id))
  const lista = Object.values(resumen).filter((r) => ids.has(r.id)).sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre))
  return { lista }
}

// ---------- Actividad y puntos del equipo (a partir del historial) ----------
function Actividad({ users, companies, baremo = PUNTOS_DEFECTO, centro }) {
  const [desde, setDesde] = useState(INICIO_CURSO())
  const [hasta, setHasta] = useState(HOY())
  const [todo, setTodo] = useState(null) // historial completo hasta «hasta» (hace falta el anterior para las quincenas)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [abierto, setAbierto] = useState('')
  const [recarga, setRecarga] = useState(0)
  const [limpiando, setLimpiando] = useState(false)
  const [asistencias, setAsistencias] = useState([])
  useEffect(() => { traerAsistencias(centro).then(setAsistencias) }, [centro, recarga])

  useEffect(() => {
    setTodo(null); setErr('')
    traerTodo(() => supabase
      .from('historial')
      .select('id, empresa_id, usuario_id, usuario_nombre, empresa_nombre, accion, detalle, estado_anterior, estado_nuevo, creado')
      .lte('creado', hasta + 'T23:59:59')
      .order('creado', { ascending: false })
      .order('id', { ascending: false }))
      .then(setTodo)
      .catch((e) => { setErr(e.message); setTodo([]) })
  }, [hasta, recarga])

  // Movimientos del historial cuya empresa ya no existe (se borró desde el CRM).
  // Ya no suman puntos (se filtran en «filas»), pero siguen guardados hasta que se limpian con el botón.
  const idsVivos = new Set(companies.map((c) => c.id))
  const huerfanasVistas = companies.length ? (todo || []).filter((h) => !idsVivos.has(h.empresa_id)) : []
  const nEmpresasBorradas = new Set(huerfanasVistas.map((h) => h.empresa_id ?? h.empresa_nombre)).size

  const limpiarBorradas = async () => {
    setErr(''); setInfo(''); setLimpiando(true)
    try {
      // Se vuelve a pedir todo a la base de datos (no lo que hay en pantalla) para no borrar
      // por error el historial de una empresa que alguien acaba de crear en otra pestaña.
      const emps = await traerTodo(() => supabase.from('empresas').select('id').order('id'))
      if (emps.length === 0) throw new Error('No se han podido cargar las empresas. No se ha borrado nada.')
      const vivas = new Set(emps.map((e) => e.id))
      const hist = await traerTodo(() => supabase.from('historial').select('id, empresa_id, empresa_nombre').order('id'))
      const huerfanas = hist.filter((h) => !vivas.has(h.empresa_id))
      if (huerfanas.length === 0) { setInfo('No hay movimientos de empresas borradas. Las cuentas ya están limpias.'); return }

      const nombres = [...new Set(huerfanas.map((h) => h.empresa_nombre || '(sin nombre)'))]
      const ok = confirm(
        `Se van a quitar ${huerfanas.length} movimientos del historial de ${nombres.length} empresa${nombres.length !== 1 ? 's' : ''} que ya no existe${nombres.length !== 1 ? 'n' : ''}:\n\n` +
        nombres.slice(0, 15).join('\n') + (nombres.length > 15 ? `\n… y ${nombres.length - 15} más` : '') +
        '\n\nLos puntos y las cuentas se recalcularán sin ellos. No se puede deshacer. ¿Seguir?'
      )
      if (!ok) return

      const ids = huerfanas.map((h) => h.id)
      let borradas = 0
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase.from('historial').delete().in('id', ids.slice(i, i + 100)).select('id')
        if (error) throw error
        borradas += (data || []).length
      }
      if (borradas < ids.length) {
        throw new Error(`Solo se han podido quitar ${borradas} de ${ids.length} movimientos: falta el permiso de borrado del historial en Supabase (ejecuta el SQL de la política para admins).`)
      }
      setInfo(`Hecho: quitados ${borradas} movimientos de ${nombres.length} empresa${nombres.length !== 1 ? 's' : ''} borrada${nombres.length !== 1 ? 's' : ''}.`)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLimpiando(false)
      setRecarga((r) => r + 1)
    }
  }

  const { lista } = calcularPuntos({ todo: todo || [], companies, users, desde, hasta, baremo, asistencias })

  const exportar = () => {
    const cab = ['Persona', 'Empresas contactadas', 'Empresas cerradas', 'Becas', 'Quincenas cumplidas', 'Reuniones', 'Puntos']
    const csv = [cab, ...lista.map((d) => [d.nombre, d.contactadas, d.cerradas, d.becas, d.quincenas, d.reuniones, d.puntos])]
      .map((f) => f.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `puntos-${desde}_${hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const atajo = (label, d) => (
    <button
      key={label}
      onClick={() => { setDesde(d); setHasta(HOY()) }}
      className={`px-2.5 py-1 rounded-lg border text-xs ${desde === d && hasta === HOY() ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] p-6">
      <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
        <h3 className="font-bold text-slate-900 flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-slate-400" />Puntos del equipo
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={limpiarBorradas}
            disabled={limpiando}
            title="Quita del historial (y de los puntos) todo lo relacionado con empresas que se han eliminado del CRM"
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50 ${
              nEmpresasBorradas
                ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {limpiando ? 'Limpiando…' : `Quitar empresas borradas${nEmpresasBorradas ? ` · ${nEmpresasBorradas}` : ''}`}
          </button>
          <button onClick={exportar} className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
        <span className="text-slate-400 text-sm">a</span>
        <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
        <span className="w-px h-5 bg-slate-200 mx-1" />
        {atajo('Curso', INICIO_CURSO())}
        {atajo('30 días', sumarDias(-30))}
        {atajo('7 días', sumarDias(-7))}
      </div>

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {info && <p className="text-sm text-emerald-700 mb-3">{info}</p>}
      {nEmpresasBorradas > 0 && !limpiando && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
          No se cuentan {huerfanasVistas.length} movimientos de {nEmpresasBorradas} empresa{nEmpresasBorradas !== 1 ? 's' : ''} eliminada{nEmpresasBorradas !== 1 ? 's' : ''}.
          Siguen guardados en el historial; pulsa «Quitar empresas borradas» para borrarlos del todo.
        </p>
      )}
      {todo === null ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 uppercase tracking-wide text-right">
                <th className="text-left font-medium pb-2">Persona</th>
                <th className="font-medium pb-2" title="Empresas contactadas: no lo cogen, mail enviado o muy interesados">Contact.</th>
                <th className="font-medium pb-2" title="Empresas cerradas: más adelante, otra comunidad, ya no existe, no quieren o beca">Cerradas</th>
                <th className="font-medium pb-2">Becas</th>
                <th className="font-medium pb-2" title="Quincenas de seguimiento cumplidas">Quinc.</th>
                <th className="font-medium pb-2" title="Reuniones a las que ha ido">Reun.</th>
                <th className="font-medium pb-2 pl-3">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <Fragment key={d.id}>
                  <tr
                    onClick={() => setAbierto(abierto === d.id ? '' : d.id)}
                    className="border-t border-slate-100 text-right tabular-nums cursor-pointer hover:bg-slate-50"
                  >
                    <td className="text-left py-2 text-slate-700 flex items-center gap-1">
                      <ChevronRight className={`w-3.5 h-3.5 text-slate-300 transition-transform ${abierto === d.id ? 'rotate-90' : ''}`} />
                      {d.nombre}
                    </td>
                    <td className="text-slate-500">{d.contactadas}</td>
                    <td className="text-slate-500">{d.cerradas}</td>
                    <td className={d.becas ? 'text-emerald-700 font-semibold' : 'text-slate-300'}>{d.becas}</td>
                    <td className={d.quincenas ? 'text-indigo-700 font-semibold' : 'text-slate-300'}>{d.quincenas}</td>
                    <td className={d.reuniones ? 'text-teal-700 font-semibold' : 'text-slate-300'}>{d.reuniones}</td>
                    <td className="font-bold text-slate-900 pl-3">{d.puntos}</td>
                  </tr>
                  {abierto === d.id && (
                    <tr>
                      <td colSpan={7} className="bg-slate-50 px-3 py-3">
                        {d.filas.length === 0 ? (
                          <p className="text-xs text-slate-400">Sin puntos en este periodo.</p>
                        ) : (
                          <ol className="space-y-1.5 max-h-72 overflow-y-auto">
                            {d.filas.map((h) => (
                              <li key={h.id} className="flex items-center gap-2 text-xs">
                                {h.tipo === 'empresa'
                                  ? <Badge estadoId={h.estado} />
                                  : h.tipo === 'reunion'
                                    ? <span className="shrink-0 px-1.5 py-0.5 rounded border font-medium bg-teal-50 text-teal-700 border-teal-200">Reunión</span>
                                    : <span className={`shrink-0 px-1.5 py-0.5 rounded border font-medium ${accionDe('quincena').color}`}>Quincena</span>}
                                <span className="flex-1 min-w-0 text-slate-600 truncate">
                                  <strong className="text-slate-800">{h.empresa_nombre}</strong>{h.detalle ? ` · ${h.detalle}` : ''}
                                </span>
                                <span className="shrink-0 text-slate-400">{h.creado ? fecha(h.creado) : 'sin fecha'}</span>
                                <span className={`shrink-0 w-8 text-right tabular-nums ${h.puntos ? 'text-slate-700 font-semibold' : 'text-slate-300'}`}>
                                  +{h.puntos}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4 leading-relaxed">
        Baremo de este centro (por empresa, según su estado actual y para quien la tiene asignada): {textoBaremo(baremo)}.
        Si una empresa vuelve a un estado anterior, sus puntos bajan. Las notas y las altas no puntúan.
        {baremo.quincena > 0
          ? <> Aparte, quincena de seguimiento cumplida +{baremo.quincena} (cada {QUINCENA.dias} días desde el {fechaCorta(QUINCENA.inicio)}:
            haber escrito una nota o cambiado el estado de todas tus empresas en seguimiento; se suma al cerrar la quincena).</>
          : <> Este centro no da puntos por la quincena de seguimiento.</>}
        {' '}Cada reunión a la que se va suma sus puntos (por defecto {baremo.reunion}), el día de la reunión.
        {' '}Se cambia en «Sistema de puntos», más abajo. Haz clic en una persona para ver el desglose.
      </p>
    </div>
  )
}
// ---------- Ranking (visible para todo el equipo) ----------
const INICIO_MES = () => { const d = new Date(); return isoDia(new Date(d.getFullYear(), d.getMonth(), 1)) }
function Ranking({ users, me, centroNombre, baremo = PUNTOS_DEFECTO, centro }) {
  const [periodo, setPeriodo] = useState('mes')
  const [datos, setDatos] = useState(null)
  const [err, setErr] = useState('')
  const hasta = HOY()
  const desde = periodo === 'mes' ? INICIO_MES() : periodo === '7' ? sumarDias(-7) : INICIO_CURSO()

  const [asistencias, setAsistencias] = useState([])
  useEffect(() => { traerAsistencias(centro).then(setAsistencias) }, [centro])

  useEffect(() => {
    setDatos(null); setErr('')
    Promise.all([
      supabase.rpc('ranking_datos', { p_hasta: hasta }),
      // Nº de becas por empresa (si aún no se ha ejecutado migracion_varias_becas.sql, cada beca cuenta 1)
      supabase.rpc('crm_becas_empresas').then((r) => r, () => ({ data: null })),
    ]).then(([{ data, error }, { data: pracs }]) => {
      if (error) { setErr('No se ha podido cargar el ranking. ¿Se ha ejecutado migracion_ranking.sql en Supabase?'); setDatos({ hist: [], empresas: [] }); return }
      const d = data || { hist: [], empresas: [] }
      const porEmpresa = {}
      for (const p of (Array.isArray(pracs) ? pracs : [])) (porEmpresa[p.empresa_id] ||= []).push(p)
      setDatos({ ...d, empresas: (d.empresas || []).map((c) => ({ ...c, practicas: porEmpresa[c.id] || c.practicas || [] })) })
    })
  }, [hasta])

  const lista = datos
    ? calcularPuntos({ todo: datos.hist || [], companies: datos.empresas || [], users, desde, hasta, baremo, asistencias })
      .lista.filter((d) => users.some((u) => u.id === d.id))
    : []
  // Misma puntuación = mismo puesto
  const puesto = (i) => (i > 0 && lista[i - 1].puntos === lista[i].puntos ? puesto(i - 1) : i + 1)
  const max = Math.max(1, ...lista.map((d) => d.puntos))
  const yo = lista.findIndex((d) => d.id === me.id)
  const medalla = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-800', 'bg-orange-300 text-orange-950']

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="bg-[#0e2d4d] rounded-2xl p-5 text-white shadow-[0_4px_16px_rgba(13,43,69,0.18)]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-300" />Ranking {centroNombre ? `· ${centroNombre}` : 'del equipo'}</h2>
          <div className="flex gap-1 bg-white/10 rounded-full p-1">
            {[['mes', 'Este mes'], ['curso', 'Curso'], ['7', '7 días']].map(([id, label]) => (
              <button key={id} onClick={() => setPeriodo(id)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${periodo === id ? 'bg-white text-[#0e2d4d] font-bold' : 'text-white/80 hover:bg-white/[0.08]'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {datos && yo >= 0 && (
          <p className="mt-3 text-sm text-white/80">
            Vas <strong className="text-white">{puesto(yo)}º</strong> de {lista.length} con <strong className="text-white">{lista[yo].puntos} punto{lista[yo].puntos !== 1 ? 's' : ''}</strong>
            {yo > 0 && lista[yo - 1].puntos > lista[yo].puntos && <> · te faltan {lista[yo - 1].puntos - lista[yo].puntos} para subir un puesto</>}
          </p>
        )}
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] overflow-hidden divide-y divide-slate-100">
        {datos === null ? (
          <p className="p-6 text-sm text-slate-400">Cargando…</p>
        ) : lista.map((d, i) => {
          const p = puesto(i)
          const mio = d.id === me.id
          return (
            <div key={d.id} className={`flex items-center gap-3 px-5 py-3 ${mio ? 'bg-blue-50/60' : ''}`}>
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${p <= 3 && d.puntos > 0 ? medalla[p - 1] : 'bg-slate-100 text-slate-500'}`}>{p}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${mio ? 'font-bold text-[#0e2d4d]' : 'font-medium text-slate-800'}`}>{d.nombre}{mio && ' (tú)'}</p>
                <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-[#0e2d4d] rounded-full" style={{ width: `${(d.puntos / max) * 100}%` }} />
                </div>
              </div>
              {d.becas > 0 && <span className="hidden sm:inline text-xs text-emerald-700 font-medium shrink-0">{d.becas} beca{d.becas !== 1 ? 's' : ''}</span>}
              <span className="w-12 text-right text-sm font-bold text-slate-900 tabular-nums shrink-0">{d.puntos}</span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-slate-500 px-1">
        Cada empresa que llevas puntúa según su estado actual: {textoBaremo(baremo)}.
        {baremo.quincena > 0 && <> Quincena de seguimiento cumplida: +{baremo.quincena}.</>}
        {' '}Cada reunión a la que vas suma sus puntos (normalmente +{baremo.reunion}).
      </p>
    </div>
  )
}

// ---------- Reuniones: la secretaría crea la reunión y abre la lista; cada persona dice «He ido» ----------
// Mientras la lista está abierta cualquiera del centro puede apuntarse (y quitarse). La secretaría
// (o un admin) revisa la lista, quita a quien no estuvo o apunta a quien se olvidó, y la cierra.
// Cada asistencia suma los puntos de esa reunión en el ranking, el día de la reunión.
async function marcarAsistencia(reunionId, usuarioId, meId) {
  return supabase.from('asistencias').insert({ reunion_id: reunionId, usuario_id: usuarioId, marcado_por: meId })
}
async function quitarAsistencia(reunionId, usuarioId) {
  return supabase.from('asistencias').delete().eq('reunion_id', reunionId).eq('usuario_id', usuarioId)
}
const fechaLarga = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

function Reuniones({ me, users, centro, puedeGestionar, baremo = PUNTOS_DEFECTO }) {
  const [lista, setLista] = useState(null)
  const [asis, setAsis] = useState([])
  const [err, setErr] = useState('')
  const [abierta, setAbierta] = useState('')
  const [nueva, setNueva] = useState({ titulo: 'Reunión', fecha: HOY(), puntos: baremo.reunion })
  const [busy, setBusy] = useState(false)
  const [anadir, setAnadir] = useState('')
  const [recarga, setRecarga] = useState(0)
  const recargar = () => setRecarga((r) => r + 1)

  useEffect(() => { setNueva((n) => ({ ...n, puntos: baremo.reunion })) }, [baremo.reunion])
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data: rs, error } = await supabase.from('reuniones').select('*').eq('centro', centro)
        .order('fecha', { ascending: false }).order('creado', { ascending: false })
      if (!vivo) return
      if (error) {
        setErr(/relation|schema cache|does not exist/i.test(error.message) ? 'Falta ejecutar migracion_reuniones.sql en Supabase.' : error.message)
        setLista([]); return
      }
      const ids = (rs || []).map((r) => r.id)
      let as = []
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from('asistencias').select('reunion_id, usuario_id, creado').in('reunion_id', ids.slice(i, i + 100))
        as = as.concat(data || [])
      }
      if (!vivo) return
      setErr(''); setLista(rs || []); setAsis(as)
    })()
    return () => { vivo = false }
  }, [centro, recarga])

  const nombre = (id) => users.find((u) => u.id === id)?.nombre || 'Alguien de otro centro'
  const de = (rid) => asis.filter((a) => a.reunion_id === rid)
  const fui = (rid) => asis.some((a) => a.reunion_id === rid && a.usuario_id === me.id)
  const hacer = async (fn) => {
    setBusy(true); setErr('')
    const { error } = await fn()
    setBusy(false)
    if (error) setErr(error.code === '23505' ? 'Esa persona ya estaba en la lista.' : error.message)
    recargar()
  }

  const crear = () => {
    if (!nueva.titulo.trim()) { setErr('Ponle un título a la reunión.'); return }
    hacer(() => supabase.from('reuniones').insert({
      centro, titulo: nueva.titulo.trim().slice(0, 120), fecha: nueva.fecha || HOY(),
      puntos: Math.max(0, Math.min(100, parseInt(nueva.puntos, 10) || 0)), creada_por: me.id,
    }))
    setNueva({ titulo: 'Reunión', fecha: HOY(), puntos: baremo.reunion })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="bg-[#0e2d4d] rounded-2xl p-5 text-white shadow-[0_4px_16px_rgba(13,43,69,0.18)]">
        <h2 className="text-lg font-bold flex items-center gap-2"><CalendarCheck className="w-5 h-5 text-teal-300" />Reuniones · {centro}</h2>
        <p className="mt-1 text-sm text-white/75">
          {puedeGestionar
            ? 'Crea la reunión y su lista queda abierta: cada persona pulsa «He ido». Al acabar, revisa la lista y ciérrala.'
            : 'Si has ido a una reunión, pulsa «He ido» mientras la lista esté abierta. Cada reunión suma sus puntos en el ranking.'}
        </p>
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}

      {puedeGestionar && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[10rem] text-xs text-slate-500">Título
            <input value={nueva.titulo} onChange={(e) => setNueva({ ...nueva, titulo: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900" />
          </label>
          <label className="text-xs text-slate-500">Fecha
            <input type="date" value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })}
              className="mt-1 block px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900" />
          </label>
          <label className="text-xs text-slate-500">Puntos
            <input type="number" min="0" max="100" value={nueva.puntos} onChange={(e) => setNueva({ ...nueva, puntos: e.target.value })}
              className="mt-1 block w-20 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 text-right" />
          </label>
          <button onClick={crear} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0e2d4d] text-white text-sm font-semibold disabled:opacity-40">
            <Plus className="w-4 h-4" />Crear y abrir lista
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] divide-y divide-slate-100">
        {lista === null ? <p className="p-6 text-sm text-slate-400">Cargando…</p>
          : lista.length === 0 ? <p className="p-6 text-sm text-slate-400">Todavía no hay reuniones.</p>
          : lista.map((r) => {
            const gente = de(r.id)
            const yoFui = fui(r.id)
            const abiertaR = abierta === r.id
            const faltan = users.filter((u) => !gente.some((a) => a.usuario_id === u.id))
            return (
              <div key={r.id} className="px-5 py-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => setAbierta(abiertaR ? '' : r.id)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <ChevronRight className={`w-3.5 h-3.5 text-slate-300 transition-transform ${abiertaR ? 'rotate-90' : ''}`} />
                      {r.titulo}
                      <span className={`shrink-0 whitespace-nowrap text-xs font-medium px-1.5 py-0.5 rounded border ${r.abierta ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {r.abierta ? 'Lista abierta' : 'Cerrada'}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 ml-5">{fechaLarga(r.fecha)} · +{r.puntos} punto{r.puntos !== 1 ? 's' : ''} · {gente.length} asistente{gente.length !== 1 ? 's' : ''}</p>
                  </button>
                  {r.abierta && !yoFui && (
                    <button onClick={() => hacer(() => marcarAsistencia(r.id, me.id, me.id))} disabled={busy}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-40">
                      <Check className="w-4 h-4" />He ido
                    </button>
                  )}
                  {yoFui && (
                    <span className="inline-flex items-center gap-1 text-sm text-teal-700 font-medium">
                      <Check className="w-4 h-4" />Has ido
                      {r.abierta && <button onClick={() => hacer(() => quitarAsistencia(r.id, me.id))} disabled={busy} className="ml-1 text-xs text-slate-400 hover:text-rose-600 underline">quitar</button>}
                    </span>
                  )}
                </div>

                {abiertaR && (
                  <div className="mt-3 ml-5 space-y-2">
                    {gente.length === 0 ? <p className="text-xs text-slate-400">Nadie apuntado todavía.</p> : (
                      <ul className="flex flex-wrap gap-1.5">
                        {gente.map((a) => (
                          <li key={a.usuario_id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-xs text-slate-700">
                            {nombre(a.usuario_id)}
                            {puedeGestionar && (
                              <button onClick={() => hacer(() => quitarAsistencia(r.id, a.usuario_id))} disabled={busy} title="Quitar de la lista" className="text-slate-400 hover:text-rose-600">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {puedeGestionar && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <select value={anadir} onChange={(e) => setAnadir(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white">
                          <option value="">Apuntar a alguien…</option>
                          {faltan.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                        </select>
                        <button onClick={() => { if (anadir) { hacer(() => marcarAsistencia(r.id, anadir, me.id)); setAnadir('') } }} disabled={busy || !anadir}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40">Apuntar</button>
                        <span className="flex-1" />
                        <button onClick={() => hacer(() => supabase.from('reuniones').update({ abierta: !r.abierta }).eq('id', r.id))} disabled={busy}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                          {r.abierta ? <><Lock className="w-3.5 h-3.5" />Cerrar lista</> : <><LockOpen className="w-3.5 h-3.5" />Reabrir lista</>}
                        </button>
                        <button onClick={() => confirm(`¿Borrar «${r.titulo}»? Se quitan también sus asistencias y sus puntos.`) && hacer(() => supabase.from('reuniones').delete().eq('id', r.id))} disabled={busy}
                          title="Borrar reunión" className="p-1.5 rounded-lg border border-slate-300 text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}

// Aviso en Empresas: hay una reunión con la lista abierta y aún no has dicho que has ido
function AvisoReunion({ me, centro, onVer }) {
  const [pendientes, setPendientes] = useState([])
  const [recarga, setRecarga] = useState(0)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data: rs, error } = await supabase.from('reuniones').select('id, titulo, fecha, puntos').eq('centro', centro).eq('abierta', true)
      if (error || !rs?.length) { vivo && setPendientes([]); return }
      const { data: mias } = await supabase.from('asistencias').select('reunion_id').eq('usuario_id', me.id).in('reunion_id', rs.map((r) => r.id))
      const ya = new Set((mias || []).map((a) => a.reunion_id))
      vivo && setPendientes(rs.filter((r) => !ya.has(r.id)))
    })()
    return () => { vivo = false }
  }, [me.id, centro, recarga])
  if (!pendientes.length) return null
  const r = pendientes[0]
  return (
    <div className="flex items-center gap-2.5 mb-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900 flex-wrap">
      <CalendarCheck className="w-4 h-4 shrink-0" />
      <p className="flex-1 min-w-0">
        <strong>{r.titulo}</strong> ({fechaCorta(r.fecha)}): la lista está abierta. ¿Has ido? +{r.puntos} punto{r.puntos !== 1 ? 's' : ''}.
        {pendientes.length > 1 && <> <button onClick={onVer} className="underline">Ver las {pendientes.length}</button></>}
      </p>
      <button onClick={async () => { await marcarAsistencia(r.id, me.id, me.id); setRecarga((x) => x + 1) }}
        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700">
        <Check className="w-4 h-4" />He ido
      </button>
    </div>
  )
}

// ---------- Plantilla de correo del centro (admin de centro o admin general) ----------
function PlantillaCorreo({ centro, centros, me, onChanged }) {
  const pl = plantillaDe(centros, centro)
  const CAMPOS = ['asunto', 'cuerpo', 'equipo', 'entidad', 'direccion', 'web', 'correo']
  const inicial = () => Object.fromEntries(CAMPOS.map((k) => [k, pl[k] || '']))
  const [f, setF] = useState(inicial)
  const [abierta, setAbierta] = useState(false)
  const [ver, setVer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const clave = JSON.stringify([centro, CAMPOS.map((k) => pl[k])])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setF(inicial()); setMsg(''); setErr('') }, [clave])
  const cambiado = CAMPOS.some((k) => (f[k] || '') !== (pl[k] || ''))
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const guardar = async (valor) => {
    setBusy(true); setErr(''); setMsg('')
    const { error } = await supabase.rpc('guardar_plantilla_centro', { p_centro: centro, p_plantilla: valor })
    setBusy(false)
    if (error) {
      setErr(/function|schema cache/i.test(error.message) ? 'Falta ejecutar migracion_plantillas_correo.sql en Supabase.' : error.message)
      return
    }
    setMsg(valor ? 'Plantilla guardada ✓' : 'Vuelve a usar la plantilla por defecto ✓')
    onChanged()
  }
  const campo = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900'
  const etiqueta = 'block text-xs font-medium text-slate-500 mb-1'

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] p-5">
      <button onClick={() => setAbierta(!abierta)} className="w-full flex items-center justify-between gap-2 text-left">
        <h3 className="font-bold text-slate-900 flex items-center gap-2"><Send className="w-4 h-4 text-blue-600" />Plantilla de correo de {centro}</h3>
        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${abierta ? 'rotate-90' : ''}`} />
      </button>
      <p className="text-xs text-slate-500 mt-1">
        Es lo que se copia al pulsar «Plantilla de contacto» en una empresa. Cada persona de {centro} la envía con su nombre en la firma.
        {!pl.propia && ' Ahora mismo usa la plantilla por defecto.'}
      </p>
      {abierta && (
        <div className="mt-4 space-y-3">
          <div>
            <label className={etiqueta}>Asunto</label>
            <input value={f.asunto} onChange={set('asunto')} className={campo} />
          </div>
          <div>
            <label className={etiqueta}>Texto del correo</label>
            <textarea value={f.cuerpo} onChange={set('cuerpo')} rows={14} className={`${campo} font-mono text-xs leading-relaxed`} />
            <p className="text-xs text-slate-400 mt-1">
              Una línea en blanco separa párrafos · «- » al principio de la línea hace una viñeta · **texto** va en negrita · «---» es una línea separadora.
              Se rellenan solos: {'{contacto}'}, {'{mi_nombre}'}, {'{empresa}'}, {'{correo_centro}'}, {'{centro}'}.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={etiqueta}>Firma: equipo</label>
              <input value={f.equipo} onChange={set('equipo')} className={campo} placeholder="Equipo de Empresas IAESTE {centro}" />
            </div>
            <div>
              <label className={etiqueta}>Firma: nombre del comité</label>
              <input value={f.entidad} onChange={set('entidad')} className={campo} placeholder="IAESTE Telecomunicación Madrid" />
            </div>
            <div className="sm:col-span-2">
              <label className={etiqueta}>Firma: dirección (una línea por renglón)</label>
              <textarea value={f.direccion} onChange={set('direccion')} rows={2} className={campo} />
            </div>
            <div>
              <label className={etiqueta}>Firma: web</label>
              <input value={f.web} onChange={set('web')} className={campo} />
            </div>
            <div>
              <label className={etiqueta}>Correo del comité ({'{correo_centro}'})</label>
              <input value={f.correo} onChange={set('correo')} className={campo} placeholder="comite@gmail.com" />
            </div>
          </div>
          {err && <p className="text-sm text-rose-600">{err}</p>}
          {msg && <p className="text-sm text-emerald-700">{msg}</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => guardar(f)} disabled={busy || !cambiado}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0e2d4d] text-white text-sm font-semibold disabled:opacity-40">
              <Save className="w-4 h-4" />{busy ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={() => setVer(!ver)} className="px-4 py-2 rounded-full border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">
              {ver ? 'Ocultar vista previa' : 'Vista previa'}
            </button>
            {pl.propia && (
              <button onClick={() => confirm(`¿Volver a la plantilla por defecto en ${centro}?`) && guardar(null)} disabled={busy}
                className="px-4 py-2 rounded-full border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                Volver a la de por defecto
              </button>
            )}
          </div>
          {ver && (
            <div className="border border-slate-200 rounded-xl p-4 max-h-[32rem] overflow-y-auto bg-white">
              <p className="text-xs text-slate-500 mb-3"><strong>Asunto:</strong> {asuntoPlantilla({ nombre: 'Empresa de ejemplo' }, { ...pl, ...f })}</p>
              <div className="[&_ul]:list-disc [&_ul]:pl-6 [&_a]:text-blue-700 [&_a]:underline" dangerouslySetInnerHTML={{ __html: plantillaHtml({ nombre: 'Empresa de ejemplo', contacto: 'Laura' }, me.nombre, { ...pl, ...f }) }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Sistema de puntos del centro (admin de centro o admin general) ----------
function BaremoPuntos({ centro, baremo, onChanged }) {
  const inicial = () => ({ estados: { ...baremo.estados }, quincena: baremo.quincena, reunion: baremo.reunion })
  const [f, setF] = useState(inicial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const clave = JSON.stringify([centro, baremo.estados, baremo.quincena, baremo.reunion])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setF(inicial()); setMsg(''); setErr('') }, [clave])
  const num = (v) => Math.max(0, Math.min(100, parseInt(v, 10) || 0))
  const cambiado = JSON.stringify([f.estados, f.quincena, f.reunion]) !== JSON.stringify([baremo.estados, baremo.quincena, baremo.reunion])

  const guardar = async (valor) => {
    setBusy(true); setErr(''); setMsg('')
    const { error } = await supabase.rpc('guardar_puntos_centro', { p_centro: centro, p_puntos: valor })
    setBusy(false)
    if (error) {
      setErr(/function|schema cache/i.test(error.message)
        ? 'Falta ejecutar migracion_puntos_por_centro.sql en Supabase.'
        : error.message)
      return
    }
    setMsg(valor ? 'Sistema de puntos guardado ✓' : 'Vuelve a usar el baremo por defecto ✓')
    onChanged()
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] p-5">
      <h3 className="font-bold text-slate-900 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" />Sistema de puntos de {centro}</h3>
      <p className="text-xs text-slate-500 mt-1">
        Puntos que vale cada empresa según su estado actual, para quien la tiene asignada. Solo afecta a {centro}: cada centro tiene el suyo.
        {!baremo.propio && ' Ahora mismo usa el baremo por defecto.'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-4">
        {ESTADOS.filter((e) => !e.oculto).map((e) => (
          <label key={e.id} className="flex items-center justify-between gap-3 text-sm">
            <span className={`px-2 py-0.5 rounded border text-xs font-medium ${e.color}`}>{e.label}</span>
            <input type="number" min="0" max="100" value={f.estados[e.id] ?? 0}
              onChange={(ev) => setF((p) => ({ ...p, estados: { ...p.estados, [e.id]: num(ev.target.value) } }))}
              className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-sm text-right tabular-nums" />
          </label>
        ))}
        <label className="flex items-center justify-between gap-3 text-sm sm:col-span-2 border-t border-slate-100 pt-3 mt-1">
          <span className="text-slate-700">Quincena de seguimiento cumplida <span className="text-slate-400">(0 = sin bonus)</span></span>
          <input type="number" min="0" max="100" value={f.quincena}
            onChange={(ev) => setF((p) => ({ ...p, quincena: num(ev.target.value) }))}
            className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-sm text-right tabular-nums" />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm sm:col-span-2">
          <span className="text-slate-700">Ir a una reunión <span className="text-slate-400">(valor por defecto al crearla)</span></span>
          <input type="number" min="0" max="100" value={f.reunion}
            onChange={(ev) => setF((p) => ({ ...p, reunion: num(ev.target.value) }))}
            className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-sm text-right tabular-nums" />
        </label>
      </div>
      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
      {msg && <p className="text-sm text-emerald-700 mt-3">{msg}</p>}
      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={() => guardar({ estados: f.estados, quincena: f.quincena, reunion: f.reunion })} disabled={busy || !cambiado}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0e2d4d] text-white text-sm font-semibold disabled:opacity-40">
          <Save className="w-4 h-4" />{busy ? 'Guardando…' : 'Guardar'}
        </button>
        {baremo.propio && (
          <button onClick={() => confirm(`¿Volver al baremo por defecto en ${centro}?`) && guardar(null)} disabled={busy}
            className="px-4 py-2 rounded-full border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            Volver al de por defecto
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-3">Al cambiarlo se recalculan los puntos de todo el periodo con el baremo nuevo.</p>
    </div>
  )
}

// ---------- Equipo (solo admin) ----------
function Equipo({ users, centro, isSuper, centros = [], companies, me, baremo = PUNTOS_DEFECTO, onChanged }) {
  const [err, setErr] = useState('')
  const [asignando, setAsignando] = useState('')
  const cuenta = (id) => companies.filter((c) => c.responsable === id).length
  const sinContactar = (id) => companies.filter((c) => c.responsable === id && c.estado === 'sin_contactar').length
  // Los lotes salen del bote común (empresas sin centro), compartido por todos los centros.
  // Las históricas no entran en los lotes: solo se asignan a mano desde la ficha
  const libres = companies.filter((c) => !c.centro && !c.responsable && c.estado === 'sin_contactar' && !c.historica)

  const asignarLote = async (u) => {
    setErr(''); setAsignando(u.id)
    const ids = libres.slice(0, LOTE).map((c) => c.id)
    if (ids.length === 0) {
      setErr('No quedan empresas sin asignar en estado «Sin contactar».')
      setAsignando('')
      return
    }
    const { error } = await supabase
      .from('empresas')
      .update({ responsable: u.id, actualizado_por: me.nombre })
      .in('id', ids)
    setAsignando('')
    if (error) setErr(error.message)
    else onChanged()
  }

  // Quitar lote: devuelve al bote común hasta LOTE empresas que esa persona tenga
  // «Sin contactar». Las que ya tienen seguimiento y las históricas no se tocan.
  const quitables = (id) => companies.filter((c) => c.responsable === id && c.estado === 'sin_contactar' && !c.historica)
  const quitarLote = async (u) => {
    setErr('')
    const ids = quitables(u.id).slice(-LOTE).map((c) => c.id)
    if (ids.length === 0) {
      setErr(`${u.nombre} no tiene empresas «Sin contactar» que se le puedan quitar.`)
      return
    }
    if (!confirm(`¿Quitar ${ids.length} empresa${ids.length !== 1 ? 's' : ''} sin contactar a ${u.nombre}? Volverán al bote común.`)) return
    setAsignando(u.id)
    const { error } = await supabase
      .from('empresas')
      .update({ responsable: null, actualizado_por: me.nombre })
      .in('id', ids)
      .eq('estado', 'sin_contactar')
    setAsignando('')
    if (error) setErr(error.message)
    else onChanged()
  }

  const [passDe, setPassDe] = useState(null)   // usuario al que se le pone contraseña temporal
  const [passTmp, setPassTmp] = useState('')
  const [passOk, setPassOk] = useState('')
  const ponerTemporal = async () => {
    setErr(''); setPassOk('')
    { const prob = problemaPass(passTmp); if (prob) { setErr(prob); return } }
    const { error } = await supabase.rpc('admin_poner_contrasena', { p_usuario: passDe.id, p_contrasena: passTmp })
    if (error) { setErr(`No se ha podido cambiar: ${error.message}`); return }
    setPassOk(`Listo: ${passDe.nombre} ya puede entrar con «${passTmp}». Dile que la cambie con el icono de la llave, arriba a la derecha.`)
    setPassDe(null); setPassTmp('')
  }

  const cambiarPerfil = async (u, patch) => {
    setErr('')
    if (patch.centro && !confirm(`¿Pasar a ${u.nombre} a ${patch.centro}? Sus empresas asignadas se irán con esa persona a ${patch.centro}.`)) return
    const { error } = await supabase.from('profiles').update(patch).eq('id', u.id)
    if (error) setErr(error.message)
    else onChanged()
  }
  const cambiarRol = (u, rol) => cambiarPerfil(u, { rol })
  // Borra la cuenta entera (perfil + email): podrá volver a registrarse con el mismo email.
  // Sus empresas vuelven a quedar sin asignar y su historial se conserva.
  const borrarUsuario = async (u) => {
    if (!confirm(`¿Borrar a ${u.nombre} del CRM?\n\nSe borra su cuenta y su email, y sus ${cuenta(u.id)} empresas quedan sin asignar. El historial de las empresas se conserva. Podrá volver a registrarse con el mismo email.`)) return
    setErr('')
    const { error } = await supabase.rpc('admin_borrar_usuario', { p_usuario: u.id })
    if (error) setErr(/function|schema cache/i.test(error.message) ? 'Falta ejecutar migracion_borrar_usuarios.sql en Supabase.' : error.message)
    else onChanged()
  }
  const selCentro = (u) => isSuper && centros.length > 1 && (
    <select value={u.centro || ''} onChange={(e) => cambiarPerfil(u, { centro: e.target.value })} disabled={u.id === me.id}
      title="Centro de esta persona" className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white disabled:opacity-50">
      {centros.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
    </select>
  )
  const miCentro = centro || me.centro || 'TLMA'
  const deMiCentro = companies.filter((c) => !c.centro || c.centro === miCentro)
  // Un admin de centro no puede tocar a un admin general ni nombrarlo
  const rolesQuePuedo = ROLES.filter(([id]) => isSuper || id !== 'superadmin')

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-blue-900">
        {isSuper
          ? <>Eres <strong>admin general</strong>: estás viendo <strong>{miCentro}</strong>; cambia de centro con las pestañas de centro en Empresas. Puedes mover gente de centro y nombrar admins de centro o generales. </>
          : <>Eres <strong>admin de centro</strong> de {miCentro}: gestionas a tu gente y repartes empresas del bote solo a personas de {miCentro}. </>}
        Para incorporar a alguien: pídele que se <strong>registre</strong> en esta misma página. Aparecerá aquí
        como miembro y podrás asignarle empresas o hacerle admin. Si alguien olvida su contraseña,
        pulsa la llave junto a su nombre para ponerle una temporal. Para borrar a alguien, pulsa la papelera: se borra su cuenta y podrá volver a registrarse con el mismo email.
      </div>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      {passOk && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{passOk}</p>}

      <GraficaEmpresas users={users} companies={deMiCentro} />

      <Actividad users={users} companies={companies} baremo={baremo} centro={miCentro} />

      {centros.length > 0 && <BaremoPuntos centro={miCentro} baremo={baremo} onChanged={onChanged} />}

      <PlantillaCorreo centro={miCentro} centros={centros} me={me} onChanged={onChanged} />

      <p className="text-xs text-slate-500 px-1">
        Bote común (compartido con todos los centros): <strong>{libres.length}</strong> empresas sin asignar en estado «Sin contactar» (sin contar las históricas, que se asignan a mano desde su ficha).
        El botón <strong>+{LOTE}</strong> reparte las {LOTE} primeras a esa persona y <strong>−{LOTE}</strong> le quita {LOTE} de las que aún tiene sin contactar (vuelven al bote).
      </p>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] overflow-hidden">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between px-6 py-4 border-b border-slate-100 last:border-0">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${u.rol === 'superadmin' ? 'bg-[#0e2d4d] text-white' : u.rol === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                {u.nombre[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                  {u.nombre}
                  {esAdminRol(u.rol) && <Shield className={`w-3.5 h-3.5 ${u.rol === 'superadmin' ? 'text-[#0e2d4d] fill-[#0e2d4d]/20' : 'text-blue-600'}`} />}
                  {u.rol === 'superadmin' && <span className="text-xs text-[#0e2d4d] font-semibold">General</span>}
                  {u.id === me.id && <span className="text-xs text-slate-400">(tú)</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {cuenta(u.id)} asignada{cuenta(u.id) !== 1 ? 's' : ''} ·{' '}
                  <span className={sinContactar(u.id) === 0 ? 'text-amber-700 font-semibold' : ''}>
                    {sinContactar(u.id)} sin contactar
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => asignarLote(u)}
                disabled={asignando === u.id || libres.length === 0}
                title={`Asignarle ${LOTE} empresas sin contactar del bote común`}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 disabled:opacity-40 ${
                  sinContactar(u.id) === 0
                    ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />+{LOTE}
              </button>
              <button
                onClick={() => quitarLote(u)}
                disabled={asignando === u.id || quitables(u.id).length === 0}
                title={`Quitarle ${LOTE} empresas sin contactar y devolverlas al bote común`}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-40"
              >
                <UserMinus className="w-3.5 h-3.5" />−{LOTE}
              </button>
              {u.id !== me.id && (
                <button onClick={() => { setPassDe(u); setPassTmp(''); setPassOk('') }} title="Ponerle una contraseña temporal"
                  className="p-1.5 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50">
                  <KeyRound className="w-3.5 h-3.5" />
                </button>
              )}
            <button onClick={() => cambiarPerfil(u, { secretaria: !u.secretaria })}
              title={u.secretaria ? 'Quitarle la secretaría (deja de poder crear reuniones y pasar lista)' : 'Hacerle secretaria/o: podrá crear reuniones y pasar lista'}
              className={`px-2 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 ${u.secretaria ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
              <CalendarCheck className="w-3.5 h-3.5" />Secretaría
            </button>
            {selCentro(u)}
            {u.id !== me.id && (isSuper || u.rol !== 'superadmin') && (
              <button onClick={() => borrarUsuario(u)} title="Borrar del CRM (podrá volver a registrarse)"
                className="p-1.5 rounded-lg border border-slate-300 text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <select
              value={u.rol}
              onChange={(e) => cambiarRol(u, e.target.value)}
              disabled={u.id === me.id || (!isSuper && u.rol === 'superadmin')}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50"
            >
              {(u.rol === 'superadmin' && !isSuper ? ROLES : rolesQuePuedo).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            </div>
          </div>
        ))}
      </div>

      {passDe && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" onClick={() => setPassDe(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-slate-900">Contraseña temporal para {passDe.nombre}</h2>
            <p className="text-xs text-slate-500">Su contraseña actual dejará de valer. Pásale la temporal por privado y pídele que la cambie al entrar.</p>
            <Input value={passTmp} autoFocus onChange={(e) => setPassTmp(e.target.value)} placeholder={`Mínimo ${PASS_MIN} caracteres, con letras y números`} onKeyDown={(e) => e.key === 'Enter' && ponerTemporal()} />
            <div className="flex gap-2 justify-end">
              <Btn variant="ghost" onClick={() => setPassDe(null)}>Cancelar</Btn>
              <Btn onClick={ponerTemporal}>Cambiar contraseña</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Aviso de la quincena en curso (para cada persona) ----------
function MiQuincena({ me, companies, onAbrir, puntos = PUNTOS.quincena }) {
  const mias = companies.filter((c) => c.responsable === me.id)
  const clave = mias.map((c) => `${c.id}:${c.estado}:${c.actualizado || ''}`).join('|')
  const [q, setQ] = useState(null)

  useEffect(() => {
    let vivo = true
    const hoy = HOY()
    const ids = mias.map((c) => c.id)
    if (ids.length === 0) { setQ(null); return }
    const trozos = []
    for (let i = 0; i < ids.length; i += 100) trozos.push(ids.slice(i, i + 100))
    Promise.all(trozos.map((t) => traerTodo(() => supabase
      .from('historial')
      .select('id, empresa_id, usuario_id, accion, estado_nuevo, creado')
      .in('empresa_id', t)
      .order('creado', { ascending: true })
      .order('id', { ascending: true }))))
      .then((partes) => {
        if (!vivo) return
        const qs = evaluarQuincenas(partes.flat(), mias, hoy)[me.id] || []
        setQ(qs.find((x) => x.enCurso) || null)
      })
      .catch(() => vivo && setQ(null))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, clave])

  if (!q || q.total === 0 || !puntos) return null
  const ultimo = diaMas(q.fin, -1)
  const dia = new Date(ultimo + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
  return q.cumple ? (
    <div className="flex items-start gap-2.5 mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <Trophy className="w-4 h-4 mt-0.5 shrink-0" />
      <p>
        <strong>Seguimiento de la quincena hecho</strong> ({q.hechas}/{q.total} empresas).
        Los +{puntos} puntos se suman al cerrar la quincena, el {dia}.
      </p>
    </div>
  ) : (
    <div className="flex items-start gap-2.5 mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
      <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        <p>
          <strong>Seguimiento quincenal: {q.hechas}/{q.total}.</strong>{' '}
          Vuelve a llamar (y apúntalo con una nota o un cambio de estado) a estas empresas antes del final del {dia} y te llevas +{puntos}:
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {q.faltan.map((c) => (
            <button key={c.id} onClick={() => onAbrir(companies.find((x) => x.id === c.id) || c)}
              className="px-2.5 py-1 rounded-full border border-indigo-200 bg-white text-xs font-medium text-indigo-700 hover:bg-indigo-100">
              {c.nombre}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- Seguimiento (solo admin): últimos cambios del CRM ----------
// Sale del historial, así que cada entrada conserva la nota que se escribió EN ESE MOMENTO:
// aunque la empresa cambie luego de estado o tenga notas nuevas, lo ya escrito no cambia.
// Selector de empresa con búsqueda por nombre o CIF (hay cientos: un <select> sería inmanejable)
function BuscadorEmpresa({ companies, valor, onCambiar }) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  if (valor) {
    return (
      <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg border border-blue-600 bg-blue-50 text-blue-700 text-xs font-medium max-w-[16rem]">
        <Building2 className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{valor.nombre}</span>
        <button onClick={() => { onCambiar(null); setTexto('') }} title="Quitar filtro de empresa" className="p-0.5 rounded hover:bg-blue-100">
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    )
  }
  const q = texto.trim().toLowerCase()
  const qCif = cifNorm(texto)
  const sugerencias = q
    ? companies.filter((c) => (c.nombre || '').toLowerCase().includes(q) || (qCif.length >= 3 && cifNorm(c.cif).includes(qCif))).slice(0, 8)
    : []
  return (
    <div className="relative min-w-[11rem]">
      <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
      <input value={texto} onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Enter' && sugerencias[0]) onCambiar({ id: sugerencias[0].id, nombre: sugerencias[0].nombre }) }}
        placeholder="Todas las empresas"
        className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0e2d4d]/30" />
      {abierto && q && (
        <ul className="absolute z-20 mt-1 left-0 w-72 max-w-[80vw] bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-xs">
          {sugerencias.length === 0 ? (
            <li className="px-3 py-2 text-slate-400">Ninguna empresa coincide</li>
          ) : sugerencias.map((c) => (
            <li key={c.id}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCambiar({ id: c.id, nombre: c.nombre })}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${estadoDe(c.estado).dot}`} />
                <span className="truncate text-slate-800">{c.nombre}</span>
                {c.cif && <span className="ml-auto text-slate-400 shrink-0">{c.cif}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Con una empresa elegida se ve TODO su historial (sin límite de días): cuándo la contactó cada
// persona y cómo (el estado al que la pasó —mail, llamada sin respuesta…— y la nota que escribió).
// Se puede combinar con el filtro de persona.
function Seguimiento({ users, companies, nombreDe, version, onAbrir }) {
  const [dias, setDias] = useState(7)
  const [persona, setPersona] = useState('')
  const [empresa, setEmpresa] = useState(null) // { id, nombre } | null
  const [tipo, setTipo] = useState('seguimientos') // 'seguimientos' (notas y estados) | 'todo'
  const [busca, setBusca] = useState('')
  const [filas, setFilas] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    setFilas(null); setErr('')
    traerTodo(() => {
      let q = supabase
        .from('historial')
        .select('id, empresa_id, usuario_id, usuario_nombre, empresa_nombre, accion, detalle, estado_anterior, estado_nuevo, creado')
      q = empresa ? q.eq('empresa_id', empresa.id) : q.gte('creado', sumarDias(-dias) + 'T00:00:00')
      return q.order('creado', { ascending: false }).order('id', { ascending: false })
    })
      .then(setFilas)
      .catch((e) => { setErr(e.message); setFilas([]) })
  }, [dias, empresa?.id, version])

  // Un cambio de estado y su nota se guardan como dos filas con la misma clave: se juntan en una
  const entradas = (() => {
    if (!filas) return []
    const notaDe = new Map(filas.filter((h) => h.accion === 'nota').map((h) => [claveSeg(h), h]))
    const conEstado = new Set(filas.filter((h) => h.accion === 'estado').map(claveSeg))
    const out = []
    for (const h of filas) {
      if (h.accion === 'estado') out.push({ ...h, texto: notaDe.get(claveSeg(h))?.detalle || '' })
      else if (h.accion === 'nota') { if (!conEstado.has(claveSeg(h))) out.push({ ...h, texto: h.detalle }) }
      else out.push(h)
    }
    const q = busca.trim().toLowerCase()
    const equipo = new Set(users.map((u) => u.id)) // solo movimientos de la gente del centro
    return out
      // Con una empresa elegida se ve todo su historial, aunque la llevara alguien de otro centro antes
      .filter((h) => empresa || equipo.has(h.usuario_id))
      .filter((h) => tipo === 'todo' || h.accion === 'estado' || h.accion === 'nota')
      .filter((h) => !persona || h.usuario_id === persona)
      .filter((h) => !q || (h.empresa_nombre || '').toLowerCase().includes(q) || (h.texto || '').toLowerCase().includes(q))
  })()

  // Agrupadas por día
  const porDia = []
  for (const h of entradas) {
    const d = isoDia(new Date(h.creado))
    if (!porDia.length || porDia[porDia.length - 1].dia !== d) porDia.push({ dia: d, items: [] })
    porDia[porDia.length - 1].items.push(h)
  }
  const tituloDia = (d) => d === HOY() ? 'Hoy' : d === sumarDias(-1) ? 'Ayer'
    : new Date(d + 'T00:00:00').toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long',
      ...(d.slice(0, 4) !== HOY().slice(0, 4) ? { year: 'numeric' } : {}), // con todo el historial puede haber otros años
    })
  const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const empresaDe = (id) => companies.find((c) => c.id === id)
  const fechaHora = (iso) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Resumen de la empresa elegida: contactos (notas y cambios de estado) por persona
  const resumen = (() => {
    if (!empresa || !filas) return null
    const contactos = entradas.filter((h) => h.accion === 'estado' || h.accion === 'nota') // ya vienen de más nuevo a más viejo
    const porPersona = new Map()
    for (const h of contactos) {
      const p = porPersona.get(h.usuario_id) || { nombre: h.usuario_nombre || 'Alguien', n: 0, ultimo: h, primero: h }
      p.n++; p.primero = h
      porPersona.set(h.usuario_id, p)
    }
    return {
      total: contactos.length,
      primero: contactos[contactos.length - 1] || null,
      ultimo: contactos[0] || null,
      personas: [...porPersona.values()],
    }
  })()
  const empActual = empresa && empresaDe(empresa.id)
  const elegirEmpresa = (id, nombre) => { setEmpresa({ id, nombre }); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] p-5">
        <h2 className="font-bold text-slate-900 flex items-center gap-1.5 mb-3">
          <History className="w-4 h-4 text-slate-400" />Últimos cambios del CRM
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {empresa ? (
            <span className="px-2.5 py-1 rounded-lg border border-blue-600 bg-blue-50 text-blue-700 font-medium text-xs">Todo su historial</span>
          ) : [[1, 'Hoy y ayer'], [7, '7 días'], [30, '30 días']].map(([n, label]) => (
            <button key={n} onClick={() => setDias(n)}
              className={`px-2.5 py-1 rounded-lg border text-xs ${dias === n ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
          <span className="w-px h-5 bg-slate-200 mx-1" />
          <BuscadorEmpresa companies={companies} valor={empresa} onCambiar={setEmpresa} />
          <select value={persona} onChange={(e) => setPersona(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white">
            <option value="">Todo el equipo</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white">
            <option value="seguimientos">Notas y cambios de estado</option>
            <option value="todo">Todos los movimientos</option>
          </select>
          <div className="relative flex-1 min-w-[10rem]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={empresa ? 'Buscar en las notas…' : 'Buscar empresa o nota…'}
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0e2d4d]/30" />
          </div>
        </div>
      </div>

      {resumen && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            {empActual ? (
              <button onClick={() => onAbrir(empActual)} className="font-bold text-slate-900 hover:underline text-left">{empActual.nombre}</button>
            ) : (
              <span className="font-bold text-slate-400 line-through" title="Empresa eliminada">{empresa.nombre}</span>
            )}
            {empActual && (
              <span className={`px-1.5 py-0.5 rounded border text-xs font-medium ${estadoDe(empActual.estado).color}`}>{estadoDe(empActual.estado).label}</span>
            )}
            {empActual && <span className="text-xs text-slate-500">· Responsable: {empActual.responsable ? nombreDe(empActual.responsable) : 'sin asignar'}</span>}
          </div>
          {resumen.total === 0 ? (
            <p className="text-sm text-slate-400">{persona ? 'Esta persona no ha registrado' : 'Nadie ha registrado todavía'} ningún contacto con esta empresa.</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                <strong className="text-slate-900">{resumen.total}</strong> contacto{resumen.total !== 1 ? 's' : ''} registrado{resumen.total !== 1 ? 's' : ''}
                {resumen.total > 1 && <> · primero el {fechaHora(resumen.primero.creado)}</>}
                {' '}· último el {fechaHora(resumen.ultimo.creado)}
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400">
                    <th className="font-medium pb-1">Persona</th>
                    <th className="font-medium pb-1 text-right">Contactos</th>
                    <th className="font-medium pb-1 pl-3">Último</th>
                    <th className="font-medium pb-1 pl-3 hidden sm:table-cell">Cómo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumen.personas.map((p) => (
                    <tr key={p.ultimo.usuario_id}>
                      <td className="py-1.5 text-slate-800">{p.nombre}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.n}</td>
                      <td className="py-1.5 pl-3 text-slate-600 whitespace-nowrap">{fechaHora(p.ultimo.creado)}</td>
                      <td className="py-1.5 pl-3 hidden sm:table-cell">
                        {p.ultimo.accion === 'estado' && p.ultimo.estado_nuevo
                          ? <span className={`px-1.5 py-0.5 rounded border text-xs font-medium ${estadoDe(p.ultimo.estado_nuevo).color}`}>{estadoDe(p.ultimo.estado_nuevo).label}</span>
                          : <span className="text-xs text-slate-500">Nota</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {filas === null ? (
        <p className="text-sm text-slate-400 px-1">Cargando…</p>
      ) : porDia.length === 0 ? (
        empresa ? null : <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-sm text-slate-400">No hay cambios en este periodo.</div>
      ) : porDia.map(({ dia, items }) => (
        <div key={dia}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 mb-2 first-letter:uppercase">
            {tituloDia(dia)} <span className="text-slate-400 font-normal normal-case">· {items.length}</span>
          </p>
          <ol className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] divide-y divide-slate-100 overflow-hidden">
            {items.map((h) => {
              const emp = empresaDe(h.empresa_id)
              return (
                <li key={h.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs text-slate-400 tabular-nums w-10 shrink-0">{hora(h.creado)}</span>
                    {emp ? (
                      <button onClick={() => onAbrir(emp)} className="font-semibold text-slate-900 hover:underline text-left">{h.empresa_nombre || emp.nombre}</button>
                    ) : (
                      <span className="font-semibold text-slate-400 line-through" title="Empresa eliminada">{h.empresa_nombre || '(empresa eliminada)'}</span>
                    )}
                    {!empresa && (
                      <button onClick={() => elegirEmpresa(h.empresa_id, h.empresa_nombre || emp?.nombre || '(empresa eliminada)')}
                        title="Ver todo el seguimiento de esta empresa"
                        className="p-0.5 rounded text-slate-400 hover:text-blue-700 hover:bg-blue-50">
                        <History className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {h.accion === 'estado' && h.estado_nuevo ? (
                      <span className={`px-1.5 py-0.5 rounded border text-xs font-medium ${estadoDe(h.estado_nuevo).color}`}>
                        {h.estado_anterior ? `${estadoDe(h.estado_anterior).label} → ` : ''}{estadoDe(h.estado_nuevo).label}
                      </span>
                    ) : (
                      <span className={`px-1.5 py-0.5 rounded border text-xs font-medium ${accionDe(h.accion).color}`}>{accionDe(h.accion).label}</span>
                    )}
                    <span className="text-xs text-slate-500 ml-auto">{h.usuario_nombre}</span>
                  </div>
                  {(h.accion === 'estado' || h.accion === 'nota') ? (
                    h.texto
                      ? <p className="mt-1 pl-12 text-slate-700 whitespace-pre-wrap break-words">{h.texto}</p>
                      : <p className="mt-1 pl-12 text-xs text-slate-400 italic">Sin nota</p>
                  ) : h.detalle ? (
                    <p className="mt-1 pl-12 text-xs text-slate-600 break-words">{detalleLegible(h)}</p>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}

// ---------- Estadísticas de contacto (por centro) ----------
// Salen del historial. Un «contacto» es una nota o un cambio de estado; un seguimiento con cambio de
// estado deja dos filas (estado + nota) con la misma hora y cuenta como UN contacto (claveSeg).
// Cada contacto cuenta para el centro de la persona que lo hizo, aunque la empresa sea del bote.
// Colores fijos por centro (según su orden en la tabla centros): el mismo centro, el mismo color.
const COLORES_SERIE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const COLOR_BORRADOS = '#94a3b8'
const TODOS = '__todos'
const lunesDe = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const recorta = (s, n = 24) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const diaLargo = (iso) => iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const FUENTE = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'

// Descarga una gráfica SVG como PNG, con su título, el periodo y la leyenda encima
// (fondo blanco, el doble de resolución para que se vea nítida)
function descargarPng(svg, nombre, { titulo = '', sub = '', leyenda = [] } = {}) {
  if (!svg) return
  const W0 = svg.viewBox.baseVal.width, H0 = svg.viewBox.baseVal.height
  const M = 24, CAB = 62 + (leyenda.length > 1 ? 24 : 0)
  const width = W0 + M * 2, height = H0 + CAB + M
  let lx = M
  const ley = leyenda.length > 1 ? leyenda.map((l) => {
    const t = `<circle cx="${lx + 5}" cy="${CAB - 18}" r="5" fill="${l.color}"/><text x="${lx + 15}" y="${CAB - 14}" font-size="12" fill="#475569">${esc(l.nombre)}</text>`
    lx += 30 + String(l.nombre).length * 7
    return t
  }).join('') : ''
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FUENTE}">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    `<text x="${M}" y="34" font-size="17" font-weight="700" fill="#0f172a">${esc(titulo)}</text>` +
    `<text x="${M}" y="54" font-size="12" fill="#64748b">${esc(sub)}</text>${ley}` +
    `<g transform="translate(${M},${CAB})">${svg.innerHTML}</g></svg>`
  const E = 2
  const img = new Image()
  img.onload = () => {
    const cv = document.createElement('canvas')
    cv.width = width * E
    cv.height = height * E
    const g = cv.getContext('2d')
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, cv.width, cv.height)
    g.drawImage(img, 0, 0, cv.width, cv.height)
    cv.toBlob((b) => {
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url
      a.download = `${nombre}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
}

// Ancho real del contenedor, para que la gráfica se dibuje a su tamaño y el texto no se agrande ni encoja
function useAncho(min = 300) {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(720)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(min, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [min])
  return [ref, ancho]
}

const BtnMini = ({ children, ...props }) => (
  <button {...props}
    className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50">
    {children}
  </button>
)

function Tarjeta({ titulo, sub, acciones, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900">{titulo}</h3>
          {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        </div>
        {acciones && <div className="flex items-center gap-2 shrink-0">{acciones}</div>}
      </div>
      {children}
    </div>
  )
}

// Barras horizontales. datos: [{ id, label, valor, tip?, color?, apagado? }]. El valor va escrito al
// final de cada barra, así que la gráfica se lee sin pasar el ratón; el ratón da el detalle (tip).
function BarrasSvg({ datos, svgRef, color = COLORES_SERIE[0], vacio = 'No hay datos en este periodo.' }) {
  const [hover, setHover] = useState(null)
  const [caja, W] = useAncho()
  const F = 30, IZQ = Math.round(Math.min(168, W * 0.38)), DER = 44, TOP = 4
  const H = TOP + datos.length * F + 4
  const max = Math.max(1, ...datos.map((d) => d.valor))
  const ancho = W - IZQ - DER
  const d = hover !== null ? datos[hover] : null
  const cabe = Math.max(8, Math.floor((IZQ - 14) / 7)) // caracteres que caben en la columna de nombres
  return (
    <div ref={caja} className="relative">
      {!datos.length ? <p className="text-sm text-slate-400">{vacio}</p> : (
      <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" fontFamily={FUENTE} role="img"
        onMouseLeave={() => setHover(null)}>
        {datos.map((x, i) => {
          const y = TOP + i * F
          const w = x.valor ? Math.max(4, (x.valor / max) * ancho) : 0
          return (
            <g key={x.id} onMouseEnter={() => setHover(i)}>
              <rect x={0} y={y} width={W} height={F} rx="6" fill={hover === i ? '#f1f5f9' : '#ffffff'} />
              <text x={IZQ - 10} y={y + F / 2 + 4.5} textAnchor="end" fontSize="13"
                fill={x.apagado ? '#94a3b8' : '#334155'} fontStyle={x.apagado ? 'italic' : 'normal'}>{recorta(x.label, cabe)}</text>
              {w > 0 && <rect x={IZQ} y={y + 7} width={w} height={F - 14} rx="4" fill={x.color || color} />}
              <text x={IZQ + w + 8} y={y + F / 2 + 4.5} fontSize="13" fontWeight="700" fill={x.valor ? '#0f172a' : '#94a3b8'}>{x.valor}</text>
            </g>
          )
        })}
      </svg>
      )}
      {d?.tip && (
        <div className="absolute z-10 pointer-events-none rounded-lg bg-[#0d2b45] text-white text-xs px-2.5 py-1.5 shadow-lg max-w-xs"
          style={{ left: `${(IZQ / W) * 100}%`, top: `${((TOP + (hover + 1) * F) / H) * 100}%` }}>
          <p className="font-semibold">{d.label}</p>
          <p className="text-white/80">{d.tip}</p>
        </div>
      )}
    </div>
  )
}

// Líneas por semana. series: [{ id, nombre, color, valores: [n por semana] }]
function LineasSvg({ etiquetas, series, svgRef }) {
  const [hover, setHover] = useState(null)
  const [caja, W] = useAncho()
  const H = 240, IZQ = 34, DER = 14, TOP = 12, ABAJO = 26
  const n = etiquetas.length
  const ancho = W - IZQ - DER, alto = H - TOP - ABAJO
  const max = Math.max(1, ...series.flatMap((s) => s.valores))
  const paso = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((p) => max / p <= 4) || 2000
  const tope = Math.ceil(max / paso) * paso
  const x = (i) => IZQ + (n === 1 ? ancho / 2 : (i * ancho) / (n - 1))
  const y = (v) => TOP + alto - (v / tope) * alto
  const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(W / 80))))
  const col = n === 1 ? ancho : ancho / (n - 1)
  const marcas = n <= 30
  return (
    <div ref={caja} className="relative">
      <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" fontFamily={FUENTE} role="img"
        onMouseLeave={() => setHover(null)}>
        <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
        {Array.from({ length: tope / paso + 1 }, (_, k) => k * paso).map((v) => (
          <g key={v}>
            <line x1={IZQ} x2={W - DER} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#cbd5e1' : '#eef2f6'} strokeWidth="1" />
            <text x={IZQ - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{v}</text>
          </g>
        ))}
        {etiquetas.map((e, i) => i % cada === 0 ? (
          <text key={i} x={x(i)} y={H - 8} textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && x(i) > W - DER - 30 ? 'end' : 'middle'} fontSize="11" fill="#64748b">{e}</text>
        ) : null)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={TOP + alto} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />}
        {series.map((s) => (
          <g key={s.id}>
            <path d={s.valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
              fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {s.valores.map((v, i) => (marcas || hover === i) && (
              <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 4} fill={s.color} stroke="#ffffff" strokeWidth="2" />
            ))}
          </g>
        ))}
        {etiquetas.map((_, i) => (
          <rect key={i} x={x(i) - col / 2} y={TOP} width={col} height={alto} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && (
        <div className="absolute z-10 pointer-events-none rounded-lg bg-[#0d2b45] text-white text-xs px-2.5 py-1.5 shadow-lg whitespace-nowrap"
          style={{ left: `${(x(hover) / W) * 100}%`, top: 0, transform: `translateX(${x(hover) > W * 0.6 ? 'calc(-100% - 10px)' : '10px'})` }}>
          <p className="font-semibold mb-0.5">Semana del {etiquetas[hover]}</p>
          {series.map((s) => (
            <p key={s.id} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              {series.length > 1 && <span className="text-white/80">{s.nombre}</span>}
              <span className="ml-auto pl-3 font-semibold tabular-nums">{s.valores[hover]} contacto{s.valores[hover] !== 1 ? 's' : ''}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function Estadisticas({ users, companies, centros = [], miCentro, isSuper }) {
  const [desde, setDesde] = useState(INICIO_CURSO())
  const [hasta, setHasta] = useState(HOY())
  const [ver, setVer] = useState(isSuper && centros.length > 1 ? TODOS : miCentro)
  const [hist, setHist] = useState(null)
  const [err, setErr] = useState('')
  const refSemanas = useRef(null), refGente = useRef(null), refPersonas = useRef(null), refVeces = useRef(null), refEstados = useRef(null)

  useEffect(() => {
    let vivo = true
    setHist(null); setErr('')
    traerTodo(() => supabase
      .from('historial')
      .select('id, empresa_id, usuario_id, usuario_nombre, empresa_nombre, accion, estado_nuevo, creado')
      .in('accion', ['nota', 'estado'])
      .gte('creado', new Date(desde + 'T00:00:00').toISOString())
      .lt('creado', new Date(diaMas(hasta, 1) + 'T00:00:00').toISOString())
      .order('id'))
      .then((d) => { if (vivo) setHist(d) })
      .catch((e) => { if (vivo) { setErr(e.message); setHist([]) } })
    return () => { vivo = false }
  }, [desde, hasta])

  // Un admin de centro solo ve el suyo; el admin general puede ver todos o uno concreto
  const verEf = isSuper ? (ver === TODOS || centros.some((c) => c.id === ver) ? ver : miCentro) : miCentro
  const todos = verEf === TODOS
  const idsCentro = centros.length ? centros.map((c) => c.id) : [miCentro]
  const colorCentro = (id) => id ? COLORES_SERIE[Math.max(0, idsCentro.indexOf(id)) % COLORES_SERIE.length] : COLOR_BORRADOS
  const porId = new Map(users.map((u) => [u.id, u]))
  const centroDeUsuario = (id) => { const u = porId.get(id); return u ? (u.centro || 'TLMA') : null } // null = ya no está en el CRM
  const empresaPorId = new Map(companies.map((c) => [c.id, c]))

  // Contactos únicos (estado + nota del mismo seguimiento = uno)
  const contactos = (() => {
    const m = new Map()
    for (const h of hist || []) {
      const k = claveSeg(h)
      const c = m.get(k) || {
        empresa_id: h.empresa_id, empresa_nombre: h.empresa_nombre, usuario_id: h.usuario_id,
        usuario_nombre: porId.get(h.usuario_id)?.nombre || h.usuario_nombre || 'Alguien que ya no está',
        creado: h.creado, centro: centroDeUsuario(h.usuario_id), estado_nuevo: null,
      }
      if (h.accion === 'estado' && h.estado_nuevo) c.estado_nuevo = h.estado_nuevo
      m.set(k, c)
    }
    return [...m.values()].sort((a, b) => a.creado.localeCompare(b.creado))
  })()
  const enVista = todos ? contactos : contactos.filter((c) => c.centro === verEf)
  const miembros = todos ? users : users.filter((u) => (u.centro || 'TLMA') === verEf)

  // Cifras de cabecera
  const activos = new Set(enVista.filter((c) => porId.has(c.usuario_id)).map((c) => c.usuario_id))
  const empresasTocadas = new Set(enVista.map((c) => c.empresa_id))
  const becas = new Set(enVista.filter((c) => c.estado_nuevo === 'beca').map((c) => c.empresa_id)).size
  const media = empresasTocadas.size ? (enVista.length / empresasTocadas.size).toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '0'
  const pct = (a, b) => b ? Math.round((a / b) * 100) : 0

  // Por persona (con quien no ha contactado, para ver quién falta)
  const porPersona = miembros.map((u) => {
    const suyos = enVista.filter((c) => c.usuario_id === u.id)
    return { u, n: suyos.length, empresas: new Set(suyos.map((c) => c.empresa_id)).size, ultimo: suyos.length ? suyos[suyos.length - 1].creado : null }
  }).sort((a, b) => b.n - a.n || a.u.nombre.localeCompare(b.u.nombre, 'es'))
  const deBorrados = enVista.filter((c) => !porId.has(c.usuario_id))

  // Por centro (vista de todos los centros)
  const porCentro = [...idsCentro, null].map((id) => {
    const suyos = contactos.filter((c) => c.centro === id)
    const gente = id ? users.filter((u) => (u.centro || 'TLMA') === id) : []
    const act = new Set(suyos.map((c) => c.usuario_id))
    return {
      id, nombre: id ? (centros.find((c) => c.id === id)?.nombre || id) : 'Gente que ya no está en el CRM',
      miembros: gente.length, activos: id ? act.size : 0, contactos: suyos.length,
      empresas: new Set(suyos.map((c) => c.empresa_id)).size,
      becas: new Set(suyos.filter((c) => c.estado_nuevo === 'beca').map((c) => c.empresa_id)).size,
    }
  }).filter((r) => r.id || r.contactos)

  // Contactos por semana
  const semanas = []
  for (let d = lunesDe(new Date(desde + 'T00:00:00')); isoDia(d) <= hasta; d.setDate(d.getDate() + 7)) semanas.push(isoDia(d))
  const idxSemana = new Map(semanas.map((s, i) => [s, i]))
  const serie = (filtro) => {
    const v = semanas.map(() => 0)
    for (const c of contactos) if (filtro(c)) { const i = idxSemana.get(isoDia(lunesDe(c.creado))); if (i !== undefined) v[i]++ }
    return v
  }
  const series = todos
    ? porCentro.filter((r) => r.contactos > 0 || r.id).map((r) => ({ id: r.id || 'borrados', nombre: r.id || 'Ya no están', color: colorCentro(r.id), valores: serie((c) => c.centro === r.id) }))
        .filter((s) => s.id !== 'borrados' || s.valores.some(Boolean))
    : [{ id: verEf, nombre: verEf, color: colorCentro(verEf), valores: serie((c) => c.centro === verEf) }]
  const etiquetasSemana = semanas.map((s) => new Date(s + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }))

  // Veces que se ha contactado cada empresa
  const porEmpresa = (() => {
    const m = new Map()
    for (const c of enVista) {
      const e = m.get(c.empresa_id) || { id: c.empresa_id, nombre: empresaPorId.get(c.empresa_id)?.nombre || c.empresa_nombre || '(empresa borrada)', n: 0, gente: new Set(), ultimo: null }
      e.n++; e.gente.add(c.usuario_nombre); e.ultimo = c.creado
      m.set(c.empresa_id, e)
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'))
  })()
  const tramos = [[1, '1 vez'], [2, '2 veces'], [3, '3 veces'], [4, '4 veces'], [5, '5 veces o más']]
  const veces = tramos.map(([t, label]) => {
    const n = porEmpresa.filter((e) => (t === 5 ? e.n >= 5 : e.n === t)).length
    return { id: String(t), label, valor: n, tip: `${n} empresa${n !== 1 ? 's' : ''} (${pct(n, porEmpresa.length)} % de las contactadas)` }
  })

  // Estado actual de las empresas (no depende de las fechas)
  const empresasVista = todos ? companies.filter((c) => c.centro) : companies.filter((c) => c.centro === verEf)
  const estados = ESTADOS
    .map((e) => ({ id: e.id, label: e.label, valor: empresasVista.filter((c) => c.estado === e.id).length, oculto: e.oculto }))
    .filter((e) => !e.oculto || e.valor)
    .map((e) => ({ ...e, tip: `${pct(e.valor, empresasVista.length)} % de las ${empresasVista.length} empresas` }))

  const sufijo = `${todos ? 'todos' : verEf}-${desde}_${hasta}`
  const exportarContactos = () => descargarCsv(`contactos-${sufijo}`,
    ['Fecha', 'Centro', 'Persona', 'Empresa', 'Tipo', 'Estado nuevo'],
    enVista.map((c) => [new Date(c.creado).toLocaleString('es-ES'), c.centro || '—', c.usuario_nombre,
      empresaPorId.get(c.empresa_id)?.nombre || c.empresa_nombre || '', c.estado_nuevo ? 'Cambio de estado' : 'Nota',
      c.estado_nuevo ? estadoDe(c.estado_nuevo).label : '']))
  const exportarPersonas = () => descargarCsv(`contactos-por-persona-${sufijo}`,
    ['Centro', 'Persona', 'Contactos', 'Empresas distintas', 'Último contacto'],
    porPersona.map((p) => [p.u.centro || 'TLMA', p.u.nombre, p.n, p.empresas, p.ultimo ? diaLargo(p.ultimo) : '']))
  const exportarEmpresas = () => descargarCsv(`contactos-por-empresa-${sufijo}`,
    ['Empresa', 'Centro de la empresa', 'Veces contactada', 'Personas que la han contactado', 'Último contacto', 'Estado actual'],
    porEmpresa.map((e) => { const c = empresaPorId.get(e.id); return [e.nombre, c ? (c.centro || 'Bote común') : 'Borrada', e.n, [...e.gente].join(', '), diaLargo(e.ultimo), c ? estadoDe(c.estado).label : ''] }))

  const atajo = (label, d) => (
    <button key={label} onClick={() => { setDesde(d); setHasta(HOY()) }}
      className={`px-2.5 py-1 rounded-lg border text-xs ${desde === d && hasta === HOY() ? 'border-white bg-white text-[#0e2d4d] font-semibold' : 'border-white/25 text-white/80 hover:bg-white/10'}`}>
      {label}
    </button>
  )
  const Cifra = ({ valor, label, sub }) => (
    <div className="bg-white rounded-2xl border border-slate-200/80 px-4 py-3">
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{valor}</p>
      <p className="text-xs font-medium text-slate-600">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
  const subPng = `CRM IAESTE · ${todos ? 'Todos los centros' : (centros.find((c) => c.id === verEf)?.nombre || verEf)} · del ${diaLargo(desde + 'T00:00:00')} al ${diaLargo(hasta + 'T00:00:00')}`
  const png = (ref, nombre, titulo, leyenda) => (
    <BtnMini onClick={() => descargarPng(ref.current, `${nombre}-${sufijo}`, { titulo, sub: subPng, leyenda })}><Download className="w-3.5 h-3.5" />PNG</BtnMini>
  )

  return (
    <div className="space-y-4">
      <div className="bg-[#0d2b45] text-white rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-sky-300" />Estadísticas de contacto</h2>
            <p className="text-sm text-white/70 mt-0.5">Quién contacta, cuánto y con qué empresas, {todos ? 'por centro' : `en ${centros.find((c) => c.id === verEf)?.nombre || verEf}`}.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[['Contactos', exportarContactos], ['Por persona', exportarPersonas], ['Por empresa', exportarEmpresas]].map(([l, fn]) => (
              <button key={l} onClick={fn} disabled={!hist}
                className="px-2.5 py-1 rounded-lg border border-white/25 text-xs font-medium text-white/90 hover:bg-white/10 inline-flex items-center gap-1 disabled:opacity-50">
                <FileSpreadsheet className="w-3.5 h-3.5" />CSV · {l}
              </button>
            ))}
          </div>
        </div>
        {isSuper && centros.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto mt-4 pb-0.5">
            {[{ id: TODOS, label: 'Todos los centros' }, ...centros.map((c) => ({ id: c.id, label: c.id, title: c.nombre }))].map((t) => (
              <button key={t.id} onClick={() => setVer(t.id)} title={t.title}
                className={`shrink-0 px-3 py-1 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 ${verEf === t.id ? 'bg-white text-[#0e2d4d]' : 'text-white/80 hover:bg-white/10'}`}>
                {t.id !== TODOS && <span className="w-2 h-2 rounded-full" style={{ background: colorCentro(t.id) }} />}
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-white/20 text-sm bg-white text-slate-900" />
          <span className="text-white/60 text-sm">a</span>
          <input type="date" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-white/20 text-sm bg-white text-slate-900" />
          <span className="flex gap-1.5">{atajo('Curso', INICIO_CURSO())}{atajo('30 días', sumarDias(-30))}{atajo('7 días', sumarDias(-7))}</span>
        </div>
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {hist === null ? (
        <p className="text-sm text-slate-400 px-1">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Cifra valor={`${activos.size}/${miembros.length}`} label="Personas que han contactado" sub={`${pct(activos.size, miembros.length)} % del ${todos ? 'total' : 'centro'}`} />
            <Cifra valor={enVista.length} label="Contactos" sub="notas y cambios de estado" />
            <Cifra valor={empresasTocadas.size} label="Empresas contactadas" sub="distintas" />
            <Cifra valor={media} label="Contactos por empresa" sub="de media" />
            <Cifra valor={becas} label="Becas conseguidas" sub="en el periodo" />
          </div>

          <Tarjeta titulo="Contactos por semana" sub={todos ? 'Cada línea es un centro. Pasa el ratón para ver los números de cada semana.' : 'Pasa el ratón para ver los números de cada semana.'}
            acciones={png(refSemanas, 'contactos-por-semana', 'Contactos por semana', series)}>
            {series.length > 1 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-slate-600">
                {series.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.nombre}
                    <span className="text-slate-400 tabular-nums">· {s.valores.reduce((a, b) => a + b, 0)}</span>
                  </span>
                ))}
              </div>
            )}
            <LineasSvg etiquetas={etiquetasSemana} series={series} svgRef={refSemanas} />
          </Tarjeta>

          {todos ? (
            <Tarjeta titulo="Por centro" sub="Personas que han contactado al menos una vez en el periodo, sobre el total de miembros de cada centro."
              acciones={png(refGente, 'gente-que-contacta-por-centro', 'Personas que han contactado, por centro')}>
              <BarrasSvg svgRef={refGente}
                datos={porCentro.filter((r) => r.id).map((r) => ({ id: r.id, label: r.id, valor: r.activos, color: colorCentro(r.id),
                  tip: `${r.nombre}: ${r.activos} de ${r.miembros} miembros (${pct(r.activos, r.miembros)} %) · ${r.contactos} contactos` }))} />
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 uppercase tracking-wide text-right">
                      <th className="text-left font-medium pb-2">Centro</th>
                      <th className="font-medium pb-2">Miembros</th>
                      <th className="font-medium pb-2" title="Han hecho al menos un contacto en el periodo">Activos</th>
                      <th className="font-medium pb-2">Contactos</th>
                      <th className="font-medium pb-2">Empresas</th>
                      <th className="font-medium pb-2" title="Contactos por persona activa">Por persona</th>
                      <th className="font-medium pb-2">Becas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porCentro.map((r) => (
                      <tr key={r.id || 'na'} className="border-t border-slate-100 text-right tabular-nums">
                        <td className={`text-left py-2 ${r.id ? 'text-slate-800 font-medium' : 'text-slate-400 italic'}`}>
                          <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: colorCentro(r.id) }} />{r.id || r.nombre}
                        </td>
                        <td className="text-slate-500">{r.id ? r.miembros : '—'}</td>
                        <td className="text-slate-700">{r.id ? <>{r.activos} <span className="text-slate-400 text-xs">({pct(r.activos, r.miembros)} %)</span></> : '—'}</td>
                        <td className="text-slate-900 font-semibold">{r.contactos}</td>
                        <td className="text-slate-500">{r.empresas}</td>
                        <td className="text-slate-500">{r.activos ? (r.contactos / r.activos).toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '—'}</td>
                        <td className={r.becas ? 'text-emerald-700 font-semibold' : 'text-slate-300'}>{r.becas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          ) : (
            <Tarjeta titulo="Contactos por persona"
              sub={`${activos.size} de ${miembros.length} personas han contactado en el periodo. En gris, quien aún no ha hecho ninguno.`}
              acciones={png(refPersonas, 'contactos-por-persona', 'Contactos por persona')}>
              <BarrasSvg svgRef={refPersonas} color={colorCentro(verEf)} vacio="No hay nadie en este centro todavía."
                datos={porPersona.map((p) => ({ id: p.u.id, label: p.u.nombre, valor: p.n, apagado: !p.n,
                  tip: p.n ? `${p.empresas} empresa${p.empresas !== 1 ? 's' : ''} distinta${p.empresas !== 1 ? 's' : ''} · último contacto el ${diaLargo(p.ultimo)}` : 'Ningún contacto en este periodo' }))} />
              {deBorrados.length > 0 && (
                <p className="text-xs text-slate-400 mt-3">Además hay {deBorrados.length} contactos de gente que ya no está en el CRM; cuentan en las cifras de empresas pero no en esta lista.</p>
              )}
            </Tarjeta>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Tarjeta titulo="Veces que se ha contactado cada empresa" sub={`${porEmpresa.length} empresas contactadas en el periodo.`}
              acciones={png(refVeces, 'veces-por-empresa', 'Veces que se ha contactado cada empresa')}>
              <BarrasSvg svgRef={refVeces} datos={porEmpresa.length ? veces : []} color={todos ? COLORES_SERIE[0] : colorCentro(verEf)} />
            </Tarjeta>
            <Tarjeta titulo="Estado actual de las empresas" sub={`${empresasVista.length} empresas ${todos ? 'asignadas a algún centro' : 'del centro'}. Es la foto de hoy: no depende de las fechas.`}
              acciones={png(refEstados, 'estado-empresas', 'Estado actual de las empresas')}>
              <BarrasSvg svgRef={refEstados} datos={empresasVista.length ? estados : []} color={todos ? COLORES_SERIE[0] : colorCentro(verEf)} vacio="Este centro no tiene empresas todavía." />
            </Tarjeta>
          </div>

          <Tarjeta titulo="Empresas más contactadas" sub="Las diez con más contactos en el periodo.">
            {porEmpresa.length === 0 ? <p className="text-sm text-slate-400">No hay contactos en este periodo.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 uppercase tracking-wide text-left">
                      <th className="font-medium pb-2">Empresa</th>
                      <th className="font-medium pb-2 text-right pr-4">Veces</th>
                      <th className="font-medium pb-2">Quién</th>
                      <th className="font-medium pb-2">Último</th>
                      <th className="font-medium pb-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porEmpresa.slice(0, 10).map((e) => {
                      const c = empresaPorId.get(e.id)
                      return (
                        <tr key={e.id} className="border-t border-slate-100">
                          <td className="py-2 pr-3 text-slate-800 font-medium">{e.nombre}</td>
                          <td className="text-right pr-4 font-bold tabular-nums text-slate-900">{e.n}</td>
                          <td className="pr-3 text-slate-500 text-xs">{[...e.gente].join(', ')}</td>
                          <td className="pr-3 text-slate-500 text-xs whitespace-nowrap">{diaLargo(e.ultimo)}</td>
                          <td>{c ? <Badge estadoId={c.estado} /> : <span className="text-xs text-slate-400 italic">borrada</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>

          <p className="text-xs text-slate-400 leading-relaxed px-1">
            Un contacto es una nota o un cambio de estado en una empresa; si se cambia el estado y se escribe la nota a la vez, cuenta como uno.
            Cada contacto cuenta para el centro de la persona que lo hizo, aunque la empresa venga del bote común. Los cambios de datos
            (teléfono, dirección…), las altas y las asignaciones no cuentan. Los CSV llevan exactamente lo que se ve con el centro y las fechas elegidas.
          </p>
        </>
      )}
    </div>
  )
}

// ---------- Descargar un CSV (se abre en Excel) ----------
function descargarCsv(nombre, cab, filas) {
  const csv = [cab, ...filas]
    .map((f) => f.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- Mejoras: buzón de ideas para el CRM ----------
// Cualquiera propone; los admins generales marcan en qué estado está cada idea y pueden responder.
const ESTADOS_MEJORA = [
  { id: 'nueva', label: 'Nueva', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'en_marcha', label: 'En marcha', color: 'bg-amber-50 text-amber-800 border-amber-300' },
  { id: 'hecha', label: 'Hecha', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'descartada', label: 'Descartada', color: 'bg-slate-100 text-slate-500 border-slate-200' },
]
const estadoMejora = (id) => ESTADOS_MEJORA.find((e) => e.id === id) || ESTADOS_MEJORA[0]

// ---------- Novedades: lo último que se ha cambiado en el CRM ----------
// Tabla novedades (migracion_novedades.sql). Las escriben los admins generales; además, al marcar una
// idea del buzón como «Hecha» se publica sola como novedad (con quién la propuso).
// Cada navegador recuerda la última novedad que ha visto, para avisar en la bombilla cuando hay otra.
const CLAVE_VISTA = 'crm-novedades-vista'
const leerVista = () => { try { return Number(localStorage.getItem(CLAVE_VISTA)) || 0 } catch { return 0 } }
const guardarVista = (id) => { try { localStorage.setItem(CLAVE_VISTA, String(id)) } catch { /* sin almacenamiento: no pasa nada */ } }
const fechaNovedad = (f) => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
const faltaTabla = (m) => /relation|schema cache|does not exist/i.test(m || '')

// Botón de la cabecera: a los admins generales les marca las ideas nuevas sin revisar; a todo el
// mundo, un punto verde si hay novedades que aún no ha visto.
function BotonMejoras({ me, onAbrir, version }) {
  const [nuevas, setNuevas] = useState(0)
  const [hayNovedad, setHayNovedad] = useState(false)
  useEffect(() => {
    if (me.rol === 'superadmin') {
      supabase.from('mejoras').select('id', { count: 'exact', head: true }).eq('estado', 'nueva')
        .then(({ count }) => setNuevas(count || 0))
    }
    supabase.from('novedades').select('id').order('id', { ascending: false }).limit(1)
      .then(({ data }) => setHayNovedad(!!data?.[0] && data[0].id > leerVista()))
  }, [me.rol, version])
  return (
    <button onClick={() => onAbrir(hayNovedad ? 'novedades' : 'ideas')} title={hayNovedad ? 'Hay novedades en el CRM' : 'Novedades e ideas de mejora'}
      className="relative p-2 rounded-full hover:bg-white/[0.08] text-white/70 hover:text-white">
      <Lightbulb className="w-4 h-4" />
      {nuevas > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-amber-400 text-[#0d2b45] text-[10px] font-bold flex items-center justify-center">{nuevas}</span>
      ) : hayNovedad && (
        <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0d2b45]" />
      )}
    </button>
  )
}

function Novedades({ me, recarga, onCambio }) {
  const [lista, setLista] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [editando, setEditando] = useState(null) // null | 'nueva' | id
  const [f, setF] = useState({ titulo: '', descripcion: '', fecha: HOY() })
  const gestiona = me.rol === 'superadmin'

  useEffect(() => {
    let vivo = true
    supabase.from('novedades').select('*, mejora:mejoras(usuario_nombre, centro)')
      .order('fecha', { ascending: false }).order('id', { ascending: false })
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) setErr(faltaTabla(error.message) ? 'Falta ejecutar migracion_novedades.sql en Supabase.' : error.message)
        setLista(data || [])
        if (data?.length) guardarVista(Math.max(...data.map((n) => n.id)))
      })
    return () => { vivo = false }
  }, [recarga])

  const hacer = async (fn) => {
    setBusy(true); setErr('')
    const { error } = await fn()
    setBusy(false)
    if (error) { setErr(error.message); return }
    setEditando(null); onCambio()
  }
  const abrir = (n) => {
    setEditando(n ? n.id : 'nueva')
    setF(n ? { titulo: n.titulo, descripcion: n.descripcion || '', fecha: n.fecha } : { titulo: '', descripcion: '', fecha: HOY() })
  }
  const guardar = () => {
    const datos = { titulo: f.titulo.trim().slice(0, 120), descripcion: f.descripcion.trim().slice(0, 1000) || null, fecha: f.fecha || HOY() }
    if (!datos.titulo) { setErr('Ponle un título.'); return }
    hacer(() => editando === 'nueva'
      ? supabase.from('novedades').insert(datos)
      : supabase.from('novedades').update(datos).eq('id', editando))
  }

  const formulario = (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-2">
      <input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={120} placeholder="Qué ha cambiado (ej.: Nueva pestaña de Estadísticas)"
        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white" />
      <textarea value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} rows={2} maxLength={1000} placeholder="Explicación corta para el equipo (opcional)"
        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white" />
      <div className="flex items-center gap-2">
        <input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
        <span className="flex-1" />
        <button onClick={() => setEditando(null)} className="text-xs text-slate-500 hover:underline">Cancelar</button>
        <Btn onClick={guardar} disabled={busy}><Save className="w-4 h-4" />Publicar</Btn>
      </div>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-3">
      <p className="text-xs text-slate-500">Lo último que hemos cambiado en el CRM. Muchas cosas salen de vuestras ideas: gracias.</p>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      {gestiona && (editando === 'nueva' ? formulario : (
        <button onClick={() => abrir(null)} className="w-full rounded-xl border border-dashed border-slate-300 py-2 text-sm text-slate-500 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5">
          <Plus className="w-4 h-4" />Añadir novedad
        </button>
      ))}
      {lista === null ? <p className="text-sm text-slate-400">Cargando…</p>
        : lista.length === 0 ? <p className="text-sm text-slate-400">Aún no hay novedades publicadas.</p>
        : (
          <ol className="relative border-l border-slate-200 ml-1.5 space-y-4">
            {lista.map((n) => editando === n.id ? <li key={n.id} className="pl-4">{formulario}</li> : (
              <li key={n.id} className="pl-4 relative">
                <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-white" />
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{fechaNovedad(n.fecha)}</p>
                <p className="text-sm font-semibold text-slate-900">{n.titulo}</p>
                {n.descripcion && <p className="text-sm text-slate-600 whitespace-pre-wrap mt-0.5">{n.descripcion}</p>}
                {n.mejora && (
                  <p className="text-xs text-amber-700 mt-1 inline-flex items-center gap-1">
                    <Lightbulb className="w-3 h-3" />Idea de {n.mejora.usuario_nombre || 'alguien del equipo'}{n.mejora.centro ? ` · ${n.mejora.centro}` : ''}
                  </p>
                )}
                {gestiona && (
                  <p className="mt-1 text-xs text-slate-400 space-x-2">
                    <button onClick={() => abrir(n)} className="underline hover:text-slate-600">editar</button>
                    <button onClick={() => confirm('¿Quitar esta novedad?') && hacer(() => supabase.from('novedades').delete().eq('id', n.id))}
                      className="underline hover:text-rose-600">quitar</button>
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
    </div>
  )
}

function Mejoras({ me, inicial = 'ideas', onClose, onChanged }) {
  const [seccion, setSeccion] = useState(inicial === 'novedades' ? 'novedades' : 'ideas')
  const [lista, setLista] = useState(null)
  const [texto, setTexto] = useState('')
  const [ver, setVer] = useState('abiertas') // 'abiertas' | 'cerradas'
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [respuestas, setRespuestas] = useState({})
  const [recarga, setRecarga] = useState(0)
  const gestiona = me.rol === 'superadmin'

  useEffect(() => {
    let vivo = true
    supabase.from('mejoras').select('*').order('creado', { ascending: false }).then(({ data, error }) => {
      if (!vivo) return
      if (error) setErr(faltaTabla(error.message) ? 'Falta ejecutar migracion_intercambios_mejoras.sql en Supabase.' : error.message)
      setLista(data || [])
    })
    return () => { vivo = false }
  }, [recarga])

  const hacer = async (fn, msg) => {
    setBusy(true); setErr(''); setOk('')
    const { error } = await fn()
    setBusy(false)
    if (error) { setErr(error.message); return false }
    if (msg) setOk(msg)
    setRecarga((r) => r + 1); onChanged?.()
    return true
  }
  const enviar = async () => {
    const t = texto.trim()
    if (t.length < 3) { setErr('Cuéntanos un poco más la idea.'); return }
    if (await hacer(() => supabase.from('mejoras').insert({ usuario_id: me.id, texto: t.slice(0, 1000) }), '¡Gracias! Idea enviada ✓')) setTexto('')
  }
  // Al marcar una idea como «Hecha» se publica sola en Novedades (una vez; luego se puede editar)
  const cambiarEstado = (m, estado) => hacer(async () => {
    const r = await supabase.from('mejoras').update({ estado }).eq('id', m.id)
    if (r.error || estado !== 'hecha') return r
    const { data: ya, error: e1 } = await supabase.from('novedades').select('id').eq('mejora_id', m.id).limit(1)
    if (e1 || ya?.length) return r
    const primera = m.texto.split('\n')[0].trim()
    return supabase.from('novedades').insert({
      titulo: primera.length > 120 ? primera.slice(0, 119) + '…' : primera,
      descripcion: m.respuesta || (primera.length < m.texto.trim().length ? m.texto.trim().slice(0, 1000) : null),
      mejora_id: m.id,
    })
  }, estado === 'hecha' ? 'Marcada como hecha y publicada en Novedades ✓' : '')

  const abiertas = (lista || []).filter((m) => m.estado === 'nueva' || m.estado === 'en_marcha')
  const cerradas = (lista || []).filter((m) => m.estado === 'hecha' || m.estado === 'descartada')
  const mostradas = ver === 'abiertas' ? abiertas : cerradas

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-lg h-[85vh] flex flex-col bg-white rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center gap-2">
          <div className="flex p-0.5 rounded-full bg-slate-100 text-sm">
            {[['novedades', 'Novedades', Sparkles], ['ideas', 'Ideas de mejora', Lightbulb]].map(([id, label, Icono]) => (
              <button key={id} onClick={() => setSeccion(id)}
                className={`px-3 py-1.5 rounded-full font-semibold inline-flex items-center gap-1.5 ${seccion === id ? 'bg-[#0e2d4d] text-white' : 'text-slate-600 hover:text-slate-900'}`}>
                <Icono className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        {seccion === 'novedades' ? (
          <Novedades me={me} recarga={recarga} onCambio={() => { setRecarga((r) => r + 1); onChanged?.() }} />
        ) : (
          <>
            <div className="p-5 pb-3 space-y-3 border-b border-slate-100">
              <p className="text-xs text-slate-500">¿Echas algo en falta en el CRM o hay algo que te estorba? Apúntalo aquí y lo vamos implementando. Lo que se haga saldrá en Novedades.</p>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={1000}
                placeholder="Ej.: que en Seguimiento activo salgan primero las empresas que hace más tiempo que no llamamos"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e2d4d]/30 focus:border-[#0e2d4d]" />
              <div className="flex items-center gap-2">
                {err && <p className="text-xs text-rose-600 flex-1">{err}</p>}
                {ok && !err && <p className="text-xs text-emerald-700 flex-1">{ok}</p>}
                <span className="flex-1" />
                <Btn onClick={enviar} disabled={busy || !texto.trim()}><Send className="w-4 h-4" />Enviar idea</Btn>
              </div>
            </div>

            <div className="px-5 pt-3 flex gap-1.5">
              {[['abiertas', `Pendientes · ${abiertas.length}`], ['cerradas', `Hechas o descartadas · ${cerradas.length}`]].map(([id, label]) => (
                <button key={id} onClick={() => setVer(id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${ver === id ? 'bg-[#0e2d4d] text-white border-[#0e2d4d]' : 'bg-white text-slate-600 border-slate-200'}`}>
                  {label}
                </button>
              ))}
            </div>

            <ul className="flex-1 overflow-y-auto p-5 pt-3 space-y-2">
              {lista === null ? <li className="text-sm text-slate-400">Cargando…</li>
                : mostradas.length === 0 ? <li className="text-sm text-slate-400">{ver === 'abiertas' ? 'No hay ideas pendientes. ¡Lanza la primera!' : 'Todavía no hay ninguna cerrada.'}</li>
                : mostradas.map((m) => {
                  const e = estadoMejora(m.estado)
                  const mia = m.usuario_id === me.id
                  return (
                    <li key={m.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <p className="flex-1 text-slate-800 whitespace-pre-wrap break-words">{m.texto}</p>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[11px] font-medium ${e.color}`}>{e.label}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {mia ? 'Tú' : (m.usuario_nombre || 'Alguien')}{m.centro ? ` · ${m.centro}` : ''} · {fecha(m.creado)}
                        {(gestiona || (mia && m.estado === 'nueva')) && (
                          <button onClick={() => confirm('¿Borrar esta idea?') && hacer(() => supabase.from('mejoras').delete().eq('id', m.id))}
                            disabled={busy} className="ml-2 underline hover:text-rose-600">borrar</button>
                        )}
                      </p>
                      {m.respuesta && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600"><strong>Respuesta:</strong> {m.respuesta}</p>}
                      {gestiona && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {ESTADOS_MEJORA.filter((x) => x.id !== m.estado).map((x) => (
                            <button key={x.id} disabled={busy} onClick={() => cambiarEstado(m, x.id)}
                              className="px-2 py-0.5 rounded-full border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">
                              → {x.label}
                            </button>
                          ))}
                          <input value={respuestas[m.id] ?? m.respuesta ?? ''} maxLength={500}
                            onChange={(ev) => setRespuestas({ ...respuestas, [m.id]: ev.target.value })}
                            placeholder="Responder…"
                            className="flex-1 min-w-[8rem] px-2 py-1 rounded-lg border border-slate-200 text-xs" />
                          {respuestas[m.id] !== undefined && respuestas[m.id] !== (m.respuesta || '') && (
                            <button disabled={busy}
                              onClick={() => hacer(() => supabase.from('mejoras').update({ respuesta: respuestas[m.id].trim() || null }).eq('id', m.id), 'Respuesta guardada ✓')}
                              className="px-2 py-1 rounded-lg bg-[#0e2d4d] text-white text-[11px] font-semibold">Guardar</button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

// ---------- Intercambios: incomings y outgoings ----------
// Quién se va de prácticas fuera (outgoing), quién viene (incoming), adónde y cuándo.
// Los outgoings los ve todo el comité del centro; los incomings, solo los admins. Lo gestionan los admins.
// (La base de datos también lo impone: a un miembro no le llegan las filas de incomings.)
const TIPOS_INTER = {
  outgoing: {
    label: 'Outgoings', sing: 'outgoing', Icono: PlaneTakeoff,
    desc: 'Gente de aquí que se va de prácticas al extranjero.',
    pais: 'País de destino', org: 'Empresa / institución de acogida', inicio: 'Se va', fin: 'Vuelve',
    encargado: 'Persona de contacto en el comité', ahora: 'Fuera ahora', pronto: 'Se van en 30 días',
  },
  incoming: {
    label: 'Incomings', sing: 'incoming', Icono: PlaneLanding,
    desc: 'Trainees de otros países que vienen a hacer prácticas con nosotros.',
    pais: 'País de origen', org: 'Empresa donde hace las prácticas', inicio: 'Llega', fin: 'Se va',
    encargado: 'Buddy / responsable', ahora: 'Aquí ahora', pronto: 'Llegan en 30 días',
  },
}
const ESTADOS_INTER = [
  { id: 'nominado', label: 'Nominado', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  { id: 'aceptado', label: 'Aceptado', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'tramites', label: 'Papeles / visado', color: 'bg-amber-50 text-amber-800 border-amber-300' },
  { id: 'listo', label: 'Todo listo', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'cancelado', label: 'Cancelado', color: 'bg-rose-50 text-rose-700 border-rose-200 line-through' },
]
const estadoInter = (id) => ESTADOS_INTER.find((e) => e.id === id) || ESTADOS_INTER[0]
// En qué momento está, según las fechas
const faseInter = (x, hoy) =>
  x.estado === 'cancelado' ? 'cancelado'
    : !x.inicio ? 'sin_fechas'
      : hoy < x.inicio ? 'proximo'
        : x.fin && hoy > x.fin ? 'terminado'
          : 'en_curso'
const diasEntre = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5)
const fechaInter = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '¿?'
const mesInter = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

const INTER_VACIO = { nombre: '', email: '', telefono: '', pais: '', ciudad: '', organizacion: '', referencia: '', inicio: '', fin: '', estado: 'nominado', alojamiento: '', encargado: '', notas: '' }

function FichaIntercambio({ inter, tipo, centro, users, me, puedeGestionar, onSaved, onClose }) {
  const t = TIPOS_INTER[tipo]
  const [f, setF] = useState(() => inter ? { ...INTER_VACIO, ...Object.fromEntries(Object.entries(inter).map(([k, v]) => [k, v ?? ''])) } : { ...INTER_VACIO })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const lectura = !puedeGestionar

  const guardar = async () => {
    if (!f.nombre.trim()) { setErr('Falta el nombre.'); return }
    if (f.inicio && f.fin && f.fin < f.inicio) { setErr(`La fecha de «${t.fin}» no puede ser anterior a la de «${t.inicio}».`); return }
    const datos = {
      nombre: f.nombre.trim().slice(0, 120), email: f.email.trim() || null, telefono: f.telefono.trim() || null,
      pais: f.pais.trim() || null, ciudad: f.ciudad.trim() || null, organizacion: f.organizacion.trim() || null,
      referencia: f.referencia.trim() || null, inicio: f.inicio || null, fin: f.fin || null, estado: f.estado,
      alojamiento: f.alojamiento.trim() || null, encargado: f.encargado || null, notas: f.notas.trim() || null,
      actualizado_por: me.nombre,
    }
    setBusy(true); setErr('')
    const { error } = inter
      ? await supabase.from('intercambios').update(datos).eq('id', inter.id)
      : await supabase.from('intercambios').insert({ ...datos, tipo, centro })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved(inter ? 'Guardado ✓' : `${t.sing.charAt(0).toUpperCase() + t.sing.slice(1)} añadido ✓`)
  }
  const borrar = async () => {
    if (!confirm(`¿Borrar a ${inter.nombre} de los ${t.label.toLowerCase()}? Si solo se ha caído, mejor márcalo como «Cancelado».`)) return
    setBusy(true)
    const { error } = await supabase.from('intercambios').delete().eq('id', inter.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved('Borrado')
  }

  const campo = (k, label, props = {}) => (
    <div className={props.full ? 'sm:col-span-2' : ''}>
      <Label>{label}</Label>
      <Input value={f[k]} onChange={set(k)} disabled={lectura} type={props.type || 'text'} placeholder={props.placeholder} />
    </div>
  )
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <t.Icono className="w-4 h-4 text-slate-400" />
            {inter ? inter.nombre : `Nuevo ${t.sing}`}
          </h2>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {campo('nombre', 'Nombre y apellidos', { full: true })}
          {campo('email', 'Email', { type: 'email' })}
          {campo('telefono', 'Teléfono')}
          {campo('pais', t.pais)}
          {campo('ciudad', 'Ciudad')}
          {campo('organizacion', t.org, { full: true })}
          {campo('referencia', 'Ref. de la oferta', { placeholder: 'p. ej. IN-2026-1172' })}
          <div>
            <Label>Estado</Label>
            <select value={f.estado} onChange={set('estado')} disabled={lectura}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
              {ESTADOS_INTER.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </div>
          {campo('inicio', t.inicio, { type: 'date' })}
          {campo('fin', t.fin, { type: 'date' })}
          {tipo === 'incoming' && campo('alojamiento', 'Alojamiento', { full: true, placeholder: 'Residencia, piso, dirección…' })}
          <div className="sm:col-span-2">
            <Label>{t.encargado}</Label>
            <select value={f.encargado} onChange={set('encargado')} disabled={lectura}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
              <option value="">Nadie todavía</option>
              <OpcionesPersonas users={users} />
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <textarea value={f.notas} onChange={set('notas')} disabled={lectura} rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0e2d4d]/30" />
          </div>
        </div>
        {inter?.actualizado && <p className="text-xs text-slate-400">Última actualización: {fecha(inter.actualizado)}{inter.actualizado_por ? ` · ${inter.actualizado_por}` : ''}</p>}
        {err && <p className="text-sm text-rose-600">{err}</p>}
        {puedeGestionar ? (
          <div className="flex gap-2 justify-end">
            {inter && <Btn variant="danger" onClick={borrar} disabled={busy} className="mr-auto"><Trash2 className="w-4 h-4" /></Btn>}
            <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
            <Btn onClick={guardar} disabled={busy}><Save className="w-4 h-4" />{busy ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Solo los admins pueden cambiar estos datos.</p>
        )}
      </div>
    </div>
  )
}

function Intercambios({ me, users, centro, puedeGestionar }) {
  const [tipo, setTipo] = useState('outgoing')
  const [lista, setLista] = useState(null)
  const [err, setErr] = useState('')
  const [busca, setBusca] = useState('')
  const [abierto, setAbierto] = useState(null) // null | 'nuevo' | fila
  const [verPasados, setVerPasados] = useState(false)
  const [aviso, setAviso] = useState('')
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vivo = true
    setLista(null)
    supabase.from('intercambios').select('*').eq('centro', centro).order('inicio', { ascending: true, nullsFirst: false }).order('nombre')
      .then(({ data, error }) => {
        if (!vivo) return
        setErr(error ? (/relation|schema cache|does not exist/i.test(error.message) ? 'Falta ejecutar migracion_intercambios_mejoras.sql en Supabase.' : error.message) : '')
        setLista(data || [])
      })
    return () => { vivo = false }
  }, [centro, recarga])

  // Los incomings solo los ven los admins
  const tiposVisibles = Object.entries(TIPOS_INTER).filter(([id]) => puedeGestionar || id === 'outgoing')
  const tipoEf = tiposVisibles.some(([id]) => id === tipo) ? tipo : 'outgoing'
  const t = TIPOS_INTER[tipoEf]
  const hoy = HOY()
  const en30 = sumarDias(30)
  const nombre = (id) => users.find((u) => u.id === id)?.nombre || ''
  const delTipo = (lista || []).filter((x) => x.tipo === tipoEf)
  const q = busca.trim().toLowerCase()
  const filtrados = delTipo.filter((x) => !q || [x.nombre, x.pais, x.ciudad, x.organizacion, x.referencia, nombre(x.encargado)]
    .some((v) => (v || '').toLowerCase().includes(q)))
  const porFase = (fase) => filtrados.filter((x) => faseInter(x, hoy) === fase)
  const enCurso = porFase('en_curso')
  const proximos = porFase('proximo')
  const sinFechas = porFase('sin_fechas')
  const pasados = [...porFase('terminado'), ...porFase('cancelado')].sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''))
  const nAhora = delTipo.filter((x) => faseInter(x, hoy) === 'en_curso').length
  const nPronto = delTipo.filter((x) => faseInter(x, hoy) === 'proximo' && x.inicio <= en30).length
  // Próximos agrupados por el mes en que se van / llegan
  const porMes = []
  for (const x of proximos) {
    const m = x.inicio.slice(0, 7)
    if (!porMes.length || porMes[porMes.length - 1].mes !== m) porMes.push({ mes: m, items: [] })
    porMes[porMes.length - 1].items.push(x)
  }

  const exportar = () => descargarCsv(`${tipoEf}s-iaeste-${centro}`,
    ['Nombre', 'Email', 'Telefono', t.pais, 'Ciudad', t.org, 'Referencia', t.inicio, t.fin, 'Estado', ...(tipoEf === 'incoming' ? ['Alojamiento'] : []), t.encargado, 'Notas'],
    delTipo.map((x) => [x.nombre, x.email, x.telefono, x.pais, x.ciudad, x.organizacion, x.referencia, x.inicio, x.fin, estadoInter(x.estado).label,
      ...(tipoEf === 'incoming' ? [x.alojamiento] : []), nombre(x.encargado), (x.notas || '').replace(/\n/g, ' | ')]))

  const Fila = ({ x }) => {
    const fase = faseInter(x, hoy)
    const e = estadoInter(x.estado)
    const cuando = fase === 'proximo' ? `${tipoEf === 'outgoing' ? 'se va' : 'llega'} en ${diasEntre(hoy, x.inicio)} días`
      : fase === 'en_curso' && x.fin ? `${tipoEf === 'outgoing' ? 'vuelve' : 'se va'} en ${diasEntre(hoy, x.fin)} días`
        : fase === 'en_curso' ? 'sin fecha de fin' : ''
    const semanas = x.inicio && x.fin ? Math.max(1, Math.round((diasEntre(x.inicio, x.fin) + 1) / 7)) : null
    return (
      <button onClick={() => setAbierto(x)} className={`w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-50 ${fase === 'cancelado' || fase === 'terminado' ? 'opacity-70' : ''}`}>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 truncate">{x.nombre}</p>
          <p className="text-xs text-slate-500 truncate">
            {[[x.ciudad, x.pais].filter(Boolean).join(', '), x.organizacion, x.referencia].filter(Boolean).join(' · ') || '—'}
          </p>
          {x.encargado && <p className="text-xs text-slate-400 truncate"><User className="w-3 h-3 inline -mt-0.5 mr-0.5" />{nombre(x.encargado) || 'Alguien de otro centro'}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-700 tabular-nums whitespace-nowrap">
            {x.inicio || x.fin ? <>{fechaInter(x.inicio)} → {fechaInter(x.fin)}</> : <span className="text-amber-700">Faltan fechas</span>}
          </p>
          <p className="text-[11px] text-slate-400 whitespace-nowrap">{[cuando, semanas ? `${semanas} sem.` : ''].filter(Boolean).join(' · ')}</p>
        </div>
        <span className={`hidden sm:inline-flex shrink-0 px-2 py-0.5 rounded-full border text-xs font-medium ${e.color}`}>{e.label}</span>
        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
      </button>
    )
  }
  const Bloque = ({ titulo, items, nota }) => items.length === 0 ? null : (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 mb-2 first-letter:uppercase">
        {titulo} <span className="text-slate-400 font-normal normal-case">· {items.length}{nota ? ` · ${nota}` : ''}</span>
      </p>
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] overflow-hidden divide-y divide-slate-100">
        {items.map((x) => <Fila key={x.id} x={x} />)}
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="bg-[#0e2d4d] rounded-2xl p-5 text-white shadow-[0_4px_16px_rgba(13,43,69,0.18)]">
        <h2 className="text-lg font-bold flex items-center gap-2"><PlaneTakeoff className="w-5 h-5 text-teal-300" />Intercambios · {centro}</h2>
        <p className="mt-1 text-sm text-white/75">
          Quién se va, quién viene y cuándo. {puedeGestionar ? 'Pulsa en una persona para actualizar sus datos.' : 'Si ves algo que no cuadra, avisa a un admin.'}
        </p>
        {tiposVisibles.length > 1 && <div className="mt-4 flex gap-1.5 bg-white/10 rounded-full p-1 w-fit">
          {tiposVisibles.map(([id, x]) => (
            <button key={id} onClick={() => { setTipo(id); setVerPasados(false) }}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm transition-colors ${tipoEf === id ? 'bg-white text-[#0e2d4d] font-bold' : 'text-white/85 font-medium hover:bg-white/[0.08]'}`}>
              <x.Icono className="w-4 h-4" />{x.label}
              <span className={tipoEf === id ? 'text-[#0e2d4d]/50' : 'text-white/50'}>· {(lista || []).filter((y) => y.tipo === id && y.estado !== 'cancelado').length}</span>
            </button>
          ))}
        </div>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t.ahora}</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{nAhora}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t.pronto}</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{nPronto}</p>
        </div>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap gap-2">
        <div className="relative flex-1 basis-full sm:basis-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar persona, país, empresa o referencia…" className="pl-9" />
        </div>
        {puedeGestionar && (
          <button onClick={exportar} title="Exportar a Excel"
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4" /><span className="hidden lg:inline">Exportar</span>
          </button>
        )}
        {puedeGestionar && <Btn onClick={() => setAbierto('nuevo')}><Plus className="w-4 h-4" /><span className="hidden sm:inline">Añadir {t.sing}</span></Btn>}
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {aviso && <p className="text-sm text-emerald-700">{aviso}</p>}

      {lista === null ? <p className="text-sm text-slate-400 px-1">Cargando…</p>
        : delTipo.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-sm text-slate-400">
            {t.desc} Todavía no hay ninguno{puedeGestionar ? `: añade el primero con «Añadir ${t.sing}».` : '.'}
          </div>
        ) : (
          <>
            <Bloque titulo={tipoEf === 'outgoing' ? 'Fuera ahora' : 'Aquí ahora'} items={enCurso} />
            {porMes.map(({ mes, items }) => (
              <Bloque key={mes} titulo={`${tipoEf === 'outgoing' ? 'Se van' : 'Llegan'} en ${mesInter(mes + '-01')}`} items={items} />
            ))}
            <Bloque titulo="Sin fechas todavía" items={sinFechas} nota="ponles fecha en cuanto se sepa" />
            {pasados.length > 0 && (
              <div>
                <button onClick={() => setVerPasados(!verPasados)} className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 mb-2 inline-flex items-center gap-1">
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${verPasados ? 'rotate-90' : ''}`} />
                  Terminados y cancelados <span className="text-slate-400 font-normal normal-case">· {pasados.length}</span>
                </button>
                {verPasados && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden divide-y divide-slate-100">
                    {pasados.map((x) => <Fila key={x.id} x={x} />)}
                  </div>
                )}
              </div>
            )}
            {filtrados.length === 0 && <p className="text-sm text-slate-400 px-1">Nadie coincide con la búsqueda.</p>}
          </>
        )}

      {abierto && (
        <FichaIntercambio
          inter={abierto === 'nuevo' ? null : abierto}
          tipo={abierto === 'nuevo' ? tipoEf : abierto.tipo}
          centro={centro} users={users} me={me} puedeGestionar={puedeGestionar}
          onClose={() => setAbierto(null)}
          onSaved={(m) => { setAbierto(null); setAviso(m); setTimeout(() => setAviso(''), 3000); setRecarga((r) => r + 1) }}
        />
      )}
    </div>
  )
}

// ---------- Exportar empresas a CSV (se abre en Excel) ----------
function exportarEmpresas(lista, nombreDe) {
  const cab = ['Empresa', 'CIF', 'Sector', 'Contacto', 'Telefono', 'Email', 'Direccion', 'Practicas', 'Estado', 'Responsable', 'Proximo contacto', 'Notas']
  const filas = lista.map((c) => [
    c.nombre, c.cif || '', c.sector || '', c.contacto || '', c.telefono || '', c.email || '', c.direccion || '', textoPracticas(c.practicas),
    estadoDe(c.estado).label, nombreDe(c.responsable), c.proximo_contacto || '',
    (c.notas || '').replace(/\n/g, ' | '),
  ])
  descargarCsv('empresas-iaeste', cab, filas)
}

// ---------- App ----------
// Logo de la cabecera: public/logo-iaeste.png (logotipo blanco de IAESTE con el texto incluido).
// Si no se encuentra el archivo, se muestra un icono y el texto «IAESTE» de reserva.
function LogoIaeste() {
  const [falla, setFalla] = useState(false)
  if (falla) {
    return (
      <>
        <div className="w-8 h-8 rounded-full border border-white/40 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4 text-white" />
        </div>
        <span className="text-base sm:text-lg tracking-[0.12em] font-light">IAESTE</span>
      </>
    )
  }
  return <img src="/logo-iaeste.png" alt="IAESTE" onError={() => setFalla(true)} className="h-8 sm:h-9 w-auto shrink-0 select-none" draggable={false} />
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [me, setMe] = useState(null)
  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [tab, setTab] = useState('empresas')
  const [busca, setBusca] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [grupo, setGrupo] = useState('activo')
  const [filtroPersona, setFiltroPersona] = useState('') // '' | '__sin' | id de usuario
  const [selec, setSelec] = useState([])                   // empresas marcadas para asignar (admin)
  const [asignarA, setAsignarA] = useState('')
  const [asignando, setAsignando] = useState(false)
  const [agenda, setAgenda] = useState('') // '' | 'hoy' | 'atrasadas'
  const [modal, setModal] = useState(null) // null | 'nueva' | empresa
  const [aviso, setAviso] = useState('')
  const [cambiarPass, setCambiarPass] = useState('') // '' | 'normal' | 'recuperacion'
  const [ultimos, setUltimos] = useState(null) // Map empresa_id → fecha (ISO) de su última nota o cambio de estado
  const [orden, setOrden] = useState('') // '' = automático | 'antiguedad' | 'nombre'
  const [mejorasAbierto, setMejorasAbierto] = useState(false) // false | 'novedades' | 'ideas'
  const [centros, setCentros] = useState([])
  const [vista, setVista] = useState('') // '' = mi centro | id de otro centro (solo lectura) | BOTE
  const [centroSel, setCentroSel] = useState('') // admin general: centro que está gestionando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s)
      // Al entrar desde el enlace del correo de recuperación, se pide la contraseña nueva
      if (evento === 'PASSWORD_RECOVERY') setCambiarPass('recuperacion')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const cargar = useCallback(async () => {
    if (!session) return
    // Supabase devuelve como máximo 1000 filas por consulta: empresas y prácticas se piden por páginas
    // (si fallan, se quedan vacías como antes en vez de romper la carga)
    const todas = (consulta) => traerTodo(consulta).then((data) => ({ data }), () => ({ data: null }))
    const [{ data: perfiles }, { data: emps }, { data: pracs }, { data: cents }] = await Promise.all([
      supabase.from('profiles').select('*').order('nombre'),
      todas(() => supabase.from('empresas').select('*').order('nombre').order('id')),
      // Si la tabla practicas aún no existe, esto devuelve error y simplemente no hay históricas
      todas(() => supabase.from('practicas').select('*').order('anio').order('id')),
      // Si aún no se ha ejecutado migracion_multicentro.sql, no hay centros y todo funciona como antes
      supabase.from('centros').select('*').order('orden'),
    ])
    setCentros(cents || [])
    const porEmpresa = {}
    for (const p of pracs || []) (porEmpresa[p.empresa_id] ||= []).push(p)
    setUsers(perfiles || [])
    setCompanies((emps || []).map((c) => ({ ...c, practicas: porEmpresa[c.id] || [] })))
    setMe((perfiles || []).find((p) => p.id === session.user.id) || null)
  }, [session])

  useEffect(() => { cargar() }, [cargar])

  // Último contacto de cada empresa (su nota o cambio de estado más reciente): sirve para ordenar
  // por «más tiempo sin contactar» y para el aviso «Realizar seguimiento».
  // Se vuelve a calcular cada vez que cambian las empresas (al guardar una ficha, etc.).
  const claveEmpresas = companies.map((c) => `${c.id}:${c.estado}:${c.actualizado || ''}`).join('|')
  useEffect(() => {
    if (!session) return
    let vivo = true
    traerTodo(() => supabase
      .from('historial')
      .select('id, empresa_id, creado')
      .in('accion', ['nota', 'estado'])
      .order('id'))
      .then((filas) => {
        if (!vivo) return
        const m = new Map()
        for (const h of filas) if (!m.has(h.empresa_id) || h.creado > m.get(h.empresa_id)) m.set(h.empresa_id, h.creado)
        setUltimos(m)
      })
      .catch(() => vivo && setUltimos(null))
    return () => { vivo = false }
  }, [session, claveEmpresas])
  const desdeSinMover = new Date(Date.now() - SIN_MOVER.dias * 864e5).toISOString()
  const movidas = ultimos && new Set([...ultimos].filter(([, f]) => f >= desdeSinMover).map(([id]) => id))
  const ultimoDe = (c) => ultimos?.get(c.id) || null

  const flash = (m, ms = 2500) => { setAviso(m); setTimeout(() => setAviso(''), ms) }

  // Asignación rápida (admin): filtra «Sin asignar», marca empresas y asígnalas de golpe
  const marcar = (id) => setSelec((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const asignarSeleccion = async () => {
    if (!selec.length || !asignarA) return
    setAsignando(true)
    const quien = users.find((u) => u.id === asignarA)?.nombre || ''
    const { error } = await supabase.from('empresas')
      .update({ responsable: asignarA, actualizado_por: me?.nombre })
      .in('id', selec)
    setAsignando(false)
    if (error) { flash(`No se ha podido asignar: ${error.message}`, 6000); return }
    flash(`${selec.length} empresa${selec.length !== 1 ? 's' : ''} asignada${selec.length !== 1 ? 's' : ''} a ${quien} ✓`, 4000)
    setSelec([])
    cargar()
  }

  if (session === undefined) {
    return <div className="min-h-screen bg-[#f4f6fa] flex items-center justify-center text-slate-400 text-sm">Cargando…</div>
  }
  if (!session) return <Auth />
  if (!me) {
    return <div className="min-h-screen bg-[#f4f6fa] flex items-center justify-center text-slate-400 text-sm">Preparando tu perfil…</div>
  }

  const isSuper = me.rol === 'superadmin'
  const isAdmin = esAdminRol(me.rol)
  const nombreDe = (id) => users.find((u) => u.id === id)?.nombre || 'Sin asignar'

  // ---- Centros ----
  // Cada empresa tiene un centro (el de su responsable) o ninguno = bote común, compartido por todos.
  // En la pestaña de mi centro todo funciona como siempre; la de otro centro es de solo lectura;
  // en «Bote común» los admins reparten empresas a gente de su centro.
  // Centro activo: el propio; un admin general puede cambiarlo y entonces todo se ve de ese centro
  const miCentro = (isSuper && centroSel && centros.some((c) => c.id === centroSel)) ? centroSel : (me.centro || 'TLMA')
  const centroNombre = (id) => centros.find((c) => c.id === id)?.nombre || id
  const baremo = baremoDe(centros, miCentro)
  // Los miembros solo ven su centro; las pestañas de otros centros y del bote son solo para admins
  const vistaEf = isAdmin && vista && (vista === BOTE || centros.some((c) => c.id === vista)) ? vista : miCentro
  const enBote = vistaEf === BOTE
  const ajena = !enBote && vistaEf !== miCentro
  const usersCentro = users.filter((u) => (u.centro || 'TLMA') === miCentro)
  const companiesCentro = companies.filter((c) => c.centro === miCentro)
  const bote = companies.filter((c) => !c.centro)
  const companiesVista = enBote ? bote : companies.filter((c) => c.centro === vistaEf)
  const usersVista = enBote ? usersCentro : users.filter((u) => (u.centro || 'TLMA') === vistaEf)
  // Un admin solo puede editar empresas de su centro o del bote común (también lo impone la base de datos)
  const puedeEditar = (c) => isAdmin && (isSuper || !c || !c.centro || c.centro === miCentro)
  // A quién se puede asignar: admin de centro, a su gente; admin general, a todo el mundo
  const asignables = isSuper ? users : usersCentro
  // En el bote o en otro centro se ven todas las empresas de esa pestaña, no solo las mías
  const verTodo = isAdmin || enBote || ajena
  const cambiarCentro = (c) => { setCentroSel(c); setVista(''); setSelec([]); setFiltroPersona(''); setFiltroEstado(''); setAgenda('') }
  const cambiarVista = (v) => { setVista(v); setSelec([]); setFiltroPersona(''); setFiltroEstado(''); setAgenda(''); if (v === BOTE) setGrupo('disponibles') }

  const hoy = HOY()
  const misSinContactar = companies.filter((c) => c.responsable === me.id && c.estado === 'sin_contactar').length
  // Recordatorios: un miembro solo cuenta los de sus empresas
  const deAgenda = isAdmin ? companiesCentro : companies.filter((c) => c.responsable === me.id)
  const nAtrasadas = deAgenda.filter((c) => c.proximo_contacto && c.proximo_contacto < hoy).length
  const nHoy = deAgenda.filter((c) => c.proximo_contacto === hoy).length
  // Empresas en seguimiento sin nota ni cambio de estado en SIN_MOVER.dias (y sin próximo contacto a futuro)
  const sinMover = (c) => !!movidas && !!c.responsable && SIN_MOVER.estados.includes(c.estado) &&
    !(c.proximo_contacto && c.proximo_contacto > hoy) && !movidas.has(c.id) && (isAdmin ? c.centro === miCentro : c.responsable === me.id)
  const nSinMover = deAgenda.filter(sinMover).length

  // Los miembros ven Disponibles / Seguimiento / Cerradas (solo las suyas) y Todas (todas, en solo lectura)
  const gruposVisibles = GRUPOS.filter((g) => isAdmin || !g.soloAdmin)
  const grupoEf = gruposVisibles.some((g) => g.id === grupo) ? grupo : gruposVisibles[0].id
  const modoAsignar = isAdmin && !ajena && (enBote || filtroPersona === '__sin')
  const agendaVisible = !enBote && !ajena
  const visibles = companiesVista
    .filter((c) => {
      if (agenda && !isAdmin && c.responsable !== me.id) return false
      if (agenda === 'hoy') return c.proximo_contacto && c.proximo_contacto <= hoy
      if (agenda === 'atrasadas') return c.proximo_contacto && c.proximo_contacto < hoy
      if (agenda === 'seguimiento') return sinMover(c)
      return true
    })
    // Con «Para hoy» / «Atrasadas» activo se ven todas las que tocan, sea cual sea el apartado
    .filter((c) => (agenda && agendaVisible) || enGrupo(grupoDe(grupoEf), c, me.id, verTodo))
    .filter((c) => !filtroEstado || c.estado === filtroEstado)
    .filter((c) => !filtroPersona || (filtroPersona === '__sin' ? !c.responsable : c.responsable === filtroPersona))
    .filter((c) => {
      const q = busca.toLowerCase()
      if (!q) return true
      const qCif = cifNorm(q)
      return [c.nombre, c.contacto, c.sector, c.cif, c.direccion, c.email, c.responsable ? nombreDe(c.responsable) : '']
        .some((v) => (v || '').toLowerCase().includes(q)) || (qCif.length >= 4 && cifNorm(c.cif).includes(qCif))
    })
  // Orden: en «Seguimiento activo» y en los avisos, primero las que hace más tiempo que nadie contacta
  // (la que se llamó por última vez, abajo del todo). En el resto, por nombre. Se puede cambiar a mano.
  const ordenAuto = (grupoEf === 'activo' || (agenda && agendaVisible)) ? 'antiguedad' : 'nombre'
  const ordenEf = orden || ordenAuto
  if (ordenEf === 'antiguedad') {
    visibles.sort((a, b) => (ultimoDe(a) || '').localeCompare(ultimoDe(b) || '') || a.nombre.localeCompare(b.nombre, 'es'))
  }

  const pestanas = [['empresas', 'Empresas'], ...(isAdmin ? [['seguimiento', 'Seguimiento'], ['equipo', 'Equipo'], ['estadisticas', 'Estadísticas']] : []), ['intercambios', 'Intercambios'], ['reuniones', 'Reuniones'], ['ranking', 'Ranking']].map(([id, label]) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${tab === id ? 'bg-white text-[#0e2d4d]' : 'text-white/80 hover:text-[#e2e8f0] hover:bg-white/[0.08]'}`}
    >
      {label}
    </button>
  ))

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <header className="bg-[#0d2b45] text-white sticky top-0 z-40 shadow-[0_2px_12px_rgba(13,43,69,0.25)]">
        {/* En el móvil las pestañas van en una segunda fila que se desliza; en pantallas grandes, todo en una */}
        <div className="max-w-5xl mx-auto px-4">
          <div className="h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <LogoIaeste />
              <span className="text-sm text-white/60 font-medium border-l border-white/20 pl-2.5 truncate">
                <span className="hidden sm:inline lg:hidden">Madrid · CRM</span>
                {centros.length > 0 && <><span className="hidden sm:inline lg:hidden"> · </span><span className="text-white/90">{miCentro}</span></>}
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
              <nav className="hidden lg:flex gap-1">{pestanas}</nav>
              <div className="flex items-center gap-1 sm:gap-2 text-sm text-white/80 shrink-0">
                <span className="hidden sm:flex items-center gap-1.5">
                  {isAdmin && <Shield className="w-3.5 h-3.5 text-white/70" />}
                  {me.nombre}
                </span>
                <div className="hidden sm:flex w-8 h-8 rounded-full bg-white text-[#0d2b45] font-bold text-sm items-center justify-center" title={me.nombre}>
                  {(me.nombre || '?').trim().charAt(0).toUpperCase()}
                </div>
                <BotonMejoras me={me} onAbrir={setMejorasAbierto} version={mejorasAbierto} />
                <button
                  onClick={() => setCambiarPass('normal')}
                  title="Cambiar mi contraseña"
                  className="p-2 rounded-full hover:bg-white/[0.08] text-white/70 hover:text-white"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                <button
                  onClick={() => supabase.auth.signOut()}
                  title="Salir"
                  className="p-2 rounded-full hover:bg-white/[0.08] text-white/70 hover:text-white"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          <nav className="lg:hidden flex gap-1 overflow-x-auto pb-2.5 -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{pestanas}</nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'ranking' ? (
          <Ranking users={usersCentro} me={me} centroNombre={centros.length ? centroNombre(miCentro) : ''} baremo={baremo} centro={miCentro} />
        ) : tab === 'intercambios' ? (
          <Intercambios me={me} users={usersCentro} centro={miCentro} puedeGestionar={isAdmin} />
        ) : tab === 'reuniones' ? (
          <Reuniones me={me} users={usersCentro} centro={miCentro} puedeGestionar={isAdmin || !!me.secretaria} baremo={baremo} />
        ) : tab === 'seguimiento' && isAdmin ? (
          <Seguimiento users={usersCentro} companies={companies} nombreDe={nombreDe} version={claveEmpresas} onAbrir={setModal} />
        ) : tab === 'estadisticas' && isAdmin ? (
          <Estadisticas users={users} companies={companies} centros={centros} miCentro={miCentro} isSuper={isSuper} />
        ) : tab === 'equipo' && isAdmin ? (
          <Equipo users={usersCentro} centro={miCentro} isSuper={isSuper} centros={centros} companies={companies} me={me} baremo={baremo} onChanged={cargar} />
        ) : (
          <>
            {isAdmin && centros.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto mb-4 pb-0.5">
                {[...centros.map((c) => ({ id: c.id, label: c.id, title: c.nombre, n: companies.filter((x) => x.centro === c.id).length })),
                  { id: BOTE, label: 'Bote común', title: 'Empresas sin asignar, compartidas por todos los centros', n: bote.length }].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => isSuper && t.id !== BOTE ? cambiarCentro(t.id) : cambiarVista(t.id === miCentro ? '' : t.id)}
                    title={t.title}
                    className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm border transition-colors ${
                      vistaEf === t.id
                        ? 'bg-[#0e2d4d] text-white border-[#0e2d4d] font-bold'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 font-medium'
                    }`}
                  >
                    {t.id === BOTE && <Inbox className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />}
                    {t.label}{t.id === (me.centro || 'TLMA') && <span className={vistaEf === t.id ? 'text-white/60' : 'text-slate-400'}> (tu centro)</span>}
                    <span className={vistaEf === t.id ? 'text-white/50' : 'text-slate-400'}> · {t.n}</span>
                  </button>
                ))}
              </div>
            )}
            {ajena && (
              <p className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                Estás viendo las empresas de <strong>{centroNombre(vistaEf)}</strong>. Solo lectura: las gestiona su comité.
              </p>
            )}
            {enBote && (
              <p className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                <strong>Bote común:</strong> empresas sin asignar que comparten todos los centros. En cuanto se asigna una a alguien, pasa al centro de esa persona; si se le quita, vuelve aquí.
                {isAdmin && (isSuper ? <> Marca las que quieras y asígnalas a quien quieras.</> : <> Marca las que quieras y asígnalas a gente de {miCentro}.</>)}
              </p>
            )}
            {!agendaVisible ? null : misSinContactar === 0 ? (
              <div className="flex items-start gap-2.5 mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <Inbox className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  <strong>No te queda ninguna empresa sin contactar.</strong>{' '}
                  {isAdmin
                    ? `Asígnate ${LOTE} más desde la pestaña Equipo.`
                    : `Pídele a un admin que te asigne ${LOTE} más.`}
                </p>
              </div>
            ) : misSinContactar <= AVISO_POCAS && (
              <div className="flex items-start gap-2.5 mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                <Inbox className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                <p>Te quedan <strong>{misSinContactar}</strong> empresas sin contactar. Ve pidiendo el siguiente lote.</p>
              </div>
            )}
            <AvisoReunion me={me} centro={miCentro} onVer={() => setTab('reuniones')} />
            {agendaVisible && <MiQuincena me={me} companies={companies} onAbrir={setModal} puntos={baremo.quincena} />}
            {agendaVisible && (nHoy + nAtrasadas + nSinMover) > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {nSinMover > 0 && (
                  <button
                    onClick={() => setAgenda(agenda === 'seguimiento' ? '' : 'seguimiento')}
                    title={`Empresas en seguimiento sin ninguna nota ni cambio de estado en ${SIN_MOVER.dias} días`}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 ${
                      agenda === 'seguimiento' ? 'bg-orange-600 text-white border-orange-600' : 'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />Realizar seguimiento · {nSinMover}
                  </button>
                )}
                {(nHoy + nAtrasadas) > 0 && <button
                  onClick={() => setAgenda(agenda === 'hoy' ? '' : 'hoy')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 ${
                    agenda === 'hoy' ? 'bg-blue-700 text-white border-blue-700' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  <CalendarClock className="w-3.5 h-3.5" />Para hoy · {nHoy + nAtrasadas}
                </button>}
                {nAtrasadas > 0 && (
                  <button
                    onClick={() => setAgenda(agenda === 'atrasadas' ? '' : 'atrasadas')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                      agenda === 'atrasadas' ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    }`}
                  >
                    Atrasadas · {nAtrasadas}
                  </button>
                )}
                {agenda && (
                  <button onClick={() => setAgenda('')} className="px-3 py-1.5 rounded-full text-xs font-medium text-slate-500 hover:bg-slate-100">
                    Ver todas
                  </button>
                )}
              </div>
            )}

            <div className={`flex sm:grid ${isAdmin ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-1.5 overflow-x-auto bg-[#0e2d4d] rounded-xl p-1.5 mb-4 shadow-[0_4px_16px_rgba(13,43,69,0.18)]`}>
              {gruposVisibles.map((g) => {
                const n = companiesVista.filter((c) => enGrupo(g, c, me.id, verTodo)).length
                return (
                  <button
                    key={g.id}
                    onClick={() => { setGrupo(g.id); setFiltroEstado(''); setOrden('') }}
                    className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-full text-sm transition-colors ${
                      grupoEf === g.id ? 'bg-white text-[#0e2d4d] font-bold shadow-sm' : 'text-white/85 font-medium hover:bg-white/[0.08]'
                    }`}
                  >
                    {g.label} <span className={grupoEf === g.id ? 'text-[#0e2d4d]/50' : 'text-white/50'}>· {n}</span>
                  </button>
                )
              })}
            </div>

            {(() => {
              const g = grupoDe(grupoEf)
              // A los miembros no se les ponen filtros de estado en «Todas», para no saturar
              if (!verTodo && g.id === 'todas') return <div className="mb-2" />
              const delGrupo = companiesVista.filter((c) => enGrupo(g, c, me.id, verTodo))
              const chips = ESTADOS.filter((e) => ((g.historicas || !verTodo) ? delGrupo.some((c) => c.estado === e.id) : (!g.estados || g.estados.includes(e.id))))
              if (chips.length < 2) return <div className="mb-2" />
              const total = delGrupo.length
              return (
                <div className="flex flex-wrap gap-2 mb-5">
                  <button
                    onClick={() => setFiltroEstado('')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${!filtroEstado ? 'bg-[#0e2d4d] text-white border-[#0e2d4d]' : 'bg-white text-slate-600 border-slate-200'}`}
                  >
                    Todas · {total}
                  </button>
                  {chips.filter((e) => !e.oculto || delGrupo.some((c) => c.estado === e.id)).map((e) => {
                    const n = delGrupo.filter((c) => c.estado === e.id).length
                    return (
                      <button
                        key={e.id}
                        onClick={() => setFiltroEstado(filtroEstado === e.id ? '' : e.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          filtroEstado === e.id ? `${e.color} ring-2 ring-[#0e2d4d] ring-offset-1` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${e.dot}`} />
                        {e.label} · {n}
                      </button>
                    )
                  })}
                </div>
              )
            })()}

            <div className="flex flex-wrap sm:flex-nowrap gap-2 mb-4">
              <div className="relative flex-1 basis-full sm:basis-auto">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa, CIF, contacto, sector o responsable…" className="pl-9" />
              </div>
              <label className="relative shrink-0" title="Orden de la lista">
                <ArrowUpDown className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select value={ordenEf} onChange={(e) => setOrden(e.target.value)}
                  className="pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
                  <option value="antiguedad">Más tiempo sin contactar primero</option>
                  <option value="nombre">Por nombre (A-Z)</option>
                </select>
              </label>
              {isAdmin && (
                <>
                  {!enBote && <select
                    value={filtroPersona}
                    onChange={(e) => { setFiltroPersona(e.target.value); setSelec([]) }}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="">Todo el equipo</option>
                    <option value="__sin">Sin asignar ({companiesVista.filter((c) => !c.responsable).length})</option>
                    {usersVista.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>}
                  <button
                    onClick={() => exportarEmpresas(visibles, nombreDe)}
                    title="Exportar a Excel"
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-4 h-4" /><span className="hidden lg:inline">Exportar</span>
                  </button>
                </>
              )}
              {!ajena && <Btn onClick={() => setModal('nueva')}><Plus className="w-4 h-4" /><span className="hidden sm:inline">Empresa</span></Btn>}
            </div>

            {visibles.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] p-12 text-center text-slate-400 text-sm">
                {companiesVista.length === 0
                  ? (ajena || enBote) ? 'No hay empresas en esta pestaña.'
                  : isAdmin
                    ? 'Todavía no hay empresas. Añade la primera con el botón «Empresa».'
                    : 'No tienes empresas asignadas todavía. Puedes añadir una con el botón «Empresa».'
                  : 'Ninguna empresa coincide con el filtro.'}
              </div>
            ) : (
              <>
              {modoAsignar && (
                <div className="sticky top-16 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-[#0e2d4d] text-white px-4 py-3 shadow-[0_4px_16px_rgba(13,43,69,0.25)]">
                  <span className="text-sm font-semibold">{selec.length} seleccionada{selec.length !== 1 ? 's' : ''}</span>
                  <button onClick={() => setSelec(visibles.slice(0, LOTE).map((c) => c.id))}
                    className="px-2.5 py-1 rounded-full text-xs bg-white/10 hover:bg-white/20">Marcar {LOTE} primeras</button>
                  {selec.length > 0 && (
                    <button onClick={() => setSelec([])} className="px-2.5 py-1 rounded-full text-xs bg-white/10 hover:bg-white/20">Quitar marcas</button>
                  )}
                  <span className="flex-1" />
                  <select value={asignarA} onChange={(e) => setAsignarA(e.target.value)}
                    className="px-3 py-1.5 rounded-full text-sm text-slate-900 bg-white">
                    <option value="">Asignar a…</option>
                    <OpcionesPersonas users={asignables} />
                  </select>
                  <button onClick={asignarSeleccion} disabled={!selec.length || !asignarA || asignando}
                    className="px-4 py-1.5 rounded-full text-sm font-bold bg-white text-[#0e2d4d] disabled:opacity-40">
                    {asignando ? 'Asignando…' : 'Asignar'}
                  </button>
                </div>
              )}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(13,43,69,0.04),0_4px_16px_rgba(13,43,69,0.06)] overflow-hidden divide-y divide-slate-100">
                {visibles.map((c) => (
                  <div key={c.id} className={`flex items-stretch ${selec.includes(c.id) ? 'bg-blue-50/70' : ''}`}>
                  {modoAsignar && (
                    <label className="flex items-center pl-4 pr-1 cursor-pointer">
                      <input type="checkbox" checked={selec.includes(c.id)} onChange={() => marcar(c.id)}
                        className="w-4 h-4 accent-[#0e2d4d]" />
                    </label>
                  )}
                  <button
                    onClick={() => setModal(c)}
                    className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${
                      c.historica ? 'bg-amber-50/70 hover:bg-amber-50 border-l-4 border-l-amber-500 pl-4' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate flex items-center gap-2">
                        <span className="truncate">{c.nombre}</span>
                        {c.historica && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-semibold"
                            title={`Nos dio prácticas en ${textoPracticas(c.practicas)}`}>
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />Histórica{c.practicas?.length ? ` · ${aniosPracticas(c.practicas)}` : ''}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {ultimos && c.estado !== 'sin_contactar' && (
                          <span title={ultimoDe(c) ? `Último contacto: ${fecha(ultimoDe(c))}` : 'Nadie ha registrado todavía una nota ni un cambio de estado'}
                            className={`font-medium ${ordenEf === 'antiguedad' ? 'text-[#0e2d4d]' : ''}`}>
                            <Clock className="w-3 h-3 inline -mt-0.5 mr-0.5" />{haceCuanto(ultimoDe(c))}
                            {(c.cif || c.sector || c.contacto) ? ' · ' : ''}
                          </span>
                        )}
                        {[c.cif, c.sector, c.contacto].filter(Boolean).join(' · ') || (ultimos && c.estado !== 'sin_contactar' ? '' : '—')}
                      </p>
                    </div>
                    <span className={`hidden md:flex items-center gap-1.5 text-xs shrink-0 ${c.responsable === me.id ? 'text-[#0e2d4d] font-semibold' : 'text-slate-500'}`}>
                      <User className="w-3.5 h-3.5" />{c.responsable === me.id ? 'Tú' : nombreDe(c.responsable)}
                    </span>
                    {sinMover(c) && (
                      <span title={`Sin notas ni cambios de estado en ${SIN_MOVER.dias} días o más`}
                        className="inline-flex items-center gap-1 text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-300">
                        <AlertTriangle className="w-3.5 h-3.5" /><span className="hidden sm:inline">Realizar seguimiento</span>
                      </span>
                    )}
                    {c.proximo_contacto && (
                      <span className={`hidden sm:inline-flex items-center gap-1 text-xs font-medium shrink-0 px-2 py-0.5 rounded-full border ${
                        c.proximo_contacto < hoy
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : c.proximo_contacto === hoy
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        <CalendarClock className="w-3 h-3" />{fechaCorta(c.proximo_contacto)}
                      </span>
                    )}
                    <Badge estadoId={c.estado} />
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                  </div>
                ))}
              </div>
              </>
            )}
          </>
        )}
      </main>

      {modal && (
        <EmpresaModal
          empresa={modal === 'nueva' ? null : modal}
          users={users}
          asignables={asignables}
          centros={centros}
          isAdmin={modal === 'nueva' ? isAdmin : puedeEditar(modal)}
          me={me}
          todas={companies}
          onSaved={(m) => { setModal(null); cargar(); flash(m || 'Guardado ✓', m ? 6000 : 2500) }}
          onDeleted={() => { setModal(null); cargar(); flash('Empresa eliminada') }}
          onClose={() => setModal(null)}
        />
      )}

      {mejorasAbierto && <Mejoras me={me} inicial={mejorasAbierto} onClose={() => setMejorasAbierto(false)} />}

      {cambiarPass && <CambiarContrasena recuperacion={cambiarPass === 'recuperacion'} onClose={() => setCambiarPass('')} />}

      {aviso && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#0d2b45] text-white text-sm px-4 py-2 rounded-full shadow-lg z-50">
          {aviso}
        </div>
      )}
    </div>
  )
}

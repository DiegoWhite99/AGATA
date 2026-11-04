export type Decision = "aprobado" | "rechazado" | null;

/** El puntaje leído en dos partes: hoja de vida + IA, y las cartas. */
export interface Lecturas {
  profesional: number | null;
  astral: number | null;
}

/** Uno de los dos componentes más fuertes del postulante. */
export interface Destaca {
  clave: keyof Componentes;
  nombre: string;
  puntaje: number;
}

export interface Ciudad {
  nombre: string;
  lat: number;
  lon: number;
  utc: number;
}

export interface Posicion {
  astro: string;
  glifo: string;
  longitud: number;
  grado: number;
  signo: string;
  simbolo: string;
  elemento: string;
  modalidad: string;
  indice: number;
}

/** Lo que dicta la carta para un astro. */
export interface Atributo {
  clave: string;
  astro: string;
  glifo: string;
  signo: string;
  simbolo: string;
  elemento: string;
  tema: string;
  texto: string;
}

export type ModoConflicto = "Competir" | "Colaborar" | "Negociar" | "Evitar" | "Complacer";

export interface PerfilConflicto {
  modos: Record<ModoConflicto, number>;
  dominante: ModoConflicto;
  secundario: ModoConflicto;
  ante_conflicto: string;
  detonante: string;
  necesita: string;
  resumen: string;
}

export interface AspectoConflicto {
  glifo_a: string;
  glifo_b: string;
  glifo: string;
  aspecto: string;
  astro_a: string;
  astro_b: string;
  lectura: string;
}

export interface DinamicaConflicto {
  puntaje: number;
  estilos: number;
  aspectos: number;
  riesgo: string;
  fricciones: AspectoConflicto[];
  puentes: AspectoConflicto[];
  consejo_para_a: string;
  consejo_para_b: string;
}

/** Rol de la persona en un equipo, según su elemento y su modalidad dominantes. */
export interface Arquetipo {
  nombre: string;
  rol: string;
  elemento: string;
  modalidad: string;
}

export interface Carta {
  arquetipo?: Arquetipo;
  posiciones: Record<string, Posicion>;
  elementos: Record<string, number>;
  modalidades: Record<string, number>;
  elemento_dominante: string;
  hora_conocida: boolean;
  perfil_laboral: string;
  resumen: string;
  atributos: Atributo[];
  conflicto: PerfilConflicto;
}

export interface DatosNatales {
  fecha_nac: string | null;
  hora_nac: string | null;
  ciudad: string | null;
  lat: number | null;
  lon: number | null;
  utc: number | null;
}

export interface Empresa extends DatosNatales {
  nombre: string;
  sector: string;
  mision: string;
  valores: string;
  cultura: string;
  carta: Carta | null;
  actualizado: string;
}

export interface Lider extends DatosNatales {
  id: number;
  nombre: string;
  cargo: string;
  area: string;
  email: string;
  descripcion: string;
  estilo_liderazgo: string;
  expectativas: string;
  equipo: string;
  carta: Carta | null;
  cv_archivo: string | null;
  vacantes?: number;
  /** Cadena de mando: el líder del que depende. */
  jefe_id: number | null;
  jefe_nombre?: string | null;
  /** Quienes ya entraron a su equipo: aprobados por el líder y por la dirección. */
  integrantes?: { id: number; nombre: string; cargo: string }[];
}

export type Rol = "admin" | "lider";

/** Quién puede entrar a AGATA (con su cuenta Google) y qué ve. */
export interface Usuario {
  id: number;
  email: string;
  nombre: string | null;
  rol: Rol;
  /** Ficha de líder ligada: define la cadena de mando que ve. */
  lider_id: number | null;
  lider_nombre: string | null;
  lider_cargo: string | null;
  ultimo_ingreso: string | null;
  creado: string;
  /** Administrador por configuración (AGATA_ADMINS): no se puede quitar desde aquí. */
  fijo: boolean;
  yo: boolean;
}

export interface JefeSugerido {
  perfil: string;
  superior: string;
  jefe_id: number | null;
  jefe_nombre: string | null;
  motivo: string;
}

/** Lo que dibuja la sección Red. */
/** Qué es un líder para otro en la cadena de mando. */
export type RelacionLider = "jefe" | "equipo" | "par" | "cadena" | "otra";

/** Afinidad de un líder con otro: la misma lectura astral que con un postulante, solo informativa. */
export interface AfinidadLider {
  id: number;
  nombre: string;
  cargo: string;
  area: string;
  relacion: RelacionLider;
  arquetipo: Arquetipo | null;
  /** null si alguno de los dos no tiene carta. */
  sinastria: (Pick<Sinastria, "puntaje" | "armonicos" | "tensos" | "elemental"> & { aspectos: AspectoSinastria[] }) | null;
  conflicto: DinamicaConflicto | null;
}

export interface AfinidadesLider {
  lider: { id: number; nombre: string; cargo: string; tiene_carta: boolean };
  afinidades: AfinidadLider[];
}

export interface DatosRed {
  empresa: { nombre: string; arquetipo: Arquetipo | null } | null;
  lideres: { id: number; nombre: string; cargo: string; area: string; jefe_id: number | null; arquetipo: Arquetipo | null;
             tiene_carta: boolean; sinastria_jefe: number | null; sinastria_empresa: number | null }[];
  /** Sinastría de cada pareja de líderes (null si a alguno le falta la carta); `relacion` es lo que b es para a. */
  afinidades: { a: number; b: number; sinastria: number | null; relacion: RelacionLider }[];
  vacantes: { id: number; cargo: string; area: string; lider_id: number; estado: string; tecnico: number }[];
  candidatos: { id: number; nombre: string; vacante_id: number; puntaje: number; decision_lider: Decision;
                decision_direccion: Decision; sinastria_lider: number | null; potencial: number | null;
                arquetipo: Arquetipo | null }[];
}

export type TipoHabilidad = "tecnica" | "blanda";

export interface Habilidad {
  id?: number;
  nombre: string;
  peso: number;
  nivel: number;
  palabras_clave: string;
  /** Las blandas no se buscan por palabras clave: las lee o las deduce de los proyectos la IA. */
  tipo: TipoHabilidad;
}

export type TipoEvidencia = "directa" | "deducida" | "sin evidencia";

/** Lo único que puede ser innegociable en un cargo. */
export type TipoExcluyente = "titulo" | "experiencia" | "proyectos";

export interface Excluyente {
  tipo: TipoExcluyente;
  texto: string;
}

export interface RequisitoVerificado extends Excluyente {
  cumple: "si" | "no" | "dudoso" | "sin verificar";
  evidencia: string;
}

/** Aviso para el líder; no descarta a nadie. */
export interface Alerta {
  clave: "requisitos" | "validar" | "afinidad" | "sinergia";
  texto: string;
}

/** Otra vacante abierta (de la misma familia) donde el perfil profesional encaja mejor; comparado sin IA. */
export interface Redireccion {
  vacante_id: number;
  cargo: string;
  area: string;
  /** Perfil profesional allá y aquí (hoja de vida, habilidades y trabajo en línea). */
  perfil: number;
  perfil_aqui: number;
}

/** Capacidad de crecer y aprender según la IA (no entra en el puntaje). */
export interface Potencial {
  puntaje: number;
  lectura: string;
  senales: string[];
}

export interface Pesos {
  peso_lider: number;
  peso_empresa: number;
  peso_elemento: number;
  peso_conflicto: number;
  peso_cv: number;
  peso_ia: number;
}

export interface VacanteResumen extends Pesos {
  id: number;
  perfil_id: string | null;
  perfil_archivo: string | null;
  perfil_titulo?: string | null;
  cargo: string;
  area: string;
  descripcion: string;
  estado: "abierta" | "cerrada";
  lider_id: number;
  lider_nombre: string;
  lider_cargo: string;
  elemento_afin: string | null;
  /** 1 si el cargo es técnico: pide GitHub, LinkedIn y repositorio además del portafolio. */
  tecnico: number;
  excluyentes: Excluyente[] | null;
  candidatos: number;
  n_pendientes: number | null;
  n_aprobados: number | null;
  n_rechazados: number | null;
  n_habilidades: number;
  creado: string;
}

export interface Componentes {
  lider: number | null;
  empresa: number | null;
  elemento: number | null;
  conflicto: number | null;
  cv: number | null;
  ia: number | null;
}

export interface CandidatoFila {
  id: number;
  nombre: string;
  email: string;
  puntaje: number;
  decision_lider: Decision;
  /** Aprobación final de la dirección: con ella, la persona entra al equipo del líder. */
  decision_direccion: Decision;
  creado: string;
  signo_sol: string | null;
  lecturas: Lecturas | null;
  destaca: Destaca[] | null;
  potencial: number | null;
  alertas: Alerta[] | null;
  cumple_requisitos: boolean | null;
  arquetipo: Arquetipo | null;
  redireccion: Redireccion | null;
}

export interface Vacante
  extends Omit<VacanteResumen, "candidatos" | "n_pendientes" | "n_aprobados" | "n_rechazados" | "n_habilidades"> {
  habilidades: Habilidad[];
  lider: Lider;
  empresa: { nombre: string; carta: Carta | null } | null;
  candidatos: CandidatoFila[];
  perfil: Perfil | null;
  /** false si el líder asignado no es el superior inmediato que indica el perfil. */
  perfil_lider_coincide?: boolean;
}

/** Perfil de cargo de la carpeta perfiles/ (formato institucional «Descripción del rol»). */
export interface Perfil {
  id: string;
  titulo: string;
  /** División normalizada para agrupar (las variantes de escritura van juntas). */
  grupo: string;
  archivo: string;
  archivos: string[];
  versiones: number;
  formato: "institucional" | "libre";
  completo: boolean;
  error?: string;
  cargo?: string;
  vicerrectoria?: string;
  division?: string;
  nivel?: string;
  superior?: string;
  superior_funcional?: string;
  pares?: string;
  a_cargo?: string;
  mision?: string;
  responsabilidades: string[];
  decisiones?: { tomar: string[]; proponer: string[] };
  relaciones?: Record<"internas" | "externas", { contacto: string; proposito: string; frecuencia: string }[]>;
  dimension?: { descripcion: string; valor: string; funcionarios: string; roles: string; alcance: string }[];
  formacion?: string;
  experiencia?: string;
  conocimientos?: string;
  competencias_lista: { tecnicas: string[]; blandas: string[] };
  conocimientos_lista: string[];
  cambios?: { fecha: string; version: string; descripcion: string }[];
  /** Perfiles de otros cargos con el mismo texto en alguna sección (copiado de uno a otro). */
  compartido?: { id: string; titulo: string; campos: string[] }[];
  vacantes?: { id: number; cargo: string; estado: string }[];
}

export interface PropuestaPerfil {
  campos: {
    cargo: string;
    area: string;
    descripcion: string;
    elemento_afin: string | null;
    lider_id: number | null;
    habilidades: Habilidad[];
    tecnico: boolean;
  };
  lider_motivo: string;
  avisos: string[];
}

export interface PerfilDetalle {
  perfil: Perfil;
  propuesta: PropuestaPerfil;
  vacantes: { id: number; cargo: string; estado: string }[];
  nuevo?: boolean;
}

export interface VacantePublica {
  id: number;
  cargo: string;
  area: string;
  estado: string;
  descripcion: string;
  lider_nombre: string;
  lider_cargo: string;
  empresa: string | null;
  habilidades: { nombre: string; nivel: number }[];
  requisitos: { formacion?: string; experiencia?: string; conocimientos?: string } | null;
  tecnico: boolean;
  excluyentes: Excluyente[];
}

export type CampoEnlace = "github" | "linkedin" | "portafolio" | "repositorio";

/** Un enlace del postulante y lo que se pudo leer de él. */
export interface EnlaceBase {
  url: string;
  /** "github": el repositorio destacado lo eligió AGATA entre los de su GitHub. */
  origen: "formulario" | "hoja de vida" | "github";
  leido: boolean;
  error?: string;
  nota?: string;
}

export interface RepoGithub {
  nombre: string;
  descripcion: string;
  lenguaje: string | null;
  estrellas: number;
  temas: string[];
  actualizado: string;
  url: string;
}

export interface EnlaceGithub extends EnlaceBase {
  usuario?: string;
  bio?: string | null;
  repos_publicos?: number;
  seguidores?: number;
  desde?: string;
  lenguajes?: string[];
  forks?: number;
  repos?: RepoGithub[];
}

export interface EnlacePagina extends EnlaceBase {
  titulo?: string;
  descripcion?: string;
  texto?: string;
  /** La página se arma con JavaScript y casi no trae texto legible. */
  poco_texto?: boolean;
}

export interface EnlaceRepositorio extends EnlacePagina {
  tipo?: "github" | "pagina";
  nombre?: string;
  estrellas?: number;
  temas?: string[];
  actualizado?: string;
  lenguajes?: { nombre: string; pct: number }[];
  readme?: string;
}

export interface Enlaces {
  github?: EnlaceGithub;
  linkedin?: EnlaceBase;
  portafolio?: EnlacePagina;
  repositorio?: EnlaceRepositorio;
  revisado: string;
}

export interface DictamenIA {
  modelo: string;
  habilidades: { nombre: string; puntaje: number; evidencia: string; tipo_evidencia?: TipoEvidencia | null; fuente?: string }[];
  potencial?: Potencial | null;
  ajuste_lider: number;
  ajuste_explicacion: string;
  resumen: string;
  fortalezas: string[];
  riesgos: string[];
  preguntas_entrevista: string[];
  lectura_sinastria_lider?: string;
  lectura_sinastria_empresa?: string;
  manejo_conflictos?: string;
  evidencia_en_linea?: string;
  lectura_astral?: string;
  recomendacion: string;
}

export type ResultadoIA = DictamenIA | { error: string } | null;

export interface EstadoIA {
  activa: boolean;
  modelo: string;
}

export interface HabilidadEvaluada {
  nombre: string;
  peso: number;
  nivel: number;
  tipo: TipoHabilidad;
  requerido: number;
  /** null: habilidad blanda sin lectura de la IA (no se puede medir por palabras clave). */
  cv: number | null;
  cv_claves: number;
  cv_ia: number | null;
  evidencia_ia: string | null;
  evidencia_tipo: TipoEvidencia | null;
  fuente: string | null;
  cobertura: number | null;
  estado: "cumple" | "parcial" | "brecha" | "sin_lectura";
  claves_encontradas: string[];
}

export interface AspectoSinastria {
  a: string;
  b: string;
  astro_a: string;
  astro_b: string;
  glifo_a: string;
  glifo_b: string;
  signo_a: string;
  signo_b: string;
  aspecto: string;
  glifo: string;
  orbe: number;
  armonico: boolean;
  lectura: string;
}

export interface Sinastria {
  puntaje: number;
  aspectos_pct: number;
  elemental: number;
  armonicos: number;
  tensos: number;
  por_astro: Record<string, number>;
  aspectos: AspectoSinastria[];
  rejilla: Record<string, Record<string, { glifo: string; aspecto: string; armonico: boolean; orbe: number }>>;
}

export interface Resultado {
  puntaje: number;
  lecturas: Lecturas;
  potencial: Potencial | null;
  requisitos: RequisitoVerificado[];
  cumple_requisitos: boolean | null;
  alertas: Alerta[];
  destaca: Destaca[];
  componentes: Componentes;
  pesos: Record<keyof Componentes, number>;
  sinastria: { lider: Sinastria | null; empresa: Sinastria | null };
  elemento: { afin: string | null; puntaje: number | null };
  conflicto: { lider: DinamicaConflicto | null; empresa: DinamicaConflicto | null };
  ia: ResultadoIA;
  habilidades: HabilidadEvaluada[];
  fortalezas: string[];
  brechas: string[];
  experiencia_anios: number | null;
  nivel_educativo: string | null;
  cv_palabras: number;
  recomendacion: string;
}

export interface Candidato extends DatosNatales {
  id: number;
  vacante_id: number;
  nombre: string;
  email: string;
  telefono: string;
  cv_archivo: string;
  carta: Carta;
  resultado: Resultado;
  puntaje: number;
  decision_lider: Decision;
  nota_lider: string | null;
  decision_direccion: Decision;
  nota_direccion: string | null;
  /** Quién dio la decisión final y cuándo. */
  direccion_por: string | null;
  fecha_direccion: string | null;
  enlaces: Enlaces | null;
  creado: string;
}

/** El cargo de dirección que encabeza la cadena de mando del líder: da la aprobación final. */
export interface Direccion {
  id: number;
  nombre: string;
  cargo: string;
}

/** Una fila del listado general de postulantes. */
export interface CandidatoGeneral {
  id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  ciudad: string | null;
  puntaje: number;
  decision_lider: Decision;
  decision_direccion: Decision;
  creado: string;
  lecturas: Lecturas | null;
  cumple_requisitos: boolean | null;
  arquetipo: Arquetipo | null;
  vacante_id: number;
  cargo: string;
  area: string;
  vacante_estado: string;
  lider_id: number;
  lider_nombre: string;
  lider_cargo: string;
}

/** Un archivo de perfil en la papelera. */
export interface PerfilEliminado {
  archivo: string;
  titulo: string;
  id: string;
  /** Cuándo se eliminó (segundos desde 1970). */
  eliminado: number;
  tamano: number;
}

export interface Informe {
  candidato: Candidato;
  vacante: VacanteResumen;
  lider: Pick<Lider, "id" | "nombre" | "cargo" | "area" | "carta" | "cv_archivo">;
  empresa: Empresa | null;
  /** Puesto del postulante en el ranking de su vacante. */
  ranking: { posicion: number; total: number };
  redireccion: Redireccion | null;
  /** null si la cadena de mando del líder no tiene un cargo de dirección. */
  direccion: Direccion | null;
  /** ¿Quien mira es esa dirección? Solo ella da la aprobación final. */
  soy_direccion: boolean;
  ia: EstadoIA;
}

export interface Panel {
  vacantes_abiertas: number;
  lideres: number;
  candidatos: number;
  pendientes: number;
  aprobados: number;
  rechazados: number;
  esperan_direccion: number;
  en_equipo: number;
  /** Los que esperan la aprobación final de quien mira. */
  por_aprobar: { id: number; nombre: string; puntaje: number; cargo: string; vacante_id: number; lider_nombre: string;
                 nota_lider: string | null }[];
  recientes: (CandidatoFila & { cargo: string; vacante_id: number })[];
  vacantes: VacanteResumen[];
  empresa: Empresa | null;
  ia: EstadoIA;
}

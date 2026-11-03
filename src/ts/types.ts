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

export interface Carta {
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
}

export interface Habilidad {
  id?: number;
  nombre: string;
  peso: number;
  nivel: number;
  palabras_clave: string;
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
  creado: string;
  signo_sol: string | null;
  lecturas: Lecturas | null;
  destaca: Destaca[] | null;
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
}

export interface DictamenIA {
  modelo: string;
  habilidades: { nombre: string; puntaje: number; evidencia: string }[];
  ajuste_lider: number;
  ajuste_explicacion: string;
  resumen: string;
  fortalezas: string[];
  riesgos: string[];
  preguntas_entrevista: string[];
  lectura_sinastria_lider?: string;
  lectura_sinastria_empresa?: string;
  manejo_conflictos?: string;
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
  requerido: number;
  cv: number;
  cv_claves: number;
  cv_ia: number | null;
  evidencia_ia: string | null;
  cobertura: number;
  estado: "cumple" | "parcial" | "brecha";
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
  creado: string;
}

export interface Informe {
  candidato: Candidato;
  vacante: VacanteResumen;
  lider: Pick<Lider, "id" | "nombre" | "cargo" | "area" | "carta" | "cv_archivo">;
  empresa: Empresa | null;
  /** Puesto del postulante en el ranking de su vacante. */
  ranking: { posicion: number; total: number };
  ia: EstadoIA;
}

export interface Panel {
  vacantes_abiertas: number;
  lideres: number;
  candidatos: number;
  pendientes: number;
  aprobados: number;
  rechazados: number;
  recientes: (CandidatoFila & { cargo: string; vacante_id: number })[];
  vacantes: VacanteResumen[];
  empresa: Empresa | null;
  ia: EstadoIA;
}

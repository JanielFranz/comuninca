import type { CategoryKey, CategoryMeta, User, CalendarEvent } from "./types";

export const CATEGORY_META: Record<CategoryKey, CategoryMeta> = {
  social: { label: "Social", color: "#E8AC3E" },
  music: { label: "Música", color: "#E0708A" },
  workshop: { label: "Taller", color: "#6E9CC4" },
  sports: { label: "Deportes", color: "#7FB07A" },
  food: { label: "Comida y Mercado", color: "#D98B4A" },
  networking: { label: "Networking", color: "#A480B8" },
};

export const CATEGORY_ORDER: CategoryKey[] = [
  "social",
  "music",
  "workshop",
  "sports",
  "food",
  "networking",
];

export const USERS: User[] = [
  { id: "u1", name: "Ava Reyes", initials: "AR" },
  { id: "u2", name: "Marco Tanaka", initials: "MT" },
  { id: "u3", name: "Priya Kapoor", initials: "PK" },
  { id: "u4", name: "Jonas Berg", initials: "JB" },
];

export function findUser(id: string): User | undefined {
  return USERS.find((u) => u.id === id);
}

// Fixed reference date so the seed data lines up exactly like the original
// demo (today = 17 de julio de 2026).
export const TODAY = new Date(2026, 6, 17);

export const MOBILE_BREAKPOINT = 720;
export const TINY_BREAKPOINT = 420;
export const WEEK_START_HOUR = 6;
export const WEEK_END_HOUR = 24;
export const HOUR_PX = 56;
// Simulated "current time" used to draw the now-line in week view (2:30 p.m.).
export const DEMO_NOW_MIN = 14 * 60 + 30;

// Equivalent to the original component's configurable props. Adjust here if
// you want the app to default to week view, a Monday week start, etc.
export const CONFIG = {
  defaultView: "month" as "month" | "week",
  weekStart: "sunday" as "sunday" | "monday",
  showEventPreviews: true,
};

export const WEEKDAY_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

export const SEED_EVENTS: CalendarEvent[] = [
  {
    id: "ev1",
    title: "Feria de Productores",
    category: "food",
    date: "2026-07-17",
    startTime: "09:00",
    endTime: "13:00",
    location: "Plaza Ribereña",
    description:
      "Productos locales, repostería casera y música acústica en vivo junto al río.",
    hostId: "u2",
    attendeeIds: ["u1", "u3"],
  },
  {
    id: "ev2",
    title: "Social en la Azotea al Atardecer",
    category: "social",
    date: "2026-07-17",
    startTime: "18:30",
    endTime: "21:00",
    location: "Terraza 8, Av. Principal",
    description:
      "Encuentro informal entre vecinos: trae algo para compartir y disfrutemos juntos el atardecer.",
    hostId: "u1",
    attendeeIds: ["u2", "u4"],
  },
  {
    id: "ev3",
    title: "Fútbol 5 Amistoso",
    category: "sports",
    date: "2026-07-18",
    startTime: "16:00",
    endTime: "17:30",
    location: "Cancha Greenway 2",
    description: "Pichanga semanal, todos los niveles de juego son bienvenidos.",
    hostId: "u4",
    attendeeIds: ["u1"],
  },
  {
    id: "ev4",
    title: "Café de Fundadores",
    category: "networking",
    date: "2026-07-14",
    startTime: "09:00",
    endTime: "10:00",
    location: "Café Blackbird",
    description: "Charla informal entre fundadores y freelancers de la zona.",
    hostId: "u3",
    attendeeIds: ["u2"],
  },
  {
    id: "ev5",
    title: "Yoga en el Parque",
    category: "sports",
    date: "2026-07-08",
    startTime: "07:00",
    endTime: "08:00",
    location: "Parque Elm Street",
    description:
      "Clase de vinyasa para todos los niveles, ideal para empezar el día. Esterillas incluidas.",
    hostId: "u1",
    attendeeIds: ["u3", "u4"],
  },
  {
    id: "ev6",
    title: "Noche de Jam con Guitarra",
    category: "music",
    date: "2026-07-08",
    startTime: "19:00",
    endTime: "21:00",
    location: "The Lower Deck",
    description:
      "Trae tu instrumento o solo ven a escuchar. Todos los géneros son bienvenidos.",
    hostId: "u2",
    attendeeIds: ["u1"],
  },
  {
    id: "ev7",
    title: "Taller de Acuarela",
    category: "workshop",
    date: "2026-07-11",
    startTime: "10:00",
    endTime: "12:30",
    location: "Estudio de Arte Comunitario",
    description: "Sesión de pintura para principiantes, materiales incluidos.",
    hostId: "u3",
    attendeeIds: ["u4"],
  },
  {
    id: "ev8",
    title: "Sesión de Jazz en Vivo",
    category: "music",
    date: "2026-07-21",
    startTime: "20:00",
    endTime: "22:30",
    location: "Blue Note Lounge",
    description:
      "Trío local interpreta clásicos del jazz. Asientos por orden de llegada.",
    hostId: "u4",
    attendeeIds: ["u2", "u3"],
  },
  {
    id: "ev9",
    title: "Noche de Networking para Startups",
    category: "networking",
    date: "2026-07-24",
    startTime: "18:00",
    endTime: "20:00",
    location: "The Hub Coworking",
    description: "Presentaciones rápidas seguidas de networking libre y bebidas.",
    hostId: "u2",
    attendeeIds: ["u1", "u3", "u4"],
  },
  {
    id: "ev10",
    title: "Clase de Prueba de Cerámica",
    category: "workshop",
    date: "2026-07-24",
    startTime: "11:00",
    endTime: "13:00",
    location: "Estudio Clay & Co",
    description: "Prueba el torno por primera vez, no se necesita experiencia previa.",
    hostId: "u1",
    attendeeIds: ["u2"],
  },
  {
    id: "ev11",
    title: "Día de Limpieza Comunitaria",
    category: "social",
    date: "2026-07-28",
    startTime: "09:00",
    endTime: "11:00",
    location: "Punto de encuentro: Parque Elm Street",
    description: "Guantes y bolsas incluidos. Ayúdanos a mantener limpio el barrio.",
    hostId: "u3",
    attendeeIds: ["u1", "u2", "u4"],
  },
  {
    id: "ev12",
    title: "Fiesta de Verano en la Cuadra",
    category: "social",
    date: "2026-07-31",
    startTime: "17:00",
    endTime: "23:00",
    location: "Avenida Maple",
    description:
      "Se cierra la calle por la noche: food trucks, DJ y juegos para todas las edades.",
    hostId: "u4",
    attendeeIds: ["u1", "u2", "u3"],
  },
];

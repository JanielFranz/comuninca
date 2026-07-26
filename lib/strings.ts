/**
 * All user-facing copy lives here so the app's language can be reviewed
 * (or swapped) in one place instead of hunting through components.
 */
export const STRINGS = {
  meta: {
    title: "Comuninca",
    description: "Encuentra y organiza eventos en tu comunidad.",
  },
  login: {
    title: "Iniciar Sesión",
    welcome: "Bienvenido de nuevo",
    subtitle: "Inicia sesión para ver qué está pasando a tu alrededor.",
    emailLabel: "Correo electrónico",
    emailPlaceholder: "tu@ejemplo.com",
    passwordLabel: "Contraseña",
    passwordPlaceholder: "••••••••",
    missingFieldsError: "Ingresa tu correo y tu contraseña para continuar.",
    signingIn: "Iniciando sesión…",
    submit: "Ingresar",
    invalidCredentials: "Correo o contraseña incorrectos.",
    registerLink: "¿No tienes cuenta? Regístrate",
    demoTip: "Consejo de la demo: cualquier correo y contraseña funcionan.",
  },
  header: {
    previous: "Anterior",
    today: "Hoy",
    next: "Siguiente",
    month: "Mes",
    week: "Semana",
    addEvent: "Agregar evento",
  },
  monthView: {
    more: (count: number) => `+${count} más`,
  },
  addEventModal: {
    title: "Agregar evento",
    close: "Cerrar",
    titleLabel: "TÍTULO",
    titlePlaceholder: "¿Qué está pasando?",
    categoryLabel: "CATEGORÍA",
    dateLabel: "FECHA",
    startLabel: "INICIO",
    endLabel: "FIN",
    locationLabel: "UBICACIÓN",
    locationPlaceholder: "¿Dónde va a ser?",
    descriptionLabel: "DESCRIPCIÓN",
    descriptionPlaceholder: "Agrega algunos detalles…",
    attendeesLabel: "INVITAR ASISTENTES",
    validationError:
      "El título, la fecha y la hora de inicio son obligatorios.",
    cancel: "Cancelar",
    submit: "Agregar evento",
    toastSuccess: "Evento agregado al calendario",
  },
  dayModal: {
    close: "Cerrar",
    addOnThisDay: "+ Agregar evento este día",
  },
  eventDetailModal: {
    close: "Cerrar",
    hostedBy: "ORGANIZADO POR",
    going: (count: number) => `ASISTEN (${count})`,
    joinEvent: "Unirme al evento",
    youAreGoing: "Ya vas ✓",
    noAttendeesYet: "Nadie aún — sé el primero en unirte.",
    locationTBA: "Ubicación por confirmar",
    noDescription: "Aún no hay descripción.",
  },
  profileMenu: {
    logout: "Cerrar sesión",
  },
} as const

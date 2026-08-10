// Datos "de catálogo" del venue -- compartidos entre todos los
// proyectos de la organización, igual que el buscador de lugares de
// PortalTickets: nombre + dirección. Nada de negocio va aquí.
export interface Venue {
  id: string;
  name: string;
  address: string;
  comuna: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
}

// Datos privados del venue PARA UN PROYECTO en particular. Dos
// proyectos pueden usar el mismo venue (mismo `venueId`) y tener cada
// uno su propia capacidad, contacto, mood, etc. -- sin que uno vea lo
// del otro.
export interface VenueProjectDetails {
  id: string;
  venueId: string;
  projectId: string;
  capacityStanding: number | null;
  capacitySeated: number | null;
  mood: string | null;
  description: string | null;
  parkingAvailable: boolean | null;
  backlineAvailable: boolean | null;
  website: string | null;
  instagram: string | null;
  contactId: string | null;
  companyId: string | null;
  contactName: string | null;
  companyName: string | null;
  createdAt: string;
  updatedAt: string;
}

// Forma combinada que devuelve la API cuando se pide con `projectId`:
// el venue del catálogo + (si existen) los detalles del proyecto activo.
// `details` viene `null` cuando el proyecto activo nunca ha usado este
// venue -- útil para el combobox de "nuevo evento", que muestra el
// catálogo completo pero necesita saber si hay que pedir los datos
// privados por primera vez.
export interface VenueWithDetails extends Venue {
  details: VenueProjectDetails | null;
}

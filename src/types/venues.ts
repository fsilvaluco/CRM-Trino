export interface Venue {
  id: string;
  name: string;
  address: string;
  comuna: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
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

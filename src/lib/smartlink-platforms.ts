import {
  siSpotify,
  siApplemusic,
  siYoutubemusic,
  siYoutube,
  siDeezer,
  siTidal,
  siSoundcloud,
  siItunes,
  siBandcamp,
  siInstagram,
  siTiktok,
} from "simple-icons";

export interface PlatformDef {
  key: string;
  label: string;
  /** null = plataforma "Otra"/"Merch", usa el label que escribe la persona
   * (o el label fijo del catalogo si no escriben nada -- ver getPlatformDef) */
  icon: { path: string; hex: string } | null;
}

// Catalogo curado (no exhaustivo a proposito) -- cubre las plataformas que
// realmente importan para la mayoria de lanzamientos, mas Instagram/TikTok/
// Merch para el smartlink de "Ventas" (dossier + redes + tienda en un solo
// link para cerrar tratos). Cualquier otra cosa (Beatport, un link de
// prensa, etc.) entra como "other" con nombre libre.
export const SMARTLINK_PLATFORMS: PlatformDef[] = [
  { key: "spotify", label: "Spotify", icon: siSpotify },
  { key: "apple_music", label: "Apple Music", icon: siApplemusic },
  { key: "youtube_music", label: "YouTube Music", icon: siYoutubemusic },
  { key: "youtube", label: "YouTube", icon: siYoutube },
  { key: "deezer", label: "Deezer", icon: siDeezer },
  { key: "tidal", label: "Tidal", icon: siTidal },
  { key: "soundcloud", label: "SoundCloud", icon: siSoundcloud },
  { key: "itunes", label: "iTunes", icon: siItunes },
  { key: "bandcamp", label: "Bandcamp", icon: siBandcamp },
  { key: "instagram", label: "Instagram", icon: siInstagram },
  { key: "tiktok", label: "TikTok", icon: siTiktok },
  { key: "merch", label: "Merch", icon: null },
  { key: "other", label: "Otra", icon: null },
];

export function getPlatformDef(key: string): PlatformDef {
  return SMARTLINK_PLATFORMS.find((p) => p.key === key) ?? SMARTLINK_PLATFORMS[SMARTLINK_PLATFORMS.length - 1];
}

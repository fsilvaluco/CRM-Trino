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
} from "simple-icons";

export interface PlatformDef {
  key: string;
  label: string;
  /** null = plataforma "Otra", usa el label que escribe la persona */
  icon: { path: string; hex: string } | null;
}

// Catalogo curado (no exhaustivo a proposito) -- cubre las plataformas que
// realmente importan para la mayoria de lanzamientos. Cualquier otra cosa
// (Beatport, Bandcamp con nombre distinto, un link de prensa, etc.) entra
// como "other" con nombre libre.
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
  { key: "other", label: "Otra", icon: null },
];

export function getPlatformDef(key: string): PlatformDef {
  return SMARTLINK_PLATFORMS.find((p) => p.key === key) ?? SMARTLINK_PLATFORMS[SMARTLINK_PLATFORMS.length - 1];
}

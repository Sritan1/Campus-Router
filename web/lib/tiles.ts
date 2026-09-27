// the key ships in the bundle, so restrict it by origin in maptiler
const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

// the only style that draws footpaths
const STYLE = "openstreetmap";

export const TILE_URL = `https://api.maptiler.com/maps/${STYLE}/256/{z}/{x}/{y}.png?key=${KEY}`;

export const MAPTILER_LOGO = "https://api.maptiler.com/resources/logo.svg";

// maptiler requires both credits
export const TILE_ATTRIBUTION =
  `<a href="https://www.maptiler.com/" target="_blank" rel="noopener">` +
  `<img src="${MAPTILER_LOGO}" alt="MapTiler" class="tile-logo" /></a> ` +
  '<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a> ' +
  '<a href="https://www.openstreetmap.org/copyright">&copy; OpenStreetMap</a> contributors';

export const TILE_MAX_ZOOM = 19;

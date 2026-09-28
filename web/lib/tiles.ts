// the key ships in the bundle, so restrict it by origin in maptiler
const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

// the only style that draws footpaths
const STYLE = "openstreetmap";

export const TILE_URL = `https://api.maptiler.com/maps/${STYLE}/256/{z}/{x}/{y}.png?key=${KEY}`;

export const MAPTILER_LOGO = "https://api.maptiler.com/resources/logo.svg";

// outside links open in a new tab, so the map is still there to come back to
export const NEW_TAB = 'target="_blank" rel="noopener noreferrer"';

// maptiler requires both credits
export const TILE_ATTRIBUTION =
  `<a href="https://www.maptiler.com/" ${NEW_TAB}>` +
  `<img src="${MAPTILER_LOGO}" alt="MapTiler" class="tile-logo" width="67" height="20" /></a> ` +
  `<a href="https://www.maptiler.com/copyright/" ${NEW_TAB}>&copy; MapTiler</a> ` +
  `<a href="https://www.openstreetmap.org/copyright" ${NEW_TAB}>&copy; OpenStreetMap</a> contributors`;

export const TILE_MAX_ZOOM = 19;

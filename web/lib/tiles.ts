// the one place the basemap is set. the key ships in the bundle, so restrict it
// to our own domains in the maptiler console rather than treating it as secret

const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

// the only maptiler style that draws footpaths and named campus buildings, which
// is what this app routes over. 256 matches leaflet's default grid
const STYLE = "openstreetmap";

export const TILE_URL = `https://api.maptiler.com/maps/${STYLE}/256/{z}/{x}/{y}.png?key=${KEY}`;

export const MAPTILER_LOGO = "https://api.maptiler.com/resources/logo.svg";

// maptiler requires both credits, so this is not decoration
export const TILE_ATTRIBUTION =
  `<a href="https://www.maptiler.com/" target="_blank" rel="noopener">` +
  `<img src="${MAPTILER_LOGO}" alt="MapTiler" class="tile-logo" /></a> ` +
  '<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a> ' +
  '<a href="https://www.openstreetmap.org/copyright">&copy; OpenStreetMap</a> contributors';

// the raster style stops here
export const TILE_MAX_ZOOM = 19;

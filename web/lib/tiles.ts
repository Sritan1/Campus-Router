// the one place the basemap is set. osm asks not to back production apps, a
// known trade for a low traffic demo

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// the osm raster tiles stop here
export const TILE_MAX_ZOOM = 19;

// Where the basemap comes from. One place, because two maps draw it.
//
// Openstreetmap raster tiles, no key and no account. Their usage policy
// asks that it not back a production app, which is a known trade for a
// low traffic demo. Swapping providers means changing this file only.

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// the osm raster tiles stop here
export const TILE_MAX_ZOOM = 19;

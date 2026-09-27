import type { Map as LeafletMap } from "leaflet";

// above the tiles, under everything else
const PANE = "canvasPane";
const PANE_Z = "350";

export function paneCanvas(map: LeafletMap): HTMLCanvasElement {
  const pane = map.getPane(PANE) ?? map.createPane(PANE);
  pane.style.zIndex = PANE_Z;
  pane.style.pointerEvents = "none";

  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.pointerEvents = "none";
  pane.appendChild(canvas);
  return canvas;
}

// the pane moves with the map
export function pinToCorner(map: LeafletMap, canvas: HTMLCanvasElement) {
  const corner = map.containerPointToLayerPoint([0, 0]);
  canvas.style.transform = `translate(${corner.x}px, ${corner.y}px)`;
}

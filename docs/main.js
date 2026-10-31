import "nicrainha";

// The showcase: nicrainha's background, with one glass panel carrying the
// label. Drag, fling or scroll to pan; the panel slides over the background,
// and once it has left the window on one side it comes back in from the
// opposite one.
//
// ?lightness=<L*> sets the background's lightness, 0 to 100.

const background = document.querySelector("nicrainha-background");
const glass = document.querySelector("nicrainha-glass");

const lightness = new URLSearchParams(location.search).get("lightness");
if (lightness?.trim()) background.setAttribute("lightness", lightness);

// The panel, CSS px, shrunk to fit the window with this margin, and its
// corner radius as a fraction of the largest it allows. Chosen by eye.
const PANEL = { width: 560, height: 320, margin: 24 };
const CORNER = 0.38;

let halfWidth, halfHeight;

function size() {
  halfWidth = Math.max(0, Math.min(PANEL.width, innerWidth - 2 * PANEL.margin) / 2);
  halfHeight = Math.max(0, Math.min(PANEL.height, innerHeight - 2 * PANEL.margin) / 2);
  glass.style.width = `${2 * halfWidth}px`;
  glass.style.height = `${2 * halfHeight}px`;
  glass.style.borderRadius = `${CORNER * Math.min(halfWidth, halfHeight)}px`;
  place();
}

// The panel starts centered and pans with the UI, wrapping with a period of
// the window plus its own size. The background's children live on its
// endless plane, shifted by the pan, so the panel's place on the plane is
// its place on screen plus the pan.
const wrap = (value, period) => ((value % period) + period) % period;

function place() {
  const { scrollLeft: x, scrollTop: y } = background;
  const centerX = wrap(innerWidth / 2 + halfWidth - x, innerWidth + 2 * halfWidth) - halfWidth;
  const centerY = wrap(innerHeight / 2 + halfHeight - y, innerHeight + 2 * halfHeight) - halfHeight;
  glass.style.left = `${centerX - halfWidth + x}px`;
  glass.style.top = `${centerY - halfHeight + y}px`;
}

background.addEventListener("scroll", place);
addEventListener("resize", size);
size();

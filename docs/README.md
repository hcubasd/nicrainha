# nicrainha showcase

nicrainha's background with one glass panel carrying `npm i nicrainha`. Drag,
fling or scroll to pan; the panel slides over the background and wraps around
the window.

Live: https://hcubasd.github.io/nicrainha/

`?lightness=<L*>` sets the background's lightness, 0 to 100.

The background and glass are nicrainha's `<nicrainha-background>` and
`<nicrainha-glass>`; see the library's README for their API and model. The
panel's size, corner radius and wrapping are this page's own (`main.js`).

```sh
npm install
npm run dev       # dev server on all interfaces
npm run build     # static site → dist/
```

`docs/` is its own Vite project that depends on the library in this repo
(`file:..`), so build the library first (`npm run build` at the root). Pushes
that touch `docs/` or `src/` on the default branch build and deploy it to
GitHub Pages (`.github/workflows/pages.yaml`).

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

`docs/` is its own Vite project that installs `nicrainha` from npm, as any
user would. Pushes that touch `docs/` on the default branch build and deploy
it to GitHub Pages (`.github/workflows/pages.yaml`).

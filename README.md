# Hibiscus (web)

La versione per il web dell'effetto creato in TouchDesigner: la foto dell'ibisco
si scompone in linee vive **al tocco** e poi si ricompone. Gira in tempo reale
nel browser (Three.js / WebGL), anche su telefono.

## File

| File | Cosa contiene |
|---|---|
| `index.html` | la pagina a schermo intero |
| `hibiscus.js` | l'effetto, riutilizzabile in qualsiasi pagina |
| `assets/ibisco.jpg` | la foto ritagliata sul fiore |

## Vederla sul computer

Il doppio clic su `index.html` non basta: il browser non lascia leggere i pixel
di una foto aperta come file locale. Serve un piccolo server. Dalla cartella del
progetto:

```bash
python -m http.server 5173
```

poi apri <http://localhost:5173>.

## Interazione

- **Tocco o clic**: la foto si scompone in linee (circa 3,5 s), resta così per 6 s
  e poi si ricompone (circa 4,5 s).
- **Dito tenuto premuto**: resta in linee; trascinando il fiore si inclina in 3D
  e le fibre sotto il dito si agitano e si sollevano.
- **Mouse** (dopo il primo clic): passando sopra il fiore le fibre reagiscono.
- **Tastiera**: barra spaziatrice o Invio alternano foto e linee.

## Metterla online

Carica la cartella così com'è (`index.html`, `hibiscus.js`, `assets/`) su un
hosting statico qualsiasi: Netlify (trascina la cartella su app.netlify.com/drop),
GitHub Pages, Vercel o lo spazio del tuo sito.

## Inserirla in una pagina esistente

```html
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }
</script>

<div id="fiore" style="width: 100%; height: 80vh; background: #000;"></div>

<script type="module">
  import { createHibiscus } from './hibiscus.js';
  const fx = await createHibiscus(document.getElementById('fiore'), {
    image: 'assets/ibisco.jpg',
  });
</script>
```

L'effetto si adatta al contenitore: basta dargli una larghezza e un'altezza.

## Regolazioni

Si passano come secondo argomento di `createHibiscus(contenitore, { ... })`.

| Opzione | Default | Effetto |
|---|---|---|
| `columns` | 800 (520 su telefono) | densità delle linee |
| `furAmp` | 0.003 | lunghezza del "pelo" |
| `depthAmp` | 0.05 | quanto il fiore esce in 3D |
| `yaw` / `pitch` | 16 / 5 | rotazione automatica in gradi |
| `decompose` / `recompose` | 3.5 / 4.5 | secondi per diventare linee e per tornare foto |
| `linger` | 6 | secondi in linee dopo un tocco |
| `brushRadius` | 0.12 | raggio della reazione attorno al dito |
| `tilt` | 0.35 | inclinazione massima trascinando |
| `trail` | 0.55 | scia: 0 nessuna, 0.9 lunga |
| `dark` | 0.12 | soglia del fondo nero da togliere |
| `maxGap` | 0 | salto massimo delle linee sui vuoti in pixel (0 = sempre) |

## Comandarla dal codice (anche con GSAP)

```js
fx.set(1);   // diventa linee
fx.set(0);   // torna foto
```

Per esempio con GSAP ScrollTrigger: `onEnter: () => fx.set(1), onLeaveBack: () => fx.set(0)`.
Nella pagina di esempio l'effetto è anche in `window.hibiscus`.

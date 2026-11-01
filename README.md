# Hibiscus (web)

La versione per il web dell'effetto creato in TouchDesigner: la foto dell'ibisco
si scompone in linee vive **al tocco** e poi si ricompone. Gira in tempo reale
nel browser (Three.js / WebGL), anche su telefono.

## File

| File | Cosa contiene |
|---|---|
| `index.html` | rimando al login; il middleware gestisce l'accesso |
| `access.js` | login e caricamento dell'effetto nella sola pagina aperta |
| `hibiscus.js` | l'effetto, riutilizzabile in qualsiasi pagina |
| `assets/ibisco.jpg` | la foto ritagliata sul fiore |
| `middleware.js`, `server/` | controllo accessi, schermata password e contenitore dell'effetto |
| `vercel.json` | pubblicazione e protezione di tutte le richieste |

## Vederla sul computer

Serve Node.js 24. Dalla cartella del progetto:

```bash
npm install
```

Copia `.env.example` in `.env.local`. Imposta `SITE_PASSWORD` alla password
desiderata e `SESSION_SECRET` a un valore casuale di almeno 32 caratteri.
Per generare il segreto:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Avvia il sito con il controllo accessi:

```bash
npm run dev
```

poi apri <http://localhost:5173>.
La password viene verificata sul server e non viene inserita nel codice della
pagina. `.env.local` è escluso da Git e dalla cartella pubblicata.

Un server puramente statico (come `python -m http.server`) **non esegue il
controllo accessi**: non usarlo per pubblicare questa versione.

## Animazione e interazione

Parte da sola e gira in loop, come l'ultima versione TouchDesigner (v9):
foto ferma → si scompone in linee (6,5 s) → effetto pieno (6 s) →
si ricompone (6,5 s) → foto ferma (4 s) → di nuovo. Un ciclo dura 23 s.

- **Tocco o clic**: si scompone subito, senza aspettare il ciclo.
- **Dito tenuto premuto**: resta in linee finché tieni; trascinando il fiore si
  inclina in 3D e le fibre sotto il dito si agitano e si sollevano.
- **Mouse** (dopo il primo clic): passando sopra il fiore le fibre reagiscono.
- **Tastiera**: barra spaziatrice o Invio alternano foto e linee.

## Metterla online

Il controllo accessi richiede **Vercel**. Nel progetto Vercel collegato a questo
repository, configura in **Settings → Environment Variables**, per Production
e Preview:

- `SITE_PASSWORD`: la password scelta per l'accesso (la stessa di `.env.local`).
- `SESSION_SECRET`: un segreto casuale di almeno 32 caratteri, generato con il
  comando sopra. Non usare la password come segreto.

Poi esegui un nuovo deploy. `vercel.json` imposta la build e la cartella `dist`:
vengono pubblicati soltanto HTML, script dell'effetto e foto. Il middleware
verifica la sessione **anche per gli URL diretti di script e immagine**.
Senza le variabili necessarie, il sito restituisce 503 e resta chiuso.

L'accesso vale soltanto per il documento aperto. Ogni nuova scheda, riapertura
o ricaricamento richiede nuovamente la password. Dopo la verifica, il server
rilascia un token firmato valido per 5 minuti, usato soltanto in memoria per
scaricare script e foto con l'header `Authorization`. Il token non viene salvato
in cookie, localStorage, sessionStorage, cronologia o URL. Una volta caricata,
l'animazione continua in loop senza interruzioni.

La freccia di uscita elimina l'effetto e le risorse dalla pagina. Anche il ritorno
tramite la cache avanti/indietro del browser ripresenta il login. I vecchi cookie
non autorizzano più alcun file e vengono cancellati aprendo il login. Cambiare
password o segreto invalida i token ancora validi; un token eventualmente copiato
resta utilizzabile fino alla sua scadenza, al massimo 5 minuti. Le risposte non
vengono conservate nella cache. È necessario JavaScript per accedere.

**Altre copie pubbliche:** questa protezione vale soltanto per il nuovo deploy
Vercel. Disattiva l'eventuale GitHub Pages (Settings → Pages → Unpublish site)
e rimuovi o proteggi i vecchi deploy accessibili. Se il repository GitHub è
pubblico, i sorgenti e la foto restano scaricabili da lì: per riservarli serve
anche rendere privato il repository. Una password breve è indovinabile; per
limitare tentativi ripetuti configura una regola di rate limiting sul percorso
`/login` nel firewall Vercel.

Riferimento: [Routing Middleware di Vercel](https://vercel.com/docs/routing-middleware).

## Verifiche

```bash
npm test
npm run build
```

I test verificano accesso corretto ed errato, protezione degli asset, token
alterati/scaduti, rifiuto dei vecchi cookie, nuove navigazioni, cambio password,
richieste cross-origin e configurazione mancante. `npm run dev` usa lo stesso
controllo accessi della pubblicazione.

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
| `depthAmp` | 0.05 | quanto le linee si contorcono e il fiore esce in 3D |
| `depthOctaves` / `furOctaves` | 3 / 2 | strati di noise: più strati = curve più contorte |
| `harmonicGain` | 0.7 | forza di ogni strato rispetto al precedente |
| `yaw` / `pitch` | 16 / 5 | rotazione automatica in gradi |
| `autoplay` | true | ciclo automatico; con `false` si muove solo al tocco |
| `hold` / `transition` / `effect` | 4 / 6.5 / 6 | secondi di foto ferma tra i cicli, di passaggio e di effetto pieno |
| `brushRadius` | 0.12 | raggio della reazione attorno al dito |
| `tilt` | 0.35 | inclinazione massima trascinando |
| `trail` | 0.55 | scia: 0 nessuna, 0.9 lunga |
| `dark` | 0.12 | soglia del fondo nero da togliere |
| `maxGap` | 0 | salto massimo delle linee sui vuoti in pixel (0 = sempre) |

## Comandarla dal codice (anche con GSAP)

```js
fx.set(1);   // diventa linee e ci resta
fx.set(0);   // torna foto e riprende il ciclo
```

Per esempio con GSAP ScrollTrigger: `onEnter: () => fx.set(1), onLeaveBack: () => fx.set(0)`.
Nella pagina di esempio l'effetto è anche in `window.hibiscus`.

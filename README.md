# Sa.Ni.Ca. — I Creatori del Verde

Sito di Sa.Ni.Ca. (Palermo), generato automaticamente a partire da:

- **testi** in `contenuti/` (un file per pagina e per servizio);
- **foto** in `foto/` (una cartella per ogni sezione di ogni pagina).

👉 **Per aggiornare il sito leggi [GUIDA.md](GUIDA.md).**

## Attivazione (una volta sola)

1. **Pubblicazione automatica**: nel repository vai su *Settings → Pages → Build and deployment → Source* e scegli **GitHub Actions**.
   Il dominio personalizzato (www.sanicapalermo.it) resta quello impostato; il file `CNAME` viene comunque rigenerato a ogni pubblicazione.
2. Il primo avvio parte da solo al primo salvataggio sul ramo `main` (o `master`). Si può anche avviare a mano da *Actions → Pubblica il sito → Run workflow*.
   La prima volta impiega qualche minuto in più perché prepara tutte le foto; le volte successive meno di un minuto.
3. **Pannello Pages CMS**: vai su <https://app.pagescms.org>, accedi con GitHub, installa l'app Pages CMS **solo su questo repository** e aprilo. La configurazione del pannello è nel file `.pages.yml`.

## Struttura tecnica

| Percorso | Contenuto |
|---|---|
| `contenuti/impostazioni.yml` | Dati aziendali, contatti, menu |
| `contenuti/pagine/*.md` | Pagine (front matter YAML con l'elenco `sezioni`) |
| `contenuti/servizi/*.md` | Servizi (stessa struttura, più `nome`, `riassunto`, `ordine`) |
| `foto/<pagina>/<cartella>/` | Foto di ogni sezione (le sezioni indicano la cartella con `cartella:`) |
| `sito/costruisci.js` | Generatore del sito (Node.js, usa sharp, js-yaml, markdown-it) |
| `sito/stile.css`, `sito/sito.js` | Grafica e interazioni (menu, gallerie, carosello, ingrandimento foto) |
| `.github/workflows/pubblica.yml` | Costruzione e pubblicazione su GitHub Pages |
| `.pages.yml` | Configurazione del pannello Pages CMS |

Comandi: `npm install`, poi `npm run costruisci` (genera `_site/`) oppure `npm run anteprima` (anteprima su http://localhost:8080 con aggiornamento automatico).

Le foto vengono convertite in WebP in più larghezze e salvate in `_site/img/`. Le versioni già create vengono riusate (anche su GitHub, tramite cache), quindi si rielaborano solo le foto nuove.

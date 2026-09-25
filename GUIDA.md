# Guida al sito Sa.Ni.Ca.

Il sito si aggiorna modificando **file di testo** e **cartelle di foto**.
A ogni modifica salvata su GitHub il sito si ricostruisce da solo ed è online dopo circa **1–2 minuti**.

Ci sono due modi per fare le modifiche, e puoi usarli entrambi:

- **Pannello Pages CMS** (consigliato): vai su <https://app.pagescms.org>, accedi con GitHub e apri il repository del sito. Hai campi da compilare, menu a tendina e un pulsante per caricare le foto.
- **Direttamente su GitHub**: apri i file dal sito di GitHub, modificali con la matita ✏️ e salva con *Commit changes*. Per le foto: entra nella cartella, *Add file → Upload files*.

---

## 1. Come è organizzato

```
contenuti/
  impostazioni.yml        ← telefoni, email, Instagram, P.IVA, indirizzo, menu
  pagine/                 ← una scheda per pagina
    home.md
    chi-siamo.md
    contatti.md
    qualita.md
    realizzazioni.md
    servizi.md            ← la pagina con l'elenco dei servizi
    privacy-policy.md
    cookie-policy.md
    grazie.md             ← pagina dopo l'invio del modulo
    404.md                ← pagina "non trovata"
  servizi/                ← una scheda per ogni servizio
    potatura-cura-alberi-piante.md
    prato-sintetico.md
    …
foto/
  home/
    testata/              ← foto grande in alto
    realizzazioni/        ← le 3 foto grandi "Il risultato si vede"
    galleria/             ← "Una parte del lavoro, in immagini"
    processo/             ← "Prima si prepara. Poi si trasforma."
  chi-siamo/ …
  servizi/
    potatura-cura-alberi-piante/
      testata/
      lavori/
    impianti-irrigazione/
      testata/
      galleria/
  logo/
sito/                     ← grafica e funzionamento: non serve toccarla
```

La regola è semplice: **ogni pagina ha la sua cartella in `foto/`, e ogni sezione con foto ha la sua sottocartella.**

---

## 2. Aggiungere o togliere foto

- **Aggiungere**: carica la foto nella cartella della sezione. Compare da sola sul sito.
- **Togliere**: cancella la foto dalla cartella.
- **Ordine**: le foto vengono mostrate in ordine di nome. Per decidere l'ordine metti un numero davanti:
  `01-giardino.jpg`, `02-aiuola.jpg`, `03-prato.jpg`…
- **Nome del file**: se lo scrivi in modo descrittivo (`05-ulivo-potato-a-nuvola.jpg`) diventa anche la descrizione per Google.
- **Formati**: JPG, PNG o WEBP. Le foto HEIC dell'iPhone vanno prima convertite in JPG (oppure imposta l'iPhone su *Impostazioni → Fotocamera → Formati → Più compatibile*).
- **Dimensioni**: carica pure le foto originali del telefono. Il sito le ridimensiona e le alleggerisce da solo.

### Foto di testata
Nella cartella `testata/` la prima foto è quella usata su computer.
Se aggiungi una seconda foto con la parola **mobile** nel nome (es. `02-testata-mobile.jpg`), quella viene usata sui telefoni: utile per le foto verticali.

### Didascalie
Nelle sezioni "Galleria di foto" puoi aggiungere didascalie (etichetta piccola + titolo) nell'elenco **Foto con didascalia**. Le foto elencate vengono mostrate per prime e nell'ordine scelto; tutte le altre foto della cartella seguono comunque.

---

## 3. Modificare i testi

Ogni pagina è un elenco di **sezioni**, dall'alto verso il basso. Nel pannello le vedi come blocchi che puoi:

- **modificare** (clic sul blocco);
- **spostare** (trascinando);
- **aggiungere** (pulsante *Aggiungi* → scegli il tipo);
- **nascondere** temporaneamente (casella *Nascondi questa sezione*) o eliminare.

Nei titoli, per andare a capo basta premere Invio: la riga va a capo anche sul sito.
Nei testi lunghi puoi usare il **grassetto** e i collegamenti.

### Tipi di sezione disponibili

| Tipo | Cosa mostra |
|---|---|
| **Testata** | Foto grande con titolo, sottotitolo e pulsanti |
| **Testo** | Titolo e testo, su una o due colonne; volendo una foto sotto |
| **Schede numerate** | 2–4 riquadri con numero, titolo e testo |
| **Galleria di foto** | Le foto di una cartella, in 4 stili (vedi sotto) |
| **Foto e testo** | Foto accanto al testo, testo sopra la foto, oppure citazione in un riquadro |
| **Foto di apertura** | Foto a tutta larghezza senza testo |
| **Presentazione** | Titolo principale con punti di forza e, volendo, i recapiti |
| **Elenco dei servizi** | Si aggiorna da solo con tutti i servizi |
| **Fascia contatti** | Telefoni, email e Instagram presi dalle impostazioni |
| **Modulo di contatto** | Il modulo che invia le richieste via email |
| **Documento** | Testi lunghi (privacy, cookie) |
| **Messaggio** | Pagina di conferma o di errore |

### Stili delle gallerie

| Stile | Aspetto |
|---|---|
| **griglia** | Foto tutte uguali in colonne (scegli colonne e forma: quadrata, orizzontale, verticale, originale) |
| **mosaico** | Una foto grande e due piccole, ripetuto; le didascalie compaiono sulla foto |
| **affiancate** | Foto grandi una accanto all'altra con didascalia sotto |
| **carosello** | Foto in fila da scorrere con le frecce o col dito |

In tutti gli stili, cliccando una foto si apre ingrandita con le frecce per scorrere.

---

## 4. Posizione del testo sulle foto di testata

Nella sezione **Testata** trovi:

- **Posizione del testo sulla foto**: `alto`, `centro` o `basso`;
- **Posizione del testo su telefono**: solo se vuoi una posizione diversa sui telefoni;
- **Altezza della testata**: `piccola`, `media`, `grande`;
- **Parte della foto da tenere visibile**: se il soggetto viene tagliato, scegli `alto`, `centro-alto`, `centro`, `centro-basso` o `basso`.

La sfumatura scura dietro il testo si sposta da sola insieme al testo, così resta sempre leggibile.

---

## 5. Aggiungere un nuovo servizio

1. Nel pannello: **Servizi → Aggiungi**. Scrivi il nome, il riassunto e la posizione nell'elenco (**Ordine**).
2. Aggiungi le sezioni (di solito: Testata, Testo, Schede numerate, Galleria di foto, Fascia contatti).
3. Carica le foto in `foto/servizi/<nome-del-servizio>/testata/` e nelle altre cartelle indicate nelle sezioni.

Il servizio compare da solo nell'elenco della home, nella pagina Servizi e nella mappa del sito per Google.
Per toglierlo senza cancellarlo spunta **Bozza (non pubblicare)**.

> Il nome della cartella delle foto è il nome del file del servizio, senza `.md`. Esempio: il servizio `contenuti/servizi/potatura-palme.md` usa le foto in `foto/servizi/potatura-palme/`.

---

## 6. Impostazioni generali

In **Impostazioni generali** (file `contenuti/impostazioni.yml`) trovi tutto ciò che compare su più pagine:
telefoni, email, Instagram, **Partita IVA**, indirizzo, voci del menu, testo in fondo alle pagine.
Cambiandoli qui si aggiornano ovunque, anche nei dati letti da Google.

L'email indicata qui è anche quella che riceve i messaggi del modulo contatti.

---

## 7. Se qualcosa va storto

- Dopo ogni salvataggio, nella scheda **Actions** del repository compare la pubblicazione in corso: pallino giallo = in corso, spunta verde = online, croce rossa = errore.
- **Se c'è un errore, il sito online resta com'era**: non si rompe nulla. Apri la pubblicazione con la croce rossa e leggi il messaggio (è in italiano e indica il file e la riga da correggere).
- Gli errori più comuni quando si modificano i file a mano: uno spazio in meno all'inizio della riga, oppure dei due punti `:` dentro un testo. In quel caso metti il testo tra virgolette: `titolo: "Orari: dal lunedì al venerdì"`.
- Gli **avvisi** (foto mancanti, cartella vuota, formato HEIC) non bloccano la pubblicazione: li trovi nel registro della pubblicazione, sotto *Genera il sito*.

---

## 8. Anteprima sul computer (facoltativo)

Se vuoi vedere le modifiche prima di pubblicarle, con [Node.js](https://nodejs.org) installato:

```bash
npm install
npm run anteprima
```

Poi apri <http://localhost:8080>. Il sito si aggiorna da solo a ogni modifica dei file.

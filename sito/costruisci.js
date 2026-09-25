#!/usr/bin/env node
/* ==========================================================================
   Sa.Ni.Ca. — costruzione del sito
   Legge i testi in /contenuti e le foto in /foto e genera il sito in /_site.

   Uso:
     npm run costruisci      → genera il sito una volta
     npm run anteprima       → genera il sito, lo apre su http://localhost:8080
                               e lo rigenera a ogni modifica
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const sharp = require('sharp');
const yaml = require('js-yaml');
const MarkdownIt = require('markdown-it');

const RADICE = path.resolve(__dirname, '..');
const CONTENUTI = path.join(RADICE, 'contenuti');
const FOTO = path.join(RADICE, 'foto');
const USCITA = path.join(RADICE, '_site');
const VERSIONE_IMMAGINI = '1';
const ESTENSIONI_FOTO = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff', '.gif'];

const md = new MarkdownIt({ html: true, linkify: false, typographer: false, breaks: false });

/* -------------------------------------------------------------- avvisi */
let avvisi = [];
function avviso(msg) { avvisi.push(msg); }
class ErroreContenuto extends Error {}

/* -------------------------------------------------------------- utilità */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Titolo: ogni "a capo" diventa un <br> */
const tit = (s) => esc(String(s ?? '').trim()).replace(/\r?\n/g, '<br>');
/** Testo lungo in Markdown (paragrafi, grassetto, link, elenchi) */
const testo = (s) => (s ? md.render(String(s)) : '');
/** Testo breve in Markdown su una riga (grassetto, link) conservando gli a capo */
const riga = (s) => (s ? md.renderInline(String(s).trim()).replace(/\r?\n/g, '<br>') : '');
const vero = (v) => v === true || v === 'true' || v === 'si' || v === 'sì';
function slug(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}
function ordinaNaturale(a, b) { return a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' }); }
function rel(file) { return path.relative(RADICE, file).split(path.sep).join('/'); }

/** Testo alternativo ricavato dal nome del file: "03-ulivo-a-nuvola.jpg" → "Ulivo a nuvola" */
function altDaNome(file, riserva) {
  let n = path.basename(file, path.extname(file))
    .replace(/^\d+[\s._-]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\bmobile\b/gi, '')
    .replace(/\bsa ni ca\b/gi, 'Sa.Ni.Ca.').replace(/\bsanica\b/gi, 'Sa.Ni.Ca.')
    .replace(/\s+/g, ' ').trim();
  if (!n || /^(img|dsc|pxl|photo|foto|image|immagine|whatsapp|screenshot|testata)\b/i.test(n) || /^[\d\s]+$/.test(n)) return riserva;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/* -------------------------------------------------------------- lettura contenuti */
function leggiYaml(testoYaml, file, scarto = 0) {
  try { return yaml.load(testoYaml) || {}; }
  catch (e) {
    const riga = e.mark ? ` (riga ${e.mark.line + 1 + scarto})` : '';
    throw new ErroreContenuto(`Errore di scrittura nel file ${rel(file)}${riga}: ${e.reason || e.message}.\n` +
      `Controlla gli spazi all'inizio delle righe e che i due punti ":" siano seguiti da uno spazio.`);
  }
}
function leggiPagina(file) {
  const grezzo = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const m = grezzo.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new ErroreContenuto(`Il file ${rel(file)} deve iniziare con una riga "---" e contenere le impostazioni tra due righe "---".`);
  return { dati: leggiYaml(m[1], file, 1), corpo: m[2] || '' };
}

function caricaSito() {
  const impostazioni = leggiYaml(fs.readFileSync(path.join(CONTENUTI, 'impostazioni.yml'), 'utf8'), path.join(CONTENUTI, 'impostazioni.yml'));
  impostazioni.dominio = String(impostazioni.dominio || '').replace(/\/+$/, '');
  const pagine = [];
  const leggiCartella = (dir, tipo) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort(ordinaNaturale)) {
      const id = f.replace(/\.md$/, '');
      const { dati, corpo } = leggiPagina(path.join(dir, f));
      if (vero(dati.bozza)) continue;
      let url;
      if (dati.indirizzo) url = '/' + String(dati.indirizzo).replace(/^\/+|\/+$/g, '') + (String(dati.indirizzo).endsWith('.html') ? '' : '/');
      else if (tipo === 'pagina' && id === 'home') url = '/';
      else if (tipo === 'pagina' && id === '404') url = '/404.html';
      else url = tipo === 'servizio' ? `/servizi/${id}/` : `/${id}/`;
      url = url.replace(/\/{2,}/g, '/');
      if (url === '//') url = '/';
      pagine.push({ id, tipo, file: path.join(dir, f), url, cartellaFoto: tipo === 'servizio' ? `servizi/${id}` : id, dati, corpo });
    }
  };
  leggiCartella(path.join(CONTENUTI, 'pagine'), 'pagina');
  leggiCartella(path.join(CONTENUTI, 'servizi'), 'servizio');
  const servizi = pagine.filter((p) => p.tipo === 'servizio')
    .sort((a, b) => (Number(a.dati.ordine) || 999) - (Number(b.dati.ordine) || 999) || ordinaNaturale(a.id, b.id));
  return { impostazioni, pagine, servizi };
}

/* -------------------------------------------------------------- foto */
const cacheImmagini = new Map();
function fileFoto(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => !f.startsWith('.') && ESTENSIONI_FOTO.includes(path.extname(f).toLowerCase()))
    .sort(ordinaNaturale)
    .map((f) => path.join(dir, f));
}
function avvisaFormatiNonSupportati(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const e = path.extname(f).toLowerCase();
    if (['.heic', '.heif'].includes(e)) avviso(`La foto ${rel(path.join(dir, f))} è in formato HEIC (iPhone) e non può essere usata: caricala in JPG.`);
  }
}

/**
 * Converte una foto in WebP in più larghezze (per telefono, tablet, computer).
 * Le versioni già create vengono riusate: si rigenerano solo le foto nuove o cambiate.
 */
async function elabora(file, larghezze) {
  const chiave = file + '|' + larghezze.join(',');
  if (cacheImmagini.has(chiave)) return cacheImmagini.get(chiave);
  const lavoro = (async () => {
    const dati = fs.readFileSync(file);
    const hash = crypto.createHash('sha1').update(dati).update(VERSIONE_IMMAGINI).digest('hex').slice(0, 10);
    const meta = await sharp(dati).metadata();
    let w = meta.width, h = meta.height;
    if (meta.orientation && meta.orientation >= 5) [w, h] = [h, w];
    let misure = larghezze.filter((x) => x < w);
    if (!misure.length || misure[misure.length - 1] < Math.min(w, larghezze[larghezze.length - 1])) misure.push(Math.min(w, larghezze[larghezze.length - 1]));
    misure = [...new Set(misure)].sort((a, b) => a - b);
    // nome leggibile per Google: pagina + nome della foto (senza il numero d'ordine)
    const parti = path.relative(FOTO, path.dirname(file)).split(path.sep).filter((x) => x && x !== 'servizi' && x !== '..');
    const base = path.basename(file, path.extname(file)).replace(/^\d+[\s._-]*/, '');
    const nome = slug([parti[0] || '', base].filter(Boolean).join(' ')) || 'foto';
    const out = [];
    for (const mw of misure) {
      const percorso = `/img/${nome}-${hash}-${mw}.webp`;
      const dest = path.join(USCITA, percorso);
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        await sharp(dati).rotate().resize({ width: mw, withoutEnlargement: true }).webp({ quality: 80 }).toFile(dest);
      }
      out.push({ url: percorso, w: mw });
    }
    const piuGrande = out[out.length - 1];
    const media = out.find((o) => o.w >= 1200) || piuGrande;
    return {
      src: media.url, grande: piuGrande.url,
      srcset: out.map((o) => `${o.url} ${o.w}w`).join(', '),
      width: media.w, height: Math.round((media.w * h) / w),
    };
  })();
  cacheImmagini.set(chiave, lavoro);
  return lavoro;
}

/**
 * Foto di una sezione: tutte le foto della sua cartella, in ordine di nome.
 * Se la sezione ha un elenco "foto" (con didascalie), quelle vengono prima e nell'ordine indicato.
 */
function fotoSezione(p, s, cartellaPredefinita) {
  const cartella = String(s.cartella || cartellaPredefinita || '').replace(/^\/+|\/+$/g, '');
  const dir = path.join(FOTO, p.cartellaFoto, cartella);
  avvisaFormatiNonSupportati(dir);
  const tutte = fileFoto(dir);
  const usate = new Set();
  const elenco = [];
  for (const voce of Array.isArray(s.foto) ? s.foto : []) {
    const v = typeof voce === 'string' ? { immagine: voce } : (voce || {});
    if (!v.immagine) continue;
    let f = String(v.immagine);
    if (f.startsWith('/foto/') || f.startsWith('foto/')) f = path.join(RADICE, f.replace(/^\//, ''));
    else if (f.startsWith('/')) f = path.join(RADICE, f);
    else f = path.join(dir, f);
    if (!fs.existsSync(f)) { avviso(`${rel(p.file)}: la foto "${v.immagine}" non esiste (cartella ${rel(dir)}).`); continue; }
    usate.add(path.resolve(f));
    elenco.push({ file: f, etichetta: v.etichetta || '', titolo: v.titolo || '', alt: v.alt || '' });
  }
  for (const f of tutte) if (!usate.has(path.resolve(f))) elenco.push({ file: f, etichetta: '', titolo: '', alt: '' });
  if (!elenco.length && s.tipo !== 'testo') avviso(`${rel(p.file)}: la sezione "${s.tipo}"${s.titolo ? ' «' + String(s.titolo).split('\n')[0] + '»' : ''} non ha foto (cartella vuota: ${rel(dir)}).`);
  const riserva = `${p.dati.nome || String(s.titolo || '').split('\n')[0] || 'Lavoro'} — Sa.Ni.Ca.`;
  for (const e of elenco) e.alt = e.alt || [e.etichetta, e.titolo].filter(Boolean).join(' — ') || altDaNome(e.file, riserva);
  return elenco;
}

function imgTag(im, alt, { sizes = '100vw', classe = '', stile = '', lazy = true, gruppo = '', didascalia = '' } = {}) {
  return `<img src="${im.src}" srcset="${im.srcset}" sizes="${sizes}" width="${im.width}" height="${im.height}" alt="${esc(alt)}"` +
    (classe ? ` class="${classe}"` : '') + (stile ? ` style="${stile}"` : '') +
    (lazy ? ' loading="lazy" decoding="async"' : ' fetchpriority="high"') +
    (gruppo ? ` data-grande="${im.grande}" data-gruppo="${gruppo}"` + (didascalia ? ` data-didascalia="${esc(didascalia)}"` : '') : '') + '>';
}

/* -------------------------------------------------------------- icone */
const ICONE = {
  telefono: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5 9 3l1.7 4-2.1 1.6a14 14 0 0 0 6.8 6.8l1.6-2.1 4 1.7-.5 2.4c-.2 1-1 1.7-2 1.8C10.7 20 4 13.3 4.8 5.5c.1-1 .8-1.8 1.8-2Z"/></svg>',
  email: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5h17v13h-17z"/><path d="m4 7 8 6 8-6"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  luogo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/></svg>',
};
const ICONE_PUNTI = {
  foglia: '<path d="M35 8C21 10 12 19 10 34c11-1 20-7 25-18 2-4 2-6 0-8Z"/><path d="M11 34c6-8 12-13 21-18"/>',
  persone: '<circle cx="24" cy="15" r="7"/><path d="M11 37c0-8 5-13 13-13s13 5 13 13"/><circle cx="9" cy="20" r="5"/><circle cx="39" cy="20" r="5"/>',
  germoglio: '<path d="M24 40V20"/><path d="M24 24c-8-1-13-5-14-13 8 0 14 4 14 13Z"/><path d="M24 28c8-1 13-5 14-13-8 0-14 4-14 13Z"/>',
  casa: '<path d="M8 22 24 9l16 13"/><path d="M12 19v20h24V19"/><path d="M20 39V28h8v11"/>',
  goccia: '<path d="M24 6s-13 15-13 24a13 13 0 0 0 26 0C37 21 24 6 24 6Z"/>',
  sole: '<circle cx="24" cy="24" r="8"/><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4"/>',
  scudo: '<path d="M24 6 10 11v11c0 9 6 16 14 20 8-4 14-11 14-20V11Z"/><path d="m18 24 5 5 8-9"/>',
  orologio: '<circle cx="24" cy="24" r="16"/><path d="M24 14v10l7 5"/>',
};
const iconaPunto = (n) => `<svg viewBox="0 0 48 48">${ICONE_PUNTI[n] || ICONE_PUNTI.foglia}</svg>`;

/* -------------------------------------------------------------- recapiti */
function recapiti(imp) {
  const tel = (Array.isArray(imp.telefoni) ? imp.telefoni : []).filter((t) => t && t.numero).map((t) => ({
    nome: t.nome || '', numero: String(t.numero), href: 'tel:+39' + String(t.numero).replace(/[^\d]/g, '').replace(/^39(?=\d{9,})/, ''),
  }));
  const ig = imp.instagram ? String(imp.instagram).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '') : '';
  return { tel, email: imp.email || '', ig, igUrl: ig ? `https://www.instagram.com/${ig}/` : '' };
}

/* -------------------------------------------------------------- sezioni */
const SFONDI = ['crema', 'bianco', 'sabbia', 'verde', 'verde-scuro'];
function sfondoDi(s) {
  const t = s.tipo;
  if (['testata', 'foto-apertura', 'presentazione', 'contatti', 'messaggio'].includes(t)) return null;
  if (t === 'foto-e-testo' && s.stile && s.stile !== 'affiancati') return null;
  const def = { schede: 'verde', modulo: 'bianco', 'foto-e-testo': 'sabbia' }[t] || 'crema';
  const v = s.sfondo || def;
  if (!SFONDI.includes(v)) { avviso(`Sfondo "${v}" non riconosciuto: uso "${def}". Valori possibili: ${SFONDI.join(', ')}.`); return def; }
  return v;
}
const attrId = (s) => (s.ancora ? ` id="${esc(slug(s.ancora))}"` : '');
function intestazione(s, { h = 'h2' } = {}) {
  return (s.sopratitolo ? `<div class="eyebrow">${riga(s.sopratitolo)}</div>` : '') +
    (s.titolo ? `<${h} class="serif">${tit(s.titolo)}</${h}>` : '');
}
const PUNTO_FOCALE = { alto: 'center 12%', 'centro-alto': 'center 32%', centro: 'center 50%', 'centro-basso': 'center 62%', basso: 'center 88%' };

const SEZIONI = {
  async testata(p, s) {
    const foto = fotoSezione(p, s, 'testata');
    const desk = foto.find((f) => !/mobile/i.test(path.basename(f.file))) || foto[0];
    const mob = foto.find((f) => /mobile/i.test(path.basename(f.file)) && f !== desk);
    const pos = ['alto', 'centro', 'basso'].includes(s.posizione_testo) ? s.posizione_testo : 'basso';
    const posM = ['alto', 'centro', 'basso'].includes(s.posizione_testo_telefono) ? ` m-${s.posizione_testo_telefono}` : '';
    const alt = ['grande', 'media', 'piccola'].includes(s.altezza) ? s.altezza : 'media';
    let pic = '';
    if (desk) {
      const d = await elabora(desk.file, [800, 1400, 2200]);
      const focale = PUNTO_FOCALE[s.punto_focale] || PUNTO_FOCALE.centro;
      const src = mob ? `<source media="(max-width: 850px)" srcset="${(await elabora(mob.file, [600, 900, 1300])).srcset}" sizes="100vw">` : '';
      pic = `<picture>${src}${imgTag(d, s.alt || desk.alt, { lazy: false, stile: `object-position:${focale}` })}</picture>`;
      p.immagineSocial = p.immagineSocial || d;
    }
    const pulsanti = (Array.isArray(s.pulsanti) ? s.pulsanti : []).filter((b) => b && b.testo)
      .map((b) => `<a class="btn${b.stile === 'contorno' ? ' contorno' : ''}" href="${esc(b.link || '#')}">${esc(b.testo)}</a>`).join('');
    return `<section class="testata testata--${alt} testata--${pos}${posM}"${attrId(s)}>${pic}<div class="wrap"><div class="testata-contenuto">` +
      (s.sopratitolo ? `<div class="crumb">${riga(s.sopratitolo)}</div>` : '') +
      (s.titolo ? `<h1>${tit(s.titolo)}</h1>` : '') +
      (s.sottotitolo ? `<p>${riga(s.sottotitolo)}</p>` : '') +
      (pulsanti ? `<div class="azioni">${pulsanti}</div>` : '') +
      `</div></div></section>`;
  },

  async 'foto-apertura'(p, s) {
    const f = fotoSezione(p, s, 'apertura')[0];
    if (!f) return '';
    const im = await elabora(f.file, [800, 1400, 2200]);
    p.immagineSocial = p.immagineSocial || im;
    return `<section class="foto-apertura"${attrId(s)}>${imgTag(im, s.alt || f.alt, { lazy: false })}</section>`;
  },

  async presentazione(p, s, { imp }) {
    const punti = (Array.isArray(s.punti) ? s.punti : []).filter((x) => x && x.testo)
      .map((x) => `<div><span class="point-icon" aria-hidden="true">${iconaPunto(x.icona)}</span><span>${tit(x.testo)}</span></div>`).join('');
    let schede = '';
    if (vero(s.mostra_recapiti)) {
      const r = recapiti(imp);
      const card = (href, icona, etichetta, valore, esterno) =>
        (href ? `<a href="${href}" class="contact-card"${esterno ? ' target="_blank" rel="noopener"' : ''}>` : '<div class="contact-card">') +
        `<span class="contact-card-icon" aria-hidden="true">${ICONE[icona]}</span><span><small>${esc(etichetta)}</small><strong>${esc(valore)}</strong></span>` + (href ? '</a>' : '</div>');
      schede = r.tel.map((t) => card(t.href, 'telefono', 'Telefono', [t.nome, t.numero].filter(Boolean).join(' · '))).join('') +
        (r.email ? card('mailto:' + r.email, 'email', 'Email', r.email) : '') +
        (r.ig ? card(r.igUrl, 'instagram', 'Instagram', '@' + r.ig, true) : '') +
        (imp.zona_operativa ? card('', 'luogo', 'Zona operativa', imp.zona_operativa) : '');
      schede = `<div class="contact-cards">${schede}</div>`;
    }
    return `<section class="presentazione"${attrId(s)}><div class="wrap">` +
      (s.sopratitolo ? `<div class="eyebrow">${riga(s.sopratitolo)}</div>` : '') +
      (s.titolo ? `<h1>${tit(s.titolo)}</h1>` : '') +
      (s.testo ? `<div class="presentazione-testo">${testo(s.testo)}</div>` : '') +
      (punti ? `<div class="about-points">${punti}</div>` : '') + schede + `</div></section>`;
  },

  async testo(p, s, ctx) {
    let foto = '';
    if (s.cartella) {
      const f = fotoSezione(p, s)[0];
      if (f) foto = `<div class="testo-foto">${imgTag(await elabora(f.file, [700, 1200, 1800]), f.alt, { sizes: '(max-width:850px) 100vw, 60vw' })}</div>`;
    }
    const corpo = (s.testo_evidenza ? `<p class="lead">${riga(s.testo_evidenza)}</p>` : '') +
      (s.testo ? `<div class="bodycopy">${testo(s.testo)}</div>` : '') + foto;
    const due = s.disposizione === 'due-colonne';
    return `<section class="sezione sfondo-${ctx.sfondo}${ctx.classe} ${due ? 'due-colonne' : 'una-colonna'}"${attrId(s)}><div class="wrap${due ? ' grid' : ''}">` +
      (due ? `<div>${intestazione(s)}</div><div>${corpo}</div>` : intestazione(s) + corpo) + `</div></section>`;
  },

  async schede(p, s, ctx) {
    const lista = (Array.isArray(s.schede) ? s.schede : []).filter(Boolean);
    const schede = lista.map((c, i) => `<article class="card"><div class="num">${esc(c.numero || String(i + 1).padStart(2, '0'))}</div>` +
      `<h3>${tit(c.titolo)}</h3>${c.testo ? `<p>${riga(c.testo)}</p>` : ''}</article>`).join('');
    const n = Math.min(Math.max(lista.length, 1), 4);
    return `<section class="sezione sfondo-${ctx.sfondo}${ctx.classe}${s.dimensione === 'grande' ? ' schede--grande' : ''}"${attrId(s)}><div class="wrap">` +
      intestazione(s) + `<div class="cards" style="--n:${n}">${schede}</div></div></section>`;
  },

  async foto(p, s, ctx) {
    const elenco = fotoSezione(p, s, 'galleria');
    const stile = ['griglia', 'mosaico', 'affiancate', 'carosello'].includes(s.stile) ? s.stile : 'griglia';
    const formato = ['quadrato', 'orizzontale', 'verticale', 'originale'].includes(s.formato) ? s.formato : (stile === 'griglia' ? 'quadrato' : 'orizzontale');
    const colonne = Math.min(Math.max(parseInt(s.colonne, 10) || (stile === 'affiancate' ? 2 : 3), 1), 6);
    const ingrandisci = s.ingrandisci === undefined ? true : vero(s.ingrandisci);
    const gruppo = ingrandisci ? `g${ctx.indice}` : '';
    const did = (f) => [f.etichetta, f.titolo].filter(Boolean).join(' — ');

    let testa = '';
    if (s.intestazione === 'affiancata' && (s.titolo || s.testo)) {
      testa = `<div class="head"><div>${intestazione(s)}</div>${s.testo ? `<div class="head-testo">${testo(s.testo)}</div>` : ''}</div>`;
    } else if (s.titolo || s.sopratitolo || s.testo) {
      testa = `<div class="intro-foto${s.testo ? '' : ' intro-foto--breve'}">${intestazione(s)}${s.testo ? `<div class="bodycopy">${testo(s.testo)}</div>` : ''}</div>`;
    }

    let corpo = '';
    if (stile === 'griglia') {
      const sizes = `(max-width:850px) 50vw, ${Math.round(100 / colonne)}vw`;
      const figure = [];
      for (const f of elenco) {
        const im = await elabora(f.file, [480, 900, 1600]);
        figure.push(`<figure>${imgTag(im, f.alt, { sizes, gruppo, didascalia: did(f) })}${did(f) ? `<figcaption>${esc(did(f))}</figcaption>` : ''}</figure>`);
      }
      corpo = `<div class="galleria-griglia formato-${formato}${colonne <= 3 ? ' colonne-poche' : ''}" style="--colonne:${colonne};--colonne-m:${colonne === 1 ? 1 : 2}">${figure.join('')}</div>`;
    } else if (stile === 'mosaico') {
      const pic = async (f, piccola) => {
        const im = await elabora(f.file, [600, 1100, 1800]);
        const cap = f.etichetta || f.titolo;
        return `<figure class="pic${piccola ? ' small' : ''}${cap ? ' con-didascalia' : ''}">${imgTag(im, f.alt, { sizes: piccola ? '(max-width:850px) 100vw, 33vw' : '(max-width:850px) 100vw, 66vw', gruppo, didascalia: did(f) })}` +
          (cap ? `<figcaption class="caption">${f.etichetta ? `<small>${esc(f.etichetta)}</small>` : ''}${f.titolo ? `<h3>${esc(f.titolo)}</h3>` : ''}</figcaption>` : '') + `</figure>`;
      };
      const gruppi = [];
      for (let i = 0, g = 0; i < elenco.length; i += 3, g++) {
        const tre = elenco.slice(i, i + 3);
        if (tre.length === 3) gruppi.push(`<div class="mosaico-gruppo${g % 2 ? ' inverso' : ''}">${await pic(tre[0])}<div class="side">${await pic(tre[1], true)}${await pic(tre[2], true)}</div></div>`);
        else if (tre.length === 2) gruppi.push(`<div class="mosaico-gruppo coppia">${await pic(tre[0])}${await pic(tre[1])}</div>`);
        else gruppi.push(`<div class="mosaico-gruppo solo">${await pic(tre[0])}</div>`);
      }
      corpo = `<div class="mosaico">${gruppi.join('')}</div>`;
    } else if (stile === 'affiancate') {
      const figure = [];
      for (const f of elenco) {
        const im = await elabora(f.file, [600, 1100, 1800]);
        figure.push(`<figure>${imgTag(im, f.alt, { sizes: `(max-width:850px) 100vw, ${Math.round(100 / colonne)}vw`, gruppo, didascalia: did(f) })}` +
          (f.etichetta ? `<div class="label">${esc(f.etichetta)}</div>` : '') + (f.titolo ? `<h3>${esc(f.titolo)}</h3>` : '') + `</figure>`);
      }
      corpo = `<div class="two formato-${formato}" style="--colonne:${colonne}">${figure.join('')}</div>`;
    } else {
      const figure = [];
      for (const f of elenco) {
        const im = await elabora(f.file, [500, 900, 1600]);
        const cap = f.etichetta || f.titolo;
        figure.push(`<figure${cap ? ' class="con-didascalia"' : ''}>${imgTag(im, f.alt, { sizes: '(max-width:850px) 80vw, 45vw', gruppo, didascalia: did(f) })}` +
          (cap ? `<div class="caption">${f.etichetta ? `<small>${esc(f.etichetta)}</small>` : ''}${f.titolo ? `<h3>${esc(f.titolo)}</h3>` : ''}</div>` : '') + `</figure>`);
      }
      corpo = `<div class="carosello"><div class="carosello-pista formato-${formato}">${figure.join('')}</div>` +
        `<div class="carosello-frecce"><button type="button" class="car-prec" aria-label="Foto precedenti">←</button><button type="button" class="car-succ" aria-label="Foto successive">→</button></div></div>`;
    }
    if (!elenco.length) corpo = '';
    return `<section class="sezione sfondo-${ctx.sfondo}${ctx.classe} foto--${stile}"${attrId(s)}><div class="wrap">${testa}${corpo}</div></section>`;
  },

  async 'foto-e-testo'(p, s, ctx) {
    const stile = ['affiancati', 'sovrapposto', 'citazione'].includes(s.stile) ? s.stile : 'affiancati';
    const f = fotoSezione(p, s, 'foto')[0];
    if (stile === 'affiancati') {
      const formato = ['quadrato', 'orizzontale', 'verticale', 'panoramico', 'originale'].includes(s.formato) ? s.formato : 'orizzontale';
      const img = f ? imgTag(await elabora(f.file, [700, 1200, 1800]), s.alt || f.alt, { sizes: '(max-width:850px) 100vw, 50vw', gruppo: `g${ctx.indice}` }) : '';
      const h = vero(s.titolo_principale) ? 'h1' : 'h2';
      return `<section class="sezione sfondo-${ctx.sfondo}${ctx.classe} foto-e-testo--affiancati${h === 'h1' ? ' foto-e-testo--principale' : ''}"${attrId(s)}>` +
        `<div class="wrap affiancati${s.lato_foto === 'destra' ? ' foto-destra' : ''}"><div class="affiancati-foto formato-${formato}">${img}</div>` +
        `<div class="affiancati-testo">${s.sopratitolo ? `<div class="eyebrow">${riga(s.sopratitolo)}</div>` : ''}` +
        (s.titolo ? (h === 'h1' ? `<h1>${tit(s.titolo)}</h1>` : `<h2 class="serif">${tit(s.titolo)}</h2>`) : '') +
        (s.testo ? `<div class="bodycopy">${testo(s.testo)}</div>` : '') + (s.nota ? `<div class="mini">${esc(s.nota)}</div>` : '') +
        `</div></div></section>`;
    }
    const img = f ? imgTag(await elabora(f.file, [800, 1400, 2200]), s.alt || f.alt, { sizes: '100vw' }) : '';
    if (stile === 'sovrapposto') {
      return `<section class="sovrapposto"${attrId(s)}>${img}<div class="sovrapposto-testo">` +
        (s.sopratitolo ? `<div class="eyebrow">${riga(s.sopratitolo)}</div>` : '') +
        (s.titolo ? `<h2>${tit(s.titolo)}</h2>` : '') + (s.testo ? `<p>${riga(s.testo)}</p>` : '') + `</div></section>`;
    }
    const firma = s.firma === undefined ? ctx.imp.nome_breve : s.firma;
    return `<section class="citazione"${attrId(s)}>${img}<div class="citazione-box${s.lato_foto === 'sinistra' ? ' sinistra' : ''}">` +
      `<div class="quote-mark">“</div><p>${riga(s.testo || s.titolo)}</p>` +
      (firma ? `<span>${esc(firma)}<small>${esc(ctx.imp.motto || '')}</small></span>` : '') + `</div></section>`;
  },

  async servizi(p, s, ctx) {
    const elenco = ctx.servizi.filter((x) => !vero(x.dati.nascondi_dagli_elenchi));
    if (s.stile === 'elenco') {
      return `<section class="sezione sfondo-${ctx.sfondo}${ctx.classe} una-colonna"${attrId(s)}><div class="wrap">${intestazione(s)}` +
        (s.testo ? `<div class="bodycopy">${testo(s.testo)}</div>` : '') +
        `<nav class="elenco-servizi" aria-label="Servizi">${elenco.map((x) => `<a href="${x.url}">${esc(x.dati.nome || x.id)} <span>→</span></a>`).join('')}</nav></div></section>`;
    }
    return `<section class="sezione sfondo-${ctx.sfondo}${ctx.classe} servizi--schede"${attrId(s)}><div class="wrap">` +
      `<div class="head"><div>${intestazione(s)}</div>${s.testo ? `<p>${riga(s.testo)}</p>` : ''}</div>` +
      `<div class="servicegrid">${elenco.map((x) => `<article class="service"><h3><a href="${x.url}">${esc(x.dati.nome || x.id)}</a></h3>` +
        (x.dati.riassunto ? `<p>${riga(x.dati.riassunto)}</p>` : '') + `<a href="${x.url}"><strong>${esc(s.testo_link || 'Scopri il servizio →')}</strong></a></article>`).join('')}</div></div></section>`;
  },

  async contatti(p, s, { imp }) {
    const r = recapiti(imp);
    const link = r.tel.map((t) => `<a href="${t.href}">${esc([t.nome, t.numero].filter(Boolean).join(' · '))} ↗</a>`).join('') +
      (r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)} ↗</a>` : '') +
      (r.ig ? `<a href="${r.igUrl}" target="_blank" rel="noopener">@${esc(r.ig)} ↗</a>` : '');
    return `<section class="cta"${attrId(s)}><div class="wrap cta-grid"><div>${intestazione(s)}${s.testo ? `<p>${riga(s.testo)}</p>` : ''}</div>` +
      `<div class="cta-links">${link}</div></div></section>`;
  },

  async modulo(p, s, ctx) {
    const imp = ctx.imp;
    const grazie = ctx.pagine.find((x) => x.id === 'grazie');
    const next = grazie && imp.dominio ? `<input type="hidden" name="_next" value="${esc(imp.dominio + grazie.url)}">` : '';
    const privacy = ctx.pagine.find((x) => x.id === 'privacy-policy');
    if (!imp.email) avviso('Il modulo contatti non può funzionare: manca l\'email nelle impostazioni generali.');
    return `<section class="sezione sfondo-${ctx.sfondo}${ctx.classe}"${attrId(s)}><div class="wrap contact-form-layout"><div>${intestazione(s)}` +
      (s.testo ? `<div class="bodycopy">${testo(s.testo)}</div>` : '') + `</div><div class="contact-form-wrap">` +
      `<form class="contact-form" action="https://formsubmit.co/${esc(imp.email)}" method="POST">` +
      `<input type="hidden" name="_subject" value="${esc(s.oggetto_email || 'Nuova richiesta dal sito')}">${next}` +
      `<input type="hidden" name="_template" value="table"><input type="text" name="_honey" tabindex="-1" autocomplete="off" class="nascosto" aria-hidden="true">` +
      `<div><label for="nome">Nome e cognome</label><input id="nome" name="nome" type="text" autocomplete="name" required></div>` +
      `<div><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>` +
      `<div><label for="telefono">Telefono</label><input id="telefono" name="telefono" type="tel" autocomplete="tel"></div>` +
      `<div class="full"><label for="messaggio">Messaggio</label><textarea id="messaggio" name="messaggio" required></textarea></div>` +
      (privacy ? `<div class="full"><p class="privacy-note">Inviando il modulo accetti il trattamento dei dati secondo la <a href="${privacy.url}">Privacy Policy</a>.</p></div>` : '') +
      `<button type="submit">${esc(s.testo_pulsante || 'Invia messaggio')}</button></form></div></div></section>`;
  },

  async documento(p, s, ctx) {
    return `<section class="sezione sfondo-${ctx.sfondo}${ctx.classe}"${attrId(s)}><div class="wrap prose">${intestazione(s)}` +
      (s.aggiornamento ? `<p><strong>Ultimo aggiornamento: ${esc(s.aggiornamento)}</strong></p>` : '') +
      testo(s.testo || p.corpo) + `</div></section>`;
  },

  async messaggio(p, s) {
    const b = s.pulsante && s.pulsante.testo ? `<a class="btn" href="${esc(s.pulsante.link || '/')}">${esc(s.pulsante.testo)}</a>` : '';
    return `<section class="messaggio"${attrId(s)}><div class="box">${s.sopratitolo ? `<div class="eyebrow">${riga(s.sopratitolo)}</div>` : ''}` +
      (s.titolo ? `<h1>${tit(s.titolo)}</h1>` : '') + (s.testo ? `<p>${riga(s.testo)}</p>` : '') + b + `</div></section>`;
  },
};

/* -------------------------------------------------------------- pagina completa */
function jsonLd(p, sito) {
  const imp = sito.impostazioni, D = imp.dominio;
  const r = recapiti(imp);
  const grafo = [];
  const azienda = {
    '@type': 'LocalBusiness', '@id': `${D}/#business`, name: imp.ragione_sociale || imp.nome_sito, url: `${D}/`,
    telephone: r.tel[0] ? '+39 ' + r.tel[0].numero : undefined, email: r.email || undefined,
    contactPoint: r.tel.map((t) => ({ '@type': 'ContactPoint', contactType: 'customer service', name: t.nome, telephone: '+39 ' + t.numero })),
    address: imp.indirizzo ? { '@type': 'PostalAddress', streetAddress: imp.indirizzo, postalCode: String(imp.cap || ''), addressLocality: imp.citta, addressRegion: imp.provincia, addressCountry: 'IT' } : undefined,
    areaServed: imp.zona_operativa ? { '@type': 'AdministrativeArea', name: imp.zona_operativa } : undefined,
    sameAs: r.igUrl ? [r.igUrl] : undefined,
    vatID: imp.partita_iva ? String(imp.partita_iva) : undefined,
    logo: imp.icona_sito ? D + imp.icona_sito : undefined,
    image: p.immagineSocial ? [D + p.immagineSocial.src] : undefined,
    knowsAbout: sito.servizi.map((x) => String(x.dati.nome || x.id).toLowerCase()),
  };
  if (p.tipo === 'pagina' && ['home', 'chi-siamo', 'contatti', 'qualita'].includes(p.id)) grafo.push(azienda);
  if (p.tipo === 'servizio') {
    grafo.push({ '@type': 'Service', '@id': `${D}${p.url}#service`, name: p.dati.nome, serviceType: p.dati.nome, provider: { '@id': `${D}/#business` },
      areaServed: imp.zona_operativa ? { '@type': 'AdministrativeArea', name: imp.zona_operativa } : undefined, url: D + p.url });
  }
  const briciole = [{ n: 'Home', u: '/' }];
  if (p.tipo === 'servizio' && !p.dati.indirizzo) briciole.push({ n: 'Servizi', u: '/servizi/' });
  if (p.url !== '/') briciole.push({ n: p.dati.nome || String(p.dati.titolo_seo || p.id).split('|')[0].trim(), u: p.url });
  grafo.push({ '@type': 'BreadcrumbList', itemListElement: briciole.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.n, item: D + b.u })) });
  grafo.push({ '@type': 'WebPage', '@id': `${D}${p.url}#webpage`, url: D + p.url, name: p.titolo, description: p.descrizione, inLanguage: 'it-IT' });
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': grafo }).replace(/</g, '\\u003c');
}

function intestazioneSito(p, sito) {
  const imp = sito.impostazioni;
  const voci = (Array.isArray(imp.menu) ? imp.menu : []).filter((v) => v && v.testo);
  const attivo = (l) => (l === p.url || (l !== '/' && p.url.startsWith(l)) ? ' aria-current="page"' : '');
  const link = voci.map((v) => `<a href="${esc(v.link)}"${attivo(v.link)}>${esc(v.testo)}</a>`).join('');
  const btn = imp.pulsante_intestazione && imp.pulsante_intestazione.testo
    ? `<a class="navbtn" href="${esc(imp.pulsante_intestazione.link || '/contatti/')}">${esc(imp.pulsante_intestazione.testo)}</a>` : '';
  return `<header class="site-header"><div class="wrap nav"><a class="brand" href="/">` +
    (imp.logo ? `<img class="brand-logo" src="${esc(imp.logo)}" alt="">` : '') +
    `<span>${esc(imp.nome_breve || '')}<small>${esc(imp.motto || '')}</small></span></a>` +
    `<nav class="links" aria-label="Navigazione principale">${link}</nav>` +
    `<button class="menu-toggle" type="button" aria-label="Apri il menu" aria-expanded="false"><span></span></button>` +
    `<nav class="mobile-menu" aria-label="Menu mobile">${link}</nav>${btn}</div></header>`;
}

function piedeSito(sito) {
  const imp = sito.impostazioni, r = recapiti(imp);
  const icone = r.tel.map((t) => `<a href="${t.href}" aria-label="Telefono ${esc(t.nome)}" title="${esc([t.nome, t.numero].filter(Boolean).join(' · '))}">${ICONE.telefono}</a>`).join('') +
    (r.email ? `<a href="mailto:${esc(r.email)}" aria-label="Email" title="${esc(r.email)}">${ICONE.email}</a>` : '') +
    (r.ig ? `<a href="${r.igUrl}" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram">${ICONE.instagram}</a>` : '');
  const legali = ['privacy-policy', 'cookie-policy'].map((id) => sito.pagine.find((x) => x.id === id)).filter(Boolean)
    .map((x) => `<a href="${x.url}">${x.id === 'privacy-policy' ? 'Privacy' : 'Cookie'}</a>`).join('');
  const dati = [imp.partita_iva ? `P.IVA ${imp.partita_iva}` : '', imp.indirizzo ? `${imp.indirizzo}, ${imp.cap || ''} ${imp.citta || ''}`.replace(/\s+/g, ' ').trim() : ''].filter(Boolean).join(' · ');
  return `<footer><div class="wrap foot"><div><div class="foot-brand">${esc(imp.testo_piede || '')}</div>${dati && imp.partita_iva ? `<div class="foot-legal">${esc(dati)}</div>` : ''}</div>` +
    `<div class="footer-contact-icons" aria-label="Contatti rapidi">${icone}</div><div class="foot-links">${legali}</div></div></footer>`;
}

/** Trasforma i collegamenti "/…" in collegamenti relativi, così il sito funziona anche aprendolo da una sottocartella */
function relativizza(html, url) {
  if (url.endsWith('.html')) return html; // pagina 404: collegamenti dalla radice
  const profondita = url.split('/').filter(Boolean).length;
  const prefisso = profondita ? '../'.repeat(profondita) : './';
  const conv = (u) => {
    if (!u.startsWith('/') || u.startsWith('//')) return u;
    if (u === '/') return prefisso;
    return prefisso + u.slice(1);
  };
  return html
    .replace(/\s(href|src|action|data-grande)="([^"]*)"/g, (m, a, u) => ` ${a}="${conv(u)}"`)
    .replace(/\ssrcset="([^"]*)"/g, (m, v) => ` srcset="${v.split(',').map((x) => { const [u, ...r] = x.trim().split(/\s+/); return [conv(u), ...r].join(' '); }).join(', ')}"`);
}

async function costruisciPagina(p, sito, versioneCss) {
  const imp = sito.impostazioni;
  const sezioni = Array.isArray(p.dati.sezioni) ? p.dati.sezioni : [];
  if (!sezioni.length) avviso(`${rel(p.file)}: la pagina non ha sezioni.`);
  const html = [];
  let sfondoPrec = null;
  for (let i = 0; i < sezioni.length; i++) {
    const s = sezioni[i];
    if (!s || typeof s !== 'object') continue;
    if (vero(s.nascondi)) continue;
    const fn = SEZIONI[s.tipo];
    if (!fn) { avviso(`${rel(p.file)}: tipo di sezione "${s.tipo}" sconosciuto (possibili: ${Object.keys(SEZIONI).join(', ')}).`); sfondoPrec = null; continue; }
    const sfondo = sfondoDi(s);
    const classe = sfondo && sfondo === sfondoPrec ? ' attaccata' : '';
    html.push(await fn(p, s, { imp, sito, servizi: sito.servizi, pagine: sito.pagine, sfondo, classe, indice: i }));
    sfondoPrec = sfondo;
  }
  const D = imp.dominio;
  p.titolo = p.dati.titolo_seo || `${p.dati.nome || p.id} | ${imp.nome_breve || ''}`;
  p.descrizione = p.dati.descrizione_seo || p.dati.riassunto || '';
  const soc = p.immagineSocial || sito.immagineSocialPredefinita;
  const indicizza = !vero(p.dati.nascondi_da_google) && p.url !== '/404.html';
  const testa = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.titolo)}</title>
<meta name="description" content="${esc(p.descrizione)}">
<meta name="robots" content="${indicizza ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' : 'noindex,follow'}">
${D && indicizza ? `<link rel="canonical" href="${D}${p.url}">` : ''}
<meta property="og:locale" content="it_IT"><meta property="og:type" content="website">
<meta property="og:title" content="${esc(p.dati.titolo_social || p.titolo)}"><meta property="og:description" content="${esc(p.descrizione)}">
${D ? `<meta property="og:url" content="${D}${p.url}">` : ''}<meta property="og:site_name" content="${esc(imp.nome_sito || '')}">
${soc && D ? `<meta property="og:image" content="${D}${soc.src}"><meta name="twitter:image" content="${D}${soc.src}">` : ''}
<meta name="twitter:card" content="summary_large_image">
${imp.icona_sito ? `<link rel="icon" href="${esc(imp.icona_sito)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/stile.css?v=${versioneCss}">
${D ? `<script type="application/ld+json">${jsonLd(p, sito)}</script>` : ''}
</head>
<body class="pagina-${esc(p.id)}">
${intestazioneSito(p, sito)}
<main>
${html.join('\n')}
</main>
${piedeSito(sito)}
<script src="/sito.js?v=${versioneCss}" defer></script>
</body>
</html>
`;
  return relativizza(testa, p.url);
}

/* -------------------------------------------------------------- costruzione */
async function costruisci() {
  const inizio = Date.now();
  avvisi = [];
  cacheImmagini.clear();
  const sito = caricaSito();
  fs.mkdirSync(USCITA, { recursive: true });
  // pulisce le pagine vecchie ma conserva le foto già elaborate (/img)
  for (const f of fs.readdirSync(USCITA)) if (f !== 'img') fs.rmSync(path.join(USCITA, f), { recursive: true, force: true });

  // file statici
  const css = fs.readFileSync(path.join(__dirname, 'stile.css'));
  const js = fs.readFileSync(path.join(__dirname, 'sito.js'));
  const versione = crypto.createHash('sha1').update(css).update(js).digest('hex').slice(0, 8);
  fs.writeFileSync(path.join(USCITA, 'stile.css'), css);
  fs.writeFileSync(path.join(USCITA, 'sito.js'), js);
  // logo e icona: copiati così come sono
  for (const k of ['logo', 'icona_sito']) {
    const v = sito.impostazioni[k];
    if (!v) continue;
    const src = path.join(RADICE, String(v).replace(/^\//, ''));
    if (!fs.existsSync(src)) { avviso(`Impostazioni: il file "${v}" (${k}) non esiste.`); continue; }
    const dest = path.join(USCITA, String(v).replace(/^\//, ''));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  // immagine predefinita per le anteprime social: la testata della home
  const home = sito.pagine.find((p) => p.id === 'home');
  const urlUsati = new Map();
  for (const p of sito.pagine) {
    if (urlUsati.has(p.url)) throw new ErroreContenuto(`Due pagine hanno lo stesso indirizzo ${p.url}: ${rel(urlUsati.get(p.url))} e ${rel(p.file)}.`);
    urlUsati.set(p.url, p.file);
  }
  const ordine = home ? [home, ...sito.pagine.filter((p) => p !== home)] : sito.pagine;
  for (const p of ordine) {
    const html = await costruisciPagina(p, sito, versione);
    if (p === home) sito.immagineSocialPredefinita = p.immagineSocial;
    const dest = p.url.endsWith('.html') ? path.join(USCITA, p.url) : path.join(USCITA, p.url, 'index.html');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);
  }

  // sitemap, robots, dominio
  const D = sito.impostazioni.dominio;
  if (D) {
    const url = sito.pagine.filter((p) => !vero(p.dati.nascondi_da_google) && !p.url.endsWith('.html'))
      .map((p) => `<url><loc>${D}${p.url}</loc></url>`).join('\n');
    fs.writeFileSync(path.join(USCITA, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${url}\n</urlset>\n`);
    fs.writeFileSync(path.join(USCITA, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${D}/sitemap.xml\n`);
    const host = D.replace(/^https?:\/\//, '');
    if (!/github\.io$/.test(host)) fs.writeFileSync(path.join(USCITA, 'CNAME'), host + '\n');
  }
  fs.writeFileSync(path.join(USCITA, '.nojekyll'), '');

  // rimuove le foto elaborate che non servono più
  const usate = new Set();
  for (const v of cacheImmagini.values()) { const r = await v; r.srcset.split(', ').forEach((x) => usate.add(x.split(' ')[0])); }
  const dirImg = path.join(USCITA, 'img');
  if (fs.existsSync(dirImg)) for (const f of fs.readdirSync(dirImg)) if (!usate.has('/img/' + f)) fs.rmSync(path.join(dirImg, f));

  console.log(`✔ Sito generato: ${sito.pagine.length} pagine, ${usate.size} immagini, in ${((Date.now() - inizio) / 1000).toFixed(1)} s`);
  if (avvisi.length) {
    console.log(`\n⚠ ${avvisi.length} avvisi (il sito è stato generato comunque):`);
    for (const a of [...new Set(avvisi)]) console.log('  - ' + a);
  }
  return avvisi;
}

/* -------------------------------------------------------------- anteprima locale */
function anteprima() {
  const porta = Number(process.env.PORTA || 8080);
  const tipi = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain' };
  http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    let f = path.join(USCITA, u);
    if (!f.startsWith(USCITA)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404, { 'Content-Type': tipi['.html'] }); const n = path.join(USCITA, '404.html'); return res.end(fs.existsSync(n) ? fs.readFileSync(n) : 'Pagina non trovata'); }
    res.writeHead(200, { 'Content-Type': tipi[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  }).listen(porta, () => console.log(`\nAnteprima: http://localhost:${porta}  (Ctrl+C per chiudere)\n`));
  let timer = null, inCorso = false;
  const ricostruisci = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (inCorso) return ricostruisci();
      inCorso = true;
      try { await costruisci(); } catch (e) { console.error('\n✖ ' + e.message); }
      inCorso = false;
    }, 300);
  };
  for (const d of [CONTENUTI, FOTO, __dirname]) fs.watch(d, { recursive: true }, ricostruisci);
}

(async () => {
  try {
    await costruisci();
    if (process.argv.includes('--anteprima')) anteprima();
  } catch (e) {
    console.error('\n✖ ' + (e instanceof ErroreContenuto ? e.message : e.stack));
    if (!process.argv.includes('--anteprima')) process.exit(1);
    anteprima();
  }
})();

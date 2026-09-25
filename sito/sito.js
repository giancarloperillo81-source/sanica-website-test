/* Sa.Ni.Ca. — menu su telefono, foto ingrandibili, caroselli */
(function () {
  // Menu su telefono
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.site-header .menu-toggle');
  if (header && toggle) {
    var closeMenu = function () {
      header.classList.remove('menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Apri il menu');
    };
    toggle.addEventListener('click', function () {
      var open = !header.classList.contains('menu-open');
      header.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
    });
    header.querySelectorAll('.mobile-menu a').forEach(function (a) { a.addEventListener('click', closeMenu); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  }

  // Caroselli: frecce avanti/indietro
  document.querySelectorAll('.carosello').forEach(function (c) {
    var pista = c.querySelector('.carosello-pista');
    var passo = function () { return Math.max(pista.clientWidth * 0.8, 240); };
    var p = c.querySelector('.car-prec'), s = c.querySelector('.car-succ');
    if (p) p.addEventListener('click', function () { pista.scrollBy({ left: -passo(), behavior: 'smooth' }); });
    if (s) s.addEventListener('click', function () { pista.scrollBy({ left: passo(), behavior: 'smooth' }); });
  });

  // Foto ingrandibili: un clic apre la foto a schermo intero, con frecce per scorrere la galleria
  var foto = Array.prototype.slice.call(document.querySelectorAll('[data-grande]'));
  if (!foto.length) return;
  var lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.innerHTML = '<img alt=""><button class="lb-chiudi" aria-label="Chiudi">✕</button>' +
    '<button class="lb-prec" aria-label="Foto precedente">‹</button><button class="lb-succ" aria-label="Foto successiva">›</button>' +
    '<div class="lb-didascalia"></div>';
  document.body.appendChild(lb);
  var img = lb.querySelector('img'), did = lb.querySelector('.lb-didascalia');
  var gruppo = [], indice = 0;
  function mostra(i) {
    indice = (i + gruppo.length) % gruppo.length;
    var el = gruppo[indice];
    img.src = el.getAttribute('data-grande');
    img.alt = el.getAttribute('alt') || '';
    did.textContent = el.getAttribute('data-didascalia') || '';
    var multi = gruppo.length > 1;
    lb.querySelector('.lb-prec').style.display = multi ? '' : 'none';
    lb.querySelector('.lb-succ').style.display = multi ? '' : 'none';
  }
  function apri(el) {
    var g = el.getAttribute('data-gruppo');
    gruppo = foto.filter(function (f) { return f.getAttribute('data-gruppo') === g; });
    mostra(gruppo.indexOf(el));
    lb.classList.add('aperto');
    document.body.style.overflow = 'hidden';
  }
  function chiudi() { lb.classList.remove('aperto'); document.body.style.overflow = ''; img.src = ''; }
  foto.forEach(function (el) { el.addEventListener('click', function () { apri(el); }); });
  lb.querySelector('.lb-chiudi').addEventListener('click', chiudi);
  lb.querySelector('.lb-prec').addEventListener('click', function (e) { e.stopPropagation(); mostra(indice - 1); });
  lb.querySelector('.lb-succ').addEventListener('click', function (e) { e.stopPropagation(); mostra(indice + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) chiudi(); });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('aperto')) return;
    if (e.key === 'Escape') chiudi();
    if (e.key === 'ArrowLeft') mostra(indice - 1);
    if (e.key === 'ArrowRight') mostra(indice + 1);
  });
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) mostra(indice + (dx < 0 ? 1 : -1));
    x0 = null;
  });
})();

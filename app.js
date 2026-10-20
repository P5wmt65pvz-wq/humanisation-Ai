/* Interface de l'humaniseur. Le moteur (moteur.js) ne touche jamais au document. */
(function () {
  'use strict';
  var H = window.Humaniseur;
  var $ = function (id) { return document.getElementById(id); };
  var etat = { refus: {}, dernier: null, surligner: true, minuteur: null };
  var LEGENDES = {
    leger: 'Retire seulement les restes de conversation et les ouvertures creuses.',
    standard: 'Le bon réglage pour presque tous les textes : formules lourdes, connecteurs en rafale, tirets, phrases trop longues.',
    fort: 'Va plus loin : registre plus courant, phrases coupées plus tôt, plus aucun tiret long.',
    complet: 'Réécriture maximale : vocabulaire simplifié, phrases très courtes reliées. Relisez le résultat.'
  };
  var EXEMPLE = "Bien sûr ! Voici un article sur le télétravail :\n\n## Le télétravail en 2026\n\n" +
    "Dans le monde d'aujourd'hui, le télétravail est un véritable game-changer — il transforme la façon dont les entreprises fonctionnent. " +
    "Il est important de noter que de nombreuses équipes ont adopté ce modèle afin de gagner en flexibilité. " +
    "De plus, les salariés économisent du temps. Par ailleurs, ils gagnent en autonomie. En outre, les coûts de bureau baissent. " +
    "Cependant, il convient de rester vigilant : l'isolement est un enjeu **crucial**.\n\n" +
    "En conclusion, le télétravail est ici pour rester. N'hésitez pas à me demander si vous souhaitez approfondir ! 🚀";

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function fmt(n, d) { return n.toLocaleString('fr-FR', { maximumFractionDigits: d || 0 }); }
  function nbMots(t) { return (t.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length; }
  function mot(n) { return fmt(n) + (n > 1 ? ' mots' : ' mot'); }
  function niveau() { return (document.querySelector('input[name=niveau]:checked') || {}).value || 'standard'; }
  function options() { return { intensite: niveau(), garderForme: $('forme').checked, corriger: $('corriger').checked, refus: etat.refus }; }

  function dessineSortie(r) {
    var box = $('sortie'); box.textContent = '';
    if (!etat.surligner || !r.marques.length) { box.textContent = r.texte; return; }
    var cur = 0;
    r.marques.forEach(function (m) {
      if (m.deb > cur) box.appendChild(document.createTextNode(r.texte.slice(cur, m.deb)));
      if (m.fin > m.deb) box.appendChild(el('mark', null, r.texte.slice(m.deb, m.fin)));
      cur = Math.max(cur, m.fin);
    });
    if (cur < r.texte.length) box.appendChild(document.createTextNode(r.texte.slice(cur)));
  }

  function dessineChiffres(r) {
    var ul = $('chiffres'); ul.textContent = '';
    [['Tics repérés', fmt(r.ticsAvant), fmt(r.ticsApres)],
     ['Variation du rythme', fmt(r.avant.variation, 2), fmt(r.apres.variation, 2)],
     ['Phrase la plus longue', fmt(r.avant.plusLongue) + ' mots', fmt(r.apres.plusLongue) + ' mots'],
     ['Mots', fmt(r.avant.mots), fmt(r.apres.mots)]].forEach(function (l) {
      var li = el('li'); li.appendChild(el('small', null, l[0]));
      var b = el('b'); b.textContent = l[1] + ' → ' + l[2]; li.appendChild(b); ul.appendChild(li);
    });
  }

  function dessineModifs(ops) {
    var host = $('modifs'); host.textContent = '';
    $('titre-modifs').textContent = ops.length
      ? 'Voir les ' + fmt(ops.length) + (ops.length > 1 ? ' changements' : ' changement') + ' (et en refuser)'
      : 'Aucun changement à ce réglage';
    var par = {};
    ops.forEach(function (o) { (par[o.cat] = par[o.cat] || []).push(o); });
    Object.keys(H.CATEGORIES).forEach(function (c) {
      if (!par[c]) return;
      var d = el('details', 'groupe'); d.open = true;
      var s = el('summary', null, H.CATEGORIES[c].label); s.appendChild(el('span', null, String(par[c].length))); d.appendChild(s);
      var ul = el('ul');
      par[c].forEach(function (o) {
        var li = el('li'), lab = el('label'), cb = el('input');
        cb.type = 'checkbox'; cb.checked = !etat.refus[o.id];
        cb.addEventListener('change', function () { if (cb.checked) delete etat.refus[o.id]; else etat.refus[o.id] = true; majSortie(); });
        lab.appendChild(cb);
        var t = el('span'), vis = function (x) { return x.replace(/\n/g, '↵').trim() || '∅'; };
        t.appendChild(el('del', null, vis(o.avant))); t.appendChild(document.createTextNode(' → '));
        t.appendChild(o.apres.trim() ? el('ins', null, vis(o.apres)) : el('i', null, 'supprimé'));
        lab.appendChild(t); li.appendChild(lab); li.appendChild(el('span', 'pourquoi', o.pourquoi)); ul.appendChild(li);
      });
      d.appendChild(ul); host.appendChild(d);
    });
  }

  function dessineSignaux(sig) {
    var host = $('signaux'); host.textContent = '';
    $('signaux-bloc').hidden = !sig.length;
    sig.forEach(function (s) {
      var a = el('article'); a.appendChild(el('h3', null, s.titre));
      if (s.extrait) a.appendChild(el('blockquote', null, s.extrait));
      a.appendChild(el('p', null, s.conseil)); host.appendChild(a);
    });
  }

  function majSortie() {
    var r = H.analyse($('entree').value, options());
    etat.dernier = r;
    dessineSortie(r); dessineChiffres(r); dessineSignaux(r.signalements);
    var n = r.operations.length - Object.keys(etat.refus).length;
    $('compte-sortie').textContent = mot(r.apres.mots);
    $('resume').textContent = n > 0
      ? fmt(n) + (n > 1 ? ' changements appliqués' : ' changement appliqué') + ' · ' + mot(r.avant.mots) + ' → ' + mot(r.apres.mots)
      : 'Rien à changer à ce réglage : essayez « Marqué » ou « Maximum ».';
    $('copier').disabled = !r.texte;
  }

  function humaniser() {
    clearTimeout(etat.minuteur);
    var txt = $('entree').value;
    if (!/\S/.test(txt)) { vide(); $('entree').focus(); return; }
    etat.refus = {};
    dessineModifs(H.operations(txt, options()));
    $('details').hidden = false;
    majSortie();
    if (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) {
      $('volet-sortie').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function vide() {
    etat.dernier = null; etat.refus = {};
    $('details').hidden = true; $('resume').textContent = ''; $('compte-sortie').textContent = '';
    $('sortie').textContent = '';
    $('sortie').appendChild(el('p', 'vide', 'Le résultat apparaît ici, tout seul, dès que vous avez collé un texte.'));
    $('copier').disabled = true;
  }

  function copier() {
    var b = $('copier'); if (!etat.dernier) return;
    var fin = function (ok) {
      b.textContent = ok ? 'Copié ✓' : 'Sélectionnez le texte puis copiez-le';
      setTimeout(function () { b.textContent = '3 · Copier le texte'; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(etat.dernier.texte).then(function () { fin(true); }, function () { fin(false); });
    else fin(false);
  }

  function remplir(txt) {
    $('entree').value = txt;
    $('compte-entree').textContent = mot(nbMots(txt));
    humaniser();
  }

  function legende() { $('legende-force').textContent = LEGENDES[niveau()]; }

  $('entree').addEventListener('input', function () {
    $('compte-entree').textContent = mot(nbMots(this.value));
    /* Pendant la frappe, on attend une pause avant de réécrire. */
    clearTimeout(etat.minuteur);
    if (/\S/.test(this.value)) etat.minuteur = setTimeout(humaniser, 900); else vide();
  });
  /* Un collage est un geste net : le résultat suit tout de suite. */
  $('entree').addEventListener('paste', function () { setTimeout(function () { $('entree').dispatchEvent(new Event('input')); clearTimeout(etat.minuteur); humaniser(); }, 0); });
  $('go').addEventListener('click', humaniser);
  $('copier').addEventListener('click', copier);
  $('exemple').addEventListener('click', function () { remplir(EXEMPLE); });
  $('coller').addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (t) { if (t) remplir(t); else $('entree').focus(); }, function () { $('entree').focus(); });
    } else $('entree').focus();
  });
  $('vider').addEventListener('click', function () { $('entree').value = ''; $('compte-entree').textContent = '0 mot'; vide(); $('entree').focus(); });
  $('surligner').addEventListener('change', function () { etat.surligner = this.checked; if (etat.dernier) dessineSortie(etat.dernier); });
  Array.prototype.forEach.call(document.querySelectorAll('input[name=niveau], #forme, #corriger'), function (i) {
    i.addEventListener('change', function () { legende(); if (/\S/.test($('entree').value)) humaniser(); });
  });
  legende();
})();

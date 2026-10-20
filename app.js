/* Interface de l'humaniseur. Le moteur (moteur.js) ne touche jamais au document. */
(function () {
  'use strict';
  var H = window.Humaniseur;
  var $ = function (id) { return document.getElementById(id); };
  var etat = { refus: {}, dernier: null, surligner: true };
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
  function options() {
    return { intensite: (document.querySelector('input[name=niveau]:checked') || {}).value || 'standard',
             garderForme: $('forme').checked, refus: etat.refus };
  }

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
    $('titre-modifs').textContent = ops.length ? fmt(ops.length) + (ops.length > 1 ? ' changements' : ' changement') : 'Aucun changement';
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
    $('compte-sortie').textContent = mot(r.apres.mots);
    $('copier').disabled = !r.texte;
  }

  function humaniser() {
    var txt = $('entree').value;
    if (!/\S/.test(txt)) { $('entree').focus(); return; }
    etat.refus = {};
    dessineModifs(H.operations(txt, options()));
    $('details').hidden = false;
    majSortie();
    $('volet-sortie').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function copier() {
    var b = $('copier'); if (!etat.dernier) return;
    var fin = function (ok) { b.textContent = ok ? 'Copié ✓' : 'Sélectionnez puis copiez'; setTimeout(function () { b.textContent = 'Copier'; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(etat.dernier.texte).then(function () { fin(true); }, function () { fin(false); });
    else fin(false);
  }

  $('entree').addEventListener('input', function () { $('compte-entree').textContent = mot(nbMots(this.value)); });
  $('go').addEventListener('click', humaniser);
  $('copier').addEventListener('click', copier);
  $('exemple').addEventListener('click', function () { $('entree').value = EXEMPLE; $('compte-entree').textContent = mot(nbMots(EXEMPLE)); humaniser(); });
  $('vider').addEventListener('click', function () {
    $('entree').value = ''; $('compte-entree').textContent = '0 mot'; $('details').hidden = true; etat.dernier = null;
    $('sortie').textContent = ''; $('sortie').appendChild(el('p', 'vide', 'Le résultat apparaît ici.')); $('compte-sortie').textContent = ''; $('copier').disabled = true; $('entree').focus();
  });
  $('surligner').addEventListener('change', function () { etat.surligner = this.checked; if (etat.dernier) dessineSortie(etat.dernier); });
  Array.prototype.forEach.call(document.querySelectorAll('input[name=niveau], #forme'), function (i) {
    i.addEventListener('change', function () { if (etat.dernier) humaniser(); });
  });
})();

/*!
 * Humaniseur — retire d'un texte les tics d'écriture qui trahissent une rédaction
 * automatique, et dit ce que seul l'auteur peut encore y mettre.
 *
 * Tout se passe dans le navigateur : le texte n'est envoyé nulle part.
 *
 * Le moteur est en fonctions pures (texte -> objet), testables sous Node.
 * Il ne réécrit pas « à la façon d'un humain » : il applique des règles
 * connues, visibles une à une, que l'on peut refuser une à une. Rien n'est
 * promis sur le verdict d'un détecteur d'IA : ce n'est pas ce qu'il mesure.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Humaniseur = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Intensité : 1 = léger, 2 = standard, 3 = fort, 4 = complet. Une règle de niveau n ne
     s'applique qu'à partir de l'intensité n. */
  var NIVEAUX = { leger: 1, standard: 2, fort: 3, complet: 4 };

  var CATEGORIES = {
    faute:  { label: 'Fautes corrigées', aide: 'Fautes d\'orthographe courantes, espaces et majuscules oubliées, mots répétés.' },
    robot:  { label: 'Restes de conversation', aide: 'Phrases d\'assistant collées avec le texte : « Bien sûr ! », « N\'hésitez pas… ».' },
    creux:  { label: 'Formules creuses', aide: 'Des mots qui occupent la place sans rien apprendre au lecteur.' },
    lourd:  { label: 'Tournures lourdes', aide: 'Un mot courant dit la même chose.' },
    liaison:{ label: 'Connecteurs en rafale', aide: 'Quand chaque phrase s\'ouvre sur un connecteur, le rythme devient mécanique.' },
    tiret:  { label: 'Tirets cadratins', aide: 'Un texte qui en abuse se reconnaît de loin.' },
    format: { label: 'Mise en forme', aide: 'Gras, titres et pictogrammes ajoutés par réflexe.' },
    rythme: { label: 'Rythme des phrases', aide: 'Les phrases très longues sont coupées où la grammaire le permet ; au niveau complet, deux phrases très courtes à la suite sont reliées.' },
    mots:   { label: 'Vocabulaire plus simple', aide: 'Un mot ou une tournure de la langue courante à la place d\'une formule de rapport.' }
  };

  /* Bornes de mot qui comprennent les lettres accentuées, ce que \b ne fait
     pas : « été » contient un \b au milieu avec les règles par défaut. */
  var D = '(?<![\\p{L}\\p{N}])';
  var F = '(?![\\p{L}\\p{N}])';
  var APO = '[\'’]';

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function minus(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function mots(s) { return (String(s || '').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length; }

  /* Reprend la casse de l'initiale du texte remplacé. */
  function calque(orig, rempl) {
    if (!rempl) return rempl;
    var c = orig.charAt(0);
    return c !== c.toLowerCase() ? cap(rempl) : rempl;
  }

  /* ---------------------------------------------------------------- règles
     Une règle : { id, cat, niveau, re, deb, vers, pourquoi }
       re     expression (drapeaux g, i, u ajoutés)
       deb    true → ne joue qu'en tête de phrase
       vers   texte de remplacement, ou fonction(match) ; '' supprime
     En tête de phrase, la suppression capitalise ce qui suit ; au milieu,
     elle reprend la ponctuation environnante. */

  var REGLES = [
    /* ---- restes de conversation : niveau 1, jamais ambigus */
    { id: 'intro-assistant', cat: 'robot', niveau: 1, deb: true, ligne: true,
      re: '(?:Bien s[uû]r|Certainement|Absolument|Avec plaisir|Tout de suite|Voici)[^\\n]{0,160}?[!:]\\s*(?:\\n|$)',
      cond: function (m, txt, pos) { return pos === 0 && /^(?:Bien|Certain|Absol|Avec|Tout|Voici)/i.test(m[0]); },
      vers: '',
      pourquoi: 'Ligne d\'accueil d\'un assistant, sans rapport avec le texte lui-même.' },
    { id: 'outro-hesitez', cat: 'robot', niveau: 1, phrase: true,
      re: 'N' + APO + 'h[ée]sitez pas [àa][^.!?\\n]{0,300}[.!?]',
      vers: '', pourquoi: 'Formule de fin de réponse d\'assistant.' },
    { id: 'outro-esperer', cat: 'robot', niveau: 1, phrase: true,
      re: 'J' + APO + 'esp[èe]re que (?:cela|ça|ce texte|cette r[ée]ponse|ces informations|ces conseils)[^.!?\\n]{0,300}[.!?]',
      vers: '', pourquoi: 'Formule de fin de réponse d\'assistant.' },
    { id: 'outro-dites-moi', cat: 'robot', niveau: 1, phrase: true,
      re: '(?:Dites-moi si|Si vous (?:souhaitez|voulez|avez besoin)[^.!?\\n]{0,80}(?:je peux|je serai|dites-moi|n' + APO + 'h[ée]sitez))[^.!?\\n]{0,300}[.!?]',
      vers: '', pourquoi: 'Offre de service d\'assistant, pas du contenu.' },
    { id: 'en-tant-qu-ia', cat: 'robot', niveau: 1, phrase: true,
      re: 'En tant (?:qu' + APO + 'IA|qu' + APO + 'intelligence artificielle|que mod[èe]le de langage)[^.!?\\n]{0,300}[.!?]',
      vers: '', pourquoi: 'Une phrase sur la machine elle-même, jamais voulue dans un texte publié.' },

    /* ---- formules creuses */
    { id: 'monde-aujourdhui', cat: 'creux', niveau: 1, deb: true,
      re: '(?:Dans le monde (?:d' + APO + 'aujourd' + APO + 'hui|actuel|moderne)|Dans un monde (?:en constante (?:[ée]volution|mutation)|de plus en plus [\\p{L}]+)|[ÀA] l' + APO + '(?:[èe]re|heure) (?:du num[ée]rique|de l' + APO + 'intelligence artificielle|du digital)|Dans un paysage (?:num[ée]rique )?en constante [ée]volution)\\s*,\\s*',
      vers: '', pourquoi: 'Ouverture passe-partout : elle pourrait précéder n\'importe quel sujet.' },
    { id: 'il-est-important', cat: 'creux', niveau: 1, deb: true,
      re: '(?:Il (?:est|convient|faut) (?:important |essentiel |crucial |primordial |fondamental |utile )?(?:de )?(?:noter|souligner|rappeler|pr[ée]ciser|mentionner|signaler|garder (?:\\p{L}+ )?(?:à l' + APO + 'esprit))|Il est [àa] noter|Notons|Soulignons|Rappelons|Force est de constater) que\\s+',
      vers: '', pourquoi: 'Annoncer qu\'une chose est importante ne la rend pas importante : dites-la.' },
    { id: 'il-est-important-comprendre', cat: 'creux', niveau: 1, deb: true,
      re: 'Il est (?:important|essentiel|crucial) de (?:comprendre|savoir|retenir|garder en t[êe]te) que\\s+',
      vers: '', pourquoi: 'Annoncer qu\'une chose est importante ne la rend pas importante : dites-la.' },
    { id: 'conclusion', cat: 'creux', niveau: 2, deb: true,
      re: '(?:En conclusion|En r[ée]sum[ée]|En somme|Pour conclure|Pour r[ée]sumer|En d[ée]finitive|En fin de compte|Au final|Pour finir|En bref)\\s*,\\s*',
      vers: '', pourquoi: 'Le paragraphe de conclusion qui répète ce qui vient d\'être dit est un réflexe de rédaction automatique.' },
    { id: 'cela-etant-dit', cat: 'creux', niveau: 2, deb: true,
      re: 'Cela [ée]tant dit\\s*,\\s*', vers: 'Mais ',
      pourquoi: 'Le même sens, en deux mots de moins.' },
    { id: 'dans-cet-article', cat: 'creux', niveau: 2, deb: true, phrase: true,
      re: 'Dans (?:cet article|ce guide|ce texte|cette section|ce billet|cette page)\\s*,?\\s*(?:nous|je) (?:allons|verrons|vais|explorerons|d[ée]couvrirons|examinerons)[^.!?\\n]{0,300}[.!?]',
      vers: '', pourquoi: 'Une phrase qui annonce le texte au lieu de le commencer.' },
    { id: 'plongeons', cat: 'creux', niveau: 3, deb: true, phrase: true,
      re: '(?:Plongeons|Explorons|D[ée]couvrons|Examinons|D[ée]cryptons)[^.!?\\n]{0,60}(?:ensemble|dans le vif du sujet|de plus pr[èe]s|plus en d[ée]tail|en d[ée]tail)[^.!?\\n]{0,40}[.!?]',
      vers: '', pourquoi: 'Transition d\'animateur : le lecteur est déjà là.' },
    { id: 'veritable', cat: 'creux', niveau: 3,
      re: '(?<=(?:^|[^\\p{L}])(?:un|une|de|des|du|le|la|les|ce|cette|ces) )v[ée]ritables? ',
      vers: '', pourquoi: '« Un véritable défi » dit la même chose que « un défi », avec plus de bruit.' },


    /* ---- vocabulaire : la langue courante à la place du rapport */
    { id: 'met-en-lumiere', cat: 'mots', niveau: 3, re: D + '(met|mettent|mettre|mettant) en lumi[èe]re' + F,
      vers: function (m) { return { met: 'montre', mettent: 'montrent', mettre: 'montrer', mettant: 'montrant' }[m[1].toLowerCase()]; },
      pourquoi: '« Montrer » est plus direct.' },
    { id: 'en-mesure', cat: 'mots', niveau: 3, re: D + '(est|sont|[êe]tre) en mesure de ',
      vers: function (m) { return { est: 'peut ', sont: 'peuvent ' }[m[1].toLowerCase()] || 'pouvoir '; },
      pourquoi: '« Pouvoir » dit la même chose en moins de mots.' },
    { id: 'a-pour-but', cat: 'mots', niveau: 3, re: D + '(a|ont) pour (?:but|objectif) (?:de|d' + APO + ')\\s*',
      vers: function (m) { return m[1].toLowerCase() === 'a' ? 'vise \u00e0 ' : 'visent \u00e0 '; },
      pourquoi: '« Viser à » est plus court.' },
    { id: 'par-le-biais', cat: 'mots', niveau: 3, re: D + 'par le biais (?:de la|de l' + APO + '|du|des)' + F + '\\s*',
      vers: function (m) { var t = m[0].toLowerCase(); return /de la/.test(t) ? 'par la ' : /de l/.test(t) ? 'par l\'' : /du/.test(t) ? 'par le ' : 'par les '; },
      pourquoi: '« Par » suffit.' },
    { id: 'ainsi-que', cat: 'mots', niveau: 4, re: D + 'ainsi que' + F, vers: 'et',
      pourquoi: '« Et » suffit.' },
    { id: 'il-existe', cat: 'mots', niveau: 3, re: D + 'il existe (?=(?:de |des |un |une |plusieurs|diff))', vers: 'il y a ',
      pourquoi: '« Il y a » est de la langue parlée.' },
    { id: 'eventail', cat: 'mots', niveau: 4, re: D + 'un (?:large |vaste )?[ée]ventail de' + F, vers: 'toute une série de',
      pourquoi: 'Une image de moins.' },
    { id: 'nombreuses-reprises', cat: 'mots', niveau: 3, re: D + '[àa] de nombreuses reprises' + F, vers: 'souvent',
      pourquoi: 'Un mot pour quatre.' },
    { id: 'de-maniere', cat: 'mots', niveau: 4, re: D + 'de (?:mani[èe]re|fa[çc]on) (?:tr[èe]s )?(efficace|significative|optimale|r[ée]guli[èe]re)' + F,
      vers: function (m) { return { efficace: 'efficacement', significative: 'nettement', optimale: 'au mieux', 'régulière': 'régulièrement', 'reguliere': 'régulièrement' }[m[1].toLowerCase()]; },
      pourquoi: 'Un adverbe dit la même chose.' },
    { id: 'il-s-avere', cat: 'mots', niveau: 4, re: D + 'il s' + APO + 'av[èe]re que' + F, vers: 'en fait,',
      pourquoi: 'Plus parlé.' },
    { id: 'cependant-mid', cat: 'mots', niveau: 4, re: ',\\s*cependant\\s*,\\s*', vers: ', mais ',
      pourquoi: '« Mais » est le connecteur de la parole.' },

    /* ---- tournures lourdes */
    { id: 'crucial', cat: 'lourd', niveau: 2,
      re: D + '(crucia|primordia)(l|le|ux|les)' + F,
      vers: function (m) { return 'important' + (m[2] === 'le' ? 'e' : m[2] === 'ux' ? 's' : m[2] === 'les' ? 'es' : ''); },
      pourquoi: 'Un adjectif d\'alerte à chaque ligne finit par ne plus alerter.' },
    { id: 'afin-de', cat: 'lourd', niveau: 2, re: D + 'afin (de|d' + APO + '|que|qu' + APO + ')',
      vers: function (m) { var s = m[1].toLowerCase(); return s === 'de' ? 'pour' : s.charAt(0) === 'd' ? 'pour ' : s === 'que' ? 'pour que' : 'pour qu\''; },
      pourquoi: '« Pour » suffit.' },
    { id: 'dans-le-but', cat: 'lourd', niveau: 2, re: D + 'dans le but (?:de|d' + APO + ')\\s*', vers: 'pour ',
      pourquoi: '« Pour » suffit.' },
    { id: 'heure-actuelle', cat: 'lourd', niveau: 2, re: D + '[àa] l' + APO + 'heure actuelle' + F, vers: 'aujourd\'hui',
      pourquoi: 'Quatre mots pour un.' },
    { id: 'du-fait', cat: 'lourd', niveau: 2, re: D + 'en raison du fait que' + F, vers: 'parce que',
      pourquoi: 'Quatre mots pour deux.' },
    { id: 'malgre-le-fait', cat: 'lourd', niveau: 2, re: D + 'malgr[ée] le fait que' + F, vers: 'bien que',
      pourquoi: 'Même sens, même mode du verbe, trois mots de moins.' },
    { id: 'grand-nombre', cat: 'lourd', niveau: 2, re: D + 'un (?:tr[èe]s )?grand nombre de' + F, vers: 'beaucoup de',
      pourquoi: 'Un mot courant.' },
    { id: 'multitude', cat: 'lourd', niveau: 3, re: D + 'une multitude de' + F, vers: 'beaucoup de',
      pourquoi: 'Un mot courant.' },
    { id: 'grande-majorite', cat: 'lourd', niveau: 3, re: D + 'la (?:tr[èe]s )?grande majorit[ée] des' + F, vers: 'la plupart des',
      pourquoi: 'Un mot courant.' },
    { id: 'il-faut', cat: 'lourd', niveau: 2, re: D + 'il (?:est n[ée]cessaire|convient) de (?!ne )', vers: 'il faut ',
      pourquoi: '« Il faut » dit la même chose, plus court.' },
    { id: 'il-est-possible', cat: 'lourd', niveau: 3, re: D + 'il est possible de (?!ne )', vers: 'on peut ',
      pourquoi: '« On peut » dit la même chose, plus court.' },
    { id: 'au-sein', cat: 'lourd', niveau: 3,
      re: D + 'au sein (de la|de l' + APO + '|du|des|de)' + F + '\\s*',
      vers: function (m) { var t = m[1].toLowerCase(); return t === 'de la' ? 'dans la ' : t === 'du' ? 'dans le ' : t === 'des' ? 'dans les ' : t === 'de' ? 'dans ' : 'dans l\''; },
      pourquoi: '« Dans » suffit.' },
    { id: 'cependant', cat: 'lourd', niveau: 3, deb: true, re: '(?:Cependant|Toutefois)\\s*,\\s*', vers: 'Mais ',
      pourquoi: 'Un connecteur de rapport administratif ; « mais » est celui de la parole.' },
    { id: 'neanmoins', cat: 'lourd', niveau: 3, deb: true, re: 'N[ée]anmoins\\s*,\\s*', vers: 'Pourtant, ',
      pourquoi: 'Un connecteur de rapport administratif.' },
    { id: 'par-consequent', cat: 'lourd', niveau: 3, deb: true, re: 'Par cons[ée]quent\\s*,\\s*', vers: 'Donc ',
      pourquoi: '« Donc » dit la même chose en deux syllabes.' }
  ];

  /* Connecteurs additifs de tête de phrase. Ils sont supprimés seulement quand
     ils se suivent : un seul « de plus » est une phrase normale. */
  var CONNECTEURS = '(?:De plus|En outre|Par ailleurs|De surcro[iî]t|En effet|Ainsi|Egalement|Également|Aussi)';

  /* Une réserve de tirets que l'on tolère, par intensité. */
  /* Début d'une proposition indépendante : pronom sujet. */
  var SUJET = /^(?:il|elle|ils|elles|on|ce|cela|ça|c['’])(?![\p{L}])/iu;

  var BUDGET_TIRETS = { 1: 2, 2: 1, 3: 0, 4: 0 };

  /* ------------------------------------------------------------ phrases */

  /* Lecture « collée » à partir d'une position : pas de copie du reste du
     texte, donc pas de coût quadratique sur un long texte. */
  var SUIVANT = /\s+(\S)/y;
  var BLANC_FIN = /[ \t]*\n?/y;

  var ABREV = /(?:^|[^\p{L}])(?:M|Mme|Mlle|Dr|Pr|St|Ste|cf|vs|env|etc|fig|art|chap)\.$/u;

  /* Découpe en phrases : {deb, fin} sur le texte d'origine. Une fin de phrase
     est un . ! ? … suivi d'un blanc puis d'une majuscule, d'un chiffre ou d'un
     guillemet ; ou une fin de ligne. Une abréviation connue ne la termine pas. */
  function phrases(txt) {
    txt = String(txt == null ? '' : txt);
    var out = [], deb = 0, re = /(?<![.!?…])[.!?…]+["»”)\]]*(?=\s)|\n+/gu, m;
    while ((m = re.exec(txt))) {
      var fin = m.index + m[0].length;
      if (m[0].charAt(0) !== '\n') {
        SUIVANT.lastIndex = fin;
        var apres = SUIVANT.exec(txt);
        if (!apres) continue;
        if (!/[\p{Lu}\p{N}"«“(\-—•*#]/u.test(apres[1]) && txt.charAt(fin) !== '\n') continue;
        if (ABREV.test(txt.slice(Math.max(0, m.index - 12), m.index + 1))) continue;
      }
      var seg = txt.slice(deb, fin);
      if (/\S/.test(seg)) out.push({ deb: deb + (seg.length - seg.replace(/^\s+/, '').length), fin: fin });
      deb = fin;
    }
    var reste = txt.slice(deb);
    if (/\S/.test(reste)) out.push({ deb: deb + (reste.length - reste.replace(/^\s+/, '').length), fin: txt.length });
    return out.map(function (p) {
      var fin = p.fin;
      while (fin > p.deb && /\s/.test(txt.charAt(fin - 1))) fin--;
      return { deb: p.deb, fin: fin, texte: txt.slice(p.deb, fin) };
    });
  }

  /* Position de début de phrase ? Début de texte ou de ligne, après . ! ? …,
     ou après un marqueur de liste. Les guillemets et parenthèses ouvrants
     sont traversés. Itératif : une entrée hostile ne doit pas empiler. */
  function enTete(txt, pos) {
    var i = pos - 1;
    while (i >= 0 && /[ \t"«»“”(]/.test(txt.charAt(i))) i--;
    if (i < 0) return true;
    var c = txt.charAt(i);
    if (c === '\n' || /[.!?…]/.test(c)) return true;
    if (/[-•*–—]/.test(c)) {
      var j = i - 1;
      while (j >= 0 && /[ \t]/.test(txt.charAt(j))) j--;
      return j < 0 || txt.charAt(j) === '\n';
    }
    return false;
  }

  /* ------------------------------------------------------------ opérations
     Une opération : { id, rule, cat, deb, fin, avant, apres, pourquoi }.
     Les opérations sont calculées sur le texte d'ORIGINE et ne se chevauchent
     pas ; appliquer ou non chacune est indépendant des autres. */

  REGLES.forEach(function (r) {
    r.rg = new RegExp(r.re, 'giu');   // balayage du texte
    r.rs = new RegExp(r.re, 'iuy');   // lecture à une position précise
  });

  /* Construit l'opération d'une règle pour un résultat donné, ou null. */
  function fabrique(r, m, txt, tete) {
    var deb = m.index, fin = m.index + m[0].length;
    if (r.cond && !r.cond(m, txt, deb)) return null;
    var vers = typeof r.vers === 'function' ? r.vers(m) : r.vers;
    var avant = m[0], apres = vers, maj = false;

    if (r.phrase || r.ligne) {
      /* On avale aussi le blanc qui suit, pour ne pas laisser un trou ; un
         saut de ligne, lui, est gardé. */
      BLANC_FIN.lastIndex = fin;
      var suite = BLANC_FIN.exec(txt)[0];
      if (r.phrase && !/\n/.test(suite)) { fin += suite.length; avant += suite; }
    } else if (tete && r.deb) {
      /* En tête de phrase, ce qui suit prend la majuscule. */
      if (apres === '') maj = true; else apres = cap(apres);
    } else if (apres !== '') {
      apres = calque(m[0], apres);
    }
    if (apres === avant) return null;
    return { rule: r.id, cat: r.cat, deb: deb, fin: fin, avant: avant, apres: apres, maj: maj, pourquoi: r.pourquoi, niveau: r.niveau };
  }

  function opsDesRegles(txt, niveau) {
    var ops = [], pris = {};
    REGLES.forEach(function (r) {
      if (r.niveau > niveau) return;
      var re = r.rg, m;
      re.lastIndex = 0;
      while ((m = re.exec(txt))) {
        if (!m[0]) { re.lastIndex++; continue; }
        var tete = enTete(txt, m.index);
        if (r.deb && !tete) continue;
        var o = fabrique(r, m, txt, tete);
        if (o) { ops.push(o); pris[o.deb] = true; }
      }
    });
    /* Ouvertures en chaîne : « Dans le monde d'aujourd'hui, il est important
       de noter que… ». Une fois la première retirée, la seconde se retrouve en
       tête de phrase : on la cherche tout de suite, sinon un second passage
       trouverait encore quelque chose. */
    var file = ops.filter(function (o) { return o.maj; });
    while (file.length) {
      var cur = file.pop();
      REGLES.forEach(function (r) {
        if (!r.deb || r.niveau > niveau || pris[cur.fin]) return;
        r.rs.lastIndex = cur.fin;
        var m = r.rs.exec(txt);
        if (!m || !m[0]) return;
        var o = fabrique(r, m, txt, true);
        if (!o) return;
        ops.push(o); pris[o.deb] = true;
        if (o.maj) file.push(o);
      });
    }
    return ops;
  }

  /* Tirets cadratins. Un tiret en tête de ligne (dialogue, puce) n'est jamais
     touché. Deux tirets dans une même phrase font une incise : ils sont
     remplacés ensemble par des virgules. */
  function opsTirets(txt, niveau) {
    var ops = [], budget = BUDGET_TIRETS[niveau], re = /—/g, m, trouves = [];
    while ((m = re.exec(txt))) {
      var k = m.index - 1;
      while (k >= 0 && (txt.charAt(k) === ' ' || txt.charAt(k) === '\t')) k--;
      if (k < 0 || txt.charAt(k) === '\n') continue;   // tiret de dialogue ou de liste
      trouves.push(m.index);
    }
    var unites = [], i = 0;
    while (i < trouves.length) {
      var a = trouves[i], b = trouves[i + 1];
      if (b !== undefined && !/[.!?\n]/.test(txt.slice(a, b))) { unites.push([a, b]); i += 2; }
      else { unites.push([a]); i++; }
    }
    unites.forEach(function (u, k) {
      if (k < budget) return;
      u.forEach(function (pos, rang) {
        var deb = pos, fin = pos + 1;
        while (deb > 0 && /[ \t]/.test(txt.charAt(deb - 1))) deb--;
        while (fin < txt.length && /[ \t]/.test(txt.charAt(fin))) fin++;
        var av = txt.charAt(deb - 1), ap = txt.charAt(fin);
        var rien = /[,;:.!?(]/.test(av) || /[,;:.!?)]/.test(ap) || ap === '' || ap === '\n';
        var apres = rien ? (ap === '' || ap === '\n' || /[,;:.!?)]/.test(ap) ? '' : ' ') : ', ';
        /* Un tiret seul devant une proposition qui a son propre sujet ouvre
           en réalité une nouvelle phrase : une virgule ferait un collage. */
        var tete = u.length === 1 && !rien && SUJET.test(txt.slice(fin, fin + 12));
        var cible = txt.slice(deb, fin);
        if (tete) apres = '. ';
        ops.push({ rule: 'tiret', cat: 'tiret', deb: deb, fin: fin, avant: cible, apres: apres, maj: !!tete,
          pourquoi: u.length === 2 ? 'Une incise entre deux tirets devient une incise entre virgules.' : 'Une virgule fait le même travail.', niveau: 1 });
      });
    });
    return ops;
  }

  /* Mise en forme : gras, titres, pictogrammes. */
  var PICTO = /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{2705}\u{274C}][️‍]*)+[ \t]?/gu;
  function opsFormat(txt) {
    var ops = [], m, re;
    re = /(\*\*|__)(?=\S)([^\n]*?\S)\1/g;
    while ((m = re.exec(txt))) {
      ops.push({ rule: 'gras', cat: 'format', deb: m.index, fin: m.index + m[0].length, avant: m[0], apres: m[2],
        pourquoi: 'Le gras partout ne met plus rien en valeur.', niveau: 2 });
    }
    re = /^(#{1,6})[ \t]+/gm;
    while ((m = re.exec(txt))) {
      ops.push({ rule: 'titre', cat: 'format', deb: m.index, fin: m.index + m[0].length, avant: m[0], apres: '',
        pourquoi: 'Marque de titre Markdown, illisible hors d\'un éditeur qui la rend.', niveau: 2 });
    }
    re = new RegExp(PICTO.source, 'gu');
    while ((m = re.exec(txt))) {
      ops.push({ rule: 'pictogramme', cat: 'format', deb: m.index, fin: m.index + m[0].length, avant: m[0], apres: '',
        pourquoi: 'Pictogramme de décoration.', niveau: 2 });
    }
    return ops;
  }

  /* Connecteurs en rafale : un connecteur additif est retiré quand l'une des
     phrases précédentes en porte déjà un. Fenêtre : 2 phrases (standard),
     4 (fort). Le niveau léger n'y touche pas. */
  function opsLiaison(txt, niveau) {
    if (niveau < 2) return [];
    var fenetre = niveau === 2 ? 2 : 4, ph = phrases(txt), ops = [], dernier = -99;
    var re = new RegExp('^' + CONNECTEURS + '\\s*,\\s*(?=\\S)', 'iu');
    ph.forEach(function (p, i) {
      var m = p.texte.match(re);
      if (!m) return;
      if (i - dernier <= fenetre) {
        ops.push({ rule: 'rafale', cat: 'liaison', deb: p.deb, fin: p.deb + m[0].length, avant: m[0],
          apres: '', maj: true, niveau: 2,
          pourquoi: 'Un connecteur ouvrait déjà l\'une des phrases d\'avant : un de moins respire mieux.' });
      } else dernier = i;
    });
    return ops;
  }

  /* Phrases très longues, coupées à un point de grammaire sûr. */
  var LIMITE_COUPE = { 2: 38, 3: 26, 4: 22 };
  /* Deux phrases très courtes à la suite, dans le même paragraphe, sont reliées
     par « , et » : une rafale de phrases de quatre mots sonne comme une liste.
     Niveau complet seulement, une fusion sur trois phrases au plus, et
     seulement quand la seconde s'ouvre sur un mot-outil (la minuscule ne peut
     alors pas défaire un nom propre). */
  var OUTIL = /^(?:le|la|les|l['’]|un|une|des|ils|elles|il|elle|on|nous|vous|cela|ça)(?![\p{L}])/iu;
  function opsFusion(txt, niveau) {
    if (niveau < 4) return [];
    var ph = phrases(txt), ops = [], dernier = -9;
    for (var i = 0; i + 1 < ph.length; i++) {
      var a = ph[i], b = ph[i + 1];
      if (i - dernier < 3) continue;
      if (mots(a.texte) > 7 || mots(b.texte) > 7 || mots(a.texte) < 2) continue;
      if (a.texte.charAt(a.texte.length - 1) !== '.' || /[:;?!]/.test(a.texte + b.texte)) continue;
      var entre = txt.slice(a.fin, b.deb);
      if (!/^[ \t]+$/.test(entre) || !OUTIL.test(b.texte)) continue;
      ops.push({ rule: 'fusion', cat: 'rythme', deb: a.fin - 1, fin: b.deb, avant: '.' + entre, apres: ', et ', min: true, niveau: 4,
        pourquoi: 'Deux phrases de quelques mots à la suite : reliées, elles respirent comme à l\'oral.' });
      dernier = i;
    }
    return ops;
  }

  function opsRythme(txt, niveau) {
    if (niveau < 2) return [];
    var lim = LIMITE_COUPE[niveau], ops = [];
    phrases(txt).forEach(function (p) {
      if (mots(p.texte) <= lim) return;
      var re = /(;\s+|,\s+(?=(mais|pourtant|donc)\s))/giu, m, cands = [], meilleur = null;
      var milieu = p.texte.length / 2;
      while ((m = re.exec(p.texte))) cands.push({ index: m.index, long: m[0].length });
      /* Les plus proches du milieu d'abord ; on s'arrête au premier qui laisse
         au moins sept mots de chaque côté (et on n'en essaie que quelques-uns :
         chaque essai relit la phrase). */
      cands.sort(function (x, y) { return Math.abs(x.index - milieu) - Math.abs(y.index - milieu); });
      for (var c = 0; c < Math.min(cands.length, 12) && !meilleur; c++) {
        var g = p.texte.slice(0, cands[c].index), d = p.texte.slice(cands[c].index + cands[c].long);
        if (mots(g) >= 7 && mots(d) >= 7) meilleur = cands[c];
      }
      if (!meilleur) return;
      var deb = p.deb + meilleur.index, fin = deb + meilleur.long;
      ops.push({ rule: 'coupe', cat: 'rythme', deb: deb, fin: fin, avant: txt.slice(deb, fin),
        apres: '. ', maj: true, niveau: 2,
        pourquoi: 'Phrase de ' + mots(p.texte) + ' mots, coupée à un point-virgule ou devant « mais / pourtant / donc ».' });
    });
    return ops;
  }


  /* ------------------------------------------------------- fautes courantes
     Correction SÛRE, pas exhaustive : on ne touche qu'à ce qui est faux sans
     ambiguïté. Un mot accentué à tort ne figure jamais ici, ni un mot qui
     existe aussi sans accent (« du/dû », « sur/sûr », « cote/côte »), ni un mot
     qui est aussi de l'anglais (« different », « role », « theme »). Aucune
     grammaire : accords, conjugaisons et homophones (a/à, ce/se…) ne sont pas
     vérifiés. */

  /* Mots écrits sans leurs accents (ou collés). Clé = forme fautive, en
     minuscules. Les pluriels et féminins sont déclarés explicitement. */
  var MOTS_FAUTIFS = (function () {
    var m = {};
    var simple = {
      apres: 'après', deja: 'déjà', tres: 'très', voila: 'voilà', etre: 'être', ete: 'été',
      meme: 'même', memes: 'mêmes', bientot: 'bientôt', plutot: 'plutôt', pres: 'près',
      ecole: 'école', ecoles: 'écoles', ecrire: 'écrire', ecrit: 'écrit', ecrits: 'écrits',
      egalement: 'également', equipe: 'équipe', equipes: 'équipes', etat: 'état', etats: 'états',
      etude: 'étude', etudes: 'études', etudiant: 'étudiant', etudiants: 'étudiants', etranger: 'étranger',
      evidemment: 'évidemment', evenement: 'événement', evenements: 'événements',
      facon: 'façon', facons: 'façons', francais: 'français', francaise: 'française', francaises: 'françaises',
      garcon: 'garçon', garcons: 'garçons', lecon: 'leçon', lecons: 'leçons', recu: 'reçu', recus: 'reçus',
      premiere: 'première', premieres: 'premières', derniere: 'dernière', dernieres: 'dernières',
      entiere: 'entière', entieres: 'entières', lumiere: 'lumière', lumieres: 'lumières',
      maniere: 'manière', manieres: 'manières', matiere: 'matière', matieres: 'matières',
      frere: 'frère', freres: 'frères', mere: 'mère', meres: 'mères', pere: 'père', peres: 'pères',
      probleme: 'problème', problemes: 'problèmes', systeme: 'système', systemes: 'systèmes',
      poeme: 'poème', poemes: 'poèmes', progres: 'progrès', acces: 'accès', succes: 'succès', proces: 'procès',
      interet: 'intérêt', interets: 'intérêts', foret: 'forêt', forets: 'forêts', tete: 'tête', tetes: 'têtes',
      fenetre: 'fenêtre', fenetres: 'fenêtres', hopital: 'hôpital', hopitaux: 'hôpitaux',
      necessaire: 'nécessaire', necessaires: 'nécessaires', specifique: 'spécifique', specifiques: 'spécifiques',
      resultat: 'résultat', resultats: 'résultats', reseau: 'réseau', reseaux: 'réseaux',
      securite: 'sécurité', societe: 'société', societes: 'sociétés', qualite: 'qualité', qualites: 'qualités',
      possibilite: 'possibilité', possibilites: 'possibilités', activite: 'activité', activites: 'activités',
      difficulte: 'difficulté', difficultes: 'difficultés', developpement: 'développement', developpements: 'développements',
      developement: 'développement', dévelopement: 'développement', developper: 'développer',
      /* contractions sans apostrophe : aucune n'est un mot français */
      cest: "c'est", jai: "j'ai", quil: "qu'il", quils: "qu'ils", quon: "qu'on", dun: "d'un",
      daccord: "d'accord", dailleurs: "d'ailleurs", dabord: "d'abord", quelquun: "quelqu'un", quelquune: "quelqu'une",
      lorsquil: "lorsqu'il", lorsquils: "lorsqu'ils", jusqua: "jusqu'à", peutetre: 'peut-être',
      parceque: 'parce que', malgres: 'malgré', malgre: 'malgré',
      /* ligature œ */
      coeur: 'cœur', coeurs: 'cœurs', soeur: 'sœur', soeurs: 'sœurs', oeuvre: 'œuvre', oeuvres: 'œuvres',
      oeil: 'œil', oeuf: 'œuf', oeufs: 'œufs', voeu: 'vœu', voeux: 'vœux', boeuf: 'bœuf', noeud: 'nœud', noeuds: 'nœuds',
      manoeuvre: 'manœuvre', moeurs: 'mœurs'
    };
    Object.keys(simple).forEach(function (k) { m[k] = simple[k]; });
    return m;
  })();

  /* Expressions de plusieurs mots (ou avec trait d'union). */
  var EXPRESSIONS = [
    [/(?<![\p{L}\p{N}])aujourd[’']?[ ]?hui(?![\p{L}\p{N}])/giu, function () { return "aujourd'hui"; }],
    [/(?<![\p{L}\p{N}])c(['’ ])est[ -][àa][ -]dire(?![\p{L}\p{N}])/giu, function (m) { return 'c' + (m[1] === ' ' ? "'" : m[1]) + 'est-à-dire'; }],
    [/(?<![\p{L}\p{N}])[àa] cause (?=(?:de|du|des|d['’]))/giu, function () { return 'à cause '; }],
    [/(?<![\p{L}\p{N}])a travers(?![\p{L}\p{N}])/giu, function () { return 'à travers'; }],
    [/(?<![\p{L}\p{N}])[àa] peu pr[èe]s(?![\p{L}\p{N}])/giu, function () { return 'à peu près'; }],
    [/(?<![\p{L}\p{N}])quand m[êe]me(?![\p{L}\p{N}])/giu, function () { return 'quand même'; }],
    [/(?<![\p{L}\p{N}])(au|par)[ -]dessus(?![\p{L}\p{N}])/giu, function (m) { return m[1] + '-dessus'; }],
    [/(?<![\p{L}\p{N}])au[ -]dessous(?![\p{L}\p{N}])/giu, function () { return 'au-dessous'; }],
    [/(?<![\p{L}\p{N}])au[ -]del[àa](?![\p{L}\p{N}])/giu, function () { return 'au-delà'; }],
    [/(?<![\p{L}\p{N}])l[àa][ -](bas|haut)(?![\p{L}\p{N}])/giu, function (m) { return 'là-' + m[1].toLowerCase(); }],
    [/(?<![\p{L}\p{N}])(celui|celle|ceux|celles)[ -](ci|l[àa])(?![\p{L}\p{N}])/giu, function (m) { return m[1] + '-' + (/^ci$/i.test(m[2]) ? 'ci' : 'là'); }]
  ];

  var ABREV_PHRASE = { etc: 1, cf: 1, env: 1, fig: 1, art: 1, chap: 1, vs: 1, ex: 1, resp: 1, apr: 1, tel: 1, tél: 1,
    mme: 1, mlle: 1, pp: 1, no: 1, ch: 1, st: 1, ste: 1, dr: 1, pr: 1, mr: 1, mm: 1, max: 1, min: 1, vol: 1, op: 1, ibid: 1, sté: 1, éd: 1, hab: 1, dép: 1, dir: 1 };
  var REPETABLES = '(?:le|la|les|un|une|des|du|de|et|à|en|dans|pour|sur|avec|par|au|aux|que|qui)';

  function calqueMot(orig, rempl) {
    if (orig.length > 3 && orig === orig.toUpperCase()) return rempl.toUpperCase();
    return orig.charAt(0) !== orig.charAt(0).toLowerCase() ? cap(rempl) : rempl;
  }

  function opFaute(txt, deb, fin, apres, pourquoi) {
    var avant = txt.slice(deb, fin);
    if (avant === apres || avant.replace(/’/g, "'") === apres.replace(/’/g, "'")) return null;
    return { rule: 'faute', cat: 'faute', deb: deb, fin: fin, avant: avant, apres: apres, pourquoi: pourquoi, niveau: 1 };
  }

  function opsFautes(txt) {
    var ops = [], m, o;

    /* 1. mots sans accents ou collés, un par un */
    var mot = /(?<![\p{L}\p{N}@#\/._])\p{L}+(?![\p{L}\p{N}@\/_]|\.\p{L})/gu;
    while ((m = mot.exec(txt))) {
      var w = m[0], k = w.toLowerCase();
      if (w === 'CA') continue;
      var rempl = (k === 'ca') ? 'ça' : MOTS_FAUTIFS.hasOwnProperty(k) ? MOTS_FAUTIFS[k] : null;
      if (!rempl) continue;
      if (w.length <= 3 && w === w.toUpperCase() && w.length > 1) continue;   // sigle
      o = opFaute(txt, m.index, m.index + w.length, calqueMot(w, rempl),
        k === 'ca' ? '« ça » prend une cédille.' : 'Orthographe : « ' + rempl + ' ».');
      if (o) ops.push(o);
    }

    /* 2. expressions */
    EXPRESSIONS.forEach(function (e) {
      var re = new RegExp(e[0].source, e[0].flags);
      while ((m = re.exec(txt))) {
        if (!m[0]) { re.lastIndex++; continue; }
        var r = e[1](m);
        if (e[2]) r = e[2];
        o = opFaute(txt, m.index, m.index + m[0].length, calqueMot(m[0], r), 'Orthographe : « ' + r + ' ».');
        if (o) ops.push(o);
      }
    });

    /* 3. espace oublié après une virgule, un point-virgule, ou un point suivi
       d'une majuscule. On ne regarde que les mots « ordinaires » : jamais une
       adresse, un fichier, un code ou un nombre. */
    var tok = /\S+/gu, t;
    while ((t = tok.exec(txt))) {
      var s0 = t[0];
      if (/[@\/\\=_#:]|\d/.test(s0)) continue;
      var vir = /(?<=\p{L})([,;])(?=\p{L})/gu, v;
      while ((v = vir.exec(s0))) {
        o = opFaute(txt, t.index + v.index, t.index + v.index + 1, v[1] + ' ', 'Une espace après la ponctuation.');
        if (o) ops.push(o);
      }
      var pt = /(?<![\p{L}])\p{Ll}{3,}(\.)(?=\p{Lu}\p{Ll}{2})/gu, p;
      while ((p = pt.exec(s0))) {
        var pos = t.index + p.index + p[0].length - 1;
        o = opFaute(txt, pos, pos + 1, '. ', 'Une espace après le point.');
        if (o) ops.push(o);
      }
    }

    /* 4. espace parasite après une apostrophe : « l' homme » */
    var apo = /(?<![\p{L}])(qu|jusqu|lorsqu|puisqu|[ldjnmtsc])(['’])[ \t]+(?=\p{L})/giu;
    while ((m = apo.exec(txt))) {
      o = opFaute(txt, m.index, m.index + m[0].length, m[1] + m[2], 'Pas d\'espace après l\'apostrophe.');
      if (o) ops.push(o);
    }

    /* 5. mot grammatical répété : « le le » */
    var dbl = new RegExp('(?<![\\p{L}\\p{N}\'’-])(' + REPETABLES + ')[ \\t]+\\1(?![\\p{L}\\p{N}\'’-])', 'giu');
    while ((m = dbl.exec(txt))) {
      o = opFaute(txt, m.index, m.index + m[0].length, m[1], 'Mot répété.');
      if (o) ops.push(o);
    }

    /* 6. majuscule oubliée après un point final, ?, ! (sauf abréviation) */
    var maj = /(?<![\p{L}\p{N}.])(\p{L}+)([.!?])([ \t]+)(\p{Ll})/gu;
    while ((m = maj.exec(txt))) {
      var mt = m[1];
      if (m[2] === '.' && (mt.length < 2 || ABREV_PHRASE[mt.toLowerCase()])) continue;
      var d = m.index + mt.length + 1 + m[3].length;
      o = opFaute(txt, d, d + 1, m[4].toUpperCase(), 'Une phrase commence par une majuscule.');
      if (o) ops.push(o);
    }
    return ops;
  }

  /* Rassemble toutes les opérations. À chevauchement, la plus longue gagne
     (une phrase entière retirée l'emporte sur un mot à l'intérieur). */
  function operations(txt, opts) {
    txt = String(txt == null ? '' : txt);
    opts = opts || {};
    var niveau = NIVEAUX[opts.intensite] || 2;
    var toutes = opsDesRegles(txt, niveau)
      .concat(opsLiaison(txt, niveau), opsRythme(txt, niveau), opsFusion(txt, niveau), opsTirets(txt, niveau));
    if (opts.corriger) toutes = toutes.concat(opsFautes(txt));
    if (!opts.garderForme) toutes = toutes.concat(opsFormat(txt));
    /* Balayage de gauche à droite ; quand deux opérations se chevauchent, la
       plus longue des deux reste (une phrase entière retirée l'emporte sur un
       mot à l'intérieur). */
    toutes.sort(function (a, b) { return a.deb - b.deb || (b.fin - b.deb) - (a.fin - a.deb); });
    var gardees = [];
    toutes.forEach(function (o) {
      var der = gardees[gardees.length - 1];
      if (!der || o.deb >= der.fin) gardees.push(o);
      else if (o.fin - o.deb > der.fin - der.deb && (gardees.length < 2 || o.deb >= gardees[gardees.length - 2].fin)) gardees[gardees.length - 1] = o;
    });
    gardees.forEach(function (o, i) { o.id = i; });
    return gardees;
  }

  /* Applique les opérations dont l'id est dans `refus` à l'envers : tout est
     appliqué, sauf ce qui est refusé. Rend le texte et, pour chaque opération
     appliquée, sa position dans le texte de sortie (pour la surbrillance). */
  function appliquer(txt, ops, refus) {
    var sortie = '', curseur = 0, marques = [], maj = false, min = false;
    refus = refus || {};
    /* La majuscule demandée par une opération s'applique à la première lettre
       qui suit, qu'elle vienne du texte d'origine ou de l'opération suivante. */
    var ajoute = function (morceau) {
      if ((maj || min) && morceau) {
        var c = morceau.charAt(0);
        if (/\p{L}/u.test(c)) morceau = (maj ? c.toUpperCase() : c.toLowerCase()) + morceau.slice(1);
        if (!/\s/.test(c)) { maj = false; min = false; }
      }
      sortie += morceau;
    };
    ops.forEach(function (o) {
      ajoute(txt.slice(curseur, o.deb));
      if (refus[o.id]) ajoute(txt.slice(o.deb, o.fin));
      else {
        var deb = sortie.length;
        ajoute(o.apres);
        if (o.maj) maj = true;
        if (o.min) min = true;
        marques.push({ id: o.id, deb: deb, fin: sortie.length });
      }
      curseur = o.fin;
    });
    ajoute(txt.slice(curseur));
    return { texte: nettoyer(sortie), marques: marques };
  }

  /* Dernier lissage : espaces doubles, espace avant une virgule ou un point,
     lignes vides en rafale. L'espace avant ? ! ; : est une règle de la
     typographie française : il n'y est pas touché. Ni les sauts de ligne
     simples, ni l'indentation. */
  function nettoyer(s) {
    s = s
      .replace(/(?<=[\p{L}\p{N})"»])[ \t]+([,.])(?![.,])/gu, '$1')
      .replace(/([^\s\n])[ \t]{2,}(?=\S)/g, '$1 ')
      .replace(/(?<![ \t])[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^[ \t]*\n+/, '');
    /* Les blancs de fin à la main : une expression régulière y est
       quadratique sur une longue suite d'espaces. */
    var k = s.length;
    while (k > 0 && (s.charAt(k - 1) === ' ' || s.charAt(k - 1) === '\t')) k--;
    return s.slice(0, k);
  }

  /* --------------------------------------------------------------- mesures
     Des chiffres calculés sur le texte, pas des probabilités. */

  function mesures(txt) {
    txt = String(txt == null ? '' : txt);
    var ph = phrases(txt), longueurs = ph.map(function (p) { return mots(p.texte); }).filter(function (n) { return n > 0; });
    var n = longueurs.length, total = mots(txt);
    var moy = n ? longueurs.reduce(function (a, b) { return a + b; }, 0) / n : 0;
    var variance = n ? longueurs.reduce(function (a, b) { return a + (b - moy) * (b - moy); }, 0) / n : 0;
    var ecart = Math.sqrt(variance);
    return {
      mots: total, phrases: n,
      moyenne: moy, ecart: ecart,
      /* Coefficient de variation : l'écart des longueurs rapporté à leur
         moyenne. Plus il est bas, plus les phrases se ressemblent. */
      variation: moy ? ecart / moy : 0,
      plusLongue: n ? Math.max.apply(null, longueurs) : 0,
      plusCourte: n ? Math.min.apply(null, longueurs) : 0,
      chiffres: (txt.match(/\p{N}+/gu) || []).length,
      propres: (function () {
        var c = 0;
        ph.forEach(function (p) {
          var re = /(?<=[a-zà-ÿ,;] )\p{Lu}[\p{L}'’-]{2,}/gu;
          c += (p.texte.match(re) || []).length;
        });
        return c;
      })()
    };
  }

  /* Combien de tics subsistent : on relance les détecteurs au niveau le plus
     sévère, tirets et mise en forme compris, sur le texte donné. C'est le même
     calcul avant et après, donc les deux nombres se comparent. */
  function tics(txt) {
    txt = String(txt == null ? '' : txt);
    return operations(txt, { intensite: 'fort', garderForme: false }).length;
  }

  /* ------------------------------------------------------------ signalements
     Ce que le moteur ne corrige PAS : il faut du fond, et seul l'auteur l'a. */

  var MOTS_VAGUES = [
    ['paysage', 'Un « paysage » (numérique, économique…) est presque toujours une image qui remplace un fait.'],
    ['tapisserie', 'Métaphore de décoration : dites ce que le texte tisse réellement.'],
    ['écosystème', 'Souvent un mot de plus pour « ensemble » ; nommez ce qu\'il contient.'],
    ['synergie', 'Mot de présentation : qui fait quoi avec qui ?'],
    ['holistique', 'Mot de présentation : à remplacer par ce qu\'il recouvre.'],
    ['levier', 'Un levier de quoi ? Nommez l\'action.'],
    ['au cœur de', 'Image qui s\'use vite ; « dans » ou « sur » disent la même chose.'],
    ['joue un rôle (?:clé|crucial|central|essentiel|majeur|important)', 'Quel rôle, précisément ? Dites ce que la chose fait.'],
    ['témoigne de', 'Souvent une preuve annoncée sans preuve donnée.'],
    ['souligne l.importance', 'Souvent une importance affirmée au lieu d\'être montrée.'],
    ['ne cesse d.évoluer', 'Vrai de presque tout : ne dit rien de précis.'],
    ['libérer le potentiel', 'Quel potentiel ? Pour faire quoi ?'],
    ['révolutionn(?:er|aire|e)', 'Un mot fort qui a besoin d\'un fait derrière lui.'],
    ['game[- ]?changer', 'Un mot fort qui a besoin d\'un fait derrière lui.']
  ];

  function signalements(txt) {
    txt = String(txt == null ? '' : txt);
    var out = [], ph = phrases(txt), norm = txt.replace(/’/g, "'");

    /* 1. Trois phrases de suite qui s'ouvrent sur le même mot. */
    var ouv = ph.map(function (p) { return (p.texte.match(/^[^\p{L}]*([\p{L}']+)/u) || [, ''])[1].toLowerCase(); });
    for (var i = 0; i + 2 < ouv.length; i++) {
      if (ouv[i] && ouv[i] === ouv[i + 1] && ouv[i] === ouv[i + 2]) {
        out.push({ id: 'ouvertures', titre: 'Trois phrases de suite commencent par « ' + ouv[i] + ' »',
          extrait: ph[i].texte.slice(0, 90), conseil: 'Reformulez au moins la deuxième : changez le sujet, ou commencez par le complément.' });
        i += 2;
      }
    }

    /* 2. Structures de balancier : « ce n'est pas X, c'est Y », « non seulement… mais ». */
    var re = /(?:ce n'est pas|il ne s'agit pas|ne se limite pas)[^.!?\n]{1,80}[,;]\s*(?:c'est|mais|il s'agit)[^.!?\n]*/gi, m;
    while ((m = re.exec(norm))) {
      out.push({ id: 'balancier', titre: 'Un balancier « ce n\'est pas X, c\'est Y »', extrait: m[0].slice(0, 110),
        conseil: 'Une fois, c\'est un effet ; en série, c\'est un tic. Dites directement ce que c\'est.' });
    }
    re = /non seulement[^.!?\n]{1,100}mais (?:aussi|également|encore)[^.!?\n]{0,200}/gi;
    while ((m = re.exec(norm))) {
      out.push({ id: 'balancier', titre: 'Un « non seulement… mais aussi »', extrait: m[0].slice(0, 110),
        conseil: 'Gardez la seule moitié qui apprend quelque chose.' });
    }

    /* 3. Mots vagues, dont le remplacement demande du fond. */
    MOTS_VAGUES.forEach(function (v) {
      var r = new RegExp(D + v[0] + F, 'giu'), mm = r.exec(txt);
      if (mm) {
        var deb = Math.max(0, mm.index - 30);
        out.push({ id: 'vague', titre: '« ' + mm[0] + ' »', extrait: txt.slice(deb, mm.index + mm[0].length + 40).replace(/\s+/g, ' '),
          conseil: v[1] });
      }
    });

    /* 4. Rythme et ancrage : calculés, pas devinés. */
    var me = mesures(txt);
    if (me.phrases >= 6 && me.variation < 0.35) {
      out.push({ id: 'rythme', titre: 'Les phrases ont presque toutes la même longueur',
        extrait: 'Entre ' + me.plusCourte + ' et ' + me.plusLongue + ' mots, en moyenne ' + Math.round(me.moyenne) + '.',
        conseil: 'Glissez une phrase de quatre ou cinq mots, puis une longue qui développe. Le rythme, c\'est de l\'alternance.' });
    }
    if (me.mots >= 120 && me.chiffres === 0 && me.propres === 0) {
      out.push({ id: 'ancrage', titre: 'Aucun nom propre, aucun chiffre, aucune date',
        extrait: me.mots + ' mots sans un seul fait vérifiable.',
        conseil: 'C\'est ce que l\'outil ne peut pas fabriquer : un nom, une date, un chiffre que vous avez vérifié, un cas que vous avez vécu.' });
    }
    return out;
  }

  /* ------------------------------------------------------------- ensemble */

  function analyse(txt, opts) {
    txt = String(txt == null ? '' : txt);
    opts = opts || {};
    var ops = operations(txt, opts);
    var res = appliquer(txt, ops, opts.refus);
    return {
      texte: res.texte, marques: res.marques, operations: ops,
      avant: mesures(txt), apres: mesures(res.texte),
      ticsAvant: tics(txt), ticsApres: tics(res.texte),
      signalements: signalements(res.texte)
    };
  }

  /* Le moteur n'a aucune dépendance au document : il se teste sous Node. */
  return { analyse: analyse, operations: operations, appliquer: appliquer, mesures: mesures,
           phrases: phrases, signalements: signalements, tics: tics, nettoyer: nettoyer,
           REGLES: REGLES, CATEGORIES: CATEGORIES };
});

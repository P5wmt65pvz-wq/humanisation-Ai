/* Tests du moteur de l'humaniseur : règles de réécriture, refus individuel, mesures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const H = require('../moteur.js');

const t = (txt, intensite = 'standard', extra = {}) => H.analyse(txt, { intensite, ...extra }).texte;

test('une ouverture creuse est retirée et la phrase reprend sa majuscule', () => {
  assert.equal(t("Dans le monde d'aujourd'hui, les équipes changent vite."), 'Les équipes changent vite.');
  assert.equal(t('Il est important de noter que le test passe.'), 'Le test passe.');
});

test('la même formule au milieu d\'une phrase n\'est pas touchée', () => {
  const s = 'Il pense qu\'il est important de noter que le test passe.';
  assert.equal(t(s), s);
});

test('les restes de conversation sont retirés dès le niveau léger', () => {
  const r = t("Bien sûr ! Voici le texte :\n\nLe printemps arrive. N'hésitez pas à me dire si vous voulez une autre version !", 'leger');
  assert.equal(r, 'Le printemps arrive.');
});

test('le niveau léger ne touche pas aux tournures lourdes', () => {
  const s = 'Il pense afin de gagner du temps.';
  assert.equal(t(s, 'leger'), s);
  assert.equal(t(s, 'standard'), 'Il pense pour gagner du temps.');
});

test('les remplacements gardent l\'accord et la casse', () => {
  assert.equal(t('Une étape cruciale. Des enjeux cruciaux. Afin que tout aille bien.'),
    'Une étape importante. Des enjeux importants. Pour que tout aille bien.');
  assert.equal(t("Afin d'éviter l'erreur, relisez."), "Pour éviter l'erreur, relisez.");
});

test('« il est nécessaire de ne pas » n\'est pas transformé en faute', () => {
  const s = 'Il est nécessaire de ne pas céder.';
  assert.equal(t(s), s);
  assert.equal(t('Il est nécessaire de partir.'), 'Il faut partir.');
});

test('les connecteurs ne sont retirés que lorsqu\'ils se suivent', () => {
  const un = 'Le projet avance. De plus, le budget tient. Le calendrier aussi.';
  assert.equal(t(un), un);
  const rafale = 'Le projet avance. De plus, le budget tient. Par ailleurs, le calendrier aussi. En outre, l\'équipe est prête.';
  assert.equal(t(rafale), "Le projet avance. De plus, le budget tient. Le calendrier aussi. L'équipe est prête.");
  assert.equal(t(rafale, 'leger'), rafale);
});

test('les tirets de dialogue et de liste ne sont jamais touchés', () => {
  const s = '— Bonjour, dit-il.\n— Salut.\n— Ça va ?';
  assert.equal(t(s, 'fort'), s);
});

test('les tirets cadratins : un budget par intensité, incise remplacée par des virgules', () => {
  const s = 'La règle — simple — tient. Elle change tout — enfin presque.';
  assert.equal(t(s, 'fort'), 'La règle, simple, tient. Elle change tout, enfin presque.');
  assert.equal(t(s, 'leger'), s, 'deux tirets au plus : toléré au niveau léger');
  assert.equal(t('Un — mot. Deux — mots. Trois — mots.', 'standard'), 'Un — mot. Deux, mots. Trois, mots.');
});

test('un tiret devant un sujet ouvre une nouvelle phrase', () => {
  assert.equal(t('Le télétravail change tout — il transforme les équipes.', 'fort'),
    'Le télétravail change tout. Il transforme les équipes.');
});

test('la mise en forme est nettoyée, sauf si on la garde', () => {
  const s = '## Titre\n\nUn **mot** important 🚀';
  assert.equal(t(s), 'Titre\n\nUn mot important');
  assert.equal(t(s, 'standard', { garderForme: true }), s);
});

test('l\'espace avant ? ! ; : de la typographie française est conservée', () => {
  const s = 'Vraiment ? Oui ! Voyons : ça marche ; sans doute.';
  assert.equal(t(s, 'fort'), s);
});

test('une phrase très longue est coupée à un point-virgule sûr, pas ailleurs', () => {
  const gauche = 'Les équipes ont revu leur organisation interne pendant tout le trimestre dernier';
  const droite = 'elles ont ensuite présenté leurs conclusions devant la direction générale réunie pour l\'occasion';
  const longue = `${gauche}, avec plusieurs ateliers et un point hebdomadaire sur chaque chantier ; ${droite}.`;
  const r = t(longue, 'fort');
  assert.match(r, /\. Elles ont ensuite/);
  assert.equal(t(longue, 'leger'), longue);
  const courte = 'Il a dit oui ; elle a dit non.';
  assert.equal(t(courte, 'fort'), courte);
});

test('un refus individuel rétablit le texte d\'origine à cet endroit seulement', () => {
  const src = "Dans le monde d'aujourd'hui, afin de gagner, relisez.";
  const ops = H.operations(src, { intensite: 'standard' });
  assert.equal(ops.length, 2);
  const refuse = {}; refuse[ops[0].id] = true;
  const r = H.analyse(src, { intensite: 'standard', refus: refuse });
  assert.equal(r.texte, "Dans le monde d'aujourd'hui, pour gagner, relisez.");
});

test('les opérations ne se chevauchent pas et suivent l\'ordre du texte', () => {
  const src = "À l'ère du numérique, il est important de noter que cet outil — vraiment — sert afin de gagner du temps. En conclusion, c'est utile.";
  const ops = H.operations(src, { intensite: 'fort' });
  for (let i = 1; i < ops.length; i++) assert.ok(ops[i].deb >= ops[i - 1].fin, 'chevauchement');
  ops.forEach((o, i) => assert.equal(o.id, i));
  assert.equal(src.slice(ops[0].deb, ops[0].fin), ops[0].avant);
});

test('le niveau complet relie deux phrases très courtes et simplifie le vocabulaire', () => {
  const s = "Le télétravail progresse. Les équipes s'adaptent. Les coûts baissent.";
  assert.equal(t(s, 'complet'), "Le télétravail progresse, et les équipes s'adaptent. Les coûts baissent.");
  assert.equal(t(s, 'fort'), s);
  assert.equal(t('Cette étude met en lumière un éventail de pratiques.', 'complet'), 'Cette étude montre toute une série de pratiques.');
  assert.equal(t('Ils sont en mesure de choisir.', 'fort'), 'Ils peuvent choisir.');
  assert.equal(t('Un nom propre. Marie arrive.', 'complet'), 'Un nom propre. Marie arrive.', 'jamais de minuscule sur un nom propre');
});

test('un texte déjà propre ne change pas, à aucune intensité', () => {
  const s = "Le chat dort sur le canapé. Il a plu toute la nuit, et la rue sent le pain chaud.";
  for (const i of ['leger', 'standard', 'fort']) {
    const r = H.analyse(s, { intensite: i });
    assert.equal(r.texte, s);
    assert.equal(r.operations.length, 0);
  }
});

test('le résultat est stable : repasser l\'outil ne change plus rien', () => {
  const src = "Bien sûr ! Dans le monde d'aujourd'hui, un grand nombre d'équipes — comme celle-ci — travaillent afin de gagner du temps. De plus, il convient de noter que c'est crucial. Par ailleurs, ça aide. En outre, c'est simple. En conclusion, c'est utile. N'hésitez pas à demander !";
  const une = t(src, 'fort');
  assert.equal(t(une, 'fort'), une);
});

test('le décompte des tics est le même détecteur avant et après', () => {
  const src = "Dans le monde d'aujourd'hui, il est important de noter que c'est un véritable défi — vraiment.";
  const r = H.analyse(src, { intensite: 'fort' });
  assert.ok(r.ticsAvant >= 3);
  assert.equal(r.ticsApres, 0);
  const refus = {}; r.operations.forEach((o) => { refus[o.id] = true; });
  const tout = H.analyse(src, { intensite: 'fort', refus });
  assert.equal(tout.texte, src);
  assert.equal(tout.ticsApres, tout.ticsAvant, 'tout refuser ne doit rien améliorer');
});

test('les mesures sont calculées, sans inventer de seuil', () => {
  const m = H.mesures('Un. Deux mots ici. Et maintenant une phrase nettement plus longue que les deux autres.');
  assert.equal(m.phrases, 3);
  assert.equal(m.plusCourte, 1);
  assert.equal(m.plusLongue, 11);
  assert.ok(m.variation > 0.5);
  const plat = H.mesures('Un deux trois quatre. Un deux trois quatre. Un deux trois quatre.');
  assert.equal(plat.variation, 0);
});

test('une abréviation ne coupe pas la phrase', () => {
  assert.equal(H.phrases('Voir M. Durand pour le détail. Il répondra demain.').length, 2);
  assert.equal(H.phrases('Le prix passe de 3.5 à 4.2 euros. Fin.').length, 2);
});

test('les signalements ne s\'appuient que sur ce qui est dans le texte', () => {
  const plat = 'Ce texte est clair. Ce texte est long. Ce texte est calme. Il parle de peu.';
  assert.ok(H.signalements(plat).some((s) => s.id === 'ouvertures'));
  assert.ok(H.signalements('Ce n\'est pas un outil, c\'est une méthode.').some((s) => s.id === 'balancier'));
  assert.ok(H.signalements('Le paysage numérique change.').some((s) => s.id === 'vague'));
  assert.deepEqual(H.signalements('Court.'), []);
  const sansFait = ('Le sujet est vaste et touche beaucoup de monde dans de nombreux domaines différents. ').repeat(12);
  assert.ok(H.signalements(sansFait).some((s) => s.id === 'ancrage'));
  const avecFait = sansFait + ' Marie Curie a reçu deux prix Nobel.';
  assert.ok(!H.signalements(avecFait).some((s) => s.id === 'ancrage'));
});

test('entrées vides ou absentes : aucun plantage', () => {
  for (const x of ['', ' ', '\n\n', null, undefined]) {
    const r = H.analyse(x, { intensite: 'fort' });
    assert.equal(r.texte, '');
    assert.equal(r.operations.length, 0);
  }
  assert.equal(H.analyse('Texte.', { intensite: 'inconnue' }).texte, 'Texte.');
});

test('la page n\'écrit aucune promesse sur les détecteurs', () => {
  const html = require('node:fs').readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /ne garantit rien sur les détecteurs/);
  assert.doesNotMatch(html, /indétectable|contourne|échappe aux détecteurs|100 ?% humain|passe tous les/i);
});

/* Tests du mode IA : requête, lecture des réponses, erreurs. Aucun réseau. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const IA = createRequire(import.meta.url)('../ia.js');

const base = { cle: 'sk-ant-test', modele: 'opus', style: 'naturel' };

test('la requête porte les en-têtes exigés par l\'API et par un appel depuis un navigateur', () => {
  const r = IA.construire('Bonjour tout le monde.', base);
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.init.method, 'POST');
  assert.equal(r.init.headers['x-api-key'], 'sk-ant-test');
  assert.equal(r.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(r.init.headers['content-type'], 'application/json');
  assert.equal(r.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
});

test('le corps : bon modèle, texte encadré, aucun paramètre retiré de l\'API', () => {
  const b = JSON.parse(IA.construire('Un texte.', base).init.body);
  assert.equal(b.model, 'claude-opus-5-5');
  assert.equal(b.max_tokens, 16000);
  assert.deepEqual(b.output_config, { effort: 'medium' });
  assert.equal(b.messages[0].role, 'user');
  assert.match(b.messages[0].content, /^<texte>\nUn texte\.\n<\/texte>$/);
  for (const interdit of ['temperature', 'top_p', 'top_k', 'thinking', 'budget_tokens', 'tool_choice']) {
    assert.ok(!(interdit in b), `${interdit} ne doit pas être envoyé`);
  }
  assert.equal(JSON.parse(IA.construire('x', { ...base, modele: 'sonnet' }).init.body).model, 'claude-sonnet-5-5');
});

test('le prompt interdit d\'inventer, pose le style et traite le texte comme une donnée', () => {
  const s = IA.systeme('decontracte', false);
  assert.match(s, /N'ajoute aucun fait/);
  assert.match(s, /jamais des instructions/);
  assert.match(s, /pas de Markdown/);
  assert.match(IA.systeme('pro', true), /Conserve les titres/);
  assert.match(s, /décontracté/);
});

test('validation : texte vide, clé absente, texte trop long', () => {
  assert.throws(() => IA.construire('  ', base), (e) => e.code === 'vide');
  assert.throws(() => IA.construire('Un texte.', { ...base, cle: ' ' }), (e) => e.code === 'sans-cle');
  assert.throws(() => IA.construire('mot '.repeat(4001), base), (e) => e.code === 'trop-long');
  assert.doesNotThrow(() => IA.construire('mot '.repeat(4000), base));
});

test('lecture d\'une réponse : seuls les blocs texte comptent', () => {
  const rep = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: ' Salut ' }, { type: 'text', text: 'toi.' }] };
  assert.equal(IA.lire(rep), 'Salut toi.');
});

test('réponses anormales : refus, coupure, vide, forme inattendue', () => {
  assert.throws(() => IA.lire({ stop_reason: 'refusal', content: [] }), (e) => e.code === 'refus');
  assert.throws(() => IA.lire({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'début' }] }), (e) => e.code === 'coupe');
  assert.throws(() => IA.lire({ stop_reason: 'end_turn', content: [] }), (e) => e.code === 'vide-reponse');
  assert.throws(() => IA.lire(null), (e) => e.code === 'reponse');
});

const faux = (status, json) => () => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(json) });

test('appel complet avec un réseau simulé : succès', async () => {
  let vu;
  const f = (url, init) => { vu = { url, init }; return faux(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Réécrit.' }] })(); };
  assert.equal(await IA.reecrire('Un texte.', base, f), 'Réécrit.');
  assert.equal(vu.url, IA.URL_API);
});

test('les erreurs HTTP donnent un message en français et un code', async () => {
  const cas = [[401, 'cle'], [403, 'acces'], [429, 'limite'], [413, 'trop-long'], [529, 'surcharge'], [400, 'requete'], [500, 'http']];
  for (const [status, code] of cas) {
    await assert.rejects(IA.reecrire('Un texte.', base, faux(status, { type: 'error', error: { type: 'x', message: 'détail' } })),
      (e) => e.code === code && /\S/.test(e.message), `HTTP ${status}`);
  }
  await assert.rejects(IA.reecrire('Un texte.', base, faux(500, null)), (e) => e.code === 'http');
});

test('un réseau coupé est expliqué, la clé n\'apparaît jamais dans un message', async () => {
  await assert.rejects(IA.reecrire('Un texte.', base, () => Promise.reject(new TypeError('Failed to fetch'))),
    (e) => e.code === 'reseau' && !e.message.includes('sk-ant'));
});

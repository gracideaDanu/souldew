// The play view's battle helper: where the player puts it (left or right of the game, folded in – #10) and which
// generation it judges by (the running game's, from its memory table entry: a DS game is Gen 4 or 5, a 3DS game 6 or
// 7 – the system alone made every 3DS battle a Gen 4 one: no Fairy attacks, Steel resisting Ghost, Tackle at 35).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moveInfo, effectiveness } from '../shared/typechart.mjs';

const src = (f) => readFileSync(new URL(`../web/views/${f}`, import.meta.url), 'utf8');
const MOVES = JSON.parse(readFileSync(new URL('../shared/data/moves.json', import.meta.url), 'utf8'));

test('battle helper folded in or not, remembered per profile (#10) – in the play view\'s dock', () => {
  const panel = src('session-info.mjs');
  // remembered in this profile, unfolded by default, anything else read as the default
  assert.match(panel, /const PANEL_KEY = 'sl-battle-panel';/);
  assert.match(panel, /const PANEL_DEFAULT = \{ collapsed: false, hits: false, moves: true, myMoves: true \};/);
  assert.match(panel, /return \{ collapsed: v\?\.collapsed === true, hits: v\?\.hits === true, moves: v\?\.moves !== false, myMoves: v\?\.myMoves !== false \};/);
  assert.match(panel, /localStorage\.setItem\(PANEL_KEY, JSON\.stringify\(next\)\)/);
  // one button on the panel: fold it in / out (the dock is its one place – no left / right any more)
  assert.match(panel, /aria-expanded=\$\{!collapsed\} onClick=\$\{\(\) => onPrefs\(\{ collapsed: !collapsed \}\)\}/);
  assert.doesNotMatch(panel, /onPrefs\(\{ side/);
  // the play view hands the choice over and puts the panel in the dock's battle section
  const play = src('play.mjs');
  assert.match(play, /const \[panelPrefs, setPanelPrefs\] = useBattlePanelPrefs\(\);/);
  assert.match(play, /collapsed=\$\{panelPrefs\.collapsed\} onPrefs=\$\{setPanelPrefs\}/);
  assert.match(play, /\{ id: 'battle', label: t\('battle\.title', 'Battle'\), icon: 'bolt', node: battleEl/);
});

test('the battle helper, team and savestates judge by the running game\'s generation, not the system\'s', () => {
  const play = src('play.mjs');
  assert.match(play, /if \(Number\.isInteger\(entry\.gen\)\) setLiveGen\(/);
  assert.match(play, /const gameGen = liveGen \|\| GEN\[target\.system\] \|\| null;/);
  assert.equal(play.split('gen=${GEN[target.system]}').length - 1, 0, 'no component gets the system\'s generation');
  for (const c of ['BattlePanel', 'StatePanel', 'LinkedPairs', 'PartyGrid']) assert.match(play, new RegExp(`<\\$\\{${c}\\}[^>]*gen=\\$\\{gameGen\\}`), c);
  // what it changes: a Gen 7 battle (Sun's Rowlet against a Fairy or Steel type) …
  assert.equal(moveInfo(MOVES, 33, 7).power, 40); // Tackle
  assert.equal(moveInfo(MOVES, 33, 4).power, 35);
  assert.equal(effectiveness('ghost', ['steel'], 7), 1);
  assert.equal(effectiveness('ghost', ['steel'], 4), 0.5);
  // … and Black/White's moves by Gen 5 (Tackle 50), not Gen 4
  assert.equal(moveInfo(MOVES, 33, 5).power, 50);
});

test('"What hits …" (the opponent\'s moves) folds in – folded by default, remembered with the panel, a real button', () => {
  const panel = src('session-info.mjs');
  // folded unless the player opened it (anything else stored reads as folded)
  assert.match(panel, /collapsed: v\?\.collapsed === true, hits: v\?\.hits === true/);
  assert.match(panel, /export function BattlePanel\(\{[^}]*hitsOpen = false[^}]*\}\)/);
  assert.match(panel, /hits=\$\{onPrefs \? \{ open: hitsOpen, toggle: \(\) => onPrefs\(\{ hits: !hitsOpen \}\) \} : null\}/);
  // a button in the head line: keyboard and screen readers know it opens / closes the list it controls
  assert.match(panel, /<button type="button" class="bt-fold" aria-expanded=\$\{open\} aria-controls=\$\{listId\} onClick=\$\{hits\.toggle\}>/);
  assert.match(panel, /name=\$\{open \? 'chevUp' : 'chevDown'\}/);
  // folded: no move in the page at all, only the head line
  assert.match(panel, /<ul class="bt-moves" id=\$\{listId\} hidden=\$\{!open\}>\n\s+\$\{open && incoming\.map/);
  // the play view hands the choice over
  assert.match(src('play.mjs'), /collapsed=\$\{panelPrefs\.collapsed\} onPrefs=\$\{setPanelPrefs\} hitsOpen=\$\{panelPrefs\.hits\}/);
  const css = readFileSync(new URL('../web/session-info.css', import.meta.url), 'utf8');
  assert.match(css, /\.bt-fold:hover, \.bt-fold:focus-visible \{ color: var\(--ink\); \}/);
  // folded, the team check's "takes" tip doesn't name the foe's move either – only how hard it hits
  assert.match(panel, /hideFoeMoves=\$\{!!onPrefs && !hitsOpen\}/);
  assert.match(panel, /hideFoeMoves && typeof mu\.takesBy === 'number' \? t\('battle\.takesTipHidden'/);
});

test('battle moves show Power (phy/spec) inline on the same row and tuck description into hover tooltip', () => {
  const panel = src('session-info.mjs');
  const css = readFileSync(new URL('../web/session-info.css', import.meta.url), 'utf8');
  assert.doesNotMatch(panel, /bt-move-desc|bt-move-meta/);
  assert.match(panel, /const moveDetails = \(id, info\) => \{/);
  assert.match(panel, /inline: clsShort \? `\| \$\{info\.power > 0 \? info\.power : '—'\} \(\$\{clsShort\}\)` : ''/);
  assert.match(panel, /tip: `\$\{meta\}\\n\$\{desc\}`/);
  assert.match(panel, /<li key=\$\{id\} class=\$\{superHit \? 'super' : undefined\} title=\$\{details\.tip\}>/);
  assert.match(panel, /<li key=\$\{x\.key\} class=\$\{x\.m > 1 \? 'super foe' : undefined\} title=\$\{details\?\.tip \|\| undefined\}>/);
  assert.match(css, /\.bt-moves li\.super \{ background:/);
  assert.match(css, /\.bt-moves li\.super\.foe \{ background:/);
  assert.match(panel, /<span class="bt-move-main">/);
  assert.match(panel, /<span class="bt-move-stat num">\$\{inline\}<\/span>/);
  const rowSize = Number(css.match(/\.bt-moves li\s*\{[^}]*font-size:\s*([\d.]+)px/)?.[1]);
  const statSize = Number(css.match(/\.bt-move-stat\s*\{[^}]*font-size:\s*([\d.]+)px/)?.[1]);
  assert.ok(rowSize > 0 && statSize > 0);
  assert.ok(statSize < rowSize, `expected smaller inline stat (${statSize}) than move row (${rowSize})`);
});

test('Moves section and both move subsections collapse individually; opponent heading is "Opponent move"', () => {
  const panel = src('session-info.mjs');
  const css = readFileSync(new URL('../web/session-info.css', import.meta.url), 'utf8');
  assert.match(panel, /export function BattlePanel\(\{[^}]*movesOpen = true, myMovesOpen = true[^}]*\}\)/);
  assert.match(panel, /<button type="button" class="bt-fold" aria-expanded=\$\{movesOpen\} aria-controls="bt-moves-section" onClick=\$\{\(\) => onPrefs\(\{ moves: !movesOpen \}\)\}>/);
  assert.match(panel, /t\('battle\.moves', 'Moves'\)/);
  assert.match(panel, /<div class="bt-moves-group-body" id="bt-moves-section" hidden=\$\{!!onPrefs && !movesOpen\}>/);
  assert.match(panel, /myMovesFold=\$\{onPrefs \? \{ open: myMovesOpen, toggle: \(\) => onPrefs\(\{ myMoves: !myMovesOpen \}\) \} : null\}/);
  assert.match(panel, /<button type="button" class="bt-fold" aria-expanded=\$\{myOpen\} aria-controls=\$\{myListId\} onClick=\$\{myMovesFold\.toggle\}>/);
  assert.match(panel, /<ul class="bt-moves" id=\$\{myListId\} hidden=\$\{!myOpen\}>\n\s+\$\{myOpen && myMoves\.map/);
  assert.match(panel, /const title = t\('battle\.danger', 'Opponent move'\);/);
  assert.match(src('play.mjs'), /movesOpen=\$\{panelPrefs\.moves\} myMovesOpen=\$\{panelPrefs\.myMoves\}/);
  assert.match(css, /\.bt-block\.folded > h4 \{ margin-bottom: 0; \}/);
  assert.match(css, /\.bt-moves-group-body\[hidden\], \.bt-moves\[hidden\] \{ display: none; \}/);
});

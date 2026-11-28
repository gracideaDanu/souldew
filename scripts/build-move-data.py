"""Move type/power/accuracy/class/effect data for the battle helper (shared/data/moves.json).

Usage: python3 scripts/build-move-data.py <pokeapi data/v2/csv dir> shared/data/moves.json

PokeAPI's moves.csv holds the newest values; move_changelog.csv lists the OLD values a move had
before the version group in `changed_in_version_group_id`. Walking those changes from newest to
oldest gives every generation's values (Bite: Normal in Gen 1, Dark from Gen 2 …).
"""
import csv, json, os, sys

CSV, OUT = sys.argv[1], sys.argv[2]
MAX_MOVE = 742  # Gen 7 (Ultra Sun/Ultra Moon, Let's Go)
GENS = range(1, 8)


def rows(name):
    with open(os.path.join(CSV, name + '.csv'), newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


# A generation's values are those of its last main-series version group (Yellow, Crystal, FireRed/LeafGreen,
# HeartGold/SoulSilver, Black 2/White 2, Omega Ruby/Alpha Sapphire, Ultra Sun/Ultra Moon). move_changelog lists the
# values a move had before `changed_in_version_group_id`, in the order of version_groups.csv – Let's Go (between
# Ultra Sun and Sword) included, whose values must not leak into the main series.
VG_ORDER = {int(r['id']): int(r['order']) for r in rows('version_groups')}
LAST_VG = {1: 2, 2: 4, 3: 7, 4: 10, 5: 14, 6: 16, 7: 18}
types = {int(r['id']): r['identifier'] for r in rows('types')}
classes = {1: 'status', 2: 'physical', 3: 'special'}
cur = {}
for r in rows('moves'):
    i = int(r['id'])
    if i > MAX_MOVE:
        continue
    cur[i] = {'type': types[int(r['type_id'])], 'power': int(r['power'] or 0), 'accuracy': int(r['accuracy'] or 0),
              'cls': classes.get(int(r['damage_class_id'] or 1), 'status'), 'effect': int(r['effect_id'] or 0)}

changes = sorted(
    (r for r in rows('move_changelog') if int(r['move_id']) <= MAX_MOVE),
    key=lambda r: VG_ORDER[int(r['changed_in_version_group_id'])], reverse=True)

by_gen = {}
accuracy_by_gen = {}
effect_by_gen = {}
for g in GENS:
    diff = {}
    accuracy_diff = {}
    effect_diff = {}
    for i, m in cur.items():
        t, p, a = m['type'], m['power'], m['accuracy']
        effect = m['effect']
        for r in changes:
            if int(r['move_id']) != i or VG_ORDER[int(r['changed_in_version_group_id'])] <= VG_ORDER[LAST_VG[g]]:
                continue
            if r['type_id']:
                t = types[int(r['type_id'])]
            if r['power']:
                p = int(r['power'])
            if r['accuracy']:
                a = int(r['accuracy'])
            if r['effect_id']:
                effect = int(r['effect_id'])
        if t != m['type'] or p != m['power']:
            diff[i] = [t, p]
        if a != m['accuracy']:
            accuracy_diff[i] = a
        if effect != m['effect']:
            effect_diff[i] = effect
    by_gen[str(g)] = diff
    accuracy_by_gen[str(g)] = accuracy_diff
    effect_by_gen[str(g)] = effect_diff

effect_text = {'en': {}, 'fr': {}}
effect_languages = {'en': 9, 'fr': 5}
for r in rows('move_effect_prose'):
    lang = next((key for key, lang_id in effect_languages.items() if int(r['local_language_id']) == lang_id), None)
    if lang:
        effect_text[lang][int(r['move_effect_id'])] = r['short_effect']

out = {
    'meta': {'source': 'PokeAPI (github.com/PokeAPI/pokeapi data/v2/csv: moves, move_changelog, move_effect_prose, types, version_groups)', 'maxMove': MAX_MOVE,
             'notes': 'type/power/accuracy/cls are indexed by move id (newest values; accuracy 0 means no accuracy check / never misses). '
                      'byGen[g][id] = [type, power] where Gen g differs; accuracyByGen[g][id] overrides accuracy where Gen g differs. '
                      'effect[id] is the PokeAPI move effect group; effectByGen[g][id] overrides it where the generation differs. '
                      'effectText uses short_effect, with English and French prose. Before Gen 4 the damage class follows the type, not cls.'},
    'type': [''] + [cur[i]['type'] if i in cur else '' for i in range(1, MAX_MOVE + 1)],
    'power': [0] + [cur[i]['power'] if i in cur else 0 for i in range(1, MAX_MOVE + 1)],
    'accuracy': [0] + [cur[i]['accuracy'] if i in cur else 0 for i in range(1, MAX_MOVE + 1)],
    'cls': [''] + [cur[i]['cls'] if i in cur else '' for i in range(1, MAX_MOVE + 1)],
    'effect': [0] + [cur[i]['effect'] if i in cur else 0 for i in range(1, MAX_MOVE + 1)],
    'accuracyByGen': accuracy_by_gen,
    'effectByGen': effect_by_gen,
    'effectText': effect_text,
    'byGen': by_gen,
}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, separators=(',', ':'))
print('moves', len(cur), {g: len(d) for g, d in by_gen.items()})

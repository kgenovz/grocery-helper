import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient } from './parseIngredient';
import { extractRecipe } from './jsonld';

test('integer qty + unit + item', () => {
  const r = parseIngredient('2 cups all-purpose flour');
  assert.equal(r.qty, 2);
  assert.equal(r.unit, 'cup');
  assert.equal(r.item, 'all-purpose flour');
  assert.equal(r.prep, null);
});

test('unicode fraction', () => {
  const r = parseIngredient('½ teaspoon salt');
  assert.equal(r.qty, 0.5);
  assert.equal(r.unit, 'tsp');
  assert.equal(r.item, 'salt');
});

test('mixed unicode fraction (1½)', () => {
  const r = parseIngredient('1½ cups sugar');
  assert.equal(r.qty, 1.5);
  assert.equal(r.unit, 'cup');
  assert.equal(r.item, 'sugar');
});

test('ascii mixed number', () => {
  const r = parseIngredient('1 1/2 tbsp olive oil');
  assert.equal(r.qty, 1.5);
  assert.equal(r.unit, 'tbsp');
  assert.equal(r.item, 'olive oil');
});

test('range takes the lower bound', () => {
  const r = parseIngredient('3-4 cloves garlic, minced');
  assert.equal(r.qty, 3);
  assert.equal(r.unit, 'clove');
  assert.equal(r.item, 'garlic');
  assert.equal(r.prep, 'minced');
});

test('comma splits prep', () => {
  const r = parseIngredient('2 cups all-purpose flour, sifted');
  assert.equal(r.qty, 2);
  assert.equal(r.item, 'all-purpose flour');
  assert.equal(r.prep, 'sifted');
});

test('"to taste" => qty null, moved to prep', () => {
  const r = parseIngredient('Salt and pepper to taste');
  assert.equal(r.qty, null);
  assert.equal(r.unit, null);
  assert.equal(r.item, 'Salt and pepper');
  assert.equal(r.prep, 'to taste');
});

test('leading package size becomes a note', () => {
  const r = parseIngredient('1 (14.5 oz) can diced tomatoes');
  assert.equal(r.qty, 1);
  assert.equal(r.unit, 'can');
  assert.equal(r.item, 'diced tomatoes');
  assert.equal(r.prep, '14.5 oz');
});

test('no quantity', () => {
  const r = parseIngredient('Cooking spray');
  assert.equal(r.qty, null);
  assert.equal(r.unit, null);
  assert.equal(r.item, 'Cooking spray');
});

test('extractRecipe pulls JSON-LD Recipe from @graph', () => {
  const html = `<html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[
      {"@type":"WebPage","name":"page"},
      {"@type":"Recipe","name":"Test Soup","recipeYield":"4 servings",
       "recipeIngredient":["2 cups water","1 tsp salt"]}
    ]}
    </script></head><body></body></html>`;
  const r = extractRecipe(html, 'https://example.com/soup');
  assert.ok(r);
  assert.equal(r.title, 'Test Soup');
  assert.equal(r.baseServings, 4);
  assert.deepEqual(r.ingredients, ['2 cups water', '1 tsp salt']);
});

test('extractRecipe returns null when no Recipe present', () => {
  const html = `<html><head><script type="application/ld+json">
    {"@type":"WebPage","name":"nope"}</script></head><body></body></html>`;
  assert.equal(extractRecipe(html, 'https://example.com'), null);
});

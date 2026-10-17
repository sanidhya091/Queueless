const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

// Exercise the real callback without loading native modules or Supabase.
// The project has no native UI test harness; TypeScript is already installed.
const filePath = require.resolve('./HomeScreen.tsx');
const source = ts.createSourceFile(
  filePath,
  readFileSync(filePath, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const screen = source.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'HomeScreen'
);
assert.ok(screen?.body, 'HomeScreen must exist');
const handler = screen.body.statements
  .filter(ts.isVariableStatement)
  .flatMap((node) => [...node.declarationList.declarations])
  .find((node) => node.name.getText(source) === 'navigateToPlace');
assert.ok(handler?.initializer, 'HomeScreen must define navigateToPlace');
const { outputText } = ts.transpileModule(
  `const navigateToPlace = ${handler.initializer.getText(source)};\nnavigateToPlace;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
);

const offices = [
  { id: 1, name: 'RTO Jabalpur', category: 'RTO' },
  { id: 42, name: 'Regional Transport Office', category: 'RTO' },
  { id: 73, name: 'RTO North', category: 'Government' },
  { id: 91, name: 'Central Bank', category: 'Bank' },
];

for (const office of offices) {
  test(`opens the selected place for ${office.name} (${office.id})`, () => {
    const calls = [];
    const navigateToPlace = runInNewContext(outputText, {
      navigation: {
        navigate(route, params) {
          calls.push({ route, placeId: params?.placeId });
        },
      },
    });

    navigateToPlace(office);

    assert.deepEqual(calls, [{ route: 'Place', placeId: office.id }]);
  });
}

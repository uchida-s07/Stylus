import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

// apps/web から apps/api の実行コードを import させない ESLint のルール（COMMON-N-010）
// 許すのは `import type { … }` と `export type { … }` だけ。
// `import { type X }` は、verbatimModuleSyntax では JS に読み込み（import '…'）が残るので止める。
// 相対パスは文字列ではなく、解決した先が apps/api の中かで判定する（apps/web の中の api フォルダを誤って止めない）

const repoRoot = join(import.meta.dirname, '..', '..', '..')
const apiDir = join(repoRoot, 'apps', 'api')
// apps/api のパッケージ名（apps/api/package.json の name）
const API_PACKAGE = 'api'

function pointsToApi(specifier, filename) {
  if (specifier === API_PACKAGE || specifier.startsWith(`${API_PACKAGE}/`)) return true
  if (!specifier.startsWith('.')) return false
  const rel = relative(apiDir, resolve(dirname(filename), specifier))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      runtimeImport:
        'apps/web から apps/api の実行コードを import しない（型だけなら `import type { … }` を使う）。共有するものは packages/ に置く',
    },
  },
  create(context) {
    function check(node, source, typeOnly) {
      if (typeOnly || source?.type !== 'Literal' || typeof source.value !== 'string') return
      if (pointsToApi(source.value, context.filename)) {
        context.report({ node, messageId: 'runtimeImport' })
      }
    }
    return {
      ImportDeclaration: (node) => check(node, node.source, node.importKind === 'type'),
      ExportNamedDeclaration: (node) => check(node, node.source, node.exportKind === 'type'),
      ExportAllDeclaration: (node) => check(node, node.source, node.exportKind === 'type'),
      ImportExpression: (node) => check(node, node.source, false),
    }
  },
}

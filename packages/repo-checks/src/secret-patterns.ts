// 秘密情報の形（COMMON-N-004）。検査はこのファイルだけから形を読む（CI のビルド成果物の検査 T-22 も同じ）
// 形をほかのファイルにじかに書くと、そのファイル自身が検査に引っかかる。このファイルは検査から除く
export const SECRET_PATTERNS_FILE = 'packages/repo-checks/src/secret-patterns.ts'

export const SECRET_PATTERNS = ['sb_secret_', 'postgres://', 'postgresql://'] as const

// 文字列に含まれる秘密情報の形を返す（大文字・小文字は区別しない）
export function findSecretPatterns(text: string): string[] {
  const lower = text.toLowerCase()
  return SECRET_PATTERNS.filter((pattern) => lower.includes(pattern))
}

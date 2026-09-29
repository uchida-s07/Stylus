// 秘密情報の形（COMMON-N-004）。検査はこのファイルだけから形を読む（CI のビルド成果物の検査 T-22 も同じ）
// 形をほかのファイルにじかに書くと、そのファイル自身が検査に引っかかる。このファイルは検査から除く
export const SECRET_PATTERNS_FILE = 'packages/repo-checks/src/secret-patterns.ts'

export const SECRET_PATTERNS = ['sb_secret_', 'postgres://', 'postgresql://'] as const

// 文字列に含まれる秘密情報の形を返す（大文字・小文字は区別しない）
export function findSecretPatterns(text: string): string[] {
  const lower = text.toLowerCase()
  return SECRET_PATTERNS.filter((pattern) => lower.includes(pattern))
}

// 秘密情報の値の形。ビルド成果物は、ライブラリが形の文字列そのもの（supabase-js がキーの見分けに使う sb_secret_）を
// 含むので、実際の値が入っているときの形で探す
// - sb_secret_ の後ろにキーの文字が16文字以上続く
// - postgres:// / postgresql:// の後ろに「ユーザー:パスワード@」が続く（パスワード入りの接続文字列）
const SECRET_VALUE_REGEXPS: Record<(typeof SECRET_PATTERNS)[number], RegExp> = {
  sb_secret_: /sb_secret_[a-z0-9_-]{16,}/i,
  'postgres://': /postgres:\/\/[^\s:@/'"`]+:[^\s@/'"`]+@/i,
  'postgresql://': /postgresql:\/\/[^\s:@/'"`]+:[^\s@/'"`]+@/i,
}

// 文字列に含まれる秘密情報の値の形を、該当する形の名前で返す
export function findSecretValues(text: string): string[] {
  return SECRET_PATTERNS.filter((pattern) => SECRET_VALUE_REGEXPS[pattern].test(text))
}

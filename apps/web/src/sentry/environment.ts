// Sentry の environment（COMMON-N-011）。本番と開発を分けて見るため
// Cloudflare Pages はビルドのときにブランチ名を CF_PAGES_BRANCH で渡す。
// main（Pages の本番ブランチ）なら production、それ以外（develop・spec/*・手元のビルド）は development
export function sentryEnvironment(branch: string | undefined) {
  return branch === 'main' ? 'production' : 'development'
}

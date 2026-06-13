/**
 * Helpers for dynamically assigned service domains. When a service's
 * configured domain is already owned by another running service (the
 * side-by-side worktree case), the service is started on a unique domain
 * derived from the configured one instead.
 */

/** Reduce a string to characters that are valid inside a DNS label. */
const slugifyLabel = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Build a dynamic domain by suffixing the first DNS label, so the result
 * stays covered by the same wildcard cert and DNS entry as the original:
 * `hello.denvig.me` + `jit-domains` → `hello-jit-domains.denvig.me`.
 * Returns the domain unchanged when the suffix has no usable characters.
 */
export const buildDynamicDomain = (domain: string, suffix: string): string => {
  const slug = slugifyLabel(suffix)
  if (!slug) return domain
  const [first, ...rest] = domain.split('.')
  return [`${first}-${slug}`, ...rest].join('.')
}

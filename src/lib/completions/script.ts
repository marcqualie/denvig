/**
 * Zsh completion script template for Denvig.
 * This script gets installed to the user's completions directory.
 */
export const zshCompletionScript = `#compdef denvig

_denvig() {
  local -a completions
  local val desc

  # Get completions from denvig
  while IFS=: read -r val desc; do
    [[ -n "$val" ]] && completions+=("$val")
  done < <(denvig zsh __complete__ -- "\${words[*]}" "\${CURRENT}" 2>/dev/null)

  (( \${#completions} )) && compadd -a completions
}
`

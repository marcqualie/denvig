/**
 * Zsh completion script template for Denvig.
 * This script gets installed to the user's completions directory.
 */
export const zshCompletionScript = `#compdef denvig

_denvig() {
  local completions
  # Pass current words and cursor position to denvig
  completions=$(denvig zsh __complete__ -- "\${words[*]}" "$CURRENT" 2>/dev/null)

  local -a opts
  while IFS=: read -r val desc; do
    [[ -n "$val" ]] && opts+=("$val:$desc")
  done <<< "$completions"

  _describe 'command' opts
}

_denvig "$@"
`

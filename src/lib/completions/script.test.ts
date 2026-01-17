import { ok } from 'node:assert'
import { execSync } from 'node:child_process'
import { describe, it } from 'node:test'

/**
 * Simulate zsh completion by setting words and CURRENT, then running
 * the completion function and capturing what compadd receives.
 */
function getZshCompletions(
  commandLine: string,
  cursorPosition: number,
): string[] {
  // Create a test script that simulates zsh completion
  const testScript = `
    # Mock compadd to capture completions
    completions_result=()
    compadd() {
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --) shift; completions_result+=("$@"); return ;;
          -a) shift; eval "completions_result+=(\\\${$1[@]})" ; return ;;
          -d|-t|-X) shift ;;
          -*) ;;
          *) completions_result+=("$1") ;;
        esac
        shift
      done
    }

    # Set up completion context
    words=(${commandLine})
    CURRENT=${cursorPosition}

    # Define the completion function (without #compdef line)
    _denvig() {
      local -a completions
      local val desc

      while IFS=: read -r val desc; do
        [[ -n "$val" ]] && completions+=("$val")
      done < <(denvig zsh __complete__ -- "\${words[*]}" "\${CURRENT}" 2>/dev/null)

      (( \${#completions} )) && compadd -a completions
    }

    # Run completion
    _denvig

    # Output results
    printf '%s\\n' "\${completions_result[@]}"
  `

  try {
    const result = execSync(`zsh -c '${testScript.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
      env: { ...process.env, PATH: `${process.cwd()}/bin:${process.env.PATH}` },
    }).trim()

    return result ? result.split('\n').filter((line) => line.length > 0) : []
  } catch (error) {
    console.error('Zsh completion test failed:', error)
    return []
  }
}

/**
 * Simulate zsh completion with explicit words array (for trailing space cases)
 */
function getZshCompletionsWithWords(
  wordsArray: string[],
  cursorPosition: number,
): string[] {
  // Build zsh array syntax: ("word1" "word2" "")
  const wordsZshArray = wordsArray.map((w) => `"${w}"`).join(' ')

  const testScript = `
    # Mock compadd to capture completions
    completions_result=()
    compadd() {
      while [[ $# -gt 0 ]]; do
        case "$1" in
          -a) shift; eval "completions_result+=(\\\${$1[@]})" ; return ;;
          -d|-t|-X) shift ;;
          -*) ;;
          *) completions_result+=("$1") ;;
        esac
        shift
      done
    }

    # Set up completion context with explicit words array
    words=(${wordsZshArray})
    CURRENT=${cursorPosition}

    _denvig() {
      local -a completions
      local val desc

      while IFS=: read -r val desc; do
        [[ -n "$val" ]] && completions+=("$val")
      done < <(denvig zsh __complete__ -- "\${words[*]}" "\${CURRENT}" 2>/dev/null)

      (( \${#completions} )) && compadd -a completions
    }

    _denvig

    printf '%s\\n' "\${completions_result[@]}"
  `

  try {
    const result = execSync(`zsh -c '${testScript.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
      env: { ...process.env, PATH: `${process.cwd()}/bin:${process.env.PATH}` },
    }).trim()

    return result ? result.split('\n').filter((line) => line.length > 0) : []
  } catch (error) {
    console.error('Zsh completion test failed:', error)
    return []
  }
}

describe('zsh completion script', () => {
  describe('top-level commands (denvig <tab>)', () => {
    it('should complete top-level commands when cursor is at position 2', () => {
      const completions = getZshCompletions('denvig', 2)

      ok(
        completions.includes('run'),
        `Expected 'run' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('services'),
        `Expected 'services' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('deps'),
        `Expected 'deps' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('version'),
        `Expected 'version' in completions, got: ${completions}`,
      )
    })
  })

  describe('services subcommands (denvig services <tab>)', () => {
    it('should complete services subcommands when cursor is at position 3', () => {
      const completions = getZshCompletions('denvig services', 3)

      console.log('Services completions:', completions)

      ok(
        completions.includes('start'),
        `Expected 'start' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('stop'),
        `Expected 'stop' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('restart'),
        `Expected 'restart' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('status'),
        `Expected 'status' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('logs'),
        `Expected 'logs' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('teardown'),
        `Expected 'teardown' in completions, got: ${completions}`,
      )

      // Should NOT include top-level commands
      ok(
        !completions.includes('run'),
        `Should not include 'run' in services subcommands`,
      )
      ok(
        !completions.includes('version'),
        `Should not include 'version' in services subcommands`,
      )
    })
  })

  describe('deps subcommands (denvig deps <tab>)', () => {
    it('should complete deps subcommands when cursor is at position 3', () => {
      const completions = getZshCompletions('denvig deps', 3)

      ok(
        completions.includes('list'),
        `Expected 'list' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('outdated'),
        `Expected 'outdated' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('why'),
        `Expected 'why' in completions, got: ${completions}`,
      )

      // Should NOT include top-level commands
      ok(
        !completions.includes('run'),
        `Should not include 'run' in deps subcommands`,
      )
    })
  })

  describe('service names (denvig services start <tab>)', () => {
    it('should complete service names when cursor is at position 4', () => {
      const completions = getZshCompletions('denvig services start', 4)

      // The denvig project has hello and wontlaunch services
      ok(
        completions.includes('hello'),
        `Expected 'hello' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('wontlaunch'),
        `Expected 'wontlaunch' in completions, got: ${completions}`,
      )
    })
  })

  describe('trailing space simulation (how zsh actually calls completion)', () => {
    it('should complete services subcommands with trailing space', () => {
      // When user types "denvig services " (with trailing space)
      // zsh sets words=("denvig" "services" "") and CURRENT=3
      const completions = getZshCompletionsWithWords(
        ['denvig', 'services', ''],
        3,
      )

      console.log('Services completions with trailing space:', completions)

      ok(
        completions.includes('start'),
        `Expected 'start' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('stop'),
        `Expected 'stop' in completions, got: ${completions}`,
      )
      ok(
        !completions.includes('run'),
        `Should not include 'run' in services subcommands`,
      )
    })

    it('should complete top-level commands with trailing space', () => {
      // When user types "denvig " (with trailing space)
      // zsh sets words=("denvig" "") and CURRENT=2
      const completions = getZshCompletionsWithWords(['denvig', ''], 2)

      console.log('Top-level completions with trailing space:', completions)

      ok(
        completions.includes('run'),
        `Expected 'run' in completions, got: ${completions}`,
      )
      ok(
        completions.includes('services'),
        `Expected 'services' in completions, got: ${completions}`,
      )
    })
  })
})

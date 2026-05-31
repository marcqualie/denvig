import { safeReadTextFile } from '../safeReadFile.ts'
import { runInherit } from './process.ts'

const SUDO_LOCAL_PATH = '/etc/pam.d/sudo_local'
const SUDO_PATH = '/etc/pam.d/sudo'

const PAM_TID_PATTERN = /^\s*auth\s+sufficient\s+pam_tid\.so/m

/** Whether `pam_tid.so` is configured for sudo (i.e. Touch ID is enabled). */
export const isSudoTouchIdEnabled = async (): Promise<boolean> => {
  for (const path of [SUDO_LOCAL_PATH, SUDO_PATH]) {
    const content = await safeReadTextFile(path)
    if (content && PAM_TID_PATTERN.test(content)) {
      return true
    }
  }
  return false
}

/**
 * Append the `pam_tid.so` line to `/etc/pam.d/sudo_local`. Requires sudo.
 */
export const enableSudoTouchId = (): Promise<boolean> => {
  const line = 'auth       sufficient     pam_tid.so'
  const cmd = `echo '${line}' | sudo tee -a ${SUDO_LOCAL_PATH} > /dev/null`
  return runInherit('sh', ['-c', cmd])
}

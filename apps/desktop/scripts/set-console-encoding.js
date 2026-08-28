/**
 * 设置控制台编码为 UTF-8，解决中文乱码问题
 * 这个脚本在 Windows 上设置控制台代码页为 UTF-8
 */
import { exec } from 'node:child_process'
import os from 'node:os'
import { log } from '@vidbee/logger/script'

if (os.platform() === 'win32') {
  log.log('Setting console encoding to UTF-8...')

  // 设置控制台代码页为 UTF-8 (65001)
  exec('chcp 65001', (error, stdout, stderr) => {
    if (error) {
      log.warn('Failed to set console code page:', error)
      return
    }

    if (stderr) {
      log.warn('Console code page setting warning:', stderr)
    }

    log.log('Console encoding set to UTF-8')
    log.log('Output:', stdout)
  })
} else {
  log.log('Not on Windows, no console encoding change needed')
}

import { type IpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import type { PlayerAttachInput, PlayerAttachResult } from '../../../shared/types/player'
import { getPlayerHost } from '../../lib/player-host'

class PlayerService extends IpcService {
  static readonly groupName = 'player'

  /**
   * Prepare a Chromium-playable local file for the in-page player.
   */
  @IpcMethod()
  attach(_context: IpcContext, input: PlayerAttachInput): Promise<PlayerAttachResult> {
    return getPlayerHost().attach(input)
  }

  /**
   * Cancel an in-flight media prepare.
   */
  @IpcMethod()
  detach(_context: IpcContext): Promise<void> {
    return getPlayerHost().detach()
  }
}

export { PlayerService }

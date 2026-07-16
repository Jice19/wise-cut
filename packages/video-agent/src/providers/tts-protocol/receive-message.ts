/* */
import { parseTtsMessageFrame } from './frame';
import type { TtsProtocolMessage, TtsProtocolSocket } from './types';

export const receiveMessage = async (
    socket: TtsProtocolSocket
): Promise<TtsProtocolMessage> => parseTtsMessageFrame(await socket.receive());

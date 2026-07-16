/* */
import { randomUUID } from 'node:crypto';

import { createTtsMessageFrame } from './frame';
import { EventType, MsgType, type TtsProtocolSocket } from './types';

export const fullClientRequest = async (
    socket: TtsProtocolSocket,
    payload: Uint8Array,
    {
        sessionId = randomUUID()
    }: {
        sessionId?: string;
    } = {}
): Promise<void> => {
    await socket.send(
        createTtsMessageFrame({
            event: EventType.StartSession,
            msgType: MsgType.FullClientRequest,
            payload,
            sessionId
        })
    );
};

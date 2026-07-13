/**
 * FullClientRequest 发送 helper。
 *
 * 业务侧只需要给 payload JSON 的字节,本函数负责:
 *   - 生成 sessionId(uuid)
 *   - 构造 event=StartSession(100) / msgType=FullClientRequest(0x1)
 *   - encode → 通过 socket.send 发出去
 */

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

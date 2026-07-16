/* */
import { describe, expect, it } from 'vitest';

import {
    createTtsMessageFrame,
    EventType,
    fullClientRequest,
    MsgType,
    receiveMessage,
    type TtsProtocolSocket
} from '../src/providers/tts-protocol';

class FakeProtocolSocket implements TtsProtocolSocket {
    public readonly sent: Uint8Array[] = [];

    constructor(private readonly incoming: Uint8Array[] = []) {}

    async close() {
        return undefined;
    }

    async receive() {
        const next = this.incoming.shift();

        if (!next) {
            throw new Error('No incoming protocol message');
        }

        return next;
    }

    async send(data: Uint8Array) {
        this.sent.push(data);
    }
}

describe('tts protocol', () => {
    it('sends a full client request frame with a session event and JSON payload', async () => {
        const socket = new FakeProtocolSocket();
        const payload = new TextEncoder().encode(
            JSON.stringify({ req_params: { text: '智剪' } })
        );

        await fullClientRequest(socket, payload, {
            sessionId: 'session-001'
        });

        expect(socket.sent).toHaveLength(1);

        const sentSocket = new FakeProtocolSocket(socket.sent);
        const message = await receiveMessage(sentSocket);

        expect(message).toMatchObject({
            event: EventType.StartSession,
            msgType: MsgType.FullClientRequest,
            sessionId: 'session-001'
        });
        expect(new TextDecoder().decode(message.payload)).toBe(
            JSON.stringify({ req_params: { text: '智剪' } })
        );
    });

    it('decodes audio chunks and session finished events', async () => {
        const audioPayload = new Uint8Array([1, 2, 3, 4]);
        const socket = new FakeProtocolSocket([
            createTtsMessageFrame({
                event: EventType.TtsResponse,
                msgType: MsgType.AudioOnlyServer,
                payload: audioPayload,
                sessionId: 'session-001'
            }),
            createTtsMessageFrame({
                event: EventType.SessionFinished,
                msgType: MsgType.FullServerResponse,
                payload: new Uint8Array(),
                sessionId: 'session-001'
            })
        ]);

        const audioMessage = await receiveMessage(socket);
        const finishedMessage = await receiveMessage(socket);

        expect(audioMessage).toMatchObject({
            event: EventType.TtsResponse,
            msgType: MsgType.AudioOnlyServer,
            sessionId: 'session-001'
        });
        expect([...audioMessage.payload]).toEqual([1, 2, 3, 4]);
        expect(finishedMessage).toMatchObject({
            event: EventType.SessionFinished,
            msgType: MsgType.FullServerResponse
        });
    });

    it('decodes protocol error events without dropping the error payload', async () => {
        const socket = new FakeProtocolSocket([
            createTtsMessageFrame({
                errorCode: 401,
                event: EventType.SessionFailed,
                msgType: MsgType.Error,
                payload: new TextEncoder().encode(
                    'provider failed with ark-sensitive-token-123456'
                ),
                sessionId: 'session-001'
            })
        ]);

        const message = await receiveMessage(socket);

        expect(message).toMatchObject({
            errorCode: 401,
            event: EventType.SessionFailed,
            msgType: MsgType.Error
        });
        expect(new TextDecoder().decode(message.payload)).toContain(
            'ark-sensitive-token-123456'
        );
    });
});

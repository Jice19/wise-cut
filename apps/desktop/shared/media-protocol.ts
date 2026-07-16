
export const mediaProtocolScheme = 'miaoma-media';

export type MediaAssetKind = 'thumbnail' | 'video' | 'voice';

export type MediaAssetUrlInput = {
    assetId: string;
    kind: MediaAssetKind;
    projectId: string;
};

export type ParsedMediaAssetUrl = MediaAssetUrlInput;

export type CustomVoicePreviewUrlInput = {
    voiceId: string;
};

export type ParsedCustomVoicePreviewUrl = CustomVoicePreviewUrlInput;

export const createMediaAssetUrl = ({
    assetId,
    kind,
    projectId
}: MediaAssetUrlInput) =>
    `${mediaProtocolScheme}://project/${encodeURIComponent(
        projectId
    )}/${kind}/${encodeURIComponent(assetId)}`;

export const parseMediaAssetUrl = (
    source: string
): ParsedMediaAssetUrl | undefined => {
    let url: URL;

    try {
        url = new URL(source);
    } catch {
        return undefined;
    }

    if (url.protocol !== `${mediaProtocolScheme}:`) return undefined;
    if (url.hostname !== 'project') return undefined;

    const [projectId, kind, assetId] = url.pathname
        .split('/')
        .filter(Boolean)
        .map((part) => decodeURIComponent(part));

    if (!projectId || !assetId) return undefined;
    if (kind !== 'thumbnail' && kind !== 'video' && kind !== 'voice') {
        return undefined;
    }

    return {
        assetId,
        kind,
        projectId
    };
};

export const createCustomVoicePreviewUrl = ({
    voiceId
}: CustomVoicePreviewUrlInput) =>
    `${mediaProtocolScheme}://custom-voice/${encodeURIComponent(
        voiceId
    )}/reference`;

export const parseCustomVoicePreviewUrl = (
    source: string
): ParsedCustomVoicePreviewUrl | undefined => {
    let url: URL;

    try {
        url = new URL(source);
    } catch {
        return undefined;
    }

    if (url.protocol !== `${mediaProtocolScheme}:`) return undefined;
    if (url.hostname !== 'custom-voice') return undefined;

    const [voiceId, resource] = url.pathname
        .split('/')
        .filter(Boolean)
        .map((part) => decodeURIComponent(part));

    if (!voiceId || resource !== 'reference') return undefined;

    return {
        voiceId
    };
};

/* */
export const apiConfigIpcChannels = {
    clear: 'api-config:clear',
    getStatus: 'api-config:get-status',
    set: 'api-config:set'
} as const;

export type ApiConfigIpcChannel =
    (typeof apiConfigIpcChannels)[keyof typeof apiConfigIpcChannels];

export type ApiConfigSetInput = {
    apiKey: string;
};

export type ApiConfigStatus = {
    isConfigured: boolean;
};

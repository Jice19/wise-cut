
export const videoAgentIpcChannels = {
    analyzeAsset: 'videoAgent:analyzeAsset',
    approve: 'videoAgent:approve',
    cancel: 'videoAgent:cancel',
    event: 'videoAgent:event',
    regenerateScene: 'videoAgent:regenerateScene',
    regenerateVoices: 'videoAgent:regenerateVoices',
    reportSelectedFrames: 'videoAgent:reportSelectedFrames',
    start: 'videoAgent:start'
} as const;


import type { ConfigMode, SubtitlePreviewStyle } from './config';

export type { ConfigMode } from './config';

export type EditorIconName =
    | 'arrow-down'
    | 'arrow-up'
    | 'audio-lines'
    | 'captions'
    | 'chevron-up'
    | 'chevron-down'
    | 'check'
    | 'download'
    | 'ellipsis'
    | 'folder'
    | 'folder-open'
    | 'house'
    | 'image'
    | 'link'
    | 'list-video'
    | 'magnet'
    | 'maximize'
    | 'maximize-2'
    | 'mic'
    | 'gauge'
    | 'minus'
    | 'music'
    | 'music-2'
    | 'pause'
    | 'play'
    | 'plus'
    | 'sparkles'
    | 'upload'
    | 'redo-2'
    | 'scissors'
    | 'send'
    | 'undo-2'
    | 'trash-2'
    | 'x'
    | 'volume-2'
    | 'volume';

export type StoryboardCardTone = 'current' | 'default';

export type StoryboardItem = {
    title: string;
    time: string;
    body: string;
    endMs?: number;
    sceneId?: string;
    startMs?: number;
    tone: StoryboardCardTone;
};

export type AssistantTag = {
    label: string;
    value: string;
};

export type RailMode = {
    label: string;
    icon: EditorIconName;
    tone: 'current' | 'default';
    mode: ConfigMode;
};

export type TimelineTrackKind = 'video' | 'voice' | 'subtitle' | 'music';

export type TimelineTrack = {
    id: TimelineTrackKind;
    icon: Extract<EditorIconName, 'image' | 'mic' | 'captions' | 'music'>;
    title: string;
    meta: string;
    tone: 'primary' | 'muted';
};

export type TimelineToolAction = {
    label: string;
    icon: Extract<EditorIconName, 'magnet' | 'audio-lines'>;
    tone: 'default' | 'active';
};

export type TimelineClip = {
    kind: TimelineTrackKind;
    label: string;
    widthPx: number;
    durationSeconds: number;
    colorClassName: string;
    caption?: string;
    sceneId?: string;
    showThumbnails?: boolean;
    startMs?: number;
    bars?: number;
};

export type TimelineLayout = {
    sectionHeightClassName: string;
    contentGridClassName: string;
    contentRowsClassName: string;
    contentMinWidthClassName: string;
    titleBarHeightClassName: string;
    tickWidthClassName: string;
    contentWidthPx?: number;
    tickWidthPx?: number;
};

export type PreviewSubtitleCue = {
    endMs: number;
    id: string;
    startMs: number;
    style?: SubtitlePreviewStyle;
    text: string;
};

export type PreviewVoiceCue = {
    endMs: number;
    id: string;
    playbackRate?: number;
    source: string;
    startMs: number;
    volume?: number;
};

export type PreviewMusicCue = {
    durationMs: number;
    source: string;
    title: string;
    volume: number;
};

export type PreviewSegment = {
    alt: string;
    endMs: number;
    id: string;
    playbackRate?: number;
    posterSource?: string;
    source: string;
    sourceEndMs: number;
    sourceStartMs: number;
    startMs: number;
    subtitleCues: PreviewSubtitleCue[];
    voiceCues?: PreviewVoiceCue[];
    voiceSource?: string;
};

export type PreviewData =
    | {
          alt: string;
          durationMs: number;
          music?: PreviewMusicCue;
          source: string;
          type: 'image';
      }
    | {
          alt: string;
          durationMs: number;
          music?: PreviewMusicCue;
          posterSource?: string;
          segments: PreviewSegment[];
          source: string;
          type: 'video';
      };

export type StoryboardSummary = {
    title: string;
    meta: string;
};

export type StoryboardData = {
    items: StoryboardItem[];
    summary: StoryboardSummary;
};

export type TimelinePanelSummary = {
    timecode: string;
    title: string;
};

export type TimelineData = {
    clipsByTrack: Record<TimelineTrackKind, TimelineClip[]>;
    layout: TimelineLayout;
    panel: TimelinePanelSummary;
    playhead: {
        currentTimeMs: number;
        progress: number;
    };
    ticks: string[];
    tracks: TimelineTrack[];
};

export type EditorScreenData = {
    preview: PreviewData;
    storyboard: StoryboardData;
    timeline: TimelineData;
};


import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { VideoProject } from '@wise-cut/video-project';

import { MiaojianEditorScreen } from './MiaojianEditorScreen';

type EditorProjectLoadState =
    | {
          error?: string;
          project?: undefined;
          status: 'failed' | 'idle' | 'loading';
      }
    | {
          error?: undefined;
          project: VideoProject;
          status: 'loaded';
      };

const getProjectErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;

    return String(error);
};

export const MiaojianEditorRoute = () => {
    const { projectId } = useParams();
    const [loadState, setLoadState] = useState<EditorProjectLoadState>({
        status: projectId ? 'loading' : 'idle'
    });
    const project =
        loadState.status === 'loaded' ? loadState.project : undefined;

    useEffect(() => {
        let isCurrent = true;

        if (!projectId) {
            setLoadState({ status: 'idle' });
            return () => {
                isCurrent = false;
            };
        }

        setLoadState({ status: 'loading' });

        window.miaomaAPI.videoProject
            .readById(projectId)
            .then((result) => {
                if (!isCurrent) return;

                if (result.success === false) {
                    setLoadState({
                        error: result.error.message,
                        status: 'failed'
                    });
                    return;
                }

                setLoadState({
                    project: result.data,
                    status: 'loaded'
                });
            })
            .catch((error: unknown) => {
                if (!isCurrent) return;

                setLoadState({
                    error: getProjectErrorMessage(error),
                    status: 'failed'
                });
            });

        return () => {
            isCurrent = false;
        };
    }, [projectId]);

    return (
        <div className="relative">
            <MiaojianEditorScreen project={project} />
            {loadState.status === 'loading' ? (
                <div className="pointer-events-none absolute right-6 top-20 rounded-[12px] border border-[#3B3948] bg-[#171821CC] px-4 py-3 text-[13px] font-[800] text-[#EAE7F2] shadow-[0_18px_48px_rgba(0,0,0,0.26)] backdrop-blur-[18px]">
                    正在加载工程
                </div>
            ) : null}
            {loadState.status === 'failed' ? (
                <div className="absolute right-6 top-20 max-w-[360px] rounded-[12px] border border-[#5D3141] bg-[#2A1720E6] px-4 py-3 text-[13px] font-[800] leading-[1.45] text-[#FFD9E2] shadow-[0_18px_48px_rgba(0,0,0,0.3)] backdrop-blur-[18px]">
                    {loadState.error}
                </div>
            ) : null}
        </div>
    );
};

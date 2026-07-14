/**
 * SceneApprovalDialog 组件渲染测试 —— happy-dom 跑 RTL。
 *
 * 断言:
 *   - 渲染 brief title/tone/audience
 *   - 每个 scene 卡片显示 sceneId + 时长 + narration + visualBrief
 *   - 点"批准" → onApprove(true)
 *   - 点"驳回" → onApprove(false)
 *   - 点遮罩 / Escape → onClose
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SceneApprovalRequest } from '../../shared/ipc.ts';
import {
    SceneApprovalDialog,
    type SceneApprovalDialogProps
} from '../components/SceneApprovalDialog.tsx';

const buildRequest = (): SceneApprovalRequest => ({
    payload: {
        brief: {
            audience: '25-35 岁程序员',
            keyMessages: ['AI 剪辑'],
            summary: '一段 AI 剪辑演示',
            title: '春日 Vlog',
            tone: '科技感 + 简洁'
        },
        scenes: [
            {
                endMs: 3000,
                narration: '欢迎来到 AI 剪辑世界',
                sceneId: 's-1',
                startMs: 0,
                visualBrief: '全景镜头,展示 logo'
            },
            {
                endMs: 6000,
                narration: '接下来是分镜二',
                sceneId: 's-2',
                startMs: 3000,
                visualBrief: '中景对话'
            }
        ]
    },
    type: 'scene-plan'
});

const renderDialog = (
    overrides: Partial<SceneApprovalDialogProps> = {}
): {
    onApprove: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
} => {
    const onApprove = vi.fn();
    const onClose = vi.fn();
    render(
        <SceneApprovalDialog
            onApprove={onApprove}
            onClose={onClose}
            request={buildRequest()}
            {...overrides}
        />
    );
    return { onApprove, onClose };
};

describe('SceneApprovalDialog', () => {
    afterEach(() => {
        cleanup();
    });

    it('渲染 brief 元信息 + 每个 scene 卡片', () => {
        renderDialog();

        // brief 元信息(文本节点连续 getByText 默认按整节点,这里用全文档
        // 正则匹配更稳)
        expect(screen.getByText(/春日 Vlog/)).toBeTruthy();
        expect(screen.getByText(/科技感/)).toBeTruthy();
        expect(screen.getByText(/25-35/)).toBeTruthy();

        // 每个 scene 的 narration + visualBrief
        expect(screen.getByText('欢迎来到 AI 剪辑世界')).toBeTruthy();
        expect(screen.getByText('画面:全景镜头,展示 logo')).toBeTruthy();
        expect(screen.getByText('接下来是分镜二')).toBeTruthy();
        expect(screen.getByText('画面:中景对话')).toBeTruthy();

        // sceneId
        expect(screen.getByText('s-1')).toBeTruthy();
        expect(screen.getByText('s-2')).toBeTruthy();
    });

    it('点"批准并继续" → onApprove(true)', () => {
        const { onApprove, onClose } = renderDialog();
        fireEvent.click(screen.getByText('批准并继续'));
        expect(onApprove).toHaveBeenCalledWith(true);
        expect(onClose).toHaveBeenCalled();
    });

    it('点"驳回" → onApprove(false)', () => {
        const { onApprove, onClose } = renderDialog();
        fireEvent.click(screen.getByText('驳回'));
        expect(onApprove).toHaveBeenCalledWith(false);
        expect(onClose).toHaveBeenCalled();
    });

    it('Escape 键触发 onClose', () => {
        const { onClose } = renderDialog();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});

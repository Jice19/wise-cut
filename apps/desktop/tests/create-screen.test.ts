/* */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { VoiceSelect } from '../renderer/components/create/VoiceSelect';
import { createPageContent } from '../renderer/constants/create';
import { appRoutes } from '../renderer/router';

describe('MiaojianCreateScreen', () => {
    it('registers create as the root tab inside the shared workspace page', () => {
        expect(appRoutes.some((route) => route.path === '/')).toBe(true);
        expect(appRoutes.some((route) => route.path === '/editor')).toBe(true);

        const rootRoute = appRoutes.find((route) => route.path === '/');
        const workspaceRoute = appRoutes.find(
            (route) => route.path === '/workspace'
        );
        const html = renderToStaticMarkup(rootRoute?.element);

        expect(isValidElement(rootRoute?.element)).toBe(true);
        expect(isValidElement(workspaceRoute?.element)).toBe(true);
        expect(
            isValidElement(rootRoute?.element) &&
                isValidElement(workspaceRoute?.element) &&
                rootRoute.element.type === workspaceRoute.element.type
        ).toBe(true);
        expect(html).toContain('文字成影');
        expect(html).toContain('灵感即现');
        expect(html).not.toContain('href="/workspace"');
    });

    it('renders the create tab from the Pencil frame with the shared sidebar', () => {
        const rootRoute = appRoutes.find((route) => route.path === '/');
        const html = renderToStaticMarkup(rootRoute?.element);

        expect(
            existsSync(resolve(__dirname, '../renderer/components/create'))
        ).toBe(true);
        expect(html).toContain('智剪 Magicut');
        expect(html).toContain('智能视频剪辑工具');
        expect(html).toContain('workspace-sidebar-aurora-layer');
        expect(html).toContain('创作');
        expect(html).toContain('aria-current="page"');
        expect(html).toContain('文字成影');
        expect(html).toContain('灵感即现');
        expect(html).toContain('顷刻成帧，每一种表达都自有回响');
        expect(html).toContain('absolute left-[149px] top-[155px]');
        expect(html).toContain('absolute left-[129px] top-[362px]');
        expect(html).not.toContain('create-agent-progress');
    });

    it('matches the manuscript input panel and the content-level SoftAurora effect', () => {
        const rootRoute = appRoutes.find((route) => route.path === '/');
        const html = renderToStaticMarkup(rootRoute?.element);
        const inputPanelSource = readFileSync(
            resolve(
                __dirname,
                '../renderer/components/create/CreateInputPanel.tsx'
            ),
            'utf8'
        );
        const softAuroraPath = resolve(
            __dirname,
            '../renderer/components/reactbits/SoftAurora/SoftAurora.tsx'
        );

        expect(existsSync(softAuroraPath)).toBe(true);
        expect(html).toContain('h-[390px] w-[1340px]');
        expect(html).toContain('rounded-[30px]');
        expect(html).toContain('border-2 border-[#3A3945]');
        expect(html).toContain('输入文稿');
        expect(html).toContain('上传口播音频');
        expect(html).toContain('输入/粘贴视频文稿，为你生成精彩视频');
        expect(html).toContain('0 / 10000');
        expect(html).toContain('aria-label="配音"');
        expect(html).not.toContain('<select');
        expect(html).toContain('create-voice-select-trigger');
        expect(html).toContain('温婉学姐');
        expect(html).toContain('创建');
        expect(html).toContain('right-[32px] top-[313px]');
        expect(html).toContain('textarea');
        expect(inputPanelSource).toContain(
            'text-[22px] font-normal leading-[1.35]'
        );
        expect(inputPanelSource).toContain(
            "font-['Geist'] text-[22px] font-normal"
        );
        expect(html).toContain('maxLength="10000"');
        expect(html).toContain('create-main-soft-aurora-layer');
        expect(html).not.toContain('create-input-soft-aurora-layer');
        expect(html).toContain('soft-aurora-container');
        expect(html).not.toContain('create-agent-progress');

        const softAuroraSource = readFileSync(softAuroraPath, 'utf8');
        expect(softAuroraSource).toContain('float auroraGlow');
        expect(softAuroraSource).toContain('uBandHeight');
        expect(softAuroraSource).toContain('uMouseInfluence');
    });

    it('renders the custom voice menu from the Pencil dropdown frame', () => {
        const html = renderToStaticMarkup(
            createElement(VoiceSelect, {
                defaultOpen: true,
                labelPrefix: createPageContent.voiceLabelPrefix,
                onChange: () => undefined,
                options: createPageContent.voiceOptions,
                value: '温婉学姐'
            })
        );

        expect(html).toContain('create-voice-select-trigger');
        expect(html).toContain('w-[278px]');
        expect(html).toContain('h-[58px]');
        expect(html).toContain('border-[#6B5B80]');
        expect(html).toContain('top-[68px]');
        expect(html).toContain('h-[202px]');
        expect(html).toContain('rounded-[16px]');
        expect(html).toContain('bg-[#1E1E27F2]');
        expect(html).toContain('border-[#3B3948]');
        expect(html).toContain('role="listbox"');
        expect(html).toContain('role="option"');
        expect(html).toContain(
            'bg-[linear-gradient(90deg,#8B6AF7_0%,#BF40FF_55%,#F05F73_100%)]'
        );
        expect(html).toContain('柔和亲切 · 适合知识口播');
        expect(html).toContain('清晰正式 · 适合资讯解说');
        expect(html).toContain('低沉可靠 · 适合商业叙事');
        expect(html).toContain('明快有力 · 适合教程种草');
        expect(html.indexOf('新闻播报')).toBeLessThan(html.indexOf('沉稳男声'));
    });

    it('defines voice_type for every create voice option', () => {
        expect(createPageContent.voiceOptions).toEqual([
            expect.objectContaining({
                label: '温婉学姐',
                voiceType: 'zh_female_wenroushunv_uranus_bigtts'
            }),
            expect.objectContaining({
                label: '新闻播报',
                voiceType: 'zh_male_cixingjieshuonan_uranus_bigtts'
            }),
            expect.objectContaining({
                label: '沉稳男声',
                voiceType: 'zh_male_gaolengchenwen_uranus_bigtts'
            }),
            expect.objectContaining({
                label: '活力讲解',
                voiceType: 'zh_male_huolixiaoge_uranus_bigtts'
            })
        ]);
    });

    it('uses an extracted animated gradient text component with design colors', () => {
        const rootRoute = appRoutes.find((route) => route.path === '/');
        const html = renderToStaticMarkup(rootRoute?.element);
        const gradientTextPath = resolve(
            __dirname,
            '../renderer/components/create/GradientText.tsx'
        );

        expect(existsSync(gradientTextPath)).toBe(true);
        expect(html).toContain('gradient-text-motion');
        expect(html).toContain('#E9FFD0');
        expect(html).toContain('#FF92E9');
        expect(html).toContain('#7E62FF');
    });
});

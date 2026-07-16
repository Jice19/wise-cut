- All rights reserved.
# Miaojian Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/workspace` route that renders the Pencil-based Miaojian workspace page, while preserving the existing editor page at `/`.

**Architecture:** Build the workspace as a separate page with its own `workspace` component folder, dedicated constants/types, and local image assets. Keep the existing editor architecture untouched, use links for navigation into `/`, and keep all display data in constants so the UI remains declarative.

**Tech Stack:** React 19, React Router 7, Tailwind CSS v4, Vitest, renderer-side local assets

**Execution note:** Do not create commits automatically during implementation unless the user explicitly asks for one.

---

## File Map

### Create

- `apps/desktop/renderer/pages/MiaojianWorkspaceScreen.tsx`
- `apps/desktop/renderer/components/workspace/WorkspaceSidebar.tsx`
- `apps/desktop/renderer/components/workspace/WorkspaceSidebarNavItem.tsx`
- `apps/desktop/renderer/components/workspace/WorkspaceHeader.tsx`
- `apps/desktop/renderer/components/workspace/WorkspaceProjectGrid.tsx`
- `apps/desktop/renderer/components/workspace/WorkspaceCreateCard.tsx`
- `apps/desktop/renderer/components/workspace/WorkspaceProjectCard.tsx`
- `apps/desktop/renderer/constants/workspace.ts`
- `apps/desktop/renderer/types/workspace.ts`
- `apps/desktop/renderer/assets/workspace/*`
- `apps/desktop/tests/workspace-screen.test.ts`

### Modify

- `apps/desktop/renderer/router/index.tsx`
- `apps/desktop/renderer/components/Icon.tsx`
- `apps/desktop/renderer/types/editor-screen.ts`
- `apps/desktop/renderer/index.css` (only if the workspace needs shared scrollbar or background polish not appropriate in component scope)

---

### Task 1: Add failing coverage for the workspace route and page contract

**Files:**
- Create: `apps/desktop/tests/workspace-screen.test.ts`
- Modify: `apps/desktop/renderer/router/index.tsx`
- Test: `apps/desktop/tests/workspace-screen.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/tests/workspace-screen.test.ts` with:

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { router } from '../renderer/router';
import { MiaojianWorkspaceScreen } from '../renderer/pages/MiaojianWorkspaceScreen';

describe('MiaojianWorkspaceScreen', () => {
    it('registers a dedicated /workspace route', () => {
        expect(router.routes.some((route) => route.path === '/workspace')).toBe(
            true
        );
    });

    it('renders the workspace page from the Pencil frame', () => {
        const html = renderToStaticMarkup(
            createElement(MiaojianWorkspaceScreen)
        );

        expect(html).toContain('智剪 Magicut');
        expect(html).toContain('智能视频剪辑工具');
        expect(html).toContain('所有项目');
        expect(html).toContain('创建、查看和继续编辑你的智能视频项目');
        expect(html).toContain('创建新作品');
        expect(html).toContain('前端AI进阶路线：3个月从调接口到架构师');
        expect(html).toContain('618直播高光混剪：从长视频自动提炼爆点');
    });

    it('keeps workspace feature files under renderer workspace folders', () => {
        expect(
            existsSync(
                resolve(
                    __dirname,
                    '../renderer/pages/MiaojianWorkspaceScreen.tsx'
                )
            )
        ).toBe(true);
        expect(
            existsSync(
                resolve(__dirname, '../renderer/components/workspace')
            )
        ).toBe(true);
    });

    it('uses links from create and project cards into the editor route', () => {
        const html = renderToStaticMarkup(
            createElement(MiaojianWorkspaceScreen)
        );

        expect(html).toContain('href="/"');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @wise-cut/desktop test:run -- tests/workspace-screen.test.ts
```

Expected:

- FAIL because `MiaojianWorkspaceScreen` does not exist yet
- FAIL because `/workspace` route is not registered yet

- [ ] **Step 3: Create the minimal page export and route hook-up**

Add a temporary page shell in `apps/desktop/renderer/pages/MiaojianWorkspaceScreen.tsx`:

```tsx
export const MiaojianWorkspaceScreen = () => {
    return <main>workspace placeholder</main>;
};
```

Update `apps/desktop/renderer/router/index.tsx`:

```tsx
import { MiaojianEditorScreen } from '../pages/MiaojianEditorScreen';
import { MiaojianWorkspaceScreen } from '../pages/MiaojianWorkspaceScreen';

export const router = createBrowserRouter([
    {
        path: '/',
        element: <MiaojianEditorScreen />
    },
    {
        path: '/workspace',
        element: <MiaojianWorkspaceScreen />
    }
]);
```

- [ ] **Step 4: Run test to verify it still fails for the right reason**

Run:

```bash
pnpm --filter @wise-cut/desktop test:run -- tests/workspace-screen.test.ts
```

Expected:

- Route registration assertion passes
- Workspace content assertions still fail because the real UI is not implemented

---

### Task 2: Add workspace types, constants, and local assets

**Files:**
- Create: `apps/desktop/renderer/types/workspace.ts`
- Create: `apps/desktop/renderer/constants/workspace.ts`
- Create: `apps/desktop/renderer/assets/workspace/*`
- Modify: `apps/desktop/renderer/types/editor-screen.ts`
- Modify: `apps/desktop/renderer/components/Icon.tsx`
- Test: `apps/desktop/tests/workspace-screen.test.ts`

- [ ] **Step 1: Define the workspace types**

Create `apps/desktop/renderer/types/workspace.ts`:

```ts
import type { EditorIconName } from './editor-screen';

export type WorkspaceNavTone = 'default' | 'active';

export type WorkspaceNavItem = {
    label: string;
    icon: EditorIconName;
    href?: string;
    tone: WorkspaceNavTone;
};

export type WorkspaceProject = {
    title: string;
    createdAt: string;
    coverImageUrl: string;
    href: string;
};

export type WorkspaceCreateCard = {
    title: string;
    href: string;
};
```

- [ ] **Step 2: Extend icon names for the workspace-only icons**

Modify `apps/desktop/renderer/types/editor-screen.ts`:

```ts
export type EditorIconName =
    | 'arrow-down'
    | 'arrow-up'
    | 'audio-lines'
    | 'captions'
    | 'check'
    | 'chevron-down'
    | 'chevron-up'
    | 'download'
    | 'ellipsis'
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
```

- [ ] **Step 3: Add the new icon paths**

Modify `apps/desktop/renderer/components/Icon.tsx`:

```ts
const iconPaths: Record<EditorIconName, string> = {
    house: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3v-10.5Z',
    'folder-open': 'M3 19l2.4-8h15.2L18 19H3Zm2.2-10L6.5 5H11l1.8 2H21v2H5.2Z',
    'list-video':
        'M3 6.5A1.5 1.5 0 0 1 4.5 5H15a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 15 19H4.5A1.5 1.5 0 0 1 3 17.5v-11Zm16 2.25 2.5-1.75v9L19 14.25V8.75ZM6 9h7M6 12h5M6 15h6',
    ellipsis: 'M5 12h.01M12 12h.01M19 12h.01',
    // keep existing entries...
};
```

- [ ] **Step 4: Create the workspace constant source of truth**

Create `apps/desktop/renderer/constants/workspace.ts`:

```ts
import coverAiAdvanced from '../assets/workspace/ai-advanced-route.jpg';
import coverAiStudy from '../assets/workspace/ai-study-route.jpg';
import coverLiveClip from '../assets/workspace/live-clipping.jpg';
import coverProductLaunch from '../assets/workspace/product-launch.jpg';
import coverInterview from '../assets/workspace/interview.jpg';
import coverCityWalk from '../assets/workspace/city-explore.jpg';
import coverGamePromo from '../assets/workspace/game-promo.jpg';
import type {
    WorkspaceCreateCard,
    WorkspaceNavItem,
    WorkspaceProject
} from '../types/workspace';

export const workspaceBrand = {
    title: '智剪 Magicut',
    subtitle: '智能视频剪辑工具'
};

export const workspaceHeader = {
    title: '所有项目',
    subtitle: '创建、查看和继续编辑你的智能视频项目'
};

export const workspaceNavItems: WorkspaceNavItem[] = [
    { label: '首页', icon: 'house', tone: 'default' },
    { label: '创作', icon: 'sparkles', href: '/', tone: 'default' },
    { label: '项目', icon: 'folder-open', tone: 'active' }
];

export const workspaceCreateCard: WorkspaceCreateCard = {
    title: '创建新作品',
    href: '/'
};

export const workspaceProjects: WorkspaceProject[] = [
    {
        title: '前端AI进阶路线：3个月从调接口到架构师',
        createdAt: '创建时间 2026-06-10',
        coverImageUrl: coverAiAdvanced,
        href: '/'
    },
    {
        title: '前端AI学习路线：从调接口到50K架构师的3个月进阶攻略',
        createdAt: '创建时间 2026-06-10',
        coverImageUrl: coverAiStudy,
        href: '/'
    },
    {
        title: '618直播高光混剪：从长视频自动提炼爆点',
        createdAt: '创建时间 2026-06-11',
        coverImageUrl: coverLiveClip,
        href: '/'
    },
    {
        title: '新品发布视频：把录屏、口播和卖点动画整理成成片',
        createdAt: '创建时间 2026-06-12',
        coverImageUrl: coverProductLaunch,
        href: '/'
    },
    {
        title: '企业访谈精剪：多机位自动对齐与重点段落提炼',
        createdAt: '创建时间 2026-06-13',
        coverImageUrl: coverInterview,
        href: '/'
    },
    {
        title: '城市探店短片：路线、节奏与字幕模板一键统一',
        createdAt: '创建时间 2026-06-14',
        coverImageUrl: coverCityWalk,
        href: '/'
    },
    {
        title: '游戏宣传视频：素材拼接、配乐与高光节奏优化',
        createdAt: '创建时间 2026-06-15',
        coverImageUrl: coverGamePromo,
        href: '/'
    }
];
```

- [ ] **Step 5: Add the local cover assets**

Populate `apps/desktop/renderer/assets/workspace/` with seven local cover images named exactly as imported above. Use realistic editorial imagery close to the Pencil references.

- [ ] **Step 6: Run test to verify the workspace contract still fails only on UI structure**

Run:

```bash
pnpm --filter @wise-cut/desktop test:run -- tests/workspace-screen.test.ts
```

Expected:

- Type and import errors are gone
- Content tests still fail because the real workspace components are not rendered yet

---

### Task 3: Build the workspace sidebar and card primitives

**Files:**
- Create: `apps/desktop/renderer/components/workspace/WorkspaceSidebar.tsx`
- Create: `apps/desktop/renderer/components/workspace/WorkspaceSidebarNavItem.tsx`
- Create: `apps/desktop/renderer/components/workspace/WorkspaceHeader.tsx`
- Create: `apps/desktop/renderer/components/workspace/WorkspaceCreateCard.tsx`
- Create: `apps/desktop/renderer/components/workspace/WorkspaceProjectCard.tsx`
- Create: `apps/desktop/renderer/components/workspace/WorkspaceProjectGrid.tsx`
- Test: `apps/desktop/tests/workspace-screen.test.ts`

- [ ] **Step 1: Add the sidebar nav item primitive**

Create `WorkspaceSidebarNavItem.tsx`:

```tsx
import { Link } from 'react-router-dom';

import type { WorkspaceNavItem } from '../../types/workspace';
import { cx } from '../../utils/classNames';
import { Icon } from '../Icon';

export const WorkspaceSidebarNavItem = ({
    item
}: {
    item: WorkspaceNavItem;
}) => {
    const content = (
        <div
            className={cx(
                'relative flex h-[92px] w-full flex-col items-center justify-center rounded-[46px] transition-all duration-200',
                item.tone === 'active'
                    ? 'bg-[linear-gradient(165deg,#582CFF_0%,#BF40FF_48%,#FF4DA6_100%)] text-white shadow-[0_10px_28px_rgba(191,64,255,0.4)]'
                    : 'bg-transparent text-[#8D94A6] hover:bg-white/4 hover:text-[#F5F7FA]'
            )}
        >
            <div
                className={cx(
                    'grid h-[42px] w-[42px] place-items-center rounded-[21px] border',
                    item.tone === 'active'
                        ? 'border-white/25 bg-white/14'
                        : 'border-white/7 bg-[#151824CC]'
                )}
            >
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
            </div>
            <span className="mt-[10px] text-[12px] font-[750]">
                {item.label}
            </span>
        </div>
    );

    if (!item.href) {
        return <div>{content}</div>;
    }

    return <Link to={item.href}>{content}</Link>;
};
```

- [ ] **Step 2: Add the sidebar shell**

Create `WorkspaceSidebar.tsx`:

```tsx
import { workspaceBrand, workspaceNavItems } from '../../constants/workspace';
import { WorkspaceSidebarNavItem } from './WorkspaceSidebarNavItem';

export const WorkspaceSidebar = () => {
    return (
        <aside className="relative flex h-full w-[260px] shrink-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_55%_0%,rgba(88,44,255,0.22),transparent_45%),linear-gradient(180deg,#11131D_0%,#080911_48%,#05060A_100%)]">
            <div className="flex items-center gap-3 px-5 pt-[30px]">
                <div className="grid h-12 w-12 place-items-center rounded-[8px] bg-[#F05F73]">
                    <span className="text-[15px] font-[900] text-white">M</span>
                </div>
                <div className="grid gap-[2px]">
                    <h1 className="text-[24px] font-[700] text-[#F5F7FA]">
                        {workspaceBrand.title}
                    </h1>
                    <p className="text-[11px] text-[#6F7784]">
                        {workspaceBrand.subtitle}
                    </p>
                </div>
            </div>

            <div className="mt-[259px] px-[26px]">
                <div className="rounded-[60px] border border-white/10 bg-[linear-gradient(180deg,rgba(25,27,39,0.94)_0%,rgba(13,15,23,0.94)_52%,rgba(8,9,16,0.94)_100%)] px-[11px] py-[50px] shadow-[0_18px_46px_rgba(0,0,0,0.5)]">
                    <div className="grid gap-[18px]">
                        {workspaceNavItems.map((item) => (
                            <WorkspaceSidebarNavItem
                                key={item.label}
                                item={item}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </aside>
    );
};
```

- [ ] **Step 3: Add the content header and card primitives**

Create `WorkspaceHeader.tsx`:

```tsx
import { workspaceHeader } from '../../constants/workspace';

export const WorkspaceHeader = () => {
    return (
        <header className="grid gap-[5px]">
            <h2 className="text-[24px] font-[850] text-[#F5F7FA]">
                {workspaceHeader.title}
            </h2>
            <p className="text-[12px] font-[650] text-[#858B96]">
                {workspaceHeader.subtitle}
            </p>
        </header>
    );
};
```

Create `WorkspaceCreateCard.tsx`:

```tsx
import { Link } from 'react-router-dom';

import { workspaceCreateCard } from '../../constants/workspace';
import { Icon } from '../Icon';

export const WorkspaceCreateCard = () => {
    return (
        <Link
            to={workspaceCreateCard.href}
            className="group flex h-[250px] min-w-0 flex-col items-center justify-center gap-[18px] rounded-[18px] border border-[#4A4D54] bg-[#202123] px-6 py-7 transition-all duration-200 hover:-translate-y-[2px] hover:border-[#6C7080] hover:bg-[#26272B]"
        >
            <div className="relative h-[88px] w-[92px]">
                <div className="absolute left-[42px] top-0 h-12 w-12 rotate-[-10deg] rounded-[13px] bg-[linear-gradient(135deg,#C8FF63_0%,#F05F73_100%)]" />
                <div className="absolute left-1 top-6 grid h-[58px] w-[68px] place-items-center rounded-[14px] bg-[linear-gradient(135deg,#3C3D42_0%,#B682FF_100%)] shadow-[0_12px_24px_rgba(0,0,0,0.33)]">
                    <Icon name="list-video" className="h-[30px] w-[30px] text-white/90" />
                </div>
            </div>
            <div className="grid h-[52px] w-[238px] place-items-center rounded-[12px] bg-[#F1F2F4]">
                <span className="text-[21px] font-[900] text-[#111214]">
                    {workspaceCreateCard.title}
                </span>
            </div>
        </Link>
    );
};
```

Create `WorkspaceProjectCard.tsx`:

```tsx
import { Link } from 'react-router-dom';

import type { WorkspaceProject } from '../../types/workspace';
import { Icon } from '../Icon';

export const WorkspaceProjectCard = ({
    project
}: {
    project: WorkspaceProject;
}) => {
    return (
        <Link
            to={project.href}
            className="group flex h-[250px] min-w-0 flex-col overflow-hidden rounded-[18px] bg-[#202123] transition-all duration-200 hover:-translate-y-[2px] hover:bg-[#26272B] hover:shadow-[0_16px_32px_rgba(0,0,0,0.24)]"
        >
            <img
                src={project.coverImageUrl}
                alt={project.title}
                className="h-[130px] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
            <div className="grid flex-1 gap-[10px] px-5 py-[18px]">
                <div className="line-clamp-2 text-[17px] font-[900] leading-[1.25] text-[#F4F5F7]">
                    {project.title}
                </div>
                <div className="mt-auto flex items-center justify-between">
                    <span className="text-[12px] font-[750] text-[#9AA0AA]">
                        {project.createdAt}
                    </span>
                    <span className="grid h-6 w-[34px] place-items-center text-[#8A8F98]">
                        <Icon name="ellipsis" className="h-5 w-5" />
                    </span>
                </div>
            </div>
        </Link>
    );
};
```

- [ ] **Step 4: Add the grid container**

Create `WorkspaceProjectGrid.tsx`:

```tsx
import { workspaceProjects } from '../../constants/workspace';
import { WorkspaceCreateCard } from './WorkspaceCreateCard';
import { WorkspaceProjectCard } from './WorkspaceProjectCard';

export const WorkspaceProjectGrid = () => {
    return (
        <section className="grid grid-cols-1 gap-[18px] min-[1280px]:grid-cols-2 min-[1520px]:grid-cols-3 min-[1860px]:grid-cols-4">
            <WorkspaceCreateCard />
            {workspaceProjects.map((project) => (
                <WorkspaceProjectCard key={project.title} project={project} />
            ))}
        </section>
    );
};
```

- [ ] **Step 5: Run the test to verify primitive-level content is now representable**

Run:

```bash
pnpm --filter @wise-cut/desktop test:run -- tests/workspace-screen.test.ts
```

Expected:

- Some tests may still fail because the page shell is still the placeholder
- No missing symbol/import failures from workspace component files

---

### Task 4: Compose the workspace page and make tests pass

**Files:**
- Modify: `apps/desktop/renderer/pages/MiaojianWorkspaceScreen.tsx`
- Modify: `apps/desktop/renderer/index.css` (only if needed)
- Test: `apps/desktop/tests/workspace-screen.test.ts`

- [ ] **Step 1: Replace the placeholder page with the full workspace composition**

Update `apps/desktop/renderer/pages/MiaojianWorkspaceScreen.tsx`:

```tsx
import { WorkspaceHeader } from '../components/workspace/WorkspaceHeader';
import { WorkspaceProjectGrid } from '../components/workspace/WorkspaceProjectGrid';
import { WorkspaceSidebar } from '../components/workspace/WorkspaceSidebar';

export const MiaojianWorkspaceScreen = () => {
    return (
        <main className="h-screen min-h-[720px] overflow-hidden bg-[#0E0F12] text-[#F5F7FA]">
            <div className="flex h-full min-w-[1280px]">
                <WorkspaceSidebar />
                <section className="min-h-0 flex-1 overflow-y-auto">
                    <div className="mx-auto flex min-h-full max-w-[1660px] flex-col px-[57px] pb-12 pt-[99px]">
                        <WorkspaceHeader />
                        <div className="mt-[18px]">
                            <WorkspaceProjectGrid />
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
};
```

- [ ] **Step 2: Add only the minimum shared CSS support if component scope is insufficient**

If the card title clamp utility or image rendering needs support not already present, add only the smallest shared rule to `apps/desktop/renderer/index.css`. Example:

```css
@layer utilities {
    .line-clamp-2 {
        display: -webkit-box;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
    }
}
```

- [ ] **Step 3: Run the focused workspace tests**

Run:

```bash
pnpm --filter @wise-cut/desktop test:run -- tests/workspace-screen.test.ts
```

Expected:

- PASS for all workspace tests

- [ ] **Step 4: Run the existing desktop test suite to guard against regression**

Run:

```bash
pnpm --filter @wise-cut/desktop test:run
```

Expected:

- PASS for all desktop tests, including the existing editor screen coverage

---

### Task 5: Visual polish pass against the Pencil frame

**Files:**
- Modify: `apps/desktop/renderer/components/workspace/*.tsx`
- Test: `apps/desktop/tests/workspace-screen.test.ts`

- [ ] **Step 1: Check rendered spacing and hierarchy against Pencil**

Verify the following in code:

```tsx
// Sidebar width and page padding
<aside className="... w-[260px] ..." />
<div className="... px-[57px] pb-12 pt-[99px]" />

// Card sizing
className="h-[250px] ..."
className="h-[130px] w-full object-cover"
```

Tune only these high-signal details if they drift:

- sidebar width
- top offset
- grid gap
- card radius
- title/secondary text colors
- hover lift depth

- [ ] **Step 2: Re-run the full desktop tests after any polish edits**

Run:

```bash
pnpm --filter @wise-cut/desktop test:run
```

Expected:

- PASS with no new failures

---

## Self-Review

### Spec coverage

- New `/workspace` route: covered in Task 1 and Task 4
- Separate page and component folders: covered in Task 3 and Task 4
- Create card + project card navigation into `/`: covered in Task 3
- Local assets and static constants: covered in Task 2
- Renderer architecture alignment: covered in File Map and Task 3
- Test coverage: covered in Task 1, Task 4, and Task 5

### Placeholder scan

- No `TODO` / `TBD`
- No “implement later”
- No “write tests” without explicit test content

### Type consistency

- `WorkspaceNavItem`, `WorkspaceProject`, and `WorkspaceCreateCard` are defined before component usage
- New icon names are declared before `Icon.tsx` and workspace components depend on them

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-miaojian-workspace.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Because the user already asked to continue directly, default to **Inline Execution** unless blocked.

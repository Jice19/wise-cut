
import { cx } from '../utils/classNames';

const windowDragRegionBaseClassName =
    'absolute right-0 top-0 h-10 [app-region:drag] [-webkit-app-region:drag]';

export const WindowDragRegion = ({ className }: { className?: string }) => {
    return (
        <div
            aria-hidden="true"
            data-window-drag-region="true"
            className={cx(
                windowDragRegionBaseClassName,
                className ?? 'left-0 z-20'
            )}
        />
    );
};

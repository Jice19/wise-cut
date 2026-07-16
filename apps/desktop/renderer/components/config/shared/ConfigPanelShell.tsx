/* */
import type { ReactNode } from 'react';

import { cx } from '../../../utils/classNames';

export const ConfigPanelShell = ({
    className,
    contentClassName,
    footerClassName,
    children,
    footer
}: {
    className?: string;
    contentClassName?: string;
    footerClassName?: string;
    children: ReactNode;
    footer?: ReactNode;
}) => {
    return (
        <aside
            className={cx(
                'flex h-full min-h-0 flex-col overflow-hidden bg-[#0E0F12]',
                className
            )}
        >
            <div className={cx('min-h-0 flex-1', contentClassName)}>
                {children}
            </div>
            {footer ? (
                <div className={cx('shrink-0', footerClassName)}>{footer}</div>
            ) : null}
        </aside>
    );
};

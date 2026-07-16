/* */
import type { ReactNode } from 'react';

import { cx } from '../../../utils/classNames';

export const ConfigSectionShell = ({
    className,
    children
}: {
    className?: string;
    children: ReactNode;
}) => {
    return (
        <section
            className={cx(
                'rounded-[14px] border border-[#1A1D24] bg-[#0E0F12] p-[14px]',
                className
            )}
        >
            {children}
        </section>
    );
};

/* */
import type { ReactNode } from 'react';

import { cx } from '../../../utils/classNames';

export const ConfigTrackSlider = ({
    children,
    progressPercent,
    trackWidthClassName,
    progressWidthClassName,
    thumbPercent,
    thumbLeftClassName
}: {
    children?: ReactNode;
    progressPercent?: number;
    trackWidthClassName: string;
    progressWidthClassName: string;
    thumbPercent?: number;
    thumbLeftClassName: string;
}) => {
    const progressStyle =
        typeof progressPercent === 'number'
            ? { width: `${progressPercent}%` }
            : undefined;
    const thumbStyle =
        typeof thumbPercent === 'number'
            ? { left: `calc(${thumbPercent}% - 8px)` }
            : undefined;

    return (
        <div className="flex w-full justify-end">
            <div className={cx('relative h-4 shrink-0', trackWidthClassName)}>
                <span className="absolute left-0 top-[5px] h-[6px] w-full rounded-full bg-[#1A1D24]" />
                <span
                    className={cx(
                        'absolute top-[5px] h-[6px] rounded-full bg-white',
                        progressStyle ? undefined : progressWidthClassName
                    )}
                    style={progressStyle}
                />
                <span
                    className={cx(
                        'absolute top-0 h-4 w-4 rounded-full border-[3px] border-[#0E0F12] bg-white',
                        thumbStyle ? undefined : thumbLeftClassName
                    )}
                    style={thumbStyle}
                />
                {children}
            </div>
        </div>
    );
};

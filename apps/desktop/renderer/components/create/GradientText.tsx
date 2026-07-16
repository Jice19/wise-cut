/* */
import type { CSSProperties, ReactNode } from 'react';

import { cx } from '../../utils/classNames';

type GradientDirection = 'horizontal' | 'vertical' | 'diagonal';

const gradientDirectionToAngle: Record<GradientDirection, string> = {
    horizontal: 'to right',
    vertical: 'to bottom',
    diagonal: 'to bottom right'
};

export const GradientText = ({
    children,
    className,
    colors,
    animationSpeed = 8,
    direction = 'horizontal'
}: {
    children: ReactNode;
    className?: string;
    colors: string[];
    animationSpeed?: number;
    direction?: GradientDirection;
}) => {
    const gradientColors = [...colors, colors[0]].join(', ');
    const backgroundSize = direction === 'vertical' ? '100% 300%' : '300% 100%';
    const style = {
        '--gradient-text-duration': `${animationSpeed}s`,
        backgroundImage: `linear-gradient(${gradientDirectionToAngle[direction]}, ${gradientColors})`,
        backgroundSize,
        backgroundRepeat: 'repeat'
    } as CSSProperties;

    return (
        <span
            className={cx('gradient-text-motion inline-block', className)}
            style={style}
        >
            {children}
        </span>
    );
};

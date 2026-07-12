import type { ComponentType, SVGProps } from 'react';

export interface IconProps extends SVGProps<SVGSVGElement> {
    /** 来自 lucide-react 之类的图标组件，可空。 */
    as?: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * 占位 Icon 组件。后续接入 lucide-react 后通过 `as` 替换。
 */
export const Icon = ({ as: As, ...rest }: IconProps): JSX.Element => {
    if (As) return <As {...rest} />;
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            {...rest}
        >
            <circle cx="12" cy="12" r="9" />
        </svg>
    );
};

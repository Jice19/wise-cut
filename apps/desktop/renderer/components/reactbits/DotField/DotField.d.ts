/* */
import type { ComponentPropsWithoutRef, ReactElement } from 'react';

export type DotFieldProps = ComponentPropsWithoutRef<'div'> & {
    dotRadius?: number;
    dotSpacing?: number;
    cursorRadius?: number;
    cursorForce?: number;
    bulgeOnly?: boolean;
    bulgeStrength?: number;
    glowRadius?: number;
    sparkle?: boolean;
    waveAmplitude?: number;
    gradientFrom?: string;
    gradientTo?: string;
    glowColor?: string;
};

declare const DotField: (props: DotFieldProps) => ReactElement;

export default DotField;

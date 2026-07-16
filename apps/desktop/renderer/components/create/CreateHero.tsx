/* */
import type { CreatePageContent } from '../../types/create';

import { GradientText } from './GradientText';

export const CreateHero = ({ content }: { content: CreatePageContent }) => {
    return (
        <header className="flex h-[148px] w-full flex-col items-center gap-[22px]">
            <h1 className="flex h-[78px] items-center justify-center text-[62px] font-[900] leading-none">
                <span className="text-[#1C1917]">{content.titlePrefix}</span>
                <GradientText
                    colors={content.titleAccentColors}
                    animationSpeed={7}
                >
                    {content.titleAccent}
                </GradientText>
            </h1>
            <p className="text-[24px] font-[650] leading-[1.2] text-[#78716C]">
                {content.subtitle}
            </p>
        </header>
    );
};

/* */
import type { VoiceSlider } from '../../../types/config';
import { Icon } from '../../Icon';

import { ConfigTrackSlider } from './ConfigTrackSlider';

const calculatePercent = ({
    max,
    min,
    value
}: {
    max: number;
    min: number;
    value: number;
}) => {
    if (max <= min) return 0;

    return ((value - min) / (max - min)) * 100;
};

export const ConfigSliderRow = ({
    onValueChange,
    slider
}: {
    onValueChange?: (value: number) => void;
    slider: VoiceSlider;
}) => {
    const min = slider.min ?? 0;
    const max = slider.max ?? 100;
    const numericValue = slider.numericValue ?? min;
    const progressPercent = onValueChange
        ? calculatePercent({
              max,
              min,
              value: numericValue
          })
        : undefined;

    return (
        <div className="grid gap-2.5">
            <div className="flex items-center gap-2">
                {slider.icon ? (
                    <Icon
                        name={slider.icon}
                        className="h-4 w-4 text-[#88909C]"
                    />
                ) : null}
                <span className="text-[12px] font-[750] text-white">
                    {slider.label}
                </span>
                <span className="ml-auto font-['Geist_Mono'] text-[12px] font-bold text-white">
                    {slider.value}
                </span>
            </div>
            <ConfigTrackSlider
                progressPercent={progressPercent}
                trackWidthClassName={slider.trackWidthClassName}
                progressWidthClassName={slider.progressWidthClassName}
                thumbPercent={progressPercent}
                thumbLeftClassName={slider.thumbLeftClassName}
            >
                {onValueChange ? (
                    <input
                        type="range"
                        aria-label={slider.label}
                        className="absolute inset-0 h-4 w-full cursor-pointer opacity-0"
                        max={max}
                        min={min}
                        onChange={(event) => {
                            onValueChange(Number(event.currentTarget.value));
                        }}
                        step={slider.step ?? 1}
                        value={numericValue}
                    />
                ) : null}
            </ConfigTrackSlider>
        </div>
    );
};

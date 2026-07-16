
type WaveformSize = 'default' | 'compact';

const waveformBarHeightClassNames: Record<WaveformSize, string[]> = {
    compact: ['h-1', 'h-1.5', 'h-2', 'h-2.5', 'h-3'],
    default: ['h-2', 'h-3', 'h-4', 'h-5', 'h-6']
};

const waveformSizeClassNames: Record<WaveformSize, string> = {
    compact: 'gap-[2px]',
    default: 'gap-[3px]'
};

const waveformBarWidthClassNames: Record<WaveformSize, string> = {
    compact: 'w-[2px]',
    default: 'w-[3px]'
};

export const Waveform = ({
    bars = 18,
    size = 'default'
}: {
    bars?: number;
    size?: WaveformSize;
}) => {
    const barHeights = waveformBarHeightClassNames[size];

    return (
        <div
            className={`flex items-center ${waveformSizeClassNames[size]}`}
            data-waveform-size={size}
            aria-hidden="true"
        >
            {Array.from({ length: bars }, (_, index) => (
                <span
                    key={index}
                    className={`${waveformBarWidthClassNames[size]} rounded-full bg-[#BFFFE266] ${barHeights[index % barHeights.length]}`}
                />
            ))}
        </div>
    );
};

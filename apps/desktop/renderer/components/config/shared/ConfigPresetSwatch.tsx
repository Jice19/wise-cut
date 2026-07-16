/* */
export const ConfigPresetSwatch = ({
    active,
    backgroundColor,
    borderColor,
    innerTextColor,
    label,
    onClick,
    outerTextColor
}: {
    active: boolean;
    backgroundColor: string;
    borderColor: string;
    innerTextColor: string;
    label: string;
    onClick?: () => void;
    outerTextColor: string;
}) => {
    const resolvedBorderColor = active ? '#F05F73' : borderColor;

    return (
        <button
            type="button"
            aria-pressed={active}
            data-subtitle-preset={label}
            onClick={onClick}
            className="flex h-[36px] w-[32px] items-center justify-center rounded-[8px] border transition-all duration-200 hover:-translate-y-[1px]"
            style={{
                backgroundColor,
                borderColor: resolvedBorderColor
            }}
        >
            <div className="relative h-full w-full" aria-hidden="true">
                <span
                    className="absolute left-[8px] top-[6px] text-[20px] font-[900] leading-none"
                    style={{ color: outerTextColor }}
                >
                    T
                </span>
                <span
                    className="absolute left-[10px] top-[6px] text-[20px] font-[900] leading-none"
                    style={{ color: innerTextColor }}
                >
                    T
                </span>
            </div>
            <span className="sr-only">{label}</span>
        </button>
    );
};

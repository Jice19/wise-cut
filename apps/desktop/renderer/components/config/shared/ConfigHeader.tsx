/* */
import { cx } from '../../../utils/classNames';

export const ConfigHeader = ({
    title,
    subtitle,
    className,
    titleClassName = 'text-[14px] font-[800] leading-none text-white',
    subtitleClassName = 'text-[11px] font-semibold leading-none text-[#88909C]'
}: {
    title: string;
    subtitle?: string;
    className?: string;
    titleClassName?: string;
    subtitleClassName?: string;
}) => {
    return (
        <div className={cx('grid gap-1', className)}>
            <h2 className={cx(titleClassName)}>{title}</h2>
            {subtitle ? (
                <p className={cx("font-['Geist']", subtitleClassName)}>
                    {subtitle}
                </p>
            ) : null}
        </div>
    );
};

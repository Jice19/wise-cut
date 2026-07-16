
import { Icon } from './Icon';

export const EditorHomeLink = ({
    href,
    label
}: {
    href: string;
    label: string;
}) => {
    return (
        <a
            href={href}
            aria-label={label}
            className="group relative grid h-[30px] w-[30px] place-items-center rounded-lg bg-[#F05F73] text-xs font-black text-white transition-all duration-200 hover:bg-[#F27282] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05F73] [app-region:no-drag] [-webkit-app-region:no-drag]"
        >
            <span className="grid h-full w-full place-items-center transition-opacity duration-150 group-hover:hidden group-focus-visible:hidden">
                剪
            </span>
            <span className="hidden h-full w-full place-items-center transition-opacity duration-150 group-hover:grid group-focus-visible:grid">
                <Icon name="house" className="h-[17px] w-[17px]" />
            </span>
        </a>
    );
};

/* */
import type { WorkspaceCreateCard as WorkspaceCreateCardData } from '../../types/workspace';
import { Icon } from '../Icon';

const CreateCardArtwork = () => {
    return (
        <div className="relative h-[88px] w-[92px]">
            <div className="absolute left-[42px] top-0 h-12 w-12 rotate-[-10deg] rounded-[13px] bg-[linear-gradient(135deg,#FCD34D_0%,#FB923C_100%)]" />
            <div className="absolute left-1 top-6 grid h-[58px] w-[68px] place-items-center rounded-[14px] bg-[linear-gradient(135deg,#D97706_0%,#B45309_100%)] shadow-[0_12px_24px_rgba(217,119,6,0.32)]">
                <Icon
                    name="list-video"
                    className="h-[30px] w-[30px] text-white"
                />
            </div>
        </div>
    );
};

export const WorkspaceCreateCard = ({
    card,
    onCreate
}: {
    card: WorkspaceCreateCardData;
    onCreate?: () => void;
}) => {
    return (
        <button
            type="button"
            onClick={onCreate}
            className="group flex h-[250px] w-full cursor-pointer appearance-none flex-col items-center justify-center gap-[18px] rounded-[18px] border border-[#E7E5E0] bg-white px-4 py-7 text-left shadow-[0_4px_18px_rgba(28,25,23,0.04)] transition-all duration-200 hover:-translate-y-1 hover:border-[#D97706] hover:shadow-[0_18px_36px_rgba(217,119,6,0.18)]"
        >
            <CreateCardArtwork />
            <span className="grid h-[52px] w-full place-items-center rounded-xl bg-[#F1EFEC] px-3 text-center text-[18px] font-bold text-[#1C1917] transition-colors duration-200 group-hover:bg-[#FEF3C7] group-hover:text-[#92400E]">
                {card.title}
            </span>
        </button>
    );
};

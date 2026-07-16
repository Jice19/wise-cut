/* */
import type { CreateAgentSubmitInput } from '../../types/create';
import type { CreatePageContent } from '../../types/create';
import SoftAurora from '../reactbits/SoftAurora/SoftAurora';

import { CreateHero } from './CreateHero';
import { CreateInputPanel } from './CreateInputPanel';

export const CreateMainContent = ({
    content,
    isAgentBusy = false,
    onAgentSubmit
}: {
    content: CreatePageContent;
    isAgentBusy?: boolean;
    onAgentSubmit?: (input: CreateAgentSubmitInput) => void;
}) => {
    return (
        <section className="relative h-full min-w-0 overflow-hidden bg-[#FAF9F7]">
            <div className="absolute inset-0 bg-[#FAF9F7]" />
            <div className="create-main-soft-aurora-layer pointer-events-none absolute inset-0 z-[1] overflow-hidden opacity-50 mix-blend-multiply">
                <div className="absolute left-0 top-[280px] h-[620px] w-full">
                    <SoftAurora
                        color1="#FCD34D"
                        color2="#FB923C"
                        brightness={0.55}
                        scale={1.55}
                        speed={0.52}
                        bandHeight={0.58}
                        bandSpread={1.08}
                        noiseAmplitude={1}
                        noiseFrequency={2.5}
                        enableMouseInteraction={false}
                    />
                </div>
            </div>
            <div className="relative z-10 h-full w-full">
                <div className="absolute left-[149px] top-[155px] w-[1300px] max-w-[calc(100%-298px)]">
                    <CreateHero content={content} />
                </div>
                <div className="absolute left-[129px] top-[362px] z-10 w-[1340px] max-w-[calc(100%-258px)]">
                    <CreateInputPanel
                        content={content}
                        disabled={isAgentBusy}
                        onSubmit={onAgentSubmit}
                    />
                </div>
            </div>
        </section>
    );
};

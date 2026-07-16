/* */
import { MemorySaver } from '@langchain/langgraph';

export const createVideoCreationCheckpointer = () => new MemorySaver();

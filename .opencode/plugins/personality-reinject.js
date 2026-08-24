import { PERSONALITY_CONTRACT } from '../../.agents/hooks/personality-reinject.mjs';

export const PersonalityReinject = async () => ({
  'experimental.chat.system.transform': async (_input, output) => {
    if (!output.system.includes(PERSONALITY_CONTRACT)) {
      output.system.push(PERSONALITY_CONTRACT);
    }
  },
});

import { z } from 'zod';

export default {
    name: 'sample',
    tools: [
        {
            name: 'echo_message',
            description: 'Returns the provided message verbatim.',
            actionType: 'echo_message',
            parameters: z.object({ message: z.string() }),
            execute: async (args) => ({ status: 'ok', message: args.message }),
        },
    ],
};

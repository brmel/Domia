module.exports = {
    tools: [
        {
            name: 'echo_message',
            description: 'Returns the provided message verbatim.',
            actionType: 'echo_message',
            parameters: {
                type: 'object',
                properties: { message: { type: 'string' } },
                required: ['message'],
            },
            execute: async (args) => ({ status: 'ok', message: args.message }),
        },
    ],
};

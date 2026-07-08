import { trpc } from '@frontend/api/trpc';

export function useSettingsConfig() {
    const utils = trpc.useUtils();
    const { data: config, isLoading } = trpc.settings.get.useQuery();
    const updateMutation = trpc.settings.update.useMutation({
        onSuccess: () => {
            utils.settings.get.invalidate();
        },
    });
    return { config, isLoading, updateMutation };
}

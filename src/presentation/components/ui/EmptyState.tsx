export function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }): JSX.Element {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400">
            <div className="text-4xl mb-4 opacity-50">{icon}</div>
            <h4 className="text-gray-600 font-semibold mb-1">{title}</h4>
            <p className="text-sm max-w-xs">{description}</p>
        </div>
    );
}

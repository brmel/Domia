/** Standard form field label. */
export function FieldLabel({ children }: { children: React.ReactNode }): React.ReactElement {
    return <label className="block text-sm font-medium text-gray-700 mb-1">{children}</label>;
}

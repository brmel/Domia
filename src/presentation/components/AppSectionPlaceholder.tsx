import React from 'react';
import { SectionBlock } from './ui/SectionBlock';

interface AppSectionPlaceholderProps {
    title: string;
    description: string;
    nextSteps: readonly string[];
}

export function AppSectionPlaceholder({ title, description, nextSteps }: AppSectionPlaceholderProps): React.ReactElement {
    return (
        <section className="h-full w-full p-6 bg-gray-50 overflow-auto">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                    <h2 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h2>
                    <p className="mt-2 text-sm text-gray-600 leading-relaxed">{description}</p>

                    <SectionBlock title="UI-1 Next Steps" className="mt-6 border-t border-gray-100 pt-5" contentClassName="mt-3">
                        <ul className="space-y-2 text-sm text-gray-700">
                            {nextSteps.map((step) => (
                                <li key={step} className="flex items-start gap-2">
                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
                                    <span>{step}</span>
                                </li>
                            ))}
                        </ul>
                    </SectionBlock>
                </div>
            </div>
        </section>
    );
}

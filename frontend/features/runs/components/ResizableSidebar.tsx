import React, { useState, useCallback, useEffect } from 'react';

interface ResizableSidebarProps {
    children: React.ReactNode;
    initialWidth?: number;
    minWidth?: number;
    maxWidth?: number;
}

export const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
    children,
    initialWidth = 350,
    minWidth = 300,
    maxWidth = 800
}) => {
    const [width, setWidth] = useState(initialWidth);
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback(
        (mouseMoveEvent: MouseEvent) => {
            if (isResizing) {
                const newWidth = mouseMoveEvent.clientX;
                if (newWidth >= minWidth && newWidth <= maxWidth) {
                    setWidth(newWidth);
                }
            }
        },
        [isResizing, minWidth, maxWidth]
    );

    useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return (): void => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [resize, stopResizing]);

    return (
        <aside
            className="relative border-r border-gray-200 bg-white flex flex-col z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]"
            style={{ width: width }}
        >
            <div className="flex-1 overflow-hidden flex flex-col">
                {children}
            </div>

            {/* Drag Handle */}
            <div
                className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors ${isResizing ? 'bg-blue-600' : 'bg-transparent'}`}
                onMouseDown={startResizing}
            />
        </aside>
    );
};

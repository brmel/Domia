import React from 'react';
import { TestForm, TestRunner, ScreenshotViewer, ToastNotification } from './presentation/components';
import './App.css';

export function App(): React.ReactElement {
    return (
        <div className="app">
            <header className="app-header">
                <h1>🤖 Auto-QA</h1>
                <p>Autonomous Web Testing Agent</p>
            </header>

            <main className="app-main">
                <section className="input-section">
                    <TestForm />
                </section>

                <section className="output-section">
                    <div className="runner-panel">
                        <TestRunner />
                    </div>
                    <div className="screenshot-panel">
                        <ScreenshotViewer />
                    </div>
                </section>
            </main>

            <ToastNotification />
        </div>
    );
}

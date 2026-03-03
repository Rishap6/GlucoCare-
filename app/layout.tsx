import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'GlucoCare+ Smart Diabetes Monitoring',
    description: 'Real-Time Monitoring. Safe Prescriptions. Smarter Care.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className="antialiased bg-gray-50">{children}</body>
        </html>
    );
}

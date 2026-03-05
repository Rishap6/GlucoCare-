"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity } from "lucide-react";

type ActivityEvent = {
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    actor?: { name?: string | null; role?: string | null } | null;
    target?: { name?: string | null; role?: string | null } | null;
    metadata?: Record<string, unknown> | null;
};

export default function ActivityPage() {
    const router = useRouter();
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [dashboardHref, setDashboardHref] = useState("/dashboard/patient");

    const [action, setAction] = useState("");
    const [entityType, setEntityType] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        setError("");

        const token = localStorage.getItem('gc_token');
        if (!token) {
            setError('No active session found. Please log in again.');
            setLoading(false);
            return;
        }

        const searchParams = new URLSearchParams();
        searchParams.set('limit', '100');
        if (action) searchParams.set('action', action);
        if (entityType) searchParams.set('entityType', entityType);
        if (from) searchParams.set('from', from);
        if (to) searchParams.set('to', to);

        try {
            const res = await fetch(`/api/audit/activity?${searchParams.toString()}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!res.ok) {
                throw new Error('Failed to load activity history');
            }

            const data = await res.json();
            setEvents(data.events || []);
        } catch (fetchError: any) {
            setError(fetchError.message || 'Unable to load activity history');
            setEvents([]);
        } finally {
            setLoading(false);
        }
    }, [action, entityType, from, to]);

    useEffect(() => {
        const storedRole = localStorage.getItem("gc_role");
        if (storedRole === "admin") {
            setDashboardHref("/admin");
        } else if (storedRole === "doctor") {
            setDashboardHref("/dashboard/doctor");
        } else {
            setDashboardHref("/dashboard/patient");
        }
    }, []);

    const handleSignOut = async () => {
        try {
            await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'logout' })
            });
        } catch {
        } finally {
            localStorage.removeItem('gc_token');
            localStorage.removeItem('gc_role');
            localStorage.removeItem('gc_user_id');
            localStorage.removeItem('gc_user_name');
            router.push('/login');
        }
    };

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="bg-teal-600 p-1.5 rounded-lg">
                        <Activity className="h-5 w-5 text-white" />
                    </div>
                    <h1 className="text-xl font-bold text-slate-900">Activity History</h1>
                </div>
                <div className="flex items-center gap-3">
                    <Link href={dashboardHref} className="text-sm font-medium text-teal-600 hover:text-teal-700">
                        Back to Dashboard
                    </Link>
                    <button
                        onClick={handleSignOut}
                        className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                    >
                        Sign Out
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
                    <input
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        placeholder="Action (e.g. user_login_success)"
                        value={action}
                        onChange={(e) => setAction(e.target.value)}
                    />
                    <input
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        placeholder="Entity (e.g. prescription)"
                        value={entityType}
                        onChange={(e) => setEntityType(e.target.value)}
                    />
                    <input
                        type="datetime-local"
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                    />
                    <input
                        type="datetime-local"
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                    />
                    <button
                        onClick={() => fetchEvents()}
                        className="bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
                    >
                        Apply Filters
                    </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
                    {loading ? (
                        <p className="text-sm text-slate-500">Loading events...</p>
                    ) : events.length === 0 ? (
                        <p className="text-sm text-slate-500">No events found for current filters.</p>
                    ) : (
                        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                            {events.map((event) => (
                                <div key={event.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">{event.action.replace(/_/g, ' ')}</p>
                                            <p className="text-xs text-slate-500 mt-1">Entity: {event.entityType}</p>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Actor: {event.actor?.name || 'System'}{event.actor?.role ? ` (${event.actor.role})` : ''}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Target: {event.target?.name || 'N/A'}{event.target?.role ? ` (${event.target.role})` : ''}
                                            </p>
                                            {event.metadata && (
                                                <p className="text-xs text-slate-600 mt-2 break-words">{JSON.stringify(event.metadata)}</p>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 whitespace-nowrap">{new Date(event.createdAt).toLocaleString()}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
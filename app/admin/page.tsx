"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, Shield, Search } from "lucide-react";

type ManagedUser = {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    isActive: boolean;
    createdAt: string;
};

type ActivityEvent = {
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    actor?: { name?: string | null; role?: string | null } | null;
    target?: { name?: string | null; role?: string | null } | null;
};

export default function AdminPage() {
    const router = useRouter();
    const [adminName, setAdminName] = useState("Admin");
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
    const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
    const [activityLoading, setActivityLoading] = useState(true);
    const [activityError, setActivityError] = useState("");
    const [activityAction, setActivityAction] = useState("");
    const [activityEntityType, setActivityEntityType] = useState("");

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

    const fetchUsers = useCallback(async () => {
        const token = localStorage.getItem("gc_token");
        if (!token) {
            router.push("/login");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const params = new URLSearchParams();
            if (search.trim()) {
                params.set("query", search.trim());
            }
            if (roleFilter) {
                params.set("role", roleFilter);
            }

            const res = await fetch(`/api/admin/users?${params.toString()}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    router.push("/login");
                    return;
                }
                throw new Error("Failed to load users");
            }

            const data = await res.json();
            setUsers(data.users || []);
        } catch (fetchError: any) {
            setError(fetchError.message || "Failed to load users");
        } finally {
            setLoading(false);
        }
    }, [roleFilter, router, search]);

    const fetchActivity = useCallback(async () => {
        const token = localStorage.getItem("gc_token");
        if (!token) {
            router.push("/login");
            return;
        }

        setActivityLoading(true);
        setActivityError("");

        try {
            const params = new URLSearchParams();
            params.set("limit", "12");
            if (activityAction.trim()) {
                params.set("action", activityAction.trim());
            }
            if (activityEntityType.trim()) {
                params.set("entityType", activityEntityType.trim());
            }

            const res = await fetch(`/api/audit/activity?${params.toString()}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!res.ok) {
                throw new Error("Failed to load activity");
            }

            const data = await res.json();
            setActivityEvents(data.events || []);
        } catch (fetchError: any) {
            setActivityError(fetchError.message || "Failed to load activity");
            setActivityEvents([]);
        } finally {
            setActivityLoading(false);
        }
    }, [activityAction, activityEntityType, router]);

    useEffect(() => {
        const role = localStorage.getItem("gc_role");
        const name = localStorage.getItem("gc_user_name");

        if (name) {
            setAdminName(name);
        }

        if (role !== "admin") {
            router.push("/login");
            return;
        }

        fetchUsers();
        fetchActivity();
    }, [fetchActivity, fetchUsers, router]);

    const handleToggleUserStatus = async (user: ManagedUser) => {
        const token = localStorage.getItem("gc_token");
        if (!token) {
            router.push("/login");
            return;
        }

        setUpdatingUserId(user.id);
        setError("");

        try {
            const res = await fetch(`/api/admin/users/${user.id}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ isActive: !user.isActive })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to update user status");
            }

            setUsers((prev) => prev.map((item) => item.id === user.id ? { ...item, isActive: data.user.isActive } : item));
        } catch (statusError: any) {
            setError(statusError.message || "Failed to update user status");
        } finally {
            setUpdatingUserId(null);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="bg-teal-600 p-1.5 rounded-lg">
                        <Activity className="h-5 w-5 text-white" />
                    </div>
                    <h1 className="text-xl font-bold text-slate-900">GlucoCare+ Admin</h1>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-sm text-slate-600">{adminName}</div>
                    <button
                        onClick={handleSignOut}
                        className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                    >
                        Sign Out
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2 relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
                            placeholder="Search by name, email, or phone"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <select
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                    >
                        <option value="">All Roles</option>
                        <option value="patient">Patient</option>
                        <option value="doctor">Doctor</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button
                        onClick={fetchUsers}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium"
                    >
                        Apply
                    </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    {error && <div className="text-sm text-red-600 bg-red-50 border-b border-red-100 px-4 py-3">{error}</div>}
                    {loading ? (
                        <div className="p-6 text-sm text-slate-500">Loading users...</div>
                    ) : users.length === 0 ? (
                        <div className="p-6 text-sm text-slate-500">No users found for current filter.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 font-semibold text-slate-700">User</th>
                                        <th className="text-left px-4 py-3 font-semibold text-slate-700">Role</th>
                                        <th className="text-left px-4 py-3 font-semibold text-slate-700">Status</th>
                                        <th className="text-left px-4 py-3 font-semibold text-slate-700">Created</th>
                                        <th className="text-right px-4 py-3 font-semibold text-slate-700">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => (
                                        <tr key={user.id} className="border-b border-slate-100 last:border-b-0">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-slate-800">{user.name}</div>
                                                <div className="text-xs text-slate-500">{user.email}</div>
                                                <div className="text-xs text-slate-500">{user.phone}</div>
                                            </td>
                                            <td className="px-4 py-3 capitalize text-slate-700">{user.role}</td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                    {user.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{new Date(user.createdAt).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => handleToggleUserStatus(user)}
                                                    disabled={updatingUserId === user.id}
                                                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium ${user.isActive ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'} disabled:opacity-50`}
                                                >
                                                    <Shield className="h-3.5 w-3.5" />
                                                    {updatingUserId === user.id ? 'Updating...' : user.isActive ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-slate-900">Recent Activity</h2>
                        <Link href="/activity" className="text-sm font-medium text-teal-600 hover:text-teal-700">View Full Activity</Link>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                            placeholder="Action (optional)"
                            value={activityAction}
                            onChange={(e) => setActivityAction(e.target.value)}
                        />
                        <input
                            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                            placeholder="Entity type (optional)"
                            value={activityEntityType}
                            onChange={(e) => setActivityEntityType(e.target.value)}
                        />
                        <button
                            onClick={fetchActivity}
                            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium"
                        >
                            Apply
                        </button>
                    </div>

                    {activityError && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{activityError}</div>}

                    {activityLoading ? (
                        <div className="text-sm text-slate-500">Loading activity...</div>
                    ) : activityEvents.length === 0 ? (
                        <div className="text-sm text-slate-500">No activity found.</div>
                    ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                            {activityEvents.map((event) => (
                                <div key={event.id} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-medium text-slate-800">{event.action.replace(/_/g, ' ')}</p>
                                        <p className="text-xs text-slate-500 mt-1">{event.entityType}</p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Actor: {event.actor?.name || 'System'}{event.actor?.role ? ` (${event.actor.role})` : ''}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Target: {event.target?.name || 'N/A'}{event.target?.role ? ` (${event.target.role})` : ''}
                                        </p>
                                    </div>
                                    <p className="text-xs text-slate-500 whitespace-nowrap">{new Date(event.createdAt).toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

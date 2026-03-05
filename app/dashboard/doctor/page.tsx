"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, Users, Search, Pill, Stethoscope } from "lucide-react";

type PatientSummary = {
    id: string;
    name: string;
    email: string;
    phone: string;
    latestReading: number | null;
    status: string;
    alert?: {
        id: string;
        alertType: string;
        severity: string;
        message: string;
        createdAt: string;
    } | null;
};

type PatientReading = {
    id: string;
    value: number;
    type: string;
    createdAt: string;
};

type Prescription = {
    id: string;
    medicine: string;
    dosage: string;
    duration: string;
    notes: string | null;
    createdAt: string;
};

type Reminder = {
    id: string;
    title: string;
    message: string;
    remindAt: string;
    isDone: boolean;
    createdAt: string;
};

export default function DoctorDashboard() {
    const router = useRouter();
    const [doctorName, setDoctorName] = useState("Doctor");
    const [patients, setPatients] = useState<PatientSummary[]>([]);
    const [search, setSearch] = useState("");
    const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
    const [patientReadings, setPatientReadings] = useState<PatientReading[]>([]);
    const [patientAlerts, setPatientAlerts] = useState<Array<{ id: string; severity: string; message: string; createdAt: string; isActive: boolean }>>([]);
    const [patientPrescriptions, setPatientPrescriptions] = useState<Prescription[]>([]);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [pageError, setPageError] = useState("");
    const [assignEmail, setAssignEmail] = useState("");
    const [assignLoading, setAssignLoading] = useState(false);
    const [showPrescribe, setShowPrescribe] = useState(false);
    const [prescription, setPrescription] = useState({ medicine: "", dosage: "", duration: "", notes: "" });
    const [patientReminders, setPatientReminders] = useState<Reminder[]>([]);
    const [reminderLoading, setReminderLoading] = useState(false);
    const [reminderForm, setReminderForm] = useState({ title: '', message: '', remindAt: new Date().toISOString().slice(0, 16) });
    const [savingReminder, setSavingReminder] = useState(false);
    const [activityEvents, setActivityEvents] = useState<Array<{ id: string; action: string; entityType: string; createdAt: string }>>([]);
    const [activityLoading, setActivityLoading] = useState(true);
    const [exportingReport, setExportingReport] = useState(false);

    const filteredPatients = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) {
            return patients;
        }

        return patients.filter((patient) =>
            patient.name.toLowerCase().includes(query)
            || patient.email.toLowerCase().includes(query)
            || patient.phone.toLowerCase().includes(query)
        );
    }, [patients, search]);

    const fetchPatients = useCallback(async () => {
        const token = localStorage.getItem("gc_token");
        if (!token) {
            return;
        }

        const res = await fetch('/api/doctor/patients', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
            throw new Error('Failed to fetch assigned patients');
        }

        const data = await res.json();
        setPatients(data.patients || []);
    }, []);

    const fetchPatientDetails = useCallback(async (patientId: string) => {
        const token = localStorage.getItem("gc_token");
        if (!token) {
            return;
        }

        setDetailsLoading(true);
        try {
            const res = await fetch(`/api/doctor/patients/${patientId}?range=30d`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Failed to load patient details');
            }

            const data = await res.json();
            setPatientReadings(data.readings || []);
            setPatientAlerts(data.alerts || []);
            setPatientPrescriptions(data.prescriptions || []);
        } finally {
            setDetailsLoading(false);
        }
    }, []);

    const fetchActivity = useCallback(async () => {
        const token = localStorage.getItem("gc_token");
        if (!token) {
            return;
        }

        setActivityLoading(true);
        try {
            const res = await fetch('/api/audit/activity?limit=10', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Failed to fetch activity');
            }

            const data = await res.json();
            setActivityEvents(data.events || []);
        } finally {
            setActivityLoading(false);
        }
    }, []);

    const fetchPatientReminders = useCallback(async (patientId: string) => {
        const token = localStorage.getItem("gc_token");
        if (!token) {
            return;
        }

        setReminderLoading(true);
        try {
            const res = await fetch(`/api/doctor/reminders?patientId=${patientId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Failed to fetch reminders');
            }

            const data = await res.json();
            setPatientReminders(data.reminders || []);
        } finally {
            setReminderLoading(false);
        }
    }, []);

    useEffect(() => {
        const name = localStorage.getItem('gc_user_name');
        if (name) {
            setDoctorName(name);
        }

        fetchPatients().catch((error: any) => {
            setPageError(error.message || 'Failed to load doctor dashboard');
        });

        fetchActivity().catch((error: any) => {
            setPageError(error.message || 'Failed to load activity feed');
        });
    }, [fetchActivity, fetchPatients]);

    useEffect(() => {
        if (selectedPatient) {
            fetchPatientDetails(selectedPatient.id).catch((error: any) => {
                setPageError(error.message || 'Failed to load patient details');
            });

            fetchPatientReminders(selectedPatient.id).catch((error: any) => {
                setPageError(error.message || 'Failed to load reminders');
            });
        }
    }, [fetchPatientDetails, fetchPatientReminders, selectedPatient]);

    const handleAssignPatient = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem("gc_token");
        if (!token || !assignEmail.trim()) {
            return;
        }

        setAssignLoading(true);
        setPageError('');
        try {
            const res = await fetch('/api/doctor/assignments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ patientEmail: assignEmail })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to assign patient');
            }

            setAssignEmail('');
            await fetchPatients();
            await fetchActivity();
        } catch (error: any) {
            setPageError(error.message || 'Failed to assign patient');
        } finally {
            setAssignLoading(false);
        }
    };

    const handlePrescribe = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem("gc_token");
        if (!token || !selectedPatient) {
            return;
        }

        try {
            const res = await fetch('/api/doctor/prescriptions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    patientId: selectedPatient.id,
                    medicine: prescription.medicine,
                    dosage: prescription.dosage,
                    duration: prescription.duration,
                    notes: prescription.notes
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to save prescription');
            }

            setShowPrescribe(false);
            setPrescription({ medicine: "", dosage: "", duration: "", notes: "" });
            await fetchPatientDetails(selectedPatient.id);
            await fetchActivity();
        } catch (error: any) {
            setPageError(error.message || 'Failed to save prescription');
        }
    };

    const handleCreateReminder = async (e: React.FormEvent) => {
        e.preventDefault();

        const token = localStorage.getItem("gc_token");
        if (!token || !selectedPatient) {
            return;
        }

        setSavingReminder(true);
        setPageError('');
        try {
            const res = await fetch('/api/doctor/reminders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    patientId: selectedPatient.id,
                    title: reminderForm.title,
                    message: reminderForm.message,
                    remindAt: reminderForm.remindAt
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to create reminder');
            }

            setReminderForm({ title: '', message: '', remindAt: new Date().toISOString().slice(0, 16) });
            await fetchPatientReminders(selectedPatient.id);
            await fetchActivity();
        } catch (error: any) {
            setPageError(error.message || 'Failed to create reminder');
        } finally {
            setSavingReminder(false);
        }
    };

    const handleExportPatientReport = async () => {
        const token = localStorage.getItem("gc_token");
        if (!token || !selectedPatient) {
            return;
        }

        setExportingReport(true);
        setPageError('');
        try {
            const res = await fetch(`/api/doctor/patients/${selectedPatient.id}/report?range=30d&format=csv`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!res.ok) {
                throw new Error('Failed to export patient report');
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const safeName = selectedPatient.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${safeName || 'patient'}-report-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);

            await fetchActivity();
        } catch (error: any) {
            setPageError(error.message || 'Failed to export patient report');
        } finally {
            setExportingReport(false);
        }
    };

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

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white px-6 py-4 shadow-sm flex items-center justify-between">
                <h1 className="text-xl font-bold flex items-center gap-2 text-teal-600"><Activity className="h-5 w-5" /> GlucoCare+</h1>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">Dr. {doctorName}</span>
                    <div className="h-8 w-8 bg-teal-100 rounded-full flex items-center justify-center text-teal-600"><Stethoscope className="h-5 w-5" /></div>
                    <button
                        onClick={handleSignOut}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
                    >
                        Sign Out
                    </button>
                </div>
            </header>

            <main className="flex-1 max-w-7xl mx-auto w-full flex flex-col md:flex-row p-6 md:p-10 gap-6 text-black">

                {/* Left Sidebar - Patient List */}
                <div className="md:w-1/3 bg-white rounded-xl shadow border border-gray-100 flex flex-col min-h-[500px]">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2"><Users className="h-4 w-4" /> Patient List</h2>
                    </div>
                    <div className="p-4 border-b border-gray-100">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search patients..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                            />
                        </div>
                        <form className="mt-3 space-y-2" onSubmit={handleAssignPatient}>
                            <input
                                type="email"
                                value={assignEmail}
                                onChange={(e) => setAssignEmail(e.target.value)}
                                placeholder="Assign by patient email"
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                            />
                            <button
                                type="submit"
                                disabled={assignLoading}
                                className="w-full px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition text-sm font-medium disabled:opacity-50"
                            >
                                {assignLoading ? 'Assigning...' : 'Assign Patient'}
                            </button>
                        </form>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {filteredPatients.map((p) => (
                            <div
                                key={p.id}
                                onClick={() => setSelectedPatient(p)}
                                className={`p-3 mx-2 mb-2 rounded-lg cursor-pointer transition border py-3 ${selectedPatient?.id === p.id ? 'bg-teal-50 border-teal-200' : 'hover:bg-gray-50 border-transparent'}`}
                            >
                                <div className="font-semibold text-gray-900">{p.name}</div>
                                <div className="flex justify-between items-center mt-1">
                                    <span className="text-xs text-gray-500">{p.latestReading ?? '—'} mg/dL</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${p.status === 'High Risk' ? 'bg-red-100 text-red-700' :
                                            p.status === 'Moderate Risk' ? 'bg-orange-100 text-orange-700' :
                                            p.status === 'Low Risk' ? 'bg-yellow-100 text-yellow-700' :
                                                p.status === 'No Data' ? 'bg-gray-100 text-gray-700' :
                                                'bg-green-100 text-green-700'
                                        }`}>{p.status}</span>
                                </div>
                                {p.alert?.message && <p className="mt-1 text-[11px] text-gray-500 line-clamp-2">{p.alert.message}</p>}
                            </div>
                        ))}
                        {filteredPatients.length === 0 && (
                            <div className="text-sm text-gray-500 p-4">No assigned patients found. Use "Assign by patient email" above to link a patient.</div>
                        )}
                    </div>
                </div>

                {/* Right Main Content */}
                <div className="flex-1 bg-white rounded-xl shadow border border-gray-100 p-6 min-h-[500px]">
                    <div className="space-y-6">
                        {selectedPatient ? (
                            <div className="space-y-6">
                                {pageError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{pageError}</div>}
                                <div className="flex justify-between items-start border-b border-gray-100 pb-4">
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">{selectedPatient.name}</h2>
                                        <p className="text-gray-500">{selectedPatient.phone}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleExportPatientReport}
                                            disabled={exportingReport}
                                            className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium disabled:opacity-50"
                                        >
                                            {exportingReport ? 'Exporting...' : 'Export CSV'}
                                        </button>
                                        <button onClick={() => setShowPrescribe(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition shadow-sm text-sm font-medium">
                                            <Pill className="h-4 w-4" /> Add Prescription
                                        </button>
                                    </div>
                                </div>

                                {showPrescribe ? (
                                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-black">
                                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Pill className="h-5 w-5 text-teal-600" /> New Prescription</h3>
                                        <form onSubmit={handlePrescribe} className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Medicine Name</label>
                                                <input type="text" required value={prescription.medicine} onChange={e => setPrescription({ ...prescription, medicine: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex-1">
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Dosage</label>
                                                    <input type="text" placeholder="e.g. 1-0-1" required value={prescription.dosage} onChange={e => setPrescription({ ...prescription, dosage: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                                                    <input type="text" placeholder="e.g. 5 days" required value={prescription.duration} onChange={e => setPrescription({ ...prescription, duration: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                                <textarea value={prescription.notes} onChange={e => setPrescription({ ...prescription, notes: e.target.value })} className="w-full px-3 py-2 border rounded-md" rows={3}></textarea>
                                            </div>
                                            <div className="flex gap-3 justify-end pt-2">
                                                <button type="button" onClick={() => setShowPrescribe(false)} className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                                                <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition">Save Prescription</button>
                                            </div>
                                        </form>
                                    </div>
                                ) : (
                                    <div>
                                        <h3 className="text-lg font-bold mb-4">Patient Glucose History</h3>
                                        {detailsLoading ? (
                                            <div className="bg-gray-50 p-8 rounded-lg border border-gray-200 text-gray-500">Loading patient details...</div>
                                        ) : (
                                            <div className="space-y-4">
                                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                                    <h4 className="font-semibold text-gray-800 mb-3">Active Alerts</h4>
                                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                                        {patientAlerts.filter((alert) => alert.isActive).map((alert) => (
                                                            <div key={alert.id} className={`rounded-md border px-3 py-2 text-sm ${alert.severity === 'high' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
                                                                <p className="font-medium">{alert.message}</p>
                                                                <p className="text-xs mt-1 opacity-75">{new Date(alert.createdAt).toLocaleString()}</p>
                                                            </div>
                                                        ))}
                                                        {patientAlerts.filter((alert) => alert.isActive).length === 0 && <p className="text-sm text-gray-500">No active alerts.</p>}
                                                    </div>
                                                </div>

                                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                                    <h4 className="font-semibold text-gray-800 mb-3">Recent Readings</h4>
                                                    <div className="space-y-2 max-h-56 overflow-y-auto">
                                                        {patientReadings.slice(0, 8).map((reading) => (
                                                            <div key={reading.id} className="flex justify-between text-sm bg-white rounded-md border border-gray-200 px-3 py-2">
                                                                <span>{reading.value} mg/dL • {reading.type === 'post-meal' ? 'Post-Meal' : 'Fasting'}</span>
                                                                <span className="text-gray-500">{new Date(reading.createdAt).toLocaleString()}</span>
                                                            </div>
                                                        ))}
                                                        {patientReadings.length === 0 && <p className="text-sm text-gray-500">No readings in selected window.</p>}
                                                    </div>
                                                </div>

                                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                                    <h4 className="font-semibold text-gray-800 mb-3">Recent Prescriptions</h4>
                                                    <div className="space-y-2 max-h-56 overflow-y-auto">
                                                        {patientPrescriptions.slice(0, 8).map((item) => (
                                                            <div key={item.id} className="bg-white rounded-md border border-gray-200 px-3 py-2">
                                                                <p className="text-sm font-medium text-gray-900">{item.medicine} • {item.dosage} • {item.duration}</p>
                                                                {item.notes && <p className="text-sm text-gray-600 mt-1">{item.notes}</p>}
                                                                <p className="text-xs text-gray-500 mt-1">{new Date(item.createdAt).toLocaleString()}</p>
                                                            </div>
                                                        ))}
                                                        {patientPrescriptions.length === 0 && <p className="text-sm text-gray-500">No prescriptions yet.</p>}
                                                    </div>
                                                </div>

                                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                                    <h4 className="font-semibold text-gray-800 mb-3">Medication & Care Reminders</h4>

                                                    <form onSubmit={handleCreateReminder} className="space-y-2 mb-3">
                                                        <input
                                                            type="text"
                                                            placeholder="Reminder title"
                                                            required
                                                            value={reminderForm.title}
                                                            onChange={(e) => setReminderForm({ ...reminderForm, title: e.target.value })}
                                                            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                                                        />
                                                        <textarea
                                                            placeholder="Reminder message"
                                                            required
                                                            value={reminderForm.message}
                                                            onChange={(e) => setReminderForm({ ...reminderForm, message: e.target.value })}
                                                            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                                                            rows={2}
                                                        />
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="datetime-local"
                                                                required
                                                                value={reminderForm.remindAt}
                                                                onChange={(e) => setReminderForm({ ...reminderForm, remindAt: e.target.value })}
                                                                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                                                            />
                                                            <button
                                                                type="submit"
                                                                disabled={savingReminder}
                                                                className="px-3 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                                                            >
                                                                {savingReminder ? 'Saving...' : 'Create'}
                                                            </button>
                                                        </div>
                                                    </form>

                                                    {reminderLoading ? (
                                                        <p className="text-sm text-gray-500">Loading reminders...</p>
                                                    ) : (
                                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                                            {patientReminders.map((item) => (
                                                                <div key={item.id} className={`rounded-md border px-3 py-2 text-sm ${item.isDone ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-800'}`}>
                                                                    <p className="font-medium">{item.title}</p>
                                                                    <p className="mt-1 text-xs opacity-90">{item.message}</p>
                                                                    <p className="mt-1 text-xs opacity-75">Due: {new Date(item.remindAt).toLocaleString()}</p>
                                                                </div>
                                                            ))}
                                                            {patientReminders.length === 0 && <p className="text-sm text-gray-500">No reminders created yet.</p>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 pt-20">
                                <Users className="h-16 w-16 mb-4 opacity-20" />
                                <p className="text-lg font-medium">Select a patient to view details</p>
                                <p className="text-sm mt-2">Patients appear here only after you assign them from the left panel.</p>
                                {pageError && <p className="text-sm text-red-600 mt-4">{pageError}</p>}
                            </div>
                        )}

                        <div className="border-t border-gray-100 pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-bold text-gray-900">Recent Activity</h3>
                                <Link href="/activity" className="text-sm font-medium text-teal-600 hover:text-teal-700">View Full Activity</Link>
                            </div>
                            {activityLoading ? (
                                <p className="text-sm text-gray-500">Loading activity...</p>
                            ) : activityEvents.length === 0 ? (
                                <p className="text-sm text-gray-500">No activity recorded yet.</p>
                            ) : (
                                <div className="space-y-2 max-h-52 overflow-y-auto">
                                    {activityEvents.map((event) => (
                                        <div key={event.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-start justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-gray-800">{event.action.replace(/_/g, ' ')}</p>
                                                <p className="text-xs text-gray-500 mt-1">{event.entityType}</p>
                                            </div>
                                            <p className="text-xs text-gray-500">{new Date(event.createdAt).toLocaleString()}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

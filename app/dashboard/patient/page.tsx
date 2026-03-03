"use client";

import { useState } from "react";
import { Activity, Plus, AlertTriangle, TrendingUp, UserRound } from "lucide-react";
// Mock chart implementation for simplicity

export default function PatientDashboard() {
    const [readings, setReadings] = useState([
        { id: 1, value: 110, type: "fasting", date: "2024-05-19T08:00" },
        { id: 2, value: 145, type: "post-meal", date: "2024-05-18T14:30" },
    ]);
    const [showAdd, setShowAdd] = useState(false);
    const [newReading, setNewReading] = useState({ value: "", type: "fasting" });

    const handleAddReading = (e: React.FormEvent) => {
        e.preventDefault();
        setReadings([{ id: Date.now(), value: parseInt(newReading.value), type: newReading.type, date: new Date().toISOString() }, ...readings]);
        setShowAdd(false);
        setNewReading({ value: "", type: "fasting" });
    };

    const latestReading = readings[0]?.value || 0;
    let statusColor = "text-green-600";
    let statusAlert = "Normal";

    if (latestReading > 140) {
        statusColor = "text-red-600";
        statusAlert = "High Risk";
    } else if (latestReading < 70) {
        statusColor = "text-yellow-600";
        statusAlert = "Low Risk";
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white px-6 py-4 shadow-sm flex items-center justify-between">
                <h1 className="text-xl font-bold flex items-center gap-2 text-blue-600"><Activity className="h-5 w-5" /> GlucoCare+</h1>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">Patient Mode</span>
                    <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600"><UserRound className="h-5 w-5" /></div>
                </div>
            </header>

            <main className="flex-1 max-w-7xl mx-auto w-full p-6 sm:p-10 space-y-6 text-black">
                <h2 className="text-2xl font-bold text-gray-900">Health Overview</h2>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
                        <div className="text-sm text-gray-500 font-medium">Latest Reading</div>
                        <div className="text-3xl font-bold mt-2 flex items-baseline gap-2">
                            {latestReading} <span className="text-sm font-normal text-gray-400">mg/dL</span>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
                        <div className="text-sm text-gray-500 font-medium">Weekly Average</div>
                        <div className="text-3xl font-bold mt-2 flex items-baseline gap-2">
                            122 <span className="text-sm font-normal text-gray-400">mg/dL</span>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
                        <div className="text-sm text-gray-500 font-medium">Alert Status</div>
                        <div className={`text-2xl font-bold mt-2 flex items-center gap-2 ${statusColor}`}>
                            {statusAlert === "High Risk" && <AlertTriangle className="h-6 w-6" />}
                            {statusAlert}
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow border border-gray-100 flex items-center justify-center cursor-pointer hover:bg-gray-50 transition" onClick={() => setShowAdd(true)}>
                        <div className="flex flex-col items-center text-blue-600">
                            <Plus className="h-8 w-8 mb-2" />
                            <span className="font-semibold">Add Reading</span>
                        </div>
                    </div>
                </div>

                {showAdd && (
                    <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
                        <h3 className="text-lg font-bold mb-4">Add New Reading</h3>
                        <form onSubmit={handleAddReading} className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-sm text-gray-600 mb-1">Blood Sugar (mg/dL)</label>
                                <input type="number" required className="w-full px-3 py-2 border rounded-md" value={newReading.value} onChange={(e) => setNewReading({ ...newReading, value: e.target.value })} />
                            </div>
                            <div className="flex-1">
                                <label className="block text-sm text-gray-600 mb-1">Type</label>
                                <select className="w-full px-3 py-2 border rounded-md" value={newReading.type} onChange={(e) => setNewReading({ ...newReading, type: e.target.value })}>
                                    <option value="fasting">Fasting</option>
                                    <option value="post-meal">Post-Meal</option>
                                </select>
                            </div>
                            <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700">Add</button>
                        </form>
                    </div>
                )}

                <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900">Recent History</h3>
                        <TrendingUp className="text-gray-400" />
                    </div>
                    <div className="space-y-4">
                        {readings.map((r) => (
                            <div key={r.id} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0">
                                <div>
                                    <div className="font-semibold text-lg">{r.value} mg/dL</div>
                                    <div className="text-sm text-gray-500 capitalize">{r.type} • {new Date(r.date).toLocaleString()}</div>
                                </div>
                                <div className={`px-3 py-1 rounded-full text-xs font-medium border ${r.value > 140 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                    {r.value > 140 ? 'High' : 'Normal'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}

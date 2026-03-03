"use client";

import { useState } from "react";
import { Activity, Users, Search, Pill, Stethoscope } from "lucide-react";

const DUMMY_PATIENTS = [
    { id: 1, name: "Rahul Sharma", lastReading: 110, status: "Normal", phone: "+91 9876543210" },
    { id: 2, name: "Priya Patel", lastReading: 165, status: "High Risk", phone: "+91 8765432109" },
    { id: 3, name: "Amit Kumar", lastReading: 68, status: "Low Risk", phone: "+91 7654321098" },
];

export default function DoctorDashboard() {
    const [patients] = useState(DUMMY_PATIENTS);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    const [showPrescribe, setShowPrescribe] = useState(false);
    const [prescription, setPrescription] = useState({ medicine: "", dosage: "", duration: "", notes: "" });

    const handlePrescribe = (e: React.FormEvent) => {
        e.preventDefault();
        alert(`Prescription saved for ${selectedPatient.name}`);
        setShowPrescribe(false);
        setPrescription({ medicine: "", dosage: "", duration: "", notes: "" });
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white px-6 py-4 shadow-sm flex items-center justify-between">
                <h1 className="text-xl font-bold flex items-center gap-2 text-blue-600"><Activity className="h-5 w-5" /> GlucoCare+</h1>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">Dr. Vivek</span>
                    <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600"><Stethoscope className="h-5 w-5" /></div>
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
                            <input type="text" placeholder="Search patients..." className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {patients.map(p => (
                            <div
                                key={p.id}
                                onClick={() => setSelectedPatient(p)}
                                className={`p-3 mx-2 mb-2 rounded-lg cursor-pointer transition border py-3 ${selectedPatient?.id === p.id ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-transparent'}`}
                            >
                                <div className="font-semibold text-gray-900">{p.name}</div>
                                <div className="flex justify-between items-center mt-1">
                                    <span className="text-xs text-gray-500">{p.lastReading} mg/dL</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${p.status === 'High Risk' ? 'bg-red-100 text-red-700' :
                                            p.status === 'Low Risk' ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-green-100 text-green-700'
                                        }`}>{p.status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Main Content */}
                <div className="flex-1 bg-white rounded-xl shadow border border-gray-100 p-6 min-h-[500px]">
                    {selectedPatient ? (
                        <div className="space-y-6">
                            <div className="flex justify-between items-start border-b border-gray-100 pb-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">{selectedPatient.name}</h2>
                                    <p className="text-gray-500">{selectedPatient.phone}</p>
                                </div>
                                <button onClick={() => setShowPrescribe(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm text-sm font-medium">
                                    <Pill className="h-4 w-4" /> Add Prescription
                                </button>
                            </div>

                            {showPrescribe ? (
                                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-black">
                                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Pill className="h-5 w-5 text-blue-600" /> New Prescription</h3>
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
                                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Save Prescription</button>
                                        </div>
                                    </form>
                                </div>
                            ) : (
                                <div>
                                    <h3 className="text-lg font-bold mb-4">Patient Glucose History</h3>
                                    <div className="bg-gray-50 p-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400">
                                        <div className="text-center">
                                            <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                            <p>[ Chart.js Graph View will render here ]</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 pt-20">
                            <Users className="h-16 w-16 mb-4 opacity-20" />
                            <p className="text-lg font-medium">Select a patient to view details</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

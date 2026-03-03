"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, User, Mail, Phone, CalendarDays, Stethoscope, FileBadge, Lock, CheckCircle2, Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
    const [role, setRole] = useState("patient");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Doctor/Patient specific fields
    const [specialization, setSpecialization] = useState("");
    const [medicalRegNo, setMedicalRegNo] = useState("");
    const [age, setAge] = useState("");
    const [gender, setGender] = useState("");

    const [error, setError] = useState("");
    const router = useRouter();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        try {
            const payload = {
                action: 'register',
                name, email, phone, password, role,
                ...(role === 'doctor' ? { specialization, medicalRegistrationNo: medicalRegNo } : { age: parseInt(age), gender })
            };

            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                throw new Error('Registration failed');
            }

            router.push("/login");
        } catch (err: any) {
            setError(err.message || "Failed to register");
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>

            <div className="max-w-md w-full space-y-8 bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/50 relative z-10 transition-all duration-500">
                <div className="text-center">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-2xl flex items-center justify-center shadow-lg transform transition hover:scale-105">
                        <Activity className="h-8 w-8 text-white" />
                    </div>
                    <h2 className="mt-6 text-3xl font-extrabold text-gray-900 tracking-tight">Join GlucoCare+</h2>
                    <p className="mt-2 text-sm text-gray-500">Smarter care starts here.</p>
                </div>

                <div className="relative flex p-1 bg-gray-100/80 rounded-xl backdrop-blur-sm">
                    <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm transition-transform duration-300 ease-out ${role === 'doctor' ? 'translate-x-full' : 'translate-x-0'}`}></div>
                    <button
                        type="button"
                        onClick={() => setRole("patient")}
                        className={`flex-1 py-2.5 text-sm font-semibold rounded-lg z-10 transition-colors duration-300 ${role === 'patient' ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        I'm a Patient
                    </button>
                    <button
                        type="button"
                        onClick={() => setRole("doctor")}
                        className={`flex-1 py-2.5 text-sm font-semibold rounded-lg z-10 transition-colors duration-300 ${role === 'doctor' ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        I'm a Doctor
                    </button>
                </div>

                <form className="mt-8 space-y-5" onSubmit={handleRegister}>
                    <div className="space-y-4">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                                <User className="h-5 w-5" />
                            </div>
                            <input type="text" required placeholder="Full Name" className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-gray-50/50 backdrop-blur-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white transition-all duration-300" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>

                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                                <Mail className="h-5 w-5" />
                            </div>
                            <input type="email" required placeholder="Email Address" className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-gray-50/50 backdrop-blur-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white transition-all duration-300" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>

                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                                <Phone className="h-5 w-5" />
                            </div>
                            <input type="tel" required placeholder="Mobile Number (+91)" className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-gray-50/50 backdrop-blur-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white transition-all duration-300" value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </div>

                        {/* Animated Container for Role Specific Fields */}
                        <div className={`overflow-hidden transition-all duration-500 ease-in-out ${role === 'patient' ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
                            <div className="flex gap-4 pb-2">
                                <div className="relative group flex-1">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                                        <CalendarDays className="h-5 w-5" />
                                    </div>
                                    <input type="number" required={role === 'patient'} placeholder="Age" className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-gray-50/50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white transition-all duration-300" value={age} onChange={(e) => setAge(e.target.value)} />
                                </div>
                                <select required={role === 'patient'} className="flex-1 block w-full px-3 py-3 border border-gray-200 rounded-xl bg-gray-50/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white transition-all duration-300" value={gender} onChange={(e) => setGender(e.target.value)}>
                                    <option value="" disabled className="text-gray-400">Gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>

                        <div className={`overflow-hidden transition-all duration-500 ease-in-out ${role === 'doctor' ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                            <div className="space-y-4 pb-2">
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                                        <Stethoscope className="h-5 w-5" />
                                    </div>
                                    <input type="text" required={role === 'doctor'} placeholder="Specialization (e.g. Endocrinologist)" className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-gray-50/50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white transition-all duration-300" value={specialization} onChange={(e) => setSpecialization(e.target.value)} />
                                </div>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                                        <FileBadge className="h-5 w-5" />
                                    </div>
                                    <input type="text" required={role === 'doctor'} placeholder="Medical Reg. No" className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-gray-50/50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white transition-all duration-300" value={medicalRegNo} onChange={(e) => setMedicalRegNo(e.target.value)} />
                                </div>
                            </div>
                        </div>

                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                                <Lock className="h-5 w-5" />
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                placeholder="Password"
                                className="block w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl bg-gray-50/50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white transition-all duration-300"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? (
                                    <EyeOff className="h-5 w-5" />
                                ) : (
                                    <Eye className="h-5 w-5" />
                                )}
                            </button>
                        </div>

                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                                <CheckCircle2 className="h-5 w-5" />
                            </div>
                            <input
                                type={showConfirmPassword ? "text" : "password"}
                                required
                                placeholder="Confirm Password"
                                className="block w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl bg-gray-50/50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white transition-all duration-300"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                                {showConfirmPassword ? (
                                    <EyeOff className="h-5 w-5" />
                                ) : (
                                    <Eye className="h-5 w-5" />
                                )}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50/80 backdrop-blur-sm border border-red-200 rounded-xl text-red-600 text-sm font-medium text-center animate-pulse">
                            {error}
                        </div>
                    )}

                    <button type="submit" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-md shadow-blue-500/30 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transform transition hover:-translate-y-0.5 active:translate-y-0">
                        Create Account
                    </button>
                </form>

                <div className="text-center pt-2">
                    <p className="text-sm text-gray-600">
                        Already have an account?{' '}
                        <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-500 transition-colors">
                            Sign in instead
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

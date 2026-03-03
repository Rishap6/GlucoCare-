import Link from "next/link";
import { Activity, ShieldCheck, Stethoscope } from "lucide-react";

export default function LandingPage() {
    return (
        <main className="min-h-screen flex flex-col items-center justify-between text-gray-800">
            <header className="w-full bg-white shadow-sm py-4 px-6 md:px-12 flex justify-between items-center">
                <h1 className="text-2xl font-bold text-blue-600 flex items-center gap-2">
                    <Activity className="h-6 w-6" /> GlucoCare+
                </h1>
                <nav className="flex gap-4">
                    <Link href="/login" className="px-4 py-2 font-medium text-blue-600 hover:text-blue-700 transition">
                        Login
                    </Link>
                    <Link href="/register" className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition shadow">
                        Register
                    </Link>
                </nav>
            </header>

            <section className="flex-1 w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-center p-6 md:p-12 gap-10">
                <div className="flex-1 space-y-6">
                    <h2 className="text-4xl md:text-5xl font-extrabold leading-tight text-gray-900">
                        Smart Diabetes Monitoring <br />
                        <span className="text-blue-600">for Indian Healthcare</span>
                    </h2>
                    <p className="text-lg text-gray-600 leading-relaxed">
                        Real-Time Monitoring. Safe Prescriptions. Smarter Care.
                        Connect seamlessly with your doctor and keep your health in check. Built for +91 numbers and ₹ savings.
                    </p>
                    <div className="flex gap-4 pt-4">
                        <Link href="/register" className="px-6 py-3 bg-blue-600 text-white font-medium rounded-md shadow hover:bg-blue-700 transition text-lg flex items-center justify-center">
                            Start Your Journey
                        </Link>
                    </div>
                </div>
                <div className="flex-1 space-y-4 flex flex-col items-center md:items-end w-full">
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 w-full max-w-sm">
                        <div className="flex items-center gap-3 mb-4 text-blue-600">
                            <ShieldCheck className="h-6 w-6" />
                            <h3 className="font-semibold text-lg">Secure & Private</h3>
                        </div>
                        <p className="text-gray-500 text-sm">Your medical data is securely stored and shared only with your trusted doctors.</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 w-full max-w-sm">
                        <div className="flex items-center gap-3 mb-4 text-green-600">
                            <Stethoscope className="h-6 w-6" />
                            <h3 className="font-semibold text-lg">Expert Doctors</h3>
                        </div>
                        <p className="text-gray-500 text-sm">Get real prescription updates from verified Indian hospital practitioners directly on the app.</p>
                    </div>
                </div>
            </section>

            <footer className="w-full bg-slate-900 py-8 px-6 text-center text-sm text-gray-400">
                <p>Made in India 🇮🇳</p>
                <div className="flex justify-center gap-6 mt-4">
                    <Link href="#" className="hover:text-white">Privacy Policy</Link>
                    <Link href="#" className="hover:text-white">Terms of Care</Link>
                    <Link href="#" className="hover:text-white">Contact Us</Link>
                </div>
            </footer>
        </main>
    );
}

"use client";

import Script from "next/script";

const landingCss = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

:root {
    --primary-teal: #0D9488;
    --primary-teal-light: #14B8A6;
    --primary-teal-dark: #0F766E;
    --deep-blue: #0F172A;
    --deep-blue-light: #1E293B;
    --light-cyan: #CCFBF1;
    --light-cyan-dark: #99F6E4;
    --white: #FFFFFF;
    --gray-50: #F8FAFC;
    --gray-100: #F1F5F9;
    --gray-200: #E2E8F0;
    --gray-500: #64748B;
    --gray-700: #334155;
    --success: #10B981;
    --warning: #F59E0B;
    --danger: #EF4444;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

html {
    scroll-behavior: smooth;
}

body {
    font-family: 'Inter', sans-serif;
    color: var(--deep-blue);
    line-height: 1.6;
    overflow-x: hidden;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 14px 28px;
    font-size: 16px;
    font-weight: 600;
    border-radius: 12px;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.3s ease;
    border: none;
}

.btn-primary {
    background: var(--primary-teal);
    color: var(--white);
    box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);
}

.btn-primary:hover {
    background: var(--primary-teal-dark);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(13, 148, 136, 0.5);
}

.btn-secondary {
    background: transparent;
    color: var(--white);
    border: 2px solid var(--white);
}

.btn-secondary:hover {
    background: var(--white);
    color: var(--primary-teal);
    transform: translateY(-2px);
}

.btn-outline {
    background: transparent;
    color: var(--primary-teal);
    border: 2px solid var(--primary-teal);
}

.btn-outline:hover {
    background: var(--primary-teal);
    color: var(--white);
    transform: translateY(-2px);
}

header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(10px);
    transition: all 0.3s ease;
}

header.scrolled {
    background: rgba(15, 23, 42, 0.98);
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
}

nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0;
}

.logo {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
}

.logo-icon {
    width: 44px;
    height: 44px;
    background: linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}

.logo-icon img {
    width: 30px;
    height: 30px;
    object-fit: contain;
}

.logo-text {
    font-size: 24px;
    font-weight: 800;
    color: var(--white);
}

.logo-text span {
    color: var(--primary-teal-light);
}

.nav-links {
    display: flex;
    align-items: center;
    gap: 32px;
    list-style: none;
}

.nav-links a {
    color: var(--gray-200);
    text-decoration: none;
    font-weight: 500;
    font-size: 15px;
    transition: color 0.3s ease;
}

.nav-links a:hover {
    color: var(--primary-teal-light);
}

.nav-cta {
    display: flex;
    align-items: center;
    gap: 12px;
}

.mobile-menu-btn {
    display: none;
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px;
}

.mobile-menu-btn span {
    display: block;
    width: 24px;
    height: 2px;
    background: var(--white);
    margin: 6px 0;
    transition: all 0.3s ease;
}

.hero {
    min-height: 100vh;
    background: linear-gradient(135deg, var(--deep-blue) 0%, #1a2744 50%, #0d2137 100%);
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    padding-top: 80px;
}

.hero-bg-image {
    position: absolute;
    right: -100px;
    top: 50%;
    transform: translateY(-50%);
    width: 600px;
    height: 600px;
    opacity: 0.15;
    pointer-events: none;
}

.hero-bg-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
}

.hero::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background:
        radial-gradient(circle at 20% 80%, rgba(13, 148, 136, 0.15) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(20, 184, 166, 0.1) 0%, transparent 40%),
        radial-gradient(circle at 40% 40%, rgba(153, 246, 228, 0.05) 0%, transparent 30%);
    pointer-events: none;
}

.hero-pattern {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image:
        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
}

.hero-content {
    position: relative;
    z-index: 2;
    max-width: 700px;
}

.hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(13, 148, 136, 0.15);
    border: 1px solid rgba(13, 148, 136, 0.3);
    padding: 8px 16px;
    border-radius: 50px;
    margin-bottom: 24px;
    animation: fadeInUp 0.8s ease forwards;
    opacity: 0;
}

.hero-badge span {
    color: var(--primary-teal-light);
    font-size: 14px;
    font-weight: 500;
}

.hero-badge .dot {
    width: 8px;
    height: 8px;
    background: var(--success);
    border-radius: 50%;
    animation: pulse 2s infinite;
}

.hero h1 {
    font-size: 56px;
    font-weight: 800;
    color: var(--white);
    line-height: 1.1;
    margin-bottom: 24px;
    animation: fadeInUp 0.8s ease 0.2s forwards;
    opacity: 0;
}

.hero h1 .highlight {
    background: linear-gradient(135deg, var(--primary-teal-light) 0%, var(--light-cyan-dark) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.hero p {
    font-size: 18px;
    color: var(--gray-200);
    margin-bottom: 36px;
    line-height: 1.7;
    animation: fadeInUp 0.8s ease 0.4s forwards;
    opacity: 0;
}

.hero-buttons {
    display: flex;
    gap: 16px;
    animation: fadeInUp 0.8s ease 0.6s forwards;
    opacity: 0;
}

.hero-image {
    position: absolute;
    right: -50px;
    top: 50%;
    transform: translateY(-50%);
    width: 500px;
    height: 500px;
    animation: float 6s ease-in-out infinite;
}

.hero-image-card {
    background: linear-gradient(135deg, rgba(13, 148, 136, 0.2) 0%, rgba(15, 23, 42, 0.9) 100%);
    border: 1px solid rgba(13, 148, 136, 0.3);
    border-radius: 24px;
    padding: 32px;
    backdrop-filter: blur(20px);
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
}

.hero-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
}

.hero-card-title {
    color: var(--white);
    font-size: 18px;
    font-weight: 600;
}

.hero-card-icon {
    width: 40px;
    height: 40px;
    background: var(--primary-teal);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.glucose-display {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 24px;
}

.glucose-value {
    font-size: 48px;
    font-weight: 800;
    color: var(--success);
}

.glucose-unit {
    font-size: 18px;
    color: var(--gray-500);
}

.glucose-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(16, 185, 129, 0.2);
    color: var(--success);
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
}

.hero-stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
}

.stat-card {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 16px;
    text-align: center;
}

.stat-value {
    font-size: 24px;
    font-weight: 700;
    color: var(--white);
}

.stat-label {
    font-size: 12px;
    color: var(--gray-500);
}

.features {
    padding: 100px 0;
    background: var(--gray-50);
    position: relative;
}

.features::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 200px;
    background: linear-gradient(to bottom, var(--deep-blue) 0%, var(--gray-50) 100%);
    pointer-events: none;
}

.section-header {
    text-align: center;
    max-width: 700px;
    margin: 0 auto 60px;
    position: relative;
    z-index: 1;
}

.section-badge {
    display: inline-block;
    background: rgba(13, 148, 136, 0.1);
    color: var(--primary-teal);
    padding: 8px 16px;
    border-radius: 50px;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 16px;
}

.section-title {
    font-size: 40px;
    font-weight: 800;
    color: var(--deep-blue);
    margin-bottom: 16px;
}

.section-subtitle {
    font-size: 18px;
    color: var(--gray-500);
    line-height: 1.7;
}

.features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    position: relative;
    z-index: 1;
}

.feature-card {
    background: var(--white);
    border-radius: 20px;
    padding: 32px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    transition: all 0.3s ease;
    border: 1px solid var(--gray-100);
}

.feature-card:hover {
    transform: translateY(-8px);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
    border-color: var(--primary-teal);
}

.feature-image {
    width: 100%;
    height: 160px;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 20px;
    position: relative;
    background: linear-gradient(135deg, var(--light-cyan) 0%, rgba(13, 148, 136, 0.1) 100%);
}

.feature-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.feature-image-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(13, 148, 136, 0.1);
}

.feature-image-overlay svg {
    width: 64px;
    height: 64px;
    fill: var(--primary-teal);
    opacity: 0.8;
}

.feature-card:hover .feature-image-overlay svg {
    transform: scale(1.1);
    transition: transform 0.3s ease;
}

.feature-card h3 {
    font-size: 20px;
    font-weight: 700;
    color: var(--deep-blue);
    margin-bottom: 12px;
}

.feature-card p {
    font-size: 15px;
    color: var(--gray-500);
    line-height: 1.6;
}

.how-it-works {
    padding: 100px 0;
    background: var(--white);
}

.steps-container {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    position: relative;
    margin-top: 60px;
}

.steps-container::before {
    content: '';
    position: absolute;
    top: 50px;
    left: 10%;
    right: 10%;
    height: 3px;
    background: linear-gradient(90deg, var(--primary-teal), var(--light-cyan-dark));
    border-radius: 2px;
}

.step {
    flex: 1;
    text-align: center;
    position: relative;
    padding: 0 20px;
}

.step-icon {
    width: 64px;
    height: 64px;
    background: linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
}

.step-icon svg {
    width: 32px;
    height: 32px;
    fill: var(--white);
}

.step h3 {
    font-size: 20px;
    font-weight: 700;
    color: var(--deep-blue);
    margin-bottom: 12px;
}

.step p {
    font-size: 15px;
    color: var(--gray-500);
    line-height: 1.6;
}

.benefits {
    padding: 100px 0;
    background: linear-gradient(135deg, var(--deep-blue) 0%, #1a2744 100%);
    position: relative;
    overflow: hidden;
}

.benefits::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background:
        radial-gradient(circle at 30% 70%, rgba(13, 148, 136, 0.1) 0%, transparent 50%),
        radial-gradient(circle at 70% 30%, rgba(20, 184, 166, 0.08) 0%, transparent 40%);
    pointer-events: none;
}

.benefits .section-header {
    position: relative;
    z-index: 1;
}

.benefits .section-badge {
    background: rgba(13, 148, 136, 0.2);
    color: var(--light-cyan-dark);
}

.benefits .section-title {
    color: var(--white);
}

.benefits .section-subtitle {
    color: var(--gray-200);
}

.benefits-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 40px;
    position: relative;
    z-index: 1;
}

.benefit-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    padding: 40px;
    backdrop-filter: blur(10px);
    transition: all 0.3s ease;
}

.benefit-card:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-4px);
}

.benefit-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
}

.benefit-icon {
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.benefit-icon svg {
    width: 28px;
    height: 28px;
    fill: var(--white);
}

.benefit-header h3 {
    font-size: 24px;
    font-weight: 700;
    color: var(--white);
}

.benefit-list {
    list-style: none;
}

.benefit-list li {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
    color: var(--gray-200);
    font-size: 15px;
}

.benefit-list li svg {
    width: 20px;
    height: 20px;
    fill: var(--primary-teal-light);
    flex-shrink: 0;
    margin-top: 2px;
}

.cta {
    padding: 100px 0;
    background: var(--light-cyan);
    position: relative;
    overflow: hidden;
}

.cta::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background:
        radial-gradient(circle at 20% 50%, rgba(13, 148, 136, 0.1) 0%, transparent 50%),
        radial-gradient(circle at 80% 50%, rgba(15, 23, 42, 0.05) 0%, transparent 40%);
    pointer-events: none;
}

.cta-content {
    text-align: center;
    position: relative;
    z-index: 1;
    max-width: 700px;
    margin: 0 auto;
}

.cta h2 {
    font-size: 42px;
    font-weight: 800;
    color: var(--deep-blue);
    margin-bottom: 20px;
}

.cta p {
    font-size: 18px;
    color: var(--gray-700);
    margin-bottom: 36px;
    line-height: 1.7;
}

.cta-buttons {
    display: flex;
    justify-content: center;
    gap: 16px;
}

footer {
    background: var(--deep-blue);
    padding: 60px 0 30px;
    color: var(--gray-200);
}

.footer-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 40px;
    margin-bottom: 40px;
}

.footer-brand p {
    font-size: 15px;
    color: var(--gray-500);
    margin-top: 16px;
    line-height: 1.7;
}

.footer-bottom {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 30px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.footer-bottom p {
    font-size: 14px;
    color: var(--gray-500);
}

@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes float {
    0%, 100% {
        transform: translateY(-50%) translateX(0);
    }
    50% {
        transform: translateY(-53%) translateX(-10px);
    }
}

@keyframes pulse {
    0%, 100% {
        opacity: 1;
    }
    50% {
        opacity: 0.5;
    }
}

@media (max-width: 1024px) {
    .hero-image {
        display: none;
    }

    .hero-bg-image {
        display: none;
    }

    .features-grid {
        grid-template-columns: repeat(2, 1fr);
    }

    .steps-container {
        flex-wrap: wrap;
        gap: 40px;
    }

    .steps-container::before {
        display: none;
    }

    .step {
        flex: 0 0 calc(50% - 20px);
    }

    .footer-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (max-width: 768px) {
    .nav-links, .nav-cta {
        display: none;
    }

    .mobile-menu-btn {
        display: block;
    }

    .nav-links.active {
        display: flex;
        position: absolute;
        top: 76px;
        left: 20px;
        right: 20px;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(20, 184, 166, 0.2);
        border-radius: 14px;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
    }

    .hero h1 {
        font-size: 36px;
    }

    .hero p {
        font-size: 16px;
    }

    .hero-buttons {
        flex-direction: column;
    }

    .features-grid {
        grid-template-columns: 1fr;
    }

    .feature-image {
        height: 140px;
    }

    .step {
        flex: 0 0 100%;
    }

    .benefits-grid {
        grid-template-columns: 1fr;
    }

    .cta h2 {
        font-size: 32px;
    }

    .cta-buttons {
        flex-direction: column;
    }

    .footer-grid {
        grid-template-columns: 1fr;
    }

    .footer-bottom {
        flex-direction: column;
        gap: 16px;
        text-align: center;
    }
}
`;

const landingHtml = `
<header id="header">
    <div class="container">
        <nav>
            <a href="#" class="logo">
                <div class="logo-icon">
                    <img src="/icon.svg" alt="GlucoCare+ logo" />
                </div>
                <span class="logo-text">Gluco<span>Care</span>+</span>
            </a>
            <ul class="nav-links">
                <li><a href="#features">Features</a></li>
                <li><a href="#how-it-works">How It Works</a></li>
                <li><a href="#benefits">Benefits</a></li>
                <li><a href="#contact">Contact</a></li>
            </ul>
            <div class="nav-cta">
                <a href="/login" class="btn btn-outline">Login</a>
                <a href="/register" class="btn btn-primary">Get Started</a>
            </div>
            <button class="mobile-menu-btn" onclick="toggleMobileMenu()">
                <span></span>
                <span></span>
                <span></span>
            </button>
        </nav>
    </div>
</header>

<section class="hero">
    <div class="hero-pattern"></div>
    <div class="hero-bg-image">
        <img src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&h=600&fit=crop&crop=face" alt="Healthcare monitoring">
    </div>
    <div class="container">
        <div class="hero-content">
            <div class="hero-badge">
                <span class="dot"></span>
                <span>AI-Powered Diabetes Monitoring</span>
            </div>
            <h1>Smart Diabetes Care & <span class="highlight">Real-Time Monitoring</span></h1>
            <p>GlucoCare+ is a secure, intelligent platform designed to help patients manage their diabetes effectively while keeping healthcare providers connected and informed. Take control of your health with automated insights and instant alerts.</p>
            <div class="hero-buttons">
                <a href="/register" class="btn btn-primary">Start</a>
                <a href="#how-it-works" class="btn btn-secondary">Learn More</a>
            </div>
        </div>
        <div class="hero-image">
            <div class="hero-image-card">
                <div class="hero-card-header">
                    <span class="hero-card-title">Today's Glucose</span>
                    <div class="hero-card-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                    </div>
                </div>
                <div class="glucose-display">
                    <div>
                        <span class="glucose-value">126</span>
                        <span class="glucose-unit">mg/dL</span>
                    </div>
                    <span class="glucose-status">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        Normal Range
                    </span>
                </div>
                <div class="hero-stats">
                    <div class="stat-card">
                        <div class="stat-value">4.2k</div>
                        <div class="stat-label">Total Readings</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">94%</div>
                        <div class="stat-label">Time in Range</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>

<section class="features" id="features">
    <div class="container">
        <div class="section-header">
            <span class="section-badge">Features</span>
            <h2 class="section-title">Everything You Need for Better Diabetes Management</h2>
            <p class="section-subtitle">Our comprehensive platform provides all the tools necessary for patients and healthcare providers to work together effectively.</p>
        </div>
        <div class="features-grid">
            <div class="feature-card">
                <div class="feature-image">
                    <img src="https://images.unsplash.com/photo-1559757175-5700dde675bc?w=400&h=300&fit=crop" alt="Blood glucose monitoring">
                    <div class="feature-image-overlay">
                        <svg viewBox="0 0 24 24">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm3-6c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3z"/>
                        </svg>
                    </div>
                </div>
                <h3>Blood Sugar & Meal Tracking</h3>
                <p>Log your blood glucose readings and meals easily with our intuitive interface. Track carbohydrates, proteins, and fats to understand how food affects your levels.</p>
            </div>
            <div class="feature-card">
                <div class="feature-image">
                    <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=300&fit=crop" alt="Data analytics and charts">
                    <div class="feature-image-overlay">
                        <svg viewBox="0 0 24 24">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                            <path d="M7 12h2v5H7zm4-3h2v8h-2zm4-3h2v11h-2z"/>
                        </svg>
                    </div>
                </div>
                <h3>Automated Analysis</h3>
                <p>Our intelligent system analyzes your data patterns to detect abnormal readings and identify trends that may require attention. Get insights you can act on.</p>
            </div>
            <div class="feature-card">
                <div class="feature-image">
                    <img src="https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=300&fit=crop" alt="Mobile notifications and alerts">
                    <div class="feature-image-overlay">
                        <svg viewBox="0 0 24 24">
                            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                        </svg>
                    </div>
                </div>
                <h3>Instant Alerts</h3>
                <p>When risks are identified, doctors receive immediate notifications, enabling quick intervention. Never miss a critical health signal again.</p>
            </div>
            <div class="feature-card">
                <div class="feature-image">
                    <img src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&h=300&fit=crop" alt="Medical dashboard">
                    <div class="feature-image-overlay">
                        <svg viewBox="0 0 24 24">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                            <path d="M7 12h2v5H7zm4-3h2v8h-2zm4-3h2v11h-2z"/>
                        </svg>
                    </div>
                </div>
                <h3>Doctor Dashboard</h3>
                <p>Healthcare providers get a comprehensive dashboard to review patient data, track progress, and make informed decisions about treatment plans.</p>
            </div>
            <div class="feature-card">
                <div class="feature-image">
                    <img src="https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=300&fit=crop" alt="Medical prescription">
                    <div class="feature-image-overlay">
                        <svg viewBox="0 0 24 24">
                            <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
                        </svg>
                    </div>
                </div>
                <h3>Safe Prescriptions</h3>
                <p>Receive prescription and diet advice from certified healthcare professionals. All recommendations are personalized based on your unique health profile.</p>
            </div>
            <div class="feature-card">
                <div class="feature-image">
                    <img src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=300&fit=crop" alt="Medical team collaboration">
                    <div class="feature-image-overlay">
                        <svg viewBox="0 0 24 24">
                            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                        </svg>
                    </div>
                </div>
                <h3>Care Team Coordination</h3>
                <p>Seamless collaboration between patients, doctors, and nutritionists. Everyone stays on the same page for better health outcomes.</p>
            </div>
        </div>
    </div>
</section>

<section class="how-it-works" id="how-it-works">
    <div class="container">
        <div class="section-header">
            <span class="section-badge">How It Works</span>
            <h2 class="section-title">Simple Process, Powerful Results</h2>
            <p class="section-subtitle">Getting started with GlucoCare+ is easy. Follow these simple steps to take control of your diabetes management.</p>
        </div>
        <div class="steps-container">
            <div class="step">
                <div class="step-icon">
                    <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                </div>
                <h3>Create Your Account</h3>
                <p>Sign up in minutes and complete your health profile. Add your healthcare providers to your care team.</p>
            </div>
            <div class="step">
                <div class="step-icon">
                    <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm3-6c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3z"/></svg>
                </div>
                <h3>Log Your Data</h3>
                <p>Regularly enter your blood sugar readings and meal information using our easy-to-use mobile or web app.</p>
            </div>
            <div class="step">
                <div class="step-icon">
                    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                </div>
                <h3>Get AI Insights</h3>
                <p>Our system analyzes your data automatically, detecting patterns and providing personalized insights.</p>
            </div>
            <div class="step">
                <div class="step-icon">
                    <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
                </div>
                <h3>Receive Alerts</h3>
                <p>Your care team gets instant alerts when attention is needed, ensuring timely medical intervention.</p>
            </div>
        </div>
    </div>
</section>

<section class="benefits" id="benefits">
    <div class="container">
        <div class="section-header">
            <span class="section-badge">Benefits</span>
            <h2 class="section-title">Better Health Outcomes for Everyone</h2>
            <p class="section-subtitle">GlucoCare+ brings advantages to both patients and healthcare providers.</p>
        </div>
        <div class="benefits-grid">
            <div class="benefit-card">
                <div class="benefit-header">
                    <div class="benefit-icon">
                        <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    </div>
                    <h3>For Patients</h3>
                </div>
                <ul class="benefit-list">
                    <li><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Easy-to-use interface for daily glucose logging</li>
                    <li><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Personalized insights and trend analysis</li>
                    <li><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Direct communication with your healthcare team</li>
                    <li><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Customized diet and lifestyle recommendations</li>
                    <li><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Peace of mind with 24/7 monitoring</li>
                </ul>
            </div>
            <div class="benefit-card">
                <div class="benefit-header">
                    <div class="benefit-icon">
                        <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm3-6c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3z"/></svg>
                    </div>
                    <h3>For Healthcare Providers</h3>
                </div>
                <ul class="benefit-list">
                    <li><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Comprehensive patient data at your fingertips</li>
                    <li><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Real-time alerts for high-risk patients</li>
                    <li><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Streamlined workflow with automated analysis</li>
                    <li><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Better patient engagement and adherence</li>
                    <li><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Data-driven decisions for improved outcomes</li>
                </ul>
            </div>
        </div>
    </div>
</section>

<section class="cta" id="contact">
    <div class="container">
        <div class="cta-content">
            <h2>Ready to Transform Your Diabetes Care?</h2>
            <p>Join thousands of patients and healthcare providers who trust GlucoCare+ for better diabetes management. Start your free trial today.</p>
            <div class="cta-buttons">
                <a href="/register" class="btn btn-primary">Get Started</a>
            </div>
        </div>
    </div>
</section>

<footer>
    <div class="container">
        <div class="footer-grid">
            <div class="footer-brand">
                <a href="#" class="logo">
                    <div class="logo-icon">
                        <img src="/icon.svg" alt="GlucoCare+ logo" />
                    </div>
                    <span class="logo-text">Gluco<span>Care</span>+</span>
                </a>
                <p>Smart diabetes care and real-time monitoring platform for better health outcomes.</p>
            </div>
        </div>
        <div class="footer-bottom">
            <p>&copy; 2026 GlucoCare+. All rights reserved.</p>
        </div>
    </div>
</footer>
`;

const landingScript = `
window.addEventListener('scroll', function () {
    const header = document.getElementById('header');
    if (!header) return;
    if (window.scrollY > 50) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
        var el = this;
        var href = el.getAttribute('href');
        if (!href) return;
        var target = document.querySelector(href);
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.feature-card, .benefit-card, .step').forEach(function (el, index) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'all 0.6s ease ' + (index * 0.1) + 's';
    observer.observe(el);
});

window.toggleMobileMenu = function () {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;
    navLinks.classList.toggle('active');
};
`;

export default function LandingPage() {
    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: landingCss }} />
            <main dangerouslySetInnerHTML={{ __html: landingHtml }} />
            <Script id="landing-script" strategy="afterInteractive">
                {landingScript}
            </Script>
        </>
    );
}

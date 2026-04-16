// Header scroll effect
        window.addEventListener('scroll', function() {
            const header = document.getElementById('header');
            if (window.scrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });

        // Smooth scroll for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Intersection Observer for animations
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);

        // Observe feature cards
        document.querySelectorAll('.feature-card, .benefit-card, .step').forEach((el, index) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'all 0.6s ease ' + (index * 0.1) + 's';
            observer.observe(el);
        });

        // Mobile menu toggle
        function toggleMobileMenu() {
            const nav = document.querySelector('header nav');
            if (!nav) return;
            nav.classList.toggle('mobile-menu-open');
        }

        document.querySelectorAll('.nav-links a, .nav-cta a').forEach((link) => {
            link.addEventListener('click', () => {
                const nav = document.querySelector('header nav');
                if (nav) {
                    nav.classList.remove('mobile-menu-open');
                }
            });
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                const nav = document.querySelector('header nav');
                if (nav) {
                    nav.classList.remove('mobile-menu-open');
                }
            }
        });

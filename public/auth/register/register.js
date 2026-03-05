function togglePassword(inputId, button) {
            var input = document.getElementById(inputId);
            var icon = button.querySelector('.eye-icon');
            if (input.type === 'password') {
                input.type = 'text';
                icon.innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>';
            } else {
                input.type = 'password';
                icon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
            }
        }

        function checkPasswordStrength(password) {
            var bar1 = document.getElementById('bar1');
            var bar2 = document.getElementById('bar2');
            var bar3 = document.getElementById('bar3');
            var bar4 = document.getElementById('bar4');
            var text = document.getElementById('strengthText');
            var bars = [bar1, bar2, bar3, bar4];

            // Reset
            bars.forEach(function(bar) {
                bar.className = 'strength-bar';
            });
            text.textContent = '';

            if (password.length === 0) return;

            var strength = 0;
            if (password.length >= 8) strength++;
            if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
            if (/\d/.test(password)) strength++;
            if (/[^a-zA-Z0-9]/.test(password)) strength++;

            if (strength <= 1) {
                bar1.className = 'strength-bar weak';
                text.textContent = 'Weak password';
                text.style.color = '#EF4444';
            } else if (strength === 2) {
                bar1.className = 'strength-bar medium';
                bar2.className = 'strength-bar medium';
                text.textContent = 'Fair password';
                text.style.color = '#F59E0B';
            } else if (strength === 3) {
                bar1.className = 'strength-bar strong';
                bar2.className = 'strength-bar strong';
                bar3.className = 'strength-bar strong';
                text.textContent = 'Good password';
                text.style.color = '#10B981';
            } else {
                bars.forEach(function(bar) {
                    bar.className = 'strength-bar strong';
                });
                text.textContent = 'Strong password';
                text.style.color = '#10B981';
            }
        }

        // Role toggle for doctor fields
        document.querySelectorAll('input[name="role"]').forEach(function(radio) {
            radio.addEventListener('change', function() {
                var doctorFields = document.getElementById('doctorFields');
                if (this.value === 'doctor') {
                    doctorFields.classList.add('show');
                } else {
                    doctorFields.classList.remove('show');
                }
            });
        });

        function handleRegister(e) {
            e.preventDefault();
            var fullName = document.getElementById('fullName').value.trim();
            var email = document.getElementById('email').value.trim();
            var phone = document.getElementById('phone').value.trim();
            var password = document.getElementById('password').value;
            var terms = document.getElementById('terms').checked;
            var role = document.querySelector('input[name="role"]:checked').value;
            var errorMessage = document.getElementById('errorMessage');
            var errorText = document.getElementById('errorText');
            var successMessage = document.getElementById('successMessage');

            // Hide previous messages
            errorMessage.classList.remove('show');
            successMessage.classList.remove('show');

            // Validation
            if (!fullName || !email || !password) {
                errorText.textContent = 'Please fill in all required fields.';
                errorMessage.classList.add('show');
                return;
            }

            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                errorText.textContent = 'Please enter a valid email address.';
                errorMessage.classList.add('show');
                return;
            }

            if (phone && !/^\+91[0-9]{10}$/.test(phone)) {
                errorText.textContent = 'Please enter a valid mobile number in +91 format.';
                errorMessage.classList.add('show');
                return;
            }

            if (password.length < 8) {
                errorText.textContent = 'Password must be at least 8 characters long.';
                errorMessage.classList.add('show');
                return;
            }

            // Doctor-specific validation
            if (role === 'doctor') {
                var regNumber = document.getElementById('regNumber').value.trim();
                var specialization = document.getElementById('specialization').value;
                var clinicName = document.getElementById('clinicName').value.trim();

                if (!regNumber) {
                    errorText.textContent = 'Please enter your Medical Registration Number.';
                    errorMessage.classList.add('show');
                    return;
                }
                if (!specialization) {
                    errorText.textContent = 'Please select your specialization.';
                    errorMessage.classList.add('show');
                    return;
                }
                if (!clinicName) {
                    errorText.textContent = 'Please enter your Hospital / Clinic name.';
                    errorMessage.classList.add('show');
                    return;
                }
            }

            if (!terms) {
                errorText.textContent = 'You must agree to the Terms of Service and Privacy Policy.';
                errorMessage.classList.add('show');
                return;
            }

            // Simulate registration
            var btn = e.target.querySelector('.btn-submit');
            btn.textContent = 'Creating account...';
            btn.disabled = true;

            setTimeout(function() {
                successMessage.classList.add('show');
                btn.innerHTML = 'Create Account <svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z"/></svg>';
                btn.disabled = false;

                // Redirect to login after success (demo)
                setTimeout(function() {
                    window.location.href = 'login.html';
                }, 2000);
            }, 1500);
        }

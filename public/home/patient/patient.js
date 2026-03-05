// Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', function() {
                const section = this.getAttribute('data-section');
                
                // Update active nav item
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                this.classList.add('active');
                
                // Show corresponding section
                document.querySelectorAll('.dashboard-section').forEach(sec => sec.classList.remove('active'));
                document.getElementById(section).classList.add('active');
                
                // Update page title
                const titles = {
                    'overview': 'Dashboard Overview',
                    'reports': 'Medical Reports',
                    'profile': 'Personal Data',
                    'doctors': 'My Doctors',
                    'nutritionist': 'Nutrition & Diet',
                    'records': 'Past Medical Records',
                    'charts': 'Health Trends'
                };
                document.getElementById('page-title').textContent = titles[section] || 'Dashboard';
            });
        });

        // Modal Functions
        function openModal(modalId) {
            document.getElementById(modalId).classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeModal(modalId) {
            document.getElementById(modalId).classList.remove('active');
            document.body.style.overflow = 'auto';
        }

        // Close modal on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', function(e) {
                if (e.target === this) {
                    this.classList.remove('active');
                    document.body.style.overflow = 'auto';
                }
            });
        });

        // Form Submissions
        function saveProfile(e) {
            e.preventDefault();
            // Add validation and save logic here
            alert('Profile updated successfully!');
            closeModal('profile-modal');
        }

        function bookAppointment(e) {
            e.preventDefault();
            alert('Appointment booked successfully! You will receive a confirmation email.');
            closeModal('appointment-modal');
        }

        function saveDiet(e) {
            e.preventDefault();
            alert('Dietary preferences updated successfully!');
            closeModal('diet-modal');
        }

        function addReport(e) {
            e.preventDefault();
            alert('Report added successfully!');
            closeModal('report-modal');
        }

        function addRecord(e) {
            e.preventDefault();
            alert('Medical record added successfully!');
            closeModal('record-modal');
        }

        // Filter Functions
        function filterReports() {
            const search = document.getElementById('report-search').value.toLowerCase();
            const type = document.getElementById('report-type-filter').value;
            const rows = document.querySelectorAll('#reports-table-body tr');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                const rowTypeCell = row.querySelector('td:nth-child(2)');
                const rowType = rowTypeCell ? rowTypeCell.textContent.toLowerCase() : '';
                
                const matchesSearch = text.includes(search);
                const matchesType = !type || rowType.includes(type);
                
                row.style.display = matchesSearch && matchesType ? '' : 'none';
            });
        }

        function filterRecords() {
            const search = document.getElementById('record-search').value.toLowerCase();
            const type = document.getElementById('record-type-filter').value;
            const records = document.querySelectorAll('.record-card');
            
            records.forEach(record => {
                const text = record.textContent.toLowerCase();
                const recordTypeEl = record.querySelector('.record-type');
                const recordType = recordTypeEl ? recordTypeEl.textContent.toLowerCase() : '';
                
                const matchesSearch = text.includes(search);
                const matchesType = !type || recordType.includes(type);
                
                record.style.display = matchesSearch && matchesType ? '' : 'none';
            });
        }

        // Global Search
        document.getElementById('global-search').addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            if (searchTerm.length >= 2) {
                // Could implement global search across all sections
                console.log('Searching for:', searchTerm);
            }
        });

        // Charts
        const glucoseCtx = document.getElementById('glucoseChart').getContext('2d');
        new Chart(glucoseCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Fasting Glucose',
                    data: [],
                    borderColor: '#0D9488',
                    backgroundColor: 'rgba(13, 148, 136, 0.1)',
                    tension: 0.4,
                    fill: true
                }, {
                    label: 'Postprandial',
                    data: [],
                    borderColor: '#F59E0B',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        min: 60,
                        max: 180
                    }
                }
            }
        });

        const weightCtx = document.getElementById('weightChart').getContext('2d');
        new Chart(weightCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Weight (kg)',
                    data: [],
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    y: {
                        min: 70,
                        max: 75
                    }
                }
            }
        });

        // Health Trends Charts
        const trendsGlucoseCtx = document.getElementById('trendsGlucoseChart').getContext('2d');
        new Chart(trendsGlucoseCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Average Glucose',
                    data: [],
                    borderColor: '#0D9488',
                    backgroundColor: 'rgba(13, 148, 136, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });

        const trendsWeightCtx = document.getElementById('trendsWeightChart').getContext('2d');
        new Chart(trendsWeightCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Weight',
                    data: [],
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });

        const trendsBPCtx = document.getElementById('trendsBPChart').getContext('2d');
        new Chart(trendsBPCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Systolic',
                    data: [],
                    borderColor: '#EF4444',
                    tension: 0.4
                }, {
                    label: 'Diastolic',
                    data: [],
                    borderColor: '#10B981',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });

        const trendsHbA1cCtx = document.getElementById('trendsHbA1cChart').getContext('2d');
        new Chart(trendsHbA1cCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'HbA1c %',
                    data: [],
                    backgroundColor: [
                        'rgba(239, 68, 68, 0.7)',
                        'rgba(245, 158, 11, 0.7)',
                        'rgba(245, 158, 11, 0.7)',
                        'rgba(16, 185, 129, 0.7)',
                        'rgba(16, 185, 129, 0.7)',
                        'rgba(16, 185, 129, 0.7)'
                    ],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        min: 5,
                        max: 8
                    }
                }
            }
        });

        // Set minimum date for appointment booking
        document.getElementById('appointment-date').min = new Date().toISOString().split('T')[0];


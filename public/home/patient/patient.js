var state = {
    reports: [],
    records: [],
    doctors: [],
    appointments: [],
    threads: [],
    selectedThreadId: null,
    selectedDoctorId: null,
    chatDoctors: [],
    goals: [],
    badges: [],
    sessions: [],
    auditLog: [],
    exports: [],
    shares: [],
    aiConversation: [],
    aiRequestPending: false,
    charts: {},
};

var aiTypingTimer = null;
var chatSocket = null;

var reportTypeMap = {
    lab: 'Lab Report',
    imaging: 'Imaging',
    clinical: 'Clinical Note',
    diabetes: 'Diabetes Report',
};

var recordTypeMap = {
    diagnosis: 'Diagnosis',
    treatment: 'Treatment',
    medication: 'Other',
    visit: 'Other',
};

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(value) {
    if (!value) return '--';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleDateString();
}

function formatDateInput(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
}

function formatNameInitials(fullName) {
    if (!fullName) return '--';
    var parts = String(fullName).trim().split(/\s+/).slice(0, 2);
    return parts.map(function(part) { return part[0] ? part[0].toUpperCase() : ''; }).join('');
}

function splitName(fullName) {
    var clean = String(fullName || '').trim();
    if (!clean) return { firstName: '', lastName: '' };
    var parts = clean.split(/\s+/);
    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
    };
}

function extractDoctorName(doctor) {
    if (!doctor) return '--';
    if (typeof doctor === 'object') return doctor.fullName || doctor.name || '--';
    return String(doctor);
}

function getChartRangeDays() {
    var periodEl = document.getElementById('chart-period');
    if (!periodEl) return 30;
    var label = (periodEl.value || '').toLowerCase();
    if (label.indexOf('7') >= 0) return 7;
    if (label.indexOf('30') >= 0) return 30;
    if (label.indexOf('year') >= 0) return 365;
    return 90;
}

function updateNav(section) {
    document.querySelectorAll('.nav-item').forEach(function(nav) {
        var isActive = nav.getAttribute('data-section') === section;
        nav.classList.toggle('active', isActive);
    });

    document.querySelectorAll('.dashboard-section').forEach(function(sec) {
        sec.classList.remove('active');
    });

    var activeSection = document.getElementById(section);
    if (activeSection) {
        activeSection.classList.add('active');
    }

    var titles = {
        overview: 'Dashboard Overview',
        'ai-assistant': 'Chat',
        reports: 'Medical Reports',
        profile: 'Personal Data',
        doctors: 'My Doctors',
        nutritionist: 'Nutrition & Diet',
        records: 'Past Medical Records',
        charts: 'Health Trends',
        'doctor-chat': 'Doctor Chat',
        safety: 'Emergency & Safety',
        gamification: 'Goals & Rewards',
        sharing: 'Data Export & Sharing',
        privacy: 'Privacy & Security',
    };

    var titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[section] || 'Dashboard';
}

function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var section = this.getAttribute('data-section');
            updateNav(section);
            if (section !== 'ai-assistant') {
                closeAiAssistantPanel();
            }
        });
    });
}

function openModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

function initModals() {
    document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        });
    });
}

function setText(selector, value) {
    var el = document.querySelector(selector);
    if (el) el.textContent = value;
}

function populateProfileView(user) {
    if (!user) return;

    setText('.user-info h3', user.fullName || 'Patient Name');
    setText('.user-info p', 'Patient ID: ' + (user._id || '--'));
    setText('.profile-name', user.fullName || 'Patient Name');
    setText('.profile-id', 'Patient ID: ' + (user._id || '--'));

    var initials = formatNameInitials(user.fullName);
    setText('.user-avatar', initials);
    setText('.profile-avatar-large', initials);

    var profileMeta = document.querySelectorAll('.profile-meta .meta-item span');
    if (profileMeta[0]) profileMeta[0].textContent = 'Member since ' + formatDate(user.createdAt);
    if (profileMeta[1]) profileMeta[1].textContent = user.email || '--';
    if (profileMeta[2]) profileMeta[2].textContent = user.phone || '--';

    var emergencyNumber = document.querySelector('.emergency-number');
    if (emergencyNumber) {
        emergencyNumber.textContent = user.emergencyContact && user.emergencyContact.phone ? user.emergencyContact.phone : '--';
    }

    var medicalFields = document.querySelectorAll('#profile .card .form-grid .form-group > div');
    if (medicalFields[0]) medicalFields[0].textContent = user.bloodType || '--';
    if (medicalFields[1]) medicalFields[1].textContent = formatDate(user.dateOfBirth);

    var allergiesContainer = medicalFields[2];
    if (allergiesContainer) {
        var allergies = Array.isArray(user.allergies) ? user.allergies : [];
        if (allergies.length === 0) {
            allergiesContainer.innerHTML = '<span class="status-badge normal">None</span>';
        } else {
            allergiesContainer.innerHTML = allergies.map(function(item) {
                return '<span class="status-badge warning" style="margin-right: 8px;">' + escapeHtml(item) + '</span>';
            }).join('');
        }
    }

    var conditionsContainer = medicalFields[3];
    if (conditionsContainer) {
        var conditions = Array.isArray(user.chronicConditions) ? user.chronicConditions : [];
        if (conditions.length === 0) {
            conditionsContainer.innerHTML = '<span class="status-badge normal">None</span>';
        } else {
            conditionsContainer.innerHTML = conditions.map(function(item) {
                return '<span class="status-badge warning" style="margin-right: 8px;">' + escapeHtml(item) + '</span>';
            }).join('');
        }
    }
}

function populateProfileModal(user) {
    if (!user) return;
    var split = splitName(user.fullName);
    var firstName = document.getElementById('first-name');
    var lastName = document.getElementById('last-name');
    var email = document.getElementById('email');
    var phone = document.getElementById('phone');
    var dob = document.getElementById('dob');
    var emergencyName = document.getElementById('emergency-name');
    var emergencyPhone = document.getElementById('emergency-phone');

    if (firstName) firstName.value = split.firstName;
    if (lastName) lastName.value = split.lastName;
    if (email) {
        email.value = user.email || '';
        email.readOnly = true;
    }
    if (phone) phone.value = user.phone || '';
    if (dob) dob.value = formatDateInput(user.dateOfBirth);
    if (emergencyName) emergencyName.value = user.emergencyContact && user.emergencyContact.name ? user.emergencyContact.name : '';
    if (emergencyPhone) emergencyPhone.value = user.emergencyContact && user.emergencyContact.phone ? user.emergencyContact.phone : '';
}

function renderReports() {
    var tbody = document.getElementById('reports-table-body');
    if (!tbody) return;

    if (state.reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--gray-500);">No reports available.</td></tr>';
        return;
    }

    tbody.innerHTML = state.reports.map(function(report) {
        var statusClass = String(report.status || '').toLowerCase().indexOf('complete') >= 0 ? 'normal' : 'warning';
        return [
            '<tr data-report-id="' + report._id + '">',
            '<td>' + escapeHtml(report.reportName) + '</td>',
            '<td>' + escapeHtml(report.type) + '</td>',
            '<td>' + formatDate(report.date) + '</td>',
            '<td>' + escapeHtml(extractDoctorName(report.doctor)) + '</td>',
            '<td><span class="status-badge ' + statusClass + '">' + escapeHtml(report.status || 'Pending') + '</span></td>',
            '<td><button class="btn btn-outline btn-sm" onclick="deleteReport(' + Number(report._id) + ')">Delete</button></td>',
            '</tr>',
        ].join('');
    }).join('');
}

function renderRecords() {
    var list = document.getElementById('records-list');
    if (!list) return;

    if (state.records.length === 0) {
        list.innerHTML = '<div class="empty-state">No medical records available.</div>';
        return;
    }

    list.innerHTML = state.records.map(function(record) {
        return [
            '<div class="record-card card" data-record-id="' + record._id + '">',
            '<div style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start;">',
            '<div>',
            '<div style="font-weight:700; font-size:16px; margin-bottom:6px;">' + escapeHtml(record.title) + '</div>',
            '<div class="record-type" style="color: var(--gray-500); margin-bottom:6px;">' + escapeHtml(record.type) + '</div>',
            '<div style="color: var(--gray-500); font-size:14px;">' + formatDate(record.date) + '</div>',
            '</div>',
            '<span class="status-badge normal">Stored</span>',
            '</div>',
            '<div style="margin-top:12px; color: var(--gray-700);">' + escapeHtml(record.description || '--') + '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderDoctors() {
    var grid = document.querySelector('.doctor-grid');
    if (!grid) return;

    if (state.doctors.length === 0) {
        grid.innerHTML = '<div class="card"><div class="empty-state">No assigned doctors yet.</div></div>';
        return;
    }

    grid.innerHTML = state.doctors.map(function(doctor) {
        var online = Number(doctor.isLoggedIn || 0) === 1;
        var onlineBadge = online
            ? '<span class="status-badge normal" style="margin-top: 6px;">Online</span>'
            : '<span class="status-badge warning" style="margin-top: 6px;">Offline</span>';
        return [
            '<div class="doctor-card">',
            '<div class="doctor-header">',
            '<div class="doctor-avatar"><i class="fas fa-user"></i></div>',
            '<div>',
            '<div class="doctor-name">' + escapeHtml(doctor.fullName || 'Doctor') + '</div>',
            '<div class="doctor-specialty">' + escapeHtml(doctor.specialization || 'General Practitioner') + '</div>',
            onlineBadge,
            '</div>',
            '</div>',
            '<div class="doctor-details">',
            '<div class="doctor-detail"><i class="fas fa-hospital"></i>' + escapeHtml(doctor.clinicName || '--') + '</div>',
            '<div class="doctor-detail"><i class="fas fa-phone"></i>' + escapeHtml(doctor.phone || '--') + '</div>',
            '<div class="doctor-detail"><i class="fas fa-envelope"></i>' + escapeHtml(doctor.email || '--') + '</div>',
            '</div>',
            '<div class="doctor-actions">',
            '<button class="btn btn-primary btn-sm" onclick="scheduleWithDoctor(' + Number(doctor._id || doctor.id || 0) + ')"><i class="fas fa-calendar"></i>Schedule</button>',
            '</div>',
            '</div>',
        ].join('');
    }).join('');

    populateDoctorSelect();
}

function renderAppointments() {
    var body = document.querySelector('#doctors .data-table tbody');
    if (!body) return;

    if (state.appointments.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--gray-500);">No appointments yet.</td></tr>';
        return;
    }

    body.innerHTML = state.appointments.map(function(appt) {
        var doctorName = extractDoctorName(appt.doctor);
        var specialization = appt.doctor && appt.doctor.specialization ? appt.doctor.specialization : '--';
        var status = appt.status || 'Scheduled';
        var statusClass = String(status).toLowerCase() === 'completed' ? 'normal' : 'warning';
        return [
            '<tr>',
            '<td>' + formatDate(appt.date) + '</td>',
            '<td>' + escapeHtml(doctorName) + '</td>',
            '<td>' + escapeHtml(specialization) + '</td>',
            '<td>' + escapeHtml(appt.reason || '--') + '</td>',
            '<td><span class="status-badge ' + statusClass + '">' + escapeHtml(status) + '</span></td>',
            '</tr>',
        ].join('');
    }).join('');
}

function populateDoctorSelect() {
    var select = document.getElementById('appointment-doctor');
    var messageSelect = document.getElementById('new-thread-doctor');
    if (!select && !messageSelect) return;

    var options = ['<option value="">Choose a doctor...</option>'];
    state.doctors.forEach(function(doctor) {
        options.push(
            '<option value="' + Number(doctor._id) + '">' +
            escapeHtml((doctor.fullName || 'Doctor') + ' - ' + (doctor.specialization || 'General Practitioner')) +
            '</option>'
        );
    });
    if (select) {
        select.innerHTML = options.join('');
    }
    if (messageSelect) {
        messageSelect.innerHTML = options.join('');
    }
}

function updateOverviewSummary(dashboard) {
    var statValues = document.querySelectorAll('.quick-stats .stat-value');
    if (statValues[0]) statValues[0].textContent = dashboard.latestGlucose ? Number(dashboard.latestGlucose.value).toFixed(0) : '--';
    if (statValues[1]) statValues[1].textContent = dashboard.latestMetric && dashboard.latestMetric.weight ? Number(dashboard.latestMetric.weight).toFixed(1) : '--';

    if (statValues[2]) {
        var bpText = '--';
        if (dashboard.latestMetric && dashboard.latestMetric.systolic && dashboard.latestMetric.diastolic) {
            bpText = Number(dashboard.latestMetric.systolic).toFixed(0) + '/' + Number(dashboard.latestMetric.diastolic).toFixed(0);
        }
        statValues[2].textContent = bpText;
    }

    if (statValues[3]) {
        var upcomingCount = Array.isArray(dashboard.upcomingAppointments) ? dashboard.upcomingAppointments.length : 0;
        statValues[3].textContent = String(upcomingCount);
    }
}

function updateOverviewMetrics(glucoseReadings, healthMetrics, scoreData) {
    var metricValues = document.querySelectorAll('.metrics-grid .metric-card .metric-value');
    if (metricValues.length < 3) return;

    var fasting = glucoseReadings.filter(function(r) { return r.type === 'fasting'; });
    var postprandial = glucoseReadings.filter(function(r) { return r.type === 'postprandial'; });

    var fastingAvg = fasting.length === 0 ? null : fasting.reduce(function(sum, r) { return sum + Number(r.value); }, 0) / fasting.length;
    var ppAvg = postprandial.length === 0 ? null : postprandial.reduce(function(sum, r) { return sum + Number(r.value); }, 0) / postprandial.length;

    var latestHba1c = healthMetrics.find(function(m) { return m.hba1c !== null && m.hba1c !== undefined && m.hba1c !== ''; });

    metricValues[0].textContent = fastingAvg === null ? '--' : Number(fastingAvg).toFixed(1);
    metricValues[1].textContent = ppAvg === null ? '--' : Number(ppAvg).toFixed(1);
    metricValues[2].textContent = latestHba1c ? Number(latestHba1c.hba1c).toFixed(1) + '%' : '--';

    var metricUnits = document.querySelectorAll('.metrics-grid .metric-card .metric-unit');
    if (metricUnits[2] && latestHba1c) {
        metricUnits[2].textContent = 'Last test: ' + formatDate(latestHba1c.recordedAt);
    }

    var progressBars = document.querySelectorAll('.metric-progress-bar');
    if (progressBars[0] && scoreData && scoreData.components) progressBars[0].style.width = Math.max(0, Math.min(100, scoreData.components.glucose)) + '%';
    if (progressBars[1] && scoreData && scoreData.components) progressBars[1].style.width = Math.max(0, Math.min(100, scoreData.components.glucose)) + '%';
    if (progressBars[2] && scoreData) progressBars[2].style.width = Math.max(0, Math.min(100, scoreData.score)) + '%';
}

function initCharts() {
    var glucoseCtx = document.getElementById('glucoseChart').getContext('2d');
    state.charts.glucose = new Chart(glucoseCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Fasting Glucose',
                    data: [],
                    borderColor: '#0D9488',
                    backgroundColor: 'rgba(13, 148, 136, 0.1)',
                    tension: 0.4,
                    fill: true,
                },
                {
                    label: 'Postprandial',
                    data: [],
                    borderColor: '#F59E0B',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.4,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    min: 60,
                    max: 240,
                },
            },
        },
    });

    var weightCtx = document.getElementById('weightChart').getContext('2d');
    state.charts.weight = new Chart(weightCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Weight (kg)',
                    data: [],
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    tension: 0.35,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        },
    });

    var trendsGlucoseCtx = document.getElementById('trendsGlucoseChart').getContext('2d');
    state.charts.trendsGlucose = new Chart(trendsGlucoseCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Average Glucose',
                    data: [],
                    borderColor: '#0D9488',
                    backgroundColor: 'rgba(13, 148, 136, 0.1)',
                    tension: 0.4,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        },
    });

    var trendsWeightCtx = document.getElementById('trendsWeightChart').getContext('2d');
    state.charts.trendsWeight = new Chart(trendsWeightCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Weight',
                    data: [],
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    tension: 0.35,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        },
    });

    var trendsBPCtx = document.getElementById('trendsBPChart').getContext('2d');
    state.charts.trendsBP = new Chart(trendsBPCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Systolic',
                    data: [],
                    borderColor: '#EF4444',
                    tension: 0.35,
                },
                {
                    label: 'Diastolic',
                    data: [],
                    borderColor: '#10B981',
                    tension: 0.35,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        },
    });

    var trendsHbA1cCtx = document.getElementById('trendsHbA1cChart').getContext('2d');
    state.charts.trendsHba1c = new Chart(trendsHbA1cCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'HbA1c %',
                    data: [],
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderRadius: 8,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 4,
                    max: 12,
                },
            },
        },
    });
}

function updateOverviewCharts(glucoseReadings, healthMetrics) {
    var byDate = {};
    glucoseReadings.forEach(function(reading) {
        var key = String(reading.recordedAt || '').slice(0, 10);
        if (!byDate[key]) byDate[key] = { fasting: [], postprandial: [] };
        if (reading.type === 'fasting') byDate[key].fasting.push(Number(reading.value));
        if (reading.type === 'postprandial') byDate[key].postprandial.push(Number(reading.value));
    });

    var labels = Object.keys(byDate).sort();
    var fastingSeries = labels.map(function(key) {
        var arr = byDate[key].fasting;
        if (arr.length === 0) return null;
        return Number((arr.reduce(function(a, b) { return a + b; }, 0) / arr.length).toFixed(2));
    });
    var ppSeries = labels.map(function(key) {
        var arr = byDate[key].postprandial;
        if (arr.length === 0) return null;
        return Number((arr.reduce(function(a, b) { return a + b; }, 0) / arr.length).toFixed(2));
    });

    state.charts.glucose.data.labels = labels;
    state.charts.glucose.data.datasets[0].data = fastingSeries;
    state.charts.glucose.data.datasets[1].data = ppSeries;
    state.charts.glucose.update();

    var metricLabels = healthMetrics.map(function(item) { return String(item.recordedAt || '').slice(0, 10); }).reverse();
    var weightSeries = healthMetrics.map(function(item) { return item.weight ? Number(item.weight) : null; }).reverse();

    state.charts.weight.data.labels = metricLabels;
    state.charts.weight.data.datasets[0].data = weightSeries;
    state.charts.weight.update();
}

function updateTrendCharts(trendPayload) {
    var glucose = Array.isArray(trendPayload.glucose) ? trendPayload.glucose.slice().reverse() : [];
    var metrics = Array.isArray(trendPayload.metrics) ? trendPayload.metrics.slice().reverse() : [];

    state.charts.trendsGlucose.data.labels = glucose.map(function(item) { return String(item.recordedAt || '').slice(0, 10); });
    state.charts.trendsGlucose.data.datasets[0].data = glucose.map(function(item) { return Number(item.value); });
    state.charts.trendsGlucose.update();

    state.charts.trendsWeight.data.labels = metrics.map(function(item) { return String(item.recordedAt || '').slice(0, 10); });
    state.charts.trendsWeight.data.datasets[0].data = metrics.map(function(item) { return item.weight ? Number(item.weight) : null; });
    state.charts.trendsWeight.update();

    state.charts.trendsBP.data.labels = metrics.map(function(item) { return String(item.recordedAt || '').slice(0, 10); });
    state.charts.trendsBP.data.datasets[0].data = metrics.map(function(item) { return item.systolic ? Number(item.systolic) : null; });
    state.charts.trendsBP.data.datasets[1].data = metrics.map(function(item) { return item.diastolic ? Number(item.diastolic) : null; });
    state.charts.trendsBP.update();

    var hba1c = metrics.filter(function(item) {
        return item.hba1c !== null && item.hba1c !== undefined && item.hba1c !== '';
    });
    state.charts.trendsHba1c.data.labels = hba1c.map(function(item) { return String(item.recordedAt || '').slice(0, 10); });
    state.charts.trendsHba1c.data.datasets[0].data = hba1c.map(function(item) { return Number(item.hba1c); });
    state.charts.trendsHba1c.update();
}

function updateNutritionSummary(summary) {
    var values = document.querySelectorAll('.nutrition-grid .nutrition-value');
    if (values[0]) values[0].textContent = summary.totalCalories + ' kcal';
    if (values[1]) values[1].textContent = summary.totalCarbs + 'g';
    if (values[2]) values[2].textContent = summary.activeMinutes + ' min';
    if (values[3]) values[3].textContent = summary.mealCount;

    var labels = document.querySelectorAll('.nutrition-grid .nutrition-label');
    if (labels[2]) labels[2].textContent = 'Activity Minutes';
    if (labels[3]) labels[3].textContent = 'Meals Logged';
}

function boolFromSelectValue(value) {
    return String(value) === 'true';
}

function threadInitials(name) {
    if (!name) return 'DR';
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
}

function shortTime(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderMessageThreads() {
    var container = document.getElementById('message-threads-list');
    if (!container) return;

    var searchVal = '';
    var searchEl = document.getElementById('wa-thread-search');
    if (searchEl) searchVal = (searchEl.value || '').trim().toLowerCase();

    var doctors = state.chatDoctors;
    if (searchVal) {
        doctors = doctors.filter(function(doc) {
            return (doc.fullName || '').toLowerCase().indexOf(searchVal) >= 0 ||
                   (doc.specialization || '').toLowerCase().indexOf(searchVal) >= 0;
        });
    }

    if (doctors.length === 0) {
        container.innerHTML = '<div class="wa-empty">No doctors found</div>';
        return;
    }

    container.innerHTML = doctors.map(function(doc) {
        var docId = Number(doc._id || doc.id);
        var isActive = docId === state.selectedDoctorId;
        var thread = state.threads.find(function(t) { return Number(t.doctor_id) === docId; });
        var lastMsg = thread ? shortTime(thread.last_message_at) : '';
        var snippet = thread && thread.lastMessageBody ? thread.lastMessageBody : (thread ? (thread.subject || '') : 'Tap to start chatting');
        var unread = thread && thread.unreadCount ? thread.unreadCount : 0;

        return [
            '<div class="wa-thread-item' + (isActive ? ' active' : '') + '" onclick="openDoctorChat(' + docId + ')" data-doctor-id="' + docId + '">',
            '  <div class="wa-thread-avatar">' + escapeHtml(threadInitials(doc.fullName)) + '</div>',
            '  <div class="wa-thread-info">',
            '    <div class="wa-thread-name">' + escapeHtml(doc.fullName || 'Doctor') + '</div>',
            '    <div class="wa-thread-snippet">' + escapeHtml(snippet) + '</div>',
            '  </div>',
            '  <div style="text-align:right; flex-shrink:0;">',
            '    <div class="wa-thread-time">' + escapeHtml(lastMsg) + '</div>',
            (unread > 0 ? '<div style="background:var(--primary-teal); color:#fff; border-radius:50%; width:20px; height:20px; font-size:11px; display:flex; align-items:center; justify-content:center; margin-left:auto; margin-top:4px;">' + unread + '</div>' : ''),
            '  </div>',
            '</div>',
        ].join('');
    }).join('');
}

function msgTime(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function msgStatusIcon(msg) {
    // Only show status on messages sent by the current user (patient)
    if (msg.sender_role !== 'patient') return '';
    if (msg.read_at) {
        return '<span class="msg-status read" title="Read">&#10003;&#10003;</span>';
    }
    if (msg.delivered_at) {
        return '<span class="msg-status delivered" title="Delivered">&#10003;&#10003;</span>';
    }
    return '<span class="msg-status sent" title="Sent">&#10003;</span>';
}

function msgDateLabel(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    var yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function renderThreadMessages(messages) {
    var container = document.getElementById('thread-messages');
    if (!container) return;

    if (!Array.isArray(messages) || messages.length === 0) {
        container.innerHTML = '<div class="wa-empty">No messages in this thread yet.</div>';
        return;
    }

    var html = '';
    var lastDateLabel = '';

    messages.forEach(function(msg) {
        var ts = msg.sent_at || msg.createdAt;
        var dateLabel = msgDateLabel(ts);
        if (dateLabel && dateLabel !== lastDateLabel) {
            html += '<div class="wa-msg-date-divider"><span>' + escapeHtml(dateLabel) + '</span></div>';
            lastDateLabel = dateLabel;
        }
        var senderClass = msg.sender_role === 'patient' ? 'patient' : 'doctor';
        var statusHtml = msg.sender_role === 'patient' ? ' ' + msgStatusIcon(msg) : '';
        html += [
            '<div class="wa-msg ' + senderClass + '" data-msg-id="' + (msg.id || '') + '">',
            '<div>' + escapeHtml(msg.body || '') + '</div>',
            '<div class="wa-msg-time">' + msgTime(ts) + statusHtml + '</div>',
            '</div>',
        ].join('');
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function renderGoals() {
    var container = document.getElementById('goals-list');
    if (!container) return;

    if (state.goals.length === 0) {
        container.innerHTML = '<div class="empty-state">No goals yet.</div>';
        return;
    }

    container.innerHTML = state.goals.map(function(goal) {
        var status = goal.status || 'active';
        var badgeClass = status === 'completed' ? 'normal' : 'warning';
        return [
            '<div class="stack-item">',
            '<div class="stack-item-header">',
            '<div class="stack-item-title">' + escapeHtml(goal.type) + '</div>',
            '<span class="status-badge ' + badgeClass + '">' + escapeHtml(status) + '</span>',
            '</div>',
            '<div class="stack-item-meta">Target: ' + escapeHtml(goal.target_value || '--') + '</div>',
            '<div class="stack-item-actions">',
            '<button class="btn btn-outline btn-sm" onclick="markGoalCompleted(' + Number(goal.id || goal._id) + ')">Mark Completed</button>',
            '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderBadges() {
    var container = document.getElementById('badges-list');
    if (!container) return;

    if (state.badges.length === 0) {
        container.innerHTML = '<div class="empty-state">No badges earned yet.</div>';
        return;
    }

    container.innerHTML = state.badges.map(function(badge) {
        return [
            '<div class="stack-item">',
            '<div class="stack-item-header">',
            '<div class="stack-item-title">' + escapeHtml(badge.name || badge.code || 'Badge') + '</div>',
            '<div class="stack-item-meta">Earned: ' + formatDate(badge.earned_at || badge.createdAt) + '</div>',
            '</div>',
            '<div class="stack-item-meta">Code: ' + escapeHtml(badge.code || '--') + '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderExports() {
    var container = document.getElementById('exports-list');
    if (!container) return;

    if (state.exports.length === 0) {
        container.innerHTML = '<div class="empty-state">No exports created in this session.</div>';
        return;
    }

    container.innerHTML = state.exports.map(function(item) {
        return [
            '<div class="stack-item">',
            '<div class="stack-item-header">',
            '<div class="stack-item-title">' + escapeHtml(item.format || 'Export') + '</div>',
            '<div class="stack-item-meta">' + escapeHtml(item.status || 'ready') + '</div>',
            '</div>',
            '<div class="stack-item-meta">File: ' + escapeHtml(item.file_url || '--') + '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderShares() {
    var container = document.getElementById('shares-list');
    if (!container) return;

    if (state.shares.length === 0) {
        container.innerHTML = '<div class="empty-state">No shares created in this session.</div>';
        return;
    }

    container.innerHTML = state.shares.map(function(item) {
        return [
            '<div class="stack-item">',
            '<div class="stack-item-header">',
            '<div class="stack-item-title">' + escapeHtml(item.target_type || 'share') + '</div>',
            '<div class="stack-item-meta">' + escapeHtml(item.target_value || '--') + '</div>',
            '</div>',
            '<div class="stack-item-meta">Token: ' + escapeHtml(item.token || '--') + '</div>',
            '<div class="stack-item-actions">',
            '<button class="btn btn-outline btn-sm" onclick="revokeShare(' + Number(item.id || item._id) + ')">Revoke</button>',
            '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderSessions() {
    var container = document.getElementById('sessions-list');
    if (!container) return;

    if (state.sessions.length === 0) {
        container.innerHTML = '<div class="empty-state">No sessions found.</div>';
        return;
    }

    container.innerHTML = state.sessions.map(function(session) {
        return [
            '<div class="stack-item">',
            '<div class="stack-item-header">',
            '<div class="stack-item-title">Session #' + Number(session.id || session._id) + '</div>',
            '<div class="stack-item-meta">' + formatDate(session.createdAt) + '</div>',
            '</div>',
            '<div class="stack-item-meta">Revoked: ' + escapeHtml(session.revoked_at || 'No') + '</div>',
            '<div class="stack-item-actions">',
            '<button class="btn btn-outline btn-sm" onclick="revokeSession(' + Number(session.id || session._id) + ')">Revoke</button>',
            '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderAuditLog() {
    var container = document.getElementById('audit-log-list');
    if (!container) return;

    if (state.auditLog.length === 0) {
        container.innerHTML = '<div class="empty-state">No audit entries available.</div>';
        return;
    }

    container.innerHTML = state.auditLog.slice(0, 30).map(function(item) {
        return [
            '<div class="stack-item">',
            '<div class="stack-item-header">',
            '<div class="stack-item-title">' + escapeHtml(item.action || item.event || 'Access Event') + '</div>',
            '<div class="stack-item-meta">' + formatDate(item.createdAt || item.timestamp) + '</div>',
            '</div>',
            '<div class="stack-item-meta">' + escapeHtml(item.resource || item.path || '--') + '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderAiConversation() {
    var container = document.getElementById('ai-conversation');
    if (!container) return;

    if (state.aiConversation.length === 0) {
        container.innerHTML = '<div class="empty-state">No AI conversation yet. Ask your first question.</div>';
        return;
    }

    container.innerHTML = state.aiConversation.map(function(item) {
        var roleClass = item.role === 'assistant' ? 'doctor' : 'patient';
        if (item.loading) {
            var loadingText = escapeHtml(item.loadingText || 'Thinking...');
            return [
                '<div class="message-bubble ' + roleClass + ' is-loading">',
                '<div class="ai-loading-dots" aria-hidden="true"><span></span><span></span><span></span></div>',
                '<div class="message-bubble-meta">' + loadingText + '</div>',
                '</div>',
            ].join('');
        }

        var safeText = escapeHtml(item.text || '');
        var meta = item.meta ? '<div class="message-bubble-meta">' + escapeHtml(item.meta) + '</div>' : '';
        var debugMeta = '';
        if (item.debug && item.debug.engine) {
            var engineLabel = item.debug.engine === 'llm-fallback'
                ? 'Engine: LLM Fallback (' + String(item.debug.provider || 'llm').toUpperCase() + ')'
                : 'Engine: Local AI';
            debugMeta = '<div class="message-bubble-meta debug-engine">' + escapeHtml(engineLabel) + '</div>';
        }
        var typingClass = item.typing ? ' is-typing' : '';
        var suggestions = '';
        if (item.role === 'assistant' && Array.isArray(item.suggestions) && item.suggestions.length > 0) {
            suggestions = '<div class="ai-rephrase-list">' + item.suggestions.slice(0, 3).map(function(suggestion) {
                var encoded = encodeURIComponent(String(suggestion || ''));
                return '<button class="btn btn-outline btn-sm ai-rephrase-btn" onclick="askAiSuggestion(\'' + encoded + '\')">' + escapeHtml(suggestion) + '</button>';
            }).join('') + '</div>';
        }
        return '<div class="message-bubble ' + roleClass + typingClass + '">' + safeText + meta + debugMeta + suggestions + '</div>';
    }).join('');
    container.scrollTop = container.scrollHeight;
}

function setAiComposerBusy(isBusy) {
    state.aiRequestPending = Boolean(isBusy);
    var input = document.getElementById('ai-question');
    var sendBtn = document.getElementById('ai-send-btn');
    if (input) input.disabled = state.aiRequestPending;
    if (sendBtn) sendBtn.disabled = state.aiRequestPending;
}

function stopAiTypingAnimation() {
    if (aiTypingTimer) {
        clearTimeout(aiTypingTimer);
        aiTypingTimer = null;
    }
}

function animateAssistantMessage(messageItem, finalText, done) {
    stopAiTypingAnimation();

    var words = String(finalText || '').split(/\s+/).filter(function(word) { return Boolean(word); });
    var idx = 0;

    messageItem.typing = true;
    messageItem.text = '';
    renderAiConversation();

    if (words.length === 0) {
        messageItem.typing = false;
        if (typeof done === 'function') done();
        return;
    }

    // Human-like cadence: short messages feel quick, longer ones stay readable.
    var baseDelay;
    if (words.length <= 12) {
        baseDelay = 44;
    } else if (words.length <= 36) {
        baseDelay = 52;
    } else if (words.length <= 90) {
        baseDelay = 58;
    } else {
        baseDelay = 62;
    }

    var maxTypingDuration = 6800;
    if ((words.length * baseDelay) > maxTypingDuration) {
        baseDelay = Math.max(28, Math.round(maxTypingDuration / words.length));
    }

    function getStepDelay(word) {
        var token = String(word || '');
        var delay = baseDelay;

        // Small pause after punctuation for a more natural rhythm.
        if (/[.!?]$/.test(token)) {
            delay += 140;
        } else if (/[,;:]$/.test(token)) {
            delay += 70;
        }

        if (token.length >= 10) {
            delay += 18;
        }

        // Light jitter avoids machine-perfect cadence.
        delay += Math.floor(Math.random() * 18) - 7;
        return Math.max(24, delay);
    }

    function typeStep() {
        if (idx >= words.length) {
            messageItem.typing = false;
            renderAiConversation();
            if (typeof done === 'function') done();
            return;
        }

        messageItem.text = messageItem.text ? (messageItem.text + ' ' + words[idx]) : words[idx];
        var delay = getStepDelay(words[idx]);
        idx += 1;
        renderAiConversation();
        aiTypingTimer = setTimeout(typeStep, delay);
    }

    aiTypingTimer = setTimeout(typeStep, 180);
}

async function askAiAssistant() {
    var input = document.getElementById('ai-question');
    if (!input) return;
    if (state.aiRequestPending) return;

    var question = String(input.value || '').trim();
    if (!question) {
        alert('Please enter a question for AI chat.');
        return;
    }

    state.aiConversation.push({ role: 'patient', text: question });
    input.value = '';

    var loadingEntry = {
        role: 'assistant',
        text: '',
        loading: true,
        loadingText: 'Thinking...',
    };
    state.aiConversation.push(loadingEntry);
    renderAiConversation();

    setAiComposerBusy(true);

    var slowHintTimer = setTimeout(function() {
        if (loadingEntry.loading) {
            loadingEntry.loadingText = 'Still thinking. Preparing the best answer...';
            renderAiConversation();
        }
    }, 12000);

    var result;
    try {
        result = await API.post('/api/patient/ai/ask', { question: question });
    } catch {
        result = { ok: false, data: { error: 'AI request failed. Please try again.' } };
    }

    clearTimeout(slowHintTimer);
    loadingEntry.loading = false;

    if (!result.ok) {
        loadingEntry.text = (result.data && result.data.error) || 'AI request failed. Please try again.';
        loadingEntry.meta = null;
        loadingEntry.typing = false;
        renderAiConversation();
        setAiComposerBusy(false);
        return;
    }

    var confidence = result.data && typeof result.data.confidence === 'number'
        ? 'Confidence: ' + Math.round(result.data.confidence * 100) + '%'
        : null;

    loadingEntry.meta = confidence;
    loadingEntry.debug = result.data && result.data.debug ? result.data.debug : null;
    loadingEntry.suggestions = result.data && Array.isArray(result.data.suggestions) ? result.data.suggestions : null;

    var finalAnswer = result.data && result.data.answer ? result.data.answer : 'No answer available.';
    animateAssistantMessage(loadingEntry, finalAnswer, function() {
        if (result.data && result.data.disclaimer) {
            state.aiConversation.push({ role: 'assistant', text: result.data.disclaimer });
            renderAiConversation();
        }
        setAiComposerBusy(false);
    });
}

function askAiPreset(question) {
    var input = document.getElementById('ai-question');
    if (!input) return;
    input.value = String(question || '');
    askAiAssistant();
}

function askAiSuggestion(encodedQuestion) {
    var decoded = '';
    try {
        decoded = decodeURIComponent(String(encodedQuestion || ''));
    } catch {
        decoded = String(encodedQuestion || '');
    }
    if (!decoded.trim()) return;
    askAiPreset(decoded);
}

function openAiAssistantPanel() {
    updateNav('ai-assistant');
    document.body.classList.add('ai-panel-open');
    var input = document.getElementById('ai-question');
    if (!input) return;
    setTimeout(function() {
        input.focus();
    }, 120);
}

function closeAiAssistantPanel() {
    document.body.classList.remove('ai-panel-open');
}

function initAiAssistantPanel() {
    var overlay = document.getElementById('ai-panel-overlay');
    if (overlay) {
        overlay.addEventListener('click', function() {
            closeAiAssistantPanel();
        });
    }

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && document.body.classList.contains('ai-panel-open')) {
            closeAiAssistantPanel();
        }
    });
}

async function openDoctorChat(doctorId) {
    doctorId = Number(doctorId);
    state.selectedDoctorId = doctorId;

    // Find the doctor info
    var doc = state.chatDoctors.find(function(d) { return Number(d._id || d.id) === doctorId; });
    var headerName = document.getElementById('wa-chat-header-name');
    var headerStatus = document.getElementById('wa-chat-header-status');
    var headerAvatar = document.getElementById('wa-chat-avatar');
    if (headerName) headerName.textContent = doc ? doc.fullName : 'Doctor';
    if (headerStatus) headerStatus.textContent = doc ? (doc.specialization || 'Doctor') : '';
    if (headerAvatar) headerAvatar.textContent = doc ? threadInitials(doc.fullName) : 'DR';

    renderMessageThreads();

    // Find existing thread with this doctor
    var thread = state.threads.find(function(t) { return Number(t.doctor_id) === doctorId; });

    if (thread) {
        state.selectedThreadId = Number(thread.id || thread._id);
        var result = await API.get('/api/patient/messages/threads/' + state.selectedThreadId);
        if (result.ok) {
            renderThreadMessages(result.data.messages || []);
        } else {
            renderThreadMessages([]);
        }
    } else {
        // No thread yet — show empty, thread will be created on first message
        state.selectedThreadId = null;
        renderThreadMessages([]);
    }
}

async function sendThreadReply() {
    if (!state.selectedDoctorId) {
        alert('Select a doctor first.');
        return;
    }

    var inputEl = document.getElementById('thread-reply-body');
    var body = (inputEl.value || '').trim();
    if (!body) return;

    // If no thread yet, create one with the first message
    if (!state.selectedThreadId) {
        var doc = state.chatDoctors.find(function(d) { return Number(d._id || d.id) === state.selectedDoctorId; });
        var subject = 'Chat with ' + (doc ? doc.fullName : 'Doctor');
        var createResult = await API.post('/api/patient/messages/threads', {
            doctorId: state.selectedDoctorId,
            subject: subject,
            body: body,
        });
        if (!createResult.ok) {
            alert((createResult.data && createResult.data.error) || 'Failed to send message.');
            return;
        }
        inputEl.value = '';
        await loadMessages();
        // Select the newly created thread
        var newThread = state.threads.find(function(t) { return Number(t.doctor_id) === state.selectedDoctorId; });
        if (newThread) {
            state.selectedThreadId = Number(newThread.id || newThread._id);
        }
        await openDoctorChat(state.selectedDoctorId);
        return;
    }

    var result = await API.post('/api/patient/messages/threads/' + state.selectedThreadId, { body: body });
    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to send message.');
        return;
    }

    inputEl.value = '';

    // Append the new message to the UI immediately for snappy feel
    var container = document.getElementById('thread-messages');
    if (container && result.data) {
        var emptyEl = container.querySelector('.wa-empty');
        if (emptyEl) emptyEl.remove();

        var msgDiv = document.createElement('div');
        msgDiv.className = 'wa-msg patient';
        msgDiv.setAttribute('data-msg-id', result.data.id || '');
        var sentIcon = '<span class="msg-status sent" title="Sent">&#10003;</span>';
        msgDiv.innerHTML = '<div>' + escapeHtml(result.data.body || body) + '</div><div class="wa-msg-time">' + msgTime(result.data.sent_at || new Date().toISOString()) + ' ' + sentIcon + '</div>';
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    }

    // Update thread list
    await loadMessages();
}

async function saveSafetyProfile() {
    var result = await API.patch('/api/patient/safety/profile', {
        emergencyContactName: document.getElementById('safety-contact-name').value || null,
        emergencyContactPhone: document.getElementById('safety-contact-phone').value || null,
        severeLowThreshold: Number(document.getElementById('safety-low-threshold').value || 60),
        autoNotifyEnabled: boolFromSelectValue(document.getElementById('safety-auto-notify').value),
    });

    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to update safety profile.');
        return;
    }

    alert('Safety profile updated.');
}

async function triggerSafetyEvent() {
    var eventType = document.getElementById('safety-event-type').value;
    var severity = document.getElementById('safety-event-severity').value;

    var result = await API.post('/api/patient/safety/trigger', {
        eventType: eventType,
        severity: severity,
        details: { source: 'patient-dashboard-manual-trigger' },
    });

    var info = document.getElementById('safety-event-result');
    if (!result.ok) {
        if (info) info.textContent = (result.data && result.data.error) || 'Failed to trigger event.';
        return;
    }
    if (info) info.textContent = 'Safety event logged successfully at ' + formatDate(result.data.triggered_at || result.data.createdAt);
}

async function createGoal() {
    var type = document.getElementById('goal-type').value;
    var targetValue = Number(document.getElementById('goal-target').value || 0);
    if (!type || targetValue <= 0) {
        alert('Goal type and positive target are required.');
        return;
    }

    var result = await API.post('/api/patient/gamification/goals', {
        type: type,
        targetValue: targetValue,
        period: 'daily',
        status: 'active',
    });

    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to create goal.');
        return;
    }

    document.getElementById('goal-target').value = '';
    await loadGamification();
}

async function markGoalCompleted(goalId) {
    var result = await API.patch('/api/patient/gamification/goals/' + Number(goalId), { status: 'completed' });
    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to update goal.');
        return;
    }
    await loadGamification();
}

async function createExport() {
    var format = document.getElementById('export-format').value;
    var scope = document.getElementById('export-scope').value;

    var result = await API.post('/api/patient/exports', { format: format, scope: { preset: scope } });
    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to create export.');
        return;
    }

    state.exports.unshift(result.data);
    renderExports();
}

async function createShare() {
    var targetType = document.getElementById('share-target-type').value;
    var targetValue = (document.getElementById('share-target-value').value || '').trim();
    if (!targetValue) {
        alert('Target value is required.');
        return;
    }

    var result = await API.post('/api/patient/shares', {
        targetType: targetType,
        targetValue: targetValue,
        scope: { preset: 'summary' },
    });

    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to create share.');
        return;
    }

    state.shares.unshift(result.data);
    renderShares();
}

async function revokeShare(shareId) {
    var result = await API.patch('/api/patient/shares/' + Number(shareId) + '/revoke', {});
    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to revoke share.');
        return;
    }

    state.shares = state.shares.filter(function(item) { return Number(item.id || item._id) !== Number(shareId); });
    renderShares();
}

async function savePrivacySettings() {
    var result = await API.patch('/api/patient/privacy/settings', {
        shareWithDoctor: boolFromSelectValue(document.getElementById('privacy-share-doctor').value),
        shareWithCaregiver: boolFromSelectValue(document.getElementById('privacy-share-caregiver').value),
        researchOptIn: boolFromSelectValue(document.getElementById('privacy-research').value),
        marketingOptIn: boolFromSelectValue(document.getElementById('privacy-marketing').value),
    });

    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to save privacy settings.');
        return;
    }

    alert('Privacy settings saved.');
}

async function revokeSession(sessionId) {
    var result = await API.delete('/api/patient/security/sessions/' + Number(sessionId));
    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to revoke session.');
        return;
    }
    await loadPrivacyAndSecurity();
}

function filterReports() {
    var search = (document.getElementById('report-search').value || '').toLowerCase();
    var type = (document.getElementById('report-type-filter').value || '').toLowerCase();
    var rows = document.querySelectorAll('#reports-table-body tr');

    rows.forEach(function(row) {
        var text = row.textContent.toLowerCase();
        var rowTypeCell = row.querySelector('td:nth-child(2)');
        var rowType = rowTypeCell ? rowTypeCell.textContent.toLowerCase() : '';

        var matchesSearch = text.indexOf(search) >= 0;
        var matchesType = !type || rowType.indexOf(type) >= 0;
        row.style.display = matchesSearch && matchesType ? '' : 'none';
    });
}

function filterRecords() {
    var search = (document.getElementById('record-search').value || '').toLowerCase();
    var type = (document.getElementById('record-type-filter').value || '').toLowerCase();
    var records = document.querySelectorAll('#records-list .record-card');

    records.forEach(function(record) {
        var text = record.textContent.toLowerCase();
        var typeEl = record.querySelector('.record-type');
        var rowType = typeEl ? typeEl.textContent.toLowerCase() : '';
        var matchesSearch = text.indexOf(search) >= 0;
        var matchesType = !type || rowType.indexOf(type) >= 0;
        record.style.display = matchesSearch && matchesType ? '' : 'none';
    });
}

function saveDiet(e) {
    e.preventDefault();
    alert('Dietary preferences saved locally. Clinical meal plans are provided by your care team.');
    closeModal('diet-modal');
}

function scheduleWithDoctor(doctorId) {
    var select = document.getElementById('appointment-doctor');
    if (select && doctorId) {
        select.value = String(Number(doctorId));
    }
    openModal('appointment-modal');
}

async function saveProfile(e) {
    e.preventDefault();

    var firstName = (document.getElementById('first-name').value || '').trim();
    var lastName = (document.getElementById('last-name').value || '').trim();
    var phone = (document.getElementById('phone').value || '').trim();
    var dob = document.getElementById('dob').value || null;
    var emergencyName = (document.getElementById('emergency-name').value || '').trim();
    var emergencyPhone = (document.getElementById('emergency-phone').value || '').trim();

    var fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (!fullName) {
        alert('Please enter a first and/or last name.');
        return;
    }

    try {
        var result = await API.put('/api/patient/profile', {
            fullName: fullName,
            phone: phone || null,
            dateOfBirth: dob,
            emergencyContact: {
                name: emergencyName || null,
                phone: emergencyPhone || null,
            },
        });

        if (!result.ok) {
            alert((result.data && result.data.error) || 'Failed to update profile.');
            return;
        }

        localStorage.setItem('user', JSON.stringify(result.data));
        populateProfileView(result.data);
        populateProfileModal(result.data);
        alert('Profile updated successfully.');
        closeModal('profile-modal');
    } catch (err) {
        alert('Network error while updating profile.');
    }
}

async function bookAppointment(e) {
    e.preventDefault();

    var doctor = Number(document.getElementById('appointment-doctor').value);
    var date = document.getElementById('appointment-date').value;
    var time = document.getElementById('appointment-time').value;
    var reason = (document.getElementById('appointment-reason').value || '').trim();

    if (!doctor || !date || !time) {
        alert('Doctor, date, and time are required.');
        return;
    }

    try {
        var result = await API.post('/api/patient/appointments', {
            doctor: doctor,
            date: date,
            time: time,
            reason: reason || null,
        });

        if (!result.ok) {
            alert((result.data && result.data.error) || 'Failed to book appointment.');
            return;
        }

        alert('Appointment booked successfully.');
        closeModal('appointment-modal');
        await loadAppointments();
    } catch (err) {
        alert('Network error while booking appointment.');
    }
}

async function addReport(e) {
    e.preventDefault();

    var reportName = (document.getElementById('report-name').value || '').trim();
    var reportTypeKey = document.getElementById('report-type').value || 'lab';
    var reportType = reportTypeMap[reportTypeKey] || 'Lab Report';
    var date = document.getElementById('report-date').value || new Date().toISOString().slice(0, 10);
    var notes = (document.getElementById('report-notes').value || '').trim();

    if (!reportName) {
        alert('Report name is required.');
        return;
    }

    try {
        var result = await API.post('/api/patient/reports', {
            reportName: reportName,
            type: reportType,
            date: date,
            notes: notes,
            status: 'Pending',
        });

        if (!result.ok) {
            alert((result.data && result.data.error) || 'Failed to add report.');
            return;
        }

        alert('Report added successfully.');
        closeModal('report-modal');
        document.getElementById('report-form').reset();
        await loadReports();
    } catch (err) {
        alert('Network error while adding report.');
    }
}

async function deleteReport(id) {
    if (!confirm('Delete this report?')) return;
    try {
        var result = await API.request('/api/patient/reports/' + Number(id), { method: 'DELETE' });
        if (!result.ok) {
            alert((result.data && result.data.error) || 'Failed to delete report.');
            return;
        }
        await loadReports();
    } catch (err) {
        alert('Network error while deleting report.');
    }
}

async function addRecord(e) {
    e.preventDefault();

    var typeKey = document.getElementById('record-type').value || 'diagnosis';
    var type = recordTypeMap[typeKey] || 'Other';
    var date = document.getElementById('record-date').value || new Date().toISOString().slice(0, 10);
    var title = (document.getElementById('record-title').value || '').trim();
    var description = (document.getElementById('record-description').value || '').trim();

    if (!title) {
        alert('Record title is required.');
        return;
    }

    try {
        var result = await API.post('/api/patient/records', {
            title: title,
            type: type,
            date: date,
            description: description || null,
        });

        if (!result.ok) {
            alert((result.data && result.data.error) || 'Failed to add record.');
            return;
        }

        alert('Medical record added successfully.');
        closeModal('record-modal');
        document.getElementById('record-form').reset();
        await loadRecords();
    } catch (err) {
        alert('Network error while adding record.');
    }
}

async function loadProfile() {
    var result = await API.get('/api/patient/profile');
    if (!result.ok) return;
    localStorage.setItem('user', JSON.stringify(result.data));
    populateProfileView(result.data);
    populateProfileModal(result.data);
}

async function loadDoctors() {
    var result = await API.get('/api/patient/doctors');
    state.doctors = result.ok && Array.isArray(result.data) ? result.data : [];
    renderDoctors();
}

async function loadAppointments() {
    var result = await API.get('/api/patient/appointments');
    state.appointments = result.ok && Array.isArray(result.data) ? result.data : [];
    renderAppointments();
}

async function loadReports() {
    var result = await API.get('/api/patient/reports');
    state.reports = result.ok && Array.isArray(result.data) ? result.data : [];
    renderReports();
    filterReports();
}

async function loadRecords() {
    var result = await API.get('/api/patient/records');
    state.records = result.ok && Array.isArray(result.data) ? result.data : [];
    renderRecords();
    filterRecords();
}

async function loadOverview() {
    var dashboardRes = await API.get('/api/patient/dashboard');
    var glucoseRes = await API.get('/api/patient/glucose?days=30');
    var metricsRes = await API.get('/api/patient/health-metrics?days=30');
    var scoreRes = await API.get('/api/patient/score/today');

    var dashboard = dashboardRes.ok ? dashboardRes.data : {};
    var glucose = glucoseRes.ok && Array.isArray(glucoseRes.data) ? glucoseRes.data : [];
    var metrics = metricsRes.ok && Array.isArray(metricsRes.data) ? metricsRes.data : [];
    var score = scoreRes.ok ? scoreRes.data : null;

    updateOverviewSummary(dashboard);
    updateOverviewMetrics(glucose, metrics, score);
    updateOverviewCharts(glucose, metrics);
}

async function loadNutrition() {
    var mealsRes = await API.get('/api/patient/meals?range=7d');
    var activityRes = await API.get('/api/patient/activities?range=7d');

    var meals = mealsRes.ok && Array.isArray(mealsRes.data) ? mealsRes.data : [];
    var activities = activityRes.ok && Array.isArray(activityRes.data) ? activityRes.data : [];

    var today = new Date().toISOString().slice(0, 10);
    var todaysMeals = meals.filter(function(item) { return String(item.logged_at || '').slice(0, 10) === today; });
    var todaysActivities = activities.filter(function(item) { return String(item.logged_at || '').slice(0, 10) === today; });

    var totalCalories = todaysMeals.reduce(function(sum, item) { return sum + Number(item.calories || 0); }, 0);
    var totalCarbs = todaysMeals.reduce(function(sum, item) { return sum + Number(item.carbs_g || 0); }, 0);
    var activeMinutes = todaysActivities.reduce(function(sum, item) { return sum + Number(item.duration_min || 0); }, 0);

    updateNutritionSummary({
        totalCalories: Number(totalCalories.toFixed(0)),
        totalCarbs: Number(totalCarbs.toFixed(0)),
        activeMinutes: Number(activeMinutes.toFixed(0)),
        mealCount: todaysMeals.length,
    });

    var goalMetrics = document.querySelectorAll('#nutritionist .metrics-grid .metric-card .metric-value');
    if (goalMetrics[0]) goalMetrics[0].textContent = Number(totalCalories.toFixed(0));
    if (goalMetrics[1]) goalMetrics[1].textContent = Number(totalCarbs.toFixed(0)) + 'g';
    if (goalMetrics[2]) goalMetrics[2].textContent = '--';
}

async function loadTrends() {
    var days = getChartRangeDays();
    var range = days + 'd';
    var trendRes = await API.get('/api/patient/biometrics/trends?range=' + encodeURIComponent(range));
    if (trendRes.ok) {
        updateTrendCharts(trendRes.data || {});
    }
}

async function loadMessages() {
    // Load assigned doctors and existing threads in parallel
    var doctorsResult = await API.get('/api/patient/doctors');
    var threadsResult = await API.get('/api/patient/messages/threads');

    // Keep chat usable if doctors endpoint fails transiently.
    if (doctorsResult.ok && Array.isArray(doctorsResult.data) && doctorsResult.data.length > 0) {
        state.chatDoctors = doctorsResult.data;
    } else if (Array.isArray(state.doctors) && state.doctors.length > 0) {
        state.chatDoctors = state.doctors;
    } else {
        state.chatDoctors = [];
    }
    state.threads = threadsResult.ok && Array.isArray(threadsResult.data) ? threadsResult.data : [];

    renderMessageThreads();
}

async function loadSafety() {
    var result = await API.get('/api/patient/safety/profile');
    if (!result.ok || !result.data) return;

    var profile = result.data;
    var name = document.getElementById('safety-contact-name');
    var phone = document.getElementById('safety-contact-phone');
    var threshold = document.getElementById('safety-low-threshold');
    var autoNotify = document.getElementById('safety-auto-notify');

    if (name) name.value = profile.emergency_contact_name || '';
    if (phone) phone.value = profile.emergency_contact_phone || '';
    if (threshold) threshold.value = profile.severe_low_threshold || 60;
    if (autoNotify) autoNotify.value = profile.auto_notify_enabled === 1 ? 'true' : 'false';
}

async function loadGamification() {
    var result = await API.get('/api/patient/gamification/progress');
    if (!result.ok || !result.data) {
        state.goals = [];
        state.badges = [];
    } else {
        state.goals = Array.isArray(result.data.goals) ? result.data.goals : [];
        state.badges = Array.isArray(result.data.badges) ? result.data.badges : [];
    }

    renderGoals();
    renderBadges();
}

async function loadPrivacyAndSecurity() {
    var privacy = await API.get('/api/patient/privacy/settings');
    if (privacy.ok && privacy.data) {
        var row = privacy.data;
        var shareDoctor = document.getElementById('privacy-share-doctor');
        var shareCaregiver = document.getElementById('privacy-share-caregiver');
        var research = document.getElementById('privacy-research');
        var marketing = document.getElementById('privacy-marketing');

        if (shareDoctor) shareDoctor.value = row.share_with_doctor === 1 ? 'true' : 'false';
        if (shareCaregiver) shareCaregiver.value = row.share_with_caregiver === 1 ? 'true' : 'false';
        if (research) research.value = row.research_opt_in === 1 ? 'true' : 'false';
        if (marketing) marketing.value = row.marketing_opt_in === 1 ? 'true' : 'false';
    }

    var sessions = await API.get('/api/patient/security/sessions');
    state.sessions = sessions.ok && Array.isArray(sessions.data) ? sessions.data : [];
    renderSessions();

    var audit = await API.get('/api/patient/audit/access-log');
    state.auditLog = audit.ok && Array.isArray(audit.data) ? audit.data : [];
    renderAuditLog();
}

function initInteractions() {
    var globalSearch = document.getElementById('global-search');
    if (globalSearch) {
        globalSearch.addEventListener('input', function(e) {
            var value = String(e.target.value || '').toLowerCase();
            if (document.getElementById('reports').classList.contains('active')) {
                document.getElementById('report-search').value = value;
                filterReports();
            }
            if (document.getElementById('records').classList.contains('active')) {
                document.getElementById('record-search').value = value;
                filterRecords();
            }
        });
    }

    var reportSearch = document.getElementById('report-search');
    if (reportSearch) reportSearch.addEventListener('input', filterReports);
    var reportType = document.getElementById('report-type-filter');
    if (reportType) reportType.addEventListener('change', filterReports);

    var recordSearch = document.getElementById('record-search');
    if (recordSearch) recordSearch.addEventListener('input', filterRecords);
    var recordType = document.getElementById('record-type-filter');
    if (recordType) recordType.addEventListener('change', filterRecords);

    var chartPeriod = document.getElementById('chart-period');
    if (chartPeriod) {
        chartPeriod.addEventListener('change', function() {
            loadTrends().catch(function() {
                console.error('Failed to reload trend charts.');
            });
        });
    }

    var appointmentDate = document.getElementById('appointment-date');
    if (appointmentDate) {
        appointmentDate.min = new Date().toISOString().slice(0, 10);
    }

    var aiQuestion = document.getElementById('ai-question');
    if (aiQuestion) {
        aiQuestion.addEventListener('keydown', function(event) {
            if (event.isComposing) return;
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                askAiAssistant().catch(function() {
                    console.error('Failed to ask AI assistant.');
                });
            }
        });
    }

    var aiFab = document.querySelector('.floating-ai-btn');
    if (aiFab) {
        aiFab.classList.add('pulse-once');
        setTimeout(function() {
            aiFab.classList.remove('pulse-once');
        }, 2800);
    }

    // Doctor-chat: thread search
    var waSearch = document.getElementById('wa-thread-search');
    if (waSearch) {
        waSearch.addEventListener('input', function() {
            renderMessageThreads();
        });
    }

    // Doctor-chat: reply on Enter
    var replyInput = document.getElementById('thread-reply-body');
    if (replyInput) {
        replyInput.addEventListener('keydown', function(event) {
            if (event.isComposing) return;
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendThreadReply();
            }
        });
    }
}

function initChatSocket() {
    if (typeof io === 'undefined') return;
    var token = localStorage.getItem('token');
    if (!token) return;

    chatSocket = io({ auth: { token: token } });

    chatSocket.on('connect', function() {
        console.log('Chat socket connected');
    });

    chatSocket.on('new_message', function(data) {
        // A doctor sent a new message
        if (data && data.message && data.threadId) {
            // Acknowledge delivery to the sender (doctor)
            chatSocket.emit('message_delivered', {
                messageIds: [data.message.id],
                senderId: data.message.sender_id,
                threadId: data.threadId
            });

            // If we're viewing this thread, append the message live and mark as read
            if (state.selectedThreadId === data.threadId) {
                var container = document.getElementById('thread-messages');
                if (container) {
                    var emptyEl = container.querySelector('.wa-empty');
                    if (emptyEl) emptyEl.remove();

                    var msgDiv = document.createElement('div');
                    msgDiv.className = 'wa-msg doctor';
                    msgDiv.setAttribute('data-msg-id', data.message.id || '');
                    msgDiv.innerHTML = '<div>' + escapeHtml(data.message.body || '') + '</div><div class="wa-msg-time">' + msgTime(data.message.sent_at || new Date().toISOString()) + '</div>';
                    container.appendChild(msgDiv);
                    container.scrollTop = container.scrollHeight;
                }
                // Since we're viewing it, also mark as read
                chatSocket.emit('messages_read', {
                    messageIds: [data.message.id],
                    senderId: data.message.sender_id,
                    threadId: data.threadId
                });
            }
            // Refresh thread list to update last message / unread
            loadMessages();
        }
    });

    // Our sent messages were delivered to the doctor's device
    chatSocket.on('messages_delivered', function(data) {
        if (!data || !Array.isArray(data.messageIds)) return;
        data.messageIds.forEach(function(id) {
            var el = document.querySelector('.wa-msg[data-msg-id="' + id + '"] .msg-status');
            if (el) {
                el.className = 'msg-status delivered';
                el.title = 'Delivered';
                el.innerHTML = '&#10003;&#10003;';
            }
        });
    });

    // Our sent messages were read by the doctor
    chatSocket.on('messages_read_ack', function(data) {
        if (!data || !Array.isArray(data.messageIds)) return;
        data.messageIds.forEach(function(id) {
            var el = document.querySelector('.wa-msg[data-msg-id="' + id + '"] .msg-status');
            if (el) {
                el.className = 'msg-status read';
                el.title = 'Read';
                el.innerHTML = '&#10003;&#10003;';
            }
        });
    });

    chatSocket.on('disconnect', function() {
        console.log('Chat socket disconnected');
    });
}

async function bootstrap() {
    if (typeof API === 'undefined') return;
    var authorized = await verifyAuthRole('patient');
    if (!authorized) return;

    initNavigation();
    initModals();
    initAiAssistantPanel();
    initCharts();
    initInteractions();
    initChatSocket();

    var localUser = API.getUser();
    if (localUser) {
        populateProfileView(localUser);
        populateProfileModal(localUser);
    }

    try {
        renderAiConversation();
        await Promise.all([
            loadProfile(),
            loadDoctors(),
            loadAppointments(),
            loadReports(),
            loadRecords(),
            loadOverview(),
            loadNutrition(),
            loadTrends(),
            loadMessages(),
            loadSafety(),
            loadGamification(),
            loadPrivacyAndSecurity(),
        ]);
        renderExports();
        renderShares();
    } catch (err) {
        console.error('Failed to load patient dashboard:', err);
    }
}

window.openModal = openModal;
window.closeModal = closeModal;
window.saveProfile = saveProfile;
window.bookAppointment = bookAppointment;
window.saveDiet = saveDiet;
window.addReport = addReport;
window.addRecord = addRecord;
window.filterReports = filterReports;
window.filterRecords = filterRecords;
window.deleteReport = deleteReport;
window.scheduleWithDoctor = scheduleWithDoctor;
window.openDoctorChat = openDoctorChat;
window.sendThreadReply = sendThreadReply;
window.saveSafetyProfile = saveSafetyProfile;
window.triggerSafetyEvent = triggerSafetyEvent;
window.createGoal = createGoal;
window.markGoalCompleted = markGoalCompleted;
window.createExport = createExport;
window.createShare = createShare;
window.revokeShare = revokeShare;
window.savePrivacySettings = savePrivacySettings;
window.revokeSession = revokeSession;
window.askAiAssistant = askAiAssistant;
window.askAiPreset = askAiPreset;
window.askAiSuggestion = askAiSuggestion;
window.openAiAssistantPanel = openAiAssistantPanel;
window.closeAiAssistantPanel = closeAiAssistantPanel;

bootstrap();


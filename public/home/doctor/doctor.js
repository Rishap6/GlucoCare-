// Logout logic
function logoutDoctor() {
    // Remove any session tokens (example: localStorage/sessionStorage)
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    // Redirect to login page
    window.location.href = '/auth/login/login.html';
}

document.addEventListener('DOMContentLoaded', function() {
    var logoutBtn = document.getElementById('doctor-logout-link');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            logoutDoctor();
        });
    }
});
var doctorState = {
    patients: [],
    assignedPatients: [],
    appointments: [],
    alerts: [],
    doctorProfile: null,
    dashboard: null,
    patientView: {
        assignedOnly: true,
        sortBy: 'nameAsc',
        page: 1,
        pageSize: 8,
        query: '',
    },
    chatThreads: [],
    chatSelectedThreadId: null,
    chatSocket: null,
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
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleDateString();
}

function formatDateTime(value) {
    if (!value) return '--';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleString();
}

function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).slice(0, 2);
    if (parts.length === 0) return 'PT';
    return parts.map(function (part) { return part[0] ? part[0].toUpperCase() : ''; }).join('') || 'PT';
}

function parseReportInsights(report) {
    if (!report || typeof report !== 'object') return null;

    var parsedRaw = report.parsedJson || report.parsed_json || null;
    if (parsedRaw && typeof parsedRaw === 'string') {
        try {
            var parsedJson = JSON.parse(parsedRaw);
            if (parsedJson && typeof parsedJson === 'object') return parsedJson;
        } catch (_) {
        }
    }

    if (parsedRaw && typeof parsedRaw === 'object') {
        return parsedRaw;
    }

    return null;
}

function summarizeExtracted(result) {
    if (!result || typeof result !== 'object') return '';
    var extracted = result.extracted || {};
    var summary = [];
    if (result.review && result.review.label) summary.push('Review: ' + result.review.label);
    if (result.summary) summary.push(String(result.summary));
    if (extracted.hba1c !== null && extracted.hba1c !== undefined && extracted.hba1c !== '') {
        summary.push('HbA1c ' + Number(extracted.hba1c).toFixed(1) + '%');
    }
    if (Array.isArray(extracted.glucoseReadingsMgDl) && extracted.glucoseReadingsMgDl.length) {
        summary.push(extracted.glucoseReadingsMgDl.length + ' glucose value(s)');
    }
    if (Array.isArray(extracted.bloodPressure) && extracted.bloodPressure.length) {
        summary.push(extracted.bloodPressure.length + ' BP value(s)');
    }
    if (extracted.weightKg !== null && extracted.weightKg !== undefined && extracted.weightKg !== '') {
        summary.push('Weight ' + Number(extracted.weightKg).toFixed(1) + ' kg');
    }
    return summary.join(', ');
}

function setDoctorHeader(user) {
    var profileName = document.querySelector('.profile-name');
    var titleMsg = document.querySelector('.page-title p');
    var profileRole = document.querySelector('.profile-role');

    if (profileName) profileName.textContent = user.fullName || 'Doctor';
    if (titleMsg) titleMsg.textContent = 'Welcome back, ' + (user.fullName || 'Doctor');
    if (profileRole) profileRole.textContent = user.specialization || 'Doctor';
}

function renderPatients(patients) {
    var tbody = document.getElementById('doctor-patients-body');
    var info = document.getElementById('doctor-patient-table-info');
    if (!tbody) return;

    if (!Array.isArray(patients) || patients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--gray-500);">No patients found.</td></tr>';
        if (info) info.textContent = 'Showing 0 patients';
        updatePatientPagination(0, 1);
        return;
    }

    tbody.innerHTML = patients.map(function (p) {
        return [
            '<tr>',
            '<td>',
            '<div class="patient-info">',
            '<div class="patient-avatar" style="background: linear-gradient(135deg, #0D9488, #14B8A6);">' + escapeHtml(initials(p.fullName)) + '</div>',
            '<div>',
            '<div class="patient-name">' + escapeHtml(p.fullName || 'Unknown') + '</div>',
            '<div class="patient-id">ID: ' + escapeHtml(String(p._id || '--')) + '</div>',
            '</div>',
            '</div>',
            '</td>',
            '<td>' + escapeHtml(p.email || '--') + '</td>',
            '<td>' + escapeHtml(p.phone || '--') + '</td>',
            '<td class="hide-mobile">' + escapeHtml(p.bloodType || '--') + '</td>',
            '<td class="hide-mobile" style="color: var(--gray-500); font-size: 13px;">' + escapeHtml((p.chronicConditions || []).join(', ') || '--') + '</td>',
            '<td>',
            '<button class="table-action-btn" title="View Details" onclick="viewPatient(' + Number(p._id) + ')">',
            '<svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z"/></svg>',
            '</button>',
            '</td>',
            '</tr>'
        ].join('');
    }).join('');

}

function updatePatientTableInfo(totalCount, shownCount) {
    var info = document.getElementById('doctor-patient-table-info');
    if (!info) return;

    var page = doctorState.patientView.page;
    var pageSize = doctorState.patientView.pageSize;
    var start = totalCount === 0 ? 0 : ((page - 1) * pageSize) + 1;
    var end = totalCount === 0 ? 0 : Math.min((page - 1) * pageSize + shownCount, totalCount);
    var scope = doctorState.patientView.assignedOnly ? 'assigned' : 'all';

    info.textContent = 'Showing ' + start + '-' + end + ' of ' + totalCount + ' ' + scope + ' patients';
}

function updatePatientPagination(totalCount, totalPages) {
    var prev = document.getElementById('doctor-page-prev');
    var next = document.getElementById('doctor-page-next');
    var label = document.getElementById('doctor-page-label');
    var page = doctorState.patientView.page;

    if (label) label.textContent = page + ' / ' + Math.max(1, totalPages);
    if (prev) prev.disabled = page <= 1 || totalCount === 0;
    if (next) next.disabled = page >= totalPages || totalCount === 0;
}

function getDisplayedPatients() {
    var base = Array.isArray(doctorState.patients) ? doctorState.patients.slice() : [];
    var q = String(doctorState.patientView.query || '').trim().toLowerCase();

    if (q) {
        base = base.filter(function (p) {
            var name = String(p.fullName || '').toLowerCase();
            var email = String(p.email || '').toLowerCase();
            return name.indexOf(q) >= 0 || email.indexOf(q) >= 0;
        });
    }

    var sortBy = doctorState.patientView.sortBy;
    base.sort(function (a, b) {
        var aName = String(a.fullName || '').toLowerCase();
        var bName = String(b.fullName || '').toLowerCase();

        if (sortBy === 'nameDesc') return bName.localeCompare(aName);
        if (sortBy === 'recent') {
            var aTs = new Date(a.createdAt || 0).getTime();
            var bTs = new Date(b.createdAt || 0).getTime();
            return bTs - aTs;
        }
        return aName.localeCompare(bName);
    });

    return base;
}

function applyPatientDirectoryView() {
    var all = getDisplayedPatients();
    var pageSize = doctorState.patientView.pageSize;
    var totalPages = Math.max(1, Math.ceil(all.length / pageSize));

    if (doctorState.patientView.page > totalPages) {
        doctorState.patientView.page = totalPages;
    }
    if (doctorState.patientView.page < 1) {
        doctorState.patientView.page = 1;
    }

    var start = (doctorState.patientView.page - 1) * pageSize;
    var paged = all.slice(start, start + pageSize);

    renderPatients(paged);
    updatePatientTableInfo(all.length, paged.length);
    updatePatientPagination(all.length, totalPages);
}

function renderUpcomingAppointments(appointments) {
    var container = document.getElementById('upcoming-appointments');
    if (!container) return;

    if (!Array.isArray(appointments) || appointments.length === 0) {
        container.innerHTML = '<div class="appointment-item"><div class="appointment-details"><div class="appointment-name">No appointments found</div></div></div>';
        return;
    }

    container.innerHTML = appointments.slice(0, 8).map(function (appt) {
        var time = appt.time || '--';
        var status = String(appt.status || 'Scheduled').toLowerCase();
        var statusClass = status.indexOf('complete') >= 0 ? 'confirmed' : 'upcoming';
        return [
            '<div class="appointment-item">',
            '<div class="appointment-time-block">',
            '<span class="time">' + escapeHtml(time) + '</span>',
            '<span class="period">' + escapeHtml(formatDate(appt.date)) + '</span>',
            '</div>',
            '<div class="appointment-details">',
            '<div class="appointment-name">' + escapeHtml(appt.patient && appt.patient.fullName ? appt.patient.fullName : 'Patient') + '</div>',
            '<div class="appointment-type">' + escapeHtml(appt.reason || 'Consultation') + '</div>',
            '</div>',
            '<span class="appointment-status ' + statusClass + '">' + escapeHtml(appt.status || 'Scheduled') + '</span>',
            '</div>'
        ].join('');
    }).join('');
}

function renderCriticalAlerts(alerts) {
    var container = document.getElementById('critical-alerts');
    if (!container) return;

    if (!Array.isArray(alerts) || alerts.length === 0) {
        container.innerHTML = '<div class="alert-item"><div class="alert-content"><div class="alert-title">No critical alerts</div></div></div>';
        return;
    }

    container.innerHTML = alerts.slice(0, 8).map(function (item) {
        var severityClass = item.severity === 'critical' ? 'critical' : 'warning';
        var title = item.patient && item.patient.fullName
            ? item.patient.fullName + ' - ' + (item.title || 'Alert')
            : (item.title || 'Alert');
        return [
            '<div class="alert-item">',
            '<div class="alert-icon ' + severityClass + '">',
            '<svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
            '</div>',
            '<div class="alert-content">',
            '<div class="alert-title">' + escapeHtml(title) + '</div>',
            '<div class="alert-desc">' + escapeHtml(item.message || '') + '</div>',
            '</div>',
            '</div>'
        ].join('');
    }).join('');
}

function renderAlertsModal() {
    var box = document.getElementById('doctor-all-alerts');
    if (!box) return;

    if (!Array.isArray(doctorState.alerts) || doctorState.alerts.length === 0) {
        box.innerHTML = '<div style="color:var(--gray-500);">No alerts found.</div>';
        return;
    }

    box.innerHTML = doctorState.alerts.map(function (a) {
        var severity = a.severity === 'critical' ? 'critical' : 'warning';
        return [
            '<div class="card" style="margin:0;">',
            '<div class="card-body" style="padding:14px 16px;">',
            '<div style="display:flex; justify-content:space-between; gap:10px; margin-bottom:8px;">',
            '<strong style="color:var(--deep-blue);">' + escapeHtml((a.patient && a.patient.fullName ? a.patient.fullName + ' - ' : '') + (a.title || 'Alert')) + '</strong>',
            '<span class="status-badge ' + severity + '"><span class="dot"></span>' + escapeHtml(a.severity || 'warning') + '</span>',
            '</div>',
            '<div style="font-size:13px; color:var(--gray-700);">' + escapeHtml(a.message || '--') + '</div>',
            '<div style="font-size:12px; color:var(--gray-500); margin-top:8px;">' + escapeHtml(formatDateTime(a.triggeredAt)) + '</div>',
            '</div>',
            '</div>'
        ].join('');
    }).join('');
}

function applyLocalSearch(query) {
    doctorState.patientView.query = String(query || '');
    doctorState.patientView.page = 1;
    applyPatientDirectoryView();
}

function bindSearch() {
    var input = document.getElementById('doctor-patient-search');
    if (!input) return;
    input.addEventListener('input', function () {
        applyLocalSearch(this.value);
    });
}

function openModal(modalId) {
    var modal = document.getElementById(modalId);
    var overlay = document.getElementById('doctorModalOverlay');
    if (!modal) return;
    modal.style.display = 'flex';
    if (overlay) overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    var modal = document.getElementById(modalId);
    var overlay = document.getElementById('doctorModalOverlay');
    if (!modal) return;
    modal.style.display = 'none';

    // Keep overlay if any modal is still open.
    var allOpen = [
        'doctor-patient-modal',
        'doctor-appointments-modal',
        'doctor-profile-modal',
        'doctor-assign-patient-modal',
        'doctor-create-appointment-modal',
        'doctor-create-report-modal',
        'doctor-create-record-modal',
        'doctor-alerts-modal'
    ].some(function (id) {
        var el = document.getElementById(id);
        return el && el.style.display === 'flex';
    });

    if (!allOpen) {
        if (overlay) overlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function closeAllDoctorModals() {
    [
        'doctor-patient-modal',
        'doctor-appointments-modal',
        'doctor-profile-modal',
        'doctor-assign-patient-modal',
        'doctor-create-appointment-modal',
        'doctor-create-report-modal',
        'doctor-create-record-modal',
        'doctor-alerts-modal'
    ].forEach(closeModal);
}

function setPatientsInRange(patientCount, criticalCount) {
    var el = document.getElementById('patients-in-range');
    if (!el) return;

    var total = Number(patientCount || 0);
    var critical = Number(criticalCount || 0);
    if (total <= 0) {
        el.textContent = '0%';
        return;
    }

    var inRange = Math.max(0, total - critical);
    var pct = Math.round((inRange / total) * 100);
    el.textContent = pct + '%';
}

function setAlertBadge(alerts) {
    var badge = document.getElementById('doctor-alert-badge');
    if (!badge) return;

    var count = Array.isArray(alerts)
        ? alerts.filter(function (a) { return (a.severity || '').toLowerCase() === 'critical'; }).length
        : 0;

    badge.textContent = String(count);
}

async function loadDashboard() {
    var result = await API.get('/api/doctor/dashboard');
    if (!result.ok) return;

    var d = result.data || {};
    doctorState.dashboard = d;

    var patientCountEl = document.getElementById('patient-count');
    var todayCountEl = document.getElementById('today-appointments');
    var criticalCountEl = document.getElementById('critical-alert-count');

    if (patientCountEl) patientCountEl.textContent = Number(d.patientCount || 0);
    if (todayCountEl) todayCountEl.textContent = Array.isArray(d.todayAppointments) ? d.todayAppointments.length : 0;
    if (criticalCountEl) criticalCountEl.textContent = Array.isArray(d.criticalReadings) ? d.criticalReadings.length : 0;

    setPatientsInRange(Number(d.patientCount || 0), Array.isArray(d.criticalReadings) ? d.criticalReadings.length : 0);
    renderUpcomingAppointments(d.upcomingAppointments || []);
}

async function loadAlerts() {
    var result = await API.get('/api/doctor/alerts');
    doctorState.alerts = result.ok && Array.isArray(result.data) ? result.data : [];
    renderCriticalAlerts(doctorState.alerts.slice(0, 8));
    setAlertBadge(doctorState.alerts);
}

async function loadPatients() {
    var assignedOnly = doctorState.patientView.assignedOnly ? 'true' : 'false';
    var result = await API.get('/api/doctor/patients?assignedOnly=' + assignedOnly);
    if (!result.ok) {
        renderPatients([]);
        updatePatientTableInfo(0, 0);
        updatePatientPagination(0, 1);
        return;
    }

    doctorState.patients = Array.isArray(result.data) ? result.data : [];
    doctorState.patientView.page = 1;
    applyPatientDirectoryView();
}

async function loadAssignedPatientsForActions() {
    var result = await API.get('/api/doctor/patients?assignedOnly=true');
    doctorState.assignedPatients = result.ok && Array.isArray(result.data) ? result.data : [];
    populatePatientSelects();
}

function populatePatientSelects() {
    var selectIds = [
        'doctor-create-appt-patient',
        'doctor-report-patient',
        'doctor-record-patient'
    ];

    selectIds.forEach(function (id) {
        var sel = document.getElementById(id);
        if (!sel) return;

        if (!doctorState.assignedPatients.length) {
            sel.innerHTML = '<option value="">No assigned patients</option>';
            return;
        }

        sel.innerHTML = doctorState.assignedPatients.map(function (p) {
            return '<option value="' + Number(p._id) + '">' + escapeHtml(p.fullName || ('Patient #' + p._id)) + ' (ID ' + escapeHtml(String(p._id)) + ')</option>';
        }).join('');
    });
}

function renderPatientSummary(patient) {
    var box = document.getElementById('doctor-patient-summary');
    if (!box) return;
    box.innerHTML = [
        '<strong>' + escapeHtml(patient.fullName || '--') + '</strong>',
        ' - ' + escapeHtml(patient.email || '--'),
        ' - Phone: ' + escapeHtml(patient.phone || '--'),
        ' - Blood Type: ' + escapeHtml(patient.bloodType || '--')
    ].join('');
}

function renderPatientGlucose(glucose) {
    var box = document.getElementById('doctor-patient-glucose');
    if (!box) return;
    if (!Array.isArray(glucose) || glucose.length === 0) {
        box.textContent = 'No glucose readings found.';
        return;
    }

    box.innerHTML = glucose.slice(0, 12).map(function (g) {
        return '<div style="padding:6px 0; border-bottom:1px solid var(--gray-100);">' +
            '<strong>' + Number(g.value).toFixed(0) + ' mg/dL</strong> (' + escapeHtml(g.type || 'reading') + ') - ' + formatDate(g.recordedAt) +
            '</div>';
    }).join('');
}

function renderPatientMetrics(metrics) {
    var box = document.getElementById('doctor-patient-metrics');
    if (!box) return;
    if (!Array.isArray(metrics) || metrics.length === 0) {
        box.textContent = 'No health metrics found.';
        return;
    }

    box.innerHTML = metrics.slice(0, 10).map(function (m) {
        var parts = [];
        if (m.weight !== null && m.weight !== undefined && m.weight !== '') parts.push('Weight: ' + m.weight + ' kg');
        if (m.systolic && m.diastolic) parts.push('BP: ' + m.systolic + '/' + m.diastolic);
        if (m.hba1c !== null && m.hba1c !== undefined && m.hba1c !== '') parts.push('HbA1c: ' + m.hba1c + '%');
        return '<div style="padding:6px 0; border-bottom:1px solid var(--gray-100);">' +
            '<strong>' + formatDate(m.recordedAt) + '</strong> - ' + escapeHtml(parts.join(' | ') || 'No values') +
            '</div>';
    }).join('');
}

function renderPatientReports(reports) {
    var box = document.getElementById('doctor-patient-reports');
    if (!box) return;
    if (!Array.isArray(reports) || reports.length === 0) {
        box.textContent = 'No reports found.';
        return;
    }

    box.innerHTML = reports.slice(0, 12).map(function (r) {
        var insights = parseReportInsights(r);
        var summary = summarizeExtracted(insights);
        return '<div style="padding:6px 0; border-bottom:1px solid var(--gray-100);">' +
            '<strong>' + escapeHtml(r.reportName || 'Report') + '</strong> (' + escapeHtml(r.type || '--') + ') - ' + formatDate(r.date) +
            ' <span style="color:var(--gray-500);">[' + escapeHtml(r.status || 'Pending') + ']</span>' +
            (summary ? '<div style="font-size:12px; color:var(--gray-500); margin-top:4px;">' + escapeHtml(summary) + '</div>' : '') +
            '</div>';
    }).join('');
}

async function openPatientDetails(patientId) {
    var id = Number(patientId);
    var title = document.getElementById('doctor-patient-modal-title');
    if (title) title.textContent = 'Patient Details';
    openModal('doctor-patient-modal');

    try {
        var responses = await Promise.all([
            API.get('/api/doctor/patients/' + id),
            API.get('/api/doctor/patients/' + id + '/glucose?days=30'),
            API.get('/api/doctor/patients/' + id + '/health-metrics'),
            API.get('/api/doctor/patients/' + id + '/reports')
        ]);

        var patientRes = responses[0];
        var glucoseRes = responses[1];
        var metricsRes = responses[2];
        var reportsRes = responses[3];

        if (!patientRes.ok) {
            alert((patientRes.data && patientRes.data.error) || 'Failed to load patient details.');
            closeModal('doctor-patient-modal');
            return;
        }

        if (title) title.textContent = 'Patient Details - ' + (patientRes.data.fullName || 'Patient');
        renderPatientSummary(patientRes.data || {});
        renderPatientGlucose(glucoseRes.ok ? (glucoseRes.data || []) : []);
        renderPatientMetrics(metricsRes.ok ? (metricsRes.data || []) : []);
        renderPatientReports(reportsRes.ok ? (reportsRes.data || []) : []);
    } catch (err) {
        alert('Network error while loading patient details.');
        closeModal('doctor-patient-modal');
    }
}

function renderAppointmentsManager() {
    var box = document.getElementById('doctor-all-appointments');
    if (!box) return;

    if (!Array.isArray(doctorState.appointments) || doctorState.appointments.length === 0) {
        box.innerHTML = '<div style="color:var(--gray-500);">No appointments found.</div>';
        return;
    }

    box.innerHTML = doctorState.appointments.map(function (a) {
        var id = Number(a.id || a._id);
        var patientName = a.patient && a.patient.fullName ? a.patient.fullName : 'Patient';
        return [
            '<div class="card" style="margin:0;">',
            '<div class="card-body" style="padding:14px 16px;">',
            '<div style="display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:10px;">',
            '<div><strong>' + escapeHtml(patientName) + '</strong><div style="font-size:12px; color:var(--gray-500);">' + formatDate(a.date) + ' ' + escapeHtml(a.time || '') + '</div></div>',
            '<div style="font-size:12px; color:var(--gray-500);">ID: ' + id + '</div>',
            '</div>',
            '<div style="display:grid; grid-template-columns: 180px 1fr 140px; gap:10px; align-items:center;">',
            '<select id="appt-status-' + id + '" class="form-input">',
            '<option value="Scheduled" ' + (a.status === 'Scheduled' ? 'selected' : '') + '>Scheduled</option>',
            '<option value="Completed" ' + (a.status === 'Completed' ? 'selected' : '') + '>Completed</option>',
            '<option value="Cancelled" ' + (a.status === 'Cancelled' ? 'selected' : '') + '>Cancelled</option>',
            '</select>',
            '<input id="appt-notes-' + id + '" class="form-input" type="text" placeholder="Clinical notes" value="' + escapeHtml(a.notes || '') + '">',
            '<button class="card-btn card-btn-primary" onclick="saveAppointmentUpdate(' + id + ')">Save</button>',
            '</div>',
            '</div>',
            '</div>'
        ].join('');
    }).join('');
}

async function openAppointmentsManager() {
    openModal('doctor-appointments-modal');
    var res = await API.get('/api/doctor/appointments');
    doctorState.appointments = res.ok && Array.isArray(res.data) ? res.data : [];
    renderAppointmentsManager();
}

async function saveAppointmentUpdate(appointmentId) {
    var id = Number(appointmentId);
    var statusEl = document.getElementById('appt-status-' + id);
    var notesEl = document.getElementById('appt-notes-' + id);
    if (!statusEl || !notesEl) return;

    var res = await API.put('/api/doctor/appointments/' + id, {
        status: statusEl.value,
        notes: notesEl.value || null
    });

    if (!res.ok) {
        alert((res.data && res.data.error) || 'Failed to update appointment.');
        return;
    }

    await refreshDoctorDashboard();
    await openAppointmentsManager();
}

async function openDoctorProfileModal() {
    openModal('doctor-profile-modal');
    var res = await API.get('/api/doctor/profile');
    if (!res.ok) return;

    doctorState.doctorProfile = res.data;
    var p = res.data || {};
    var name = document.getElementById('doctor-profile-name');
    var phone = document.getElementById('doctor-profile-phone');
    var specialization = document.getElementById('doctor-profile-specialization');
    var clinic = document.getElementById('doctor-profile-clinic');
    if (name) name.value = p.fullName || '';
    if (phone) phone.value = p.phone || '';
    if (specialization) specialization.value = p.specialization || '';
    if (clinic) clinic.value = p.clinicName || '';
}

async function saveDoctorProfile() {
    var payload = {
        fullName: (document.getElementById('doctor-profile-name').value || '').trim(),
        phone: (document.getElementById('doctor-profile-phone').value || '').trim(),
        specialization: (document.getElementById('doctor-profile-specialization').value || '').trim(),
        clinicName: (document.getElementById('doctor-profile-clinic').value || '').trim()
    };

    if (!payload.fullName) {
        alert('Full name is required.');
        return;
    }

    var res = await API.put('/api/doctor/profile', payload);
    if (!res.ok) {
        alert((res.data && res.data.error) || 'Failed to update profile.');
        return;
    }

    localStorage.setItem('user', JSON.stringify(res.data));
    setDoctorHeader(res.data);
    alert('Profile updated successfully.');
    closeModal('doctor-profile-modal');
}

function openAssignPatientModal() {
    openModal('doctor-assign-patient-modal');
}

async function submitDoctorAssignPatient() {
    var input = document.getElementById('doctor-assign-patient-id');
    if (!input) return;

    var patientId = Number(input.value);
    if (!Number.isInteger(patientId) || patientId <= 0) {
        alert('Enter a valid patient ID.');
        return;
    }

    var res = await API.post('/api/doctor/patients/assign', { patientId: patientId });
    if (!res.ok) {
        alert((res.data && res.data.error) || 'Failed to assign patient.');
        return;
    }

    input.value = '';
    closeModal('doctor-assign-patient-modal');
    await refreshDoctorDashboard();
    alert('Patient assigned successfully.');
}

function openCreateAppointmentModal() {
    populatePatientSelects();
    var dateInput = document.getElementById('doctor-create-appt-date');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().slice(0, 10);
    }
    openModal('doctor-create-appointment-modal');
}

async function submitDoctorCreateAppointment() {
    var patient = Number((document.getElementById('doctor-create-appt-patient').value || '0'));
    var date = (document.getElementById('doctor-create-appt-date').value || '').trim();
    var time = (document.getElementById('doctor-create-appt-time').value || '').trim();
    var reason = (document.getElementById('doctor-create-appt-reason').value || '').trim();

    if (!patient || !date || !time) {
        alert('Patient, date and time are required.');
        return;
    }

    var payload = {
        patient: patient,
        date: new Date(date + 'T00:00:00').toISOString(),
        time: time,
        reason: reason
    };

    var res = await API.post('/api/doctor/appointments', payload);
    if (!res.ok) {
        alert((res.data && res.data.error) || 'Failed to schedule appointment.');
        return;
    }

    closeModal('doctor-create-appointment-modal');
    await refreshDoctorDashboard();
    await openAppointmentsManager();
}

function openCreateReportModal() {
    populatePatientSelects();
    var dateInput = document.getElementById('doctor-report-date');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().slice(0, 10);
    }
    openModal('doctor-create-report-modal');
}

async function submitDoctorCreateReport() {
    var payload = {
        patient: Number((document.getElementById('doctor-report-patient').value || '0')),
        reportName: (document.getElementById('doctor-report-name').value || '').trim(),
        type: (document.getElementById('doctor-report-type').value || '').trim(),
        date: (document.getElementById('doctor-report-date').value || '').trim(),
        status: (document.getElementById('doctor-report-status').value || 'Pending').trim()
    };

    if (!payload.patient || !payload.reportName || !payload.type || !payload.date) {
        alert('Patient, report name, type and date are required.');
        return;
    }

    var res = await API.post('/api/doctor/reports', payload);
    if (!res.ok) {
        alert((res.data && res.data.error) || 'Failed to add report.');
        return;
    }

    closeModal('doctor-create-report-modal');
    await refreshDoctorDashboard();
    alert('Report added successfully.');
}

function openCreateRecordModal() {
    populatePatientSelects();
    var dateInput = document.getElementById('doctor-record-date');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().slice(0, 10);
    }
    openModal('doctor-create-record-modal');
}

async function submitDoctorCreateRecord() {
    var payload = {
        patient: Number((document.getElementById('doctor-record-patient').value || '0')),
        title: (document.getElementById('doctor-record-title').value || '').trim(),
        type: (document.getElementById('doctor-record-type').value || '').trim(),
        date: (document.getElementById('doctor-record-date').value || '').trim(),
        facility: (document.getElementById('doctor-record-facility').value || '').trim(),
        description: (document.getElementById('doctor-record-description').value || '').trim()
    };

    if (!payload.patient || !payload.title || !payload.type || !payload.date) {
        alert('Patient, title, type and date are required.');
        return;
    }

    var res = await API.post('/api/doctor/records', payload);
    if (!res.ok) {
        alert((res.data && res.data.error) || 'Failed to add medical record.');
        return;
    }

    closeModal('doctor-create-record-modal');
    await refreshDoctorDashboard();
    alert('Medical record added successfully.');
}

async function openAlertsModal() {
    await loadAlerts();
    renderAlertsModal();
    openModal('doctor-alerts-modal');
}

async function refreshDoctorDashboard() {
    await Promise.all([
        loadDashboard(),
        loadPatients(),
        loadAssignedPatientsForActions(),
        loadAlerts()
    ]);
}

function bindActions() {
    var settingsBtn = document.getElementById('doctor-settings-btn');
    var navPatientsBtn = document.getElementById('doctor-nav-patients');
    var navAppointmentsBtn = document.getElementById('doctor-nav-appointments');
    var navReportsBtn = document.getElementById('doctor-nav-reports');
    var navAlertsBtn = document.getElementById('doctor-nav-alerts');
    var navMessagesBtn = document.getElementById('doctor-nav-messages');
    var editProfileBtn = document.getElementById('doctor-open-profile-btn');
    var viewAppointmentsBtn = document.getElementById('doctor-view-appointments-btn');
    var quickAddPatientBtn = document.getElementById('doctor-quick-add-patient-btn');
    var quickPrescribeBtn = document.getElementById('doctor-quick-prescribe-btn');
    var quickReportsBtn = document.getElementById('doctor-quick-reports-btn');
    var quickScheduleBtn = document.getElementById('doctor-quick-schedule-btn');
    var filterBtn = document.getElementById('doctor-patient-filter-btn');
    var assignedToggle = document.getElementById('doctor-assigned-toggle');
    var patientSort = document.getElementById('doctor-patient-sort');
    var pagePrev = document.getElementById('doctor-page-prev');
    var pageNext = document.getElementById('doctor-page-next');
    var viewAlertsBtn = document.getElementById('doctor-view-alerts-btn');
    var notificationBtn = document.getElementById('doctor-notification-btn');
    var logoutLink = document.getElementById('doctor-logout-link');
    var overlay = document.getElementById('doctorModalOverlay');

    if (settingsBtn) settingsBtn.addEventListener('click', openDoctorProfileModal);
    if (navPatientsBtn) navPatientsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo({ top: 300, behavior: 'smooth' });
    });
    if (navAppointmentsBtn) navAppointmentsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openAppointmentsManager();
    });
    if (navReportsBtn) navReportsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openCreateReportModal();
    });
    if (navAlertsBtn) navAlertsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openAlertsModal();
    });
    if (navMessagesBtn) navMessagesBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openDoctorChatPanel();
    });

    if (editProfileBtn) editProfileBtn.addEventListener('click', openDoctorProfileModal);
    if (viewAppointmentsBtn) viewAppointmentsBtn.addEventListener('click', openAppointmentsManager);
    if (quickAddPatientBtn) quickAddPatientBtn.addEventListener('click', openAssignPatientModal);
    if (quickPrescribeBtn) quickPrescribeBtn.addEventListener('click', openCreateRecordModal);
    if (quickReportsBtn) quickReportsBtn.addEventListener('click', openCreateReportModal);
    if (quickScheduleBtn) quickScheduleBtn.addEventListener('click', openCreateAppointmentModal);

    if (assignedToggle) {
        assignedToggle.addEventListener('change', function () {
            doctorState.patientView.assignedOnly = this.value !== 'all';
            doctorState.patientView.page = 1;
            loadPatients();
        });
    }

    if (patientSort) {
        patientSort.addEventListener('change', function () {
            doctorState.patientView.sortBy = this.value || 'nameAsc';
            doctorState.patientView.page = 1;
            applyPatientDirectoryView();
        });
    }

    if (filterBtn) {
        filterBtn.addEventListener('click', function () {
            var input = document.getElementById('doctor-patient-search');
            applyLocalSearch(input ? input.value : '');
        });
    }

    if (pagePrev) {
        pagePrev.addEventListener('click', function () {
            doctorState.patientView.page -= 1;
            applyPatientDirectoryView();
        });
    }

    if (pageNext) {
        pageNext.addEventListener('click', function () {
            doctorState.patientView.page += 1;
            applyPatientDirectoryView();
        });
    }

    if (viewAlertsBtn) viewAlertsBtn.addEventListener('click', openAlertsModal);
    if (notificationBtn) notificationBtn.addEventListener('click', openAlertsModal);
    if (logoutLink) {
        logoutLink.addEventListener('click', function (e) {
            e.preventDefault();
            API.logout();
        });
    }

    if (overlay) {
        overlay.addEventListener('click', function () {
            closeAllDoctorModals();
        });
    }

    // Doctor chat bindings
    var dcpReplyInput = document.getElementById('dcp-reply-input');
    if (dcpReplyInput) {
        dcpReplyInput.addEventListener('keydown', function (e) {
            if (e.isComposing) return;
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                doctorSendReply();
            }
        });
    }
    var dcpSearchInput = document.getElementById('dcp-thread-search');
    if (dcpSearchInput) {
        dcpSearchInput.addEventListener('input', function () {
            renderDoctorChatThreads();
        });
    }
}

function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
}

function closeSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
}

function viewPatient(patientId) {
    return openPatientDetails(Number(patientId));
}

// ─── Doctor Chat Functions ──────────────────────────────────────────

function openDoctorChatPanel() {
    var panel = document.getElementById('doctor-chat-panel');
    if (panel) panel.classList.add('open');
    loadDoctorChatThreads();
}

function closeDoctorChatPanel() {
    var panel = document.getElementById('doctor-chat-panel');
    if (panel) panel.classList.remove('open');
}

function dcpMsgTime(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dcpMsgStatusIcon(msg) {
    // Only show status on messages sent by the current user (doctor)
    if (msg.sender_role !== 'doctor') return '';
    if (msg.read_at) {
        return '<span class="msg-status read" title="Read">&#10003;&#10003;</span>';
    }
    if (msg.delivered_at) {
        return '<span class="msg-status delivered" title="Delivered">&#10003;&#10003;</span>';
    }
    return '<span class="msg-status sent" title="Sent">&#10003;</span>';
}

function dcpMsgDateLabel(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function dcpShortTime(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

async function loadDoctorChatThreads() {
    var result = await API.get('/api/doctor/messages/threads');
    doctorState.chatThreads = result.ok && Array.isArray(result.data) ? result.data : [];
    renderDoctorChatThreads();
    updateDoctorMsgBadge();
}

function renderDoctorChatThreads() {
    var container = document.getElementById('dcp-thread-list');
    if (!container) return;

    var searchVal = '';
    var searchEl = document.getElementById('dcp-thread-search');
    if (searchEl) searchVal = (searchEl.value || '').trim().toLowerCase();

    var threads = doctorState.chatThreads;
    if (searchVal) {
        threads = threads.filter(function(t) {
            return (t.patientName || '').toLowerCase().indexOf(searchVal) >= 0 ||
                   (t.subject || '').toLowerCase().indexOf(searchVal) >= 0 ||
                   (t.lastMessageBody || '').toLowerCase().indexOf(searchVal) >= 0;
        });
    }

    if (threads.length === 0) {
        container.innerHTML = '<div class="dcp-empty">No conversations yet</div>';
        return;
    }

    container.innerHTML = threads.map(function(t) {
        var tid = Number(t.id || t._id);
        var isActive = tid === doctorState.chatSelectedThreadId;
        var snippet = t.lastMessageBody || t.subject || 'Tap to start chatting';
        if (t.lastMessageBody && t.lastMessageSenderRole === 'doctor') {
            snippet = 'You: ' + snippet;
        }
        return [
            '<div class="dcp-thread-item' + (isActive ? ' active' : '') + '" onclick="openDoctorThread(' + tid + ')" data-thread-id="' + tid + '">',
            '  <div class="dcp-thread-avatar">' + escapeHtml(initials(t.patientName)) + '</div>',
            '  <div class="dcp-thread-info">',
            '    <div class="dcp-thread-name">' + escapeHtml(t.patientName || 'Patient') + '</div>',
            '    <div class="dcp-thread-snippet">' + escapeHtml(snippet) + '</div>',
            '  </div>',
            '  <div style="text-align:right; flex-shrink:0;">',
            '    <div class="dcp-thread-time">' + escapeHtml(dcpShortTime(t.last_message_at)) + '</div>',
            (t.unreadCount > 0 ? '<div class="dcp-unread-dot">' + t.unreadCount + '</div>' : ''),
            '  </div>',
            '</div>',
        ].join('');
    }).join('');
}

async function openDoctorThread(threadId) {
    threadId = Number(threadId);
    doctorState.chatSelectedThreadId = threadId;

    var thread = doctorState.chatThreads.find(function(t) { return Number(t.id || t._id) === threadId; });
    var nameEl = document.getElementById('dcp-chat-name');
    var statusEl = document.getElementById('dcp-chat-status');
    var avatarEl = document.getElementById('dcp-chat-avatar');
    if (nameEl) nameEl.textContent = thread ? (thread.patientName || 'Patient') : 'Patient';
    if (statusEl) statusEl.textContent = thread ? (thread.subject || 'Chat') : '';
    if (avatarEl) avatarEl.textContent = thread ? initials(thread.patientName) : 'PT';

    renderDoctorChatThreads();

    var result = await API.get('/api/doctor/messages/threads/' + threadId);
    if (!result.ok) {
        alert('Failed to load messages.');
        return;
    }

    var container = document.getElementById('dcp-messages');
    if (!container) return;

    var messages = result.data.messages || [];
    if (messages.length === 0) {
        container.innerHTML = '<div class="dcp-empty">No messages yet</div>';
        return;
    }

    var html = '';
    var lastDate = '';
    messages.forEach(function(msg) {
        var ts = msg.sent_at || msg.createdAt;
        var dateLabel = dcpMsgDateLabel(ts);
        if (dateLabel && dateLabel !== lastDate) {
            html += '<div class="dcp-msg-date-divider">' + escapeHtml(dateLabel) + '</div>';
            lastDate = dateLabel;
        }
        var cls = msg.sender_role === 'doctor' ? 'doctor' : 'patient';
        var statusHtml = msg.sender_role === 'doctor' ? ' ' + dcpMsgStatusIcon(msg) : '';
        html += '<div class="dcp-msg ' + cls + '" data-msg-id="' + (msg.id || '') + '"><div>' + escapeHtml(msg.body || '') + '</div><div class="dcp-msg-time">' + dcpMsgTime(ts) + statusHtml + '</div></div>';
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;

    // Mark thread as read in the local list
    if (thread) thread.unreadCount = 0;
    updateDoctorMsgBadge();
    renderDoctorChatThreads();
}

async function doctorSendReply() {
    if (!doctorState.chatSelectedThreadId) {
        alert('Select a conversation first.');
        return;
    }

    var inputEl = document.getElementById('dcp-reply-input');
    var body = (inputEl.value || '').trim();
    if (!body) return;

    var result = await API.post('/api/doctor/messages/threads/' + doctorState.chatSelectedThreadId, { body: body });
    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to send message.');
        return;
    }

    inputEl.value = '';

    // Append message to UI immediately
    var container = document.getElementById('dcp-messages');
    if (container && result.data) {
        var emptyEl = container.querySelector('.dcp-empty');
        if (emptyEl) emptyEl.remove();

        var msgDiv = document.createElement('div');
        msgDiv.className = 'dcp-msg doctor';
        msgDiv.setAttribute('data-msg-id', result.data.id || '');
        var sentIcon = '<span class="msg-status sent" title="Sent">&#10003;</span>';
        msgDiv.innerHTML = '<div>' + escapeHtml(result.data.body || body) + '</div><div class="dcp-msg-time">' + dcpMsgTime(result.data.sent_at || new Date().toISOString()) + ' ' + sentIcon + '</div>';
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    }

    await loadDoctorChatThreads();
}

function updateDoctorMsgBadge() {
    var total = 0;
    doctorState.chatThreads.forEach(function(t) { total += (t.unreadCount || 0); });
    var badge = document.getElementById('doctor-msg-badge');
    var totalEl = document.getElementById('dcp-unread-total');
    if (badge) {
        badge.textContent = total;
        badge.style.display = total > 0 ? 'inline-flex' : 'none';
    }
    if (totalEl) {
        totalEl.textContent = total + ' unread';
    }
    // Also update the notification dot
    var notifDot = document.querySelector('.topbar-btn .dot');
    if (notifDot) {
        notifDot.style.display = total > 0 ? 'block' : 'none';
    }
}

function initDoctorChatSocket() {
    if (typeof io === 'undefined') return;
    var token = localStorage.getItem('token');
    if (!token) return;

    doctorState.chatSocket = io({ auth: { token: token } });

    doctorState.chatSocket.on('connect', function() {
        console.log('Doctor chat socket connected');
    });

    doctorState.chatSocket.on('new_message', function(data) {
        if (data && data.message) {
            // Acknowledge delivery to the sender (patient)
            doctorState.chatSocket.emit('message_delivered', {
                messageIds: [data.message.id],
                senderId: data.message.sender_id,
                threadId: data.threadId
            });

            // If we're in the active thread, append the message and mark as read
            if (data.threadId === doctorState.chatSelectedThreadId) {
                var container = document.getElementById('dcp-messages');
                if (container) {
                    var emptyEl = container.querySelector('.dcp-empty');
                    if (emptyEl) emptyEl.remove();
                    var msgDiv = document.createElement('div');
                    msgDiv.className = 'dcp-msg patient';
                    msgDiv.setAttribute('data-msg-id', data.message.id || '');
                    msgDiv.innerHTML = '<div>' + escapeHtml(data.message.body || '') + '</div><div class="dcp-msg-time">' + dcpMsgTime(data.message.sent_at || new Date().toISOString()) + '</div>';
                    container.appendChild(msgDiv);
                    container.scrollTop = container.scrollHeight;
                }
                // Since we're actively viewing this thread, mark as read
                doctorState.chatSocket.emit('messages_read', {
                    messageIds: [data.message.id],
                    senderId: data.message.sender_id,
                    threadId: data.threadId
                });
            }
            // Refresh threads to update unread counts
            loadDoctorChatThreads();
        }
    });

    // Our sent messages were delivered to the patient's device
    doctorState.chatSocket.on('messages_delivered', function(data) {
        if (!data || !Array.isArray(data.messageIds)) return;
        data.messageIds.forEach(function(id) {
            var el = document.querySelector('.dcp-msg[data-msg-id="' + id + '"] .msg-status');
            if (el) {
                el.className = 'msg-status delivered';
                el.title = 'Delivered';
                el.innerHTML = '&#10003;&#10003;';
            }
        });
    });

    // Our sent messages were read by the patient
    doctorState.chatSocket.on('messages_read_ack', function(data) {
        if (!data || !Array.isArray(data.messageIds)) return;
        data.messageIds.forEach(function(id) {
            var el = document.querySelector('.dcp-msg[data-msg-id="' + id + '"] .msg-status');
            if (el) {
                el.className = 'msg-status read';
                el.title = 'Read';
                el.innerHTML = '&#10003;&#10003;';
            }
        });
    });

    doctorState.chatSocket.on('disconnect', function() {
        console.log('Doctor chat socket disconnected');
    });
}

(async function bootstrapDoctorDashboard() {
    if (typeof API === 'undefined') return;
    var authorized = await verifyAuthRole('doctor');
    if (!authorized) return;

    var user = API.getUser() || {};
    setDoctorHeader(user);
    bindSearch();
    bindActions();
    initDoctorChatSocket();

    refreshDoctorDashboard().catch(function () {
        console.error('Failed to load doctor dashboard data.');
    });

    // Load initial unread count for badge
    loadDoctorChatThreads().catch(function () {});
})();

window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.viewPatient = viewPatient;
window.openAppointmentsManager = openAppointmentsManager;
window.saveAppointmentUpdate = saveAppointmentUpdate;
window.closeDoctorPatientModal = function () { closeModal('doctor-patient-modal'); };
window.closeDoctorAppointmentsModal = function () { closeModal('doctor-appointments-modal'); };
window.closeDoctorProfileModal = function () { closeModal('doctor-profile-modal'); };
window.closeDoctorAssignPatientModal = function () { closeModal('doctor-assign-patient-modal'); };
window.closeDoctorCreateAppointmentModal = function () { closeModal('doctor-create-appointment-modal'); };
window.closeDoctorCreateReportModal = function () { closeModal('doctor-create-report-modal'); };
window.closeDoctorCreateRecordModal = function () { closeModal('doctor-create-record-modal'); };
window.closeDoctorAlertsModal = function () { closeModal('doctor-alerts-modal'); };
window.saveDoctorProfile = saveDoctorProfile;
window.submitDoctorAssignPatient = submitDoctorAssignPatient;
window.submitDoctorCreateAppointment = submitDoctorCreateAppointment;
window.submitDoctorCreateReport = submitDoctorCreateReport;
window.submitDoctorCreateRecord = submitDoctorCreateRecord;
window.openDoctorChatPanel = openDoctorChatPanel;
window.closeDoctorChatPanel = closeDoctorChatPanel;
window.openDoctorThread = openDoctorThread;
window.doctorSendReply = doctorSendReply;
